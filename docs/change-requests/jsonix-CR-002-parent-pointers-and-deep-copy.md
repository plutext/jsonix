# jsonix-CR-002: Parent pointers and deep copy for unmarshalled objects

**Status:** Implemented (2026-09-07), version 3.2.0; proposed from the compiler repository, revised after review
against the runtime (see "Revision notes"), then implemented as revised (see "Implementation notes")
**Depends on:** jsonix-CR-001 (3.1.0 typings and ES-module entry point)
**Companion:** `jsonix-schema-compiler` CR-006, whose compiler half is implemented in commit `0b6a0d9` on branch
`cr-006-parent-pointers` (generated declarations carry `readonly PARENT?: <union of containers>`; its
`tests/typescript` smoke exercises `parentPointers` and `deepCopy` as soon as this runtime provides them)
**Repository:** `@mitre/jsonix` runtime (this repository)

## Summary

docx4j generates its Java model with `-Xparent-pointer` (every object knows its container,
`getParent()`) and `-Xdocx4j-copy` (a deep `copy()` that re-links parents). Code written against
that model navigates upwards and clones subtrees all the time. The objects this runtime produces
have neither facility. This CR adds both, opt-in, without changing the shape of the objects for
anyone who does not ask for it:

1. a context option `parentPointers` that makes the unmarshaller set a **non-enumerable** `PARENT`
   property on every **typed** object it creates (objects produced by a class info);
2. `Jsonix.Util.deepCopy(value, parent?)` that copies a value structurally and re-links `PARENT`
   by reproducing the original's parent topology;
3. typings and tests for both.

The compiler's CR-006 types `PARENT` in generated declarations as the union of the types that
can contain each type.

## Semantics (mirroring docx4j)

- `PARENT` is set on objects produced by `Jsonix.Model.ClassInfo.unmarshal` (plain objects with
  `TYPE_NAME`, or `instanceFactory` instances) and on nothing else: not on `{ name, value }`
  element wrappers, not on the `{ localName: value }` objects of the simplified mapping style, not
  on element-map or any-attribute maps, DOM nodes, calendars, QNames or durations. This is what
  docx4j does (only generated beans implement `Child`) and what the compiler declares (`PARENT`
  appears only on class-info interfaces).
- `PARENT` is the **containing typed object**: the nearest enclosing object that was itself
  produced by a class info, never the `{ name, value }` wrapper, matching JAXB's
  `afterUnmarshal(Unmarshaller, Object parent)`, which receives the bean. Items of a collection
  property point at the owner of the collection. A root object (the `value` of what `unmarshal*`
  returns) has no `PARENT`.
- `PARENT` is defined with `Object.defineProperty(value, 'PARENT', { value: parent, enumerable: false,
  writable: true, configurable: true })`, so `for...in`, `Object.keys`, `JSON.stringify`,
  `structuredClone`, lodash `cloneDeep`, `util.inspect`, `Jsonix.Util.Type.isEqual` and the
  marshaller never see it and the resulting cycle never reaches a serialiser. Only walkers that use
  `Object.getOwnPropertyNames` see it. `Object.defineProperty` needs ES5 (IE9+), which the runtime
  already assumes elsewhere.
- `deepCopy(value, parent?)`:
  - strings, numbers, booleans and enum literals are shared; `Jsonix.XML.QName` and
    `Jsonix.XML.Calendar` are cloned (`clone()` exists on QName; add one to Calendar); durations,
    element wrappers, maps and every other plain object are copied recursively, own enumerable
    properties only, so `TYPE_NAME` is preserved; DOM nodes use `cloneNode(true)`; arrays
    element-wise. **No object is recognised by its shape**: an element wrapper is just a plain
    object whose `name` happens to be a QName, and is copied as such.
  - `PARENT` is re-linked by **topology, not structure**: the copy keeps a map from each original
    object to its copy while traversing; afterwards, for every original that has an own `PARENT`,
    the copy's `PARENT` is set to the copy of that parent. This reproduces exactly what the
    unmarshaller built, whatever the mapping style, and needs neither the mapping nor wrapper
    detection. The copied root's `PARENT` is the `parent` argument if given, otherwise **unset**,
    as docx4j's `copy()` leaves it (a copy is in no tree until someone inserts it; pointing it at
    the original's parent would be a lie and would keep the original tree alive through the copy).
    `deepCopy(x, owner)` corresponds to docx4j's `CopyUtils.copyObjectAndSetParent`.
  - An object referenced twice in the source is copied once and referenced twice in the copy (the
    same map makes this free). A hand-built tree without pointers copies to a tree without
    pointers.
  - `deepCopy` does not need a context or mapping. A mapping-aware variant is not needed.
- `Jsonix.Util.setParent(value, parent)` performs the `defineProperty` above (no-op for
  non-objects), for code that builds trees by hand.

## Proposed changes

### `jsonix.js` (and the same edits in `scripts/src/main/javascript/org/hisrc/jsonix/Jsonix/*.js` and `dist/`, per `CLAUDE.md`)

