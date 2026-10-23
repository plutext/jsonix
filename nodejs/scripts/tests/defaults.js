// jsonix-CR-009: schema defaults on read. AttributePropertyInfo keeps the mapping's defaultValue (or dv), and
// the context's getDefaultValue / valueOrDefault return it for an absent attribute; unmarshal and marshal never
// apply it, so the data and the output are what they were without defaults in the mapping.
var Jsonix = require('../jsonix').Jsonix;

var NS = 'urn:test';
var mapping = {
	name: 'test',
	defaultElementNamespaceURI: NS,
	typeInfos: [
		{ localName: 'OnOff', propertyInfos: [{ name: 'val', type: 'attribute', typeInfo: 'Boolean', defaultValue: true }] },
		{ localName: 'Spacing', propertyInfos: [
			{ name: 'before', type: 'attribute', typeInfo: 'Integer', dv: 0 },
			{ name: 'lineRule', type: 'attribute', defaultValue: 'auto' },
			{ name: 'locked', type: 'attribute', typeInfo: 'Boolean', defaultValue: false },
			{ name: 'label', type: 'attribute', defaultValue: '' },
			{ name: 'both', type: 'attribute', defaultValue: 'long', dv: 'short' },
			{ name: 'after', type: 'attribute', typeInfo: 'Integer' },
			{ name: 'scale', type: 'element', typeInfo: 'Double', defaultValue: 1 }
		] },
		{ localName: 'BigSpacing', baseTypeInfo: '.Spacing', propertyInfos: [{ name: 'weight', type: 'attribute', typeInfo: 'Integer', defaultValue: 400 }] },
		{ localName: 'Doc', propertyInfos: [
			{ name: 'b', type: 'element', typeInfo: '.OnOff', collection: true },
			{ name: 'spacing', type: 'element', typeInfo: '.Spacing', collection: true }
		] }
	],
	elementInfos: [
		{ elementName: 'doc', typeInfo: '.Doc' },
		{ elementName: 'b', typeInfo: '.OnOff' },
		{ elementName: 'spacing', typeInfo: '.Spacing' }
	]
};
var context = new Jsonix.Context([mapping]);

// The same mapping with every default removed, for the fidelity tests.
var withoutDefaults = JSON.parse(JSON.stringify(mapping));
withoutDefaults.typeInfos.forEach(function (typeInfo) {
	typeInfo.propertyInfos.forEach(function (propertyInfo) {
		delete propertyInfo.defaultValue;
		delete propertyInfo.dv;
	});
});
var plainContext = new Jsonix.Context([withoutDefaults]);

var DOC = '<t:doc xmlns:t="urn:test" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
	'<t:b/><t:b val="true"/><t:b val="false"/>' +
	'<t:spacing/><t:spacing before="0" lineRule="exact"/><t:spacing before="12"/>' +
	'<t:spacing xsi:type="t:BigSpacing"/>' +
	'</t:doc>';

