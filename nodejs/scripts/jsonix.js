// @docx4j/jsonix: CommonJS / UMD entry (jsonix-CR-005). The library itself is jsonix-factory.js, a function of its
// injected dependencies (@xmldom/xmldom, xmlhttprequest, fs); this file resolves them and exports the result.
var _jsonix_factory = (typeof require === 'function') ? require('./jsonix-factory.js') : undefined;

// Module loading (jsonix-CR-005). ES-module consumers never reach this file: package.json "exports" routes
// them to jsonix.node.mjs (Node) or jsonix.mjs (browsers). This footer serves require() consumers, CommonJS
// bundles, AMD loaders and plain <script> tags.
if (typeof require === 'function') {
	if (typeof define !== 'function') {
		if (typeof window === 'undefined') {
			// Node, or a CommonJS bundle built for Node: resolve the dependencies with literal require calls,
			// which bundlers can see. Each in its own try so that a missing one degrades to the next option.
			var _jsonix_xmldom_module, _jsonix_xmlhttprequest_module, _jsonix_fs_module;
			try { _jsonix_xmldom_module = require('@xmldom/xmldom'); } catch (e1) { }
			try { _jsonix_xmlhttprequest_module = require('xmlhttprequest'); } catch (e2) { }
			try { _jsonix_fs_module = require('fs'); } catch (e3) { }
			if (typeof _jsonix_xmldom_module === 'undefined' && typeof console !== 'undefined' && console.warn) {
				console.warn('Jsonix: @xmldom/xmldom could not be required, so XML parsing falls back to browser DOM globals, which Node does not have. Install @xmldom/xmldom, or supply an implementation with Jsonix.DOM.use(...).');
			}
			module.exports = _jsonix_factory(_jsonix_xmldom_module, _jsonix_xmlhttprequest_module, _jsonix_fs_module);
		}
		else {
			// A browser with a CommonJS loader (browserify, webpack): the browser provides the DOM.
			module.exports = _jsonix_factory();
		}
	}
	else {
		// AMD (RequireJS) in the browser.
		define([], _jsonix_factory);
	}
}
else {
	// Plain <script>: set Jsonix as a global.
	if (typeof _jsonix_factory !== 'function') {
		throw new Error('jsonix.js requires a module loader for jsonix-factory.js; for a plain <script> use dist/Jsonix-all.js.');
	}
	var Jsonix = _jsonix_factory().Jsonix;
}