- `Jsonix.Context` constructor: read `options.parentPointers` (boolean, default `false`) into
  `this.parentPointers`.
- `Jsonix.Model.ClassInfo.unmarshal(context, input, scope)`: this is the single place where typed
  objects are created (`result = new this.instanceFactory()` or `{ TYPE_NAME: this.name }`), and
  it is re-entered recursively for nested typed objects, so the container of a new result is the
  result of the `ClassInfo.unmarshal` call one level up. Keep a stack on the per-run
  `Jsonix.XML.Input`: when `context.parentPointers` is on, after creating `result` call
  `Jsonix.Util.setParent(result, input.parentStack[top])` if the stack is non-empty, push `result`,
  unmarshal the properties, pop (in a `finally`-style order so an exception leaves no stale
  entry). Nothing else changes: `setProperty`, the element-ref wrappers, the simplified style,
  element maps, `xsi:type` dispatch, substitution groups, any-element typed content and
  `instanceFactory` all work unchanged because they all end up in `ClassInfo.unmarshal`.
- `Jsonix.Util.setParent(value, parent)`: the `defineProperty` above.
- `Jsonix.Util.deepCopy(value, parent)`: as specified. Use `Map` when available and an array of
  `[original, copy]` pairs otherwise (the bundle is ES5 in style).
- `Jsonix.XML.Calendar.prototype.clone`.

No mapping format change; the compiler's mappings are unaffected.

### `types/main.d.ts`

```ts
export interface ContextOptions { parentPointers?: boolean; /* existing members unchanged */ }
/** Convenience for hand-written types; generated declarations inline the union. */
export interface Parented<P = unknown> { readonly PARENT?: P; }
export namespace Util {
  function deepCopy<T>(value: T, parent?: unknown): T;
  function setParent(value: object, parent: unknown): void;
}
```

Generated declarations (compiler CR-006) declare `readonly PARENT?: <union of container types>`
per interface, which is structurally compatible with `Parented`. The runtime typings do not
declare `PARENT` on `TypedNamedValue` or anywhere else.

### Tests

- `tests/typescript/typescript.js` (nodeunit) with `parentPointers: true` on the purchase order
  fixture, for both mapping styles (`standard` and `simplified`): `po.shipTo.PARENT === po`,
  `po.items.PARENT === po`, `po.items.item[0].PARENT === po.items`, the root has no own `PARENT`
  property, no wrapper or map object has one; `Object.keys(po)` and `JSON.stringify(po)` are
  identical to the unparented result; marshalling the parented tree yields the same XML.
- `deepCopy(po)`: `isEqual(copy, po)`, `copy !== po`, `copy.shipTo.PARENT === copy`,
  `copy.items.item[0].PARENT === copy.items`, `copy` has no own `PARENT`; `deepCopy(po.shipTo, po)`
  returns an address whose `PARENT` is `po`; a calendar in the copy is a distinct object with equal
  fields; a QName in a wrapper is a distinct object; a type with properties named `name` and
  `value` copies as a typed object (regression for the dropped shape heuristic); a hand-built
  tree without pointers copies without pointers.
- `usage.ts`: `po.shipTo.PARENT` is `PurchaseOrderType | undefined` from the regenerated
  declarations, `@ts-expect-error` on assigning to it and on reading `PARENT` of the root type,
  and `Jsonix.Util.deepCopy(po)` is typed as `PurchaseOrderType`.
- `tests/typescript/PurchaseOrder.d.ts` regenerated from compiler commit `0b6a0d9` (done 2026-09-07,
  ahead of the runtime work: `Items`, `USAddress` and `Items.Item` carry `readonly PARENT?`,
  `PurchaseOrderType` does not; the members are optional and read-only, so the existing checks
  compile unchanged) and recorded in `tests/typescript/README.md`.

## Verification

| Check | Expected |
|-------|----------|
| `npm test` with and without `parentPointers`, both mapping styles | identical XML and `isEqual` results; pointers only when enabled, only on typed objects |
| `npm run typecheck` | green, including `@ts-expect-error` on assigning to `PARENT` and on the root type's `PARENT` |
| `npm run test:esm` and the compiler's `tests/typescript` smoke against this runtime | green, with the smoke's runtime checks no longer skipped |
| Existing consumers | unchanged (default off; non-enumerable property when on) |

## Risks

- Cycles: a consumer that walks objects with `Object.getOwnPropertyNames` (not `for...in`,
  `Object.keys`, JSON, `structuredClone`, lodash) would loop. Document it.
- Memory: one extra reference per typed object, negligible in size; but a pointer keeps the
  container reachable from any child, so holding one paragraph holds its document. docx4j has the
  same property. Copies made without a `parent` argument do not pin anything.
- Name clash with a schema property called `PARENT`: the compiler reports it (CR-006).
- The unmarshal stack lives on `Jsonix.XML.Input`, which is created per `unmarshalDocument` call,
  so concurrent or re-entrant unmarshalling cannot interfere.

## Effort

About one day including tests and documentation, less than the first draft: the stack replaces
the value-shape walk, and the topology map replaces wrapper detection. Version 3.2.0.

