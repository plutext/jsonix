Jsonix.Schema.XSD.Boolean = Jsonix.Class(Jsonix.Schema.XSD.AnySimpleType, {
	name : 'Boolean',
	typeName : Jsonix.Schema.XSD.qname('boolean'),
	print : function(value, context, output, scope) {
		Jsonix.Util.Ensure.ensureBoolean(value);
		return value ? 'true' : 'false';
	},
	parse : function(text, context, input, scope) {
		Jsonix.Util.Ensure.ensureString(text);
		// xsd:boolean admits true, 1, false and 0. ECMA-376 Transitional's ST_OnOff (Part 4, 17.18.74, and the
		// 1st edition's) also admits on and off, which Office reads and third-party writers (pandoc) produce;
		// docx4j's schemas type it xsd:boolean, so they are accepted here and always printed as true/false
		// (jsonix-CR-007).
		// The comparison is exact on purpose: no whiteSpace collapse (XSD gives xs:boolean whiteSpace="collapse",
		// so a conforming parser reads " false" as false) and no case folding. Word reads " false", "FALSE" and every
		// other spelling as on, and an onInvalidValue caller (jsonix-CR-010 section 13; objects CR-013) reaches that
		// reading only because this parse refuses them. Collapsing or folding here would change it silently.
		if (text === 'true' || text === '1' || text === 'on') {
			return true;
		} else if (text === 'false' || text === '0' || text === 'off') {
			return false;
		} else {
			throw new Error("Either [true], [1], [on], [false], [0] or [off] expected as boolean value.");
		}
	},
	isInstance : function(value, context, scope) {
		return Jsonix.Util.Type.isBoolean(value);
	},
	CLASS_NAME : 'Jsonix.Schema.XSD.Boolean'
});
Jsonix.Schema.XSD.Boolean.INSTANCE = new Jsonix.Schema.XSD.Boolean();
Jsonix.Schema.XSD.Boolean.INSTANCE.LIST = new Jsonix.Schema.XSD.List(Jsonix.Schema.XSD.Boolean.INSTANCE);