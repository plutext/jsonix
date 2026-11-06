// jsonix-CR-015: with onUnexpectedElement set, an element nothing can hold is reported and skipped instead of failing the
// read. That covers a list or wildcard that can neither type it nor keep it as DOM (Unmarshalls.Element's refusing branch)
// and a class with no element or value content (ClassInfo.unmarshal's skip). Unset, both throw as they did. The document
// root and an element with a value keep their throw, set or unset.
var Jsonix = require('../jsonix').Jsonix;

var NS = 'urn:test';
var mapping = {
	name: 'test',
	defaultElementNamespaceURI: NS,
	defaultTypeNamespaceURI: NS,
	typeInfos: [
		{ localName: 'P', propertyInfos: [{ name: 'id', type: 'attribute', attributeName: { localPart: 'id' } }] },
		{ localName: 'Body', propertyInfos: [{ name: 'content', type: 'elementRefs', collection: true, mixed: false, allowDom: false, elementTypeInfos: [
			{ elementName: 'p', typeInfo: '.P' }, { elementName: 'empty', typeInfo: '.Empty' }, { elementName: 'text', typeInfo: '.Text' }
		] }] },
		{ localName: 'DerivedBody', baseTypeInfo: '.Body', propertyInfos: [{ name: 'note', type: 'attribute', attributeName: { localPart: 'note' } }] },
		{ localName: 'Mix', propertyInfos: [{ name: 'content', type: 'elementRefs', collection: true, mixed: true, allowDom: false, elementTypeInfos: [{ elementName: 'p', typeInfo: '.P' }] }] },
		{ localName: 'One', propertyInfos: [{ name: 'item', type: 'elementRef', mixed: false, allowDom: false, elementName: 'p', typeInfo: '.P' }] },
		{ localName: 'WrappedRefs', propertyInfos: [{ name: 'items', type: 'elementRefs', collection: true, mixed: false, allowDom: false, wrapperElementName: 'items', elementTypeInfos: [{ elementName: 'p', typeInfo: '.P' }] }] },
		{ localName: 'WrappedElements', propertyInfos: [{ name: 'items', type: 'elements', collection: true, wrapperElementName: 'items', elementTypeInfos: [{ elementName: 'p', typeInfo: '.P' }] }] },
		{ localName: 'Any', propertyInfos: [{ name: 'any', type: 'anyElement', collection: true, mixed: false, allowDom: false }] },
		{ localName: 'Keeps', propertyInfos: [{ name: 'any', type: 'anyElement', collection: true, mixed: false }] },
		{ localName: 'Named', propertyInfos: [{ name: 'p', elementName: 'p', typeInfo: '.P' }, { name: 'n', elementName: 'n', typeInfo: 'Int' }, { name: 's', elementName: 's', typeInfo: 'String' }] },
		{ localName: 'Bad', propertyInfos: [{ name: 'content', type: 'elementRefs', collection: true, mixed: false, allowDom: false, allowTypedObject: false, elementTypeInfos: [{ elementName: 'p', typeInfo: '.P' }] }] },
		{ localName: 'Empty', propertyInfos: [] },
		{ localName: 'Text', propertyInfos: [{ name: 'value', type: 'value' }] }
	],
	elementInfos: [
		{ elementName: 'p', typeInfo: '.P' },
		{ elementName: 'body', typeInfo: '.Body' },
		{ elementName: 'derived', typeInfo: '.DerivedBody' },
		{ elementName: 'mix', typeInfo: '.Mix' },
		{ elementName: 'one', typeInfo: '.One' },
		{ elementName: 'wr', typeInfo: '.WrappedRefs' },
		{ elementName: 'we', typeInfo: '.WrappedElements' },
		{ elementName: 'any', typeInfo: '.Any' },
		{ elementName: 'keeps', typeInfo: '.Keeps' },
		{ elementName: 'named', typeInfo: '.Named' },
		{ elementName: 'bad', typeInfo: '.Bad' },
		{ elementName: 'empty', typeInfo: '.Empty' },
		{ elementName: 'text', typeInfo: '.Text' }
	]
};
var context = new Jsonix.Context([mapping]);
var simplified = new Jsonix.Context([mapping], { mappingStyle: 'simplified' });

function doc(element, inner, attributes) {
	return '<' + element + ' xmlns="' + NS + '" xmlns:t="' + NS + '" xmlns:ext="urn:ext" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
		(attributes ? ' ' + attributes : '') + '>' + inner + '</' + element + '>';
}

// Unmarshals with onUnexpectedElement recording each call, unless options replaces it; returns { value, calls, names }.
function read(xml, options, ctx) {
	var calls = [];
	var all = {
		onUnexpectedElement: function (name, node, classInfo) {
			calls.push({ name: name, node: node, classInfo: classInfo });
		}
	};
	for (var key in options) {
		all[key] = options[key];
	}
	var value = (ctx || context).createUnmarshaller(all).unmarshalString(xml).value;
	return { value: value, calls: calls, names: calls.map(function (c) { return c.name.localPart; }) };
}

