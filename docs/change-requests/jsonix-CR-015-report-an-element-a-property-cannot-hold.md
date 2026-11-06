# jsonix-CR-015: An element a property can neither type nor hold as DOM is skipped and reported when the caller set `onUnexpectedElement`

**Status:** Implemented 2026-11-06 (section 9), version 3.12.0; U1 to U3 decided as recommended (Jason, 2026-11-06)
**Depends on:** nothing; 3.11.0 is the baseline
**Requested by:** `plutext/docx4j-core-ts` for its CR-026 D2 (sections 1, 2 and 3.1, at core-ts `5c75758`, local). Jason,
2026-11-05, relayed by the core-ts session: "commit, then instruct the jsonix agent to write the CR". The request is for
the CR, not the implementation.
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

Whether an unknown element fails a whole read depends on how its parent class is mapped. A class of named properties
skips the element and calls `onUnexpectedElement`. A class whose content is a list marked `allowDom: false` hands it to
the list, and the list throws, callback or no callback. In objects' WordprocessingML that covers `w:body`, `w:p`, `w:r`,
`w:tbl` and `w:tc`, so one unknown element leaves the part unreadable.

This CR makes the list do what the class does:

```js
context.createUnmarshaller({ onUnexpectedElement: function (name, node, classInfo) { ... } });
```

With the callback set, the element is reported and skipped, and the read goes on. Unset, the same error is thrown. The
document root keeps its error either way.

Measuring this found two more ways an unknown child fails a read, neither of which CR-026 first tried and neither of
which goes through this branch: a class with no element or value content (852 of 2,173 classes, among them `w:jc`, `w:b`
and `w:br`) and a class with a text value (23 classes, among them `w:t`). U2 and U3 asked whether this CR takes them: it takes the first and leaves the second.

## 2. Why

core-ts measured two unknown elements in each of 32 WordprocessingML hosts, at 3.11.0 and objects 0.7.0 (its CR-026
section 1). 20 hosts throw and 12 skip, with the same elements. An element whose namespace is in `mc:Ignorable`, the one
case markup compatibility says a consumer must get past, fails like any other. docx4j, docx4j-python and Word 365 read such
a document.

Of the three routes core-ts compared, it chose this one (D2): route A, keeping the element as DOM, crashes a reader on a
DOM node in `content` in 16 of the 34 cases that fail today; route C, a DOM pass over `mc:Ignorable`, can't read `w:madeUp`.
Its prototype wrapped each property's `unmarshalElement` in memory, which sidestepped the questions section 4 settles.

core-ts needs its CR-025 to land first, so that a loud refusal doesn't become a silent loss. This CR doesn't have to wait
for that: core-ts's source sets no `onUnexpectedElement` today, so raising its floor changes nothing there until CR-025
asks.

## 3. Where the runtime decides (3.11.0)

Line numbers are `jsonix-factory.js`.

- **The class's branch** (line 2403). `ClassInfo.unmarshal` looks the element up in `structure.elements`, then
  `structure.any`. With neither, it calls `onUnexpectedElement` and `input.skipElement()`.
- **The refusing branch** (line 2055). `AbstractElementRefsPropertyInfo` and `AnyElementPropertyInfo` set
  `structure.any = this` when they allow DOM or typed objects (lines 3719, 3967), so a class with such a property never
  reaches its own branch. The element goes to `Unmarshalls.Element.unmarshalElement`. With no type info and `allowDom`
  false, that throws.

So "a class with an `any` wildcard" has meant two things. A wildcard that holds DOM keeps the element, and has nothing to
report. One that can't fails the read, and the contract's "never for a class with an `any` wildcard" holds for it only
because the throw comes first.

Measured on objects 0.7.0's mappings: each of the 2,173 class infos read
`<host><ext:opaque a="1"><ext:deep>t</ext:deep>words</ext:opaque><ext:other/></host>`, with the callback set.

