# jsonix-CR-014: Declare the type of an element a wildcard holds: a per-call `wildcardTypeInfo`, on unmarshal and on marshal

**Status:** Implemented 2026-10-28 (section 9), version 3.11.0; W1 to W3 decided as recommended (Jason, 2026-10-28)
**Depends on:** nothing; 3.10.0 is the baseline
**Requested by:** `plutext/docx4j-generated-objects-ts` for its CR-018 (section 4.1, B1 (a) and B2 (a)). Jason, 2026-10-28:
"if it would be neater to ask for a jsonix change, we can do that". objects prototyped the hook by patching 3.10.0
(section 4.8).
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

A wildcard (`AnyElementPropertyInfo`: the content of `mc:Choice`, `mc:Fallback`, `w:pict`, an extension list, ...)
types each element it holds by the element's declaration, looked up by name in the class's scope and then globally.
An element whose type depends on where it appears is therefore typed by its global declaration, whatever its
surroundings. In WordprocessingML the global `w:sdt` is the block-level class `SdtBlock`. So a run-level content
control in a paragraph's `mc:Choice` is read as `SdtBlock`, its content as `SdtContentBlock`, and everything below by the
block-level lists. On save, a correctly typed `SdtRun` in the same place gets `xsi:type="w:CT_SdtRun"`, because the
runtime writes the value's class wherever it differs from the declaration.

This CR lets the caller answer that lookup first, through one per-call option on each side:

```js
var options = { wildcardTypeInfo: function (name, parent, propertyInfo, classInfo, elementOrValue) { ... } };
context.createUnmarshaller(options);
context.createMarshaller(options);
```

It returns the type info to declare for the element, or `undefined` for the runtime's own lookup. Unset, which is the
default, nothing is called and nothing changes.

## 2. Why

objects CR-018 types a content control in a kept branch at its host's level, which is what docx4j does (its CR-051
section 11.3, `McBranchSdt`: a `w:sdt` directly in a branch is bound by the kind its container asks for). The level is
known only from the ancestors, so it has to be decided where the runtime picks the type, before the element is read:
- **On read,** the type decides which lists read everything below. A run-level control read as `SdtBlock` holds its runs
  in a block-level content list, so objects' `textOf` leaves its text out ("before  after" where the same control
  outside a branch gives "before IN CONTROL after").
- **On save,** the declaration decides whether `xsi:type` is written. An `SdtRun` in a branch, as the right read gives
  it, is written with `xsi:type="w:CT_SdtRun"`, which Office never writes.

Without a hook, objects can get the same classes and output alone (its CR-018 section 4.2): retype the values in place
as each one closes, and remove the `xsi:type` after the runtime writes it. That works only because the four classes of
each family have the same properties, and because of the order the runtime writes in (section 7). The hook chooses the
type before anything is read or written, as docx4j does, so neither fact is needed.

## 3. Where the runtime decides (3.10.0)

Each side has one lookup for an element a wildcard holds, in the mixins `AnyElementPropertyInfo` shares with the other
element properties (`jsonix-factory.js`):
- **Unmarshal:** `Unmarshalls.Element.getTypeInfoByInputElement` (line 2064) resolves a source `xsi:type` when
  `supportXsiType` is on, and otherwise calls `getTypeInfoByElementName`, which is `context.getElementInfo(name, scope)`:
  the class's scoped declarations first, then the global ones. A known type gives a typed value; an unknown element
  stays DOM where the wildcard allows it.
- **Marshal:** `Marshalls.Element.AsElementRef.convertToTypedNamedValue` (line 1975) resolves the declared type through
  the same `getTypeInfoByElementName`. `marshalElement` (line 1934) then takes the value's own class
  (`getTypeInfoByValue`) when `supportXsiType` is on, writes it as `xsi:type` if it differs from the declared one, and
  marshals by it. With `supportXsiType` off, it marshals by the declared type.

The Unmarshaller and Marshaller themselves use the same mixins for the document root, with no scope.

Measured on objects' 104 modules at d4d34d2 (2,173 class infos):
- 32 classes have an `AnyElementPropertyInfo`. 29 of them allow typed objects; 3 keep DOM only.
- 77 element-reference lists also act as their class's wildcard. An element outside such a list is looked up through the
  same `context.getElementInfo` fallback (`AbstractElementRefsPropertyInfo.getTypeInfoByElementName`), and kept if found.
  objects CR-017 reports that case as a misplaced child.
