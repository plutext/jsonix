# jsonix-CR-009: Schema defaults on read: the mapping's default for an absent attribute, from the context, never written into the data

**Status:** Proposed 2026-10-24
**Depends on:** nothing in the runtime; 3.5.0 is the baseline. Consumers reading WordprocessingML through it
wait for docx4j CR-059 (the audit of `wml.xsd`'s boolean attribute defaults, section 8) and a regeneration of
`@docx4j/generated-objects-ts`
**Requested by:** Jason, 2026-10-24, through `plutext/docx4j-generated-objects-ts` ("in the absence of an actual
value, jsonix should supply the default"); filed on his instruction the same day, after the recommendation
recorded in sections 3 and 5
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

jsonix-schema-compiler copies each xsd attribute default into the mapping it generates (`defaultValue`, short
`dv`), already in the runtime's representation: `<w:b/>`'s `val` is `defaultValue: true` on
`BooleanDefaultTrue`. The runtime discards it. `Jsonix.Model.PropertyInfo` never reads the key, so `<w:b/>`
unmarshals to an object with no `val`. Every consumer that wants docx4j's `isVal()` has to know the default
itself.

This CR keeps the default on the attribute property and lets a caller ask the context for it:

```js
context.getDefaultValue('org_docx4j_wml.BooleanDefaultTrue', 'val');   // true
context.valueOrDefault(b, 'val');                                       // b.val if present, else true
```

That is what a JAXB getter does, written as a function, because Jsonix objects are plain data with no
getters. Unmarshalling and marshalling do not change. An absent attribute stays absent in the data and in
the output, an explicit one stays explicit, and nothing a caller does not call costs anything.

## 2. What happens today (3.5.0)

- The compiler emits the default for every property whose xsd declaration has one, in the runtime's
  representation (`CreateTypeInfoDelaration.appendDefaultValue`): a boolean, a number, or a string (including
  enum values). Compiler CR-007 added a `jsonix:property defaultValue` customization that replaces a schema's
  default; objects uses it for `Style.customStyle` (docx4j #641: absent means `false`, though `wml.xsd` says
  `true`). The customization can change a default but not remove one.
- objects' generated modules carry 1,659 defaults: 1,658 on attribute properties (956 boolean, 348 number,
  354 string) and one on an element property (chartStyle `CTStyleEntry.lineWidthScale`, `1`). None is an
  object, array or inline type.
- `PropertyInfo.initialize` reads neither `defaultValue` nor `dv`. The only `defaultValue` in
  `jsonix-factory.js` is the unrelated `Jsonix.Util.Type.defaultValue` helper.
- Unmarshalling assigns a property only for an attribute present in the source. Marshalling reads
  `value[propertyInfo.name]` and `AttributePropertyInfo.marshal` writes the attribute only when
  `Jsonix.Util.Type.exists(value)` (neither `undefined` nor `null`).

## 3. What docx4j does

Confirmed by docx4j-25 in docx4j's code and by runs on 2026-10-24:

- **Attributes.** XJC leaves the field `null` when the attribute is absent and generates a getter that
  returns the xsd default (`FldChar.isFldLock()`: `if (fldLock == null) return <default>`). Marshal writes
  only non-null fields, so absent stays absent and an explicit value stays explicit (docx4j's
  `FieldLockAttributeTest.anAbsentAttributeIsNotWritten`). One post-XJC patch changes a default:
  `ModifyGeneratedSources`' "Style-customStyle-default" (#641). No other patch touches a default.
- **Elements.** XJC emits `@XmlElement(defaultValue = "1.0")` on `CTStyleEntry.lineWidthScale` and a plain
  getter. The JAXB RI applies an element default only to a present, empty element. Measured: absent gives
  `null`, `<cs:lineWidthScale/>` gives `1.0`, `<cs:lineWidthScale>2</cs:lineWidthScale>` gives `2.0`.
- **`fixed`.** No docx4j xsd declares an attribute with `fixed=`, and `bindings.xjb` does not set
  `fixedAttributeAsConstantProperty`.

So in docx4j the default reaches whoever reads the property, and never the data or the output. This CR
gives jsonix the same split.

## 4. What changes

### 4.1 The attribute property keeps its default

`Jsonix.Model.AttributePropertyInfo.initialize` reads `mapping.defaultValue`, else `mapping.dv`, and keeps
it as `this.defaultValue` (`undefined` when the mapping has neither). Both mapping styles use this class.
The value is kept as the mapping holds it: the compiler emits it in the runtime's representation, and it is
not parsed or copied. Element, value and wildcard properties are unchanged (section 7).

### 4.2 The context answers

Two methods on `Jsonix.Context`, inherited by every derived context (`createUnmarshaller(options)`,
`createMarshaller(options)`, `deriveContext(options)`):

- **`getDefaultValue(typeName, propertyName)`** looks up the class info named `typeName` (the name
  `TYPE_NAME` carries, e.g. `'org_docx4j_wml.BooleanDefaultTrue'`). It finds the property named
  `propertyName` on that class info or, failing that, on its base types in turn, and returns the
  property's default. It returns `undefined` when the property is not an attribute property, has no
  default, or is not declared. It throws when `typeName` names no class info in this context: the context
  cannot answer at all, which is not the same as "no default".
- **`valueOrDefault(object, propertyName, typeName)`** returns `object[propertyName]` when it exists (by the
  same test as marshal, `Jsonix.Util.Type.exists`), and otherwise
  `getDefaultValue(typeName || object.TYPE_NAME, propertyName)`. Unmarshalled objects carry `TYPE_NAME`, and
  so do those the compiler's element factories create (compiler CR-010). It throws when the object has no
  `TYPE_NAME` and no `typeName` is given (an object built by an `instanceFactory`, or a literal without one).

So the reader supplies the default exactly when marshal writes nothing. A consumer that deletes an
attribute (sets it to `null` or `undefined`) reads the default back, which is what the attribute's absence
means. An explicit value, even one equal to the default, is returned as it is and marshalled as it is.

The name is not `valueOf`. Every object inherits `Object.prototype.valueOf`, and JavaScript calls it with no
arguments when it coerces the context to a primitive.

### 4.3 What does not change

- Unmarshal results, marshal output, `JSON.stringify`, `hasOwnProperty`, `Jsonix.Util.deepCopy` and
  `PARENT`: the data is exactly what 3.5.0 produces.
- The callbacks (CR-006, CR-008) and the mapping format: `defaultValue` and `dv` are already emitted.
- There is no context or unmarshaller option. Nothing changes unless a caller calls one of the two methods,
  so "opt-in or on by default" does not arise: the call is the opt-in. Consumers that test a property for
  `undefined` see the data they see today. core-ts's `spanEdits` copies `fldLock` and `dirty` only when
  they are defined. objects' `isQFormat` falls back to the latent styles' `defQFormat` when `qFormat` is
  undefined.

## 5. Alternatives not taken

- **Set the default as an own property at unmarshal.** Explicit and absent become indistinguishable unless
  marshal knows which values were defaulted. Plain data cannot carry that through spread, `JSON`,
  `structuredClone` or a consumer's edit, so either the defaults are written out or explicit values equal
  to the default are dropped. objects' fidelity test (341 parts written by Office, output hashes compared)
  fails either way. It would also replace "absent means inherit" with the schema's guess (section 8), and
  change the JSON and `hasOwnProperty` of every unmarshalled object for every consumer. The same holds as an
  unmarshaller option: it only limits who is affected.
- **Defaults on a per-type prototype,** the only way to make a plain `b.val` read `true`. Marshal reads
  `value[name]`, so it would write every default unless changed to read own properties only. Spread, `JSON`
  and `structuredClone` drop prototype values (`deepCopy` keeps the prototype). Object literals and the
  compiler's element factories (compiler CR-010) do not get the prototype, so two objects that look equal
  read differently.
- **No runtime change: the facade reads defaults from its own mappings.** This is viable, since the mappings
  carry them. The runtime is the better place: it already resolves `TYPE_NAME` and base types, it holds the
  mapping after any compiler override, and every jsonix consumer gets the same answer.

## 6. Typings

In `types/main.d.ts`, on the `Context`:

```ts
getDefaultValue(typeName: string, propertyName: string): unknown;
valueOrDefault<T extends object, K extends keyof T & string>(object: T, propertyName: K, typeName?: string): T[K];
```

`valueOrDefault` returns the property's declared type, which for an attribute with a default is still
optional (`val?: boolean`): the declarations do not say which properties have defaults. Narrowing those to
non-optional would need the compiler to emit that, e.g. JSDoc `@default` on the property (cheap, and shown in
editors anyway) or a type-level map of defaulted properties. That is a compiler and objects question, not
part of this CR. `tests/typescript/usage.ts` gains a positive use of each method and `@ts-expect-error` lines
for a property name the type does not declare and a missing argument.

## 7. Element defaults are out

An xsd element default applies to a present, empty element, never to an absent one (section 3 measures it
in the JAXB RI). Supplying it is an unmarshal-time change for one property in objects, with its own question
of what an empty `xsd:double` reads as, so it is not part of this CR. `getDefaultValue` returns `undefined`
for element properties, including `lineWidthScale`.

## 8. The defaults have to be right first

The reader applies whatever the mapping says, so a wrong default in the xsd reaches every caller who asks
for it. docx4j's `wml.xsd` has such defaults:

- **docx4j #697**: five attributes declared `default="true"` where the spec gives none: `w:fldChar`'s and
  `w:fldSimple`'s `fldLock` and `dirty`, and `w:documentProtection/@w:enforcement`. The fix is built and
  tested in docx4j and awaits Jason. It sets the five to `default="false"`, which keeps Java's `boolean`
  getters.
- **docx4j CR-059** (`docs/developer/change-requests/CR-059-wml-boolean-attribute-defaults.md`, uncommitted
  on 2026-10-24) audits the rest against ISO/IEC 29500-4:2016 Transitional. docx4j's added defaults are
  confined to `wml.xsd`: sml matches ISO in all 774, and pml and dml differ only in percentage literals
  ("100" against "100%"). Its section 2 table gives, for each of the 38 further attributes docx4j gave a
  default (34 `true`, 4 `false`), the spec's prose when omitted and a reading:
  - **off** (24): the default is `false`, and the reader returns `false`.
  - **inherit**: `w:lsdException`'s `locked`, `semiHidden` and `unhideWhenUsed`, which an absent one takes
    from `w:latentStyles`' `defLockedState`, `defSemiHidden` and `defUnhideWhenUsed` (ECMA-376 17.7.4.8).
  - **application**: `w:revisionView`'s `markup`, `comments`, `insDel`, `formatting` and `inkAnnotations`,
    left to application settings.
  - **open**: `w:cols`' `equalWidth` and `sep`, and `w:spacing`'s `beforeAutospacing` and `afterAutospacing`.
    ISO's schema says "off" but the prose says the style hierarchy decides. CR-059 sends them to Word in its
    phase 0.

  For a jsonix consumer, "inherit" and "application" must be **no default**: the reader returns `undefined`,
  and the consumer resolves the value from the parent or the application, as `isQFormat` already does.
  `false` would be as wrong there as `true` is now. CR-059's D2 recommends docx4j remove those defaults too
  (a `Boolean` getter, `null` when absent), so that docx4j and objects read alike. If docx4j keeps `false`
  anywhere for Java's sake, objects needs a compiler customization that removes a default, which compiler
  CR-007's override cannot do today.

The order is therefore:
1. docx4j #697 and CR-059 land.
2. objects regenerates.
3. objects and its consumers read WordprocessingML defaults through this API.

The runtime half can be implemented and released before step 1, because nothing calls it until a consumer
does. objects should not expose it for WordprocessingML before step 2.

## 9. Compatibility

Additive. No signature, mapping format, default behaviour or output changes. A mapping that never carried a
default behaves as before, and `getDefaultValue` returns `undefined` for each of its properties.
`AttributePropertyInfo` gains one field. `Context` gains two methods, which would shadow a property of the
same name set on a derived context; no option of that name exists.

## 10. Cost

One extra key read per attribute property when the mapping is built. Nothing on the unmarshal or marshal
path. A `getDefaultValue` call is one map lookup per type in the base chain, usually one.

## 11. Tests

A new `tests/defaults.js`, registered in `tests/tests.js`, over a minimal mapping:

- a default read from `defaultValue`, and one from `dv`;
- `valueOrDefault` on an absent attribute (the default), an explicit value equal to the default, a different
  explicit value, and a property set to `null` or `undefined` (the default);
- a default declared on a base type, read through an object whose `TYPE_NAME` is the derived type;
- `undefined` for an attribute without a default, an element property with a mapping default, and a property
  the type does not declare;
- an explicit `typeName` for an object without `TYPE_NAME`; a throw for an unknown type name and for no type
  at all;
- unmarshal and marshal with defaults in the mapping identical to the same mapping without them, for
  `<b/>` and `<b val="true"/>` (fidelity);
- the methods reachable on a derived context.

Plus the typings in `usage.ts`, the three copies of the runtime (`jsonix-factory.js`, `dist/Jsonix-all.js`,
the modular `AttributePropertyInfo.js` and `Context.js`), and `tests/strict.js` passing over all three.

## 12. Outside this repository

- docx4j: #697 and CR-059 (section 8).
- jsonix-schema-compiler: optionally, JSDoc `@default` on defaulted properties, a type-level map that lets
  `valueOrDefault` narrow, and a customization that removes a default. objects decides whether it wants them.
- objects: typed helpers over `valueOrDefault`, adopted for WordprocessingML after it regenerates.
