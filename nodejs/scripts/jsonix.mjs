// ES-module entry for browsers and browser bundlers (package.json "exports" -> "default" -> "import").
// No Node dependency is reachable from this file: the browser supplies DOMParser, XMLSerializer and
// XMLHttpRequest. Node and Node bundlers take jsonix.node.mjs through the "node" condition instead.
// (jsonix-CR-005 section 7.1)
import factory from './jsonix-factory.js';
const { Jsonix } = factory();
export { Jsonix };
export default { Jsonix };
