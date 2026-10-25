# jsonix-CR-012: An opt-in strict integer parse for attribute values (`strictIntegers`): only an optional sign and digits, so `""`, `" 240 "`, `240.`, `0x10` and `1e3` reach `onInvalidValue` as written

**Status:** Proposed 2026-10-26; L1 and L2 for Jason
**Depends on:** nothing; 3.8.0 is the baseline
**Requested by:** `plutext/docx4j-generated-objects-ts` for its CR-015 phase 2. Jason decided objects' N8 (b), which is
this CR, on 2026-10-26 ("implement CR-015 as recommended"). The evidence is docx4j CR-065 phase 0, the shared Word
probe (Jason, Word 365, rounds 2 to 4, 2026-10-26).
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

`Jsonix.Schema.XSD.Integer.parse` reads text with `Number()` and then checks that the result is an integer. Its twelve
restrictions (`Long`, `Int`, `UnsignedLong`, ...) inherit the parse. `Number()` accepts text that no XML Schema
integer has, so these forms read as integers:

| Text | Read today (attribute) | XSD (`xs:integer`) | Word 365 (probe rounds 3 and 4) |
|---|---|---|---|
| `""`, `" "` | `0` | invalid | `""` reads as `0`; `" "` unmeasured |
| `" 240 "`, `"\t240"` | `240` | valid (whitespace collapses) | `" 240 "` **refuses the document**; `"\t240"` unmeasured |
| `240.`, `10206.0` | `240`, `10206` | invalid | `240` and `10206` (a decimal truncates) |
| `0x10`, `0b1`, `0o7` | `16`, `1`, `7` | invalid | `0x10` **refuses the document**; the others unmeasured, outside Word's form |
| `1e3`, `1.5e2` | `1000`, `150` | invalid | **refuses the document** |
| `+240`, `007`, `-0` | `240`, `7`, `-0` | valid | `+240` reads as `240`; the others unmeasured |
| `1.5`, `.5`, `abc`, `240,5` | refused | invalid | `1` and `0` (truncated); `abc` and `240,5` **refuse the document** |

Measured on 3.8.0. Element content reads the same, except that blank content gives no value at all.

jsonix-CR-010's `onInvalidValue` receives an attribute value only after its parse has failed. So objects' facade, which
holds Word's reading of an integer attribute (its `wordInvalidValue`, objects CR-015 phase 1), never sees the forms
`Number()` reads. The runtime reads documents Word won't open, with values Word never read.

This CR adds one per-call unmarshaller option:

```js
context.createUnmarshaller({ strictIntegers: true, onInvalidValue: function (text, propertyInfo, classInfo, node, error) { ... } })
```

With `strictIntegers` on, an attribute of one of the thirteen integer types reads only text matching
`/^[+-]?[0-9]+$/`. Anything else is refused, and so reaches `onInvalidValue` with the text as written. That includes
`""`, whitespace, `240.`, `10206.0`, hex and exponents. Off, which is the default, nothing changes.

## 2. What objects needs (objects CR-015 section 3.3, N8)

- **An option**, an unmarshaller option off by default, so that nothing changes for anyone who doesn't ask.
- **What it accepts:** exactly `[+-]?\d+`. Anything else throws, so `onInvalidValue` receives it.
- **No whitespace collapse.** `xs:integer` collapses whitespace, so XSD reads `" 240 "`, but Word refuses the
  document. The option must not trim.
- **Printing is unchanged.**

The facade will set the option on every unmarshal it makes (objects CR-015 phase 2):
- In Word's own mappings, `wordInvalidValue` reads `""` as `0` and Word's decimal forms by truncation, and drops the
  rest.
- In every other mapping, it reads the text as the runtime does today, so their behaviour doesn't change.

## 3. Where the runtime parses an integer

- **Attributes:** the attribute loop in `ClassInfo.unmarshal` calls `ClassInfo.unmarshalPropertyValue`, which calls
  `AttributePropertyInfo.unmarshalValue` (inherited from `SingleTypePropertyInfo`), which calls `typeInfo.parse`. This
  is the only attribute path, and the only place `onInvalidValue` is consulted.
- **Element content and simple content:** `AnySimpleType.unmarshal` reads the element's text, untrimmed, returns
  nothing for blank text, and otherwise calls `parse`. No callback receives a refusal here: the error aborts the
  unmarshal, located.
