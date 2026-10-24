# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Plutext's fork of the Jsonix runtime (repository `plutext/jsonix`, npm `@docx4j/jsonix` from 3.2.0; continues MITRE's
`@mitre/jsonix`, which forked highsource/jsonix). Jsonix converts XML <-> JavaScript objects
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
npm run test:bundle                     # esbuild bundles (node esm, node cjs, browser esm) run from an empty directory
```

CI runs all four (`.github/workflows/run-tests.yml`).

- The `Request` suite (`tests/request.js`) starts a `node-static` server on port 8080. If 8080 is in use the full
  run reports an "undone" failure (`EADDRINUSE`); this is environmental, not a code regression.
- nodeunit tests must call `test.done()`; a missing call shows up as an "Undone tests" failure.
- Release: follow `RELEASING.md` (version in `nodejs/scripts/package.json`, checks, tarball inspection, annotated bare-version
  tag pushed *before* the GitHub release, release created from that tag). The publish workflow refuses unless the tag equals
  the package version, re-runs the checks, strips `tests/`, packs, and publishes via npm trusted publishing.

The Maven build (`pom.xml`, `*.bat`) is the original upstream pipeline (Java 8, legato/yuicompressor/JsTestDriver
plugins). CI does not use it and it is not expected to work; don't reach for it to rebuild bundles.

## The three copies of the library (important)

The runtime exists as three checked-in copies that have **diverged** and are patched by hand in this fork:

| Path | Role |
|---|---|
| `nodejs/scripts/jsonix-factory.js` | The npm-published library: header + body as `var _jsonix_factory = function (xmldom, xmlhttprequest, fs) {...}; module.exports = _jsonix_factory;`. What the tests load (through `jsonix.js`). **Edit this one first.** CRLF line endings, as is `dist/Jsonix-all.js`; the modular sources are LF. `nodejs/scripts/jsonix.js` is a 40-line CommonJS/UMD wrapper that requires the factory and resolves the dependencies (see "Entry points"). |
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
| `onUnexpectedAttribute` fires for every attribute the class info does not declare, except namespace declarations and (with `supportXsiType`) `xsi:type`, and never for a class with an `anyAttribute`; `onUnexpectedElement` fires at the element skip and never for a class with an `any` wildcard | `ClassInfo.unmarshal` (jsonix-CR-006). objects-ts's fidelity test and core-ts's `validateXml` conclude things from these exact conditions: a report that is absent looks like nothing dropped, so changing them is a change to what two repositories' tests can prove. The attribute report sits inside the `structure.attributes` guard, which is redundant (`attributes: {}` is set unconditionally when the structure is built), so it cannot suppress a report. An attributes-only class meeting an unexpected child does not report it but throws, located by the enclosing property read (`w:bogus (line 1): Illegal state: must be END_ELEMENT.`); unlocated only at the document root. A typed-value error aborts the unmarshal, so a caller's list is complete for drops and first-only for type errors, unless `onInvalidValue` (jsonix-CR-010) is set, when the callback decides what the refused attribute value becomes |
| `onInvalidValue` sees every attribute spelling that is not exactly one the type accepts | `Boolean.parse` and `EnumLeafInfo.parse` compare exactly: no whiteSpace collapse (although XSD gives xs:boolean `whiteSpace="collapse"`) and no case folding. objects CR-013 derives Word's reading of `" false"` or `FALSE` (on) from the refused raw text, so collapsing or folding would change Word documents' readings silently (jsonix-CR-010 section 13; guarded by `tests/xsd.js` and `tests/invalidvalues.js`) |
| XML 1.0 text keeps raw U+0085 and U+2028 | `Jsonix.DOM.parse` passes xmldom a `normalizeLineEndings` for the document's XML version (jsonix-CR-004); xmldom's default applies the 1.1 rule to everything |
| `readonly PARENT?: <union of containers>` on class interfaces only | set by `ClassInfo.unmarshal` from a result stack on the `Input` when `context.parentPointers` is on; non-enumerable; never on wrappers, maps, calendars, QNames, DOM nodes |

Changing any of these in `jsonix.js` breaks every generated `.d.ts` in the wild. The reverse direction has one known
source of churn: since compiler CR-007 the compiler emits attributes of multi-attribute-group types sorted by name
(XJC's order was JVM-dependent), so regenerated fixtures for such schemas reorder once; only marshalled attribute order
changes, the unmarshaller is order-independent, and it is not a runtime change. `types/main.d.ts` (hand-written, a
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

## Entry points (jsonix-CR-005)

`package.json` `exports` routes by condition: `node` + `import` → `jsonix.node.mjs` (static `import` of `@xmldom/xmldom`
and `node:fs`; `xmlhttprequest` resolved lazily with `createRequire` because it requires Node built-ins at load time,
which ESM bundles cannot carry); `default` + `import` → `jsonix.mjs` (no dependencies: the browser supplies the DOM;
must never import a Node package); `require` → `jsonix.js` (UMD wrapper: literal `require()` of the three
dependencies, each in its own `try`, so CommonJS bundles resolve them; warns on `console` when xmldom is missing outside
a browser). `Jsonix.DOM.use(impl)` lets a consumer supply DOMParser/XMLSerializer/DOMImplementation, consulted before
the injected xmldom and the globals. `npm run test:bundle` (esbuild) builds node-esm, node-cjs and browser-esm bundles of
a consumer and runs them from an empty directory; the browser bundle must not contain the string `@xmldom/xmldom`, so
keep that literal out of `jsonix-factory.js` (comments included). `amdefine` is gone. Keep `jsonix.mjs`,
`jsonix.node.mjs` and `jsonix-factory.js` out of `.npmignore`.
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

**Per-call options and callbacks (jsonix-CR-006, CR-008).** `Context.createUnmarshaller(options)` and `createMarshaller(options)`
build the binder over `deriveContext(options)`, an `Object.create(context)` with the options copied on, so callbacks
(`onUnexpectedElement`, `onUnexpectedAttribute`, `onElement`), `parentPointers`, `supportXsiType` and `namespacePrefixes`
can be set per call and the shared context is never written. The hooks sit in `ClassInfo` (attribute loop, element skip,
top of `marshal`, deduped per output element, and end of `unmarshal`, where `onElement` reports the source element
captured on entry with the complete object, children first) and at the two `writeNode` sites; wildcards keep content
and report nothing, and wildcard DOM content is the source node itself (a documented promise since CR-008). Errors
from `unmarshalProperty` / `unmarshalPropertyValue` are rethrown once via `ClassInfo.locateError` with element,
attribute and line.

**Refused attribute values (jsonix-CR-010).** Two callbacks hand a refused value to the caller:
- `onInvalidValue(text, propertyInfo, classInfo, node, error)` is consulted in `unmarshalPropertyValue` only after
  an attribute's parse has failed. It returns the value to store, `undefined` or `null` to leave the property unset,
  or throws, which is located.
- `onUnprintableValue(value, propertyInfo, classInfo, error)` is consulted in `AttributePropertyInfo.marshal` when
  print fails. It returns a string to write, or `undefined`/`null` to omit the attribute.

Both are per-call options. Unset, the errors are exactly what they were. The runtime holds no Word rules: the
objects facade scopes its policy by `classInfo.module.name`.

**Schema defaults (jsonix-CR-009).** `AttributePropertyInfo` keeps the mapping's `defaultValue` / `dv` (the
compiler emits it in the runtime's representation). The only readers are `Context.getDefaultValue(typeName,
propertyName)` and `Context.valueOrDefault(object, propertyName, typeName?)`:
- `getDefaultValue` walks the base types and returns `undefined` for a non-attribute, undeclared or
  undefaulted property. It throws for a type that is not a class info.
- `valueOrDefault` returns the value when it exists, by marshal's own test, and the default otherwise.

Unmarshal and marshal never apply a default, so an absent attribute stays absent. objects' fidelity hashes
depend on that, and so do consumers that read "absent" as "inherit". Element defaults are not applied (XSD
gives them to a present, empty element).

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
  compiler; they are kept as historical samples only. The compiler jar is not shipped in `@docx4j/jsonix`
  (`lib/.npmignore` excludes it).

## Portfolio task registry

This repository's change requests are indexed, with their dependencies on work in the other
docx4j repositories, in `../docx4j-portfolio/tasks.yaml` (ids `<repo>/<CR>[.<phase>]`; this
repository's key is `jsonix`, so `jsonix-CR-003` is `jsonix/CR-003`).

- When a CR's status changes (a phase lands; a CR is proposed, deferred or abandoned) or its
  dependencies change, do not edit `tasks.yaml` yourself: send the change, in the same session, to
  the session running in `~/git/docx4j-portfolio` (find it with ListAgents; its name suffix
  changes). Give the entry id, the exact new `status`, `depends_on` and `notes` (or the whole entry,
  for a new CR or phase), and any CR Status line to re-baseline in `scripts/status-snapshots.yaml`.
  It applies the change, runs `tasks.py check`, `graph` and `accept`, and commits. The same applies
  to `scripts/status-snapshots.yaml` and `docs/dependencies.md`. (Jason's rule, 2026-10-17.)
- Only when no docx4j-portfolio session is running, edit directly: run
  `python3 ../docx4j-portfolio/scripts/tasks.py check` (it reports `CHANGED` for each CR whose
  Status line was edited), then `accept` once the entry agrees (and `graph` if dependencies
  changed), and commit only your own hunks through a temporary index built from HEAD, never the
  shared index (other sessions stage in that working tree).
- Before starting a CR or phase, check `python3 ../docx4j-portfolio/scripts/tasks.py blocked`: it
  may be waiting on work in another repository.