| Class | Classes | 3.11.0 | This CR |
|---|---|---|---|
| Named properties, no `any` | 1,168 | Reports both, skips | Unchanged |
| A wildcard that keeps DOM | 20 | Keeps both, no report | Unchanged |
| A list or wildcard with `allowDom: false` | 110 (19 modules, 35 in `org_docx4j_wml`) | Throws `could not be unmarshalled as is not known in this context ...` | Reports both, skips |
| No element or value content | 852 (67 modules, 240 of `org_docx4j_wml`'s 385) | Throws `Illegal state: must be END_ELEMENT.` | Reports both, skips (U2) |
| A value | 23 (11 modules, 2 in `org_docx4j_wml`) | Throws `Element text content may not contain START_ELEMENT.` | Unchanged (U3) |

The 110 classes come from core-ts's 94 properties (72 element-reference lists, 7 single element references, 15 wildcards),
with derived classes inheriting the list. The 852 include 62 classes with no properties at all. A simple-typed element
property fails as a value class does: 183 of the 4,044 `ElementPropertyInfo`, 1 in `org_docx4j_wml`.

Through a real document, read by the runtime directly (objects' context, none of core-ts's load path), with the callback
set:

| Host | 3.11.0 with this CR's branch |
|---|---|
| `w:p` | Read, reported against `P` |
| `w:jc`, `w:b`, `w:br`, `w:tab` in a run | `ext:opaque (line 1): Illegal state: must be END_ELEMENT.` |
| `w:t`, `w:instrText` | `ext:opaque (line 1): Element text content may not contain START_ELEMENT.` |

core-ts's load path differs at the last row: its CR-021 pass (`src/opc/repair/breaks.mts`) runs before the runtime and takes
any element out of a `w:t`, `w:instrText`, `w:delText` or `w:delInstrText`, so the runtime never sees one. Its `w:b`, `w:br`,
`w:jc` and `w:tab` fail the part as above, and docx4j 17.3.5 reads all of these, dropping the element (core-ts's CR-026
section 1, measured 2026-11-05).

Word 365, from core-ts's check 76 (CR-026 sections 4.1 to 4.4, at `80a4707`, local, with round 6 in its working tree; its saves
and PDFs are in `test/check76/`):

| Case | Word 365 |
|---|---|
| An ignorable element in `w:sdtPr`, `w:p`, `w:r`, `w:tc` (`76a` to `76d`) | No message; the element gone |
| An ignorable element in a `w:b` (`76l`) | No message; `<w:b/>`, the text bold |
| An ignorable element or `w:madeUp` in a `w:t`, empty or holding text (`76m`, `76n`, `76u`) | No message; `TARGET TEXT`, the text around it joined and what it held gone |
| A foreign element that isn't ignorable, in all seven hosts tried, `w:b` and `w:t` among them (`76e`, `76o` to `76s`, `76v`) | Could not repair the file |
| `w:madeUp` in a content host, holding what the host admits, in all twenty tried (`76t`, `w:body`, `w:tc`, `w:tr` and others; CR-026 section 4.4) | The tags gone and **what it held read** |
| `w:madeUp` holding a property, in `w:pPr` or `w:rPr` (`76t5`, `76t6`) | No message; gone with all it holds, as in a `w:t` |
| `w:madeUp` holding a run, in `w:pPr` (`76t27`) | No message; the words read, at the head of the paragraph |
| `w:madeUp` holding a run, in `w:rPr` (`76t28`) | Refused the file |

Section 4 doesn't depend on any of this. The runtime holds no Word rules: it reads a file Word refuses as it reads one Word
accepts, as the class's own branch does today (`76p`), and core-ts reports such a file rather than refusing it (its D3).
Sections 5 and 6 say what Word's readings mean for U2, U3 and the last four rows.

## 4. Proposal

core-ts asked this CR to settle five things:

| Question | Answer | Section |
|---|---|---|
| The input's position after the skip | On the skipped element's END_ELEMENT, where a typed read leaves it; no loop changes | 4.2 |
| Which class info the callback receives | `scope`, confirmed: the class being read, as in the class's own branch | 4.3 |
| The sibling throw ("neither allows typed objects nor DOM") | Stays | 4.5 |
| Other paths to the branch | Wrappers work. The document root also reaches it, and has to be excluded | 4.4 |
| The note in `types/main.d.ts` | Two notes change, and the CLAUDE.md contract row | 4.9 |

### 4.1 The change

In `Unmarshalls.Element.unmarshalElement`, where `allowTypedObject` is on, no type info is found and `allowDom` is false:
- **From a property, with `onUnexpectedElement` set:** call `context.onUnexpectedElement(name, input.node, scope)`, then
  `input.skipElement()`, and return without calling `callback`.
- **Otherwise:** throw exactly as today.

The element is dropped with all it holds, and nothing keeps it. core-ts's save handles that through its CR-025. Word doesn't
always drop what it holds (section 6).

### 4.2 Where the input stands afterwards

