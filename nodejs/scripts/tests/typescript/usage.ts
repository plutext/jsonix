// Compile-time checks: the declarations that jsonix-schema-compiler generates for
// purchaseorder.xsd must compose with the runtime's own typings without casts.
// Run with `npm run typecheck`. Removing the generics from types/main.d.ts must make this fail.
import { Jsonix } from '@docx4j/jsonix';
import { PO } from './PurchaseOrder.std';
import { PO as PO_ESM } from './PurchaseOrder.mjs';
import type { PurchaseOrderElement, PurchaseOrderType, RootElement, USAddress, Items, XmlCalendar } from './PurchaseOrder.std';

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

// PARENT (compiler CR-006): declared as the union of the types that can contain each type; the
// runtime half (jsonix-CR-002) will set it when `parentPointers` is on. Declaration-level checks only.
const itemParent: Items | undefined = firstItem?.PARENT;
const addressParent: PurchaseOrderType | undefined = po.shipTo.PARENT;
// @ts-expect-error PurchaseOrderType only occurs at the root, so it has no PARENT member
const rootParent = po.PARENT;
// @ts-expect-error PARENT is read-only
po.shipTo.PARENT = po;

// The union of global elements, and the callback forms.
unmarshaller.unmarshalFile<RootElement>('po.xml', (root) => {
  const localPart: string = root.name.localPart;
  void localPart;
});
unmarshaller.unmarshalURL<RootElement>('http://localhost/po.xml', (root) => void root.value);

// (d) Without a type argument the result is the mapping's root element union, inferred from
// JsonixMapping<RootElement> via the Context's type parameter.
const inferred = unmarshaller.unmarshalString(xml);
const inferredRoot: RootElement = inferred;
const inferredName: string = inferred.name.localPart;
const inferredValue: string | PurchaseOrderType = inferred.value;
if (typeof inferred.value !== 'string') {
  const narrowed: string = inferred.value.shipTo.name;
  void narrowed;
}
// @ts-expect-error the union is not one of its members
const notNarrowed: PurchaseOrderElement = inferred;
// The ESM mapping infers the same.
const inferredEsm: RootElement = esmContext.createUnmarshaller().unmarshalString(xml);

// A hand-written mapping (no __rootElement) yields the untyped element, not a bare record.
const untyped = new Jsonix.Context([{ name: 'X', typeInfos: [], elementInfos: [] }]).createUnmarshaller().unmarshalString(xml);
const untypedName: string = untyped.name.localPart;
const untypedValue: unknown = untyped.value;
// ... also when the hand-written mapping is typed with an interface (no index signature).
interface HandWrittenMapping { name: string; typeInfos: object[]; elementInfos: object[]; }
declare const handWritten: HandWrittenMapping;
const fromInterface: Jsonix.TypedNamedValue = new Jsonix.Context([handWritten]).createUnmarshaller().unmarshalString(xml);
// Mixed generated and hand-written mappings: the generated one's root elements survive.
const mixed: RootElement | Jsonix.TypedNamedValue = new Jsonix.Context([PO, handWritten]).createUnmarshaller().unmarshalString(xml);

// (e) Parent pointers and deep copy (jsonix-CR-002).
const parentedContext = new Jsonix.Context([PO], { parentPointers: true });
const parentedPo = parentedContext.createUnmarshaller().unmarshalString<PurchaseOrderElement>(xml).value;
const copiedPo: PurchaseOrderType = Jsonix.Util.deepCopy(parentedPo);
const copiedAddress: USAddress = Jsonix.Util.deepCopy(parentedPo.shipTo, parentedPo);
const asParented: Jsonix.Parented<PurchaseOrderType> = parentedPo.shipTo;
Jsonix.Util.setParent(copiedAddress, copiedPo);
// @ts-expect-error setParent needs an object
Jsonix.Util.setParent('not an object', copiedPo);

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
  name, zip, year, comment, typeName, itemParent, addressParent, rootParent, inferredRoot, inferredName, inferredValue, notNarrowed, inferredEsm,
  untypedName, untypedValue, fromInterface, mixed, copiedPo, copiedAddress, asParented, runtimeCalendar, runtimeName,
  out, doc, misspelt, wrongType, incomplete,
};
