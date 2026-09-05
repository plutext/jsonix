# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MITRE's fork of highsource/jsonix, published to npm as `@mitre/jsonix`. Jsonix converts XML <-> JavaScript objects
(unmarshal / marshal) driven by declarative mapping modules, usually generated from XSD by the separate
`jsonix-schema-compiler` project. Everything that matters for the published package lives in `nodejs/scripts/`.

## Commands

All npm work happens in `nodejs/scripts` (that directory is the npm package root; CI runs Node 22).

```bash
cd nodejs/scripts
npm ci                                  # install (nodeunit, node-static are the only dev deps)
npm test                                # full suite: nodeunit tests/tests.js
npx nodeunit tests/xsd.js               # one suite file
npx nodeunit -t Integer tests/xsd.js    # one named test inside a file
```

- The `Request` suite (`tests/request.js`) starts a `node-static` server on port 8080. If 8080 is in use the full
  run reports an "undone" failure (`EADDRINUSE`); this is environmental, not a code regression.
- nodeunit tests must call `test.done()`; a missing call shows up as an "Undone tests" failure.
- Release: bump `version` in `nodejs/scripts/package.json`, then publish a GitHub release. The
  `.github/workflows` publish job strips `tests/`, runs `npm pack`, and publishes via npm trusted publishing.

The Maven build (`pom.xml`, `*.bat`) is the original upstream pipeline (Java 8, legato/yuicompressor/JsTestDriver
plugins). CI does not use it and it is not expected to work; don't reach for it to rebuild bundles.

## The three copies of the library (important)

The runtime exists as three checked-in copies that have **diverged** and are patched by hand in this fork:

| Path | Role |
|---|---|
| `nodejs/scripts/jsonix.js` | The npm-published bundle (`main`). What the tests load. **Edit this one first.** |
| `scripts/src/main/javascript/org/hisrc/jsonix/` | Modular upstream sources, one class per file. Concatenated by Maven in the order listed in `scripts/src/main/resources/org/hisrc/jsonix/Jsonix.scripts` between `Jsonix.header.fragmentjs` / `Jsonix.footer.fragmentjs`. |
| `dist/Jsonix-all.js`, `dist/Jsonix-min.js` | Browser/bower bundle. |

Recent fixes (e.g. the `var p` fix, the `@xmldom/xmldom` rename, the try/catch module footer) were applied
directly to one or more bundles, not regenerated. When changing library behaviour, change `nodejs/scripts/jsonix.js`,
then mirror the same edit into the modular source file and `dist/` so the copies don't drift further. Note the Node
bundle's footer intentionally differs from the modular footer: it requires `@xmldom/xmldom` (not `xmldom`) and falls
back to `module.exports = _jsonix_factory()` when `amdefine` is unavailable (webpack compatibility).

TypeScript typings are hand-written in `nodejs/scripts/types/main.d.ts` (`declare module '@mitre/jsonix'`); update
them when the public API changes.

## Architecture of the runtime

Everything is wrapped in `_jsonix_factory(_jsonix_xmldom, _jsonix_xmlhttprequest, _jsonix_fs)`. In Node those
are injected via the footer; in browsers they are undefined and `Jsonix.DOM` / `Jsonix.Request` fall back to
browser globals. `unmarshalFile` only works when `_jsonix_fs` is defined.

**Class system.** `Jsonix.Class(Parent1, Parent2, ..., {props})` builds prototype-based classes with multiple
parents (mixins), an `initialize` constructor, and a `CLASS_NAME`. Because files reference each other at
load time (e.g. `Mapping/Style/Standard.js` references `Jsonix.Binding.Marshaller`), concatenation order matters
if you touch the modular sources.

**Mappings -> Context.** `new Jsonix.Context([moduleA, moduleB], options)`:
1. Each mapping (a plain object, typically generated) becomes a `Jsonix.Model.Module`. Mapping keys have long and
   short aliases everywhere: `name`/`n`, `localName`/`ln`, `typeInfos`/`tis`, `elementInfos`/`eis`,
   `propertyInfos`/`ps`, `type`/`t`, `baseTypeInfo`/`bti`, `targetNamespace`/`tns`, `collection`/`col`, etc.
   Both must keep working.
