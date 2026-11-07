// jsonix-CR-016: a single-valued property given a second element keeps the last. With onOverwrittenElement set, that is
// reported once for each value overwritten, with both elements and both values. The runtime stores the same value set or
// unset: these tests read every shape both ways. A report is not a validity claim, and the runtime merges nothing: a caller
// can, since keptValue is the object that is stored.
var Jsonix = require('../jsonix').Jsonix;

var NS = 'urn:test';
var mapping = {
	name: 'test',
	defaultElementNamespaceURI: NS,
	defaultTypeNamespaceURI: NS,
	typeInfos: [
		{ localName: 'P', propertyInfos: [{ name: 'id', type: 'attribute', attributeName: { localPart: 'id' } }] },
		{ localName: 'Q', propertyInfos: [{ name: 'id', type: 'attribute', attributeName: { localPart: 'id' } }] },
		{ localName: 'Container', propertyInfos: [{ name: 'content', collection: true, elementName: 'p', typeInfo: '.P' }] },
		{ localName: 'Named', propertyInfos: [
			{ name: 'p', elementName: 'p', typeInfo: '.P' },
			{ name: 'n', elementName: 'n', typeInfo: 'Integer' },
			{ name: 's', elementName: 's', typeInfo: 'String' },
			{ name: 'container', elementName: 'container', typeInfo: '.Container' }
		] },
		{ localName: 'DerivedNamed', baseTypeInfo: '.Named', propertyInfos: [{ name: 'q', elementName: 'q', typeInfo: '.Q' }] },
		{ localName: 'Holder', propertyInfos: [{ name: 'named', elementName: 'named', typeInfo: '.Named' }] },
		{ localName: 'Choice', propertyInfos: [{ name: 'x', type: 'elements', elementTypeInfos: [{ elementName: 'p', typeInfo: '.P' }, { elementName: 'q', typeInfo: '.Q' }] }] },
		{ localName: 'Ref', propertyInfos: [{ name: 'r', type: 'elementRef', mixed: false, elementName: 'p', typeInfo: '.P' }] },
		{ localName: 'Refs', propertyInfos: [{ name: 'r', type: 'elementRefs', mixed: false, elementTypeInfos: [{ elementName: 'p', typeInfo: '.P' }, { elementName: 'q', typeInfo: '.Q' }] }] },
		{ localName: 'Head', propertyInfos: [{ name: 'h', type: 'elementRef', mixed: false, elementName: 'head', typeInfo: '.P' }] },
		{ localName: 'WildDom', propertyInfos: [{ name: 'a', type: 'anyElement', mixed: false, allowTypedObject: false }] },
		{ localName: 'WildTyped', propertyInfos: [{ name: 'a', type: 'anyElement', mixed: false }] },
		{ localName: 'WildNoDom', propertyInfos: [{ name: 'a', type: 'anyElement', mixed: false, allowDom: false }] },
		{ localName: 'WildMixed', propertyInfos: [{ name: 'a', type: 'anyElement' }] },
		{ localName: 'RefMixed', propertyInfos: [{ name: 'r', type: 'elementRef', elementName: 'p', typeInfo: '.P' }] },
		{ localName: 'Wrap', propertyInfos: [{ name: 'w', type: 'element', elementName: 'p', typeInfo: '.P', wrapperElementName: 'wr' }] },
		{ localName: 'Map', propertyInfos: [{ name: 'm', type: 'elementMap', elementName: 'e', key: { name: 'k', type: 'attribute', attributeName: { localPart: 'k' } }, value: { name: 'v', type: 'attribute', attributeName: { localPart: 'v' } } }] },
		{ localName: 'Col', propertyInfos: [{ name: 'p', collection: true, elementName: 'p', typeInfo: '.P' }] },
		{ localName: 'Inherited', propertyInfos: [{ name: 'constructor', elementName: 'c', typeInfo: '.P' }, { name: 'toString', elementName: 't', typeInfo: '.P' }, { name: '__proto__', elementName: 'o', typeInfo: 'String' }] },
		{ localName: 'Leaf', propertyInfos: [{ name: 'c', elementName: 'c', typeInfo: '.P' }] },
		{ localName: 'Branch', propertyInfos: [{ name: 'leaf', elementName: 'leaf', typeInfo: '.Leaf' }] },
		{ localName: 'Tree', propertyInfos: [{ name: 'branch', elementName: 'branch', typeInfo: '.Branch' }] }
	],
	elementInfos: [
		{ elementName: 'p', typeInfo: '.P' },
		{ elementName: 'q', typeInfo: '.Q' },
		{ elementName: 'head', typeInfo: '.P' },
		{ elementName: 'member', typeInfo: '.P', substitutionHead: 'head' }
	].concat(['Named', 'DerivedNamed', 'Holder', 'Choice', 'Ref', 'Refs', 'Head', 'WildDom', 'WildTyped', 'WildNoDom', 'WildMixed', 'RefMixed', 'Wrap', 'Map', 'Col', 'Inherited', 'Tree'].map(function (name) {
		return { elementName: name.toLowerCase(), typeInfo: '.' + name };
	}))
};
var context = new Jsonix.Context([mapping]);
var simplified = new Jsonix.Context([mapping], { mappingStyle: 'simplified' });

