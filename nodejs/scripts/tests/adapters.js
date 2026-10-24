// jsonix-CR-011: marshal-side adapters. onAttributeValue rewrites (a string), omits (null) or keeps (undefined) an
// attribute that printed, with the owning object; omitElement leaves out an element written from a property. Both
// are marshal-only: the tree is unchanged, and with neither set the output is what it was.
var Jsonix = require('../jsonix').Jsonix;

var W = 'urn:w';
var A = 'urn:a';
var w = {
	name: 'w',
	defaultElementNamespaceURI: W,
	defaultAttributeNamespaceURI: W,
	typeInfos: [
		{ localName: 'Color', propertyInfos: [
			{ name: 'val', type: 'attribute' },
			{ name: 'themeColor', type: 'attribute' }
		] },
		{ localName: 'Highlight', propertyInfos: [{ name: 'val', type: 'attribute' }] },
		{ localName: 'Border', propertyInfos: [
			{ name: 'color', type: 'attribute' },
			{ name: 'sz', type: 'attribute', typeInfo: 'Integer' }
		] },
		{ localName: 'BigBorder', baseTypeInfo: '.Border', propertyInfos: [{ name: 'space', type: 'attribute', typeInfo: 'Integer' }] },
		{ type: 'enumInfo', localName: 'Underline', values: ['single', 'none'] },
		{ localName: 'U', propertyInfos: [{ name: 'val', type: 'attribute', typeInfo: '.Underline' }] },
		{ localName: 'RPr', propertyInfos: [
			{ name: 'color', type: 'element', typeInfo: '.Color' },
			{ name: 'highlight', type: 'element', typeInfo: '.Highlight' },
			{ name: 'u', type: 'element', typeInfo: '.U' },
			{ name: 'aColor', type: 'element', elementName: { namespaceURI: A, localPart: 'color' }, typeInfo: 'a.Color' }
		] },
		{ localName: 'Change', propertyInfos: [{ name: 'content', type: 'elementRefs', collection: true, elementTypeInfos: [
			{ elementName: 'rPr', typeInfo: '.RPr' },
			{ elementName: 'highlight', typeInfo: '.Highlight' }
		] }] },
		{ localName: 'P', propertyInfos: [
			{ name: 'border', type: 'element', typeInfo: '.Border', collection: true },
			{ name: 'any', type: 'anyElement', collection: true, allowDom: false, allowTypedObject: true }
		] },
		{ localName: 'Doc', propertyInfos: [
			{ name: 'rPr', type: 'element', typeInfo: '.RPr' },
			{ name: 'change', type: 'element', typeInfo: '.Change' },
			{ name: 'p', type: 'element', typeInfo: '.P' }
		] }
	],
	elementInfos: [
		{ elementName: 'doc', typeInfo: '.Doc' },
		{ elementName: 'highlight', typeInfo: '.Highlight' },
		{ elementName: 'extra', typeInfo: '.Highlight' }
	]
};
var a = {
	name: 'a',
	defaultElementNamespaceURI: A,
	typeInfos: [{ localName: 'Color', propertyInfos: [{ name: 'val', type: 'attribute' }] }],
	elementInfos: []
};
var context = new Jsonix.Context([w, a], { namespacePrefixes: { 'urn:w': 'w', 'urn:a': 'a' } });

var VALID = ['yellow', 'green', 'none'];
var doc = function () {
	return { name: { namespaceURI: W, localPart: 'doc' }, value: { TYPE_NAME: 'w.Doc',
		rPr: { TYPE_NAME: 'w.RPr',
			color: { TYPE_NAME: 'w.Color', val: 'ff0000' },
			highlight: { TYPE_NAME: 'w.Highlight', val: 'bogus' },
			aColor: { TYPE_NAME: 'a.Color', val: 'ff0000' } },
		change: { TYPE_NAME: 'w.Change', content: [
			{ name: { namespaceURI: W, localPart: 'rPr' }, value: { TYPE_NAME: 'w.RPr', highlight: { TYPE_NAME: 'w.Highlight', val: 'YELLOW' } } },
			{ name: { namespaceURI: W, localPart: 'highlight' }, value: { TYPE_NAME: 'w.Highlight', val: 'bogus' } },
			{ name: { namespaceURI: W, localPart: 'highlight' }, value: { TYPE_NAME: 'w.Highlight', val: 'green' } }
		] },
		p: { TYPE_NAME: 'w.P',
			border: [{ TYPE_NAME: 'w.Border', color: 'red', sz: 4 }, { TYPE_NAME: 'w.BigBorder', color: '00ff00', sz: 8, space: 1 }],
			any: [{ name: { namespaceURI: W, localPart: 'extra' }, value: { TYPE_NAME: 'w.Highlight', val: 'bogus' } }] } } };
};
var marshal = function (options, value) {
	return context.createMarshaller(options).marshalString(value || doc());
};
var errorOf = function (f) {
	try {
		f();
	} catch (e) {
		return e;
	}
	return null;
};

