# jsonix-CR-006: Report what unmarshalling drops, and record what marshalling writes: two optional context callbacks

**Status:** Implemented 2026-09-27, version 3.4.0, with three amendments to section 3 found by testing (section 9)
**Depends on:** nothing; 3.3.0 is the baseline
**Requested by:** `plutext/docx4j-core-ts` CR-002 section 27 (a person edits a part's XML in the
editor's parts panel and must be told what will not be saved) and its CR-006 (XPath over the
WordprocessingML tree: the objects an expression selects). Both originate in
`plutext/docx4j-ts-editor` ED-005 sections 3.5 and 4.
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

The runtime drops silently and marshals anonymously, and two consumers need it to do neither.

**Unmarshalling.** An element the class info does not expect is skipped at
`jsonix-factory.js:2383`, under the comment this CR takes up: `// TODO optionally report a
validation error that the element is not expected`. An attribute the class info does not expect is
skipped two dozen lines earlier with no comment at all, the `if` at line 2341 having no `else`. Both
are right by default - lax reading is what a consumer of real-world documents wants, and is what
Word itself does - and both are wrong when the input is something a person just typed: the caller
cannot tell them that half of their edit will not survive.

**Marshalling.** Every element written is a new DOM node with no link to the value it came from, so
a consumer that evaluates XPath over a marshalled DOM cannot get back to the objects the expression
selected. JAXB's `Binder<Node>` keeps that link; this runtime has nothing.

Both are one small change of the same shape: an **optional callback on the context**, called where
the runtime already stands, with what it already has in hand. Nothing is added to any signature, no
default behaviour changes, and a consumer that sets no callback pays one property read per element.

Prototyped end to end before filing (section 2), which is what turned up the two details a
specification would have missed: `any` content is written as a **copy**, and namespace declarations
arrive at the attribute site as unexpected attributes.

## 2. Evidence and prototype (3.3.0, `@xmldom/xmldom` 0.9.12, Node 18.18.1, 2026-09-27)

The four sites, patched in a scratch copy of `nodejs/scripts/jsonix-factory.js` - **four lines
added, no signature changed** - and driven by a minimal mapping (a `Styles` class with an element
property and no wildcard, an `Open` class with an `anyElement` wildcard):

```
1. unexpected element reported: [{"element":"bogus","line":4,"column":3}]
   the <bogus/> is on line 4, column 3 of that input

2. marshal mapped 3 of 3 elements
   <t:styles> -> {"TYPE_NAME":"test.Styles","style":[{"TYPE_NAME":"test.Style
   <t:style> -> {"TYPE_NAME":"test.Style","id":"Normal","size":20}
   <t:style> -> {"TYPE_NAME":"test.Style","id":"Heading1","size":28}
   identity holds: true

1b. with an any wildcard, nothing is reported: [] - the bogus element is kept as DOM: bogus

3. any content: the output element is a copy, not the tree node: true
   the hook maps the copy back to the original node: true

4. unexpected attribute reported: [{"attribute":"xmlns","onElement":"styles","line":2},
                                   {"attribute":"bogusAttr","onElement":"style","line":3}]
```

Five things that result are worth stating before the proposal, because each one shapes it:

1. **The line and column come free.** `Jsonix.XML.Input` carries `node`, the current DOM node
   (declared at line 1181), and in Node the DOM is xmldom's, which attaches `lineNumber` and
   `columnNumber` to every element. So a report can be located without the runtime tracking
   positions itself. In a browser the native `DOMParser` attaches nothing and the same callback
   yields `undefined` for both, which is the consumer's business to degrade over - a caller may also
   supply xmldom through `Jsonix.DOM.use` (jsonix-CR-005 section 7.5) and have locations everywhere.
2. **The element hook fires exactly when content is lost** (1 versus 1b). A class with an `any`
   wildcard keeps the unknown child and is silent; only a class without one reaches the skip. So
   this is not a schema validator and should not be described as one: it is a "something was
   dropped" signal, which is precisely what the editor's parts panel wants.
3. **`any` content is written as a copy.** `output.writeNode(node)` does
   `document.importNode(node, true)` (line 1761), so the element in the marshalled DOM is not the
   node in the tree: a consumer keying a `WeakMap` on output elements would miss every wildcard
   child - a `w:drawing` in a resolved `mc:Choice`, an unbound `sle:slicer` - which is exactly the
   content it most wants to reach. `writeNode` returns the imported node, so the mapping is
   available; it just has to be reported.
