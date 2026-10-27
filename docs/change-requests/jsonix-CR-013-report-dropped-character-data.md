# jsonix-CR-013: Report the character data unmarshalling drops: an `onUnexpectedText(text, node, classInfo)` beside `onUnexpectedElement` and `onUnexpectedAttribute`

**Status:** Implemented 2026-10-28 (section 8), version 3.10.0; T1 to T3 decided as recommended (Jason, 2026-10-28)
**Depends on:** nothing; 3.9.0 is the baseline
**Requested by:** `plutext/docx4j-core-ts` for its CR-016 D6, through `plutext/docx4j-generated-objects-ts` CR-017
section 4.2 (its `'#text'` read report). Jason asked for it to be raised on 2026-10-28. The evidence is check 72's file
72m: a `w:r` holding character data outside `w:t`.
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

`<w:r>MISPLACED string in a run<w:t>x</w:t></w:r>` unmarshals as a run holding `w:t` alone. The string is gone, and
no callback fires. jsonix-CR-006 reports a dropped element (`onUnexpectedElement`) and a dropped attribute
(`onUnexpectedAttribute`), but nothing reports dropped character data. Word 365's repair drops the string too, and so
does docx4j's JAXB. Of check 72's eighteen misplaced forms, it is the only one in which content vanishes with no trace
anywhere: objects' CR-017 keeps and reports every other misplaced child through its `onMisplaced`.

This CR adds a third per-call unmarshaller option beside the two CR-006 callbacks:

```js
context.createUnmarshaller({ onUnexpectedText: function (text, node, classInfo) { ... } })
```

It is called once for each text or CDATA node that `ClassInfo.unmarshal` drops and that holds a character other than
XML whitespace. The data is still dropped: the callback reports and keeps nothing. Unset, which is the default, nothing
changes.

## 2. Why the read side needs it

CR-006's principle applies here: a report that is absent looks like nothing dropped. objects' fidelity test and
core-ts's `validateXml` conclude things from the reports' exact conditions (CLAUDE.md, the contract table), and today
they can't see a dropped string.

- **objects** would turn each call into a `'#text'` misplaced-child read report under its existing `onMisplaced`.
  Its CR-017 section 4.2 records the gap as unreported by design, pending this CR.
- **core-ts** would turn that report into its CR-016 D6, the same value-misplaced load warning it gives any other
  misplaced child.

The chain is jsonix, then the objects facade, then core-ts, each through its version range. Priority is low; nothing
waits on it.

## 3. Where the runtime drops character data (measured on 3.9.0)

Measured with objects' 104 mapping modules (objects main 8ec65b3), unmarshalling a paragraph and marshalling it back:

| Source run | Written back |
|---|---|
| `<w:r>MISPLACED<w:t>x</w:t></w:r>` | `<w:r><w:t>x</w:t></w:r>` |
| `<w:r><w:t>x</w:t>tail</w:r>` | `<w:r><w:t>x</w:t></w:r>` |
| `<w:r>ab<!--c-->cd<w:t>x</w:t></w:r>` | `<w:r><w:t>x</w:t></w:r>` |
| `<w:r><![CDATA[cd]]><w:t>x</w:t></w:r>` | `<w:r><w:t>x</w:t></w:r>` |
| `<w:r>&#xA0;<w:t>x</w:t></w:r>` (a no-break space), likewise U+3000 | `<w:r><w:t>x</w:t></w:r>` |
| `<w:r><w:rPr><w:b>bold?</w:b></w:rPr>...` | `<w:r><w:rPr><w:b/></w:rPr>...` |
| `<w:r><w:lastRenderedPageBreak>lr</w:lastRenderedPageBreak>...` | `<w:r><w:lastRenderedPageBreak/>...` |

None of these calls a callback. The run's content property is an element-refs property with `mixed: false`. The
census below is of the 2,173 class infos in those modules, built in one context.

All the drops happen in `ClassInfo.unmarshal`, at three sites:

- **A. Element content in a class with no mixed property.** The element loop meets `CHARACTERS` or `CDATA` and, with
  no `structure.mixed`, does nothing. This affects 1,276 of the 1,298 classes with element content, `CT_R`, `CT_P` and
  `CT_Body` among them. 108 of them have an `any` wildcard that is not mixed: the wildcard keeps elements but not text,
  so text is dropped there too.