function doc(element, inner) {
	return '<' + element + ' xmlns="' + NS + '" xmlns:ext="urn:ext" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + inner + '</' + element + '>';
}

function p(id, name) {
	return '<' + (name || 'p') + ' id="' + id + '"/>';
}

// What a tree holds, for comparing a read with the callback set against one without it.
function shape(value) {
	return JSON.stringify(value, function (key, item) {
		return item && item.nodeType ? 'DOM:' + item.nodeName : item;
	});
}

function describe(node) {
	var id = node.getAttribute('id');
	return node.localName + (id ? '#' + id : '');
}

// Reads with the callback recording each call, then without it, and checks the two trees are the same. A shape that
// throws throws the same error both ways; { error } is returned then.
function read(test, xml, options, ctx) {
	var calls = [];
	var all = {
		onOverwrittenElement: function (node, keptNode, propertyInfo, classInfo, value, keptValue) {
			calls.push({ node: node, keptNode: keptNode, propertyInfo: propertyInfo, classInfo: classInfo, value: value, keptValue: keptValue });
		}
	};
	for (var key in options) {
		all[key] = options[key];
	}
	var used = ctx || context;
	var set = attempt(function () { return used.createUnmarshaller(all).unmarshalString(xml); });
	var unset = attempt(function () { return used.createUnmarshaller(options ? without(options) : undefined).unmarshalString(xml); });
	test.equal(unset.error, set.error, 'the same error, set or unset');
	test.equal(shape(unset.value), shape(set.value), 'the same tree, set or unset');
	return { value: set.value && set.value.value, whole: set.value, error: set.error, calls: calls, names: calls.map(function (c) { return describe(c.node) + '>' + describe(c.keptNode); }) };
}

function without(options) {
	var copy = {};
	for (var key in options) {
		if (key !== 'onOverwrittenElement') {
			copy[key] = options[key];
		}
	}
	return copy;
}

function attempt(fn) {
	try {
		return { value: fn() };
	} catch (e) {
		return { error: e.message };
	}
}

