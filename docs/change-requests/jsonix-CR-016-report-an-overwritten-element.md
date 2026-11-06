# jsonix-CR-016: A single-valued property given a second element reports the one it overwrites

**Status:** Proposed 2026-11-06; R1 to R3 open (section 5)
**Depends on:** nothing; 3.12.0 is the baseline
**Requested by:** `plutext/docx4j-generated-objects-ts`, on CR-015 section 9's aside and its own Word measurement. Jason,
2026-11-06, relayed by the objects session: "tell jsonix to write the CR". The request is for the CR, not the implementation.
objects puts the priority as low, since no file in either corpus has the shape.
**Repository:** `@docx4j/jsonix` runtime (this repository)

## 1. Summary

A single-valued property given a second element keeps the last and tells nobody. Through objects' model, of two `w:body` in a
`w:document` the first is gone with every callback set, and Word shows its words.

This CR adds a report and changes no reading:

```js
context.createUnmarshaller({
  onOverwrittenElement: function (node, keptNode, propertyInfo, classInfo, value, keptValue) { ... }
});
```

With the callback set, it is called once for each value overwritten, with both elements and both values. Unset, nothing
changes and nothing is kept. The last value stays what the tree holds, set or unset. Merging stays out of this CR: Word's rules
differ by element, and they belong above the runtime (R3).

## 2. Why

**The loss is silent.** Each element is its own `unmarshalProperty` call, so nothing compares the second with the first
(section 3). core-ts's CR-025 refuses a save that would lose content it was told about, and it can't refuse this one (its section
2.6).

**Word doesn't keep the last.** objects measured it on 2026-11-06: 3 controls and 13 cases through the Word bridge, each run
twice, on Word 16.0.20326.20232. Every file opened silently, and the two runs matched apart from generated ids.

| Given twice | Word | The tree, 3.11.0 and 3.12.0 |
|---|---|---|
| `w:body`, `w:sdtContent` | One, both words in order | Second only, the first's words lost |
| `w:txbxContent` (a VML box only) | One, both words, **second then first** | Second only, the first's words lost |
| `w:pPr` or `w:rPr`, different properties | Merged | Second only, the first's property lost |
| `w:pPr` or `w:rPr`, the same property | The later value | The same |
| `w:jc`, `w:sz`, `w:b` (on then off, off then on) | The later value | The same |
| `w:sectPr`, `w:tblPr`, the same properties in both | The later value | The same |

So keep-the-last matches Word in 8 of the 13 and differs in the 5 where the repeated child is a container. Neither keep-first
nor keep-last would match. Limits, as objects states them: one Word build, small files, whether `w:sectPr` and `w:tblPr` merge
wasn't tested, `a:ext` wasn't tested, and the `w:txbxContent` order has no explanation. The results are on the share under
`bridge/portfolio/rc-*`.

**The implementations disagree.** Of two `w:body`, docx4j and core-ts keep the second, docx4j-python keeps the first and logs
`Skipped unknown element`, and Word keeps both. core-ts's loss is silent (`pkg.warnings` stays empty); whether docx4j logs one is
unmeasured. Across 89 reader configurations, 62 lose a body
(`docx4j-portfolio/docs/text_extraction_behaviour_model.md` section 7.15, uncommitted when read).

**It is rare.** core-ts counted 997 packages and 9,862 re-marshalled parts: none holds the shape. The 426 fixture parts of
objects' that read here report nothing (section 4.10). This supersedes CR-015 section 9's "Word's reading is unmeasured".

## 3. Where the runtime decides (3.12.0)

Line numbers are `jsonix-factory.js`.

- **The read.** `ClassInfo.unmarshal` hands each child to `unmarshalProperty` (lines 2399, 2406), which reads it and calls
  `setProperty` (line 2484).
- **The overwrite.** `PropertyInfo.setProperty` (line 2968) sets `object[this.name] = value` for any value that exists, whatever
  the object held.
- **`Value already set.`** The three checks (lines 3243, 3620, 3888) sit in a closure inside one `unmarshal` call. A second
  value reaches them only from a second child in one wrapper element, so an ordinary repeat never meets them.

