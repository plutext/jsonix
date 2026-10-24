# jsonix-CR-011: Marshal-side adapters: per-call `onAttributeValue` (rewrite or omit an attribute that prints) and `omitElement` (leave an element out)

**Status:** Proposed 2026-10-24
**Depends on:** nothing; 3.7.0 is the baseline
**Requested by:** `plutext/docx4j-generated-objects-ts` for its CR-013 phase C, at Jason's word ("raise the
marshal-adapter CR with jsonix-d2"), 2026-10-24. Phase C is the save normaliser behind core-ts CR-015's D2, and it
follows docx4j CR-060 with CR-061's normal form, value for value. Not scheduled; implementation waits for Jason.
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

JAXB lets docx4j change what it writes without changing the objects in memory. An `XmlAdapter` rewrites an
attribute's value, and element adapters and `beforeMarshal`/`afterMarshal` leave elements out. The jsonix
marshaller has no such hook:
- CR-006's `onElement` only observes.
- CR-010's `onUnprintableValue` is consulted only when a print has failed.

So objects' normaliser would have to edit the marshalled DOM, keyed by element and attribute names. That is
brittle: `CT_Border` alone sits under a dozen element names, and the DOM no longer shows the typed values.

This CR adds two per-call marshaller options:

```js
context.createMarshaller({
	onAttributeValue: function (value, text, owner, propertyInfo, classInfo) { ... },  // string, null to omit, undefined to keep
	omitElement: function (value, name, typeInfo, propertyInfo, classInfo) { ... }     // true to leave the element out
})
```

Both are marshal-only: the tree in memory is never changed. With neither set, the marshaller does what it does
today.

## 2. What objects needs (objects CR-013 phase C)

- **Attribute values that print fine, rewritten or omitted:**
  - `CT_Color.val`, `CT_Underline`'s `color`, `CT_Shd`'s `fill` and `color`, `CT_Background`'s `color` and
    `CT_Border`'s `color` are written as upper-case `RRGGBB`, with `auto` kept.
  - A value Word rejects is omitted on the underline colour, and written `auto` on fills and borders.
  - On `CT_Color.val` a rejected value is written `auto` when a theme attribute stands beside it. Deciding that
    needs the owning object, not only the value.
- **Elements left out:**
  - `w:highlight`, `w:vertAlign` and `w:em` whose `val` is missing or invalid;
  - a `w:color` whose `val` is rejected and which has no theme attribute.

  This includes elements inside element-ref lists, such as `w:rPrChange`'s former `rPr` and a paragraph mark's
  `rPr`, which Reject All restores.
- **Constraints:**
  - marshal-only;
  - a valid Office document pays nothing it can see: objects' 341 fidelity hashes must not move, and its scan found
    no colour in that corpus outside the normal form;
  - both hooks scoped by `classInfo.module.name`, as CR-010's are.

## 3. Where the runtime writes

- **Attributes:** every typed attribute is written by `AttributePropertyInfo.marshal`, called from the property
  loop of `ClassInfo.marshal`. A derived type's `marshal` first calls its base type's, which loops the base's own
  properties over the same object.
- **Elements:** every typed element goes through `Jsonix.Binding.Marshalls.Element.marshalElement`. That includes
  element, elements, element-ref and element-refs properties, and the typed items of an `anyElement`. The
  method converts the item to `{ name, value, typeInfo }`, resolves `xsi:type`, then writes the start element.
  - The root element arrives there from the marshaller itself, with no owning class info.
  - Element maps write their own elements. objects' modules have none.
  - Wildcard DOM content is written by `writeNode` and is not typed.

## 4. Proposal

### 4.1 `onAttributeValue(value, text, owner, propertyInfo, classInfo)`

It is called in `AttributePropertyInfo.marshal` after the value has printed:
- `value` is the property's value.
- `text` is what the runtime would write.
- `owner` is the typed object being marshalled, so the callback can read sibling properties (the theme attribute
  beside `CT_Color.val`).
- `propertyInfo` is the attribute property.
- `classInfo` is the class info that declares it: the base type for an inherited attribute, as on CR-010's marshal
  side.

What the callback returns decides what is written:
- **A string** is written as the attribute's value.
- **`null`** omits the attribute.
- **`undefined`** writes `text` unchanged. A callback that handles only some properties can therefore fall through
  for the rest without rewriting them.
- **Anything else** throws, as a non-string from `onUnprintableValue` does.

A value that fails to print goes to `onUnprintableValue` (CR-010), and only there. The two never both see one
value.