- 17 element names have a global declaration whose type differs from at least one property's declaration of the same
  name. `w:sdt` is one (`SdtBlock` globally; `SdtRun`, `CTSdtRow` or `CTSdtCell` in the lists of a paragraph, a table and
  a row). The others include `w:ins` and `w:del` (`RunIns`/`RunDel` globally), `w:style`, `w:color`, chart and
  presentation names, and the `vt:` integer and date types. objects' answer covers `w:sdt` only. The hook itself is
  general.

## 4. Proposal

### 4.1 The option

```ts
// UnmarshalCallbacks
wildcardTypeInfo?(name: XML.QName, parent: Element, propertyInfo: PropertyInfo, classInfo: ClassInfo, element: Element): TypeInfo | null | undefined;
// MarshalCallbacks
wildcardTypeInfo?(name: XML.QName, parent: Element, propertyInfo: PropertyInfo, classInfo: ClassInfo, value: unknown): TypeInfo | null | undefined;
```

It is a per-call option on `createUnmarshaller(options)` and `createMarshaller(options)`, held on the derived context
like the other callbacks, so the shared context is never written. The arguments are the same on both sides, apart from
the last (W1):
- `name` is the element's name.
- `parent` is the element the wildcard's class is reading or writing, and so the element this one is, or will be, a
  child of. On unmarshal it is in the source document (`element.parentNode`). On marshal it is the open element in the
  output document (`output.peek()`), with its ancestors in place and its earlier children already written.
- `propertyInfo` is the wildcard property, and `classInfo` is its class (the scope).
- The last argument is the element itself on unmarshal, its attributes readable and its children unread; and the value
  on marshal, as `{ name, value }` gives it.

Because `parent` means the same on both sides, a function that decides by name and ancestry, as objects' does, can be
passed in one options object to both factories, as `onElement` can.

### 4.2 When it is called

Once for each element a wildcard holds, where its answer is used:
- **Unmarshal:** at the element's start, before its attributes or content are read. It is not called when `supportXsiType`
  is on and the element's `xsi:type` names a known type: the source's own statement of the type comes first (W2).
- **Marshal:** for each typed value, before `omitElement` and before the element is written. It is not called for a
  string in a mixed wildcard or for DOM content, which are written as they are.
- **Never** for a DOM-only wildcard (`allowTypedObject: false`), the document root, or the element properties that
  declare their own elements: element, elements, element map and element reference(s) (W3).

### 4.3 The answer

- `undefined` or `null`: the runtime's own lookup, as today.
- A type info: used as the element's declared type. On unmarshal the element is read by it, so it decides the class
  and every list below; an element the context does not declare is typed instead of being kept as DOM. On marshal it is
  the declared type: with `supportXsiType` on, `xsi:type` is written only where the value's class differs from it; with
  it off, the value is marshalled by it.
- Anything else throws `Type info for element [name] must be a Jsonix.Model.TypeInfo.` A type info is
  `context.getTypeInfoByName('org_docx4j_wml.SdtRun')`, or a built-in type such as `Jsonix.Schema.XSD.String.INSTANCE`.

The answer is not remembered. Each element is asked once, and nothing is written into the tree.

### 4.4 Order and the other callbacks

- **Unmarshal:** called before any callback for the element's attributes and content, so before its `onElement`.
  `onElement` reports the value with the class the answer gave. `onUnexpectedElement` is unaffected: a class with a
  wildcard never reports an element.
- **Marshal:** called before `omitElement`, which is given the type the element is about to be marshalled as: the
  value's class when `supportXsiType` is on, else the answer. Then the element and any `xsi:type` are written, then
  `onElement`.

### 4.5 Errors

A function that throws stops the call. On unmarshal the enclosing property read locates the error with the element, as
for any error there: `w:sdt (line 3): ...`. On marshal it is not located, as for the other marshal callbacks.

### 4.6 Unset

Unset, nothing changes: one property read per element a wildcard holds, on each side.

### 4.7 Sketch

Unmarshal: the declaration lookup in the shared mixin becomes a method of its own, which `AnyElementPropertyInfo`
overrides. The `xsi:type` branch is untouched.