function errorOf(fn) {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return null;
}

function unset(xml, ctx) {
	return errorOf(function () { (ctx || context).createUnmarshaller().unmarshalString(xml); });
}

function ids(list) {
	return list.map(function (item) { return item.value.id; });
}

module.exports = {
	"Position": {
		"KnownSiblingsAfterAnElementWithChildren": function (test) {
			var r = read(doc('body', '<p id="1"/><ext:o><p id="in"/>t<ext:deep/></ext:o><p id="2"/><ext:o2/><p id="3"/>'));
			test.deepEqual(['1', '2', '3'], ids(r.value.content), 'nothing inside the skipped element joins the list');
			test.deepEqual(['o', 'o2'], r.names, 'its children are not reported');
			test.done();
		},
		"TwoInARowFirstAndLast": function (test) {
			var r = read(doc('body', '<ext:a/><ext:b/><p id="1"/><ext:c/>'));
			test.deepEqual(['1'], ids(r.value.content));
			test.deepEqual(['a', 'b', 'c'], r.names);
			test.done();
		},
		"AListHoldingOnlySkippedElementsStaysUnset": function (test) {
			var r = read(doc('body', '<ext:a/><ext:b/>'));
			test.equal(undefined, r.value.content, 'unset, not []');
			test.deepEqual(['a', 'b'], r.names);
			test.done();
		},
		"ASingleReferenceIsNotSetTwice": function (test) {
			var r = read(doc('one', '<ext:a/><p id="1"/><ext:b/>'));
			test.equal('1', r.value.item.value.id);
			test.deepEqual(['a', 'b'], r.names);
			test.done();
		}
	},
	"Unset": {
		"AListThrowsAsItDid": function (test) {
			var error = unset(doc('body', '<ext:o/>'));
			test.equal('ext:o (line 1): Element [{urn:ext}ext:o] could not be unmarshalled as is not known in this context and the property does not allow DOM content.', error.message);
			test.done();
		},
		"AWildcardThrowsAsItDid": function (test) {
			var error = unset(doc('any', '<ext:o/>'));
			test.equal('ext:o (line 1): Element [{urn:ext}ext:o] could not be unmarshalled as is not known in this context and the property does not allow DOM content.', error.message);
			test.done();
		},
		"AClassWithoutContentThrowsAsItDid": function (test) {
			test.equal('ext:o (line 1): Illegal state: must be END_ELEMENT.', unset(doc('body', '<p><ext:o/></p>')).message);
			test.equal('Illegal state: must be END_ELEMENT.', unset(doc('p', '<ext:o/>')).message, 'unlocated at the document root');
			test.done();
		}
	},
	"ClassInfo": {
		"TheClassRead": function (test) {
			var r = read(doc('body', '<ext:o/>'));
			test.equal('test.Body', r.calls[0].classInfo.name);
			test.equal(context.getTypeInfoByName('test.Body'), r.calls[0].classInfo, 'the context\'s own type info');
			test.equal('ext:o', r.calls[0].node.nodeName);
			test.equal('body', r.calls[0].node.parentNode.nodeName);
			test.done();
		},
		"DerivedWhereABaseDeclaresTheList": function (test) {
			test.equal('test.DerivedBody', read(doc('derived', '<ext:o/>')).calls[0].classInfo.name, 'through a declared element');
			test.equal('test.DerivedBody', read(doc('body', '<ext:o/>', 'xsi:type="t:DerivedBody"')).calls[0].classInfo.name, 'through xsi:type');
			test.done();
		}
	},
	"Properties": {
		"ATypedWildcard": function (test) {
			var r = read(doc('any', '<ext:o/><p id="1"/>'));
			test.deepEqual(['1'], ids(r.value.any));
			test.deepEqual(['o'], r.names);
			test.equal('test.Any', r.calls[0].classInfo.name);
			test.done();
		},
		"AWildcardThatKeepsDomStillKeeps": function (test) {
			var r = read(doc('keeps', '<ext:o/>'));
			test.equal(1, r.value.any.length);
			test.deepEqual([], r.names, 'nothing to report: tests/callbacks.js holds the same');
			test.done();
		},
		"AMixedListKeepsTheTextEitherSide": function (test) {
			var r = read(doc('mix', 'a<ext:o>inner</ext:o>b'));
			test.deepEqual(['a', 'b'], r.value.content);
			test.deepEqual(['o'], r.names);
			test.done();
		},
		"AWrappedElementRefList": function (test) {
			var r = read(doc('wr', '<items><p id="1"/><ext:o/><p id="2"/></items>'));
			test.deepEqual(['1', '2'], ids(r.value.items));
			test.deepEqual(['o'], r.names);
			test.equal('test.WrappedRefs', r.calls[0].classInfo.name, 'the owner of the property');
			test.equal('items', r.calls[0].node.parentNode.nodeName);
			test.done();
		},
		"AWrappedElementsProperty": function (test) {
			var r = read(doc('we', '<items><p id="1"/><ext:o/><p id="2"/></items>'));
			test.deepEqual(['1', '2'], r.value.items.map(function (item) { return item.id; }));
			test.deepEqual(['o'], r.names);
			test.equal('test.WrappedElements', r.calls[0].classInfo.name);
			test.done();
		},
		"TheClassOwnBranchIsUnchanged": function (test) {
			var r = read(doc('named', '<ext:o/><p id="1"/>'));
			test.equal('1', r.value.p.id);
			test.deepEqual(['o'], r.names);
			test.done();
		}
	},
	"Root": {
		"KeepsItsThrow": function (test) {
			var xml = '<ext:o xmlns:ext="urn:ext"/>';
			var error = errorOf(function () { read(xml); });
			test.ok(error, 'no null for a caller expecting a document');
			test.equal(unset(xml).message, error.message);
			test.done();
		},
		"KeepsItsThrowWithAScope": function (test) {
			var called = 0;
			var unmarshaller = context.createUnmarshaller({ onUnexpectedElement: function () { called++; } });
			var error = errorOf(function () {
				unmarshaller.unmarshalDocument(Jsonix.DOM.parse('<ext:o xmlns:ext="urn:ext"/>'), context.getTypeInfoByName('test.Body'));
			});
			test.ok(error);
			test.equal(0, called);
			test.done();
		},
		"KeepsItsThrowSimplified": function (test) {
			var xml = '<ext:o xmlns:ext="urn:ext"/>';
			var error = errorOf(function () { read(xml, {}, simplified); });
			test.equal(unset(xml, simplified).message, error.message);
			test.done();
		}
	},
	"SiblingThrow": {
		"StaysForADeclaredName": function (test) {
			var error = errorOf(function () { read(doc('bad', '<p/>')); });
			test.ok(/neither allows typed objects nor DOM/.test(error.message), error.message);
			test.done();
		},
		"AnUnknownNameGoesToTheClassBranch": function (test) {
			test.deepEqual(['o'], read(doc('bad', '<ext:o/>')).names);
			test.done();
		}
	},
	"OtherCallbacks": {
		"TextInsideIsNotReportedAndTheOrderIsTheDocument": function (test) {
			var log = [];
			var result = read(doc('body', 'x<ext:o>inner</ext:o>y<p id="1"/>'), {
				onUnexpectedElement: function (name) { log.push(name.localPart); },
				onUnexpectedText: function (text) { log.push(text); }
			});
			test.deepEqual(['x', 'o', 'y'], log);
			test.deepEqual(['1'], ids(result.value.content));
			test.done();
		},
		"OnElementSkipsTheElementAndTheParentComesLast": function (test) {
			var seen = [];
			read(doc('body', '<ext:o><p id="in"/></ext:o><p id="1"/>'), { onElement: function (element) { seen.push(element.nodeName); } });
			test.deepEqual(['p', 'body'], seen);
			test.done();
		},
		"ParentPointers": function (test) {
			var r = read(doc('body', '<p id="1"/><ext:o><p/></ext:o><p id="2"><ext:q/></p>'), { parentPointers: true });
			test.equal(r.value, r.value.content[0].value.PARENT);
			test.equal(r.value, r.value.content[1].value.PARENT, 'neither skip leaves anything on the stack');
			test.done();
		},
		"WildcardTypeInfoAnswering": function (test) {
			var r = read(doc('any', '<ext:o id="9"/>'), { wildcardTypeInfo: function () { return context.getTypeInfoByName('test.P'); } });
			test.equal('9', r.value.any[0].value.id);
			test.deepEqual([], r.names, 'typed, so nothing is dropped');
			test.done();
		},
		"WildcardTypeInfoNotAnswering": function (test) {
			var r = read(doc('any', '<ext:o/>'), { wildcardTypeInfo: function () { return undefined; } });
			test.deepEqual(['o'], r.names);
			test.done();
		}
	},
	"XsiType": {
		"KnownTypesTheElement": function (test) {
			var r = read(doc('body', '<ext:o xsi:type="t:P" id="9"/>'));
			test.deepEqual(['9'], ids(r.value.content));
			test.deepEqual([], r.names);
			test.done();
		},
		"UnknownIsReported": function (test) {
			test.deepEqual(['o'], read(doc('body', '<ext:o xsi:type="t:Nope"/>')).names);
			test.done();
		},
		"AnUnboundPrefixStillFails": function (test) {
			var error = errorOf(function () { read(doc('body', '<ext:o xsi:type="zz:Nope"/>')); });
			test.ok(/Prefix \[zz\] of the QName \[zz:Nope\] is not bound in this context\./.test(error.message), error.message);
			test.done();
		}
	},
	"ThrowFromTheCallback": {
		"IsLocatedInAProperty": function (test) {
			var error = errorOf(function () { read(doc('body', '<ext:o/>'), { onUnexpectedElement: function () { throw new Error('refused'); } }); });
			test.equal('ext:o (line 1): refused', error.message);
			test.done();
		},
		"IsLocatedInAClassWithoutContent": function (test) {
			var error = errorOf(function () { read(doc('body', '<p><ext:o/></p>'), { onUnexpectedElement: function () { throw new Error('refused'); } }); });
			test.equal('ext:o (line 1): refused', error.message);
			test.done();
		}
	},
	"Simplified": function (test) {
		// This style names the result by its element, so the value is not at .value.
		var names = [];
		var result = simplified.createUnmarshaller({ onUnexpectedElement: function (name) { names.push(name.localPart); } })
			.unmarshalString(doc('body', '<p id="1"/><ext:o/><p id="2"><ext:q/></p>'));
		test.deepEqual(['1', '2'], result.body.content.map(function (item) { return item.p.id; }));
		test.deepEqual(['o', 'q'], names);
		test.done();
	},
	"ClassWithoutContent": {
		"ElementsTextAndCommentsInterleaved": function (test) {
			var log = [];
			var classes = [];
			var result = read(doc('body', '<p id="1">x<ext:o>inner</ext:o>z<!-- c --><ext:q/>w</p><p id="2"/>'), {
				onUnexpectedElement: function (name, node, classInfo) { log.push(name.localPart); classes.push(classInfo.name); },
				onUnexpectedText: function (text) { log.push(text); }
			});
			test.deepEqual(['x', 'o', 'z', 'q', 'w'], log);
			test.deepEqual(['test.P', 'test.P'], classes);
			test.deepEqual(['1', '2'], ids(result.value.content), 'the input ends on the host\'s END_ELEMENT');
			test.done();
		},
		"OnUnexpectedElementAlone": function (test) {
			var r = read(doc('body', '<p id="1">x<ext:o>inner</ext:o>z<ext:q/></p><p id="2"/>'));
			test.deepEqual(['o', 'q'], r.names);
			test.deepEqual(['1', '2'], ids(r.value.content));
			test.done();
		},
		"OnUnexpectedTextAloneThrowsAsItDid": function (test) {
			var xml = doc('body', '<p>x<ext:o/></p>');
			var texts = [];
			var error = errorOf(function () {
				context.createUnmarshaller({ onUnexpectedText: function (text) { texts.push(text); } }).unmarshalString(xml);
			});
			test.deepEqual(['x'], texts);
			test.equal(unset(xml).message, error.message);
			test.done();
		},
		"NoProperties": function (test) {
			var r = read(doc('body', '<empty><ext:o/><ext:q/></empty><p id="1"/>'));
			test.deepEqual(['o', 'q'], r.names);
			test.equal('test.Empty', r.calls[0].classInfo.name);
			test.equal(2, r.value.content.length);
			test.done();
		},
		"AtTheRoot": function (test) {
			var r = read(doc('p', '<ext:o/>', 'id="7"'));
			test.equal('7', r.value.id, 'attributes are read as before');
			test.deepEqual(['o'], r.names);
			test.equal('test.P', r.calls[0].classInfo.name);
			test.done();
		},
		"AChildTheClassCouldNotHoldIsNotTyped": function (test) {
			var r = read(doc('p', '<p id="in"/>'));
			test.deepEqual(['p'], r.names, 'even a name the context knows: the class has no place for it');
			test.done();
		}
	},
	"AValueKeepsItsThrow": {
		"AValueClass": function (test) {
			var xml = doc('body', '<text>hi<ext:o/> there</text>');
			var called = 0;
			var error = errorOf(function () {
				context.createUnmarshaller({ onUnexpectedElement: function () { called++; } }).unmarshalString(xml);
			});
			test.equal(unset(xml).message, error.message);
			test.equal('ext:o (line 1): Element text content may not contain START_ELEMENT.', error.message);
			test.equal(0, called);
			test.done();
		},
		"ASimpleTypedElement": function (test) {
			['<n>1<ext:o/>2</n>', '<s>a<ext:o/>b</s>'].forEach(function (inner) {
				var xml = doc('named', inner);
				var error = errorOf(function () { read(xml); });
				test.equal(unset(xml).message, error.message);
				test.ok(/Element text content may not contain START_ELEMENT\./.test(error.message), error.message);
			});
			test.done();
		}
	}
};
