// The same checks as usage.ts, from an ES module under Node's own resolution rules
// (moduleResolution node16): relative imports carry extensions, the .mjs mapping resolves to
// its .d.mts, and the runtime resolves through the package's "exports" map.
import { Jsonix } from '@docx4j/jsonix';
import { PO } from './PurchaseOrder.mjs';
import type { PurchaseOrderElement, RootElement, USAddress } from './PurchaseOrder.mjs';

declare const xml: string;

const context = new Jsonix.Context([PO]);
const unmarshaller = context.createUnmarshaller();
const marshaller = context.createMarshaller();

const po = unmarshaller.unmarshalString<PurchaseOrderElement>(xml).value;
const inferred: RootElement = unmarshaller.unmarshalString(xml);
const name: string = po.shipTo.name;
const year: number | undefined = po.orderDate?.year;

unmarshaller.unmarshalFile<RootElement>('po.xml', (root) => void root.name.localPart);

const address: USAddress = { name: 'Alice Smith', street: '123 Maple Street', city: 'Mill Valley', state: 'CA', zip: 90952 };
const out: string = marshaller.marshalString<PurchaseOrderElement>({
  name: { namespaceURI: '', localPart: 'purchaseOrder' },
  value: { shipTo: address, billTo: address, items: {} },
});

// @ts-expect-error misspelt property
const misspelt = po.shipTo.nme;

export { name, year, inferred, out, misspelt };
