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
