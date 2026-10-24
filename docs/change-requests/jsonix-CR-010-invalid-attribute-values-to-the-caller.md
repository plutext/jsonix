# jsonix-CR-010: An attribute value the type refuses goes to the caller instead of failing the part: per-call `onInvalidValue` (unmarshal) and `onUnprintableValue` (marshal)

**Status:** Implemented 2026-10-24 (section 12), version 3.7.0; J1 to J3 decided as recommended (Jason, 2026-10-24)
**Depends on:** nothing; 3.6.0 is the baseline
**Requested by:** `plutext/docx4j-core-ts` for its CR-015 (`docs/change-requests/CR-015-run-properties-as-word-reads-them.md`,
sections 2, 3, 6 and 7, uncommitted on 2026-10-24), after Jason's Word 365 probes of run properties that day,
raised through the portfolio session. Not scheduled; implementation waits for Jason.
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

One attribute value its type refuses fails the whole unmarshal. `<w:b w:val="FALSE"/>` or `<w:u w:val="Single"/>`
anywhere in `document.xml`, and core-ts's `getBody()`, `Texts.of` and every reader throw `PartUnmarshalException`.
Word opens the same file, mostly with no repair prompt, and gives each value a reading.

This CR lets the caller decide, per call, what such a value becomes:

```js
context.createUnmarshaller({ onInvalidValue: function (text, propertyInfo, classInfo, node, error) { ... } })
context.createMarshaller({ onUnprintableValue: function (value, propertyInfo, classInfo, error) { ... } })
```

The runtime supplies the mechanism and stays schema-neutral. Word's readings, and which parts and modules they
apply to, belong to the objects facade, which already holds Word's other readings (colour, highlight). With neither
callback set, nothing changes.

## 2. What happens today (3.6.0)

- `Jsonix.Schema.XSD.Boolean.parse` accepts exactly `true`, `1`, `on`, `false`, `0` and `off`. The last two pairs come
  from jsonix-CR-007. Anything else throws `Either [true], [1], [on], [false], [0] or [off] expected as boolean value.`
- `Jsonix.Model.EnumLeafInfo.parse` accepts exactly the enumeration's members (`entries.hasOwnProperty(text)`), and
  throws `Value [Single] is invalid for the enum type [org_docx4j_wml.UnderlineEnumeration].` `print` and
  `reprint` throw the same for a value outside `values`.
- Every attribute value is read through `ClassInfo.unmarshalPropertyValue`. The `anyAttribute` wildcard does not
  parse. That method locates the error with element, attribute and line (`ClassInfo.locateError`, CR-006) and
  rethrows, which aborts the unmarshal. CLAUDE.md records it: "A typed-value error aborts the unmarshal".
- In objects' modules, 1,099 attribute properties are typed `Boolean`:
  - 48 in `org_docx4j_wml` and 1 in w14;
  - 189 in DrawingML modules, 764 in SpreadsheetML and 91 in PresentationML.

  `org_docx4j_wml` has 125 enum-typed attribute properties over 77 enum types.

## 3. What Word does (core-ts CR-015 section 2, from Jason's runs)

