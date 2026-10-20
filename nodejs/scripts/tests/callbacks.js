// jsonix-CR-006: report what unmarshalling drops (onUnexpectedElement, onUnexpectedAttribute),
// record what marshalling writes (onElement), locate errors from wrongly typed values, and the
// per-call options on createUnmarshaller / createMarshaller. jsonix-CR-008: the unmarshal-side onElement.
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
		] },
		{ localName: 'Refs', propertyInfos: [{ name: 'item', type: 'elementRef', elementName: 'style', typeInfo: '.Style', collection: true }] }
	],
	elementInfos: [
		{ elementName: 'styles', typeInfo: '.Styles' },
		{ elementName: 'style', typeInfo: '.Style' },
		{ elementName: 'open', typeInfo: '.Open' },
		{ elementName: 'refs', typeInfo: '.Refs' }
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
	// jsonix-CR-008: the unmarshal-side onElement(element, value), once per element read as a typed object.
	"UnmarshalOnElement": {
		"EveryTypedElementOnceChildrenFirst": function (test) {
			var doc = Jsonix.DOM.parse(STYLES);
			var read = [];
			var styles = context.createUnmarshaller({ onElement: function (el, value) { read.push([el, value]); } })
				.unmarshalDocument(doc).value;
			var sources = doc.documentElement.getElementsByTagNameNS(NS, 'style');
			test.equal(3, read.length, 'two styles and the root; the bogus element is skipped, the wrapper is not reported');
			test.strictEqual(sources[0], read[0][0], 'the source element itself, in its own document');
			test.strictEqual(styles.style[0], read[0][1]);
			test.strictEqual(sources[1], read[1][0]);
			test.strictEqual(styles.style[1], read[1][1]);
			test.equal('test.BigStyle', read[1][1].TYPE_NAME, 'an xsi:type element is reported once, as its derived type');
			test.strictEqual(doc.documentElement, read[2][0], 'the parent after its children');
			test.strictEqual(styles, read[2][1]);
			test.done();
		},
		"ReportedComplete": function (test) {
			var seen = [];
			var styles = context.createUnmarshaller({
				parentPointers: true,
				onElement: function (el, value) { seen.push({ id: value.id, size: value.size, parent: value.PARENT, styles: value.style && value.style.length }); }
			}).unmarshalString(STYLES).value;
			test.deepEqual({ id: 'Normal', size: 20, parent: styles, styles: undefined }, seen[0], 'attributes read and PARENT set');
			test.equal(2, seen[2].styles, 'the root is reported with its content read');
			test.done();
		},
		"SimpleValuesAndWildcardDomNotReported": function (test) {
			var doc = Jsonix.DOM.parse('<t:open xmlns:t="urn:test"><t:style id="a"><t:name>N</t:name></t:style><w:drawing xmlns:w="urn:w"><w:inline/></w:drawing></t:open>');
			var read = [];
			var open = context.createUnmarshaller({ onElement: function (el, value) { read.push(el.localName); } }).unmarshalDocument(doc).value;
			test.deepEqual(['style', 'open'], read, 'not t:name (a simple value) nor the DOM content');
			test.strictEqual(doc.documentElement.childNodes[1], open.content[1], 'wildcard DOM content is the source node itself, not a copy');
			test.done();
		},
		"ElementRefWrapperNotReported": function (test) {
			var read = [];
			var refs = context.createUnmarshaller({ onElement: function (el, value) { read.push(value); } })
				.unmarshalString('<t:refs xmlns:t="urn:test"><t:style id="a"/></t:refs>').value;
			test.equal(2, read.length);
			test.strictEqual(refs.item[0].value, read[0], 'the typed object, not its { name, value } wrapper');
			test.done();
		},
		"AncestorDeclarationsInScope": function (test) {
			var prefixes = [];
			context.createUnmarshaller({ onElement: function (el) { prefixes.push(el.lookupNamespaceURI('zz9')); } })
				.unmarshalString('<t:styles xmlns:t="urn:test" xmlns:zz9="urn:private"><t:style id="a"/></t:styles>');
			test.deepEqual(['urn:private', 'urn:private'], prefixes, 'a prefix declared on an ancestor resolves on the reported element');
			test.done();
		},
		"CallsBeforeAnErrorStand": function (test) {
			var read = [];
			test.throws(function () {
				context.createUnmarshaller({ onElement: function (el, value) { read.push(value.id); } })
					.unmarshalString('<t:styles xmlns:t="urn:test"><t:style id="a"/><t:style id="b" size="x"/></t:styles>');
			});
			test.deepEqual(['a'], read, 'the element that failed and its parent are never complete, so never reported');
			test.done();
		},
		"UnsetChangesNothing": function (test) {
			var plain = context.createUnmarshaller().unmarshalString(STYLES);
			var reported = context.createUnmarshaller({ onElement: function () {} }).unmarshalString(STYLES);
			test.deepEqual(plain, reported);
			test.equal(context.createMarshaller().marshalString(plain), context.createMarshaller().marshalString(reported));
			test.done();
		},
		"MarshalAndUnmarshalCallbacksSeparate": function (test) {
			var unmarshalReports = [];
			var marshalReports = [];
			var element = context.createUnmarshaller({ onElement: function () { unmarshalReports.push(1); } }).unmarshalString(STYLES);
			context.createMarshaller({ onElement: function () { marshalReports.push(1); } }).marshalString(element);
			context.createUnmarshaller().unmarshalString(STYLES);
			test.equal(3, unmarshalReports.length);
			test.equal(3, marshalReports.length);
			test.equal('undefined', typeof context.onElement, 'each lives on its own derived context');
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