```js
// Jsonix.Binding.Unmarshalls.Element
getTypeInfoByInputElement: function (context, input, scope) {
	// ... xsiTypeInfo as today ...
	var name = input.getName();
	var typeInfo = xsiTypeInfo ? xsiTypeInfo : this.getDeclaredTypeInfoByInputElement(name, context, input, scope);
	return typeInfo;
},
getDeclaredTypeInfoByInputElement: function (name, context, input, scope) {
	return this.getTypeInfoByElementName(name, context, scope);
},

// Jsonix.Model.AnyElementPropertyInfo
getDeclaredTypeInfoByInputElement: function (name, context, input, scope) {
	if (context.wildcardTypeInfo && this.allowTypedObject) {
		// jsonix-CR-014: the caller declares the type of an element the wildcard holds; undefined keeps the lookup.
		var typeInfo = this.checkWildcardTypeInfo(context.wildcardTypeInfo(name, input.node.parentNode, this, scope, input.node), name);
		if (typeInfo) {
			return typeInfo;
		}
	}
	return this.getTypeInfoByElementName(name, context, scope);
},
convertToTypedNamedValue: function (value, context, output, scope) {
	var typedNamedValue = Jsonix.Binding.Marshalls.Element.AsElementRef.prototype.convertToTypedNamedValue.apply(this, arguments);
	if (context.wildcardTypeInfo) {
		var typeInfo = this.checkWildcardTypeInfo(context.wildcardTypeInfo(typedNamedValue.name, output.peek(), this, scope, typedNamedValue.value), typedNamedValue.name);
		if (typeInfo) {
			typedNamedValue.typeInfo = typeInfo;
		}
	}
	return typedNamedValue;
},
checkWildcardTypeInfo: function (typeInfo, name) {
	if (Jsonix.Util.Type.exists(typeInfo) && !(typeInfo instanceof Jsonix.Model.TypeInfo)) {
		throw new Error("Type info for element [" + name.key + "] must be a Jsonix.Model.TypeInfo.");
	}
	return typeInfo;
},
```

`AnyElementPropertyInfo.Simplified` inherits both. `marshalElement`, `Jsonix.XML.Input` and `Jsonix.XML.Output` are
unchanged.

### 4.8 Prototype (objects, 2026-10-28)

objects patched `AnyElementPropertyInfo.prototype` in a scratch script with the same two changes. Its hook was given
the element on unmarshal and the parent on marshal, but its function started from the parent on both sides
(`input.node.parentNode` and `output.peek()`), so it is the function section 4.1 would call. It answers only for a `w:sdt` whose parent is
`mc:Choice` or `mc:Fallback`, with the class its host's level gives. It ran five forms: run, row and cell level, block
level, nested custom XML with a nested control, and a branch inside a branch's control, 40 calls in all. The results:
- the class the host's list gives, at every depth;
- `textOf`'s text back;
- no `xsi:type`;
- saves byte-identical to today's save of the same input, and stable when read and saved again.

I checked the shape in section 4.1 on a hand mapping of the same form. With the option set, the paragraph's branch
holds `SdtRun` and `SdtContentRun`, the save carries no `xsi:type`, a source `xsi:type` still wins, and a throw reads
`sdt (line 3): no`. Unset, the save of the same `SdtRun` carries `xsi:type="p0:SdtRun"`.

## 5. Decisions for Jason

Decided as recommended (Jason, 2026-10-28: "I have decided W1 to W3 as recommended, please implement it as 3.11.0").

objects replied the same day: the shape fits, and it has no objection to W1 to W3. Its function is unchanged under W1;
it needs only `mc:Choice` and `mc:Fallback` content, a typed `AnyElementPropertyInfo` (W3); and the order in section
4.4 suits it, since CR-017's read report runs in `onElement` and so sees the final class.

- **W1. The arguments.** I recommend `(name, parent, propertyInfo, classInfo, elementOrValue)` on both sides, as
  section 4.1 describes. objects asked for the element on unmarshal and the parent on marshal, in the same position. That
  carries the same information, but a function given to both factories would then have to know which side it is on,
  since the second argument would be the `w:sdt` on one side and its `mc:Choice` on the other. A third shape, the
  element itself on both sides, would need the marshal side to be asked after the element is written. By then the type
  has already decided whether the element can be written at all (an undeclared element with no class throws) and what
  `omitElement` is given. objects' walk starts from the parent, so W1 costs it nothing.