## Revision notes (2026-09-07, review against the runtime)

Checked before revising: `Jsonix.Util.Type.isEqual` compares own enumerable keys only
(`Object.keys` / `for...in` with `hasOwnProperty`), the marshaller reads properties through the
class structure and iterates only any-attribute maps with `for...in`, `Jsonix.XML.QName` has
`clone()` and `Jsonix.XML.Calendar` does not, and `PropertyInfo.setProperty` is indeed the writer
for class properties (with an override in `ElementMapPropertyInfo`). Four things in the first draft
did not survive that check:

1. **Hook moved from "after `setProperty`" to `ClassInfo.unmarshal`.** The draft found objects to
   parent by the shape of the assigned value (the value, its `.value`, array items and their
   `.value`). That assumes the standard mapping style: under `mappingStyle: 'simplified'` an
   element ref is unmarshalled as `{ localName: value }` (`AsSimplifiedElementRef`), so the
   intermediate object would have received the pointer and the typed object would not; element-map
   values were missed; any-attribute maps and DOM nodes would have been parented. A stack of
   results on the input covers every path in fewer lines.
2. **`deepCopy` no longer detects wrappers by shape.** Without the mapping a `{ name, value }`
   wrapper cannot be told from a typed object with properties named `name` and `value`, both
   common. Copy everything structurally; re-link `PARENT` from a map of original to copy.
3. **A copy's own `PARENT` is unset by default**, as in docx4j's `copy()`. The draft defaulted it
   to the original's parent while citing docx4j as leaving it unset. The compiler's CR-006 and its
   `tests/typescript` smoke carry the same wording and need the same correction.
4. **`PARENT` only on typed objects** (class-info products), not on "every object", matching docx4j
   and the compiler's declarations.

Also added: the three-copies rule from `CLAUDE.md`, the fixture regeneration from `0b6a0d9`, the
memory note, and the narrower cycle risk.

## Implementation notes (2026-09-07)

Implemented as revised, in all three copies of the library (`nodejs/scripts/jsonix.js`,
`dist/Jsonix-all.js`, and the modular `Util.js`, `Model/ClassInfo.js`, `Context.js`,
`XML/Calendar.js`), preserving each file's line endings (the bundles are CRLF, the modular sources LF).
`dist/Jsonix-min.js` was not regenerated; it is stale for this feature, as `CLAUDE.md` now records.

- `ClassInfo.unmarshal`: nine lines after the result is created (read the top of `input.parentStack`,
  define `PARENT`, push) and three before `return result` (pop). No `try/finally`: an exception
  discards the `Input` and the unmarshal call with it, so a stale entry cannot be observed.
- `Context`: `parentPointers` field and option, next to `supportXsiType`.
- `Jsonix.Util.setParent`, `Jsonix.Util.deepCopy`: as specified. `deepCopy` uses `Map` when present
  and parallel arrays otherwise; copies plain objects with `Object.create(Object.getPrototypeOf(x))`
  so `instanceFactory` instances keep their prototype; QNames, calendars, `Date`s and DOM nodes are
  cloned; everything else is recursed over own enumerable properties. `PARENT` never travels as an
  ordinary property because it is non-enumerable; it is re-linked afterwards from the original-to-copy
  map, skipping the root, whose `PARENT` comes only from the `parent` argument.
- `Jsonix.XML.Calendar.prototype.clone`: rebuilds through the constructor from the numeric fields
  (NaN fields omitted, since the constructor validates what it is given), so the derived `date` is
  recomputed.
- Typings: `ContextOptions.parentPointers`, `Jsonix.Parented<P>`, `Jsonix.Util.deepCopy` and
  `Jsonix.Util.setParent` (the first members of a `Jsonix.Util` namespace in the typings).
- Tests (`tests/typescript/typescript.js`): pointers off by default; standard style (pointers on
  typed objects only, none on the root, the wrapper, arrays or calendars; `Object.keys`, JSON,
  `isEqual` and the marshalled XML identical to the unparented result; descriptor non-enumerable and
  writable); simplified style (pointer lands on the typed object, not on the `{ localName: value }`
  object); `deepCopy` of a tree, with a parent, of a wrapper, of a typed object with properties named
  `name` and `value`, of a hand-built tree with shared references, durations, calendars and
  primitives, and of a DOM node; `Calendar.clone`. `usage.ts` checks the typings and the
  declaration-level `PARENT` (from compiler `0b6a0d9`); `esm-smoke.mjs` runs the same runtime checks
  as the compiler's smoke test.

Verification:

| Check | Result |
|-------|--------|
| `npx nodeunit tests/typescript/typescript.js` | green, 98 assertions |
| existing suites (`util`, `xml`, `schema`, `xsd`, `issues`, `sax`, `nodejs`) | green, 1265 assertions (the `Request` suite needs port 8080, in use on this machine) |
| `npm run typecheck` (bundler and node16) | green |
| `npm run test:esm` | green, including the parent pointer and `deepCopy` checks |
| `dist/Jsonix-all.js` | loads and exposes `Jsonix.Util.deepCopy` (checked in a `vm` context) |
