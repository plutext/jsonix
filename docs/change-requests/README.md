# Change requests

Numbered proposals for changes to this fork of the Jsonix runtime (`plutext/jsonix`, published as
`@docx4j/jsonix`; continues MITRE's `@mitre/jsonix`, itself forked from `highsource/jsonix`). They are prefixed `jsonix-` to keep them distinct
from the change requests of the sibling `jsonix-schema-compiler` repository, which this runtime's
proposals frequently depend on.

| CR | Title | Depends on | Status |
|----|-------|------------|--------|
| [jsonix-CR-001](jsonix-CR-001-typescript-consumers.md) | Support TypeScript consumers of compiler-generated declarations and ES-module mappings | compiler CR-005 | Implemented 2026-09-06 (3.1.0) |
| [jsonix-CR-002](jsonix-CR-002-parent-pointers-and-deep-copy.md) | Parent pointers (`PARENT`) and `Jsonix.Util.deepCopy` for unmarshalled objects, mirroring docx4j's `-Xparent-pointer` / `-Xdocx4j-copy` | jsonix-CR-001; companion compiler CR-006 | Implemented 2026-09-07 (3.2.0) |
| [jsonix-CR-003](jsonix-CR-003-namespace-declarations-and-dom-typings.md) | Namespace declarations where first used, `declareNamespaces` and per-marshal `namespacePrefixes` options (retires the facade's stripping pass), `xml` never redeclared, `Jsonix.DOM` in the typings | jsonix-CR-001; requested by objects CR-001 | Proposed 2026-09-10 |