On the skipped element's END_ELEMENT. `skipElement` stops there. `typeInfo.unmarshal` and `input.getElement()` leave the
input in the same place, so both loops that can call the branch go on unchanged, each with its `et = input.next()`:
`ClassInfo.unmarshal`'s (through `unmarshalProperty`) and `unmarshalWrapperElement`'s.

Not calling `callback` is what leaves the property alone. The property's `unmarshal` returns `null`, and
`PropertyInfo.setProperty` ignores that. So a list holding only skipped elements stays unset, not `[]`, as a class's
unknown child leaves it. A single-valued property can't meet `Value already set.`

Measured: in `<body><p id="1"/><ext:o><p id="in"/>t<ext:deep/></ext:o><p id="2"/><ext:o2/><p id="3"/></body>` the list
holds 1, 2 and 3, and `o` and `o2` are reported. In the census, all 110 classes reported both elements and ended with the
input on the host's END_ELEMENT.

### 4.3 Which class info

`scope`. `ClassInfo.unmarshalProperty` passes `this` to `propertyInfo.unmarshal`, and it reaches `unmarshalElement`
unchanged, so it is the object the class's own branch passes.

That is the class being read, not the class declaring the property. Where a base type declares the list, the callback
gets the derived class, through a declared element or through `xsi:type`. Measured on a hand mapping, and in the census,
where the callback's class was the class read in all 110.

### 4.4 What reaches the branch

| Path | Reaches it | Under this CR |
|---|---|---|
| An element-reference list or wildcard, through `structure.any` | Yes: core-ts's 94 properties | Reported and skipped |
| A wrapper element, through `unmarshalWrapperElement` | Yes, for an element-reference list or `ElementsPropertyInfo`, on a child the list doesn't declare | Reported and skipped; `classInfo` is the property's owner and `node.parentNode` the wrapper. Objects' mappings have no wrappers |
| `ElementsPropertyInfo` without a wrapper | No: it sets no `structure.any`, so only its declared names arrive | Nothing changes |
| `ElementPropertyInfo`, `ElementMapPropertyInfo` | No: each always has a type (its own, or the entry type) | Nothing changes |
| **The document root** | **Yes:** `Jsonix.Binding.Unmarshaller` mixes in `Unmarshalls.Element`, with `allowDom: false` | **Keeps the throw** |

The root is the one path that must not change, and a plain test of the callback gets it wrong. Measured with only
`context.onUnexpectedElement` as the guard: an unknown root is reported with `classInfo` undefined, and `unmarshalString`
returns `null`. A caller expecting a document gets nothing, and no class dropped the element. Testing `scope` isn't enough
either, since `unmarshalDocument(doc, scope)` is public: measured with a class passed there, the root is reported and
`null` returned.

So the mixin gets a flag beside `allowTypedObject` and `allowDom`, which `Unmarshaller` already re-declares (lines 2136,
2137): `canSkipUnknownElement`, true in the mixin and false in `Unmarshaller`. `Unmarshaller.Simplified` inherits it.

### 4.5 The sibling throw stays

"Neither allows typed objects nor DOM" (line 2060) is unchanged:
- It is about the mapping, not the element. Its own message says so.
- It fires for a name the list declares. Such a list doesn't set `structure.any`, so an unknown name goes to the class's
  own branch, and is reported, already. Measured on 3.11.0: `<bad><ext:o/></bad>` reports `o`, and `<bad><p/></bad>` throws.
- Reporting it would turn a faulty mapping into every element of a list silently dropped.

Objects' mappings have no such property.

### 4.6 Order and the other callbacks

| With | Behaviour |
|---|---|
| `onUnexpectedText` | Text inside the skipped element is not reported, as for any reported element. Calls come in document order |
| `onElement` | Not called for the skipped element, which was never read as a typed object. The parent's call comes after, as always |
| `wildcardTypeInfo` | Asked first, in `getDeclaredTypeInfoByInputElement`. A type info types the element, with no report. `undefined` or `null` reaches this branch |
| A source `xsi:type` | A known type types the element, which is kept, as today. An unknown type reaches this branch. An unbound prefix still fails, in `getTypeInfoByInputElement`, before it (`Prefix [zz] of the QName [zz:Nope] is not bound in this context.`) |
| `parentPointers` | Unaffected: the skipped element is never pushed |
| A mixed list | The text either side stays: `a<ext:o>inner</ext:o>b` reads `['a', 'b']` |
| The Simplified style | The same, from the same mixin |

All measured on a hand mapping.

### 4.7 Errors

