# jsonix-CR-004: Parse XML 1.0 documents with XML 1.0 line-ending normalisation (U+0085 and U+2028 must survive)

**Status:** Proposed 2026-09-19
**Depends on:** nothing; 3.2.2 is the baseline
**Requested by:** `plutext/docx4j-core-ts` CR-001 section 9 (found by its Phase B step 4 parity
comparison against docx4j, where Xerces keeps both characters; the `tracked-changes.docx` fixture
contains one)
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

In Node, the runtime parses XML through the injected `@xmldom/xmldom`. xmldom's `DOMParser`
normalises line endings before parsing with the **XML 1.1** rule, regardless of the document's
declared version, so a raw NEXT LINE (U+0085) or LINE SEPARATOR (U+2028) in the text of an XML
1.0 document becomes U+000A, and a document part containing either character loses it on
unmarshal. XML 1.0 (section 2.11) normalises only CR LF and bare CR. The browser `DOMParser` path
is correct. Fix: pass xmldom the XML 1.0 rule, and the XML 1.1 rule only when the document
declares `version="1.1"`.

## 2. Evidence (3.2.2, `@xmldom/xmldom` 0.9.12, Node 18, 2026-09-19)

Through the runtime's own DOM (`Jsonix.DOM.parse(...).documentElement.textContent`):

| Input | Result | Expected (XML 1.0) |
|---|---|---|
| `<?xml version="1.0"?><a>x` U+0085 `y</a>` | U+0078 U+000A U+0079 | U+0078 **U+0085** U+0079 |
| `<?xml version="1.0"?><a>x` U+2028 `y</a>` | U+0078 U+000A U+0079 | U+0078 **U+2028** U+0079 |
| `<?xml version="1.0"?><a>x&#x85;y</a>` | U+0078 U+0085 U+0079 | same (a reference survives) |
| `<?xml version="1.0"?><a>x` CR LF `y</a>` | U+0078 U+000A U+0079 | same (1.0 section 2.11 prescribes it) |
| no declaration, raw U+0085 | U+0078 U+000A U+0079 | U+0085 (no declaration means 1.0) |
| `<?xml version="1.1"?>`, raw U+0085 | U+0078 U+000A U+0079 | same (1.1 section 2.11 prescribes it) |

The serialiser is not involved: a raw U+0085 in a DOM text node serialises raw.

Cause, `node_modules/@xmldom/xmldom/lib/dom-parser.js`:

```js
function normalizeLineEndings(input) {                                   // line 44
	return input.replace(/\r[\n\u0085]/g, '\n').replace(/[\r\u0085\u2028\u2029]/g, '\n');
}
...
this.normalizeLineEndings = options.normalizeLineEndings || normalizeLineEndings;   // line 166
...
sax.parse(this.normalizeLineEndings(String(source)), defaultNSMap, entityMap);     // line 256
```

xmldom documents this as "the XML 1.1 spec" rule and applies it to every document. It is also
broader than XML 1.1: U+2029 PARAGRAPH SEPARATOR is not a line end in either version. The
runtime constructs `new (_jsonix_xmldom).DOMParser()` with no options (`jsonix.js`, `Jsonix.DOM.parse`),
so it inherits the default.

## 3. Proposal

### 3.1 Runtime

In `Jsonix.DOM.parse`, when using xmldom, construct the parser with a `normalizeLineEndings`
option chosen from the document's declaration:

```js
parse: function (text) {
	Jsonix.Util.Ensure.ensureString(text);
	if (typeof _jsonix_xmldom !== 'undefined') {
		var normalize = Jsonix.DOM.isXml11(text) ? Jsonix.DOM.normalizeLineEndings11 : Jsonix.DOM.normalizeLineEndings10;
		return (new (_jsonix_xmldom).DOMParser({ normalizeLineEndings: normalize })).parseFromString(text, 'application/xml');
	}
	...
},
/** XML 1.0 section 2.11: CR LF and bare CR become LF. */
normalizeLineEndings10: function (text) {
	return text.replace(/\r\n?/g, '\n');
},
/** XML 1.1 section 2.11: additionally CR NEL, NEL and LINE SEPARATOR become LF (not U+2029). */
normalizeLineEndings11: function (text) {
	return text.replace(/\r[\n\u0085]/g, '\n').replace(/[\r\u0085\u2028]/g, '\n');
},
/** True when the text starts with an XML declaration whose version is 1.1. */
isXml11: function (text) {
	var m = /^\s*<\?xml\s[^>]*?version\s*=\s*(["'])1\.1\1/.exec(text);
	return m !== null;
}
```

Notes:

- The regexes run once over the input, as xmldom's own default does, so the cost is unchanged.
- The declaration check looks only at the start of the text; a byte order mark before `<?xml`
  is tolerated by `\s*`.
- Browser `DOMParser` and the legacy `ActiveXObject` branches are untouched; browsers already
  apply the 1.0 rule.
- The same edit goes into the three copies of the library (`nodejs/scripts/jsonix.js`,
  `dist/Jsonix-all.js`, `scripts/src/main/javascript/.../Jsonix/DOM.js`), per `CLAUDE.md`. Only the
  xmldom branch changes, so `dist/` is affected in wording only.
- `unmarshalString`, `unmarshalFile` and `unmarshalURL` (when it falls back to `responseText`) all
  go through `Jsonix.DOM.parse`, so they are all fixed by this one change.

### 3.2 Typings

`Jsonix.DOM.normalizeLineEndings10`, `normalizeLineEndings11` and `isXml11` are declared in
`types/main.d.ts` alongside the existing `DOM` functions, so a consumer that builds its own
xmldom parser can reuse them.

### 3.3 Upstream

Report to xmldom that the default applies XML 1.1 normalisation to 1.0 documents and includes
U+2029. This CR does not depend on the outcome: the option exists in 0.9.12 and the runtime
should pin behaviour itself rather than depend on a future default.

## 4. Compatibility

- Node consumers gain characters they were silently losing. A consumer that depended on NEL or
  LINE SEPARATOR becoming LF would see a change; none is known, and such a dependency would have
  contradicted XML 1.0.
- Browsers: no change.
- Marshalled output: no change (the serialiser is not involved).
- Version 3.2.3 (bug fix).

## 5. Tests

`tests/typescript/typescript.js` (or a new `tests/dom.js` suite) with the six rows of section 2
as assertions on `Jsonix.DOM.parse`, plus a round trip through `unmarshalString` and
`marshalString` of an element whose text contains U+0085 and U+2028 to show both survive the full
path. The three lines of the original report are the minimum:

```js
parse('<?xml version="1.0"?><a>x' + String.fromCodePoint(0x85) + 'y</a>')   // U+0078 U+0085 U+0079
parse('<?xml version="1.0"?><a>x' + String.fromCodePoint(0x2028) + 'y</a>') // U+0078 U+2028 U+0079
parse('<?xml version="1.0"?><a>x&#x85;y</a>')                                // U+0078 U+0085 U+0079
```

## 6. Effort

An hour, including the three copies, the typings and the tests.