4. **Namespace declarations arrive as unexpected attributes.** `xmlns` is an attribute in the DOM
   and is not in `structure.attributes`, so the naive hook reports it, as the prototype's output
   shows. The callback must not fire for the XMLNS namespace, or every consumer will have to filter
   it and most will forget.
5. **One site serves every element.** `Jsonix.Model.ClassInfo.marshal` (line 2426) runs immediately
   after the enclosing element is opened, whichever of the eight `writeStartElement` call sites
   opened it, and that element is `output.peek()`. So the marshalling hook is one line rather than
   eight, and cannot be missed at a site somebody adds later.

## 3. Proposal

Four optional callbacks, read off the context, `undefined` by default.

### 3.1 `onUnexpectedElement(name, node, classInfo)`

At `jsonix-factory.js:2383`, replacing the TODO:

```js
if (context.onUnexpectedElement) { context.onUnexpectedElement(input.getName(), input.node, this); }
et = input.skipElement();
```

`name` is the `Jsonix.XML.QName` of the skipped element, `node` the DOM node the input stands on
(carrying `lineNumber` and `columnNumber` in Node), `classInfo` the type that did not expect it,
which is what lets a caller say *where* in a schema sense as well as where in the file.

### 3.2 `onUnexpectedAttribute(name, node)`

In the attribute loop, before the existing `if` at line 2341:

```js
if (!Jsonix.Util.Type.exists(this.structure.attributes[attributeNameKey])
        && context.onUnexpectedAttribute
        && input.getAttributeName(index).namespaceURI !== Jsonix.XML.XMLNS_NS) {
    context.onUnexpectedAttribute(input.getAttributeName(index), input.node);
}
```

The XMLNS test is finding 4 above and is not optional. An attribute has no position of its own in
xmldom, so `node` is the owning element and its line is the best available; a consumer should say
"on this element" rather than pretend to a column.

`xsi:type` is consumed by `supportXsiType` before this loop is reached in the cases that matter,
but if a mapping does not enable it the attribute would be reported: worth a line in the typings so
a caller is not surprised.

### 3.3 `onElement(element, value)`

First line of `Jsonix.Model.ClassInfo.marshal` (line 2426):

```js
if (context.onElement) { context.onElement(output.peek(), value); }
```

and at the two `output.writeNode(value)` calls that write wildcard DOM content (lines 3511 and
3761), so that the imported copy is reported against the original node:

```js
var node = output.writeNode(value);
if (context.onElement) { context.onElement(node, value); }
```

An element whose content is a simple type has no value of its own and is not reported; the owning
class's element is, which is what a consumer needs (a caller asking about `w:sz` wants the `w:rPr`
that holds it). That asymmetry belongs in the documentation rather than in more callbacks.

### 3.4 A located error for a value of the wrong type

`Jsonix.Util.Ensure.ensureInteger` throws `Argument [NaN] must be an integer, but it is not a
number.` (line 843) and the message is the whole of what a caller gets: no element, no attribute, no
position, and the throw abandons the unmarshal so nothing downstream can locate it afterwards. This
one is not a callback but a better error, and it helps every consumer rather than only a validating
one. The conversion happens under `unmarshalPropertyValue` (line 2421) for an attribute and
`unmarshalProperty` (line 2373) for element content, both of which have the property, the name and
`input` in hand; wrapping the call and rethrowing with the attribute or element name and
`input.node`'s line is enough:

```
w:sz/@w:val (line 12): Argument [NaN] must be an integer, but it is not a number.
```

If this part is taken alone it is already most of what `plutext/docx4j-core-ts` CR-002 section 27
needs from this repository, since the dropped-content half can be found by a consumer diffing the
unmarshalled tree against the input DOM. It is offered separately for that reason.

## 4. Why the context carries them

Because it already carries per-call options that way, and because the alternative leaks.

`Jsonix.Binding.Marshaller.marshalDocument` threads `this.context` as the `context` argument down
through every `marshal` (line 2116), and `Jsonix.Binding.Unmarshaller.unmarshalDocument` threads it
through every `unmarshal` (line 2177). So a callback read off `context` at any depth is the one the
caller supplied, with no plumbing. And a caller supplies it **without mutating the shared context**
by the pattern `@docx4j/generated-objects-ts` already uses for `namespacePrefixes`:

