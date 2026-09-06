# jsonix-CR-001: Support TypeScript consumers of compiler-generated declarations and ES-module mappings

**Status:** Proposed (2026-09-06)
**Depends on:** `jsonix-schema-compiler` CR-005 (TypeScript output, implemented 2026-09-06, commit `0b2c8a8`),
which in turn builds on its CR-003 (deterministic output) and CR-004 (Jakarta XML Binding 4)
**Repository:** `@mitre/jsonix` runtime (this repository); the compiler lives in the sibling
`jsonix-schema-compiler` repository

## Summary

The schema compiler now emits, next to each mapping, a TypeScript declaration file describing the
objects Jsonix unmarshals and marshals (`<Module>.d.ts`), and can emit the mapping itself as an ES
module (`<Module>.mjs`) instead of the UMD wrapper. Those files were designed to be independent of
any runtime typings, so they work with this runtime today, but only with a cast, and only from
CommonJS.

This CR makes the runtime a first-class partner of that output:

1. fix the published typings (`types/main.d.ts`) so generated element types flow through
   `unmarshal*` / `marshal*` without casts;
2. add an ES-module entry point so `import { Jsonix } from '@mitre/jsonix'` works in Node ESM and
   bundlers, matching the `.mjs` mapping output;
3. commit compiler-generated fixtures for the purchase order schema and test, in CI, that the
   runtime's data representation matches what the declarations promise;
4. retire or port the stale `nodejs/tests/*` integration packages, which the compiler's other
   change requests have silently broken;
5. document the TypeScript workflow;
6. record two small follow-ups for the compiler repository.

Nothing in `jsonix.js` (the runtime itself) changes.

## What the compiler now produces

For `purchaseorder.xsd`, `-generateTypeScript` writes `PurchaseOrder.d.ts` (abbreviated; the full
golden file is `compiler/src/test/resources/typescript/po/PurchaseOrder.d.ts` in the compiler repo):

```ts
export interface XmlQName { namespaceURI: string; localPart: string; prefix?: string; key?: string; string?: string; }
export interface XmlCalendar { year?: number; month?: number; day?: number; hour?: number; minute?: number;
  second?: number; fractionalSecond?: number; timezone?: number; }
export interface XmlDuration { sign?: number; years?: number; months?: number; days?: number; hours?: number;
  minutes?: number; seconds?: number; }
export interface TypedNamedValue<T> { name: XmlQName; value: T; }
export interface JsonixMapping { readonly [key: string]: unknown; }

export interface USAddress { TYPE_NAME?: 'PO.USAddress'; name: string; street: string; city: string;
  state: string; zip: number; country?: string; }
export interface PurchaseOrderType { TYPE_NAME?: 'PO.PurchaseOrderType'; shipTo: USAddress; billTo: USAddress;
  comment?: string; items: Items; orderDate?: XmlCalendar; }
export type PurchaseOrderElement = TypedNamedValue<PurchaseOrderType>;
export type RootElement = CommentElement | PurchaseOrderElement;
export declare const PO: JsonixMapping;
```

plus one-line re-export files per JavaScript output (`PurchaseOrder.std.d.ts`, and
`PurchaseOrder.d.mts` for the `.mjs` output). With `<jsonix:output format="esm"/>` the mapping is
written as `export const PO = { ... };` in `PurchaseOrder.mjs`.

The support types are emitted into every generated file on purpose: the compiler's CR-005 states
"Generated declarations need no `jsonix` typings; the Jsonix runtime itself has none." That
statement is about upstream `jsonix`; this fork does ship `types/main.d.ts`, which is where the
friction below comes from.

### The declarations are truthful about this runtime

Checked against `nodejs/scripts/jsonix.js` (3.0.11) on 2026-09-06:

