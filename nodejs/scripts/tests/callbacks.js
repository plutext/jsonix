// jsonix-CR-006: report what unmarshalling drops (onUnexpectedElement, onUnexpectedAttribute),
// record what marshalling writes (onElement), locate errors from wrongly typed values, and the
// per-call options on createUnmarshaller / createMarshaller.
var Jsonix = require('../jsonix').Jsonix;

var NS = 'urn:test';
var mapping = {
	name: 'test',
	defaultElementNamespaceURI: NS,
	typeInfos: [
		{ localName: 'Style', propertyInfos: [
			{ name: 'id', type: 'attribute' },
			{ name: 'size', type: 'attribute', typeInfo: 'Integer' },
			{ name: 'name', type: 'element', typeInfo: 'String' }
		] },
		{ localName: 'BigStyle', baseTypeInfo: '.Style', propertyInfos: [{ name: 'weight', type: 'attribute', typeInfo: 'Integer' }] },
		{ localName: 'Styles', propertyInfos: [{ name: 'style', type: 'element', typeInfo: '.Style', collection: true }] },
		{ localName: 'Open', propertyInfos: [
			{ name: 'id', type: 'attribute' },
			{ name: 'others', type: 'anyAttribute' },
			{ name: 'content', type: 'anyElement', collection: true, allowDom: true, allowTypedObject: true }
		] }
	],
	elementInfos: [
		{ elementName: 'styles', typeInfo: '.Styles' },
		{ elementName: 'style', typeInfo: '.Style' },
		{ elementName: 'open', typeInfo: '.Open' }
	]
};
var context = new Jsonix.Context([mapping]);

var STYLES = '<?xml version="1.0"?>\n' +
	'<t:styles xmlns:t="urn:test" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
	'  <t:style id="Normal" size="20" bogusAttr="x"/>\n' +
	'  <bogus/>\n' +
	'  <t:style xsi:type="t:BigStyle" id="H1" size="28" weight="700"/>\n' +
	'</t:styles>';

