// jsonix-CR-013: report the character data unmarshalling drops (onUnexpectedText), once per text or CDATA node that
// holds a character other than XML whitespace: element-only content (site A), text the input classes as space although
// XML does not (site B, mixed classes included), and a class with no content (site C).
var Jsonix = require('../jsonix').Jsonix;

var NS = 'urn:test';
var T = 'xmlns:t="urn:test"';
var mapping = {
	name: 'test',
	defaultElementNamespaceURI: NS,
	typeInfos: [
		{ localName: 'Para', propertyInfos: [{ name: 'r', typeInfo: '.Run', collection: true }] },
		{ localName: 'Run', propertyInfos: [
			{ name: 'b', typeInfo: '.OnOff' },
			{ name: 'content', type: 'elementRefs', collection: true, mixed: false, allowDom: false, elementTypeInfos: [
				{ elementName: 't', typeInfo: '.Text' },
				{ elementName: 'br', typeInfo: '.Empty' }
			] }
		] },
		{ localName: 'BigRun', baseTypeInfo: '.Run', propertyInfos: [{ name: 'weight', type: 'attribute', typeInfo: 'Integer' }] },
		{ localName: 'OnOff', propertyInfos: [{ name: 'val', type: 'attribute', typeInfo: 'Boolean' }] },
		{ localName: 'Empty', propertyInfos: [] },
		{ localName: 'Text', propertyInfos: [{ name: 'value', type: 'value' }] },
		{ localName: 'Mixed', propertyInfos: [{ name: 'content', type: 'elementRefs', collection: true, elementTypeInfos: [{ elementName: 'b', typeInfo: 'String' }] }] },
		{ localName: 'Open', propertyInfos: [{ name: 'content', type: 'anyElement', collection: true, mixed: false }] },
		{ localName: 'OpenMixed', propertyInfos: [{ name: 'content', type: 'anyElement', collection: true }] }
	],
	elementInfos: [
		{ elementName: 'p', typeInfo: '.Para' },
		{ elementName: 'r', typeInfo: '.Run' },
		{ elementName: 't', typeInfo: '.Text' },
		{ elementName: 'mixed', typeInfo: '.Mixed' },
		{ elementName: 'open', typeInfo: '.Open' },
		{ elementName: 'openMixed', typeInfo: '.OpenMixed' }
	]
};
var context = new Jsonix.Context([mapping]);

// Unmarshals with onUnexpectedText recording each call; returns { value, texts, calls }.
function read(xml, options) {
	var calls = [];
	var opts = { onUnexpectedText: function (text, node, classInfo) { calls.push({ text: text, node: node, classInfo: classInfo }); } };
	for (var key in options) {
		opts[key] = options[key];
	}
	var value = context.createUnmarshaller(opts).unmarshalString(xml).value;
	return { value: value, texts: calls.map(function (c) { return c.text; }), calls: calls };
}

function errorOf(fn) {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return null;
}

