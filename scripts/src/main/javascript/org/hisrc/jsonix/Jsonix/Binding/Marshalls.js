Jsonix.Binding.Marshalls = {
};

Jsonix.Binding.Marshalls.Element = Jsonix.Class({
	marshalElement : function(value, context, output, scope) {
		var elementValue = this.convertToTypedNamedValue(value, context, output, scope);
		var declaredTypeInfo = elementValue.typeInfo;
		var actualTypeInfo = undefined;
		if (context.supportXsiType && Jsonix.Util.Type.exists(elementValue.value))
		{
			var typeInfoByValue = context.getTypeInfoByValue(elementValue.value);
			if (typeInfoByValue && typeInfoByValue.typeName)
			{
				actualTypeInfo = typeInfoByValue;
			}
		}
		var typeInfo = actualTypeInfo || declaredTypeInfo;
		if (typeInfo) {
			// jsonix-CR-011: the caller may leave out an element written from a property (scope is its owning class
			// info; the root, marshalled with no scope, is never offered): no start element, no content, no onElement.
			if (context.omitElement && Jsonix.Util.Type.exists(scope) && context.omitElement(elementValue.value, elementValue.name, typeInfo, this, scope) === true) {
				return;
			}
			output.writeStartElement(elementValue.name);
			if (actualTypeInfo && declaredTypeInfo !== actualTypeInfo) {
				var xsiTypeName = actualTypeInfo.typeName;
				var xsiType = Jsonix.Schema.XSD.QName.INSTANCE.print(xsiTypeName, context, output, scope);
				output.writeAttribute(Jsonix.Schema.XSI.TYPE_QNAME, xsiType);
			}
			if (Jsonix.Util.Type.exists(elementValue.value)) {
				typeInfo.marshal(elementValue.value, context, output, scope);
			}
			output.writeEndElement();
		} else {
			throw new Error("Element [" + elementValue.name.key + "] is not known in this context, could not determine its type.");
		}
	},
	getTypeInfoByElementName : function(name, context, scope) {
		var elementInfo = context.getElementInfo(name, scope);
		if (Jsonix.Util.Type.exists(elementInfo)) {
			return elementInfo.typeInfo;
		} else {
			return undefined;
		}
	}
});
Jsonix.Binding.Marshalls.Element.AsElementRef = Jsonix.Class({
	convertToTypedNamedValue : function(value, context, output, scope) {
		Jsonix.Util.Ensure.ensureObject(value);
		var elementValue = this.convertToNamedValue(value, context, output, scope);
		return {
			name : elementValue.name,
			value : elementValue.value,
			typeInfo : this.getTypeInfoByElementName(elementValue.name, context, scope)
		};
	},
	convertToNamedValue : function(elementValue, context, output, scope) {
		var name;
		var value;
		if (Jsonix.Util.Type.exists(elementValue.name) && !Jsonix.Util.Type.isUndefined(elementValue.value)) {
			name = Jsonix.XML.QName.fromObjectOrString(elementValue.name, context);
			value = Jsonix.Util.Type.exists(elementValue.value) ? elementValue.value : null;
			return {
				name : name,
				value : value
			};
		} else {
			for ( var propertyName in elementValue) {
				if (elementValue.hasOwnProperty(propertyName)) {
					name = Jsonix.XML.QName.fromObjectOrString(propertyName, context);
					value = elementValue[propertyName];
					return {
						name : name,
						value : value
					};
				}
			}
		}
		throw new Error("Invalid element value [" + elementValue + "]. Element values must either have {name:'myElementName', value: elementValue} or {myElementName:elementValue} structure.");
	}
});