A throw from the callback is located by `unmarshalProperty`, which is how a caller refuses: `ext:o (line 1): refused`.
The class's own branch sits outside that `try`, so there the enclosing property read locates it, which leaves one
difference: a throw for a direct child of the root element is bare (`refused`) in the class's branch and located in this
one. Neither changes the other.

### 4.8 Unset

Nothing changes: the same message, located the same way. The new test is on a path that is about to throw, so the normal
read pays nothing.

### 4.9 Typings and contract

`types/main.d.ts`, the note on `UnmarshalCallbacks`:

```ts
/**
 * Callbacks an unmarshaller reports dropped content through (jsonix-CR-006). Lax reading is the
 * default and stays so: these tell you what it dropped. One changes the read: with
 * `onUnexpectedElement` set, an element a property can neither type nor keep as DOM is reported and
 * skipped instead of failing the unmarshal (jsonix-CR-015). Not a validator: a wildcard that keeps
 * an unknown element or attribute reports none.
 */
```

and on `onUnexpectedElement`:

```ts
/**
 * An element the class info did not expect is skipped. That includes an element a list or wildcard
 * property can neither type nor keep as DOM (`allowDom: false`), which fails the unmarshal when
 * this is unset (jsonix-CR-015); an unknown document root always fails. `node` is the DOM element
 * the input stands on; in Node (xmldom) it carries `lineNumber` and `columnNumber`, in browsers
 * not. `classInfo` is the class being read, which is the derived class where a base type declares
 * the property. To refuse the element, throw: the error is located.
 */
```

CLAUDE.md's contract row: "`onUnexpectedElement` fires at the element skip and never for a class with an `any` wildcard"
becomes "fires at the element skip, and where a list or wildcard property can neither type the element nor hold it as DOM,
where it replaces a throw (the document root keeps the throw); never for an element a wildcard keeps". The same section's
"wildcards keep elements and attributes and report nothing" narrows to wildcards that can keep them.
`tests/callbacks.js`'s "a class with an any wildcard keeps the element" stands: its wildcard allows DOM.

### 4.10 Sketch

```js
// Jsonix.Binding.Unmarshalls.Element
canSkipUnknownElement: true,
// ... in unmarshalElement:
} else if (this.allowDom) {
	elementValue = input.getElement();
} else if (this.canSkipUnknownElement && context.onUnexpectedElement) {
	// jsonix-CR-015: the element is dropped, as in ClassInfo.unmarshal's own branch; the input ends on its END_ELEMENT.
	context.onUnexpectedElement(name, input.node, scope);
	input.skipElement();
	return;
} else {
	throw new Error("Element [" + name.toString() + "] could not be unmarshalled as is not known in this context and the property does not allow DOM content.");
}

// Jsonix.Binding.Unmarshaller
canSkipUnknownElement: false,
```

Under U2 (a), `ClassInfo.unmarshal`'s site C (CR-013's loop, line 2433) becomes:

```js
} else if (context.onUnexpectedText || context.onUnexpectedElement) {
	// jsonix-CR-013, jsonix-CR-015: skip as nextTag does, reporting what it skips.
	var skippedEventType = input.next();
	while (skippedEventType !== Jsonix.XML.Input.END_ELEMENT) {
		if (skippedEventType === Jsonix.XML.Input.START_ELEMENT) {
			if (!context.onUnexpectedElement) {
				break; // the assertion below throws, as today
			}
			context.onUnexpectedElement(input.getName(), input.node, this);
			input.skipElement();
		} else if (skippedEventType === Jsonix.XML.Input.CHARACTERS || skippedEventType === Jsonix.XML.Input.CDATA || skippedEventType === Jsonix.XML.Input.SPACE) {
			if (context.onUnexpectedText) {
				this.reportUnexpectedText(context, input);
			}
		} else if (skippedEventType !== Jsonix.XML.Input.COMMENT && skippedEventType !== Jsonix.XML.Input.PROCESSING_INSTRUCTION && skippedEventType !== Jsonix.XML.Input.START_DOCUMENT) {
			throw new Error('Expected start or end tag.');
		}
		skippedEventType = input.next();
	}
} else {
	input.nextTag();
}
```

### 4.11 Prototype (2026-11-05)

Both sketches, applied to copies of the 3.11.0 factory outside this repository, with objects 0.7.0's mappings over them.

| Callback set | 3.11.0 | Section 4.10's branch | With U2 (a) |
|---|---|---|---|
| Reported | 1,168 | 1,278 | 2,130 |
| Kept | 20 | 20 | 20 |
| Throws, not known | 110 | 0 | 0 |
| Throws, must be END_ELEMENT | 852 | 852 | 0 |
| Throws, text content | 23 | 23 | 23 |

