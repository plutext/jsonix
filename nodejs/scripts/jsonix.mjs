// ES-module entry point (package.json "exports" -> "import").
// The runtime stays a single CommonJS bundle (jsonix.js); this wrapper gives ESM consumers and
// bundlers a static named export, which the UMD footer of jsonix.js cannot provide.
import cjs from './jsonix.js';
export const Jsonix = cjs.Jsonix;
export default cjs;