```js
var derived = Object.create(context, { onElement: { value: record } });
var doc = derived.createMarshaller().marshalDocument(value);
```

which the prototype in section 2 uses throughout. That matters: a context is shared and long-lived
(one per application in the docx4j packages), so a callback set on it would otherwise outlive the
call and be seen by every concurrent marshal. `createMarshaller(options)` / `createUnmarshaller(options)`
would be an alternative, and a friendlier one for a consumer who does not know the `Object.create`
trick; if this CR adds them, the context read stays the mechanism underneath.

## 5. Compatibility

Nothing changes for a caller that sets no callback: four `if`s on a property that is `undefined`,
one per element and one per unexpected attribute. No signature, no mapping format, no default
behaviour, no output bytes. The located error of section 3.4 changes an error *message*, which a
consumer should not be matching on, and improves it in the direction any consumer would want; if
that is thought a risk it can be put behind the same opt-in as the rest.

The typings (`nodejs/scripts/types/main.d.ts`) gain the four optional members on the context type
and the callback signatures, with `QName` and `Node` as their parameter types.

## 6. Tests

In `nodejs/scripts/tests/`, over a minimal mapping like the prototype's rather than a generated one,
so the test says what it means:

- an unexpected element reports its name, and its line and column in Node;
- the same input against a class with an `any` wildcard reports **nothing** and keeps the element,
  which is the property that makes this a dropped-content signal and not a validator;
- an unexpected attribute reports its name and the owning element, and a namespace declaration
  reports nothing;
- `onElement` maps every class-typed element of a round trip to the value it was written from, by
  identity, and a wildcard DOM child maps its imported copy to the original node;
- a marshal with no callback produces byte-identical output to one with (the callback cannot write);
- a value of the wrong type throws with the attribute name and the line in the message.

## 7. Effort

Half a day including the tests and the typings. The four sites are four lines; the prototype of
section 2 is the implementation, minus the XMLNS test which it lacks and the located error which it
does not attempt.

## 8. What this is not

- **Not a validator.** It reports what this runtime dropped, which is narrower than what a schema
  would reject and is the right thing for the consumers asking: a validating unmarshaller is a much
  larger proposal and nobody has asked for one.
- **Not a `Binder`.** `onElement` gives the direction from DOM node to object, which is what
  selection needs. Writing a DOM change back into the objects (`Binder.updateJAXB`) is not proposed,
  and `plutext/docx4j-core-ts` CR-006 section 7 explicitly does not want it.
- **Not a position tracker.** The runtime does not start recording lines and columns of its own; it
  hands over the DOM node it is standing on and lets the parser's locator, where there is one,
  supply the position.

## 9. Runtime review and implementation notes (2026-09-27)

