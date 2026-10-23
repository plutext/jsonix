// jsonix-CR-010: an attribute value its type refuses goes to the caller's onInvalidValue (unmarshal) instead of
// failing the whole unmarshal, and a value its type cannot print to onUnprintableValue (marshal); unset, both
// errors are what they were.
var Jsonix = require('../jsonix').Jsonix;

var W = 'urn:w';
var A = 'urn:a';
var w = {
	name: 'w',
	defaultElementNamespaceURI: W,
	defaultAttributeNamespaceURI: W,
	typeInfos: [
		{ localName: 'OnOff', propertyInfos: [{ name: 'val', type: 'attribute', typeInfo: 'Boolean' }] },
		{ type: 'enumInfo', localName: 'Underline', values: ['single', 'double', 'none'] },
		{ localName: 'U', propertyInfos: [
			{ name: 'val', type: 'attribute', typeInfo: '.Underline' },
			{ name: 'size', type: 'attribute', typeInfo: 'Integer' }
		] },
		{ localName: 'BigU', baseTypeInfo: '.U', propertyInfos: [{ name: 'weight', type: 'attribute', typeInfo: 'Integer' }] },
		{ localName: 'RPr', propertyInfos: [
			{ name: 'b', type: 'element', typeInfo: '.OnOff' },
			{ name: 'u', type: 'element', typeInfo: '.U' },
			{ name: 'anchor', type: 'element', elementName: { namespaceURI: A, localPart: 'anchor' }, typeInfo: 'a.Anchor' }
		] }
	],
	elementInfos: [{ elementName: 'rPr', typeInfo: '.RPr' }, { elementName: 'u', typeInfo: '.U' }]
};
var a = {
	name: 'a',
	defaultElementNamespaceURI: A,
	typeInfos: [{ localName: 'Anchor', propertyInfos: [{ name: 'locked', type: 'attribute', typeInfo: 'Boolean' }] }],
	elementInfos: [{ elementName: 'anchor', typeInfo: '.Anchor' }]
};
var context = new Jsonix.Context([w, a], { namespacePrefixes: { 'urn:w': 'w', 'urn:a': 'a' } });

// The kind of policy a facade sets for WordprocessingML: Word's on/off rule and kept enumeration values for module w,
// today's error for everything else.
var word = function (text, propertyInfo, classInfo, node, error) {
	if (classInfo.module.name !== 'w') {
		throw error;
	}
	if (propertyInfo.typeInfo === Jsonix.Schema.XSD.Boolean.INSTANCE) {
		return text !== 'false' && text !== 'off' && text !== '0';
	}
	if (propertyInfo.typeInfo instanceof Jsonix.Model.EnumLeafInfo) {
		return text;
	}
	throw error;
};
var keep = function (value, propertyInfo, classInfo, error) {
	if (typeof value === 'string' && propertyInfo.typeInfo instanceof Jsonix.Model.EnumLeafInfo) {
		return value;
	}
	throw error;
};