module.exports = {
	"GetDefaultValue": {
		"FromDefaultValueAndDv": function (test) {
			test.strictEqual(true, context.getDefaultValue('test.OnOff', 'val'));
			test.strictEqual(0, context.getDefaultValue('test.Spacing', 'before'), 'from dv, and a falsy default is kept');
			test.strictEqual('auto', context.getDefaultValue('test.Spacing', 'lineRule'));
			test.strictEqual(false, context.getDefaultValue('test.Spacing', 'locked'));
			test.strictEqual('', context.getDefaultValue('test.Spacing', 'label'));
			test.strictEqual('long', context.getDefaultValue('test.Spacing', 'both'), 'defaultValue before dv');
			test.done();
		},
		"UndefinedWithoutAnAttributeDefault": function (test) {
			test.strictEqual(undefined, context.getDefaultValue('test.Spacing', 'after'), 'an attribute without a default');
			test.strictEqual(undefined, context.getDefaultValue('test.Spacing', 'scale'), 'an element default is not applied');
			test.strictEqual(undefined, context.getDefaultValue('test.Spacing', 'nothing'), 'an undeclared property');
			test.strictEqual(undefined, context.getDefaultValue('test.Spacing', 'toString'), 'nor an Object.prototype member');
			test.strictEqual(undefined, plainContext.getDefaultValue('test.OnOff', 'val'), 'a mapping without defaults');
			test.done();
		},
		"FromTheBaseType": function (test) {
			test.strictEqual(400, context.getDefaultValue('test.BigSpacing', 'weight'));
			test.strictEqual(0, context.getDefaultValue('test.BigSpacing', 'before'), 'declared on the base type');
			test.strictEqual(undefined, context.getDefaultValue('test.Spacing', 'weight'), 'not from a derived type');
			test.done();
		},
		"ThrowsForATypeThatIsNotAClassInfo": function (test) {
			test.throws(function () { context.getDefaultValue('test.Nope', 'val'); }, /Type info \[test\.Nope\] is not a class info/);
			test.throws(function () { context.getDefaultValue('String', 'val'); }, /is not a class info/, 'a simple type');
			test.throws(function () { context.getDefaultValue('toString', 'val'); }, /is not a class info/);
			test.throws(function () { context.getDefaultValue('test.OnOff'); }, /must be a string/);
			test.done();
		}
	},
	"ValueOrDefault": {
		"AbsentGivesTheDefaultPresentGivesTheValue": function (test) {
			var doc = context.createUnmarshaller().unmarshalString(DOC).value;
			test.strictEqual(true, context.valueOrDefault(doc.b[0], 'val'), '<b/>');
			test.strictEqual(true, context.valueOrDefault(doc.b[1], 'val'), '<b val="true"/>');
			test.strictEqual(false, context.valueOrDefault(doc.b[2], 'val'), '<b val="false"/>');
			test.strictEqual(0, context.valueOrDefault(doc.spacing[0], 'before'));
			test.strictEqual('auto', context.valueOrDefault(doc.spacing[0], 'lineRule'));
			test.strictEqual(0, context.valueOrDefault(doc.spacing[1], 'before'), 'explicit and equal to the default');
			test.strictEqual('exact', context.valueOrDefault(doc.spacing[1], 'lineRule'));
			test.strictEqual(12, context.valueOrDefault(doc.spacing[2], 'before'));
			test.strictEqual(undefined, context.valueOrDefault(doc.spacing[0], 'after'), 'no default: still absent');
			test.ok(!doc.b[0].hasOwnProperty('val'), 'the object is unchanged');
			test.done();
		},
		"NullAndUndefinedGiveTheDefault": function (test) {
			test.strictEqual(true, context.valueOrDefault({ TYPE_NAME: 'test.OnOff', val: null }, 'val'));
			test.strictEqual(true, context.valueOrDefault({ TYPE_NAME: 'test.OnOff', val: undefined }, 'val'));
			test.done();
		},
		"XsiTypeReadsAsTheDerivedType": function (test) {
			var big = context.createUnmarshaller().unmarshalString(DOC).value.spacing[3];
			test.equal('test.BigSpacing', big.TYPE_NAME);
			test.strictEqual(400, context.valueOrDefault(big, 'weight'));
			test.strictEqual(0, context.valueOrDefault(big, 'before'));
			test.done();
		},
		"AnExplicitTypeName": function (test) {
			test.strictEqual(true, context.valueOrDefault({}, 'val', 'test.OnOff'), 'an object without TYPE_NAME');
			test.strictEqual(undefined, context.valueOrDefault({ TYPE_NAME: 'test.BigSpacing' }, 'weight', 'test.Spacing'),
				'the given type name wins over TYPE_NAME');
			test.done();
		},
		"ThrowsWithoutAKnownTypePresentOrNot": function (test) {
			test.throws(function () { context.valueOrDefault({}, 'val'); }, /no TYPE_NAME and no type name was given/);
			test.throws(function () { context.valueOrDefault({ val: true }, 'val'); }, /no TYPE_NAME/, 'even with the value present');
			test.throws(function () { context.valueOrDefault({ TYPE_NAME: 'test.Nope', val: true }, 'val'); }, /is not a class info/);
			test.throws(function () { context.valueOrDefault(null, 'val'); }, /does not exist/);
			test.done();
		},
		"OnADerivedContext": function (test) {
			var derived = context.deriveContext({ parentPointers: true });
			test.notStrictEqual(context, derived);
			test.strictEqual(true, derived.valueOrDefault({ TYPE_NAME: 'test.OnOff' }, 'val'));
			test.strictEqual(400, derived.getDefaultValue('test.BigSpacing', 'weight'));
			test.done();
		}
	},
	"Fidelity": {
		"DataAndOutputAsWithoutDefaults": function (test) {
			var withDefaults = context.createUnmarshaller().unmarshalString(DOC);
			var without = plainContext.createUnmarshaller().unmarshalString(DOC);
			test.equal(JSON.stringify(without), JSON.stringify(withDefaults), 'the same data');
			var xml = context.createMarshaller().marshalString(withDefaults);
			test.equal(plainContext.createMarshaller().marshalString(without), xml, 'the same output');
			test.ok(/<t:b\/><t:b val="true"\/><t:b val="false"\/>/.test(xml), 'absent stays absent, explicit stays explicit: ' + xml);
			test.ok(/<t:spacing\/>/.test(xml), 'no default written: ' + xml);
			test.done();
		}
	}
};