| Declared | Runtime | Match |
|----------|---------|-------|
| `TypedNamedValue<T>` = `{ name: XmlQName; value: T }` | `Unmarshaller.unmarshalDocument` returns `{ name, value }`; `Marshaller.marshalElement` consumes the same | yes |
| `TYPE_NAME?: 'PO.USAddress'` | `ClassInfo.unmarshal` sets `TYPE_NAME` to `this.name` (unless an `instanceFactory` is configured); `isInstance` compares it | yes |
| `XmlQName` fields `namespaceURI`, `localPart`, `prefix`, `key`, `string` | `Jsonix.XML.QName` prototype fields, `jsonix.js` lines 750 to 754 | yes |
| `XmlCalendar` fields `year` … `timezone`, unset = `NaN` | `Jsonix.XML.Calendar` prototype fields, lines 883 to 890 | yes |
| `XmlDuration` fields `sign`, `years`, `months`, `days`, `hours`, `minutes`, `seconds` | `Jsonix.Schema.XSD.Duration.isInstance` / `print`, lines 5134 to 5175 | yes |

These five facts are now a **contract**: a change to any of them in `jsonix.js` breaks every
generated `.d.ts` in the wild without a compile error here. Item 3 below turns the contract into
a test.

## Motivation (evidence)

All findings reproduced on 2026-09-06 with Node 18.18.1, TypeScript 5.6.3 (from the compiler's
`tests/typescript/node_modules`), and this repository at commit `c522f40`.

### 1. The published typings reject the generated types

`usage.ts`, compiled with `--strict` against `@mitre/jsonix` (symlinked to `nodejs/scripts`) and the
golden `PurchaseOrder.d.ts`:

```ts
import { Jsonix } from '@mitre/jsonix';
import type { PurchaseOrderElement, USAddress } from './PurchaseOrder';
const u = new Jsonix.Context([]).createUnmarshaller();
const m = new Jsonix.Context([]).createMarshaller();
const direct: PurchaseOrderElement = u.unmarshalString(xml);                 // (a)
const cast = (u.unmarshalString(xml) as PurchaseOrderElement).value;         // (b) the compiler README's form
const el: PurchaseOrderElement = { name: { namespaceURI: '', localPart: 'purchaseOrder' }, value: /* … */ };
const out: string = m.marshalString(el);                                      // (c)
```

```
(a) error TS2739: Type 'Record<string, unknown>' is missing the following properties from type
    'TypedNamedValue<PurchaseOrderType>': name, value
(b) error TS2352: Conversion of type 'Record<string, unknown>' to type 'PurchaseOrderElement' may be a
    mistake because neither type sufficiently overlaps with the other. If this was intentional, convert
    the expression to 'unknown' first.
(c) error TS2345: Argument of type 'PurchaseOrderElement' is not assignable to parameter of type
    'Record<string, unknown>'. Index signature for type 'string' is missing in type
    'TypedNamedValue<PurchaseOrderType>'.
```

Cause: `types/main.d.ts` types every unmarshal result and every marshal parameter as
`Record<string, unknown>`. TypeScript interfaces have no implicit index signature, so an interface
value is neither assignable to nor castable from that record type. The compiler's own type-check
passes only because it runs against upstream `jsonix`, which has no typings at all, so every
result is `any`.

### 2. A named ES-module import of the runtime fails

```
$ cat named.mjs
import { Jsonix } from "@mitre/jsonix";
$ node named.mjs
SyntaxError: Named export 'Jsonix' not found. The requested module '@mitre/jsonix' is a CommonJS module …
$ cat default.mjs
import j from "@mitre/jsonix"; console.log(typeof j.Jsonix);
$ node default.mjs
object
```

Cause: `package.json` has `main` only (no `exports`, no `module`), and the UMD footer of `jsonix.js`
assigns `module.exports` through `amdefine` inside a `try` block, which Node's CommonJS export
lexer cannot analyse. The compiler's ESM smoke test (`tests/typescript/src/test/javascript/esm-smoke.mjs`)
works around this with `createRequire`, which is exactly what a consumer importing an `.mjs`
mapping should not have to do.

### 3. Nothing in this repository tests against generated output

`nodejs/scripts/tests` contains hand-written mapping modules only. The compiler tests the
generated declarations against upstream `jsonix@^3.0.0`, not against `@mitre/jsonix`. Neither
repository would notice if the runtime's `TYPE_NAME`, QName, Calendar or Duration representation
drifted from the declarations.

### 4. The `nodejs/tests/*` integration packages are broken by the compiler's CR-003 and CR-004

