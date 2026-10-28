// jsonix-CR-014: the caller declares the type of an element a wildcard holds (wildcardTypeInfo), on unmarshal and on
// marshal. The mapping is shaped like a content control in a paragraph's mc:Choice: the global sdt is block level, the
// paragraph's own list declares it run level, and the branch is a lax wildcard.
var Jsonix = require('../jsonix').Jsonix;

var NS = 'urn:test';
var T = 'xmlns:t="urn:test"';
var XSI = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
var mapping = {
	name: 'test',
	defaultElementNamespaceURI: NS,
	typeInfos: [
		{ localName: 'Body', propertyInfos: [{ name: 'content', type: 'elementRefs', collection: true, mixed: false, allowDom: false, elementTypeInfos: [
			{ elementName: 'p', typeInfo: '.P' }, { elementName: 'sdt', typeInfo: '.SdtBlock' }, { elementName: 'choice', typeInfo: '.Choice' }
		] }] },
		{ localName: 'P', propertyInfos: [{ name: 'content', type: 'elementRefs', collection: true, mixed: false, allowDom: false, elementTypeInfos: [
			{ elementName: 'r', typeInfo: '.R' }, { elementName: 'sdt', typeInfo: '.SdtRun' }, { elementName: 'choice', typeInfo: '.Choice' },
			{ elementName: 'pict', typeInfo: '.Pict' }, { elementName: 'note', typeInfo: '.Note' }
		] }] },
		{ localName: 'R', propertyInfos: [{ name: 'id', type: 'attribute', typeInfo: 'String' }] },
		{ localName: 'SdtBlock', propertyInfos: [{ name: 'c', elementName: 'c', typeInfo: '.SdtContentBlock' }] },
		{ localName: 'SdtRun', propertyInfos: [{ name: 'c', elementName: 'c', typeInfo: '.SdtContentRun' }] },
		{ localName: 'SdtContentBlock', propertyInfos: [{ name: 'content', type: 'elementRefs', collection: true, mixed: false, allowDom: false, elementTypeInfos: [
			{ elementName: 'p', typeInfo: '.P' }, { elementName: 'sdt', typeInfo: '.SdtBlock' }
		] }] },
		{ localName: 'SdtContentRun', propertyInfos: [{ name: 'content', type: 'elementRefs', collection: true, mixed: false, allowDom: false, elementTypeInfos: [
			{ elementName: 'r', typeInfo: '.R' }, { elementName: 'sdt', typeInfo: '.SdtRun' }, { elementName: 'choice', typeInfo: '.Choice' }
		] }] },
		{ localName: 'Choice', propertyInfos: [{ name: 'any', type: 'anyElement', collection: true, mixed: false }] },
		{ localName: 'Pict', propertyInfos: [{ name: 'any', type: 'anyElement', collection: true, mixed: false, allowTypedObject: false }] },
		{ localName: 'Note', propertyInfos: [{ name: 'any', type: 'anyElement', collection: true }] }
	],
	elementInfos: [
		{ elementName: 'body', typeInfo: '.Body' },
		{ elementName: 'p', typeInfo: '.P' },
		{ elementName: 'r', typeInfo: '.R' },
		{ elementName: 'sdt', typeInfo: '.SdtBlock' },
		{ elementName: 'choice', typeInfo: '.Choice' }
	]
};
var context = new Jsonix.Context([mapping], { namespacePrefixes: { 'urn:test': 't' } });
var simplified = new Jsonix.Context([mapping], { namespacePrefixes: { 'urn:test': 't' }, mappingStyle: 'simplified' });

// objects' rule: an sdt directly in a branch takes its host's level; a paragraph's is run level, anything else unanswered.
// The answer is a type info of the context in use: marshal compares it with the value's class by identity.
function byLevelIn(ctx) {
	return function (name, parent) {
		return name.localPart === 'sdt' && parent.localName === 'choice' && parent.parentNode.localName === 'p' ? ctx.getTypeInfoByName('test.SdtRun') : undefined;
	};
}
var byLevel = byLevelIn(context);

// A wildcardTypeInfo that records each call and answers with answer(...) (byLevel by default).
function recorder(answer) {
	var calls = [];
	var hook = function (name, parent, propertyInfo, classInfo, elementOrValue) {
		calls.push({ name: name, parent: parent, children: parent.childNodes.length, propertyInfo: propertyInfo, classInfo: classInfo, last: elementOrValue });
		return (answer || byLevel).apply(null, arguments);
	};
	return { hook: hook, calls: calls };
}

var RUN_LEVEL = '<t:p ' + T + '><t:choice><t:sdt><t:c><t:r/><t:sdt><t:c><t:r id="nested"/></t:c></t:sdt></t:c></t:sdt></t:choice></t:p>';