Measured on a hand-written mapping, on the prototype of section 4.10, with the callback set. "Tree" is the same unset.

| Shape | Tree | Report |
|---|---|---|
| A named element twice: class, `Integer`, `String` | The last | 1 |
| The same, three times | The last | 2: first to second, second to third |
| An `elements` choice, `p` then `q`, or `p` twice | The last | 1 |
| `elementRef` twice; `elementRefs`, `p` then `q` | The last | 1 |
| A wildcard twice: DOM, or typed | The last | 1 |
| A typed wildcard, a known then an unknown element | The DOM node | 1 |
| Wildcard with `allowDom: false`, a known then an unknown element | The known | None; `onUnexpectedElement` reports the unknown (CR-015) |
| A wrapper twice | The last | 1, the nodes being the wrappers |
| Two children in one wrapper | `Value already set.` | None: it throws, set or unset |
| `<n>5</n><n/>`, `n` an `Integer` | 5 | None: the second gave no value |
| `<s>a</s><s/>`, `s` a `String` | `""` | 1 |
| Two different properties, or a collection | Both | None |
| A map, different keys or the same key | Merged, or the last entry | None (section 6) |
| A single-valued mixed property, whatever it is given | The last | None (section 6) |

Measured on objects 0.7.0's mappings: 3,554 single-valued element properties in 856 of the 2,173 class infos (3,542
`ElementPropertyInfo`, 9 `AnyElementPropertyInfo`, 3 `ElementRefPropertyInfo`). 1,978 hold a class with element content,
1,374 a class with none, 22 a class with a value and 171 a simple type, and 9 are wildcards. None has a wrapper, none is
mixed, none takes several element names, and there are no maps. `w:txbxContent` in `v:textbox` is a named property, beside that
class's wildcard.

## 4. Proposal

### 4.1 The callback

`onOverwrittenElement(node, keptNode, propertyInfo, classInfo, value, keptValue)`, a per-call unmarshaller option like the others:

| Argument | Is |
|---|---|
| `node` | The element the overwritten value was read from (a wrapper property: the wrapper) |
| `keptNode` | The element whose value replaces it |
| `propertyInfo` | The property both were read for |
| `classInfo` | The class being read, as in `onUnexpectedElement`: the derived class where a base type declares the property |
| `value` | The overwritten value, complete |
| `keptValue` | The value that replaces it, complete, and the one that is stored |

The return value is ignored (R3). With three elements it is called twice, first to second and second to third. It is a new
option, not `onUnexpectedElement` (R1), and it is called for every overwrite, leaves included (R2).

### 4.2 What it covers

A named element, an `elements` choice, an element reference and a single wildcard all report, DOM or typed, since all reach
`unmarshalProperty` the same way. A property reports when an element gave it a value and a later element gives it another. So a second element that gives no value
reports nothing, as with `<n/>` in section 3, because nothing was overwritten. The first's value stands.

### 4.3 Which node

The lost element is the first, and the second is the one in hand when the overwrite is noticed. A caller wants the lost one's
location and name, so the runtime keeps it: `ClassInfo.unmarshal` holds a small map from property name to element, for that one
read, created only when the callback is set.

A walk back through the kept element's siblings would keep nothing, but it would name the wrong element when an earlier sibling
gave no value: of `<n/><n>5</n><n>6</n>`, the lost element is the second. A map is exact, and section 4.10 finds its cost
unmeasurable.

- **Unset:** one property read for each class read, and one more argument. No map, no node kept.
- **Set:** one small object for each class read, and one entry for each single-valued element read.

### 4.4 Telling a container from a leaf

A caller must be able to separate `w:body` from `w:jc`, since refusing a save over `w:jc` would refuse a file Word reads the same
way. The runtime holds no Word rules, so it passes what a caller needs, and each of these works without one:

- **`node`:** an overwritten element holding child elements is a container. On the 13 shapes that test keeps all 5 where Word
  differs, plus 4 where it doesn't (`w:pPr` and `w:rPr` with the same property, `w:sectPr`, `w:tblPr`), and passes over the
  4 leaves (`w:jc`, `w:b` twice, `w:sz`).
