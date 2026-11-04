# jsonix-CR-015: An element a property can neither type nor hold as DOM is skipped and reported when the caller set `onUnexpectedElement`

**Status:** Proposed 2026-11-05; U1 to U3 for Jason. Nothing implemented
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

Measuring this found two more ways an unknown child fails a read, neither of which CR-026 tried and neither of which goes
through this branch: a class with no element or value content (852 of 2,173 classes, among them `w:jc`, `w:b` and `w:br`)
and a class with a text value (23 classes, among them `w:t`). U2 and U3 ask whether this CR takes them.

## 2. Why

core-ts measured two unknown elements in each of 32 WordprocessingML hosts, at 3.11.0 and objects 0.7.0 (its CR-026
section 1). 20 hosts throw and 12 skip, with the same elements. An element whose namespace is in `mc:Ignorable`, the one
case markup compatibility says a consumer must get past, fails like any other. docx4j and docx4j-python read such a
document.

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
| No element or value content | 852 (67 modules, 240 of `org_docx4j_wml`'s 385) | Throws `Illegal state: must be END_ELEMENT.` | U2 |
| A value | 23 (11 modules, 2 in `org_docx4j_wml`) | Throws `Element text content may not contain START_ELEMENT.` | U3 |

The 110 classes come from core-ts's 94 properties (72 element-reference lists, 7 single element references, 15 wildcards),
with derived classes inheriting the list. The 852 include 62 classes with no properties at all. A simple-typed element
property fails as a value class does: 183 of the 4,044 `ElementPropertyInfo`, 1 in `org_docx4j_wml`.

Through a real document, with the callback set:

| Host | 3.11.0 with this CR's branch |
|---|---|
| `w:p` | Read, reported against `P` |
| `w:jc`, `w:b`, `w:br`, `w:tab` in a run | `ext:opaque (line 1): Illegal state: must be END_ELEMENT.` |
| `w:t`, `w:instrText` | `ext:opaque (line 1): Element text content may not contain START_ELEMENT.` |

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

The element is dropped, and nothing keeps it. core-ts's save handles that through its CR-025.

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
  - Against: it is beyond what core-ts asked, nobody has met it in a file (none of core-ts's 720 packages holds an unknown
    element in any host), and Word's handling of a child of `w:jc` is unmeasured, since check 76 doesn't try one. It also
    retires a sentence of CLAUDE.md's contract row, and the advice in CR-006 section 9 to translate a located throw.
  - Under (b) nothing is lost but time: it is additive, a later CR and a second floor raise.

- **U3. Classes with a value, and simple-typed elements.** (a) They keep the throw, or (b) this CR skips the element and
  joins the text around it. I recommend (a).
  - `<w:t>hi<ext:opaque/> there</w:t>` would read "hi there", which changes a value, not just the content around it, and
    the report names only the element. CR-026 D4 has left the text model's side of this open, for the WD.
  - The throw is in `Input.getElementText`, which every simple type shares and which has no class or callback in hand, so
    this is a larger change, touching the most common element in a document.
  - The failure stays located, and 3.11.0's: `ext:opaque (line 1): Element text content may not contain START_ELEMENT.`
  - CR-026 should say that these hosts still refuse, under either answer to U2.

## 6. Out of scope

- **Keeping the element** (CR-026 D1). This CR drops it.
- **An unknown document root,** which keeps its error (section 4.4).
- **An unbound prefix in an unknown element's `xsi:type`** (section 4.6). The class's own branch doesn't read `xsi:type`, so
  there such an element is reported. Nobody has asked for the two to agree.
- **An element-reference list with a wrapper, meeting an unknown child outside it.** `structure.any` sends that element to
  the property, which reads it as if it were the wrapper: its children join the list and nothing is reported. That is
  3.11.0's behaviour with the callback set or unset, and it stays. Objects' mappings have no wrappers.
- **`mc:MustUnderstand` and `mc:ProcessContent`,** which belong above the runtime (CR-026 section 3.4).
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