var NS = 'xmlns:w="urn:w" xmlns:a="urn:a" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
var rPr = function (content) {
	return '<w:rPr ' + NS + '>' + content + '</w:rPr>';
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
	"Unmarshal": {
		"UnsetGivesTodaysError": function (test) {
			var xml = rPr('<w:b w:val="FALSE"/>');
			var unset = errorOf(function () { context.createUnmarshaller().unmarshalString(xml); });
			test.ok(/^w:b\/@w:val \(line 1\): Either \[true\], \[1\], \[on\], \[false\], \[0\] or \[off\] expected as boolean value\.$/.test(unset.message), unset.message);
			var rethrown = errorOf(function () {
				context.createUnmarshaller({ onInvalidValue: function (text, propertyInfo, classInfo, node, error) { throw error; } }).unmarshalString(xml);
			});
			test.equal(unset.message, rethrown.message, 'rethrowing the error is today\'s behaviour, located the same way');
			test.ok(rethrown.jsonixLocated);
			test.done();
		},
		"TheReturnedValueIsStored": function (test) {
			var unmarshaller = context.createUnmarshaller({ onInvalidValue: word });
			['FALSE', ' false', 'false ', '', ' ', 'yes', 'no', '00', 'Off'].forEach(function (text) {
				var value = unmarshaller.unmarshalString(rPr('<w:b w:val="' + text + '"/>')).value;
				test.strictEqual(true, value.b.val, JSON.stringify(text) + ' reads as on');
			});
			['false', 'off', '0'].forEach(function (text) {
				test.strictEqual(false, unmarshaller.unmarshalString(rPr('<w:b w:val="' + text + '"/>')).value.b.val, text + ' parses as before');
			});
			var u = unmarshaller.unmarshalString(rPr('<w:u w:val="Single" w:size="2"/>')).value.u;
			test.strictEqual('Single', u.val, 'kept as its string');
			test.strictEqual(2, u.size, 'the other attributes are read as before');
			test.done();
		},
		"UndefinedOrNullLeavesThePropertyUnset": function (test) {
			[undefined, null].forEach(function (returned) {
				var u = context.createUnmarshaller({ onInvalidValue: function () { return returned; } })
					.unmarshalString(rPr('<w:u w:val="Single" w:size="2"/>')).value.u;
				test.ok(!u.hasOwnProperty('val'), String(returned) + ': no val');
				test.strictEqual(2, u.size);
			});
			test.done();
		},
		"AThrowIsLocated": function (test) {
			var e = errorOf(function () {
				context.createUnmarshaller({ onInvalidValue: function () { throw new Error('refused here'); } })
					.unmarshalString(rPr('<w:u w:val="Single"/>'));
			});
			test.equal('w:u/@w:val (line 1): refused here', e.message);
			test.ok(e.jsonixLocated);
			test.done();
		},
		"NotCalledForValidValues": function (test) {
			var calls = 0;
			var value = context.createUnmarshaller({ onInvalidValue: function () { calls++; } })
				.unmarshalString(rPr('<w:b w:val="on"/><w:u w:val="double" w:size="4"/><a:anchor locked="1"/>')).value;
			test.equal(0, calls);
			test.deepEqual([true, 'double', 4, true], [value.b.val, value.u.val, value.u.size, value.anchor.locked]);
			test.done();
		},
		"TheArguments": function (test) {
			var calls = [];
			context.createUnmarshaller({
				onInvalidValue: function (text, propertyInfo, classInfo, node, error) {
					calls.push([text, propertyInfo.name, propertyInfo.typeInfo.name, propertyInfo.attributeName.localPart, classInfo.name,
						classInfo.module.name, node.nodeName, node.lineNumber, error instanceof Error, error.jsonixLocated === true]);
					return undefined;
				}
			}).unmarshalString(rPr('<w:u w:val="Single" w:size="12pt"/>'));
			test.deepEqual([
				['Single', 'val', 'w.Underline', 'val', 'w.U', 'w', 'w:u', 1, true, false],
				['12pt', 'size', 'Integer', 'size', 'w.U', 'w', 'w:u', 1, true, false]
			], calls, 'the text, the property, its type, the class info, its module, the element, the error not yet located');
			var derived = [];
			context.createUnmarshaller({ onInvalidValue: function (text, propertyInfo, classInfo) { derived.push(classInfo.name); } })
				.unmarshalString('<w:u ' + NS + ' xsi:type="w:BigU" w:val="bogus"/>');
			test.deepEqual(['w.BigU'], derived, 'an xsi:type element: the class info read is the derived type');
			test.done();
		},
		"ScopedByTheClassInfosModule": function (test) {
			var unmarshaller = context.createUnmarshaller({ onInvalidValue: word });
			test.strictEqual(true, unmarshaller.unmarshalString(rPr('<w:b w:val="FALSE"/><a:anchor locked="1"/>')).value.b.val);
			var e = errorOf(function () { unmarshaller.unmarshalString(rPr('<w:b w:val="FALSE"/><a:anchor locked="FALSE"/>')); });
			test.ok(/^a:anchor\/@locked \(line 1\): Either \[true\]/.test(e.message), 'another module in the same part keeps today\'s error: ' + e.message);
			test.done();
		},
		"SetOnADerivedContextOnly": function (test) {
			context.createUnmarshaller({ onInvalidValue: word }).unmarshalString(rPr('<w:b w:val="FALSE"/>'));
			test.ok(!context.onInvalidValue, 'the shared context is untouched');
			test.ok(errorOf(function () { context.createUnmarshaller().unmarshalString(rPr('<w:b w:val="FALSE"/>')); }));
			test.done();
		}
	},
	"Marshal": {
		"AKeptStringIsWrittenBack": function (test) {
			var element = context.createUnmarshaller({ onInvalidValue: word }).unmarshalString(rPr('<w:u w:val="Single" w:size="2"/>'));
			var e = errorOf(function () { context.createMarshaller().marshalString(element); });
			test.ok(/Value \[Single\] is invalid for the enum type \[w\.Underline\]/.test(e.message), 'unset: today\'s error, ' + e.message);
			var xml = context.createMarshaller({ onUnprintableValue: keep }).marshalString(element);
			test.ok(/<w:u w:val="Single" w:size="2"\/>/.test(xml), xml);
			test.done();
		},
		"UndefinedOrNullOmitsTheAttribute": function (test) {
			[undefined, null].forEach(function (returned) {
				var xml = context.createMarshaller({ onUnprintableValue: function () { return returned; } })
					.marshalString({ name: { namespaceURI: W, localPart: 'u' }, value: { TYPE_NAME: 'w.U', val: 'Single', size: 2 } });
				test.ok(/<w:u [^>]*w:size="2"\/>/.test(xml) && !/w:val/.test(xml), String(returned) + ': ' + xml);
			});
			test.done();
		},
		"WhatIsWrittenMustBeAString": function (test) {
			var e = errorOf(function () {
				context.createMarshaller({ onUnprintableValue: function () { return 42; } })
					.marshalString({ name: { namespaceURI: W, localPart: 'u' }, value: { TYPE_NAME: 'w.U', val: 'Single' } });
			});
			test.ok(/Argument \[42\] must be a string/.test(e.message), e.message);
			test.done();
		},
		"TheArguments": function (test) {
			var calls = [];
			context.createMarshaller({
				onUnprintableValue: function (value, propertyInfo, classInfo, error) {
					calls.push([value, propertyInfo.name, propertyInfo.typeInfo.name, classInfo.name, error instanceof Error]);
					return String(value);
				}
			}).marshalString({ name: { namespaceURI: W, localPart: 'rPr' }, value: { TYPE_NAME: 'w.RPr',
				b: { TYPE_NAME: 'w.OnOff', val: 'yes' },
				u: { TYPE_NAME: 'w.BigU', val: 'Single', weight: 3 } } });
			test.deepEqual([
				['yes', 'val', 'Boolean', 'w.OnOff', true],
				['Single', 'val', 'w.Underline', 'w.U', true]
			], calls, 'a non-boolean in a boolean; a property declared on the base type reports the declaring class info');
			test.done();
		},
		"NotCalledForPrintableValues": function (test) {
			var calls = 0;
			var xml = context.createMarshaller({ onUnprintableValue: function () { calls++; } })
				.marshalString({ name: { namespaceURI: W, localPart: 'u' }, value: { TYPE_NAME: 'w.U', val: 'double', size: 2 } });
			test.equal(0, calls);
			test.ok(/w:val="double"/.test(xml), xml);
			test.done();
		}
	},
	"Together": {
		"OneOptionsObjectForBothFactories": function (test) {
			var unmarshalCalls = 0, marshalCalls = 0;
			var options = {
				onInvalidValue: function (text) { unmarshalCalls++; return text; },
				onUnprintableValue: function (value) { marshalCalls++; return value; }
			};
			var element = context.createUnmarshaller(options).unmarshalString(rPr('<w:u w:val="Single"/>'));
			test.deepEqual([1, 0], [unmarshalCalls, marshalCalls], 'unmarshal calls only its own callback');
			context.createMarshaller(options).marshalString(element);
			test.deepEqual([1, 1], [unmarshalCalls, marshalCalls], 'marshal calls only its own callback');
			test.done();
		},
		"WordsReadingSurvivesASave": function (test) {
			var source = rPr('<w:b w:val="FALSE"/><w:u w:val="Single" w:size="2"/>');
			var element = context.createUnmarshaller({ onInvalidValue: word }).unmarshalString(source);
			var xml = context.createMarshaller({ onUnprintableValue: keep }).marshalString(element);
			test.ok(/<w:b w:val="true"\/>/.test(xml), 'on, written as true: ' + xml);
			test.ok(/<w:u w:val="Single" w:size="2"\/>/.test(xml), 'the kept spelling written back: ' + xml);
			var reread = context.createUnmarshaller({ onInvalidValue: word }).unmarshalString(xml).value;
			test.deepEqual([true, 'Single', 2], [reread.b.val, reread.u.val, reread.u.size]);
			test.done();
		}
	}
};