- **B. Text the input classes as space.** `Jsonix.XML.Input.enter` gives a text node `SPACE` rather than `CHARACTERS`
  when `Jsonix.Util.StringUtils.isEmpty` holds. That test counts 26 characters as whitespace. XML counts four (`#x20`,
  `#x9`, `#xD`, `#xA`); the other 22 include U+00A0, U+3000, U+2000 to U+200A, and the U+0085 and U+2028 that
  jsonix-CR-004 keeps raw. The loop ignores `SPACE` in every class, mixed or not. So a no-break space alone in a run is
  dropped. So is one between two elements of a mixed class, although that class keeps every other text. 22 classes are
  mixed, none of them in `wml` or `w14` (17 are in `docProps` core's Dublin Core terms).
- **C. A class with neither element content nor a value.** `input.nextTag()` skips every text node before the end
  tag. This affects 852 classes, `CT_OnOff` (`w:b`) and the empty run content (`w:lastRenderedPageBreak`) among them.

These are not drops, and stay as they are:

- **Simple content** (23 classes with a value property, and every simple type) reads the text as the value.
- **Text inside an element skipped as unexpected.** `onUnexpectedElement` reports that element, and its subtree goes
  with it, as CR-006 reports no descendants.
- **A wrapper element's text.** It throws (`Illegal state: unexpected event type [4]`) unless mixed. Objects' mappings
  have no wrapper elements.
- **Text before an unexpected child of a class at site C.** `<w:b>t<w:x/></w:b>` throws today
  (`w:x (line 1): Illegal state: must be END_ELEMENT.`) and keeps throwing; with the option set, `t` is reported first.

xmldom gives one text node per stretch of character data between markup, with entities resolved:
- `ab&amp;cd&#x41;` is one node, `ab&cdA`.
- A CDATA section is a node of its own.
- A comment or processing instruction splits the text around it.
- Each node carries its own `lineNumber` and `columnNumber`.

## 4. Proposal

### 4.1 The callback

```ts
onUnexpectedText?(text: string, node: Node, classInfo: ClassInfo): void;
```

It is a per-call option on `createUnmarshaller(options)`, held on the derived context like CR-006's callbacks, so the
shared context is never written. Its arguments follow `onUnexpectedElement`'s, with the dropped thing first:

- `text` is the node's text as parsed: entities resolved, line endings normalised for the document's XML version
  (jsonix-CR-004), untrimmed.
- `node` is the text or CDATA node itself. `node.parentNode` is the containing element. `node.lineNumber` and
  `node.columnNumber` are the location where the parser gives one (xmldom does; a browser's `DOMParser` does not).
- `classInfo` is the containing element's class info, as for the other two callbacks.

The return value is ignored.

### 4.2 When it fires

It fires once for each text or CDATA node that `ClassInfo.unmarshal` drops at sites A, B or C, if that node holds a
character other than XML whitespace (T1, T2). A run of text split by a comment is therefore two calls. A caller who
wants an element's whole dropped text joins the calls that share a `parentNode`.

It never fires for:
- whitespace-only text or CDATA, which pretty-printed XML has everywhere;
- text a mixed property keeps;
- simple content;
- anything inside an element reported by `onUnexpectedElement`.

An entity reference node is not reported. No parser this runtime uses produces one: xmldom and browsers resolve
entities into the text.

### 4.3 Order and the other callbacks

Calls come in document order, interleaved with `onUnexpectedElement`'s. They come before the containing element's
unmarshal `onElement` (jsonix-CR-008), which reports children first. So objects can collect the calls by
`node.parentNode` and emit `'#text'` reports in its composed `onElement`. That is where it already tests each
container's list (objects CR-017 section 4.2).

### 4.4 Errors

A callback that throws stops the unmarshal. The enclosing property read locates the error with the text node, as for
any error there, so it reads `#text (line 3): ...`. At the document root it is not located. Both behaviours are
CR-006's for a throwing `onUnexpectedElement`.

### 4.5 Unset

Unset, nothing changes. At sites A and B the only addition is one property read on a path that already ignores the
node. At site C, `input.nextTag()` runs as before, so the reporting loop runs only when the option is set.

### 4.6 Sketch

All three sites are in `ClassInfo.unmarshal`, plus one helper:

```js
} else if ((et === Jsonix.XML.Input.CHARACTERS || et === Jsonix.XML.Input.CDATA || et === Jsonix.XML.Input.ENTITY_REFERENCE)) {
	if (Jsonix.Util.Type.exists(this.structure.mixed)) {
		...
	} else if (context.onUnexpectedText) {
		this.reportUnexpectedText(context, input);              // site A
	}
} else if (et === Jsonix.XML.Input.SPACE || et === Jsonix.XML.Input.COMMENT || et === Jsonix.XML.Input.PROCESSING_INSTRUCTION) {
	if (et === Jsonix.XML.Input.SPACE && context.onUnexpectedText) {
		this.reportUnexpectedText(context, input);              // site B
	}
}
...
} else if (context.onUnexpectedText) {
	// site C: nextTag's loop, reporting the text it skips
} else {
	// Just skip everything
	input.nextTag();
}

reportUnexpectedText: function (context, input) {
	var text = input.getText();
	if (Jsonix.Util.Type.isString(text) && /[^\x20\x09\x0D\x0A]/.test(text)) {
		context.onUnexpectedText(text, input.node, this);
	}
},
```

`Jsonix.XML.Input` and `StringUtils.isEmpty` are unchanged. Widening what `SPACE` means would change what mixed
content and simple values read (section 6).

## 5. Decisions for Jason

Decided as recommended (Jason, 2026-10-28: "T1 to T3 as recommended, implement it"). objects' reply the same day
confirmed T1 and T3 against its use and left T2 neutral, since none of its containers is mixed.

- **T1. What counts as whitespace.** I recommend XML's four characters. A no-break space or U+3000 alone in a run is
  then reported: it is content that is dropped, and XSD does not allow it in element-only content
  (`cvc-complex-type.2.3`). The alternative is the runtime's 26. That is simpler, at site A only, but it leaves those
  texts dropped unreported, which is the gap this CR closes.
- **T2. Mixed classes.** I recommend reporting there too, so there is one rule whatever the class: every dropped text
  holding a character outside XML whitespace. Only site B's text applies in a mixed class: a text the input classes as
  space but that holds such a character. This is beyond core-ts's ask ("a class with no mixed property"). It touches
  the 22 mixed classes, none in Word's mappings.
- **T3. The name and the node.** I recommend `onUnexpectedText(text, node, classInfo)` with `node` the text node, as
  `onUnexpectedElement` passes the dropped element. Its `parentNode` is the containing element, and its own line and
  column locate the text more closely than the element's. The alternative is to pass the containing element, as
  `onUnexpectedAttribute` does. That loses the text's own location, and a caller can't tell two calls for one element
  apart.

## 6. Out of scope

- **Keeping the text.** A run has no place for it. JAXB and Word drop it, and keeping it would change the tree and the
  `.d.ts` contract.
- **What mixed content keeps.** Site B also drops whitespace-only text between two elements of a mixed class, although
  whitespace is content there. Measured: `<p>a<b>x</b> <b>y</b></p>` reads as `["a", <b>, <b>]`, the same with a
  no-break space in place of the space. Under T1 and T2 the no-break space is reported and the space is not. Keeping
  either would change what 22 classes outside Word's mappings read. That would be its own CR.
- **Wrapper elements.** Their text already throws.
- **The marshal side.** A string pushed into a non-mixed list already throws (`Property is not mixed`), and objects
  reports it first (its CR-017 section 4.2).

## 7. Implementation and tests (once T1 to T3 are decided)

- **Code.** Edit `nodejs/scripts/jsonix-factory.js` first, then mirror the edit into
  `scripts/src/main/javascript/org/hisrc/jsonix/Model/ClassInfo.js` and `dist/Jsonix-all.js`. Check that the three
  copies agree with the vm-sandbox recipe.
- **Typings.** Add `UnmarshalCallbacks.onUnexpectedText` and its `UnmarshallerOptions` entry in `types/main.d.ts`. Add
  a use in `tests/typescript/usage.ts`, plus an `@ts-expect-error` for a wrong argument type.
- **Contract.** Add a row to CLAUDE.md's contract table: every text or CDATA node `ClassInfo.unmarshal` drops that holds
  a character outside XML whitespace, once per node, located by the node.
- **Tests.** Add `tests/unexpectedtext.js`, on a small hand-written mapping, registered in `tests/tests.js`. It covers:
  - sites A, B and C;
  - CDATA, and whitespace-only text and CDATA (not reported);
  - U+00A0, U+3000 and a raw U+0085 (reported);
  - a comment splitting text (two calls);
  - a mixed class (kept, not reported, except site B under T2);
  - a non-mixed and a mixed `any`;
  - simple content;
  - text inside an unexpected element (only `onUnexpectedElement` fires);
  - order against `onUnexpectedElement` and `onElement`;
  - an `xsi:type` element;
  - a throwing callback (located);
  - unset, with results identical to 3.9.0's.
- **Cost.** Measure unset and set against 3.9.0, as CR-011 section 10 did.
- **Downstream check.** Before release, objects runs the option over its Office corpus. A count other than zero there
  would be news.
- **Version.** Release as 3.10.0, a minor version for a new option.

## 8. As implemented (2026-10-28)

Patched in the three copies (`nodejs/scripts/jsonix-factory.js`, `dist/Jsonix-all.js` and the modular
`Jsonix/Model/ClassInfo.js`), as sketched in section 4.6. `ClassInfo.reportUnexpectedText(context, input)` holds the
test, and `ClassInfo.unmarshal` calls it at the three sites:
- **A.** The text branch, when there is no mixed property.
- **B.** The space branch. Comments and processing instructions go through the same branch and are never reported.
- **C.** A loop that replaces `input.nextTag()` only when the option is set. It skips the same events and throws the
  same `Expected start or end tag.` for anything else, so the error after it (`Illegal state: must be END_ELEMENT.`)
  is unchanged.

`Jsonix.XML.Input` and `StringUtils` are unchanged.

**Typings.**
- `UnmarshalCallbacks.onUnexpectedText?` and the derived context's `onUnexpectedText?`.
- `UnmarshalCallbacks` now says that a wildcard keeps unknown elements or attributes, not content: a non-mixed `any`
  keeps no text, and that text is reported.
- `usage.ts` groups calls by `node.parentNode`, as objects will. It expects an error for a `QName` as the text, and
  for the option on a marshaller.

**Tests.** `tests/unexpectedtext.js` has 16 tests and 50 assertions. They cover:
- sites A, B and C;
- CDATA, and whitespace-only CDATA;
- one call per node around a comment and a processing instruction;
- entities resolved and line ends normalised;
- U+00A0, U+3000 and U+2009;
- raw U+0085 and U+2028, reported under XML 1.0 and not under 1.1, where they become line feeds;
- an `xsi:type` element, and the root;
- a non-mixed and a mixed `any`;
- a mixed class: text kept, a no-break space reported, a space dropped unreported;
- simple content;
- order against `onUnexpectedElement` and `onElement`;
- a throwing callback (`#text (line 2): ...`; unlocated at the root);
- unset, with results identical, the return value ignored, and the shared context unwritten.

Against 3.9.0's factory, every test fails except the three that expect no report.

Suite: 3,389 assertions. Typecheck, ESM and bundle checks pass.

**The three copies agree.** The dist and modular copies, loaded as a browser loads them, give the npm copy's calls,
results and errors for eight inputs, with the option set and unset. All three read one shared parse: the global
`DOMParser` those copies use in the sandbox is xmldom's without jsonix-CR-004's XML 1.0 option, so it turns a raw U+0085
into a line feed before the unmarshaller sees it. That is a property of the parse, not of this CR.

**Cost.** Unmarshalling a pre-parsed, pretty-printed body of 3,000 paragraphs and 15,000 runs (3.5 MB). Each run had
`w:b`, `w:i`, `w:sz`, `w:t` and `w:lastRenderedPageBreak`, so sites B and C are exercised throughout. The context used
objects' 104 modules. Each figure is the median of 20 rounds after 5 warm-up rounds, Node 18, with one configuration
per process and four rounds alternating:

| | rounds 1 to 4 |
|---|---|
| 3.9.0 | 270, 265, 264, 262 ms |
| unset | 268, 264, 268, 270 ms |
| `onUnexpectedText` set | 276, 266, 268, 273 ms |

Unset, the difference is within noise. Set, it costs about 2%, almost all of it the whitespace test on each
indentation node. The option reported nothing on this document. Both runtimes measured in one process showed
the change about 11% slower unset. That was an artefact of the two loading together, and it went away when each ran
alone.

**Downstream check.** objects ran c259464 over its fidelity corpus in a scratch copy of objects a7ca895:
- **A positive control** first: a string inside a run gave exactly one call, `MISPLACED` in `org_docx4j_wml.R`, and
  none for the indentation.
- **With the option set,** 359 checks (the 341 parts as written, plus 18 with their `mc:Choice` resolved) gave 0
  reports, and the fidelity test passed.
- **With it unset,** all 342 re-marshalled parts were byte-identical to 3.9.0's.
- **objects' other suites** (smoke, `word365`, `word365-integers` and `word365-ranges`) passed.
