Jsonix.DOM = {
	// A DOM implementation supplied by the consumer (jsonix-CR-005 section 7.5): an object with DOMParser,
	// XMLSerializer and/or DOMImplementation constructors, such as the xmldom module. Consulted before
	// the xmldom injected into the factory and before the browser globals.
	implementation: null,
	use: function (implementation) {
		Jsonix.DOM.implementation = implementation || null;
	},
	getImplementation: function () {
		if (Jsonix.DOM.implementation) {
			return Jsonix.DOM.implementation;
		}
		if (typeof _jsonix_xmldom !== 'undefined' && _jsonix_xmldom) {
			return _jsonix_xmldom;
		}
		return null;
	},
	// Line-ending normalisation before parsing (jsonix-CR-004). XML 1.0 section 2.11: CR LF and bare CR become LF.
	normalizeLineEndings10: function (text) {
		return text.replace(/\r\n?/g, '\n');
	},
	// XML 1.1 section 2.11: additionally CR NEL, NEL (U+0085) and LINE SEPARATOR (U+2028) become LF.
	normalizeLineEndings11: function (text) {
		return text.replace(/\r[\n\u0085]/g, '\n').replace(/[\r\u0085\u2028]/g, '\n');
	},
	// True when the text starts with an XML declaration whose version is 1.1 (a BOM or whitespace may precede it).
	isXml11: function (text) {
		return typeof text === 'string' && /^[\s\uFEFF]*<\?xml\s[^>]*?version\s*=\s*(["'])1\.1\1/.test(text);
	},
	isDomImplementationAvailable : function () {
		if (Jsonix.DOM.getImplementation() !== null)
		{
			return true;
		} else if (typeof document !== 'undefined' && Jsonix.Util.Type.exists(document.implementation) && Jsonix.Util.Type.isFunction(document.implementation.createDocument)) {
			return true;
		} else {
			return false;
		}
	},
	createDocument : function() {
		// REWORK
		// Node.js
		if (Jsonix.DOM.getImplementation() !== null)
		{
			return new (Jsonix.DOM.getImplementation().DOMImplementation)().createDocument();
		} else if (typeof document !== 'undefined' && Jsonix.Util.Type.exists(document.implementation) && Jsonix.Util.Type.isFunction(document.implementation.createDocument)) {
			return document.implementation.createDocument('', '', null);
		} else if (typeof ActiveXObject !== 'undefined') {
			return new ActiveXObject('MSXML2.DOMDocument');
		} else {
			throw new Error('Error created the DOM document.');
		}
	},
	serialize : function(node) {
		Jsonix.Util.Ensure.ensureExists(node);
		// REWORK
		// Node.js
		if (Jsonix.DOM.getImplementation() !== null)
		{
			return (new (Jsonix.DOM.getImplementation().XMLSerializer)()).serializeToString(node);
		} else if (Jsonix.Util.Type.exists(XMLSerializer)) {
			return (new XMLSerializer()).serializeToString(node);
		} else if (Jsonix.Util.Type.exists(node.xml)) {
			return node.xml;
		} else {
			throw new Error('Could not serialize the node, neither XMLSerializer nor the [xml] property were found.');
		}
	},
	parse : function(text) {
		Jsonix.Util.Ensure.ensureExists(text);
		if (Jsonix.DOM.getImplementation() !== null)
		{
			var normalizeLineEndings = Jsonix.DOM.isXml11(text) ? Jsonix.DOM.normalizeLineEndings11 : Jsonix.DOM.normalizeLineEndings10;
			return (new (Jsonix.DOM.getImplementation().DOMParser)({ normalizeLineEndings: normalizeLineEndings })).parseFromString(text, 'application/xml');
		} else if (typeof DOMParser != 'undefined') {
			return (new DOMParser()).parseFromString(text, 'application/xml');
		} else if (typeof ActiveXObject != 'undefined') {
			var doc = Jsonix.DOM.createDocument('', '');
			doc.loadXML(text);
			return doc;
		} else {
			var url = 'data:text/xml;charset=utf-8,' + encodeURIComponent(text);
			var request = new XMLHttpRequest();
			request.open('GET', url, false);
			if (request.overrideMimeType) {
				request.overrideMimeType("text/xml");
			}
			request.send(null);
			return request.responseXML;
		}
	},
	load : function(url, callback, options) {

		var request = Jsonix.Request.INSTANCE;

		request.issue(
						url,
						function(transport) {
							var result;
							if (Jsonix.Util.Type.exists(transport.responseXML) && Jsonix.Util.Type.exists(transport.responseXML.documentElement)) {
								result = transport.responseXML;
							} else if (Jsonix.Util.Type.isString(transport.responseText)) {
								result = Jsonix.DOM.parse(transport.responseText);
							} else {
								throw new Error('Response does not have valid [responseXML] or [responseText].');
							}
							callback(result);

						}, function(transport) {
							throw new Error('Could not retrieve XML from URL [' + url	+ '].');

						}, options);
	},
	xlinkFixRequired : null,
	isXlinkFixRequired : function ()
	{
		if (Jsonix.DOM.xlinkFixRequired === null)
		{
			if (typeof navigator === 'undefined')
			{
				Jsonix.DOM.xlinkFixRequired = false;
			}
			else if (!!navigator.userAgent && (/Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor)))
			{
				var doc = Jsonix.DOM.createDocument();
				var el = doc.createElement('test');
				el.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', 'urn:test');
				doc.appendChild(el);
				var testString = Jsonix.DOM.serialize(doc);
				Jsonix.DOM.xlinkFixRequired = (testString.indexOf('xmlns:xlink') === -1);
			}
			else
			{
				Jsonix.DOM.xlinkFixRequired = false;
			}
		}
		return Jsonix.DOM.xlinkFixRequired;
	}
};