- **`value` and `keptValue`:** a caller can compare the two, which is how it would tell the first 4 from the 5: whether the
  overwritten value held anything the kept one doesn't.
- **`propertyInfo.name` and `classInfo.name`:** for a caller that lists what it cares about.

### 4.5 A report is not a validity claim

The model says one; the document gave two. That says nothing about the schema. objects notes that a repeated `w:b` or `w:sz` in
`w:rPr` is valid ISO Transitional (`EG_RPrBase` is `maxOccurs="unbounded"`), though docx4j's `wml.xsd` doesn't allow it. The typings
say so (section 4.8).

### 4.6 Order and the other callbacks

The report comes when the second element has been read, so both values are complete. Everything the second holds has been
reported by then, its own `onElement` included. Traced on two `p`, each holding `c`, with an unknown `x` in the first and two `c`
in the second:

```
onElement c1, unexpected x, onElement p, onElement c2, onElement c3, overwritten c, onElement p, overwritten p, onElement r
```

Three consequences:

- **What was reported for the lost element stands.** `onElement` and the `onUnexpected*` callbacks fired for it and its content
  when it was read. They were true then, and nothing retracts them. A caller holding a map from `onElement` holds the lost object
  too.
- **`PARENT`.** With `parentPointers`, a lost value's `PARENT` still names the object it would have been stored on (measured).
  The object itself is out of the tree, and it stays intact.
- **A throw is located**, by `unmarshalProperty`'s own `catch`, at the second element: `w:body (line 5): refused`, in a file whose
  bodies start on lines 2 and 5. A caller wanting the first's line has `node`.

### 4.7 Unset

Nothing changes. The read gives the same tree, the same errors and the same callbacks, and no node is held.

### 4.8 Typings and contract

`types/main.d.ts`, in `UnmarshalCallbacks`, and in `UnmarshallerOptions` beside the others:

```ts
/**
 * A single-valued property was given a second element, and the second's value replaces the
 * first's (jsonix-CR-016). Called once for each value overwritten, once both are complete, so
 * three elements give two calls. `node` and `value` are what is lost; `keptNode` and `keptValue`
 * are what the tree holds. `node` is a wrapper element where the property has one. Not a validity
 * claim: it says the model holds one, not that the schema allows one. The tree is the same with
 * this unset. The return value is ignored. To refuse the document, throw: the error is located.
 */
onOverwrittenElement?(node: Element, keptNode: Element, propertyInfo: PropertyInfo, classInfo: ClassInfo, value: unknown, keptValue: unknown): void;
```

A new row in CLAUDE.md's contract table:

| Generated declaration | Runtime |
|---|---|
| `onOverwrittenElement(node, keptNode, propertyInfo, classInfo, value, keptValue)` fires once for each value of a single-valued element property that a later element replaces, `node` being the element it was read from, whatever the two elements' names; never for a collection, a map, a mixed property, or a second element that gives no value | `ClassInfo.unmarshalProperty` (jsonix-CR-016), from `ClassInfo.unmarshal`'s two element branches. core-ts's save gate and objects' fidelity would conclude from these conditions that a tree holds all its source's single-valued children. The tree holds the last, set or unset (guarded by `tests/overwrittenelements.js`) |

The per-call options paragraph gains the option. `onUnexpectedElement`'s row doesn't change (R1).

### 4.9 Sketch

```js
// ClassInfo.unmarshal, after sourceElement
var heldElements = context.onOverwrittenElement ? {} : null;

// the two element branches pass it on; the mixed, value and anyAttribute branches don't
this.unmarshalProperty(context, input, elementPropertyInfo, result, heldElements);

// ClassInfo.unmarshalProperty
unmarshalProperty: function (context, input, propertyInfo, result, heldElements) {
	try {
		var element = input.node;
		var propertyValue = propertyInfo.unmarshal(context, input, this);
		if (heldElements && !propertyInfo.collection && !propertyInfo.mixed && Jsonix.Util.Type.exists(propertyValue)
			&& !(propertyInfo instanceof Jsonix.Model.ElementMapPropertyInfo)) {
			if (heldElements[propertyInfo.name]) {
				context.onOverwrittenElement(heldElements[propertyInfo.name], element, propertyInfo, this, result[propertyInfo.name], propertyValue);
			}
			heldElements[propertyInfo.name] = element;
		}
		propertyInfo.setProperty(result, propertyValue);
	} catch (e) {
		throw Jsonix.Model.ClassInfo.locateError(e, input, null);
	}
},
```