- **W2. A source `xsi:type`.** I recommend that it still comes first, and that the option is not called then. The
  option supplies the declaration, which is what `xsi:type` overrides. The marshal side behaves the same way: the
  value's class decides `xsi:type` against the answer. The alternative, the option first, is more general, since the
  caller sees every element and can read `xsi:type` from it. But then every caller that only means to supply a
  declaration has to test for the attribute, or it overrides the document's own statement of its type. objects doesn't
  mind either way: Office never writes `xsi:type`.
- **W3. Which properties.** I recommend `AnyElementPropertyInfo` only. That is objects' need, and it gives the smallest
  contract to guard. An element-reference list's fallback for an element outside its list (77 lists in objects'
  mappings) goes through the same global lookup and could be covered by the same option. But in a Word document such an
  element is misplaced, which objects CR-017 reports. Adding it later is additive: unset, nothing changes either way.

## 6. Out of scope

- **Keeping an element as DOM.** An answer can type an element, but it can't make a typed one DOM. Nobody has asked
  for that.
- **Remembering the answer in the tree.** The value's class is the record. On save, the same answer gives the same
  declaration, so the output is stable without one.
- **The document root, and the properties that declare their own elements** (section 4.2).

## 7. If declined

objects' fallback (its CR-018 section 4.2) removes the `xsi:type` in its composed marshal `onElement`. That depends on
`marshalElement` writing `xsi:type` before `typeInfo.marshal` runs, because `ClassInfo.marshal` calls `onElement` at its
top. That is 3.10.0's order: checked 2026-10-28, `onElement` sees `xsi:type="p0:SdtRun"` already on the `sdt`
element. It is not in the contract today. If this CR is declined, I would add it to CLAUDE.md's contract table, with a
test in `tests/callbacks.js`, so the order can't change unnoticed.

## 8. Implementation and tests (once W1 to W3 are decided)

- **Code.** Edit `nodejs/scripts/jsonix-factory.js` first. Then mirror the edit into
  `scripts/src/main/javascript/org/hisrc/jsonix/Jsonix/Binding/Unmarshalls.js`, `.../Jsonix/Model/AnyElementPropertyInfo.js`
  and `dist/Jsonix-all.js`. Check that the three copies agree with the vm-sandbox recipe.
- **Typings.** Add `wildcardTypeInfo` to `UnmarshalCallbacks` and `MarshalCallbacks` in `types/main.d.ts`, and its union
  to the Context's readonly options. Add a use in `tests/typescript/usage.ts` that passes one function to both
  factories, plus an `@ts-expect-error` for a wrong return type.
- **Contract.** Add a row to CLAUDE.md's contract table: called once per element an `AnyElementPropertyInfo` holds where
  a type is used, not when a source `xsi:type` resolves; the answer is the declared type on both sides.