module.exports = {
	"OnAttributeValue": {
		"RewriteOmitKeep": function (test) {
			var xml = marshal({ onAttributeValue: function (value, text, owner, propertyInfo, classInfo) {
				if (classInfo.name === 'w.Color' && propertyInfo.name === 'val') return text.toUpperCase();
				if (classInfo.name === 'w.Border' && propertyInfo.name === 'color') return null;
				return undefined;
			} });
			test.ok(/<w:color w:val="FF0000"\/>/.test(xml), 'rewritten: ' + xml);
			test.ok(/<w:border w:sz="4"\/>/.test(xml), 'omitted, its sibling kept: ' + xml);
			test.ok(/<w:highlight w:val="bogus"\/>/.test(xml), 'kept: ' + xml);
			test.ok(/<a:color val="ff0000"\/>/.test(xml), 'another class kept: ' + xml);
			test.done();
		},
		"TheOwnerCarriesTheSiblings": function (test) {
			var owners = [];
			var value = doc();
			value.value.rPr.color.themeColor = 'accent1';
			var xml = marshal({ onAttributeValue: function (v, text, owner, propertyInfo, classInfo) {
				if (classInfo.name !== 'w.Color' || propertyInfo.name !== 'val') return undefined;
				owners.push(owner);
				return Jsonix.Util.Type.exists(owner.themeColor) ? 'auto' : text;
			} }, value);
			test.strictEqual(value.value.rPr.color, owners[0], 'the typed object itself');
			test.ok(/<w:color w:val="auto" w:themeColor="accent1"\/>/.test(xml), xml);
			test.done();
		},
		"TheDeclaringClassInfoForAnInheritedAttribute": function (test) {
			var calls = [];
			var value = doc();
			marshal({ onAttributeValue: function (v, text, owner, propertyInfo, classInfo) {
				if (owner.TYPE_NAME === 'w.BigBorder') calls.push([propertyInfo.name, classInfo.name, owner === value.value.p.border[1]]);
			} }, value);
			test.deepEqual([['color', 'w.Border', true], ['sz', 'w.Border', true], ['space', 'w.BigBorder', true]], calls);
			test.done();
		},
		"WhatIsWrittenMustBeAStringOrNull": function (test) {
			var e = errorOf(function () { marshal({ onAttributeValue: function () { return 42; } }); });
			test.ok(/Argument \[42\] must be a string/.test(e.message), e.message);
			test.done();
		},
		"AValueThatDidNotPrintGoesOnlyToOnUnprintableValue": function (test) {
			var attributeCalls = [], unprintableCalls = [];
			var options = {
				onAttributeValue: function (value, text, owner, propertyInfo) { if (propertyInfo.name === 'val' && owner.TYPE_NAME === 'w.U') attributeCalls.push(text); },
				onUnprintableValue: function (value) { unprintableCalls.push(value); return value; }
			};
			var element = function (val) {
				return { name: { namespaceURI: W, localPart: 'doc' }, value: { TYPE_NAME: 'w.Doc', rPr: { TYPE_NAME: 'w.RPr', u: { TYPE_NAME: 'w.U', val: val } } } };
			};
			var xml = marshal(options, element('Single'));
			test.ok(/<w:u w:val="Single"\/>/.test(xml), xml);
			marshal(options, element('single'));
			test.deepEqual(['single'], attributeCalls, 'only the value that printed');
			test.deepEqual(['Single'], unprintableCalls, 'only the value that did not');
			test.done();
		}
	},
	"OmitElement": {
		"FromAnElementPropertyAnElementsCollectionAnElementRefsListAndAnAnyElement": function (test) {
			var calls = [];
			var onElements = [];
			var xml = marshal({
				omitElement: function (value, name, typeInfo, propertyInfo, classInfo) {
					calls.push([name.localPart, typeInfo.name, propertyInfo.name, classInfo.name]);
					if (typeInfo.name === 'w.Highlight') return VALID.indexOf(value.val) < 0;
					if (typeInfo.name === 'w.Border') return value.color === 'red';
					return false;
				},
				onElement: function (element) { onElements.push(element.nodeName); }
			});
			test.ok(!/bogus|YELLOW|red/.test(xml), 'every invalid highlight and the red border left out: ' + xml);
			test.ok(/<w:change><w:rPr\/><w:highlight w:val="green"\/><\/w:change>/.test(xml), 'the element-refs list keeps the rest: ' + xml);
			test.ok(/<w:p><w:border [^>]*w:color="00ff00"[^>]*\/><\/w:p>/.test(xml), 'one border left, the wildcard item gone: ' + xml);
			test.deepEqual(['rPr', 'w.RPr', 'rPr', 'w.Doc'], calls[0], 'an element property');
			test.ok(calls.some(function (c) { return c.join() === 'rPr,w.RPr,content,w.Change'; }), 'an element-refs item offered with its unwrapped type');
			test.ok(calls.some(function (c) { return c.join() === 'highlight,w.Highlight,highlight,w.RPr'; }), 'inside an element-refs item');
			test.ok(calls.some(function (c) { return c.join() === 'extra,w.Highlight,any,w.P'; }), 'an anyElement item');
			test.ok(calls.some(function (c) { return c.join() === 'border,w.BigBorder,border,w.P'; }), 'the type after xsi:type');
			test.ok(!calls.some(function (c) { return c[0] === 'doc'; }), 'the root is never offered');
			test.equal(0, onElements.filter(function (n) { return n === 'w:highlight'; }).length - 1, 'one highlight written and reported, none of the omitted');
			test.done();
		},
		"TheRootIsNeverOffered": function (test) {
			var xml = context.createMarshaller({ omitElement: function () { return true; } })
				.marshalString({ name: { namespaceURI: W, localPart: 'highlight' }, value: { TYPE_NAME: 'w.Highlight', val: 'bogus' } });
			test.ok(/<w:highlight [^>]*w:val="bogus"\/>/.test(xml), xml);
			test.done();
		},
		"OnlyTrueOmits": function (test) {
			var plain = marshal();
			[false, undefined, null, 1, 'yes'].forEach(function (returned) {
				test.equal(plain, marshal({ omitElement: function () { return returned; } }), JSON.stringify(returned) + ' writes the element');
			});
			test.done();
		},
		"ScopedByTheModule": function (test) {
			var xml = marshal({ omitElement: function (value, name, typeInfo) {
				return typeInfo.module !== undefined && typeInfo.module.name === 'a';
			} });
			test.ok(!/a:color/.test(xml) && /w:color/.test(xml), xml);
			test.done();
		}
	},
	"Together": {
		"UnsetOrFallingThroughLeavesTheOutputByteIdentical": function (test) {
			var plain = new Jsonix.Context([w, a], { namespacePrefixes: { 'urn:w': 'w', 'urn:a': 'a' } }).createMarshaller().marshalString(doc());
			test.equal(plain, marshal());
			test.equal(plain, marshal({ onAttributeValue: function () { return undefined; }, omitElement: function () { return false; } }));
			test.done();
		},
		"TheTreeIsUnchanged": function (test) {
			var value = doc();
			var before = JSON.stringify(value);
			marshal({ onAttributeValue: function () { return null; }, omitElement: function () { return true; } }, value);
			test.equal(before, JSON.stringify(value));
			test.done();
		},
		"TheSharedContextIsUntouched": function (test) {
			marshal({ onAttributeValue: function () { return 'x'; }, omitElement: function () { return true; } });
			test.ok(!context.onAttributeValue && !context.omitElement);
			test.ok(/w:val="ff0000"/.test(marshal()));
			test.done();
		}
	}
};