Every class that reported both elements ended with the input on the host's END_ELEMENT and named the class read. With the
callback unset, each row's count was 3.11.0's.

Under U2 (a), `<p id="1">x<ext:o>inner</ext:o>z<!-- c --><ext:q/>w</p><p id="2"/>` reads both paragraphs and reports x, o,
z, q and w in that order. With only `onUnexpectedText` set, or neither, it throws as today.

The existing suite gives the same result on both copies as on an unpatched copy: everything passes except the three
`Strict` tests, which scan paths outside the copied directory and fail the same way unpatched. In the repository,
unpatched, all 3,456 assertions pass.

These are class-level reads, so they cover every module, which core-ts's prototype didn't. They are not reads of real
packages in those modules: that is section 8's downstream check.

## 5. Decisions for Jason

Decided as recommended (Jason, 2026-11-06: "CR-015 recommendations on U1 to U3 accepted. please commit then start
implementing"): U1 the callback itself, U2 (a), U3 (a).

- **U1. The gate.** I recommend the callback itself, as CR-026 section 3.1 says. It has one consequence that section
  doesn't state: "a caller who hasn't asked sees no change" means a caller without the callback. A caller who set it to
  watch a read gets a report where it got a throw. It is the first time a reporting callback changes whether a read
  succeeds, and the `UnmarshalCallbacks` note ("these only tell you what it dropped") has to change.
  Nothing goes quiet, because every lost element is reported, and a caller can restore the refusal by throwing from the
  callback (section 4.7). The only setters in core-ts, objects and the editor are objects' tests. `smoke.mjs` expects
  nothing for a clean part and `sectPr` from `w:document`'s own branch, neither of which changes. `fidelity.mjs` sets it on
  `[resolved]` runs and has no recorded `throws` entry, so a throw there is a failure today and a classified element
  afterwards, which its check before release will show. The alternative is a separate
  option, say `skipUnknownElements`, which keeps the callback a pure report at the cost of a second thing to set and a
  third state to test (the option without the callback).

- **U2. Classes with no element or value content.** (a) This CR skips and reports there too, or (b) they keep the throw.
  I recommend (a).
  - It is the same defect: the outcome still depends on how the parent is mapped, and CR-026's title ("no longer fails its
    part") holds only for hosts with element content. 852 classes, 240 of `org_docx4j_wml`'s 385, would still fail with the
    callback set.
  - CR-006 section 9 anticipated it: "A follow-up could make the element-less branch skip and report children like the
    elements loop does; it is a lax-ification of an error path, so it is proposed separately." This would be that proposal.
  - The change is small, since site C already walks these events for CR-013 (section 4.10), and the prototype takes all
    852 with no change to any other row.
  - core-ts has since measured these hosts through its load path: `w:b`, `w:br`, `w:jc` and `w:tab` fail the part, where
    docx4j 17.3.5 reads them. Its CR-026 section 3.4 says its title holds only if the answer here is (a).
  - Word reads past an ignorable child of `w:b` (`76l`, section 3), which is the reading this gives. That is one host of the
    852.
  - Against: it is beyond what core-ts first asked, and nobody has met it in a file (none of core-ts's 720 packages holds an
    unknown element in any host). Word's reading holds for ignorable content, not every child: it could not repair `76s`,
    the same element in a namespace that isn't ignorable, and this reads that file. It also retires a sentence of CLAUDE.md's
    contract row, and the advice in CR-006 section 9 to translate a located throw.
  - Under (b) nothing is lost but time, since it is additive: a later CR and a second floor raise. Until then those hosts
    fail their part, and CR-026 has to narrow its title.

- **U3. Classes with a value, and simple-typed elements.** (a) They keep the throw, or (b) this CR skips the element with all
  it holds and joins the text around it. I recommend (a), for a narrower reason than this CR first gave.
  - Check 76 removes the argument this led with. `<w:t>hi<ext:opaque/> there</w:t>` reading "hi there" does change a value,
    and it is Word's reading: with an ignorable element or `w:madeUp`, empty or holding text, Word joins the text around it
    and loses what it held (`76m`, `76n`, `76u`).
  - But that is measured where nobody needs (b). At `w:t`, `w:instrText`, `w:delText` and `w:delInstrText` core-ts's CR-021
    pass acts first (section 3), and since `33bae48` it drops such an element with all it holds, as Word does. Those four
    are 2 of the 23 value classes.
  - What (b) would add is unmeasured: the other 21 classes (`m:t` and a SpreadsheetML cell formula among them) and the 183
    simple-typed properties. 5 of the 23 and 80 of the 183 hold no string but a number, date, boolean, enumeration or binary,
    where `1<ext:o/>2` would read as 12.
  - Even in a `w:t`, the reading depends on the element. Word honours a `w:br` and a nested `w:t` there (core-ts's CR-021
    section 11), and could not repair a file with one that isn't ignorable (`76v`) or is in no namespace (`76x`, `76y`).
    core-ts's pass tells these apart. The runtime holds no Word rules, so (b) would drop them all alike.
  - The throw is in `Input.getElementText`, which every simple type shares and which has no class or callback in hand, so
    this is a larger change, touching the most common element in a document.
  - The failure stays located, and 3.11.0's: `ext:opaque (line 1): Element text content may not contain START_ELEMENT.`
  - Under (a) nothing is lost but time, since (b) is additive: a later CR can take a class once its reading is measured. Until
    then the four text elements stay refused for a direct `unmarshalString`, and every other value class and simple-typed
    element property refuses in both.

## 6. Out of scope

- **Keeping the element** (CR-026 D1). This CR drops it.
- **An unknown document root,** which keeps its error (section 4.4).
- **An unbound prefix in an unknown element's `xsi:type`** (section 4.6). The class's own branch doesn't read `xsi:type`, so
  there such an element is reported. Nobody has asked for the two to agree.
- **An element-reference list with a wrapper, meeting an unknown child outside it.** `structure.any` sends that element to
  the property, which reads it as if it were the wrapper: its children join the list and nothing is reported. That is
  3.11.0's behaviour with the callback set or unset, and it stays. Objects' mappings have no wrappers.
- **Reading what a skipped element holds.** `onUnexpectedElement`'s return value is ignored, so a caller can't ask the runtime
  to read the element's children in its place, and the class's own branch has never descended either. Word does that for an
  unknown `w:` element in twenty content hosts, but not for a property in `w:pPr` or `w:rPr` or anything in a `w:t`, and a run
  in `w:pPr` is read where one in `w:rPr` has the file refused (section 3). core-ts has decided to read as Word does in those
  twenty (its D7, 2026-11-06), with a DOM pass ahead of the runtime (its CR-026 section 3.7), and its D8, the same day, has
  that pass take the `w:pPr` run. Neither asks anything of this CR. Everything else still comes here: a foreign element, and
  an unknown `w:` element in a host that pass doesn't list, which goes with all it holds.
- **`mc:MustUnderstand` and `mc:ProcessContent`,** which belong above the runtime (CR-026 section 3.5).
- **The marshal side.** A skipped element isn't in the tree.

## 7. If declined

core-ts is left with its other routes (CR-026 section 2): A costs a reader audit and still drops 18 of its 52 cases; C can't
read `w:madeUp` or a newer `w14:` element. Its prototype's wrapper reads everything, but patches 4,187 properties on a shared
context, and has the root and position problems this CR settles.

## 8. Implementation and tests (once U1 to U3 are decided)

- **Code.** Edit `nodejs/scripts/jsonix-factory.js` first. Then mirror it into
  `scripts/src/main/javascript/org/hisrc/jsonix/Jsonix/Binding/Unmarshalls.js`, `.../Jsonix/Binding/Unmarshaller.js`,
  `.../Jsonix/Model/ClassInfo.js` (under U2 (a)) and `dist/Jsonix-all.js`. Check that the three copies agree with the
  vm-sandbox recipe.
- **Typings and contract.** Section 4.9. Under U2 (a), drop the attributes-only sentence from the contract row and say the
  same in the `onUnexpectedElement` note. Add a use to `tests/typescript/usage.ts` only if the signature changes, which it
  doesn't under U1 as recommended.
- **Tests.** Add `tests/unknownelements.js`, on a hand-written mapping, registered in `tests/tests.js`. It covers:
  - the position: known siblings after a skipped element with children, two in a row, one first and one last;
  - unset: the same message, located the same way;
  - the class: declared on a base type, through a declared element and through `xsi:type`;
  - an element-reference list, a single reference, a typed wildcard, a mixed list and a wrapper of each kind;
  - a list holding only skipped elements staying unset;
  - the root: still throwing with the callback set, with and without `scope`;
  - the sibling throw, for a declared name, and the class's branch for an unknown one;
  - `onUnexpectedText` inside and around, `onElement`, `parentPointers`, and `wildcardTypeInfo` answering and not;
  - `xsi:type`: known, unknown, and an unbound prefix;
  - a throw from the callback, located;
  - the Simplified style;
  - under U2 (a): text, comments and elements interleaved, each callback alone, neither, and a class with no properties.
- **Cost.** The branch is off the normal path. Under U2 (a), site C's loop also runs when only `onUnexpectedElement` is set,
  on every element with no content, so measure that against 3.11.0, one configuration per process.
- **Downstream check.** Before release, core-ts reads its 52 files and the DrawingML and SpreadsheetML hosts of its section
  5, and objects runs its fidelity corpus and full suite, with the callback set and unset.
- **Version.** Release as 3.12.0, a minor version: a caller with the callback set sees new behaviour (U1). core-ts then
  raises its floor (CR-026 phase 1).

## 9. As implemented (2026-11-06)

As sections 4.1 to 4.10 describe, with U1 to U3 as recommended. Section 8's downstream check passed, below, and it was released as 3.12.0.
- `Unmarshalls.Element` gains `canSkipUnknownElement: true` and section 4.10's branch. `Jsonix.Binding.Unmarshaller` sets the
  flag false, and `Unmarshaller.Simplified` inherits that.
- `ClassInfo.unmarshal`'s no-content skip is section 4.10's loop, under
  `context.onUnexpectedText || context.onUnexpectedElement`.

The same edit is in the modular sources (`Jsonix/Binding/Unmarshalls.js`, `Jsonix/Binding/Unmarshaller.js`,
`Jsonix/Model/ClassInfo.js`) and `dist/Jsonix-all.js`.

**Typings and contract.** Section 4.9's notes, widened for U2: `onUnexpectedElement`'s names both cases, the two throws that
stay, and the one place a throw from the callback isn't located. CLAUDE.md's contract row and per-call paragraph follow,
and CR-013's row, whose `nextTag` skip now runs as before only when neither callback is set. Both READMEs say so, and
CR-006 section 9 points here. `tests/typescript/usage.ts` is unchanged: no signature changed.

**Tests.** `tests/unknownelements.js` has 39 tests and 78 assertions, on a hand-written mapping, covering section 8's list.
It adds U3's guards: a value class and a simple-typed element, of a number and of a string, keep their throw with the
callback set and don't call it. Against 3.11.0, 23 tests fail, and the 16 that pass are those expecting nothing to change.
Setting the root's flag true fails all three root tests. The full suite has 3,534 assertions. Typecheck, ESM and bundle
checks pass.

**The three copies agree.** The dist and modular copies, loaded as a browser loads them, give the npm copy's output on 378
cases: 27 documents, 7 sets of options, both styles, with 72 of each style's 189 reads reporting and 92 throwing.

**Census.** Section 4.11's run, on this code and objects 0.7.0's 2,173 class infos: 2,130 report both elements, 20 keep them,
and 23 throw the text error. Every class that reported ended with the input on the host's END_ELEMENT and named the class
read. Unset, every row is 3.11.0's. So the prototype's numbers hold.

**Cost.** Not measurable. 20 paragraphs of 400 runs, each run holding five elements of classes with no content, read from a
parsed DOM: the median of 7 processes, one configuration each, each the median of 25 reads.

| | 3.11.0 | This CR | Change |
|---|---|---|---|
| Unset | 115.0 ms | 112.3 ms | -2.3% |
| `onUnexpectedElement` set | 113.4 ms | 114.6 ms | +1.1% |

All 28 runs fall between 108.5 and 118.0 ms.

**Downstream check.** Against the checkout, `jsonix-factory.js` at sha256
`c8070eaac0248985f8d964ca90baf84095e195d36249cc2c6fffa248f81d34c9`.

objects passed on 2026-11-06, in a scratch copy of its `93511a0`, on Node 22, with 3.11.0 run the same way as the baseline:
- `npm test`, typecheck and `test/fidelity.mjs` (359 checks) give output identical to 3.11.0's, and all 341 marshal hashes match.
- All 529 fixture parts, read unset, set and set with `onMisplaced`: none of the 1,587 cases differs. With the callback set, no
  element is reported on either runtime, and the same 8 parts throw on both, all at the document root.
- 12 synthetic hosts, an unknown element holding a child: unset is identical. Set, 11 go from a throw to a read, reported and
  dropped (`w:body`, `w:p`, `w:r`, `w:tbl`, `w:tr`, `w:tc`, `w:sdtContent`, `w:hdr`, `w:comment`, `w:b`, `w:jc`), and the root
  still throws.
- `onMisplaced` without `onUnexpectedElement` is identical, which covers `onUnexpectedText` alone through the no-content skip.

Its corpus holds no unknown element, so what the callback changes shows only in those hosts. By reading `test/fidelity.mjs`,
a throw that becomes a read reaches its classifier, which accepts only elements already in `LOST_ON_RESOLUTION`. objects'
`src/index.mts` and README say these options report what the model dropped, which stays true but no longer says all they do.
The fix goes in the objects release that raises its floor, since it holds only from there.

core-ts passed on 2026-11-06, with 3.11.0 as locked for the baseline, one configuration per process, attaching the callback by
wrapping `createUnmarshaller`:
- **Unset, nothing moved.** 1,001 real packages, 15,679 saved entries, every hash 3.11.0's; 80 hosts by 3 elements through the
  facade; and 119 files (CR-026's 52, 12 further, check 76's 55).
- **Set, no false report.** The same hashes, with `onUnexpectedElement` alone and with all three callbacks, and the reports are
  3.11.0's exactly: 0 elements, 17 attributes, 1 text. So U2's loop reports nothing new on real content.
- **Set, the change works.** 228 of the 240 host cases read as the same document without the element, each reported once, and
  the other 12 (`w:t`, `w:instrText`, `a:t`, `x:v`) throw as U3 decided. All 119 files read, where 77 failed on 3.11.0.
  Through the real load path, 60 cases in docx, pptx and xlsx parts read, each reported once, with the saved part equal to its
  control's, and all 60 fail unset.
- **Injected into real parts.** 6,384 parts up to 400 KB, all 1,555 parent and child pairs met, an unknown element first, middle
  and last: 5,364 trials, each held to the part without it. 1,866 throw on 3.11.0 and are clean here, reported once and
  marshalling equal to the part's own. 2,862 are clean on both, 484 kept by a wildcard on both, 140 throw on both (19 hosts
  holding text, U3), and 12 are the same on both. Every trial that changed went from a throw to clean.
