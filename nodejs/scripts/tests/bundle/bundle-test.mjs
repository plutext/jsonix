// Bundle tests (jsonix-CR-005). A consumer of @docx4j/jsonix is bundled with esbuild and the bundle
// is run from a directory with nothing beside it, so the runtime must have obtained its DOM through
// the bundle itself:
//   - platform node, format esm, `import` consumer: the "node"+"import" condition -> jsonix.node.mjs;
//   - platform node, format cjs, `import` consumer: the same entry (bundlers choose the condition by
//     the import syntax, not the output format), so import.meta.url is empty and the lazy require
//     falls back to the working directory;
//   - platform node, format cjs, `require()` consumer: the "require" condition -> jsonix.js, the UMD
//     footer's literal require() fallback;
//   - platform browser, format esm: the "default" condition -> jsonix.mjs, which must not drag in
//     @xmldom/xmldom or xmlhttprequest; run in Node with Jsonix.DOM.use(xmldom) to prove the
//     injection point works on a browser bundle.
import * as esbuild from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = mkdtempSync(join(tmpdir(), 'jsonix-bundle-'));
// Resolve @docx4j/jsonix as a consumer would, through node_modules, so package.json "exports" and its
// "node"/"default" conditions apply (an esbuild alias to a directory would bypass them).
mkdirSync(join(work, 'node_modules', '@docx4j'), { recursive: true });
symlinkSync(packageDir, join(work, 'node_modules', '@docx4j', 'jsonix'), 'dir');

const MAPPING = `{ name: 'T', typeInfos: [{ localName: 'A', propertyInfos: [{ name: 'value', type: 'value' }] }], elementInfos: [{ elementName: 'a', typeInfo: '.A' }] }`;
// The consumer parses a NEL through the runtime (CR-004 on the bundled path too) and marshals it back.
const consumer = (exportIt, useRequire = false) => `
${useRequire ? "const { Jsonix } = require('@docx4j/jsonix');" : "import { Jsonix } from '@docx4j/jsonix';"}
${useRequire ? '' : 'export '}function run() {
  const context = new Jsonix.Context([${MAPPING}]);
  const element = context.createUnmarshaller().unmarshalString('<?xml version="1.0"?><a>x' + String.fromCharCode(0x85) + 'y</a>');
  const xml = context.createMarshaller().marshalString(element);
  return { text: element.value.value, xml, hasImplementation: Jsonix.DOM.getImplementation() !== null };
}
${exportIt ? 'export { Jsonix };' : 'console.log(JSON.stringify(run()));'}
`;

async function bundle(name, { useRequire = false, ...options }) {
  const entry = join(work, `${name}.entry.${useRequire ? 'cjs' : 'mjs'}`);
  writeFileSync(entry, consumer(options.platform === 'browser', useRequire));
  const outfile = join(work, `${name}.out.${options.format === 'cjs' ? 'cjs' : 'mjs'}`);
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: true,
    outfile,
    logLevel: 'silent',
    absWorkingDir: work,
    ...options,
  });
  return outfile;
}

const expected = { text: 'xy', xml: '<a>xy</a>', hasImplementation: true };
const results = [];
try {
  const nodeCases = [
    { name: 'node-esm-import', format: 'esm', useRequire: false, expectEntry: 'jsonix.node.mjs' },
    { name: 'node-cjs-import', format: 'cjs', useRequire: false, expectEntry: 'jsonix.node.mjs' },
    { name: 'node-cjs-require', format: 'cjs', useRequire: true, expectEntry: 'jsonix.js' },
  ];
  for (const c of nodeCases) {
    const out = await bundle(c.name, { platform: 'node', format: c.format, target: 'node18', useRequire: c.useRequire });
    const source = readFileSync(out, 'utf8');
    assert.ok(!source.includes("require('amdefine')") && !source.includes('require("amdefine")'), `${c.name}: amdefine must be gone`);
    // esbuild annotates each bundled file with a comment naming it.
    assert.ok(source.includes(`/${c.expectEntry}`), `${c.name}: expected the bundle to contain ${c.expectEntry}`);
    if (c.expectEntry === 'jsonix.js') assert.ok(!source.includes('/jsonix.node.mjs'), `${c.name}: must not contain jsonix.node.mjs`);
    const stdout = execFileSync(process.execPath, [out], { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const actual = JSON.parse(stdout.trim().split('\n').pop());
    assert.deepEqual(actual, expected, `${c.name} bundle`);
    results.push(`${c.name}: ok via ${c.expectEntry} (${(source.length / 1024).toFixed(0)} KB)`);
  }

  const browserOut = await bundle('browser-esm', { platform: 'browser', format: 'esm', target: 'es2020' });
  const browserSource = readFileSync(browserOut, 'utf8');
  // Module paths, not bare words: the factory's parameter is named _jsonix_xmlhttprequest.
  for (const forbidden of ['@xmldom/xmldom', 'node_modules/xmlhttprequest', '"node:fs"', "'node:fs'", 'jsonix.node.mjs', 'createRequire']) {
    assert.ok(!browserSource.includes(forbidden), `browser bundle must not contain ${forbidden}`);
  }
  // No DOM in Node: the browser bundle's parse must fail until an implementation is supplied.
  const browserModule = await import(pathToFileURL(browserOut).href);
  assert.throws(() => browserModule.run(), /XMLHttpRequest|DOMParser|not defined/, 'browser bundle has no DOM in Node');
  const xmldom = await import('@xmldom/xmldom');
  browserModule.Jsonix.DOM.use(xmldom.default ?? xmldom);
  assert.deepEqual(browserModule.run(), expected, 'browser bundle with Jsonix.DOM.use(xmldom)');
  browserModule.Jsonix.DOM.use(null);
  results.push(`browser esm: ok (${(browserSource.length / 1024).toFixed(0)} KB, no xmldom)`);
} catch (e) {
  console.error(`bundle-test: failed; bundles kept in ${work}`);
  throw e;
}
rmSync(work, { recursive: true, force: true });
console.log('bundle-test: ' + results.join('; '));