`owner` reaches `AttributePropertyInfo.marshal` as a fifth argument. `ClassInfo.marshal` passes the object whose
properties it loops over (the same object for the base type's loop), and the other property infos ignore it.

`undefined` differs from `onUnprintableValue`, where `undefined` omits the attribute. There, nothing printed and
there is no `text` to fall back to. Here there is, and "no opinion" is the safer default for a callback that sees
every attribute in its scope.

### 4.2 `omitElement(value, name, typeInfo, propertyInfo, classInfo)`

It is called in `Marshalls.Element.marshalElement` before the start element is written, for every element written
from a property:
- `value` is the element's value: the typed object, or the simple value.
- `name` is its QName.
- `typeInfo` is the type it is about to be marshalled as, after `xsi:type`.
- `propertyInfo` is the property it belongs to: an element, elements, element-ref(s) or `anyElement` property.
- `classInfo` is the owning class info.

What the callback returns decides what happens:
- **`true`** leaves the element out entirely: no start element, no content, no CR-006 `onElement` report.
- **Anything else** writes the element as today.

It is not called for the root element passed to `marshalString`, `marshalDocument` or `marshalNode`, which has no
owner; the caller decides what to marshal. Element maps and wildcard DOM content are not covered (section 3).

### 4.3 What objects' facade could set

The policy belongs to objects (CR-013 phase C):

```js
onAttributeValue: function (value, text, owner, propertyInfo, classInfo) {
	if (classInfo.module.name !== 'org_docx4j_wml') return undefined;        // other vocabularies: as written
	var rule = COLOUR_ATTRIBUTES[classInfo.name + '#' + propertyInfo.name];  // CT_Color#val, CT_Border#color, ...
	return rule ? rule(text, owner) : undefined;                             // upper-case hex, 'auto' or null
},
omitElement: function (value, name, typeInfo, propertyInfo, classInfo) {
	if (typeInfo.module === undefined || typeInfo.module.name !== 'org_docx4j_wml') return false;
	var rule = OMITTED_WHEN[typeInfo.name];                                  // Highlight, VertAlign, Em, CTColor
	return rule ? rule(value) : false;
}
```

## 5. Alternatives

- **A pass over the marshalled DOM** (objects' fallback). It is keyed by element and attribute names, which repeat
  across types and vary across contexts. It cannot see typed values, and it walks the output a second time.
- **Copy the tree, edit the copy, marshal that.** This keeps the tree in memory unchanged, but costs a deep copy per
  save, and needs a type-aware walker in the facade, which duplicates what the marshaller already walks.
- **An adapter table keyed by class info and property name**
  (`adapters: { 'org_docx4j_wml.CTColor': { val: fn } }`), resolved once per property. This is closer to JAXB's
  static `@XmlJavaTypeAdapter` binding, and makes no call at all for properties without an adapter. But it is a
  second mechanism beside CR-006's and CR-010's callbacks, and the facade can build the same table inside one
  callback (section 4.3) for the cost of one call per attribute. If section 7 measures that cost as material, a
  table can follow.
- **Folding the attribute rewrite into `onUnprintableValue`:** that callback is defined by a failed print, and
  3.7.0 shipped it. Values that print are a different set.

## 6. Typings

```ts
// MarshalCallbacks
onAttributeValue?(value: unknown, text: string, owner: object, propertyInfo: AttributePropertyInfo, classInfo: ClassInfo): string | null | undefined;
omitElement?(value: unknown, name: XML.QName, typeInfo: TypeInfo, propertyInfo: PropertyInfo, classInfo: ClassInfo): boolean | undefined;
```

`TypeInfo` gains an optional `module?: { readonly name: string }`, since built-in simple types have none. The
derived context declares both members, as it does for the CR-006 and CR-010 callbacks.

## 7. Compatibility and cost

The change is additive: with neither option set, output and errors are unchanged, and no mapping format changes.

Cost unset: one property read per attribute and per element written, beside CR-006's existing `onElement` read.
Cost set: one call per attribute or per element in the document. At implementation the cost will be measured on a
large document, both unset and with a callback that returns at once, as CR-008 section 6 did, and recorded here.

## 8. Tests (at implementation)

A new suite over a minimal two-module mapping:
- a rewritten attribute, an omitted one (`null`) and one kept (`undefined`);
- `owner` carrying a sibling;
- the declaring class info for an inherited attribute;
- a non-string return refused;
- `onUnprintableValue` and `onAttributeValue` never both called for one value;
- an element omitted from an element property, an elements collection, an element-refs list (with its wrapper) and
  an `anyElement`, with no `onElement` report for an omitted element;
- the root never offered;
- `xsi:type` giving `typeInfo` the derived type;
- scoping by module;
- unset options leaving output byte-identical;
- the tree unchanged after a marshal with both set.

Plus the typings in `usage.ts`, the three copies, and `tests/strict.js`.

## 9. Decisions (for Jason)

- **K1.** Generic per-call callbacks (recommended), or an adapter table keyed by class info and property (section 5).
- **K2.** `owner` passed to `onAttributeValue` (recommended; `CT_Color.val` beside a theme attribute needs it).
- **K3.** `undefined` from `onAttributeValue` keeps `text`, and `null` omits (recommended), against `undefined`
  omitting as in `onUnprintableValue`.

Downstream: objects-ts/CR-013.C depends on this CR. Phases A and B do not.