- **Tests.** Add `tests/wildcardtypes.js`, on a hand-written mapping shaped like section 4.8's, registered in
  `tests/tests.js`. It covers:
  - the answer's class, and the lists below it;
  - `undefined` and `null` (today's lookup), and an answer for an undeclared element (typed, not DOM);
  - the arguments on each side;
  - a source `xsi:type` (not called, W2);
  - the marshal side with `supportXsiType` on and off, with and without `xsi:type`;
  - `omitElement` and `onElement` order;
  - the Simplified style;
  - a DOM-only wildcard, mixed strings and DOM content (not called);
  - a non-type-info answer;
  - a throw (located on unmarshal);
  - unset, with results identical to 3.10.0's.
- **Cost.** Measure unset and set against 3.10.0, one configuration per process.
- **Downstream check.** Before release, objects runs its CR-018 forms and its fidelity corpus with the option set and
  unset.
- **Version.** Release as 3.11.0, a minor version for a new option. objects' 0.7.0 waits on it under its B4 (a).

## 9. As implemented (2026-10-28)

As sections 4.1 to 4.7 describe, with W1 to W3 as recommended. The code is the sketch in section 4.7:
- `Unmarshalls.Element.getTypeInfoByInputElement` calls a new `getDeclaredTypeInfoByInputElement` where it called
  `getTypeInfoByElementName`. The mixin's own version is that lookup, so every other property, and the root, are
  unchanged.
- `AnyElementPropertyInfo` overrides it, and `convertToTypedNamedValue`, to ask the option. `checkWildcardTypeInfo`
  refuses an answer that is not a `Jsonix.Model.TypeInfo`.

`AnyElementPropertyInfo.Simplified` inherits all three. The same edit is in the modular sources
(`Jsonix/Binding/Unmarshalls.js`, `Jsonix/Model/AnyElementPropertyInfo.js`) and `dist/Jsonix-all.js`.

**One point the proposal left implicit.** On marshal, the answer is compared with the value's class by identity, as
any declared type is. A type info from another context, even for the same mapping, is therefore a different type, and
`xsi:type` is written. The typings say so, and a test shows it.

**Typings.** `wildcardTypeInfo` is on `UnmarshalCallbacks` (last argument `element: Element`) and `MarshalCallbacks`
(last argument `value: unknown`). Both return `TypeInfo | null | undefined`. The derived context's member is the union.
`tests/typescript/usage.ts` passes one function to both factories and uses the unmarshal side's element, and its
`@ts-expect-error` refuses a type name returned as a string.

**Tests.** `tests/wildcardtypes.js` has 18 tests and 67 assertions, on a hand-written mapping shaped like section 4.8's,
with a body, a paragraph, run- and block-level controls and their content lists, a branch, a DOM-only wildcard and a
mixed one. They cover:
- the answer's class and the lists below it, a nested control included;
- the arguments on each side; on marshal, the parent before the element is written;
- `undefined` and `null`, a body's branch left unanswered, an undeclared element typed, and a built-in type;
- a source `xsi:type`: not asked; asked when `supportXsiType` is off or the type is unknown;
- not asked for a DOM-only wildcard, mixed text, strings or DOM content;
- the order against `onElement` on both sides and `omitElement`;
- `xsi:type` written only where the value's class differs from the answer, and a type info from another context;
- `supportXsiType` off, where the answer decides what is marshalled;
- the Simplified style, both sides;
- an answer that is not a type info, and a throw: located on unmarshal (`t:sdt (line 3): no`), not on marshal;
- unset: the same tree and output as a function that always returns `undefined`, and the shared context not written.

Against 3.10.0 every test fails except the three that expect nothing to change. The full suite has 3,456 assertions.
Typecheck, ESM and bundle checks pass.

**The three copies agree.** The dist and modular copies, loaded as a browser loads them, give the npm copy's output on
five inputs (the calls with their arguments, `onElement` and `omitElement`, and the trees and output), with the option
set and unset, and with `supportXsiType` off.

**Cost.** Each configuration ran in its own process, three times, alternating. The document was 3,000 pretty-printed
paragraphs, read with objects' 104 modules. Each paragraph had four runs and an `mc:AlternateContent` whose `mc:Choice`
held a run-level `w:sdt` and whose `mc:Fallback` held a run, so a wildcard held 6,000 elements. The function set was
objects' rule: a name test, then a walk past the `mc:` ancestors. Median of 20 rounds, unmarshal and marshal in ms:

| Runtime | Unmarshal | Marshal |
|---|---|---|
| 3.10.0 | 310, 352, 341 | 251, 293, 269 |
| unset | 304, 339, 337 | 249, 281, 283 |
| set (12,000 calls a round) | 331, 293, 297 | 265, 266, 270 |

All three are within the machine's noise. With the option set, the controls read as `SdtRun`, and the save has no
`xsi:type`.

**Downstream check.** objects tested the checkout on 2026-10-28, with `jsonix-factory.js` at sha256
`906bc9f2a9b4254c58975a42aac38c6f76b1867db6c926b24ccfdc36ebc7061d` (the installed copy matched). It used a scratch
worktree of objects d4d34d2, with its CR-018 answer wired into the facade's options on both sides. The answer starts from
`parent`, and looks the class up on the context in use.
- **CR-018's forms:** run level (with nested custom XML and a nested control), row, cell (with a block-level control in
  its cell), block, a branch inside a run-level branch's control, and a control below a paragraph inside a branch.
  - Every class is the one its host's list gives.
  - `textOf` gives "before IN CONTROL NESTED after" and "DEEP" (3.10.0: "before  after" and "").
  - There is no CR-017 report and no `xsi:type`.
  - Every save is byte-identical to 3.10.0's save of the same input, and stable when read and saved again.
  - A row-level control pushed into a paragraph's branch is written with `xsi:type`, as it should be.
- **The fidelity corpus:** all 341 hash lines (333 parts marshalled) are identical to 3.10.0's with the option unset,
  and again with the answer set.
- **objects' full suite and typecheck:** pass both ways.

objects' own snag is not the runtime's: `npm install --no-save` of the checkout pruned `@xmldom/xmldom`, which five of
objects' tests import without declaring it.