function read(xml, options, ctx) {
	return (ctx || context).createUnmarshaller(options).unmarshalString(xml);
}

function sdtIn(element) {
	return element.value.content[0].value.any[0].value;
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
	"Unmarshal": {
		"TheAnswerTypesTheElementAndBelow": function (test) {
			var unset = sdtIn(read(RUN_LEVEL));
			test.equal('test.SdtBlock', unset.TYPE_NAME);
			test.equal('test.SdtContentBlock', unset.c.TYPE_NAME);
			test.equal('test.SdtBlock', unset.c.content[1].value.TYPE_NAME, 'the block-level list reads a nested control at block level');
			var r = recorder();
			var sdt = sdtIn(read(RUN_LEVEL, { wildcardTypeInfo: r.hook }));
			test.equal('test.SdtRun', sdt.TYPE_NAME);
			test.equal('test.SdtContentRun', sdt.c.TYPE_NAME);
			test.equal('test.SdtRun', sdt.c.content[1].value.TYPE_NAME, 'the run-level list reads the nested control');
			test.equal('nested', sdt.c.content[1].value.c.content[0].value.id);
			test.equal(1, r.calls.length, 'asked only for the element the wildcard holds');
			test.done();
		},
		"Arguments": function (test) {
			var r = recorder();
			read('<t:p ' + T + '>\n<t:choice>\n<t:sdt/></t:choice></t:p>', { wildcardTypeInfo: r.hook });
			var call = r.calls[0];
			test.ok(call.name instanceof Jsonix.XML.QName);
			test.equal(NS, call.name.namespaceURI);
			test.equal('sdt', call.name.localPart);
			test.equal('t:choice', call.parent.nodeName, 'the element the wildcard\'s class is reading');
			test.equal(call.parent, call.last.parentNode);
			test.equal('t:sdt', call.last.nodeName, 'the element itself');
			test.equal(3, call.last.lineNumber);
			test.equal('any', call.propertyInfo.name);
			test.ok(call.propertyInfo instanceof Jsonix.Model.AnyElementPropertyInfo);
			test.equal('test.Choice', call.classInfo.name);
			test.done();
		},
		"UndefinedOrNullKeepsTheLookup": function (test) {
			test.equal('test.SdtBlock', sdtIn(read(RUN_LEVEL, { wildcardTypeInfo: function () { return undefined; } })).TYPE_NAME);
			test.equal('test.SdtBlock', sdtIn(read(RUN_LEVEL, { wildcardTypeInfo: function () { return null; } })).TYPE_NAME);
			var body = read('<t:body ' + T + '><t:choice><t:sdt/></t:choice></t:body>', { wildcardTypeInfo: byLevel });
			test.equal('test.SdtBlock', sdtIn(body).TYPE_NAME, 'not answered: a body\'s branch');
			test.done();
		},
		"AnUndeclaredElementIsTyped": function (test) {
			var xml = '<t:p ' + T + '><t:choice><t:x id="1"/></t:choice></t:p>';
			var dom = read(xml).value.content[0].value.any[0];
			test.equal(1, dom.nodeType, 'unset, an undeclared element stays DOM');
			var typed = read(xml, { wildcardTypeInfo: function (name) { return name.localPart === 'x' ? context.getTypeInfoByName('test.R') : undefined; } });
			var item = typed.value.content[0].value.any[0];
			test.equal('x', item.name.localPart);
			test.equal('test.R', item.value.TYPE_NAME);
			test.equal('1', item.value.id);
			var text = read('<t:p ' + T + '><t:choice><t:x> s </t:x></t:choice></t:p>', { wildcardTypeInfo: function () { return Jsonix.Schema.XSD.String.INSTANCE; } });
			test.equal(' s ', text.value.content[0].value.any[0].value, 'a built-in type');
			test.done();
		},
		"ASourceXsiTypeComesFirst": function (test) {
			var r = recorder();
			var xml = '<t:p ' + T + ' ' + XSI + '><t:choice><t:sdt xsi:type="t:SdtBlock"/></t:choice></t:p>';
			test.equal('test.SdtBlock', sdtIn(read(xml, { wildcardTypeInfo: r.hook })).TYPE_NAME);
			test.equal(0, r.calls.length, 'not asked');
			test.equal('test.SdtRun', sdtIn(read(xml, { wildcardTypeInfo: r.hook, supportXsiType: false })).TYPE_NAME, 'asked when xsi:type is off');
			var unknown = '<t:p ' + T + ' ' + XSI + '><t:choice><t:sdt xsi:type="t:Nothing"/></t:choice></t:p>';
			test.equal('test.SdtRun', sdtIn(read(unknown, { wildcardTypeInfo: r.hook })).TYPE_NAME, 'asked when the xsi:type is unknown');
			test.equal(2, r.calls.length);
			test.done();
		},
		"NotAskedForDomOnlyWildcardsOrText": function (test) {
			var r = recorder(function () { return context.getTypeInfoByName('test.R'); });
			var value = read('<t:p ' + T + '><t:pict><t:r/></t:pict><t:note>text<t:x/></t:note></t:p>', { wildcardTypeInfo: r.hook }).value;
			test.equal(1, value.content[0].value.any[0].nodeType, 'a DOM-only wildcard keeps DOM');
			test.equal('text', value.content[1].value.any[0]);
			test.equal('test.R', value.content[1].value.any[1].value.TYPE_NAME);
			test.deepEqual(['x'], r.calls.map(function (c) { return c.name.localPart; }));
			test.done();
		},
		"BeforeTheElementsOnElement": function (test) {
			var events = [];
			var value = read(RUN_LEVEL, {
				wildcardTypeInfo: function (name, parent) { events.push('ask ' + name.localPart); return byLevel(name, parent); },
				onElement: function (element, value) { events.push('onElement ' + element.localName + ' ' + value.TYPE_NAME); }
			});
			test.deepEqual(['ask sdt', 'onElement r test.R', 'onElement r test.R', 'onElement c test.SdtContentRun', 'onElement sdt test.SdtRun',
				'onElement c test.SdtContentRun', 'onElement sdt test.SdtRun', 'onElement choice test.Choice', 'onElement p test.P'], events);
			test.done();
		},
		"Simplified": function (test) {
			var value = read(RUN_LEVEL, { wildcardTypeInfo: byLevelIn(simplified) }, simplified)['t:p'];
			var item = value.content[0]['t:choice'].any[0];
			test.equal('test.SdtRun', item['t:sdt'].TYPE_NAME);
			test.done();
		}
	},
	"Marshal": {
		"NoXsiTypeWhenTheAnswerIsTheClass": function (test) {
			var element = read(RUN_LEVEL, { wildcardTypeInfo: byLevel });
			var unset = context.createMarshaller().marshalString(element);
			test.ok(unset.indexOf('xsi:type="t:SdtRun"') > 0, 'unset, the run-level class differs from the global declaration');
			test.equal(RUN_LEVEL, context.createMarshaller({ wildcardTypeInfo: byLevel }).marshalString(element));
			var again = read(context.createMarshaller({ wildcardTypeInfo: byLevel }).marshalString(element), { wildcardTypeInfo: byLevel });
			test.equal(JSON.stringify(element.value), JSON.stringify(again.value), 'stable when read again');
			test.done();
		},
		"Arguments": function (test) {
			var r = recorder();
			context.createMarshaller({ wildcardTypeInfo: r.hook }).marshalString(read(RUN_LEVEL, { wildcardTypeInfo: byLevel }));
			test.equal(1, r.calls.length);
			var call = r.calls[0];
			test.equal('sdt', call.name.localPart);
			test.equal('t:choice', call.parent.nodeName, 'the open element the wildcard\'s class is writing');
			test.equal('t:p', call.parent.parentNode.nodeName, 'with its ancestors in place');
			test.equal(0, call.children, 'the element itself is not written yet');
			test.equal('any', call.propertyInfo.name);
			test.equal('test.Choice', call.classInfo.name);
			test.equal('test.SdtRun', call.last.TYPE_NAME, 'the value');
			test.done();
		},
		"TheValuesOwnClassStillDecidesXsiType": function (test) {
			var block = { name: { ns: NS, lp: 'p' }, value: { TYPE_NAME: 'test.P', content: [{ name: { ns: NS, lp: 'choice' }, value: { TYPE_NAME: 'test.Choice',
				any: [{ name: { ns: NS, lp: 'sdt' }, value: { TYPE_NAME: 'test.SdtBlock' } }] } }] } };
			var xml = context.createMarshaller({ wildcardTypeInfo: byLevel }).marshalString(block);
			test.ok(xml.indexOf('<t:sdt xsi:type="t:SdtBlock"') > 0, 'a block-level control in a paragraph\'s branch gets xsi:type');
			test.equal(-1, context.createMarshaller().marshalString(block).indexOf('xsi:type'));
			test.done();
		},
		"SupportXsiTypeOff": function (test) {
			var element = read(RUN_LEVEL, { wildcardTypeInfo: byLevel });
			delete element.value.content[0].value.any[0].value.TYPE_NAME;
			var seen = function (options) {
				var types = [];
				options.omitElement = function (value, name, typeInfo) { types.push(name.localPart + ' ' + typeInfo.name); };
				options.supportXsiType = false;
				context.createMarshaller(options).marshalString(element);
				return types.slice(0, 3);
			};
			test.deepEqual(['choice test.Choice', 'sdt test.SdtBlock', 'c test.SdtContentBlock'], seen({}));
			test.deepEqual(['choice test.Choice', 'sdt test.SdtRun', 'c test.SdtContentRun'], seen({ wildcardTypeInfo: byLevel }), 'marshalled by the answer');
			test.done();
		},
		"NotAskedForStringsOrDom": function (test) {
			var source = read('<t:p ' + T + '><t:pict><t:r/></t:pict><t:note>text<t:x/></t:note></t:p>');
			var r = recorder(function () { return undefined; });
			var xml = context.createMarshaller({ wildcardTypeInfo: r.hook }).marshalString(source);
			test.equal('<t:p ' + T + '><t:pict><t:r/></t:pict><t:note>text<t:x/></t:note></t:p>', xml);
			test.equal(0, r.calls.length);
			test.done();
		},
		"OrderWithOmitElementAndOnElement": function (test) {
			var events = [];
			context.createMarshaller({
				wildcardTypeInfo: function (name, parent) { events.push('ask ' + name.localPart); return byLevel(name, parent); },
				omitElement: function (value, name) { events.push('omit? ' + name.localPart); },
				onElement: function (element) { events.push('onElement ' + element.localName + ' ' + element.hasAttribute('xsi:type')); }
			}).marshalString(read('<t:p ' + T + '><t:choice><t:sdt/></t:choice></t:p>', { wildcardTypeInfo: byLevel }));
			test.deepEqual(['onElement p false', 'omit? choice', 'onElement choice false', 'ask sdt', 'omit? sdt', 'onElement sdt false'], events);
			test.done();
		},
		"Simplified": function (test) {
			var element = read(RUN_LEVEL, { wildcardTypeInfo: byLevelIn(simplified) }, simplified);
			test.equal(RUN_LEVEL, simplified.createMarshaller({ wildcardTypeInfo: byLevelIn(simplified) }).marshalString(element));
			var other = simplified.createMarshaller({ wildcardTypeInfo: byLevel }).marshalString(element);
			test.ok(other.indexOf('<t:sdt xsi:type="t:SdtRun"') > 0, 'another context\'s type info is another type');
			test.done();
		}
	},
	"Errors": {
		"NotATypeInfo": function (test) {
			var name = function () { return 'test.SdtRun'; };
			var located = errorOf(function () { read('<t:p ' + T + '>\n<t:choice>\n<t:sdt/></t:choice></t:p>', { wildcardTypeInfo: name }); });
			test.equal('t:sdt (line 3): Type info for element [{urn:test}sdt] must be a Jsonix.Model.TypeInfo.', located.message);
			var element = read(RUN_LEVEL);
			var marshalled = errorOf(function () { context.createMarshaller({ wildcardTypeInfo: name }).marshalString(element); });
			test.equal('Type info for element [{urn:test}sdt] must be a Jsonix.Model.TypeInfo.', marshalled.message);
			test.done();
		},
		"ThrowLocatedOnUnmarshal": function (test) {
			var fail = { wildcardTypeInfo: function () { throw new Error('no'); } };
			var located = errorOf(function () { read('<t:p ' + T + '>\n<t:choice>\n<t:sdt/></t:choice></t:p>', fail); });
			test.equal('t:sdt (line 3): no', located.message);
			test.equal('t:sdt', located.node.nodeName);
			test.equal('no', errorOf(function () { context.createMarshaller(fail).marshalString(read(RUN_LEVEL)); }).message, 'not located on marshal');
			test.done();
		}
	},
	"Unset": {
		"SameResult": function (test) {
			var xml = '<t:body ' + T + '><t:p><t:choice><t:sdt><t:c><t:p/></t:c></t:sdt><t:x/></t:choice><t:note>a<t:y/></t:note></t:p></t:body>';
			var unset = read(xml);
			var asked = read(xml, { wildcardTypeInfo: function () { return undefined; } });
			test.equal('test.SdtBlock', asked.value.content[0].value.content[0].value.any[0].value.TYPE_NAME);
			test.equal(1, asked.value.content[0].value.content[0].value.any[1].nodeType);
			test.equal(context.createMarshaller().marshalString(unset), context.createMarshaller({ wildcardTypeInfo: function () { return undefined; } }).marshalString(asked));
			test.equal(xml, context.createMarshaller().marshalString(unset));
			test.equal(undefined, context.wildcardTypeInfo, 'the shared context is not written');
			test.done();
		}
	}
};