`element` is taken before the read, as CR-008's `sourceElement` is. `setProperty` doesn't change.

### 4.10 Prototype (2026-11-06)

That sketch, in a scratch copy of 3.12.0's factory, against objects 0.7.0. Nothing here is in this repository's code.

**Word's shapes, through objects' `unmarshalString`.** The control reports nothing. Each of the 13 reports once, with the right
property and class, and `node` and `keptNode` distinct siblings. The option needs no facade change: `recordingOptions` passes it
through.

| Given twice | Property / class | `node` holds elements | Word differs |
|---|---|---|---|
| `w:body` | `body` / `Document` | Yes | Yes |
| `w:sdtContent` | `sdtContent` / `SdtBlock` | Yes | Yes |
| `w:txbxContent` | `txbxContent` / `CTTextbox` | Yes | Yes |
| `w:pPr`, different properties | `pPr` / `P` | Yes | Yes |
| `w:rPr`, different properties | `rPr` / `R` | Yes | Yes |
| `w:pPr`, the same property | `pPr` / `P` | Yes | No |
| `w:rPr`, the same property | `rPr` / `R` | Yes | No |
| `w:sectPr` | `sectPr` / `Body` | Yes | No |
| `w:tblPr` | `tblPr` / `Tbl` | Yes | No |
| `w:jc` | `jc` / `PPr` | No | No |
| `w:b`, on then off, off then on | `b` / `RPr` | No | No |
| `w:sz` | `sz` / `RPr` | No | No |

**A join in the callback.** `keptValue` is stored by reference, so a caller's edit stands (R3). With
`kept.content = lost.content.concat(kept.content)`, two `w:body` marshal as one holding `A` then `B`, and three as `A`, `B`, `C`.

**A throw.** `w:body (line 5): refused`, section 4.6's file.

**Corpus.** The 436 `.xml` and `.vml` files under objects' `test/fixtures`, read as UTF-8: 426 read and 10 refused, as many as on
3.12.0, and 0 reports. That isn't objects' fidelity run, which section 8 asks for.

**This suite.** On a scratch copy, 3,531 of 3,534 pass with the sketch and the same 3,531 without it. The other 3 are
`NoUndeclaredAssignments`, which can't find the other copies from there.

**Cost.** One process per run, the median of 25 reads of 8,000 runs through objects' model, six runs each. Reads in ms:

| | Median of the six | Range |
|---|---|---|
| 3.12.0, unset | 114.5 | 108.5 to 115.5 |
| Sketch, unset | 111.1 | 108.9 to 114.5 |
| Sketch, set | 115.6 | 113.7 to 130.6 |

The ranges overlap. Unset shows nothing. Set sits about 1 ms above 3.12.0's median, which these runs can't tell from noise.

## 5. Decisions for Jason

- **R1. A new callback, or `onUnexpectedElement`?** I recommend the new one.
  - The element isn't unexpected. It is declared, it was read, and what goes is the earlier value.
  - core-ts files each `onUnexpectedElement` as a `skippedElement` and its gate refuses on them, and objects' fidelity classifies
    them. Reports here would reach both with no opt-in, so a repeated `w:jc`, which Word reads the same way, would start
    refusing saves in a package that changed nothing. CLAUDE.md's contract row says why that matters: "changing them is a
    change to what two repositories' tests can prove".
  - Its `(name, node, classInfo)` has no room for the second element or the values.

  The cost is one more option to pass. objects needs no facade change, and core-ts adds a line where it sets the other three
  (`XmlPart.mts:449`).

- **R2. Every overwrite, or only a container's?** (a) Every overwrite, or (b) only where the lost element held child elements.
  I recommend (a).
  - Which repeats matter is a Word rule, and the runtime holds none: CR-010 scopes the same kind of policy to the facade.
  - (b) would hide a lost property value from a caller who wants it, and "holds child elements" also reports 4 shapes where
    Word and the tree agree, so it doesn't make the list the one a caller wants anyway.
  - With (a), a caller filters in one line (section 4.4). The noise is nil in practice: no file in either corpus has the shape.

