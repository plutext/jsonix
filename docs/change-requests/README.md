# Change requests

Numbered proposals for changes to this fork of the Jsonix runtime (`plutext/jsonix`, published as
`@docx4j/jsonix`; continues MITRE's `@mitre/jsonix`, itself forked from `highsource/jsonix`). They are prefixed `jsonix-` to keep them distinct
from the change requests of the sibling `jsonix-schema-compiler` repository, which this runtime's
proposals frequently depend on.

| CR | Title | Depends on | Status |
|----|-------|------------|--------|
| [jsonix-CR-001](jsonix-CR-001-typescript-consumers.md) | Support TypeScript consumers of compiler-generated declarations and ES-module mappings | compiler CR-005 | Implemented 2026-09-06 (3.1.0) |
| [jsonix-CR-002](jsonix-CR-002-parent-pointers-and-deep-copy.md) | Parent pointers (`PARENT`) and `Jsonix.Util.deepCopy` for unmarshalled objects, mirroring docx4j's `-Xparent-pointer` / `-Xdocx4j-copy` | jsonix-CR-001; companion compiler CR-006 | Implemented 2026-09-07 (3.2.0) |
| [jsonix-CR-003](jsonix-CR-003-namespace-declarations-and-dom-typings.md) | Namespace declarations where first used, `declareNamespaces` and per-marshal `namespacePrefixes` options (retires the facade's stripping pass), `xml` never redeclared, `Jsonix.DOM` in the typings | jsonix-CR-001; requested by objects CR-001 | Part 1 (typings: `Jsonix.DOM`, `Context.namespacePrefixes`) implemented 2026-09-15 as 3.2.1; part 2 (namespace declarations) deferred to 3.3.0 |
| [jsonix-CR-004](jsonix-CR-004-xml-1-0-line-ending-normalisation.md) | Parse XML 1.0 documents with XML 1.0 line-ending normalisation: raw U+0085 and U+2028 survive unmarshal in Node (xmldom applies the 1.1 rule by default) | none; requested by core-ts CR-001 §9 | Proposed 2026-09-19 |
| [jsonix-CR-005](jsonix-CR-005-bundled-runtime-loses-xmldom.md) | A bundled runtime loses `@xmldom/xmldom`: the UMD footer injects it through `amdefine`, which no bundler can satisfy, so the factory is called with no dependencies and Node bundles reach for `XMLHttpRequest` | none; requested by objects CR-005 §6.2 | Proposed 2026-09-25 |
