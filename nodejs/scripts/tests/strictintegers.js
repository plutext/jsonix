// jsonix-CR-012: with the per-call unmarshaller option strictIntegers, an attribute of the thirteen integer types reads
// only an optional sign and the digits 0 to 9; every other text Number() reads goes to onInvalidValue as written. Off by
// default; element content, simple content, list items, enumerations, other numeric types and printing are unchanged.
var Jsonix = require('../jsonix').Jsonix;

var INTEGER_TYPES = ['Integer', 'NonPositiveInteger', 'NegativeInteger', 'Long', 'Int', 'Short', 'Byte',
	'NonNegativeInteger', 'UnsignedLong', 'UnsignedInt', 'UnsignedShort', 'UnsignedByte', 'PositiveInteger'];
var attributeName = function (typeName) {
	return typeName.charAt(0).toLowerCase() + typeName.substring(1);
};
var properties = INTEGER_TYPES.map(function (typeName) {
	return { name: attributeName(typeName), type: 'attribute', typeInfo: typeName };
});
properties.push(
	{ name: 'decimal', type: 'attribute', typeInfo: 'Decimal' },
	{ name: 'double', type: 'attribute', typeInfo: 'Double' },
	{ name: 'list', type: 'attribute', typeInfo: { type: 'list', baseTypeInfo: 'Int' } },
	{ name: 'code', type: 'attribute', typeInfo: '.Code' },
	{ name: 'e', type: 'element', typeInfo: 'Int' },
	{ name: 'v', type: 'element', typeInfo: '.Measure' });
var mapping = {
	name: 'S',
	typeInfos: [
		{ type: 'enumInfo', localName: 'Code', baseTypeInfo: 'Integer', values: ['1', '2'] },
		{ localName: 'Measure', propertyInfos: [
			{ name: 'value', type: 'value', typeInfo: 'Int' },
			{ name: 'unit', type: 'attribute', typeInfo: 'String' }
		] },
		{ localName: 'R', propertyInfos: properties }
	],
	elementInfos: [{ elementName: 'r', typeInfo: '.R' }]
};
var context = new Jsonix.Context([mapping]);

// Texts as written in the document: tab and newline as character references, since XML normalises literal ones in an
// attribute to spaces.
var LENIENT = [
	{ xml: '', text: '', today: 0 },
	{ xml: ' ', text: ' ', today: 0 },
	{ xml: ' 240 ', text: ' 240 ', today: 240 },
	{ xml: '&#9;240', text: '\t240', today: 240 },
	{ xml: '240&#10;', text: '240\n', today: 240 },
	{ xml: '240.', text: '240.', today: 240 },
	{ xml: '10206.0', text: '10206.0', today: 10206 },
	{ xml: '0x10', text: '0x10', today: 16 },
	{ xml: '0b1', text: '0b1', today: 1 },
	{ xml: '0o7', text: '0o7', today: 7 },
	{ xml: '1e3', text: '1e3', today: 1000 },
	{ xml: '1.5e2', text: '1.5e2', today: 150 }
];
var STRICT = ['0', '1', '+1', '-1', '007', '-0', '127', '9007199254740991'];
var REFUSED_TODAY = ['1.5', '.5', 'abc', '240,5', 'Infinity'];

var read = function (attributes, options) {
	return context.createUnmarshaller(options).unmarshalString('<r ' + attributes + '/>').value;
};
var strictMessage = function (text) {
	return 'Argument [' + text + '] must be an integer literal: an optional + or - and the digits 0 to 9, with nothing around them.';
};
var todaysError = function (attribute, xml) {
	try {
		read(attribute + '="' + xml + '"');
	} catch (e) {
		return e;
	}
	throw new Error('Expected [' + xml + '] to be refused without the option.');
};