- **R3. Should the callback choose the value?** (a) No: the return value is ignored, or (b) a value it returns is stored in
  place of `keptValue`. I recommend (a).
  - A caller doesn't need it. Both values are live objects and `keptValue` is stored by reference, so a join is already possible
    from the callback: measured on two and three `w:body` (section 4.10). A caller doing so with `parentPointers` has to
    re-link what it moves, as `PARENT` still names the lost object.
  - A hook would add something only for a simple value, which can't be edited in place. None was among the 13, and the
    leaves among them, which are classes here, kept the later value.
  - objects' case for leaving merging out holds: Word's rules differ by element, and `w:txbxContent` joins second first with no
    known reason. A merge is a decision for the facade, or for core-ts, once someone wants it.
  - If a hook ever comes, it has to be a new option. An arrow callback like `(...) => list.push(...)` returns a number, so giving
    this return value a meaning later would break such callers.

## 6. Out of scope

- **Merging or joining.** Section 5, R3. Nothing here says what a repeated element should read as.
- **A repeated key in a map.** The later entry replaces the earlier, unreported. It is the same loss in a different place, but
  `ElementMapPropertyInfo` merges keys in its own `setProperty`, and objects' mappings have no maps.
- **A single-valued mixed property.** Text and elements overwrite each other, unreported, and so do two elements. A text node
  isn't an element, so the callback's arguments don't fit it, and objects' mappings have none. One thing to know: `elementRef` and
  `anyElement` are mixed unless a mapping says otherwise, so only a hand-written mapping that leaves it out would meet this.
- **`Value already set.`** Two children in one wrapper still throw, set or unset. It isn't silent, and objects has no wrappers.
- **An empty second element.** `<n>5</n><n/>` keeps 5. That is the empty simple element's own question, not an overwrite.
- **Attributes.** A repeated attribute isn't well-formed.
- **The marshal side.** A tree holds one value.
- **What core-ts's gate or objects do with a report.** Each decides on its side.

## 7. If declined

The loss stays silent, and core-ts's section 2.6 stands. A caller who wants it can compare a source element's children with the
object in `onElement`, or scan in a DOM pass. Either has to work out which properties are single-valued from the class infos,
which the runtime has to hand at the moment of the overwrite. Since no file in either corpus has the shape, declining costs
nothing today.

## 8. Implementation and tests (once R1 to R3 are decided)

- **Code.** Edit `nodejs/scripts/jsonix-factory.js` first. Then mirror it into
  `scripts/src/main/javascript/org/hisrc/jsonix/Jsonix/Model/ClassInfo.js` and `dist/Jsonix-all.js`. Check that the three copies
  agree with the vm-sandbox recipe.
- **Typings and contract.** Section 4.8. Add a use to `tests/typescript/usage.ts`.
- **Tests.** Add `tests/overwrittenelements.js`, on a hand-written mapping, registered in `tests/tests.js`. It covers:
  - each row of section 3's table, set and unset, with the same tree in both;
  - both nodes and both values, three elements in a row, and different element names in a choice;
  - a substitution group, and a property declared on a base type read through a derived class and through `xsi:type`;
  - `onElement`, the `onUnexpected*` callbacks and `parentPointers`, in section 4.6's order;
  - a throw from the callback, located, and a join in the callback, which marshals as one element;
  - the return value ignored;
  - the Simplified style.
- **Cost.** Measure against 3.12.0, unset and set, one configuration per process.
- **Downstream check.** Before release, as for CR-015: objects runs its fidelity corpus and full suite, and core-ts its survey,
  each with the callback unset and set. Unset, nothing moves. Set, every part reports nothing, since no file holds the shape,
  so a report is either a shape the count missed or a bug here. Each also runs section 4.10's 13 shapes, for the
  reports a caller of theirs would get.
- **Version.** Release as 3.13.0, a minor version: one new option, and nothing changes for a caller who doesn't set it.
