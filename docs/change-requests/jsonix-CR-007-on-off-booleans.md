# jsonix-CR-007: `on` and `off` read as booleans, as ECMA-376 Transitional allows and Office reads

**Status:** Implemented 2026-10-16 (section 6), version 3.4.1
**Depends on:** nothing; 3.4.0 is the baseline
**Requested by:** `plutext/docx4j-core-ts`, relaying `plutext/docx4j-ts-editor` (2026-10-16): a valid
document of Jason's, written by pandoc 3.6.1, would not open in the editor
**Repository:** `@docx4j/jsonix` runtime (this repository); the decision of where the fix belongs is
section 3

## 1. Summary

`Jsonix.Schema.XSD.Boolean.parse` accepts `true`, `1`, `false` and `0`, the four lexical forms of
`xsd:boolean`, and throws on anything else. WordprocessingML's toggle attributes are not
`xsd:boolean`: ECMA-376 Transitional types them `ST_OnOff` (Part 4, 17.18.74; the 1st edition's
`ST_OnOff` is the same six values), a union of `xsd:boolean` and `on`/`off`, and Word reads all six.
docx4j's `wml.xsd` binds those attributes as `xsd:boolean` on purpose (its comment above
`BooleanDefaultTrue`: "a third party processor could choose to use `on` or `off`, even where Word
doesn't. This would cause trouble"), so the generated `org_docx4j_wml` carries 48 properties typed
`Boolean`, and an attribute holding `on` or `off` meets the strict parser.

It has happened. pandoc's docx writer puts `<w:wordWrap w:val="off"/>` in its built-in "Source Code"
paragraph style whenever the reference document lacks one, and on such a file
`@docx4j/generated-objects-ts` 0.3.1 over this runtime throws

```
w:wordWrap/@w:val (line 1): Either [true], [1], [0] or [false] expected as boolean value.
```

from the styles part, which `@docx4j/core-ts` surfaces as a `PartUnmarshalException` from
`unmarshalAll` and `getBody`, so the editor cannot open a document Word opens. Reproduced through
the objects facade alone, with `w:b` as well as `w:wordWrap`, for `on` and for `off`.

## 2. What changes

`Boolean.parse` also accepts `on` (true) and `off` (false). `print` is unchanged: a boolean is
always written `true` or `false`, so a re-marshalled part normalises `off` to `false`, which is what
a part that passed through the model is expected to do (an untouched part is copied byte for byte
by core-ts). The error message names the six forms. Nothing else: no option, no new type, and the
spellings `On`, `OFF`, a padded ` on`, `yes`, `no` and the empty string stay rejected, as they are
in Word.

## 3. Why the runtime, not the compiler

core-ts offered two routes: a dedicated `OnOff` type the compiler emits for `ST_OnOff`, keeping
`xsd:boolean` strict, or a lenient `Boolean` here. The first does not reach the failing attribute.
docx4j's `wml.xsd` uses `ST_OnOff` eight times and `xsd:boolean` fifty-two, `CT_OnOff`'s `val` among
the fifty-two: the schema this runtime's mappings are generated from has already decided that
`w:val` on a toggle *is* `xsd:boolean`. A compiler type for `ST_OnOff` would fix the eight and leave
`w:wordWrap`, `w:b` and the rest as they are, and changing docx4j's schema back to `ST_OnOff` on
fifty-two declarations would change the generated Java (`BooleanDefaultTrue.val` is a `boolean`)
for a problem the Java side has too (section 5).

The cost of leniency is one lexical form of one simple type, and it is lenient in the direction a
reader should be: nothing that was accepted changes meaning, and the two new forms have exactly one
meaning each in every edition of ECMA-376 that admits them. The 1,108 `Boolean`-typed properties
across the 104 Office mappings (DrawingML's 96 in `org_docx4j_dml`, chartex, SpreadsheetML) gain the
same tolerance; none of them is harmed by reading `on` as true, and Office's own writers never
produce it there.

## 4. Consumers

- `@docx4j/generated-objects-ts`: nothing to change for the fix to apply; its `^3.4.0` admits the
  patch, and a fresh install resolves it. A release bumping the floor to `^3.4.1` makes the
  guarantee visible and lets its smoke test assert the behaviour; the pending 0.4.0 (the CR-040
  chartex regenerations) is the natural carrier.
- `@docx4j/core-ts` and the editor: take the runtime through objects. core-ts raises its range when
  objects releases, as usual. The editor's document opens once its install resolves 3.4.1.

## 5. docx4j

docx4j is not the reference here. JAXB RI's `DatatypeConverterImpl._parseBoolean` returns `null`
for `on` and `off` (core-ts ran it in jshell, jaxb-runtime 4.0.6), and
`BooleanDefaultTrue.isVal()` returns true when `val` is null, so docx4j reads `w:val="off"` as
**on**. That is docx4j's to fix; core-ts has told Jason separately. This CR reads `off` as false,
which is what ECMA-376 says and what Word does.

## 6. As implemented (2026-10-16)

The three copies patched alike (`nodejs/scripts/jsonix-factory.js`, the modular
`Jsonix/Schema/XSD/Boolean.js`, `dist/Jsonix-all.js`; `Jsonix-min.js` stays stale, as CLAUDE.md
says), each with a comment naming this CR. `tests/xsd.js`'s `Boolean` test gains the two forms, the
print of a parsed `off`, and six spellings that must still throw. Full suite 1073 assertions,
typecheck, `test:esm` and `test:bundle` pass.

Verified from the objects package against this checkout (`npm install --no-save` of
`nodejs/scripts`, with `@xmldom/xmldom` reinstalled beside it, since the symlink takes the hoisted
copy away and the fidelity test imports it directly): the reproduction reads `wordWrap` and `b` as
false for `off` and true for `on`, writes them back as `false`/`true`, and the objects suite passes
with its 359 fidelity checks unchanged. Not verified: a document through core-ts and the editor,
which they do on the release.