module.exports = {
	"UnexpectedElement": {
		"ReportedWithLocation": function (test) {
			var reports = [];
			var unmarshaller = context.createUnmarshaller({
				onUnexpectedElement: function (name, node, classInfo) {
					reports.push({ element: name.localPart, line: node.lineNumber, column: node.columnNumber, inClass: classInfo.name });
				}
			});
			var styles = unmarshaller.unmarshalString(STYLES).value;
			test.deepEqual([{ element: 'bogus', line: 4, column: 3, inClass: 'test.Styles' }], reports);
			test.equal(2, styles.style.length, 'the rest is read as before');
			test.done();
		},
		"NothingWithAnyWildcard": function (test) {
			var reports = [];
			var open = context.createUnmarshaller({ onUnexpectedElement: function (name) { reports.push(name.localPart); } })
				.unmarshalString('<t:open xmlns:t="urn:test"><bogus/></t:open>').value;
			test.deepEqual([], reports, 'a class with an any wildcard keeps the element: nothing was dropped');
			test.equal(1, open.content.length);
			test.equal('bogus', open.content[0].nodeName);
			test.done();
		},
		"SilentByDefault": function (test) {
			test.equal(2, context.createUnmarshaller().unmarshalString(STYLES).value.style.length);
			test.done();
		}
	},
	"UnexpectedAttribute": {
		"ReportedOnOwningElement": function (test) {
			var reports = [];
			context.createUnmarshaller({
				onUnexpectedAttribute: function (name, node, classInfo) {
					reports.push({ attribute: name.localPart, onElement: node.nodeName, line: node.lineNumber, inClass: classInfo.name });
				}
			}).unmarshalString(STYLES);
			test.deepEqual([{ attribute: 'bogusAttr', onElement: 't:style', line: 3, inClass: 'test.Style' }], reports,
				'namespace declarations on t:styles and xsi:type on the BigStyle are not reported');
			test.done();
		},
		"XsiTypeReportedWhenNotSupported": function (test) {
			var reports = [];
			context.createUnmarshaller({ supportXsiType: false, onUnexpectedAttribute: function (name) { reports.push(name.localPart); } })
				.unmarshalString(STYLES);
			test.deepEqual(['bogusAttr', 'type', 'weight'], reports,
				'without xsi:type support the attribute really is dropped, so it is reported; and the element is read as the base type, so weight is dropped and reported too');
			test.done();
		},
		"NothingWithAnyAttributeWildcard": function (test) {
			var reports = [];
			var open = context.createUnmarshaller({ onUnexpectedAttribute: function (name) { reports.push(name.localPart); } })
				.unmarshalString('<t:open xmlns:t="urn:test" id="1" bogusAttr="x"/>').value;
			test.deepEqual([], reports);
			test.equal('x', open.others.bogusAttr, 'kept in the anyAttribute map');
			test.done();
		}
	},
	"OnElement": {
		"EveryTypedElementOnce": function (test) {
			var element = context.createUnmarshaller().unmarshalString(STYLES);
			var written = [];
			var marshaller = context.createMarshaller({ onElement: function (el, value) { written.push({ element: el.localName, value: value }); } });
			var xml = marshaller.marshalString(element);
			test.equal(3, written.length, 'styles and two styles; the derived BigStyle is reported once, not once per level');
			test.strictEqual(element.value, written[0].value);
			test.strictEqual(element.value.style[0], written[1].value);
			test.strictEqual(element.value.style[1], written[2].value);
			test.equal('test.BigStyle', written[2].value.TYPE_NAME);
			test.equal(['styles', 'style', 'style'].join(), written.map(function (w) { return w.element; }).join());
			test.equal(context.createMarshaller().marshalString(element), xml, 'the callback cannot change the output');
			test.done();
		},
		"WildcardCopyMappedToOriginal": function (test) {
			var original = Jsonix.DOM.parse('<w:drawing xmlns:w="urn:w"><w:inline/></w:drawing>').documentElement;
			var written = [];
			var marshaller = context.createMarshaller({ onElement: function (el, value) { written.push([el, value]); } });
			var doc = marshaller.marshalDocument({ name: { namespaceURI: NS, localPart: 'open' }, value: { TYPE_NAME: 'test.Open', id: '1', content: [original] } });
			test.equal(2, written.length);
			var wildcard = written[1];
			test.strictEqual(original, wildcard[1], 'reported against the original node');
			test.ok(wildcard[0] !== original, 'the output holds an imported copy');
			test.equal('drawing', wildcard[0].localName);
			test.strictEqual(doc.documentElement.firstChild, wildcard[0], 'and the copy is the node in the output document');
			test.done();
		}
	},
	"LocatedError": {
		"AttributeOfWrongType": function (test) {
			try {
				context.createUnmarshaller().unmarshalString('<t:styles xmlns:t="urn:test">\n<t:style id="a" size="big"/>\n</t:styles>');
				test.ok(false, 'must throw');
			} catch (e) {
				test.equal('t:style/@size (line 2): Argument [NaN] must be an integer, but it is not a number.', e.message);
				test.ok(e.jsonixLocated);
				test.equal('Argument [NaN] must be an integer, but it is not a number.', e.cause.message);
				test.equal('t:style', e.node.nodeName);
				test.equal('size', e.attributeName.localPart);
			}
			test.done();
		},
		"NotWrappedTwice": function (test) {
			try {
				context.createUnmarshaller().unmarshalString('<t:styles xmlns:t="urn:test"><t:style xsi:type="t:BigStyle" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" size="1" weight="heavy"/></t:styles>');
				test.ok(false, 'must throw');
			} catch (e) {
				test.equal(1, e.message.split('(line 1):').length - 1, 'located once, at the innermost property, not at every level: ' + e.message);
				test.ok(/^t:style\/@weight \(line 1\): /.test(e.message));
			}
			test.done();
		}
	},
	"LocatedErrorNamespacedAttribute": function (test) {
		// The message names the attribute as a reader sees it (prefix resolved on the element), not by namespace URI.
		var ns = new Jsonix.Context([{ name: 'w', defaultElementNamespaceURI: 'urn:w', defaultAttributeNamespaceURI: 'urn:w',
			typeInfos: [{ localName: 'Sz', propertyInfos: [{ name: 'val', type: 'attribute', typeInfo: 'Integer' }] }],
			elementInfos: [{ elementName: 'sz', typeInfo: '.Sz' }] }]);
		try {
			ns.createUnmarshaller().unmarshalString('<w:sz xmlns:w="urn:w" w:val="big"/>');
			test.ok(false, 'must throw');
		} catch (e) {
			test.equal('w:sz/@w:val (line 1): Argument [NaN] must be an integer, but it is not a number.', e.message);
			test.equal('urn:w', e.attributeName.namespaceURI);
		}
		test.done();
	},
	"DeriveContext": {
		"NoOptionsIsSameContext": function (test) {
			test.strictEqual(context, context.deriveContext());
			test.strictEqual(context, context.deriveContext(undefined));
			test.done();
		},
		"OptionsDoNotLeak": function (test) {
			var reports = [];
			var reporting = context.createUnmarshaller({ onUnexpectedElement: function () { reports.push(1); }, parentPointers: true });
			var plain = context.createUnmarshaller();
			var withPointers = reporting.unmarshalString(STYLES).value;
			plain.unmarshalString(STYLES);
			test.equal(1, reports.length, 'only the reporting unmarshaller reports');
			test.equal('undefined', typeof context.onUnexpectedElement, 'the shared context is untouched');
			test.equal(false, context.parentPointers);
			test.strictEqual(withPointers, withPointers.style[0].PARENT, 'parentPointers as a per-call option');
			test.done();
		},
		"NamespacePrefixesPerMarshaller": function (test) {
			// A hand-built element: a QName unmarshalled from the input carries its own prefix, which the output keeps.
			var element = { name: { namespaceURI: NS, localPart: 'styles' }, value: { TYPE_NAME: 'test.Styles', style: [{ TYPE_NAME: 'test.Style', id: 'a', size: 1 }] } };
			var xml = context.createMarshaller({ namespacePrefixes: { 'urn:test': 'x' } }).marshalString(element);
			test.ok(xml.indexOf('<x:styles') >= 0, xml);
			test.ok(context.createMarshaller().marshalString(element).indexOf('<x:styles') < 0, 'the shared context marshals as before');
			test.deepEqual({}, context.namespacePrefixes, 'shared context unchanged');
			test.done();
		}
	}
};