1. **On/off** (`CT_OnOff`'s `w:val`, measured on eleven toggles): off only for exactly `false`, `off` or `0`,
   case-sensitive and untrimmed. Every other value is on, with no repair prompt: `""`, `" "`, `TRUE`, `FALSE`,
   `OFF`, `False`, `" false"`, `00`, `no`, `yes`.
2. **Run-property enumerations** (`u`, `vertAlign`, `em`, and `highlight`, which is a string in the model): a value
   outside the enumeration, case-exact, is unset.
   - An invalid `w:u` opens with no repair.
   - An invalid `vertAlign` or `em` makes Word repair the file, dropping the element.
   - What an invalid value does over a style that states the same property is not measured (core-ts D5).

For both, every value the strict parse accepts is one Word reads the same way: the six boolean spellings, and the
exact enumeration members. So the values that reach the callback are exactly the ones whose reading has to be
decided.

## 4. Why not CR-007's route

CR-007 put `on` and `off` into the runtime's `Boolean` for every mapping. Those were errors turned into the
readings xsd:boolean's own words suggest, and the change was judged harmless. Word's whole rule is different: it
turns `FALSE` and `no` into **on**. Applied globally, that would reach 1,051 Boolean attribute properties outside
WordprocessingML whose readers (Excel, PowerPoint, DrawingML in any host) nobody has measured. An invalid
enumeration value has no reading independent of the application at all.

So the rule needs a scope, and the scope is finer than a part. A WordprocessingML part also holds DrawingML: the
booleans of `wp:anchor`, `a:graphicFrameLocks` and `pic:cNvPicPr` sit in `document.xml`, and Word's reading of
those is unmeasured. The callback receives the class info, whose `module.name` (`org_docx4j_wml`) gives exactly that
scope, with no new mapping format.

## 5. Proposal

### 5.1 Unmarshal: `onInvalidValue(text, propertyInfo, classInfo, node, error)`

It is called when an attribute's value fails its type's parse: boolean, enumeration, number, date, QName or any
other simple type.
- `text` is the attribute value as read.
- `propertyInfo` is the attribute property: its `typeInfo` says which type refused it.
- `classInfo` is the owning class info (`classInfo.module.name` is the scope above).
- `node` is the element, as in CR-006's callbacks.
- `error` is the parse error, not yet located.

What the callback's outcome does:
- **A returned value** is stored as the property's value. It is not checked: the caller answers for it.
- **`undefined`** leaves the property unset, as if the attribute were absent.
- **A throw** aborts the unmarshal and is located with element, attribute and line, exactly as an unhandled
  typed-value error is today. To keep today's behaviour for a case, the callback rethrows `error`.

It sits in `ClassInfo.unmarshalPropertyValue`, inside the existing `try`, so it is consulted only after a parse
has failed: valid documents pay nothing.

It covers attribute values only. Every case measured is an attribute, and OOXML puts nearly all of its simple
values there. Element text of a simple type (`<c:idx>x</c:idx>`) could follow in another CR if a case arises.

### 5.2 Marshal: `onUnprintableValue(value, propertyInfo, classInfo, error)`

It is called when an attribute value fails its type's print. Today that is an enumeration value outside the
enumeration, or a non-boolean in a `Boolean`.
- **A returned string** is written as the attribute's value.
- **`undefined`** omits the attribute.
- **A throw** aborts, as today.

It is needed only if the unmarshal callback keeps a refused value as its string (section 5.4). Without it, the
first save of such a part would throw. It has a different name from the unmarshal callback, so a caller that
passes one options object to both factories (the edge CR-008 section 5 records for `onElement`) gets no surprise
calls.

### 5.3 What objects' facade could set for a WordprocessingML part

This is illustrative. The policy is objects' and core-ts's, under Jason's decisions in core-ts CR-015 section 7:

```js
onInvalidValue: function (text, propertyInfo, classInfo, node, error) {
	if (classInfo.module.name !== 'org_docx4j_wml') {
		throw error;                                   // unmeasured (DrawingML in document.xml, say): as today
	}
	if (propertyInfo.typeInfo === Jsonix.Schema.XSD.Boolean.INSTANCE) {
		return true;                                   // Word: off only for exactly false, off or 0
	}
	if (propertyInfo.typeInfo instanceof Jsonix.Model.EnumLeafInfo) {
		return text;                                   // keep, read as unset (or: return undefined to drop)
	}
	throw error;
},
onUnprintableValue: function (value, propertyInfo, classInfo, error) {
	if (classInfo.module.name === 'org_docx4j_wml' && propertyInfo.typeInfo instanceof Jsonix.Model.EnumLeafInfo && typeof value === 'string') {
		return value;                                  // write back the kept spelling
	}
	throw error;
}
```

Every reader that tests `val !== false` then agrees with Word, with no change (core-ts CR-015 section 4).

### 5.4 Keep or drop an invalid enumeration value

This is core-ts's D1/D2 for Jason. The runtime supports both; my recommendation is **keep**, until D5 is measured.

- **Keep** (`return text`, plus `onUnprintableValue`):
  - A re-marshalled part carries the source's own spelling, so it means to Word exactly what the source meant,
    whatever D5 finds.
  - The costs: the typed property holds a string outside its declared union (`'Single'` where the declaration
    says `UnderlineEnumeration`), so readers must treat a non-member as unset, which is objects' helpers' job.
  - A saved `vertAlign` or `em` still makes Word repair the file, as the source did.
- **Drop** (`return undefined`):
  - The model stays inside its declared types, and no marshal callback is needed.
  - But `<w:u w:val="Single"/>` saves as `<w:u/>`. Over a style that underlines, Word shows the style's underline
    for a bare `<w:u/>` (S11). If D5 finds that an invalid value overrides the style, that save changes meaning.
  - Dropping the whole element where its value is required (`vertAlign`, `em`), as Word's repair does (core-ts
    D2 (a)), is above the runtime in either case.

