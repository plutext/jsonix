// Jsonix.DOM: XML 1.0 line-ending normalisation (jsonix-CR-004) and the consumer-supplied
// implementation (jsonix-CR-005 section 7.5).
var Jsonix = require('../jsonix').Jsonix;
var xmldom = require('@xmldom/xmldom');

var codePoints = function (s) {
	var out = [];
	for (var i = 0; i < s.length; i++) {
		out.push('U+' + s.charCodeAt(i).toString(16).toUpperCase());
	}
	return out.join(' ');
};
var text = function (xml) {
	return codePoints(Jsonix.DOM.parse(xml).documentElement.textContent);
};
var NEL = String.fromCharCode(0x85);
var LS = String.fromCharCode(0x2028);
var PS = String.fromCharCode(0x2029);

module.exports = {
	"LineEndings": {
		"Xml10KeepsNelAndLineSeparator": function (test) {
			// The three lines of the report in jsonix-CR-004, plus PARAGRAPH SEPARATOR, which is a line end in no XML version.
			test.equal('U+78 U+85 U+79', text('<?xml version="1.0"?><a>x' + NEL + 'y</a>'));
			test.equal('U+78 U+2028 U+79', text('<?xml version="1.0"?><a>x' + LS + 'y</a>'));
			test.equal('U+78 U+85 U+79', text('<?xml version="1.0"?><a>x&#x85;y</a>'));
			test.equal('U+78 U+2029 U+79', text('<?xml version="1.0"?><a>x' + PS + 'y</a>'));
			test.done();
		},
		"NoDeclarationIsXml10": function (test) {
			test.equal('U+78 U+85 U+79', text('<a>x' + NEL + 'y</a>'));
			test.equal('U+78 U+2028 U+79', text('<a>x' + LS + 'y</a>'));
			test.done();
		},
		"Xml10NormalisesCrAndCrLf": function (test) {
			test.equal('U+78 U+A U+79', text('<?xml version="1.0"?><a>x\r\ny</a>'));
			test.equal('U+78 U+A U+79', text('<?xml version="1.0"?><a>x\ry</a>'));
			test.done();
		},
		"Xml11NormalisesNelAndLineSeparator": function (test) {
			test.equal('U+78 U+A U+79', text('<?xml version="1.1"?><a>x' + NEL + 'y</a>'));
			test.equal('U+78 U+A U+79', text('<?xml version="1.1"?><a>x' + LS + 'y</a>'));
			test.equal('U+78 U+A U+79', text('<?xml version="1.1"?><a>x\r' + NEL + 'y</a>'));
			test.equal('U+78 U+2029 U+79', text('<?xml version="1.1"?><a>x' + PS + 'y</a>'));
			test.done();
		},
		"Helpers": function (test) {
			test.equal('a\nb\nc', Jsonix.DOM.normalizeLineEndings10('a\r\nb\rc'));
			test.equal('a' + NEL + 'b', Jsonix.DOM.normalizeLineEndings10('a' + NEL + 'b'));
			test.equal('a\nb\nc\nd', Jsonix.DOM.normalizeLineEndings11('a\r' + NEL + 'b' + NEL + 'c' + LS + 'd'));
			test.ok(Jsonix.DOM.isXml11('<?xml version="1.1"?><a/>'));
			test.ok(!Jsonix.DOM.isXml11('<?xml version="1.0"?><a/>'));
			test.ok(!Jsonix.DOM.isXml11('<a/>'));
			test.ok(!Jsonix.DOM.isXml11('<a version="1.1"/>'));
			test.ok(Jsonix.DOM.isXml11("\ufeff  <?xml version='1.1' encoding='UTF-8'?><a/>"), 'a BOM or whitespace before the declaration is tolerated by the check');
			test.done();
		},
		"RoundTripThroughUnmarshalAndMarshal": function (test) {
			var mapping = {
				name: 'T',
				typeInfos: [{ localName: 'A', propertyInfos: [{ name: 'value', type: 'value' }] }],
				elementInfos: [{ elementName: 'a', typeInfo: '.A' }]
			};
			var context = new Jsonix.Context([mapping]);
			var element = context.createUnmarshaller().unmarshalString('<?xml version="1.0"?><a>x' + NEL + 'y' + LS + 'z</a>');
			test.equal('U+78 U+85 U+79 U+2028 U+7A', codePoints(element.value.value));
			var xml = context.createMarshaller().marshalString(element);
			var again = context.createUnmarshaller().unmarshalString(xml);
			test.equal('U+78 U+85 U+79 U+2028 U+7A', codePoints(again.value.value));
			test.done();
		}
	},
	"Use": {
		setUp: function (callback) {
			Jsonix.DOM.use(null);
			callback();
		},
		tearDown: function (callback) {
			Jsonix.DOM.use(null);
			callback();
		},
		"DefaultIsInjectedXmldom": function (test) {
			test.strictEqual(xmldom, Jsonix.DOM.getImplementation());
			test.ok(Jsonix.DOM.isDomImplementationAvailable());
			test.done();
		},
		"SuppliedImplementationWins": function (test) {
			var parsed = 0, serialized = 0, created = 0;
			var Recording = function (options) {
				this.inner = new xmldom.DOMParser(options);
			};
			Recording.prototype.parseFromString = function (text, mimeType) {
				parsed++;
				return this.inner.parseFromString(text, mimeType);
			};
			var Serializer = function () { this.inner = new xmldom.XMLSerializer(); };
			Serializer.prototype.serializeToString = function (node) { serialized++; return this.inner.serializeToString(node); };
			var Implementation = function () { this.inner = new xmldom.DOMImplementation(); };
			Implementation.prototype.createDocument = function () { created++; return this.inner.createDocument(); };
			Jsonix.DOM.use({ DOMParser: Recording, XMLSerializer: Serializer, DOMImplementation: Implementation });
			var doc = Jsonix.DOM.parse('<?xml version="1.0"?><a>x' + NEL + 'y</a>');
			test.equal('U+78 U+85 U+79', codePoints(doc.documentElement.textContent), 'normalisation applies through a supplied parser too');
			test.equal('<a>x' + NEL + 'y</a>', Jsonix.DOM.serialize(doc.documentElement));
			Jsonix.DOM.createDocument();
			test.deepEqual([1, 1, 1], [parsed, serialized, created]);
			Jsonix.DOM.use(null);
			test.strictEqual(xmldom, Jsonix.DOM.getImplementation());
			test.done();
		}
	}
};
