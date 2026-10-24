Jsonix.Model.AttributePropertyInfo = Jsonix.Class(Jsonix.Model.SingleTypePropertyInfo, {
	attributeName : null,
	defaultValue : undefined,
	initialize : function(mapping) {
		Jsonix.Util.Ensure.ensureObject(mapping);
		Jsonix.Model.SingleTypePropertyInfo.prototype.initialize.apply(this, [ mapping ]);
		var an = mapping.attributeName||mapping.an||undefined;
		if (Jsonix.Util.Type.isObject(an)) {
			this.attributeName = Jsonix.XML.QName.fromObject(an);
		} else if (Jsonix.Util.Type.isString(an)) {
			this.attributeName = new Jsonix.XML.QName(this.defaultAttributeNamespaceURI, an);
		} else {
			this.attributeName = new Jsonix.XML.QName(this.defaultAttributeNamespaceURI, this.name);
		}
		// jsonix-CR-009: the schema default, kept for Context.getDefaultValue; unmarshal and marshal never read it.
		if (Jsonix.Util.Type.exists(mapping.defaultValue)) {
			this.defaultValue = mapping.defaultValue;
		} else if (Jsonix.Util.Type.exists(mapping.dv)) {
			this.defaultValue = mapping.dv;
		}
	},
	unmarshal : function(context, input, scope) {
		var attributeCount = input.getAttributeCount();
		var result = null;
		for ( var index = 0; index < attributeCount; index++) {
			var attributeNameKey = input.getAttributeNameKey(index);
			if (this.attributeName.key === attributeNameKey) {
				var attributeValue = input.getAttributeValue(index);
				if (Jsonix.Util.Type.isString(attributeValue)) {
					result = this.unmarshalValue(attributeValue, context, input, scope);
				}
			}
		}
		return result;
	},
	marshal : function(value, context, output, scope, owner) {
		if (Jsonix.Util.Type.exists(value)) {
			var text;
			var printed = false;
			try {
				text = this.print(value, context, output, scope);
				printed = true;
			} catch (unprintableValueError) {
				// jsonix-CR-010: a value its type cannot print goes to the caller, who returns the text to write,
				// undefined (or null) to omit the attribute, or throws; unset, the error propagates as before.
				if (!context.onUnprintableValue) {
					throw unprintableValueError;
				}
				text = context.onUnprintableValue(value, this, scope, unprintableValueError);
				if (!Jsonix.Util.Type.exists(text)) {
					return;
				}
				Jsonix.Util.Ensure.ensureString(text);
			}
			// jsonix-CR-011: a value that printed goes to the caller with the owning object, who returns the text to
			// write, null to omit the attribute, or undefined to keep the text; a value that did not print never comes here.
			if (printed && context.onAttributeValue) {
				var adaptedText = context.onAttributeValue(value, text, owner, this, scope);
				if (adaptedText === null) {
					return;
				}
				if (!Jsonix.Util.Type.isUndefined(adaptedText)) {
					Jsonix.Util.Ensure.ensureString(adaptedText);
					text = adaptedText;
				}
			}
			output.writeAttribute(this.attributeName, text);
		}

	},
	buildStructure : function(context, structure) {
		Jsonix.Util.Ensure.ensureObject(structure);
		Jsonix.Util.Ensure.ensureObject(structure.attributes);
		var key = this.attributeName.key;
		// if (Jsonix.Util.Type.exists(structure.attributes[key])) {
		// // TODO better exception
		// throw new Error("The structure already defines an attribute for the key
		// ["
		// + key + "].");
		// } else
		// {
		structure.attributes[key] = this;
		// }
	},
	CLASS_NAME : 'Jsonix.Model.AttributePropertyInfo'
});
