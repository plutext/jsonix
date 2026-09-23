# jsonix-CR-005: A bundled runtime loses `@xmldom/xmldom` and reaches for browser globals

**Status:** Proposed 2026-09-25; reviewed by the runtime side 2026-09-24 (section 7): accepted, with the ESM entry split by `exports` condition
**Depends on:** nothing; 3.2.1 is the baseline (3.2.2 unchanged in this area)
**Requested by:** `plutext/docx4j-generated-objects-ts` CR-005 section 6.2, whose bundle test had to
supply `globalThis.DOMParser` to make an esbuild bundle work; the first consumer that will meet it
for real is `plutext/docx4j-ts-editor` ED-002 E4 (`@docx4j/editor-mcp`), if it ships bundled for Node
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

The runtime receives `@xmldom/xmldom` by AMD dependency injection: `jsonix.js` is a UMD whose
footer calls `require('amdefine')(module)` and then
`define(["@xmldom/xmldom", "xmlhttprequest", "fs"], _jsonix_factory)`. That works when Node loads
the file from disk. It does not survive a bundler: `amdefine` needs a real CommonJS `module` and a
real `require.main`, a bundler gives it neither, the `try` fails, and the `catch` calls
`_jsonix_factory()` **with no arguments**. `_jsonix_xmldom` is then `undefined` and every DOM
operation falls through to the browser globals the factory tries next - `DOMParser`,
`XMLSerializer`, `DOMImplementation`, and finally `XMLHttpRequest`, which Node does not have.

So: a bundle for the **browser** works (the globals are real); a bundle for **Node** throws
`ReferenceError: XMLHttpRequest is not defined` on the first unmarshal, unless the consumer sets
those globals itself.

## 2. Evidence (3.2.1, esbuild 0.28.2, Node 18, 2026-09-25)

`esbuild --bundle --platform=node --format=esm` over a one-line consumer of
`@docx4j/generated-objects-ts`, which imports this runtime. Running the bundle:

```
ReferenceError: XMLHttpRequest is not defined
    at Object.parse (out.mjs:433:27)
```

With a probe inserted in the bundle's `catch`, the path is not in doubt:

```
[probe] amdefine path threw: Cannot read properties of undefined (reading 'apply')
[probe] calling the factory with no dependencies
```

With `globalThis.DOMParser` and `globalThis.XMLSerializer` set from `@xmldom/xmldom` before the
bundle loads, the same bundle unmarshals and marshals correctly. Nothing else about the bundle is
wrong: this is the only obstacle between a bundled Node consumer and a working runtime.

The relevant footer (`nodejs/scripts/jsonix.js`, around line 6103):

```js
if (typeof require === 'function') {
	if (typeof define !== 'function') {
		try {
			var define = require('amdefine')(module);
			if (typeof window === 'undefined') {
				define(["@xmldom/xmldom", "xmlhttprequest", "fs"], _jsonix_factory);
			} else {
				define([], _jsonix_factory);
			}
		} catch (e) {
			if (typeof exports === "object") {
				module.exports = _jsonix_factory();     // <- no xmldom
			} else {
				var Jsonix = _jsonix_factory().Jsonix;  // <- no xmldom
			}
		}
	} else {
		define([], _jsonix_factory);                    // <- no xmldom
	}
}
```

Note that the `catch` is silent, which is why this presents as a missing `XMLHttpRequest` a long
way from its cause.

## 3. What to change

The ESM entry is the right place, because it is already a thin file whose whole purpose is to give
bundlers something static to look at:

```js
// jsonix.mjs today
import cjs from './jsonix.js';
export const Jsonix = cjs.Jsonix;
```

**Proposal A (recommended): the ESM entry supplies the dependencies.** Export the factory from the
CommonJS file (or a small ESM-visible shim), and have `jsonix.mjs` import `@xmldom/xmldom`
statically and call it:

```js
import * as xmldom from '@xmldom/xmldom';
import factory from './jsonix-factory.js';
const { Jsonix } = factory(xmldom);
export { Jsonix };
```

A static import is exactly what every bundler resolves, and Node resolves it too, so the ESM path
stops depending on `amdefine` altogether. `require()` consumers keep the UMD unchanged, which is
what `modules/*.js` in the generated-objects package relies on. `xmlhttprequest` and `fs` can stay
injected as they are, or be dropped from the ESM path since neither is used for parsing.

**Proposal B (smaller, if A is too much surgery): a literal `require` inside the factory.** Resolve
xmldom at first use with a plain `require('@xmldom/xmldom')` in a `try`, instead of through AMD
injection. A literal specifier is visible to bundlers where the AMD array is not. This keeps one
file but leaves the ESM entry a wrapper around CommonJS.

**Proposal C (worth having either way): a supported injection point.** `Jsonix.DOM.use({ DOMParser,
XMLSerializer, DOMImplementation })`, so a consumer in an environment the runtime cannot detect -
a worker, a sandbox, a runtime with a different DOM - can say what to use, rather than setting
globals. This is what the objects package's bundle test does by hand today.