module.exports = {
	"OffByDefault": function (test) {
		var calls = 0;
		var record = function () {
			calls++;
		};
		INTEGER_TYPES.forEach(function (typeName) {
			var name = attributeName(typeName);
			LENIENT.forEach(function (form) {
				test.strictEqual(read(name + '="' + form.xml + '"')[name], form.today, typeName + ' [' + form.xml + ']');
				test.strictEqual(read(name + '="' + form.xml + '"', { onInvalidValue: record })[name], form.today);
				test.strictEqual(read(name + '="' + form.xml + '"', { strictIntegers: false, onInvalidValue: record })[name], form.today);
			});
		});
		test.equal(calls, 0);
		test.ok(!context.strictIntegers);
		test.done();
	},
	"StrictFormsReadAsToday": function (test) {
		INTEGER_TYPES.forEach(function (typeName) {
			var name = attributeName(typeName);
			STRICT.forEach(function (text) {
				var value = read(name + '="' + text + '"', {
					strictIntegers: true,
					onInvalidValue: function () {
						test.ok(false, typeName + ' [' + text + '] reached onInvalidValue');
					}
				})[name];
				// Ranges are not checked, on or off.
				test.ok(Object.is(value, Number(text)), typeName + ' [' + text + ']');
			});
		});
		test.done();
	},
	"LenientFormsReachTheCallbackAsWritten": function (test) {
		INTEGER_TYPES.forEach(function (typeName) {
			var name = attributeName(typeName);
			LENIENT.forEach(function (form) {
				var calls = [];
				var value = read('xmlns:x="urn:x" ' + name + '="' + form.xml + '"', {
					strictIntegers: true,
					onInvalidValue: function (text, propertyInfo, classInfo, node, error) {
						calls.push({ text: text, propertyInfo: propertyInfo, classInfo: classInfo, node: node, error: error });
						return 'kept';
					}
				});
				test.equal(calls.length, 1, typeName + ' [' + form.xml + ']');
				test.strictEqual(calls[0].text, form.text);
				test.strictEqual(calls[0].propertyInfo.typeInfo, Jsonix.Schema.XSD[typeName].INSTANCE);
				test.equal(calls[0].classInfo.name, 'S.R');
				test.equal(calls[0].node.nodeName, 'r');
				test.equal(calls[0].error.message, strictMessage(form.text));
				test.strictEqual(value[name], 'kept');
			});
		});
		test.done();
	},
	"FormsRefusedTodayKeepTodaysError": function (test) {
		INTEGER_TYPES.forEach(function (typeName) {
			var name = attributeName(typeName);
			REFUSED_TODAY.forEach(function (text) {
				var located = todaysError(name, text);
				var calls = [];
				var value = read(name + '="' + text + '"', {
					strictIntegers: true,
					onInvalidValue: function (refusedText, propertyInfo, classInfo, node, error) {
						calls.push(error);
						return undefined;
					}
				});
				test.equal(calls.length, 1, typeName + ' [' + text + ']');
				test.ok(located.message.indexOf(calls[0].message) > 0, located.message + ' / ' + calls[0].message);
				test.ok(!value.hasOwnProperty(name));
			});
		});
		test.done();
	},
	"WithoutCallbackTheRefusalIsLocated": function (test) {
		test.throws(function () {
			read('int="240."', { strictIntegers: true });
		}, function (e) {
			return e.message === 'r/@int (line 1): ' + strictMessage('240.');
		});
		test.throws(function () {
			read('unsignedLong=""', { strictIntegers: true });
		}, function (e) {
			return e.message === 'r/@unsignedLong (line 1): ' + strictMessage('');
		});
		// Rethrowing the error gives the same located message.
		test.throws(function () {
			read('long="0x10"', {
				strictIntegers: true,
				onInvalidValue: function (text, propertyInfo, classInfo, node, error) {
					throw error;
				}
			});
		}, function (e) {
			return e.message === 'r/@long (line 1): ' + strictMessage('0x10');
		});
		test.done();
	},
	"OnlyIntegerAttributesAreAffected": function (test) {
		var refused = [];
		var options = {
			strictIntegers: true,
			onInvalidValue: function (text, propertyInfo, classInfo, node, error) {
				refused.push(text);
				throw error;
			}
		};
		var xml = '<r decimal=" 1.5 " double="1e3" list=" 1  2.0 0x3 " code="2"><e> 240 </e><v unit="pt">&#9;10206.0</v></r>';
		var lenient = context.createUnmarshaller().unmarshalString(xml).value;
		var strict = context.createUnmarshaller(options).unmarshalString(xml).value;
		test.deepEqual(strict, lenient);
		test.strictEqual(strict.decimal, 1.5);
		test.strictEqual(strict.double, 1000);
		test.deepEqual(strict.list, [1, 2, 3]);
		test.strictEqual(strict.code, 2);
		test.strictEqual(strict.e, 240);
		test.strictEqual(strict.v.value, 10206);
		test.deepEqual(refused, []);
		// An integer-based enumeration was exact already: the same refusal, on or off.
		var enumMessage = todaysError('code', ' 1').message;
		test.throws(function () {
			read('code=" 1"', options);
		}, function (e) {
			return e.message === enumMessage;
		});
		test.done();
	},
	"MarshalIsUnchanged": function (test) {
		var value = { name: new Jsonix.XML.QName('r'), value: { TYPE_NAME: 'S.R', int: '0x10', long: 240, unsignedByte: '7', e: 5, list: [1, 2] } };
		var plain = context.createMarshaller().marshalString(value);
		var strict = context.createMarshaller({ strictIntegers: true }).marshalString(value);
		test.equal(strict, plain);
		test.ok(plain.indexOf('int="16"') > 0, plain);
		test.done();
	},
	"PerCall": function (test) {
		var xml = 'int="240."';
		var lenient = context.createUnmarshaller();
		var strict = context.createUnmarshaller({ strictIntegers: true, onInvalidValue: function () { return -1; } });
		test.strictEqual(lenient.unmarshalString('<r ' + xml + '/>').value.int, 240);
		test.strictEqual(strict.unmarshalString('<r ' + xml + '/>').value.int, -1);
		test.strictEqual(lenient.unmarshalString('<r ' + xml + '/>').value.int, 240);
		test.ok(!context.hasOwnProperty('strictIntegers'));
		test.strictEqual(context.strictIntegers, undefined);
		// The Context constructor does not read it.
		var constructed = new Jsonix.Context([mapping], { strictIntegers: true });
		test.strictEqual(constructed.createUnmarshaller().unmarshalString('<r ' + xml + '/>').value.int, 240);
		test.done();
	},
	"TodaysReadingFromTheCallback": function (test) {
		var asToday = {
			strictIntegers: true,
			onInvalidValue: function (text, propertyInfo, classInfo, node, error) {
				return propertyInfo.typeInfo.parse(text);
			}
		};
		INTEGER_TYPES.forEach(function (typeName) {
			var name = attributeName(typeName);
			LENIENT.forEach(function (form) {
				test.strictEqual(read(name + '="' + form.xml + '"', asToday)[name], form.today, typeName + ' [' + form.xml + ']');
			});
			REFUSED_TODAY.forEach(function (text) {
				var located = todaysError(name, text);
				test.throws(function () {
					read(name + '="' + text + '"', asToday);
				}, function (e) {
					return e.message === located.message;
				});
			});
		});
		test.done();
	}
};