2. `processModules` is two-phase across all modules: register all type infos and element infos first, then
   `build` them. This is what makes cross-module references order-independent (regression tests GH135, GH150).
3. Type references are strings resolved in `Context.resolveTypeInfo`: `"PO.USAddress"` is global, `".USAddress"`
   is local to the referencing module, and built-in XSD types are registered by name (`String`, `Integer`, ...).

**Mapping styles.** `Jsonix.Mapping.Style` is a table of which classes implement marshaller, unmarshaller,
module, classInfo, and each property-info kind. `STYLES.standard` and `STYLES.simplified` are the two variants
(simplified changes how element refs / any elements are represented). Anything extending `Jsonix.Mapping.Styled`
gets `this.mappingStyle` from `options.mappingStyle`.

**Type infos.** All implement `build`, `marshal`, `unmarshal`:
- `Jsonix.Model.ClassInfo`: complex types. `build` resolves the base type and properties, then computes a
  `structure` (`elements`, `attributes`, `value`, `anyAttribute`, `any`) used to dispatch XML content to
  properties during unmarshalling. Unmarshalled objects get `TYPE_NAME` unless an `instanceFactory` is given.
- `Jsonix.Model.EnumLeafInfo`: enumerations.
- `Jsonix.Schema.XSD.*`: simple types, each a singleton `INSTANCE` with `parse`/`print`/`isInstance`. They are
  the `builtinTypeInfos` list at the bottom of `Context`. Add a new simple type there and in the concatenation
  order.

**Property infos** (`Jsonix.Model.*PropertyInfo`): attribute, value, element, elements, elementRef(s),
elementMap, anyAttribute, anyElement. Each contributes to the owning class's `structure` via `buildStructure`.

**Binding.** `Jsonix.Binding.Marshaller` / `Unmarshaller` are composed from `Marshalls.Element` /
`Unmarshalls.Element` mixins plus an `AsElementRef` (or `AsSimplifiedElementRef`) mixin that decides how a
top-level value maps to `{name: QName, value: ...}`. Marshalling writes through `Jsonix.XML.Output` (a DOM
writer that manages namespace prefixes from `context.namespacePrefixes`); unmarshalling reads through
`Jsonix.XML.Input`, a StAX-style cursor over a DOM. `xsi:type` dispatch is on by default
(`context.supportXsiType`) and resolves via `typeNameKeyToTypeInfo`.

## Tests layout

- `tests/tests.js` aggregates the suites (`util`, `xml`, `schema`, `nodejs`, `request`, `sax`, `issues`).
- Regression tests for upstream GitHub issues live in `tests/GH<n>/GH<n>.js` (with their mapping modules as
  sibling files) and must be registered in `tests/issues.js`.
- `tests/roundtrip.js` and `tests/comparison.js` are helpers: roundtrip unmarshal->marshal->unmarshal a
  directory of `.xml` fixtures, or compare marshalled JSON fixtures against expected XML.

## Other directories (mostly legacy upstream)

- `nodejs/tests/*`: standalone integration packages (po, wps, browserify, ...) that depend on a packed tgz and
  `jsonix-schema-compiler`; not run in CI.
- `scripts/src/test/javascript`: JsTestDriver browser tests for the modular sources; not run in CI.
- `typescript/`: an early draft of typings plus a UML diagram, not published (the published typings are in
  `nodejs/scripts/types`).
- `formats/gml-geojson`, `demos/`, `fiddles/`, `docs/Jsonix.pdf`: examples and documentation from upstream.
- The README's `java -jar node_modules/jsonix/lib/jsonix-schema-compiler-full.jar` instruction is upstream
  wording; the jar is not shipped in `@mitre/jsonix` (`lib/.npmignore` excludes it). Use the
  `jsonix-schema-compiler` package or Maven artifact to generate mappings.