Accepted and implemented as proposed, with `createUnmarshaller(options)` / `createMarshaller(options)`
taken up as the surface (section 4's friendlier alternative), and three amendments that testing
against the runtime forced. Each is the same kind of finding as section 2's: a place where the
runtime keeps or consumes content that a naive hook would have reported as dropped, or reports
twice.

**Amendment 1: `xsi:type` is iterated by the attribute loop.** Section 3.2 says `supportXsiType`
consumes it "before this loop is reached". It does not: the element unmarshaller reads the
attribute's *value* to choose the type, but the attribute stays in the DOM and the loop over
`getAttributeCount()` visits it, so the hook as specified would have reported `xsi:type` on every
polymorphic element. The implementation excludes the XSI `type` attribute when
`context.supportXsiType` is on. When it is off, the attribute really is dropped and is reported,
and so are the derived type's own attributes, because the element is then read as the base type;
the test `XsiTypeReportedWhenNotSupported` pins both.

**Amendment 2: an `anyAttribute` wildcard keeps unknown attributes.** The attribute twin of section
2's finding 2: a class with an `anyAttribute` property puts every attribute not otherwise mapped
into that map (namespace declarations included), so nothing is dropped and the hook is silent for
such a class. Section 3.2 had no such condition.

**Amendment 3: a derived type's marshal enters `ClassInfo.marshal` twice for one element.**
`ClassInfo.marshal` calls `this.baseTypeInfo.marshal(value, ...)` on the same output element, so
the hook of section 3.3, placed at the top of `marshal`, fired once per level of inheritance. The
implementation remembers the last reported element on the output (`output.reportedElement`) and
reports each element once, at the most derived level.

**Everything else as specified.** `onUnexpectedElement(name, node, classInfo)` at the skip;
`onUnexpectedAttribute(name, node, classInfo)` in the attribute loop (the class info added for
symmetry), silent for the XMLNS namespace; `onElement(element, value)` at the top of the
marshallable branch of `ClassInfo.marshal` and at both `writeNode` sites, the latter reporting the
imported copy against the original node; the located error of section 3.4 as
`Jsonix.Model.ClassInfo.locateError`, applied in `unmarshalProperty` (elements) and
`unmarshalPropertyValue` (attributes), producing e.g.
`t:style/@size (line 2): Argument [NaN] must be an integer, but it is not a number.` with `cause`,
`node`, `attributeName` and a `jsonixLocated` flag so that an error is located once, at the
innermost property, and passes unchanged through the enclosing levels.

**Per-call options.** `Context.deriveContext(options)` returns `Object.create(this)` with the
options copied on (undefined values ignored; no options returns the context itself), and
`createUnmarshaller(options)` / `createMarshaller(options)` pass through it. Any context property
can be set that way for one call: the callbacks, and also `parentPointers`, `supportXsiType` and
`namespacePrefixes`, which is the pattern `docx4j-generated-objects-ts` had been applying by hand.
The shared context is never written. Note that a `namespacePrefixes` override changes the prefix
only for names that do not already carry one; a QName unmarshalled from input keeps its prefix, as
before (that is jsonix-CR-003 part 2's territory).

**Typings** (`types/main.d.ts`): `Jsonix.UnmarshalCallbacks`, `Jsonix.MarshalCallbacks`,
`Jsonix.UnmarshallerOptions`, `Jsonix.MarshallerOptions`, `Jsonix.LocatedError`;
`Context.createUnmarshaller(options?)`, `createMarshaller(options?)`, `deriveContext(options?)`, and
the three callbacks as optional read-only members of `Context`. `usage.ts` checks them, including
that a marshalling callback is rejected on `createUnmarshaller`.

**Tests** (`tests/callbacks.js`, 37 assertions): the six of section 6, plus the three amendments,
`supportXsiType: false` reporting, `deriveContext` identity and non-leakage, `parentPointers` and
`namespacePrefixes` as per-call options. Applied to all three copies of the library; existing
suites, type-checks, ESM smoke and bundle tests unchanged.

**Consumer follow-up:** `docx4j-generated-objects-ts` passes the options through `marshalNode` /
`unmarshalNode` (its facade) so that core-ts CR-002 section 27 and CR-006 can use them.

**Verified by core-ts against the checkout before release (2026-09-27):** 514 tests, typecheck clean,
181 parity assertions against the docx4j goldens; every XML part a load re-marshals, 447 parts over
51 fixtures (docx, pptx, xlsx and the 37 parity documents), hashes byte-identically under 3.3.0 and
3.4.0, so amendment 3's dedup changes no output. The real case from core-ts CR-002 section 27
(`comments-two.docx`'s `styles.xml` with four edits) reports all three drops with class info and
position through the objects context, and the typed value throws located. Two notes from that run:
a typed-value error aborts the unmarshal, so a caller sees only the drops *before* the bad value
(inherent; core-ts's `validateXml` contract says "complete for drops, first-only for type errors"),
and the located message originally spelled a namespaced attribute as
`@{http://...}val`; it now resolves the prefix on the element, `w:sz/@w:val`, falling back to the
QName's own prefix and then the local name. core-ts recorded the corrected `xsi:type` claim in its
CR-002 section 27.

**Limitation found at release time, not changed in 3.4.0 (candidate for a follow-up CR):** a class
with **no element properties** (attributes only, or attributes plus a simple value) does not reach
the skip of section 3.1 when it meets an unexpected child. `ClassInfo.unmarshal` takes its "just
skip everything" branch (`input.nextTag()` then the END_ELEMENT assertion), and an unexpected child
there throws `Illegal state: must be END_ELEMENT.` with no location. So `onUnexpectedElement` never
fires for such a class and the unmarshal aborts instead. Reproduced identically on the published
3.3.0, so it is pre-existing, and the tag was not moved for it after core-ts's verification. The
fix is small and lax in the direction the runtime already claims: skip and report every child of an
element-less class rather than assert, or at least locate the error through `locateError`; it
changes an error path into a lax one, so it is proposed separately rather than folded in here.
