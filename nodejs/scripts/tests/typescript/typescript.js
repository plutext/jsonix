// Runtime side of the TypeScript contract: unmarshalling po.xml with the compiler-generated
// mapping must produce exactly the shape PurchaseOrder.d.ts declares (TYPE_NAME discriminants,
// {name, value} element wrappers, numbers for numeric types, Calendar objects with NaN for
// unset fields), and the object must survive a marshal/unmarshal round trip.
var fs = require('fs');
var path = require('path');
var Jsonix = require('../../jsonix').Jsonix;
var PO = require('./PurchaseOrder.std').PO;

var xml = fs.readFileSync(path.join(__dirname, 'po.xml')).toString();

module.exports = {
	"Shape": function (test) {
		var context = new Jsonix.Context([PO]);
		var element = context.createUnmarshaller().unmarshalString(xml);

		// TypedNamedValue<PurchaseOrderType>
		test.equal('purchaseOrder', element.name.localPart);
		test.equal('', element.name.namespaceURI);
		test.equal('string', typeof element.name.key);
		var po = element.value;
		test.equal('PO.PurchaseOrderType', po.TYPE_NAME);

		// USAddress
		test.equal('PO.USAddress', po.shipTo.TYPE_NAME);
		test.equal('Alice Smith', po.shipTo.name);
		test.equal('number', typeof po.shipTo.zip);
		test.equal(90952, po.shipTo.zip);
		test.equal('US', po.shipTo.country);

		// Items / Items.Item (scoped type name)
		test.equal('PO.Items', po.items.TYPE_NAME);
		test.ok(Array.isArray(po.items.item));
		test.equal(2, po.items.item.length);
		test.equal('PO.Items.Item', po.items.item[0].TYPE_NAME);
		test.equal('number', typeof po.items.item[0].quantity);
		test.equal('number', typeof po.items.item[0].usPrice);
		test.equal('872-AA', po.items.item[0].partNum);

		// XmlCalendar: set fields are numbers, unset fields are NaN, never a Date
		test.equal(1999, po.orderDate.year);
		test.equal(10, po.orderDate.month);
		test.equal(20, po.orderDate.day);
		test.ok(Number.isNaN(po.orderDate.hour));
		test.ok(!(po.orderDate instanceof Date));
		var shipped = po.items.item.filter(function (item) { return item.shipDate !== undefined; })[0];
		test.equal(1999, shipped.shipDate.year);
		test.equal(5, shipped.shipDate.month);

		// Optional properties are absent, not null
		test.equal('undefined', typeof po.items.item[0].shipDate);
		test.done();
	},
	"Roundtrip": function (test) {
		var context = new Jsonix.Context([PO]);
		var one = context.createUnmarshaller().unmarshalString(xml);
		var text = context.createMarshaller().marshalString(one);
		var two = context.createUnmarshaller().unmarshalString(text);
		test.ok(Jsonix.Util.Type.isEqual(one, two, function (message) { console.log(message); }));
		test.done();
	},
	"ParentPointers": {
		"Off": function (test) {
			var po = new Jsonix.Context([PO]).createUnmarshaller().unmarshalString(xml).value;
			test.ok(!Object.prototype.hasOwnProperty.call(po.shipTo, 'PARENT'));
			test.ok(!Object.prototype.hasOwnProperty.call(po.items.item[0], 'PARENT'));
			test.done();
		},
		"Standard": function (test) {
			var context = new Jsonix.Context([PO], { parentPointers: true });
			var element = context.createUnmarshaller().unmarshalString(xml);
			var po = element.value;
			// Typed objects point at the nearest enclosing typed object; the root has none.
			test.strictEqual(po, po.shipTo.PARENT);
			test.strictEqual(po, po.billTo.PARENT);
			test.strictEqual(po, po.items.PARENT);
			test.strictEqual(po.items, po.items.item[0].PARENT);
			test.strictEqual(po.items, po.items.item[1].PARENT);
			test.ok(!Object.prototype.hasOwnProperty.call(po, 'PARENT'));
			// Wrappers, arrays and calendars never get one.
			test.ok(!Object.prototype.hasOwnProperty.call(element, 'PARENT'));
			test.ok(!Object.prototype.hasOwnProperty.call(po.items.item, 'PARENT'));
			test.ok(!Object.prototype.hasOwnProperty.call(po.orderDate, 'PARENT'));
			// Invisible to enumeration, JSON, isEqual and the marshaller.
			var plain = new Jsonix.Context([PO]).createUnmarshaller().unmarshalString(xml).value;
			test.deepEqual(Object.keys(plain.shipTo), Object.keys(po.shipTo));
			test.equal(JSON.stringify(plain), JSON.stringify(po));
			test.ok(Jsonix.Util.Type.isEqual(plain, po));
			test.equal(new Jsonix.Context([PO]).createMarshaller().marshalString({ name: element.name, value: plain }), context.createMarshaller().marshalString(element));
			// PARENT is present, non-enumerable, writable.
			var descriptor = Object.getOwnPropertyDescriptor(po.shipTo, 'PARENT');
			test.equal(false, descriptor.enumerable);
			test.equal(true, descriptor.writable);
			test.done();
		},
		"Simplified": function (test) {
			// The simplified style represents element refs as { localName: value }; the pointer must
			// still land on the typed object, never on the intermediate object.
			var context = new Jsonix.Context([PO], { parentPointers: true, mappingStyle: 'simplified' });
			var root = context.createUnmarshaller().unmarshalString(xml);
			var po = root.purchaseOrder;
			test.equal('PO.PurchaseOrderType', po.TYPE_NAME);
			test.ok(!Object.prototype.hasOwnProperty.call(root, 'PARENT'));
			test.ok(!Object.prototype.hasOwnProperty.call(po, 'PARENT'));
			test.strictEqual(po, po.shipTo.PARENT);
			test.strictEqual(po.items, po.items.item[0].PARENT);
			test.done();
		}
	},
	"DeepCopy": {
		"Tree": function (test) {
			var context = new Jsonix.Context([PO], { parentPointers: true });
			var po = context.createUnmarshaller().unmarshalString(xml).value;
			var copy = Jsonix.Util.deepCopy(po);
			test.ok(copy !== po);
			test.ok(Jsonix.Util.Type.isEqual(po, copy, function (message) { console.log(message); }));
			test.equal('PO.PurchaseOrderType', copy.TYPE_NAME);
			// Children re-linked to the copied parents; the copy itself has no parent.
			test.strictEqual(copy, copy.shipTo.PARENT);
			test.strictEqual(copy.items, copy.items.item[0].PARENT);
			test.ok(!Object.prototype.hasOwnProperty.call(copy, 'PARENT'));
			test.ok(copy.shipTo !== po.shipTo);
			test.ok(copy.items.item !== po.items.item);
			// Calendars are distinct objects with equal fields; the original is untouched.
			test.ok(copy.orderDate !== po.orderDate);
			test.ok(copy.orderDate instanceof Jsonix.XML.Calendar);
			test.equal(po.orderDate.year, copy.orderDate.year);
			test.ok(Number.isNaN(copy.orderDate.hour));
			test.strictEqual(po, po.shipTo.PARENT);
			// The copy marshals to the same XML.
			var marshaller = context.createMarshaller();
			var name = { localPart: 'purchaseOrder' };
			test.equal(marshaller.marshalString({ name: name, value: po }), marshaller.marshalString({ name: name, value: copy }));
			test.done();
		},
		"WithParent": function (test) {
			var po = new Jsonix.Context([PO], { parentPointers: true }).createUnmarshaller().unmarshalString(xml).value;
			var address = Jsonix.Util.deepCopy(po.shipTo, po);
			test.ok(address !== po.shipTo);
			test.strictEqual(po, address.PARENT);
			test.equal('Alice Smith', address.name);
			// Subtree copy without a parent: unset, even though the original had one.
			test.ok(!Object.prototype.hasOwnProperty.call(Jsonix.Util.deepCopy(po.shipTo), 'PARENT'));
			test.done();
		},
		"Wrapper": function (test) {
			// A { name, value } element wrapper: the QName is cloned, the value copied, and the
			// value's parent topology (none inside a wrapper) is preserved.
			var element = new Jsonix.Context([PO], { parentPointers: true }).createUnmarshaller().unmarshalString(xml);
			var copy = Jsonix.Util.deepCopy(element);
			test.ok(copy.name !== element.name);
			test.ok(copy.name instanceof Jsonix.XML.QName);
			test.equal(element.name.key, copy.name.key);
			test.ok(!Object.prototype.hasOwnProperty.call(copy.value, 'PARENT'));
			test.strictEqual(copy.value, copy.value.shipTo.PARENT);
			test.done();
		},
		"NoShapeHeuristics": function (test) {
			// A typed object whose properties happen to be called name and value is a typed object.
			var original = { TYPE_NAME: 'X.NameValue', name: 'n', value: { TYPE_NAME: 'X.V', data: 'd' } };
			Jsonix.Util.setParent(original.value, original);
			var copy = Jsonix.Util.deepCopy(original);
			test.equal('X.NameValue', copy.TYPE_NAME);
			test.equal('n', copy.name);
			test.equal('X.V', copy.value.TYPE_NAME);
			test.strictEqual(copy, copy.value.PARENT);
			test.done();
		},
		"HandBuiltAndShared": function (test) {
			var shared = { TYPE_NAME: 'X.S', v: 1 };
			var original = { TYPE_NAME: 'X.T', a: shared, b: shared, list: [shared, 'text', 2, true, null], calendar: new Jsonix.XML.Calendar({ year: 2026, month: 9, day: 7 }), duration: { sign: -1, days: 2 } };
			var copy = Jsonix.Util.deepCopy(original);
			// No pointers in, no pointers out.
			test.ok(!Object.prototype.hasOwnProperty.call(copy.a, 'PARENT'));
			// Shared references stay shared, and are copied once.
			test.ok(copy.a !== shared);
			test.strictEqual(copy.a, copy.b);
			test.strictEqual(copy.a, copy.list[0]);
			test.deepEqual(['text', 2, true, null], copy.list.slice(1));
			test.ok(copy.calendar !== original.calendar);
			test.equal(2026, copy.calendar.year);
			test.deepEqual(original.duration, copy.duration);
			test.ok(copy.duration !== original.duration);
			// Primitives pass through.
			test.equal('s', Jsonix.Util.deepCopy('s'));
			test.equal(null, Jsonix.Util.deepCopy(null));
			test.done();
		},
		"Dom": function (test) {
			var doc = Jsonix.DOM.parse('<a b="c"><d/></a>');
			var copy = Jsonix.Util.deepCopy({ node: doc.documentElement });
			test.ok(copy.node !== doc.documentElement);
			test.equal('a', copy.node.nodeName);
			test.equal('c', copy.node.getAttribute('b'));
			test.done();
		}
	},
	"CalendarClone": function (test) {
		var calendar = new Jsonix.XML.Calendar({ year: 1999, month: 5, day: 21, hour: 10, minute: 30, second: 5, fractionalSecond: 0.25, timezone: 60 });
		var copy = calendar.clone();
		test.ok(copy !== calendar);
		test.ok(copy instanceof Jsonix.XML.Calendar);
		test.ok(Jsonix.Util.Type.isEqual(calendar, copy));
		var dateOnly = new Jsonix.XML.Calendar({ year: 1999, month: 5, day: 21 }).clone();
		test.equal(21, dateOnly.day);
		test.ok(Number.isNaN(dateOnly.hour));
		test.ok(Number.isNaN(dateOnly.timezone));
		test.done();
	},
	"MarshalLiteral": function (test) {
		// The object literal from usage.ts, written without TYPE_NAME as a TypeScript user would.
		var context = new Jsonix.Context([PO]);
		var address = { name: 'Alice Smith', street: '123 Maple Street', city: 'Mill Valley', state: 'CA', zip: 90952 };
		var text = context.createMarshaller().marshalString({
			name: { namespaceURI: '', localPart: 'purchaseOrder' },
			value: { shipTo: address, billTo: address, items: { item: [] }, orderDate: { year: 1999, month: 10, day: 20 } }
		});
		test.ok(text.indexOf('<purchaseOrder') >= 0);
		test.ok(text.indexOf('orderDate="1999-10-20"') >= 0);
		var back = context.createUnmarshaller().unmarshalString(text);
		test.equal('PO.USAddress', back.value.shipTo.TYPE_NAME);
		test.equal(90952, back.value.billTo.zip);
		test.done();
	}
};
