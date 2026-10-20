# jsonix-CR-008: An unmarshal-side `onElement(element, value)`: the source element each typed object was read from

**Status:** Implemented 2026-10-20 (section 7), unreleased; 3.5.0 proposed
**Depends on:** nothing; 3.4.2 is the baseline
**Requested by:** `plutext/docx4j-generated-objects-ts` CR-011 (`docs/change-requests/CR-011-declare-source-only-prefixes.md`),
2026-10-20, on Jason's decision that day to take it into the runtime rather than into a facade-side wrapper
over runtime internals
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

jsonix-CR-006 gave the marshaller `onElement(element, value)`: for each typed object, the DOM
element it was written to. The unmarshaller has the same pair in hand, the source element and the
object read from it, and drops the link once the object is returned. This CR reports it, through a
per-call option of the same name on `createUnmarshaller(options)`:

```js
context.createUnmarshaller({ onElement: function (element, value) { ... } })
```

Nothing changes for a caller that does not set it: one property read and one `if` per element read
as a typed object, with no measurable cost (section 6).

## 2. Why the objects facade needs it

The typed tree keeps no namespace declarations. A prefix that only the source bound and that an
`mc:Choice`'s `Requires` names (a private `zz9`, or `shape2010` as a second prefix for the `wps`
namespace) therefore has nothing to be declared from when the part is marshalled, and the part
comes out naming a prefix it does not declare. objects CR-011 fixes this in the
facade: for each typed `mc:Choice` object it records the binding in scope at the source element of
each prefix its `Requires` names (`lookupNamespaceURI` on that element), keyed by the typed object,
so that the record travels when core-ts moves content between trees (`insertOoxml`, `insertXml`).
That needs the pair (source element, typed object) for each Choice as it is read, and only the
runtime holds it. objects prototyped the facade side against a wrapper standing in for this
callback: twelve cases as specified, its 341 corpus hashes identical, unmarshal cost within noise.

## 3. What fires, and when

At the end of `Jsonix.Model.ClassInfo.unmarshal`, after the parent stack is popped and just before
`return result`, with the element captured on entry (at `START_ELEMENT`, before the content moves
the input on):

```js
if (context.onElement) {
	context.onElement(sourceElement, result);
}
```

- **Once per element read as a typed object.** Every element-reading property (element, elements,
  element map, element ref(s), and the typed branch of `anyElement`) goes through
  `Jsonix.Binding.Unmarshalls.Element.unmarshalElement`, which resolves the type info once, from
  `xsi:type` or the element name, and calls its `unmarshal` once. Unlike the marshal side, where a
  derived type's `marshal` calls its base type's on the same element and CR-006 had to dedupe,
  `ClassInfo.unmarshal` reads the merged structure and never calls the base type's, so an `xsi:type`
  element is reported once, as its derived type, with no guard needed. The root element is
  reported like any other; `Jsonix.Schema.XSD.AnyType`, the only `ClassInfo` subclass, is reported
  too, as it is on the marshal side.
- **The object is complete.** Its attributes are read (a Choice's `requires` is set), its content is
  read, and its `PARENT` is set when `parentPointers` is on. Children are therefore reported before
  their parent (post-order).
- **The element is the source node itself,** in its own document, not a copy, so
  `lookupNamespaceURI` sees the declarations of its ancestors.
- **Not reported,** as on the marshal side: an element holding a simple value (its owner is), the
  `{ name, value }` wrapper an element ref produces (its value is), and wildcard DOM content.
- **Wildcard DOM content is the source node.** `input.getElement()` returns the node itself, so an
  `anyElement` with `allowDom` puts the original element into the tree; on the marshal side CR-006's
  `onElement` reports the imported copy against that original. objects relies on both, to find the
  bindings of Choices inside such content. This was already the behaviour; this CR makes it a
  documented promise in `types/main.d.ts`.
- **Errors.** If unmarshalling throws, the calls already made stand. An element whose reading
  throws, and its ancestors, are never complete and are not reported. A callback that throws
  propagates like any other error from inside a property, so it arrives located (CR-006 section 3.4).

## 4. Typings

`UnmarshalCallbacks` gains `onElement?(element: Element, value: object): void`, documented with the
conditions of section 3. The context's `readonly onElement` becomes the union of the marshal and
unmarshal signatures. `tests/typescript/usage.ts` asserted with `@ts-expect-error` that
`createUnmarshaller` rejects `onElement`; that assertion is replaced by a positive use and an
expected error for a callback that wants a third (class info) parameter.

## 5. Compatibility

No signature, mapping format, default behaviour or output changes. Callbacks reach the runtime only
through a derived context (`createUnmarshaller(options)`, `createMarshaller(options)`,
`deriveContext(options)`): the `Context` constructor does not copy them. The name is shared with the
marshal side, which is safe because each derived context carries its own. One case changes
behaviour: a caller that derives one context with `onElement` set and then creates an unmarshaller
from it, or passes the same options object to both factories, now also gets unmarshal reports. The
known consumers do neither: core-ts passes `onElement` only to the facade's `marshalNode`, and the
facade takes separate option objects for marshal and unmarshal (searched 2026-10-20).

## 6. Cost

Unmarshalling one 50,001-element document (50,000 typed children, each with two attributes and a
simple-valued child element) seven times, median of seven, Node 18, two rounds: 3.4.2 70 and 88 ms;
this CR with the callback unset 67 and 64 ms (no difference beyond noise); with an empty callback 75
and 71 ms.

## 7. As implemented (2026-10-20)

Patched in the three copies (`nodejs/scripts/jsonix-factory.js`, `dist/Jsonix-all.js`, the modular
`Jsonix/Model/ClassInfo.js`): one `var sourceElement = input.node;` after the `START_ELEMENT` check
and the report before `return result`. `tests/callbacks.js` gains eight tests, over a minimal
mapping (the CR-006 one plus an element-ref type):

- nested classes, each typed object reported once with its source element, children before the
  parent, the `xsi:type` element once as its derived type;
- the object complete when reported: attributes read, `PARENT` set, the root's content read;
- a simple-valued element and wildcard DOM content not reported, and the DOM content being the
  source node itself;
- an element ref's wrapper not reported, its value reported;
- `lookupNamespaceURI` on the reported element resolving a prefix declared on an ancestor;
- calls made before an error standing, the failing element and its parent not reported;
- the unmarshalled tree, and its marshalled bytes, identical with and without the callback;
- the marshal and unmarshal callbacks independent, the shared context untouched.

Suite 1104 assertions; typecheck, ESM and bundle checks pass.