**And regardless of which: do not swallow the error.** The `catch` should warn, naming the
dependency it could not inject, so the next person meets the cause rather than
`XMLHttpRequest is not defined`.

## 4. Tests

- A bundle test in this repository: `esbuild --bundle --platform=node --format=esm` over a consumer
  that unmarshals a small document, run with **no globals set**, in a directory with nothing beside
  the bundle. It fails today and must pass after.
- The same for `--format=cjs`, since a CommonJS bundle takes the same footer.
- `plutext/docx4j-generated-objects-ts` `test/bundle.mjs` then drops its `globalThis.DOMParser` and
  `globalThis.XMLSerializer` lines and the comment explaining them; that deletion is the check that
  this CR landed.

## 5. Consumers

- `@docx4j/generated-objects-ts` (CR-005): bundles with no configuration since 2026-09-24, but its
  bundle test sets the globals; it is the reason this CR exists.
- `plutext/docx4j-ts-editor`: unaffected in the browser, where the globals are real - which is why
  its Vite build never saw this. Its E4 `@docx4j/editor-mcp` would be the first real casualty if it
  ships bundled for Node, and ED-002 records that.
- Office JS add-ins: unaffected (browser).

## 6. What this is not

Not about how the mappings are loaded: that was the objects package's own defect and is fixed there
(its CR-005, a registry of literal imports). This is only about how the runtime gets its DOM.

## 7. Runtime review (2026-09-24)

Accepted: the diagnosis is right, the footer's silent `catch` is the cause, and the fix belongs in
this repository. Three refinements to the proposal before implementation.

**7.1 Proposal A must not put `@xmldom/xmldom` into browser bundles.** `jsonix.mjs` is the single
ESM entry today, and it is what Vite resolves for `docx4j-ts-editor` and what an Office JS add-in
bundle resolves. A static `import * as xmldom from '@xmldom/xmldom'` there would pull xmldom into
every browser bundle and, worse, make the browser use xmldom instead of its native `DOMParser` and
`XMLSerializer` (slower, and different serialisation details). So the ESM entry has to fork on the
package.json `exports` condition, which every bundler and Node itself honour:

```json
".": {
  "types": "./types/main.d.ts",
  "node":    { "import": "./jsonix.node.mjs", "require": "./jsonix.js" },
  "default": { "import": "./jsonix.mjs",      "require": "./jsonix.js" }
}
```

- `jsonix.node.mjs`: static imports of `@xmldom/xmldom`, `xmlhttprequest` and `node:fs`, then
  `factory(xmldom, xmlhttprequest, fs)`. esbuild with `--platform=node`, and Node, take this.
- `jsonix.mjs`: `factory()` with no dependencies, for browsers and browser bundlers (`default`,
  and `browser` if a bundler asks for it). No Node dependency is reachable from this file.

**7.2 The factory needs its own file.** Both ESM entries call the factory, so it must be importable
without running the UMD footer. `jsonix.js` is generated as header + body + footer; split it into
`jsonix-factory.js` (CommonJS, `module.exports = _jsonix_factory`, the body) and a short `jsonix.js`
that requires it and keeps today's UMD footer for `require()` consumers. The modular sources
already have the header and footer as separate fragments, so this is a change to how the bundle
is assembled, not to the library. `dist/Jsonix-all.js` (browser globals) is unaffected.

**7.3 Proposal B is the right fallback for the CommonJS footer, but only there.** A CommonJS
*bundle* (`--format=cjs`) still runs the footer, so the `catch` should try literal
`require('@xmldom/xmldom')`, `require('xmlhttprequest')` and `require('fs')`, each in its own
`try`, and pass what it gets to the factory. Literal specifiers are what a Node bundler resolves.
They must stay out of the ESM files (7.1), otherwise a browser bundler resolving a `require()`
condition would try to bundle `fs`; that residual case (CommonJS consumer code in a browser
bundle) is documented as needing those three marked external, as it already does today.

**7.4 Warn only where it is a defect.** The fallback to browser globals is the correct path in a
browser bundle, so the warning must fire only when `typeof window === 'undefined'` and xmldom could
not be obtained, naming `@xmldom/xmldom`. Use `console.warn` guarded by `typeof console`.

**7.5 Proposal C is worth having** as `Jsonix.DOM.use({ DOMParser, XMLSerializer, DOMImplementation })`,
consulted before the injected xmldom and before the globals, for workers and sandboxes. It also
gives the bundle test a way to assert the injection without touching globals.

**Tests:** as section 4, with esbuild pinned as a dev dependency and run for `--platform=node` in
both `esm` and `cjs` formats, and additionally a `--platform=browser --format=esm` bundle that must
not contain the string `@xmldom/xmldom` (guards 7.1).

**Versioning:** this changes the package's entry files, so 3.3.0 rather than a patch; jsonix-CR-004
(a parser fix) can ship in the same release. jsonix-CR-003 part 2 is not tied to the number 3.3.0
and moves to whatever minor follows it.
