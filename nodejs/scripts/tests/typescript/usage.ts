// Compile-time checks: the declarations that jsonix-schema-compiler generates for
// purchaseorder.xsd must compose with the runtime's own typings without casts.
// Run with `npm run typecheck`. Removing the generics from types/main.d.ts must make this fail.
import { Jsonix } from '@mitre/jsonix';
import { PO } from './PurchaseOrder.std';
import { PO as PO_ESM } from './PurchaseOrder.mjs';
import type { PurchaseOrderElement, RootElement, USAddress, Items, XmlCalendar } from './PurchaseOrder.std';

declare const xml: string;

const context = new Jsonix.Context([PO], { namespacePrefixes: { '': '' }, supportXsiType: true });
const esmContext = new Jsonix.Context([PO_ESM]);
const unmarshaller = context.createUnmarshaller();
const marshaller = context.createMarshaller();

// (a) Unmarshal results take a generated element type, no cast.
const element: PurchaseOrderElement = unmarshaller.unmarshalString<PurchaseOrderElement>(xml);
const po = element.value;
const name: string = po.shipTo.name;
const zip: number = po.shipTo.zip;
const items: Items = po.items;
const firstItem: Items.Item | undefined = items.item?.[0];
const shipDate: XmlCalendar | undefined = firstItem?.shipDate;
const year: number | undefined = shipDate?.year;
const comment: string | undefined = po.comment;
const typeName: 'PO.PurchaseOrderType' | undefined = po.TYPE_NAME;

// The union of global elements, and the callback forms.
unmarshaller.unmarshalFile<RootElement>('po.xml', (root) => {
  const localPart: string = root.name.localPart;
  void localPart;
});
unmarshaller.unmarshalURL<RootElement>('http://localhost/po.xml', (root) => void root.value);

// Without a type argument the result is still an element, not a bare record.
const untyped = unmarshaller.unmarshalString(xml);
const untypedName: string = untyped.name.localPart;
const untypedValue: unknown = untyped.value;

// (b) A generated interface is enough for the runtime's own QName / Calendar types.
const runtimeCalendar: Jsonix.XML.Calendar | undefined = shipDate;
const runtimeName: Jsonix.XML.QName = element.name;

// (c) Object literals typed with generated types marshal, no cast.
const address: USAddress = { name: 'Alice Smith', street: '123 Maple Street', city: 'Mill Valley', state: 'CA', zip: 90952 };
const outgoing: PurchaseOrderElement = {
  name: { namespaceURI: '', localPart: 'purchaseOrder' },
  value: { shipTo: address, billTo: address, items: { item: [] }, orderDate: { year: 1999, month: 10, day: 20 } },
};
const out: string = marshaller.marshalString(outgoing);
const doc: Document = marshaller.marshalDocument(outgoing);

// @ts-expect-error misspelt property
const misspelt = po.shipTo.nme;
// @ts-expect-error wrong type
const wrongType: number = po.shipTo.city;
// @ts-expect-error missing required property
const incomplete: USAddress = { name: 'x' };
// @ts-expect-error a bare record is not an element
marshaller.marshalString({ foo: 'bar' });

export {
  esmContext, name, zip, year, comment, typeName, untypedName, untypedValue, runtimeCalendar, runtimeName,
  out, doc, misspelt, wrongType, incomplete,
};