module.exports = {
	"Reported": {
		"ANamedClassTwice": function (test) {
			var r = read(test, doc('named', p(1) + p(2)));
			test.equal('2', r.value.p.id, 'the last');
			test.deepEqual(['p#1>p#2'], r.names);
			test.done();
		},
		"BothNodesAndBothValues": function (test) {
			var r = read(test, doc('named', p(1) + p(2)));
			var call = r.calls[0];
			test.equal(1, r.calls.length);
			test.equal('1', call.node.getAttribute('id'), 'node is the lost element');
			test.equal('2', call.keptNode.getAttribute('id'), 'keptNode is the one the tree holds');
			test.equal('1', call.value.id, 'value is the lost value, complete');
			test.equal('p', call.propertyInfo.name);
			test.equal('test.Named', call.classInfo.name);
			test.strictEqual(call.keptNode.parentNode, call.node.parentNode, 'siblings');
			test.done();
		},
		"TheKeptValueIsTheOneStored": function (test) {
			var r = read(test, doc('named', p(1) + p(2)));
			test.strictEqual(r.value.p, r.calls[0].keptValue);
			test.done();
		},
		"AnIntegerTwice": function (test) {
			var r = read(test, doc('named', '<n>1</n><n>2</n>'));
			test.equal(2, r.value.n);
			test.equal(1, r.calls[0].value);
			test.equal(2, r.calls[0].keptValue);
			test.equal(1, r.calls.length);
			test.done();
		},
		"AStringTwice": function (test) {
			var r = read(test, doc('named', '<s>a</s><s>b</s>'));
			test.equal('b', r.value.s);
			test.equal('a', r.calls[0].value);
			test.equal(1, r.calls.length);
			test.done();
		},
		"ThreeElementsGiveTwoCalls": function (test) {
			var r = read(test, doc('named', p(1) + p(2) + p(3)));
			test.equal('3', r.value.p.id);
			test.deepEqual(['p#1>p#2', 'p#2>p#3'], r.names, 'first to second, second to third');
			test.equal('1', r.calls[0].value.id);
			test.equal('2', r.calls[1].value.id);
			test.done();
		},
		"AChoiceOfDifferentNames": function (test) {
			var r = read(test, doc('choice', p(1) + p(2, 'q')));
			test.equal('2', r.value.x.id);
			test.deepEqual(['p#1>q#2'], r.names, 'whatever the two elements are called');
			test.done();
		},
		"AChoiceOfOneNameTwice": function (test) {
			test.deepEqual(['p#1>p#2'], read(test, doc('choice', p(1) + p(2))).names);
			test.done();
		},
		"AnElementReferenceTwice": function (test) {
			var r = read(test, doc('ref', p(1) + p(2)));
			test.equal('2', r.value.r.value.id);
			test.deepEqual(['p#1>p#2'], r.names);
			test.equal('1', r.calls[0].value.value.id, 'a reference value keeps its name and value');
			test.done();
		},
		"ElementReferencesOfDifferentNames": function (test) {
			test.deepEqual(['p#1>q#2'], read(test, doc('refs', p(1) + p(2, 'q'))).names);
			test.done();
		},
		"ASubstitutionGroupMember": function (test) {
			var r = read(test, doc('head', p(1, 'head') + p(2, 'member')));
			test.equal('member', r.value.h.name.localPart);
			test.deepEqual(['head#1>member#2'], r.names);
			test.done();
		},
		"ADomWildcardTwice": function (test) {
			var r = read(test, doc('wilddom', '<ext:a id="1"/><ext:b id="2"/>'));
			test.equal('b', r.value.a.localName);
			test.deepEqual(['a#1>b#2'], r.names);
			test.strictEqual(r.calls[0].node, r.calls[0].value, 'wildcard DOM content is the source node itself');
			test.done();
		},
		"ATypedWildcardTwice": function (test) {
			var r = read(test, doc('wildtyped', p(1) + p(2)));
			test.equal('2', r.value.a.value.id);
			test.deepEqual(['p#1>p#2'], r.names);
			test.done();
		},
		"ATypedWildcardAKnownThenAnUnknownElement": function (test) {
			var r = read(test, doc('wildtyped', p(1) + '<ext:b id="2"/>'));
			test.equal('b', r.value.a.localName, 'the DOM node');
			test.deepEqual(['p#1>b#2'], r.names);
			test.done();
		},
		"AWrapperTwiceNamesTheWrappers": function (test) {
			var r = read(test, doc('wrap', '<wr id="1">' + p(10) + '</wr><wr id="2">' + p(20) + '</wr>'));
			test.equal('20', r.value.w.id);
			test.deepEqual(['wr#1>wr#2'], r.names);
			test.done();
		},
		"AnEmptyStringIsAValue": function (test) {
			var r = read(test, doc('named', '<s>a</s><s/>'));
			test.equal('', r.value.s);
			test.equal(1, r.calls.length);
			test.equal('', r.calls[0].keptValue);
			test.done();
		},
		"TheLostElementIsTheLastThatGaveAValue": function (test) {
			var r = read(test, '<named xmlns="' + NS + '"><n id="1"/><n id="2">5</n><n id="3">6</n></named>');
			test.equal(6, r.value.n);
			test.deepEqual(['n#2>n#3'], r.names, 'not the sibling before, which gave nothing');
			test.done();
		},
		"AnEmptyElementBetweenTwoValuesIsPassedOver": function (test) {
			var r = read(test, '<named xmlns="' + NS + '"><n id="1">5</n><n id="2"/><n id="3">6</n></named>');
			test.equal(6, r.value.n);
			test.deepEqual(['n#1>n#3'], r.names);
			test.done();
		},
		"APropertyOnABaseTypeThroughADerivedClass": function (test) {
			var r = read(test, doc('derivednamed', p(1) + p(2)));
			test.deepEqual(['p#1>p#2'], r.names);
			test.equal('test.DerivedNamed', r.calls[0].classInfo.name, 'the class being read');
			test.equal('p', r.calls[0].propertyInfo.name);
			test.done();
		},
		"APropertyOnABaseTypeThroughXsiType": function (test) {
			var r = read(test, doc('holder', '<named xsi:type="DerivedNamed">' + p(1) + p(2) + '</named>'));
			test.equal('test.DerivedNamed', r.value.named.TYPE_NAME);
			test.deepEqual(['p#1>p#2'], r.names);
			test.equal('test.DerivedNamed', r.calls[0].classInfo.name);
			test.done();
		},
		"EachClassReadKeepsItsOwnElements": function (test) {
			var r = read(test, doc('tree', '<branch><leaf>' + p(1, 'c') + '</leaf></branch><branch><leaf>' + p(2, 'c') + '</leaf></branch>'));
			test.equal(1, r.calls.length, 'the two c are in different leaves');
			test.equal('branch', r.calls[0].propertyInfo.name);
			test.done();
		},
		"TheSimplifiedStyle": function (test) {
			var named = read(test, doc('named', p(1) + p(2)), null, simplified);
			test.equal('2', named.whole.named.p.id);
			test.deepEqual(['p#1>p#2'], named.names);
			test.deepEqual(['p#1>q#2'], read(test, doc('refs', p(1) + p(2, 'q')), null, simplified).names);
			var wildcard = read(test, doc('wildtyped', p(1) + p(2)), null, simplified);
			test.equal('2', wildcard.whole.wildtyped.a.p.id);
			test.deepEqual(['p#1>p#2'], wildcard.names);
			test.done();
		}
	},
	"NotReported": {
		"OneElement": function (test) {
			test.deepEqual([], read(test, doc('named', p(1))).names);
			test.done();
		},
		"TwoDifferentProperties": function (test) {
			test.deepEqual([], read(test, doc('named', p(1) + '<n>2</n><s>x</s>')).names);
			test.done();
		},
		"ACollection": function (test) {
			var r = read(test, doc('col', p(1) + p(2)));
			test.equal(2, r.value.p.length);
			test.deepEqual([], r.names);
			test.done();
		},
		"ASecondElementThatGivesNoValue": function (test) {
			var r = read(test, doc('named', '<n>5</n><n/>'));
			test.equal(5, r.value.n, 'the first stands');
			test.deepEqual([], read(test, doc('named', '<n/><n>5</n>')).names);
			test.deepEqual([], r.names);
			test.done();
		},
		"AWildcardThatCannotHoldTheSecond": function (test) {
			var unexpected = [];
			var r = read(test, doc('wildnodom', p(1) + '<ext:b/>'), {
				onUnexpectedElement: function (name) { unexpected.push(name.localPart); }
			});
			test.equal('1', r.value.a.value.id, 'the known');
			test.deepEqual([], r.names);
			test.deepEqual(['b', 'b'], unexpected, 'jsonix-CR-015 reports it, once for each of the two reads here');
			test.done();
		},
		"TwoChildrenInOneWrapperThrowInstead": function (test) {
			var r = read(test, doc('wrap', '<wr>' + p(1) + p(2) + '</wr>'));
			test.ok(/Value already set\./.test(r.error), r.error);
			test.deepEqual([], r.names);
			test.done();
		},
		"AMap": function (test) {
			var keys = read(test, doc('map', '<e k="a" v="1"/><e k="b" v="2"/>'));
			test.equal('1', keys.value.m.a);
			test.equal('2', keys.value.m.b);
			test.deepEqual([], keys.calls);
			var sameKey = read(test, doc('map', '<e k="a" v="1"/><e k="a" v="2"/>'));
			test.equal('2', sameKey.value.m.a);
			test.deepEqual([], sameKey.calls);
			test.done();
		},
		"AMixedProperty": function (test) {
			test.deepEqual([], read(test, doc('wildmixed', p(1) + p(2))).calls, 'two elements');
			test.deepEqual([], read(test, doc('wildmixed', p(1) + 'text' + p(2))).calls, 'an element, text, an element');
			test.deepEqual([], read(test, doc('refmixed', p(1) + 'text')).calls, 'an element, then text');
			test.done();
		},
		"APropertyNamedAsAnInheritedMember": function (test) {
			// A plain object would find Object.prototype's constructor and toString, and report what was never read twice.
			var r = read(test, doc('inherited', p(1, 'c') + p(2, 't') + '<o>x</o>'));
			test.deepEqual([], r.calls);
			test.done();
		},
		"NothingOnTheMarshalSide": function (test) {
			var value = context.createUnmarshaller().unmarshalString(doc('named', p(1)));
			var called = 0;
			var marshaller = context.createMarshaller({ onOverwrittenElement: function () { called++; } });
			test.ok(/id="1"/.test(marshaller.marshalString(value)));
			test.equal(0, called);
			test.done();
		}
	},
	"PropertiesNamedAsInheritedMembers": {
		"AreStillReportedWhenRepeated": function (test) {
			var r = read(test, doc('inherited', p(1, 'c') + p(2, 'c') + p(3, 't') + p(4, 't') + '<o>x</o><o>y</o>'));
			test.deepEqual(['constructor', 'toString', '__proto__'], r.calls.map(function (c) { return c.propertyInfo.name; }));
			test.done();
		}
	},
	"Order": {
		"TheReportFollowsTheSecondElement": function (test) {
			var trace = [];
			function id(node) { return node.getAttribute('id') || ''; }
			var ordering = {
				name: 'order',
				defaultElementNamespaceURI: NS,
				defaultTypeNamespaceURI: NS,
				typeInfos: [
					{ localName: 'C', propertyInfos: [{ name: 'id', type: 'attribute', attributeName: { localPart: 'id' } }] },
					{ localName: 'P', propertyInfos: [{ name: 'c', elementName: 'c', typeInfo: '.C' }] },
					{ localName: 'R', propertyInfos: [{ name: 'p', elementName: 'p', typeInfo: '.P' }] }
				],
				elementInfos: [{ elementName: 'r', typeInfo: '.R' }]
			};
			var lost;
			var value = new Jsonix.Context([ordering]).createUnmarshaller({
				parentPointers: true,
				onElement: function (node) { trace.push('onElement ' + node.localName + id(node)); },
				onUnexpectedElement: function (name) { trace.push('unexpected ' + name.localPart); },
				onUnexpectedText: function (text) { trace.push('text ' + text); },
				onOverwrittenElement: function (node, keptNode, propertyInfo, classInfo, overwritten) {
					trace.push('overwritten ' + node.localName);
					lost = overwritten;
				}
			}).unmarshalString('<r xmlns="' + NS + '"><p><c id="1"/><x/>t</p><p><c id="2"/><c id="3"/></p></r>').value;
			test.deepEqual([
				'onElement c1', 'unexpected x', 'text t', 'onElement p',
				'onElement c2', 'onElement c3', 'overwritten c', 'onElement p',
				'overwritten p', 'onElement r'
			], trace);
			test.equal('1', lost.c.id, 'the lost value stays intact');
			test.strictEqual(value, lost.PARENT, 'a lost value still names the object it would have been stored on');
			test.equal('3', value.p.c.id);
			test.done();
		}
	},
	"ACaller": {
		"ThrowsAndTheErrorIsLocatedAtTheSecondElement": function (test) {
			var error = attempt(function () {
				context.createUnmarshaller({
					onOverwrittenElement: function () { throw new Error('refused'); }
				}).unmarshalString('<named xmlns="' + NS + '">\n' + p(1) + '\n\n' + p(2) + '\n</named>');
			}).error;
			test.equal('p (line 4): refused', error);
			test.done();
		},
		"HasTheFirstsLineFromNode": function (test) {
			var r = read(test, '<named xmlns="' + NS + '">\n' + p(1) + '\n\n' + p(2) + '\n</named>');
			test.equal(2, r.calls[0].node.lineNumber);
			test.equal(4, r.calls[0].keptNode.lineNumber);
			test.done();
		},
		"JoinsInTheCallbackAndItMarshalsAsOne": function (test) {
			var doubled = doc('named', '<container>' + p(1) + '</container><container>' + p(2) + '</container><container>' + p(3) + '</container>');
			var value = context.createUnmarshaller({
				onOverwrittenElement: function (node, keptNode, propertyInfo, classInfo, lost, kept) {
					kept.content = lost.content.concat(kept.content);
				}
			}).unmarshalString(doubled);
			var xml = context.createMarshaller().marshalString(value);
			test.equal(1, xml.match(/<(\w+:)?container/g).length, 'one element');
			test.deepEqual(['1', '2', '3'], xml.match(/id="\d"/g).map(function (a) { return a.charAt(4); }));
			test.done();
		},
		"CannotChooseTheValueByReturningOne": function (test) {
			var r = read(test, doc('named', p(1) + p(2)), {
				onOverwrittenElement: function (node, keptNode, propertyInfo, classInfo, value) { return value; }
			});
			test.equal('2', r.value.p.id);
			var arrow = [];
			var pushed = read(test, doc('named', '<n>1</n><n>2</n>'), {
				onOverwrittenElement: function (node) { return arrow.push(node); }
			});
			test.equal(2, pushed.value.n, 'a number returned by accident is not stored');
			test.equal(1, arrow.length);
			test.done();
		},
		"SetsItPerCallAndTheContextIsNotWritten": function (test) {
			var calls = 0;
			context.createUnmarshaller({ onOverwrittenElement: function () { calls++; } }).unmarshalString(doc('named', p(1) + p(2)));
			context.createUnmarshaller().unmarshalString(doc('named', p(1) + p(2)));
			test.equal(1, calls);
			test.equal(undefined, context.onOverwrittenElement);
			test.done();
		},
		"SetsItOnADerivedContext": function (test) {
			var calls = 0;
			var derived = context.deriveContext({ onOverwrittenElement: function () { calls++; } });
			derived.createUnmarshaller().unmarshalString(doc('named', p(1) + p(2)));
			test.equal(1, calls);
			test.done();
		}
	}
};
