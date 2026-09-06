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
npm ci                                  # install (dev deps: nodeunit, node-static, typescript)
npm test                                # full suite: nodeunit tests/tests.js
npx nodeunit tests/xsd.js               # one suite file
npx nodeunit -t Integer tests/xsd.js    # one named test inside a file
npm run typecheck                       # tsc over tests/typescript (bundler and node16 resolution)
npm run test:esm                        # Node ESM import of the package + an .mjs mapping
```

CI runs all three (`.github/workflows/run-tests.yml`).

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
| `nodejs/scripts/jsonix.js` | The npm-published bundle (`main`). What the tests load. **Edit this one first.** CRLF line endings, as is `dist/Jsonix-all.js`; the modular sources are LF. |
| `scripts/src/main/javascript/org/hisrc/jsonix/` | Modular upstream sources, one class per file. Concatenated by Maven in the order listed in `scripts/src/main/resources/org/hisrc/jsonix/Jsonix.scripts` between `Jsonix.header.fragmentjs` / `Jsonix.footer.fragmentjs`. |
| `dist/Jsonix-all.js`, `dist/Jsonix-min.js` | Browser/bower bundle. |

Recent fixes (e.g. the `var p` fix, the `@xmldom/xmldom` rename, the try/catch module footer) were applied
directly to one or more bundles, not regenerated. When changing library behaviour, change `nodejs/scripts/jsonix.js`,
then mirror the same edit into the modular source file and `dist/Jsonix-all.js` so the copies don't drift further
(jsonix-CR-002 did this for `parentPointers` / `deepCopy`). `dist/Jsonix-min.js` cannot be patched by hand for anything
beyond a one-liner and has not been regenerated since; treat it as stale until the Maven pipeline is revived. Note the Node
bundle's footer intentionally differs from the modular footer: it requires `@xmldom/xmldom` (not `xmldom`) and falls
back to `module.exports = _jsonix_factory()` when `amdefine` is unavailable (webpack compatibility).

## TypeScript contract with jsonix-schema-compiler

The sibling repository `../jsonix-schema-compiler` (this fork's build of the mapping generator; see its
`docs/change-requests/`) emits, with `-generateTypeScript`, a `.d.ts` per mapping module describing the unmarshalled
data, and with `<jsonix:output format="esm"/>` the mapping as an `.mjs`. Those files are independent of this package's
typings but hard-code the runtime's data representation. The contract, guarded by `nodejs/scripts/tests/typescript`
(see its README for how the fixtures were generated), is:

| Generated declaration | Runtime |
|---|---|
| `TypedNamedValue<T>` = `{ name, value }` | what `unmarshal*` returns and `marshal*` accepts |
| `TYPE_NAME?: 'PO.USAddress'` literal | set by `ClassInfo.unmarshal` to the type info's `name`; compared by `isInstance` |
| `XmlQName` fields `namespaceURI`, `localPart`, `prefix`, `key`, `string` | `Jsonix.XML.QName` |
| `XmlCalendar` fields `year` … `timezone`, unset = `NaN` | `Jsonix.XML.Calendar` (never a JS `Date`) |
| `XmlDuration` fields `sign`, `years`, `months`, `days`, `hours`, `minutes`, `seconds` | `Jsonix.Schema.XSD.Duration` |
| `readonly PARENT?: <union of containers>` on class interfaces only | set by `ClassInfo.unmarshal` from a result stack on the `Input` when `context.parentPointers` is on; non-enumerable; never on wrappers, maps, calendars, QNames, DOM nodes |

Changing any of these in `jsonix.js` breaks every generated `.d.ts` in the wild. `types/main.d.ts` (hand-written, a
proper ES module with `export namespace Jsonix`, plus deprecated global aliases for the pre-3.1 names) mirrors the same
shapes and makes `unmarshalString<E>()` / `marshalString<E>()` generic so generated element types flow through without
casts. `Context<M>` infers `M` from its mappings and reads the phantom `__rootElement` that generated
`JsonixMapping<RootElement>` constants carry, so `createUnmarshaller()` returns `Unmarshaller<RootElementOf<M>>` and
`unmarshal*` default to that union (hand-written mappings fall back to `TypedNamedValue<unknown>`). Update the file when
the public API changes; `tests/typescript/usage.ts` and `usage.node16.mts` must keep compiling and their
`@ts-expect-error` lines must keep failing.

`Jsonix.Util.deepCopy(value, parent?)` copies structurally (no shape heuristics) and re-links `PARENT` from a map of
original to copy; a copy's own `PARENT` is unset unless `parent` is given. `Jsonix.Util.setParent` is the one place
that defines the property. These live in `Util` (bundles: before `Jsonix.Class`; modular: `Util.js`).

Packaging: `package.json` has an `exports` map (`import` → `jsonix.mjs`, a thin ESM wrapper over the CommonJS bundle;
`require` → `jsonix.js`; `./jsonix.js` kept as a subpath for deep imports). Keep `jsonix.mjs` out of `.npmignore`.
Proposals for this repository live in `docs/change-requests/`.

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

- `scripts/src/test/javascript`: JsTestDriver browser tests for the modular sources; not run in CI.
- `typescript/`: an early draft of typings plus a UML diagram, not published (the published typings are in
  `nodejs/scripts/types`).
- `formats/gml-geojson`, `demos/`, `fiddles/`, `docs/Jsonix.pdf`: examples and documentation from upstream.
- `demos/` and `fiddles/` binding files (`.xjb`) predate the Jakarta namespace and are silently ignored by the current
  compiler; they are kept as historical samples only. The compiler jar is not shipped in `@mitre/jsonix`
  (`lib/.npmignore` excludes it).