On/off has no keep-or-drop question. Word gives every string a reading, the facade returns it, and marshal writes
`true` or `false`, which Word reads the same way. That is CR-007's precedent (`off` saved as `false`).

## 6. Alternatives

- **Word's rule inside `Boolean`, globally** (CR-007's route): rejected in section 4.
- **Named per-call options** (`onOff: 'word'`, `invalidEnumValues: 'keep' | 'drop'`):
  - They put Word's lexical rules in the runtime.
  - Their scope is the whole unmarshal, so a WordprocessingML part's DrawingML would be included unless they also
    took module names.
  - Each further type (a number written `12pt`, a date) would need another option.
  - The callbacks are one mechanism, and they also let a caller collect every refused value without failing,
    e.g. for core-ts's `validateXml`, where today a caller's list is "first-only for type errors" (CLAUDE.md).
- **A distinct `OnOff` type emitted by the compiler:** docx4j's `wml.xsd` types these attributes `xsd:boolean`, 52
  declarations against 8 `ST_OnOff` (core-ts's count). The compiler cannot tell them apart without xsd or binding
  changes, and enumerations would still need this CR.
- **An `EnumLeafInfo.print` that writes any string:** it removes, for every consumer, the check that catches a
  mistyped value set in code.

## 7. Typings

```ts
// UnmarshalCallbacks
onInvalidValue?(text: string, propertyInfo: PropertyInfo, classInfo: ClassInfo, node: Element, error: Error): unknown;
// MarshalCallbacks
onUnprintableValue?(value: unknown, propertyInfo: PropertyInfo, classInfo: ClassInfo, error: Error): string | undefined;
```

`PropertyInfo` gains `typeInfo`, and `ClassInfo` gains `module: { name: string }`, both in their declared
interfaces, so the facade's tests compile. Each derived context's member is declared as for the CR-006 callbacks.

## 8. Compatibility

The change is additive. With neither callback set, behaviour, errors and output are unchanged. The CR-006
contract row in CLAUDE.md ("A typed-value error aborts the unmarshal") gains "unless `onInvalidValue` is set,
when the callback decides". core-ts's `validateXml` and objects' fidelity test are unaffected unless they set it.
No mapping format change.

## 9. Cost

None on valid input: the callback is consulted only inside the `catch` that already exists. On invalid input,
one function call replaces a thrown error.

## 10. Tests (at implementation)

`tests/callbacks.js` or a new suite, over a minimal mapping with a `Boolean` attribute, an enum attribute and an
integer attribute, in two modules:
- each outcome (a value, `undefined`, a throw) for each type;
- the throw located as today;
- the callback not called for valid values;
- scoping by `classInfo.module.name`;
- a kept enum string re-marshalled through `onUnprintableValue`, and omitted on `undefined`;
- unset callbacks giving today's errors verbatim;
- one options object passed to both factories causing no cross-calls.

Plus the typings in `usage.ts`, the three copies, and `tests/strict.js`.

## 11. Decisions (for Jason)

- **J1.** Callbacks (recommended) or named Word options (section 6).
- **J2.** Whether `onUnprintableValue` ships with `onInvalidValue`. It is needed if core-ts D1/D2 keeps invalid
  enumeration values; I recommend shipping both, since keeping is the choice that cannot change meaning before D5.
- **J3.** Attribute values only (recommended), or element text too.

Downstream:
- core-ts CR-015 depends on this CR.
- The objects change that sets the callbacks for WordprocessingML parts depends on it, whichever session files it.

## 12. As implemented (2026-10-24)

Jason decided J1 to J3 as recommended: callbacks, with `onUnprintableValue`, for attribute values only. Patched in the
three copies (`nodejs/scripts/jsonix-factory.js`, `dist/Jsonix-all.js`, the modular `Jsonix/Model/ClassInfo.js`
and `Jsonix/Model/AttributePropertyInfo.js`).

**Unmarshal: `ClassInfo.unmarshalPropertyValue`.** The parse sits in an inner `try`.
- On failure with no `onInvalidValue`, the error is rethrown to the existing `catch`, which locates it as before.
- With the callback, its result goes through `propertyInfo.setProperty`. So `null`, like `undefined`, leaves the
  property unset.
- A throw from the callback is located by the same outer `catch`. Rethrowing `error` gives today's message
  verbatim (tested).

**Marshal: `AttributePropertyInfo.marshal`.** The print sits in a `try`.
- `undefined` or `null` from the callback omits the attribute.
- A non-string throws `Argument [..] must be a string.`

**The class info passed.** On unmarshal it is the class info being read, so an `xsi:type` element's derived type.
On marshal it is the class info that declares the property: `ClassInfo.marshal` calls the base type's `marshal`
for inherited properties. Both carry the same `module` for a type and its base in one module, which is the scope a
facade checks.

**Typings.** `UnmarshalCallbacks.onInvalidValue` and `MarshalCallbacks.onUnprintableValue`, the derived context's
members, and these declarations, so that TypeScript callers can scope and dispatch:
- a new `AttributePropertyInfo` interface (`typeInfo`, `attributeName`, `defaultValue`);
- `ClassInfo.module: { readonly name: string }`;
- `TypeInfo.CLASS_NAME`.

The built-in boolean has `typeInfo.name === 'Boolean'`, and an enumeration has
`typeInfo.CLASS_NAME === 'Jsonix.Model.EnumLeafInfo'`. JavaScript callers can also compare against
`Jsonix.Schema.XSD.Boolean.INSTANCE` and use `instanceof Jsonix.Model.EnumLeafInfo`. `usage.ts` uses both
callbacks and expects errors for the marshal callback passed to `createUnmarshaller` and for a callback returning a
number.

**Tests.** `tests/invalidvalues.js` has 15 tests and 44 assertions, covering the cases of section 10 and a Word
reading surviving a save and a reload. Suite: 1194 assertions. Typecheck, ESM and bundle checks pass, and
`tests/strict.js` passes over all three copies. The dist and modular copies, loaded as a browser loads them with
xmldom's parser as globals, give the same errors, readings and output as the npm copy.

**On objects' modules (f912b88).** All 104 modules were loaded into one context, with section 5.3's policy scoped
to `org_docx4j_wml`. In a `w:r`:
- `w:b w:val="FALSE"` and `w:i w:val="no"` read `true`.
- `w:u w:val="Single"`, `w:vertAlign w:val="Superscript"` and `w:em w:val="DOT"` are kept as their strings.
- The save writes `w:val="true"` for the toggles and the three kept spellings back.
- Unset, the same run fails as before, on unmarshal and on marshal.
- `wp:anchor behindDoc="FALSE"` inside a `w:drawing` in the same run still fails, located at
  `wp:anchor/@behindDoc`: DrawingML in a WordprocessingML part keeps today's strictness.

## 13. The exact comparison is part of the contract (2026-10-24)

`onInvalidValue` sees a value only when the type's parse refuses it. A caller's reading of a refused spelling
therefore depends on which spellings the parse refuses. objects CR-013 asked for this to be recorded.

- **`Jsonix.Schema.XSD.Boolean.parse`** compares the text exactly with the six spellings: no whiteSpace collapse, no
  case folding. XSD 1.0 Part 2 gives `xs:boolean` `whiteSpace="collapse"`, so a conforming parser reads `" false"`
  as false. Word reads `" false"`, `"false "`, `FALSE` and every other spelling as on (core-ts CR-015 section 2).
  objects' `onInvalidValue` reaches Word's reading only because this parse refuses them.
- **`Jsonix.Model.EnumLeafInfo.parse`** is exact too (`entries.hasOwnProperty(text)`), so `" single"`, `"single "`
  and `Single` reach the callback as written.

So collapsing whitespace or folding case in either parse, for conformance or convenience, would silently change
how a caller relying on CR-010 reads Word documents. That is a change to this contract, to be agreed with objects
and core-ts first. It is guarded in three places:
- the comment above the comparison in `Boolean.parse` (all three copies);
- `tests/xsd.js` `Boolean`, which asserts that `" false"`, `"false "`, `" 0"`, `"0 "`, `" off"`, `FALSE`,
  `False`, `Off` and `00` are refused;
- `tests/invalidvalues.js` `EveryInexactSpellingReachesTheCallback`, which asserts the raw text of each of those
  kinds, boolean and enumeration, reaches `onInvalidValue`.
