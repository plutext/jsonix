// ES-module consumer check: a named import of the runtime (via the package's `exports` map,
// self-referenced by name) together with the compiler's ES-module mapping output.
// Run with `npm run test:esm`.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Jsonix } from '@docx4j/jsonix';
import { PO } from './PurchaseOrder.mjs';

const xml = readFileSync(new URL('./po.xml', import.meta.url), 'utf8');
const context = new Jsonix.Context([PO]);
const element = context.createUnmarshaller().unmarshalString(xml);

assert.equal(element.name.localPart, 'purchaseOrder');
assert.equal(element.value.TYPE_NAME, 'PO.PurchaseOrderType');
assert.equal(element.value.shipTo.name, 'Alice Smith');
assert.equal(typeof element.value.shipTo.zip, 'number');
assert.equal(element.value.orderDate.year, 1999);

// Parent pointers and deep copy (jsonix-CR-002), the same checks as the compiler's smoke test.
const parented = new Jsonix.Context([PO], { parentPointers: true }).createUnmarshaller().unmarshalString(xml).value;
assert.equal(parented.shipTo.PARENT, parented);
assert.equal(parented.items.item[0].PARENT, parented.items);
assert.equal(Object.prototype.hasOwnProperty.call(parented, 'PARENT'), false);
assert.deepEqual(Object.keys(parented.shipTo), Object.keys(element.value.shipTo));
const copy = Jsonix.Util.deepCopy(parented);
assert.notEqual(copy, parented);
assert.equal(copy.shipTo.PARENT, copy);
assert.equal(copy.items.item[0].PARENT, copy.items);
assert.equal(Object.prototype.hasOwnProperty.call(copy, 'PARENT'), false);
assert.ok(Jsonix.Util.Type.isEqual(copy, parented));

const text = context.createMarshaller().marshalString(element);
assert.ok(text.startsWith('<?xml') || text.startsWith('<purchaseOrder'));
console.log('esm-smoke: import { Jsonix } from "@docx4j/jsonix" and the .mjs mapping work together; parent pointers and deepCopy behave as declared');