- `nodejs/tests/po/bindings.xjb`, `nodejs/tests/browserify/bindings.xjb` and
  `nodejs/tests/wps/bindings/bindings.xjb` (also `demos/po` and `demos/wms`) declare
  `xmlns:jaxb="http://java.sun.com/xml/ns/jaxb"`. The new compiler's JAXB 4 XJC **silently
  ignores** customisations in that namespace (compiler CR-004), so regeneration would drop the
  `jsonix:` customisations and package bindings without an error.
- Their `package.json` files depend on `jsonix-schema-compiler` from npm (the 2018 upstream
  package, not this fork's build) and on `file:../../scripts/jsonix-3.0.1-SNAPSHOT.tgz`, a Maven
  artefact that no longer exists.
- Committed mappings will reorder once on the first regeneration (compiler CR-003).
- None of them run in CI; `.github/workflows/tests.yml` runs only `nodejs/scripts`.

## Proposed changes

### 1. Typings: make results and parameters generic (`nodejs/scripts/types/main.d.ts`)

Replace the `Record<string, unknown>` signatures. Proposed shape (names chosen to match the
generated files structurally; the generated files keep their own copies):

```ts
declare module '@mitre/jsonix' {
  export namespace Jsonix {
    export namespace XML {
      export interface QName { namespaceURI: string; localPart: string; prefix?: string; key?: string; string?: string; }
      export interface Calendar { year?: number; month?: number; day?: number; hour?: number; minute?: number;
        second?: number; fractionalSecond?: number; timezone?: number; }
    }
    /** An element as returned by an unmarshaller or accepted by a marshaller. */
    export interface TypedNamedValue<T = unknown> { name: XML.QName; value: T; }
    /** A mapping object as consumed by new Jsonix.Context([...]); generated files declare theirs as JsonixMapping. */
    export type Mapping = object;

    export interface Unmarshaller {
      unmarshalString<E extends TypedNamedValue = TypedNamedValue>(text: string): E;
      unmarshalDocument<E extends TypedNamedValue = TypedNamedValue>(doc: Node, scope?: unknown): E;
      unmarshalURL<E extends TypedNamedValue = TypedNamedValue>(url: string, callback: (result: E) => void, options?: object): void;
      unmarshalFile<E extends TypedNamedValue = TypedNamedValue>(fileName: string, callback: (result: E) => void, options?: object): void;
    }
    export interface Marshaller {
      marshalString<E extends TypedNamedValue>(element: E): string;
      marshalDocument<E extends TypedNamedValue>(element: E): Document;
    }
    export class Context {
      constructor(mappings: Mapping[], options?: ContextOptions);
      createUnmarshaller(): Unmarshaller;
      createMarshaller(): Marshaller;
      // … existing members unchanged
    }
  }
}
```

Consumer code then reads:

```ts
import { Jsonix } from '@mitre/jsonix';
import { PO } from './PurchaseOrder.mjs';
import type { PurchaseOrderElement } from './PurchaseOrder.mjs';

const po = new Jsonix.Context([PO]).createUnmarshaller().unmarshalString<PurchaseOrderElement>(xml).value;
po.shipTo.name;      // string
po.shipTo.nme;       // compile error
```

Incidental corrections while in the file: `scope` and `options` become optional (the runtime
treats them so); `marshalDocument` returns a `Document`, not an `Element`; `unmarshalDocument`
accepts any DOM `Node` (the runtime wraps it in `Jsonix.XML.Input`).

The existing internal interfaces (`TypeInfo`, `ClassInfo`, `PropertyInfo`, `builtinTypeInfos`)
are left as they are; they describe mapping internals, not data, and are out of scope.

### 2. Packaging: ES-module entry point (`nodejs/scripts`)

Add `jsonix.mjs`:

```js
import cjs from './jsonix.js';
export const Jsonix = cjs.Jsonix;
export default cjs;
```

and in `package.json`:

```json
"main": "jsonix.js",
"types": "./types/main.d.ts",
"exports": {
  ".": {
    "types": "./types/main.d.ts",
    "import": "./jsonix.mjs",
    "require": "./jsonix.js"
  },
  "./jsonix.js": "./jsonix.js",
  "./package.json": "./package.json"
}
```

The wrapper keeps the runtime a single CommonJS bundle (no change to the three checked-in copies
of the library described in `CLAUDE.md`) while giving ESM consumers a static named export. The
`./jsonix.js` subpath keeps existing deep imports working. Bundlers that previously stumbled on
the indirect `define` call (upstream jsonix#202) resolve the `import` condition and never see the
UMD footer.

`.npmignore` needs no change (`tests/` is already stripped by the publish workflow; `jsonix.mjs`
must **not** be ignored).

### 3. Contract test: generated fixtures under `nodejs/scripts/tests/typescript/`

Commit the compiler's output for the purchase order schema, generated with the compiler at
commit `0b2c8a8` or later from a Jakarta-namespace `bindings.xjb` that declares both a standard
UMD output and an ESM output:

```
tests/typescript/
  bindings.xjb              # jakarta namespace; <jsonix:output naming="standard"/> and <jsonix:output naming="standard" format="esm"/>
  purchaseorder.xsd
  po.xml
  PurchaseOrder.std.js      # generated
  PurchaseOrder.std.d.ts    # generated re-export
  PurchaseOrder.mjs         # generated
  PurchaseOrder.d.mts       # generated re-export
  PurchaseOrder.d.ts        # generated declarations
  usage.ts                  # compile-time checks, no casts; @ts-expect-error negatives
  esm-smoke.mjs             # import { Jsonix } from '@mitre/jsonix' + import { PO } from './PurchaseOrder.mjs'
  tsconfig.json             # strict, noEmit, moduleResolution bundler, paths: { "@mitre/jsonix": ["../.."] }
  typescript.js             # nodeunit suite: unmarshal po.xml via PurchaseOrder.std.js, assert the declared shape
  README.md                 # regeneration command and compiler commit
```

Regeneration command (record it in the README with the compiler commit used):

```
java -jar jsonix-schema-compiler-full-<version>.jar -generateTypeScript -d tests/typescript \
  tests/typescript/purchaseorder.xsd -b tests/typescript/bindings.xjb
```

`package.json` additions:

```json
"devDependencies": { "typescript": "~5.6.3", "...": "unchanged" },
"scripts": {
  "test": "nodeunit tests/tests.js",
  "typecheck": "tsc -p tests/typescript/tsconfig.json",
  "test:esm": "node tests/typescript/esm-smoke.mjs"
}
```

`tests/tests.js` gains `"TypeScript": require('./typescript/typescript')`, and the nodeunit suite
asserts, for the unmarshalled `po.xml`:

- `element.name.localPart === 'purchaseOrder'`, `element.value.TYPE_NAME === 'PO.PurchaseOrderType'`;
- `shipTo.TYPE_NAME === 'PO.USAddress'`, `typeof shipTo.zip === 'number'`;
- `items.item[0].TYPE_NAME === 'PO.Items.Item'`, `typeof quantity === 'number'`;
- `orderDate.year === 1999` and `Number.isNaN(orderDate.hour)` (Calendar contract);
- marshalling the object back and re-unmarshalling gives an equal object (`Jsonix.Util.Type.isEqual`).

`usage.ts` mirrors the compiler's `tests/typescript/src/test/typescript/usage.ts` but imports
`Jsonix` from `@mitre/jsonix` and uses `unmarshalString<PurchaseOrderElement>` and
`marshalString(element)` with no casts, plus three `@ts-expect-error` lines (misspelt property,
wrong type, missing required property). The three type errors quoted in "Motivation" must be
reproduced by removing the fix from item 1 before it is committed, to prove the test bites.

CI (`.github/workflows/tests.yml`): after `npm run test`, add `npm run typecheck` and
`npm run test:esm`.

### 4. `nodejs/tests/*` integration packages: delete

Recommended: delete `nodejs/tests` (`ar`, `basic`, `browserify`, `po`, `wps`, `pom.xml`) and
`nodejs/demos`. Leave `demos/` and `fiddles/` as historical samples, with a README note that
their `.xjb` files predate the Jakarta namespace. Item 3 replaces the only thing the deleted
packages provided (a generated-mapping round trip) with something that runs in CI.

Alternative, if the OGC WPS coverage in `nodejs/tests/wps` is wanted: port `wps` only. That means
the Jakarta namespace in its `bindings.xjb`, a dependency on this fork's compiler once it has a
published npm name, replacing the `.tgz` dependency with `file:../../scripts`, and accepting one
reorder of the committed mappings. About half a day, and it still needs a Java toolchain in CI.

### 5. Documentation

- `README.md` (root and `nodejs/scripts/README.md`, which is what npm shows): a "TypeScript"
  section showing `-generateTypeScript`, the `.mjs` mapping option, the cast-free usage from
  item 1, and the note that dates are Jsonix calendars, not JS `Date`s. Replace the stale
  `java -jar node_modules/jsonix/lib/jsonix-schema-compiler-full.jar` instruction (the jar is not
  in this package) with the compiler's own instructions. State that binding files must use
  `https://jakarta.ee/xml/ns/jaxb` version 3.0 with the current compiler.
- `CLAUDE.md`: name the sibling compiler repository and its `docs/change-requests/`; add the
  representation contract table from this CR, pointing at `tests/typescript` as the guard; list
  the new scripts.
- `docs/change-requests/README.md`: index, as in the compiler repository.

### 6. Follow-ups for the compiler repository (not part of this CR's work here)

- `tests/typescript/package.json` there depends on `"jsonix": "^3.0.0"` (upstream). It should
  depend on `@mitre/jsonix` at the version that includes item 1, so both repositories test against
  each other's current state; its `usage.ts` can then drop the cast.
- `JsonixMapping` could carry a phantom type parameter, `JsonixMapping<RootElement>`, with
  `export declare const PO: JsonixMapping<RootElement>`. The typings in item 1 could then be
  `class Context<M extends Mapping<any>> { constructor(mappings: M[]); createUnmarshaller(): Unmarshaller<RootOf<M>> }`
  so that `new Jsonix.Context([PO]).createUnmarshaller().unmarshalString(xml)` is typed as
  `RootElement` with no type argument at all. Additive on both sides; do item 1 first so it works
  without it.
- The compiler's npm package name for this fork (its `npm/src/main/npm/package.json` still says
  `jsonix-schema-compiler`) decides what item 4's alternative and the README in item 5 can point at.

## Verification

| Check | Expected |
|-------|----------|
| `npm run typecheck` with item 1 applied | green; with `types/main.d.ts` reverted, exactly the three errors in "Motivation" |
| `node named.mjs` (from "Motivation") against the packed tarball | prints `object` |
| `npm pack` then `tar tzf` | contains `jsonix.mjs`, `types/main.d.ts`; no `tests/` |
| `npm test`, `npm run test:esm` | green on Node 18, 20, 22 (the CI workflow pins 22; the `exports` map needs Node 12.7+) |
| `tsc` with `moduleResolution` `node16` and `bundler` over `usage.ts` | green for both (the `.d.mts` re-export exists for `node16`) |
| An existing CommonJS consumer (`const { Jsonix } = require('@mitre/jsonix')`) | unchanged |

## Risks

- **`exports` map.** Adding one is the only change in this CR that can break an existing
  consumer: any deep import other than `./jsonix.js` and `./package.json` (for example
  `@mitre/jsonix/types/main.d.ts`) stops resolving. No such import is known; the subpath list can
  be widened if one turns up. Bump the minor version (3.1.0) and say so in the release notes.
- **Typings.** Code that relied on the old `Record<string, unknown>` result (for example
  `result['value']`) still compiles against `TypedNamedValue<unknown>`; code that indexed by an
  arbitrary key does not. Considered acceptable in a minor release, since the old signature made
  the actual result unusable without a cast.
- **Fixture drift.** The committed generated files must be regenerated when the compiler's output
  format changes deliberately; the README in `tests/typescript` records the command and commit.
  Because the compiler's CR-003 made output deterministic, regeneration produces a clean diff.
- The runtime (`jsonix.js`) is untouched; the three-copies problem in `CLAUDE.md` is not made
  worse.

## Effort

| Item | Estimate |
|------|----------|
| 1. Typings | 2 hours |
| 2. ESM entry and `exports` | 1 hour |
| 3. Fixtures, `usage.ts`, nodeunit suite, ESM smoke, CI | 1 day |
| 4. Delete `nodejs/tests` (or half a day to port `wps`) | 1 hour |
| 5. Documentation | 2 hours |
| 6. Compiler follow-ups | tracked there |

Recommended order: 1, 3 (which proves 1), 2, 5, 4. Items 1 to 3 are one release (3.1.0).