- **List items:** `List.parse` splits on whitespace, trims each item and calls the item type's `parse`.
- **Marshal:** `reprint` parses a string value that is not an instance (an integer property holding `"0x10"`), then
  prints the result.
- **Enumerations** based on an integer type look the text up among their entries, so they are exact already.

In the mappings objects ships (`modules/`, at objects main 6fb91b8):

| Integer-typed (13 types) | Where |
|---|---|
| Attributes | 178 in Word's own mappings (138 `wml`, 40 `w14`), and over 1,000 in the others (`sml` 431, `dml` 144, ...) |
| Element content | none in `wml` or `w14`. 41 elsewhere: `wp:posOffset`, `wp14:pctWidth`/`pctHeight`, the spreadsheetDrawing markers, `docProps` extended (`Pages`, `Words`, ...), custom and variant types, a 2014 chart's `ptidx` |
| List-typed attributes | none in `wml` or `w14`. 9 in `dml_diagram` |

## 4. Proposal

### 4.1 The option

`strictIntegers` is a boolean, per call, set through `createUnmarshaller(options)` like jsonix-CR-010's callbacks
(`deriveContext` copies it onto the derived context). The `Context` constructor does not read it, as it does not read
the callbacks, so one shared context serves strict and lenient callers.

### 4.2 What it changes

With `strictIntegers` on, `AttributePropertyInfo.unmarshalValue` does this for an attribute whose type info is
`Jsonix.Schema.XSD.Integer` or one of its restrictions:
1. **Parse as today.** A text today's parse refuses (`1.5`, `abc`, `240,5`) fails exactly as today, with today's
   error. The option only adds refusals and never changes an existing one.
2. **Then check the text** against `/^[+-]?[0-9]+$/`. If it does not match, the read is refused with a new error:
   `Argument [240.] must be an integer literal: an optional + or - and the digits 0 to 9, with nothing around them.`

Either error goes to `onInvalidValue` when it is set (it receives the text as written, the property info, the class
info, the element and the error). Unset, the error is located as every typed-value error is, for example
`w:spacing/@w:before (line 3): Argument [ 240 ] must be an integer literal: ...`.

Sketch (`jsonix-factory.js`, mirrored into the modular `AttributePropertyInfo.js` and `dist/Jsonix-all.js`):

```js
unmarshalValue: function (value, context, input, scope) {
	var parsedValue = this.parse(value, context, input, scope);
	// jsonix-CR-012: with strictIntegers, an integer attribute reads only an optional sign and digits; the other texts
	// Number() reads ("", " 240 ", "240.", "0x10", "1e3") are refused, so onInvalidValue receives them as written.
	if (context.strictIntegers && this.typeInfo instanceof Jsonix.Schema.XSD.Integer && !/^[+-]?[0-9]+$/.test(value)) {
		throw new Error('Argument [' + value + '] must be an integer literal: an optional + or - and the digits 0 to 9, with nothing around them.');
	}
	return parsedValue;
},
```

`[0-9]`, not `\d`: they are the same in JavaScript, but `[0-9]` says so. `instanceof` holds for all thirteen types,
since each restriction is built on `Integer` (checked on 3.8.0).

### 4.3 Stricter than XSD, deliberately

`xs:integer` has `whiteSpace="collapse"`, so in XSD `" 240 "` and `"\n240\n"` are valid integers. With the option on
they are refused, because Word refuses the document (probe round 4). This is the same choice as jsonix-CR-010 section 13
made for the boolean and enumeration parses, which compare exactly.

So the option gives XSD's lexical space without the whitespace collapse. Without the option the runtime stays laxer
than XSD, as it is today.

### 4.4 What is not affected

- **Element content, simple content and list items** read as today, on or off (L1).
- **Marshal.** The check is in the attribute unmarshal path only, so a marshaller given the option prints and reprints
  as today.
- **Accepted values read as today:** `+240` reads as `240`, `007` as `7`, `-0` as `-0`, and digits beyond 2^53 are
  rounded by `Number()`.
- **Ranges.** The parse never checks a subtype's range, on or off: a `Byte` reads `300` as `300`, and an `UnsignedLong`
  reads `-1` as `-1`. Word keeps twips beyond 16 bits modulo 2^16 (objects CR-015 section 4). That is a reading for a
  resolver, not a lexical rule.
- **Decimal, Float and Double** are unchanged.

### 4.5 Reading a refused value as today