- `npm test`, 1,813 of 1,813, and typecheck pass on the checkout.

core-ts's run on the published package comes when it raises its floor. That raise needs an objects release, since core-ts gets
this package through objects, whose `^3.11.0` admits 3.12.0 without requiring it.

**Rechecked at `0936c2f`,** each on a package built from that commit, the factory hash unchanged, in place of 3.11.0:
- objects, at `93511a0`, on Node 18.20.8, 20.20.2 and 22.23.4: typecheck and `npm test` give output identical to 3.11.0's, and
  all 341 marshal hashes match across the six runs. This package's own suite passes on the same three versions (CI runs Node 22
  alone). The package holds the same 12 files as 3.11.0. An unknown element put in a `wps` Choice of a real part fails fidelity
  on both runtimes, only on `[resolved]`: by the throw on 3.11.0, by an unexplained difference here. That measures the reading
  above. Seven callbacks set at once report it once and leave the other reports as they were.
- core-ts, at `2701e59`, with its CR-025 built, so the callbacks are passed on every read and not by a wrapper: `npm test`,
  1,884 of 1,884, and typecheck pass. Of check 76's 98 sources through the real load path, 2 fail where 68 fail on 3.11.0. Those
  2 (`76t44`, `76t45`) are a `TypeError` in core-ts's own `TrackedChange` reader, the same on 3.11.0. Of the 15,679 saved parts
  two differ from the baseline, both from core-ts's CR-025 and the same on 3.11.0. The factory loads under `"use strict"`, and
  79 of 79 pass on the three suites run that way, a subset.

Both advise releasing, and ask for nothing further in this version. Not covered: browsers, a real file with an unknown element
on objects' side (its corpus has none; core-ts's evidence is the real one), and the bytes npm serves, which only a run after
publishing can check.

**Found along the way, not this CR's.** core-ts noticed that a single wildcard given two children keeps the last and reports
nothing. Measured here, that holds for any single-valued element property, a named element and an element reference too, on
3.11.0 and on this code: each child is its own `unmarshalProperty` call, so `Value already set.` never meets the second, and
`setProperty` overwrites. core-ts then measured it on objects' model, where it reaches whole content: of two `w:body` in a
`w:document`, the second alone is read. None of its 997 packages holds the shape, and Word's reading is unmeasured. Nothing here
changes it.
