// ES-module entry for Node and Node bundlers (package.json "exports" -> "node" -> "import").
// The DOM dependency is a static import, which every bundler resolves, instead of the UMD footer's
// runtime resolution that a bundle cannot perform. (jsonix-CR-005 section 7.1)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import xmldom from '@xmldom/xmldom';
import factory from './jsonix-factory.js';

// xmlhttprequest is a CommonJS package that requires Node built-ins (url, http, https, child_process)
// at load time, which an ES-module bundle cannot carry: esbuild emits "Dynamic require of 'url' is not
// supported". It is needed only by Unmarshaller.unmarshalURL and Jsonix.DOM.load, so it is resolved
// lazily, at first use, with a real require that bundlers leave alone. Parsing never touches it.
// import.meta.url is empty when a bundler emits CommonJS from this file (it applies the "import"
// condition to any `import` statement, whatever the output format); resolve from the working
// directory then.
const nodeRequire = (() => {
  try {
    return createRequire(import.meta.url);
  } catch (e) {
    return createRequire(process.cwd() + '/');
  }
})();
const xmlhttprequest = {
  get XMLHttpRequest() {
    try {
      return nodeRequire('xmlhttprequest').XMLHttpRequest;
    } catch (e) {
      throw new Error('Jsonix: unmarshalURL / Jsonix.DOM.load need the xmlhttprequest package, which could not be loaded: ' + e.message);
    }
  },
};

const { Jsonix } = factory(xmldom, xmlhttprequest, fs);
export { Jsonix };
export default { Jsonix };