module.exports = {
	"Reported": {
		"ElementOnlyContent": function (test) {
			var r = read('<t:p ' + T + '>\n  <t:r>MISPLACED<t:t>x</t:t>tail</t:r>\n</t:p>');
			test.deepEqual(['MISPLACED', 'tail'], r.texts, 'the indentation is not reported');
			var first = r.calls[0];
			test.equal(3, first.node.nodeType, 'the text node itself');
			test.equal('t:r', first.node.parentNode.nodeName);
			test.equal(2, first.node.lineNumber);
			test.equal(8, first.node.columnNumber);
			test.equal('test.Run', first.classInfo.name);
			test.equal(1, r.value.r[0].content.length, 'the text stays dropped');
			test.equal('x', r.value.r[0].content[0].value.value);
			test.done();
		},
		"CDATA": function (test) {
			var r = read('<t:r ' + T + '><![CDATA[cd]]><![CDATA[ \t\n]]><t:t>x</t:t></t:r>');
			test.deepEqual(['cd'], r.texts, 'a whitespace-only CDATA section is not reported');
			test.equal(4, r.calls[0].node.nodeType);
			test.done();
		},
		"OneCallPerNode": function (test) {
			test.deepEqual(['ab', 'cd', 'ef'], read('<t:r ' + T + '>ab<!--c-->cd<?pi x?>ef</t:r>').texts);
			test.deepEqual([' a&bA\n'], read('<t:r ' + T + '> a&amp;b&#x41;\r\n</t:r>').texts, 'as parsed: entities resolved, line ends normalised, untrimmed');
			test.done();
		},
		"WhatTheInputClassesAsSpace": function (test) {
			// StringUtils.isEmpty counts these as space, so the input gives them SPACE, which the loop ignores (site B).
			var r = read('<t:r ' + T + '> <t:t>x</t:t>　<t:t>y</t:t>   </t:r>');
			test.deepEqual([' ', '　', '   '], r.texts);
			test.deepEqual([], read('<t:r ' + T + '> \t\r\n<t:t>x</t:t>\n\t</t:r>').texts, 'XML whitespace only');
			test.done();
		},
		"LineEndsByXmlVersion": function (test) {
			// jsonix-CR-004: XML 1.0 keeps a raw U+0085 and U+2028; XML 1.1 makes them line feeds, which are whitespace.
			test.deepEqual(['\u0085 '], read('<?xml version="1.0"?><t:r ' + T + '>\u0085 </t:r>').texts);
			test.deepEqual([], read('<?xml version="1.1"?><t:r ' + T + '>\u0085 </t:r>').texts);
			test.done();
		},
		"ClassWithoutContent": function (test) {
			var r = read('<t:r ' + T + '><t:b val="true">bold?</t:b><t:br>x<!--c-->y</t:br><t:br> </t:br><t:br>\n  </t:br></t:r>');
			test.deepEqual(['bold?', 'x', 'y', ' '], r.texts);
			test.deepEqual(['test.OnOff', 'test.Empty', 'test.Empty', 'test.Empty'], r.calls.map(function (c) { return c.classInfo.name; }));
			test.equal('t:b', r.calls[0].node.parentNode.nodeName);
			test.equal(true, r.value.b.val, 'the attributes are read as before');
			test.equal(3, r.value.content.length);
			test.done();
		},
		"ClassWithoutContentThenChild": function (test) {
			var xml = '<t:p ' + T + '><t:r><t:b>t<t:x/></t:b></t:r></t:p>';
			var texts = [];
			var reported = errorOf(function () {
				context.createUnmarshaller({ onUnexpectedText: function (text) { texts.push(text); } }).unmarshalString(xml);
			});
			var unset = errorOf(function () { context.createUnmarshaller().unmarshalString(xml); });
			test.deepEqual(['t'], texts, 'the text before the child is reported first');
			test.equal('t:x (line 1): Illegal state: must be END_ELEMENT.', unset.message);
			test.equal(unset.message, reported.message, 'then the same error as without the option');
			test.done();
		},
		"RootAndXsiType": function (test) {
			var root = read('<t:r ' + T + '>root text</t:r>');
			test.deepEqual(['root text'], root.texts);
			test.equal('test.Run', root.calls[0].classInfo.name);
			var derived = read('<t:p ' + T + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><t:r xsi:type="t:BigRun" weight="7">x</t:r></t:p>');
			test.equal('test.BigRun', derived.calls[0].classInfo.name, 'the derived type is the class read');
			test.equal(7, derived.value.r[0].weight);
			test.done();
		},
		"AnyWildcardNotMixed": function (test) {
			var r = read('<t:open ' + T + '>text<foo/>more</t:open>');
			test.deepEqual(['text', 'more'], r.texts, 'the wildcard keeps elements, not text');
			test.equal(1, r.value.content.length);
			test.equal('foo', r.value.content[0].nodeName);
			test.done();
		}
	},
	"NotReported": {
		"MixedKeepsText": function (test) {
			var r = read('<t:mixed ' + T + '>a<t:b>x</t:b>z<![CDATA[c]]></t:mixed>');
			test.deepEqual([], r.texts);
			test.equal(4, r.value.content.length);
			test.equal('a', r.value.content[0]);
			test.equal('z', r.value.content[2]);
			test.done();
		},
		"MixedDropsSpace": function (test) {
			// Site B in a mixed class: both are dropped, and only the one holding a character outside XML whitespace is reported.
			var r = read('<t:mixed ' + T + '>a<t:b>x</t:b> <t:b>y</t:b> <t:b>z</t:b></t:mixed>');
			test.deepEqual([' '], r.texts);
			test.equal('test.Mixed', r.calls[0].classInfo.name);
			test.equal(4, r.value.content.length, 'a and three elements: neither space is kept');
			test.done();
		},
		"MixedAnyWildcard": function (test) {
			var r = read('<t:openMixed ' + T + '>text<foo/></t:openMixed>');
			test.deepEqual([], r.texts);
			test.equal('text', r.value.content[0]);
			test.done();
		},
		"SimpleContent": function (test) {
			var r = read('<t:t ' + T + '> x </t:t>');
			test.deepEqual([], r.texts);
			test.equal(' x ', r.value.value);
			test.done();
		},
		"InsideAnUnexpectedElement": function (test) {
			var events = [];
			read('<t:p ' + T + '>before<t:bogus>inside</t:bogus><t:r>in run</t:r>after</t:p>', {
				onUnexpectedText: function (text) { events.push('text ' + text); },
				onUnexpectedElement: function (name) { events.push('element ' + name.localPart); },
				onElement: function (element) { events.push('onElement ' + element.nodeName); }
			});
			test.deepEqual(['text before', 'element bogus', 'text in run', 'onElement t:r', 'text after', 'onElement t:p'], events,
				'document order, before the containing element\'s onElement; the skipped element\'s text goes with it');
			test.done();
		}
	},
	"Errors": {
		"ThrowLocatedByTheTextNode": function (test) {
			var fail = { onUnexpectedText: function () { throw new Error('no text here'); } };
			var located = errorOf(function () { read('<t:p ' + T + '>\n<t:r>bad</t:r></t:p>', fail); });
			test.equal('#text (line 2): no text here', located.message);
			test.equal(3, located.node.nodeType);
			var root = errorOf(function () { read('<t:r ' + T + '>bad</t:r>', fail); });
			test.equal('no text here', root.message, 'not located at the document root, as for onUnexpectedElement');
			test.done();
		}
	},
	"Unset": {
		"SameResult": function (test) {
			var xml = '<t:p ' + T + '>\n  <t:r>a<t:b val="1">b</t:b> <t:t>x</t:t><t:br>c</t:br>d</t:r>\n  text\n</t:p>';
			var unset = context.createUnmarshaller().unmarshalString(xml);
			var r = read(xml);
			test.deepEqual(['a', 'b', ' ', 'c', 'd', '\n  text\n'], r.texts);
			test.equal(JSON.stringify(unset), JSON.stringify(context.createUnmarshaller({ onUnexpectedText: function () { return 'kept?'; } }).unmarshalString(xml)),
				'the return value is ignored and the data stays dropped');
			test.equal(JSON.stringify(unset.value), JSON.stringify(r.value));
			test.equal(undefined, context.onUnexpectedText, 'the shared context is not written');
			test.done();
		}
	}
};
