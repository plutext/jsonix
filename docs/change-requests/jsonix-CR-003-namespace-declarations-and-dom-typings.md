# jsonix-CR-003: Namespace declarations on demand, per-marshal prefix tables, and `Jsonix.DOM` in the typings

**Status:** Proposed 2026-09-10
**Depends on:** jsonix-CR-001 (typings, ES-module entry point); 3.2.0 is the baseline
**Requested by:** `plutext/docx4j-generated-objects-ts` CR-001 (the facade's namespace prefix
table), whose interim work-arounds this CR retires, and `plutext/docx4j-core-ts` CR-001 (the
engine), which casts to reach `Jsonix.DOM`
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

Three small things the marshalling side of the runtime does not let a consumer say, each of
which the docx4j facade currently works around after the fact:

1. **Declare only what is used.** `Jsonix.XML.Output` seeds its root scope from the context's
   `namespacePrefixes` and, on the document element, calls `declareNamespaces()` over that whole
   scope. So every entry of the table is declared on every root, used or not. With docx4j's
   table (112 entries) a `<Relationships>` root carries 112 `xmlns` attributes. The facade
   strips the unused ones afterwards with a tree walk.
2. **Declare some things regardless.** ECMA-376 Part 3 requires every prefix named in
   `mc:Ignorable` (and in `mc:Choice/@Requires`) to be declared on the element that carries the
   attribute even when nothing in the tree uses it. Today that only works *because* of 1 (all
   declared); once 1 is fixed there must be a way to ask for specific declarations.
3. **A prefix table per marshal.** docx4j picks a `NamespacePrefixMapper` per part: the
   relationships namespace is the default namespace in a `.rels` part and prefixed elsewhere.
   The table is a context option, and the context is shared, so the facade marshals through an
   object created with `Object.create(context, { namespacePrefixes })`, which works but relies
   on `namespacePrefixes` being read through `this` at marshal time.

And one typings gap: `Jsonix.DOM` (`parse`, `serialize`, `createDocument`) is what every
consumer uses to turn text into the `Node` that `unmarshalDocument` takes and back, but it is
not in `types/main.d.ts`; the facade and the engine both cast.

## 2. Evidence (3.2.0, 2026-09-10)

```
context: new Jsonix.Context(mappings, { namespacePrefixes: { [W]: 'w', [W14]: 'w14', [MC]: 'mc', [XML_NS]: 'xml', [RELS]: '' } })
marshal: <w:document mc:Ignorable="w14"><w:body><w:p><w:r><w:t xml:space="preserve"> x</w:t>...
output:  <w:document xmlns:w="..." xmlns:w14="..." xmlns:mc="..." xmlns:xml="http://www.w3.org/XML/1998/namespace"
           xmlns="http://schemas.openxmlformats.org/package/2006/relationships" mc:Ignorable="w14">...
```

Everything in the table is on the root, including `xmlns:xml` (allowed by the Namespaces
recommendation, written by no other producer) and a default namespace the document never uses.
Without the table, the same input gives `p1:Ignorable="w14"` with no `xmlns:w14`, and
`p2:space` bound to the `xml` namespace: the first is rejected by Word, the second is a
namespace-well-formedness violation (only `xml` may be bound to that URI).

Code: `Jsonix.XML.Output.initialize` (`rootNspItem` seeded from `options.namespacePrefixes`),
`writeStartElement` (`declareNamespaces()` when `this.documentElement === null`),
`declareNamespace` (writes `xmlns` when the prefix is not yet bound in `this.pns`),
`Marshaller.marshalDocument` (`new Jsonix.XML.Output({ namespacePrefixes: this.context.namespacePrefixes })`).

## 3. Proposal

### 3.1 `namespacePrefixes` becomes a preference, declared where first used

`Jsonix.XML.Output.initialize` keeps the table for `getPrefix` lookups but no longer seeds
`this.nsp[0]` with it; `writeStartElement` stops calling `declareNamespaces()` for the document
element. Namespaces are then declared by `declareNamespace` at the element where they are
first used, which is what the JAXB RI does and what the runtime already does for elements below
the root. The `xml` prefix is seeded as already bound in `rootPnsItem`
(`rootPnsItem.xml = 'http://www.w3.org/XML/1998/namespace'`), so `xml:space` and `xml:lang`
never produce a declaration and never get a generated prefix.

This is a behaviour change for consumers who relied on the root carrying the whole table. They
get the same declarations back through 3.2. The default table is empty, so consumers without a
table see no change apart from `xml`.

### 3.2 Marshaller options: `namespacePrefixes` and `declareNamespaces`

`Context.createMarshaller(options?)` takes an options object, and so do
`marshalDocument(element, options?)` and `marshalString(element, options?)`; per-call options
win over marshaller options, which win over the context's:

```ts
interface MarshalOptions {
  /** Overrides the context's table for this marshal (docx4j: a NamespacePrefixMapper per part). */
  namespacePrefixes?: { [namespaceURI: string]: string };
  /**
   * Namespace URIs to declare on the document element whether or not the tree uses them, with
   * the prefix the table gives them (ECMA-376 mc:Ignorable). Unknown to the table: skipped.
   */
  declareNamespaces?: string[];
}
```

`marshalDocument` builds the `Output` with the merged table and, after `writeStartElement` of
the document element, calls `declareNamespace(uri, prefix)` for each entry of
`declareNamespaces`. Nothing else in the writer changes.

A consumer that wants today's behaviour (everything declared on the root) passes
`declareNamespaces: Object.keys(table)`.

### 3.3 `Jsonix.DOM` in the typings

```ts
export namespace DOM {
  /** Parses XML text; throws on malformed input (xmldom's fatal errors, the browser's parsererror). */
  function parse(text: string): Document;
  /** Serialises a node without an XML declaration. */
  function serialize(node: Node): string;
  function createDocument(): Document;
  function isDomImplementationAvailable(): boolean;
}
```

Also `Context.namespacePrefixes: { [namespaceURI: string]: string }` (readonly), which the
facade reads today through a cast.

## 4. Compatibility

- `unmarshal*` is untouched.
- Output for consumers with no `namespacePrefixes`: identical except that `xml:*` attributes
  keep the `xml` prefix instead of a generated one bound to the XML namespace. That output was
  never well-formed under the Namespaces recommendation, so this is a fix, not a change.
- Output for consumers with a table: declarations move from the root to the first use; the
  serialised tree is otherwise the same. Anyone who needs the old shape uses `declareNamespaces`.
- Version 3.3.0.

## 5. Tests

`nodejs/scripts/tests/` gains a marshalling test module:

- Table without `declareNamespaces`: the root declares only the namespaces the tree uses;
  `xml:space` appears as such with no `xmlns:xml`.
- `declareNamespaces` on a root whose tree does not use the namespace: the declaration is on the
  root, with the table's prefix.
- Per-call `namespacePrefixes` overrides the context's; the context's table is unchanged after.
- A default-namespace entry (`''`) on the root's own namespace gives `xmlns="..."` and
  unprefixed children.
- A TypeScript test compiles `Jsonix.DOM.parse` / `serialize` and the new option types.

## 6. Consumers

- `@docx4j/generated-objects-ts` (facade): `marshalToDocument` reduces to
  `context.createMarshaller().marshalDocument(element, { namespacePrefixes: tableFor(root), declareNamespaces: ignorableOf(root) })`;
  the derived-object trick, the stripping walk and the two casts go. Its CR-001 section 3
  names this CR as the proper fix.
- `@docx4j/core-ts` (engine): drops its `Jsonix.DOM` cast in `src/xml/dom.mts`; otherwise
  unaffected, since it marshals through the facade.
