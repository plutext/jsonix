// ES-module consumer check: a named import of the runtime (via the package's `exports` map,
// self-referenced by name) together with the compiler's ES-module mapping output.
// Run with `npm run test:esm`.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Jsonix } from '@mitre/jsonix';
import { PO } from './PurchaseOrder.mjs';

const xml = readFileSync(new URL('./po.xml', import.meta.url), 'utf8');
const context = new Jsonix.Context([PO]);
const element = context.createUnmarshaller().unmarshalString(xml);

assert.equal(element.name.localPart, 'purchaseOrder');
assert.equal(element.value.TYPE_NAME, 'PO.PurchaseOrderType');
assert.equal(element.value.shipTo.name, 'Alice Smith');
assert.equal(typeof element.value.shipTo.zip, 'number');
assert.equal(element.value.orderDate.year, 1999);

const text = context.createMarshaller().marshalString(element);
assert.ok(text.startsWith('<?xml') || text.startsWith('<purchaseOrder'));
console.log('esm-smoke: import { Jsonix } from "@mitre/jsonix" and the .mjs mapping work together');