A callback that wants the runtime's reading for some mappings (objects' "every other mapping") calls
`propertyInfo.typeInfo.parse(text)`. That is today's parse, unchanged: it returns `16` for `0x10` and `0` for `""`, and
throws today's error for `1.5`. Rethrowing that error gives today's located message.

Note that `Number(text)` alone is not today's reading: it gives `1.5` for `1.5`, which today's parse refuses. The
typings add `TypeInfo.parse?` for this (section 6).

## 5. Alternatives

- **The check in `Integer.parse`, gated on `context.strictIntegers`.** This covers element content, simple content and
  list items too. A marshaller given the option would also apply it in `reprint`.
  - No callback receives a refusal from element content, so there a refused form aborts the part.
  - `wp:posOffset`, `docProps/app.xml`'s `<Pages>` and the rest of section 3's 41 would change for every caller who
    sets the option, and the facade could not restore today's reading.
  - Word's own mappings have no integer element content, so this gains nothing for objects.
- **`strictIntegerAttributes`** as the name: it names its scope (L2).
- **A pattern option** (`integerPattern: RegExp`) would let a caller put Word's form into the runtime. But the runtime
  holds no Word rules (jsonix-CR-010), and the facade already reads Word's form from the refused text.
- **`strictNumbers`, covering `Decimal`, `Float` and `Double`** was not asked for, and Word's reading of those is
  unmeasured.
- **On by default.** That changes readings for every consumer, and XSD itself reads `" 240 "`.
- **Leave the runtime as it is** (objects' N8 (a)).

## 6. Typings

- `UnmarshallerOptions.strictIntegers?: boolean`, documented as in section 4: attribute values of the integer types only,
  stricter than XSD's whitespace collapse, a refusal goes to `onInvalidValue`.
- `Context.strictIntegers?` (readonly), beside the other derived-context members.
- `TypeInfo.parse?(text: string, context?: unknown, input?: unknown, scope?: unknown): unknown`. The built-in simple
  types and enumerations have it; class infos do not.
- `usage.ts` sets the option and calls `propertyInfo.typeInfo.parse`, and a `@ts-expect-error` line passes a string for
  the boolean.

## 7. Compatibility and cost

Off, nothing changes. The cost is one property read per typed attribute, and it is measured at implementation against
3.8.0. On, each integer attribute adds one regular-expression test.

No generated `.d.ts` changes, since the data representation is unchanged. CLAUDE.md's contract table gains a row: with
`strictIntegers`, `onInvalidValue` sees every integer attribute text outside `[+-]?[0-9]+`, as written.

## 8. Tests (at implementation)

These go in a new suite, `tests/strictintegers.js`, registered after `Adapters`, with one mapping holding an attribute of
each of the thirteen integer types:
- **Off by default:** every form in section 1's table reads as today, and `onInvalidValue` is not called.
- **On, accepted:** `0`, `240`, `+240`, `-240`, `007` and `-0`, in range for each type, read as today.
- **On, refused to `onInvalidValue` with the text as written,** for each of the thirteen types: `""`, `" "`, `" 240 "`,
  `"\t240"`, `"240\n"`, `240.`, `10206.0`, `0x10`, `0b1`, `0o7`, `1e3` and `1.5e2`.
- **On, already refused:** `1.5`, `.5`, `abc`, `240,5` and `Infinity` reach the callback with today's error message.
- **On, no callback:** a refused form throws the located error with the new message.
- **On, unaffected:** element content (`" 240 "` reads `240`), simple content, a list-typed attribute, an
  integer-based enumeration, `Decimal` and `Double` attributes; and a marshaller given the option writes byte-identical
  output, including a string reprinted through `reprint`.
- **Per call:** two unmarshallers on one context, one strict, read the same document differently, and the shared
  context has no `strictIntegers`.
- **Today's reading from the callback:** `propertyInfo.typeInfo.parse(text)` returns `16` for `0x10` and throws today's
  error for `1.5`.
- **Typings:** `usage.ts` compiles under the bundler and node16 resolutions (section 6).

## 9. Decisions (for Jason)

- **L1. Scope:** attribute values only (recommended), where `onInvalidValue` can receive a refusal; or every integer
  parse, including element content, simple content and list items, where a refusal aborts the part (section 5). Word's
  own mappings have no integer element content.
- **L2. Name and shape:** a per-call boolean, `strictIntegers` (recommended), as objects proposed. It sits beside
  `onInvalidValue`, which is also attribute-only by its documentation, not its name. The alternative is
  `strictIntegerAttributes`, which says its scope in the name.
