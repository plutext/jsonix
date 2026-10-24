Jsonix.Model.ClassInfo = Jsonix
		.Class(Jsonix.Model.TypeInfo, Jsonix.Mapping.Styled, {
			name : null,
			localName : null,
			typeName : null,
			instanceFactory : null,
			properties : null,
			propertiesMap : null,
			structure : null,
			targetNamespace : '',
			defaultElementNamespaceURI : '',
			defaultAttributeNamespaceURI : '',
			built : false,
			initialize : function(mapping, options) {
				Jsonix.Model.TypeInfo.prototype.initialize.apply(this, []);
				Jsonix.Mapping.Styled.prototype.initialize.apply(this, [options]);
				Jsonix.Util.Ensure.ensureObject(mapping);
				var n = mapping.name||mapping.n||undefined;
				Jsonix.Util.Ensure.ensureString(n);
				this.name = n;
				
				var ln = mapping.localName||mapping.ln||null;
				this.localName = ln;

				var dens = mapping.defaultElementNamespaceURI||mapping.dens||mapping.targetNamespace||mapping.tns||'';
				this.defaultElementNamespaceURI = dens;
				
				var tns =  mapping.targetNamespace||mapping.tns||mapping.defaultElementNamespaceURI||mapping.dens||this.defaultElementNamespaceURI;
				this.targetNamespace = tns;

				var dans = mapping.defaultAttributeNamespaceURI||mapping.dans||'';
				this.defaultAttributeNamespaceURI = dans;
				
				var bti = mapping.baseTypeInfo||mapping.bti||null;
				this.baseTypeInfo = bti;
				
				var inF = mapping.instanceFactory||mapping.inF||undefined;
				if (Jsonix.Util.Type.exists(inF)) {
					// TODO: should we support instanceFactory as functions?
					// For the pure JSON configuration?
					Jsonix.Util.Ensure.ensureFunction(inF);
					this.instanceFactory = inF;
				}
				
				var tn = mapping.typeName||mapping.tn||undefined;
				
				if (Jsonix.Util.Type.exists(tn))
				{
					if (Jsonix.Util.Type.isString(tn))
					{
						this.typeName = new Jsonix.XML.QName(this.targetNamespace, tn);
					}
					else {
						this.typeName = Jsonix.XML.QName.fromObject(tn);
					}
				}
				else if (Jsonix.Util.Type.exists(ln))
				{
					this.typeName = new Jsonix.XML.QName(tns, ln);
				}
				
				this.properties = [];
				this.propertiesMap = {};
				var ps = mapping.propertyInfos||mapping.ps||[];
				Jsonix.Util.Ensure.ensureArray(ps);
				for ( var index = 0; index < ps.length; index++) {
					this.p(ps[index]);
				}				
			},
			getPropertyInfoByName : function(name) {
				return this.propertiesMap[name];
			},
			// Obsolete
			destroy : function() {
			},
			build : function(context) {
				if (!this.built) {
					this.baseTypeInfo = context.resolveTypeInfo(this.baseTypeInfo, this.module);
					if (Jsonix.Util.Type.exists(this.baseTypeInfo)) {
						this.baseTypeInfo.build(context);
					}

					// Build properties in this context
					for ( var index = 0; index < this.properties.length; index++) {
						var propertyInfo = this.properties[index];
						propertyInfo.build(context, this.module);
					}

					// Build the structure
					var structure = {
						elements : null,
						attributes : {},
						anyAttribute : null,
						value : null,
						any : null
					};
					this.buildStructure(context, structure);
					this.structure = structure;
				}
			},
			buildStructure : function(context, structure) {
				if (Jsonix.Util.Type.exists(this.baseTypeInfo)) {
					this.baseTypeInfo.buildStructure(context, structure);
				}
				for ( var index = 0; index < this.properties.length; index++) {
					var propertyInfo = this.properties[index];
					propertyInfo.buildStructure(context, structure);
				}
			},
			unmarshal : function(context, input) {
				this.build(context);
				var result;
				
				if (this.instanceFactory) {
					result = new this.instanceFactory();
				}
				else
				{
					result = { TYPE_NAME : this.name }; 
				}
				
				// Parent pointers (jsonix-CR-002): the nearest enclosing typed object is the top of the per-run stack.
				var parentStack = null;
				if (context.parentPointers) {
					parentStack = input.parentStack || (input.parentStack = []);
					if (parentStack.length > 0) {
						Jsonix.Util.setParent(result, parentStack[parentStack.length - 1]);
					}
					parentStack.push(result);
				}
				if (input.eventType !== 1) {
					throw new Error("Parser must be on START_ELEMENT to read a class info.");
				}
				// jsonix-CR-008: the element this object is read from, taken before its content moves the input on.
				var sourceElement = input.node;

				// Read attributes
				if (Jsonix.Util.Type.exists(this.structure.attributes)) {
					var attributeCount = input.getAttributeCount();
					if (attributeCount !== 0) {
						for ( var index = 0; index < attributeCount; index++) {
							var attributeNameKey = input
									.getAttributeNameKey(index);
							// jsonix-CR-006: an attribute the class info does not expect is dropped unless an anyAttribute wildcard keeps it.
							// Namespace declarations and (with supportXsiType) xsi:type are not dropped content and are not reported.
							if (context.onUnexpectedAttribute && !Jsonix.Util.Type.exists(this.structure.attributes[attributeNameKey]) && !Jsonix.Util.Type.exists(this.structure.anyAttribute)) {
								var unexpectedAttributeName = input.getAttributeName(index);
								if (unexpectedAttributeName.namespaceURI !== Jsonix.XML.XMLNS_NS && !(context.supportXsiType && unexpectedAttributeName.namespaceURI === Jsonix.Schema.XSI.NAMESPACE_URI && unexpectedAttributeName.localPart === Jsonix.Schema.XSI.TYPE)) {
									context.onUnexpectedAttribute(unexpectedAttributeName, input.node, this);
								}
							}
							if (Jsonix.Util.Type
									.exists(this.structure.attributes[attributeNameKey])) {
								var attributeValue = input
										.getAttributeValue(index);
								if (Jsonix.Util.Type.isString(attributeValue)) {
									var attributePropertyInfo = this.structure.attributes[attributeNameKey];
									this.unmarshalPropertyValue(context, input,
											attributePropertyInfo, result,
											attributeValue);
								}
							}
						}
					}
				}
				// Read any attribute
				if (Jsonix.Util.Type.exists(this.structure.anyAttribute)) {
					var propertyInfo = this.structure.anyAttribute;
					this
							.unmarshalProperty(context, input, propertyInfo,
									result);
				}
				// Read elements
				if (Jsonix.Util.Type.exists(this.structure.elements)) {

					var et = input.next();
					while (et !== Jsonix.XML.Input.END_ELEMENT) {
						if (et === Jsonix.XML.Input.START_ELEMENT) {
							// New sub-element starts
							var elementNameKey = input.getNameKey();
							if (Jsonix.Util.Type
									.exists(this.structure.elements[elementNameKey])) {
								var elementPropertyInfo = this.structure.elements[elementNameKey];
								this.unmarshalProperty(context, input,
										elementPropertyInfo, result);
							} else if (Jsonix.Util.Type
									.exists(this.structure.any)) {
								// TODO Refactor

								var anyPropertyInfo = this.structure.any;
								this.unmarshalProperty(context, input,
										anyPropertyInfo, result);
							} else {
								// jsonix-CR-006: the element is dropped (a class with an any wildcard never reaches this branch); report it if asked.
								if (context.onUnexpectedElement) {
									context.onUnexpectedElement(input.getName(), input.node, this);
								}
								et = input.skipElement();
							}
						} else if ((et === Jsonix.XML.Input.CHARACTERS || et === Jsonix.XML.Input.CDATA || et === Jsonix.XML.Input.ENTITY_REFERENCE)) {
							if (Jsonix.Util.Type.exists(this.structure.mixed))
							{
								// Characters and structure has a mixed property
								var mixedPropertyInfo = this.structure.mixed;
								this.unmarshalProperty(context, input,
										mixedPropertyInfo, result);
							}
						} else if (et === Jsonix.XML.Input.SPACE || et === Jsonix.XML.Input.COMMENT	|| et === Jsonix.XML.Input.PROCESSING_INSTRUCTION) {
							// Ignore
						} else {
							throw new Error("Illegal state: unexpected event type [" + et	+ "].");
						}
						et = input.next();
					}
				} else if (Jsonix.Util.Type.exists(this.structure.value)) {
					var valuePropertyInfo = this.structure.value;
					this.unmarshalProperty(context, input, valuePropertyInfo,
							result);
				} else {
					// Just skip everything
					input.nextTag();
				}
				if (input.eventType !== 2) {
					throw new Error("Illegal state: must be END_ELEMENT.");
				}
				if (parentStack) {
					parentStack.pop();
				}
				// jsonix-CR-008: report the complete object with the element it was read from: once per element (an
				// xsi:type element as its derived type), children before their parent; simple values and wildcard DOM never.
				if (context.onElement) {
					context.onElement(sourceElement, result);
				}
				return result;
			},
			unmarshalProperty: function (context, input, propertyInfo, result) {
				try {
					var propertyValue = propertyInfo.unmarshal(context, input, this);
					propertyInfo.setProperty(result, propertyValue);
				} catch (e) {
					throw Jsonix.Model.ClassInfo.locateError(e, input, null);
				}
			},
			unmarshalPropertyValue: function (context, input, propertyInfo, result, value) {
				try {
					var propertyValue;
					try {
						propertyValue = propertyInfo.unmarshalValue(value, context, input, this);
					} catch (invalidValueError) {
						// jsonix-CR-010: an attribute value its type refuses goes to the caller, who returns the value to store,
						// undefined (or null) to leave the property unset, or throws; unset, the error aborts the unmarshal as before.
						if (!context.onInvalidValue) {
							throw invalidValueError;
						}
						propertyValue = context.onInvalidValue(value, propertyInfo, this, input.node, invalidValueError);
					}
					propertyInfo.setProperty(result, propertyValue);
				} catch (e) {
					throw Jsonix.Model.ClassInfo.locateError(e, input, propertyInfo.attributeName || null);
				}
			},
			marshal : function(value, context, output, scope) {
				if (this.isMarshallable(value, context, scope))
				{
					// jsonix-CR-006: report the element just opened for this value, once (a derived type's marshal calls the base type's marshal on the same element).
					if (context.onElement) {
						var openedElement = output.peek();
						if (openedElement !== output.reportedElement) {
							output.reportedElement = openedElement;
							context.onElement(openedElement, value);
						}
					}
					// TODO This must be reworked
					if (Jsonix.Util.Type.exists(this.baseTypeInfo)) {
						this.baseTypeInfo.marshal(value, context, output);
					}
					for ( var index = 0; index < this.properties.length; index++) {
						var propertyInfo = this.properties[index];
						var propertyValue = value[propertyInfo.name];
						if (Jsonix.Util.Type.exists(propertyValue)) {
							propertyInfo.marshal(propertyValue, context, output, this, value);
						}
					}
				}
				else
				{
					// Otherwise if there is just one property, use this property to marshal
					if (this.structure.value)
					{
						var valuePropertyInfo = this.structure.value;
						valuePropertyInfo.marshal(value, context, output, this);
					}
					else if (this.properties.length === 1)
					{
						var singlePropertyInfo = this.properties[0];
						singlePropertyInfo.marshal(value, context, output, this);
					}
					else
					{
						// TODO throw an error
						throw new Error("The passed value [" + value + "] is not an object and there is no single suitable property to marshal it.");
					}
				}
			},
			// Checks if the value is marshallable
			isMarshallable : function(value, context, scope) {
				return this.isInstance(value, context, scope) || (Jsonix.Util.Type.isObject(value) && !Jsonix.Util.Type.isArray(value));
			},
			isInstance : function(value, context, scope) {
				if (this.instanceFactory) {
					return value instanceof this.instanceFactory;
				}
				else {
					return Jsonix.Util.Type.isObject(value) && Jsonix.Util.Type.isString(value.TYPE_NAME) && value.TYPE_NAME === this.name;
				}
			},

			// Obsolete, left for backwards compatibility
			b : function(baseTypeInfo) {
				Jsonix.Util.Ensure.ensureObject(baseTypeInfo);
				this.baseTypeInfo = baseTypeInfo;
				return this;
			},
			// Obsolete, left for backwards compatibility
			ps : function() {
				return this;
			},
			p : function(mapping) {
				Jsonix.Util.Ensure.ensureObject(mapping);
				// If mapping is an instance of the property class
				if (mapping instanceof Jsonix.Model.PropertyInfo) {
					this.addProperty(mapping);
				}
				// Else create it via generic mapping configuration
				else {
					mapping = Jsonix.Util.Type.cloneObject(mapping);
					var type = mapping.type||mapping.t||'element';
					// Locate the creator function
					if (Jsonix.Util.Type
							.isFunction(this.propertyInfoCreators[type])) {
						var propertyInfoCreator = this.propertyInfoCreators[type];
						// Call the creator function
						propertyInfoCreator.call(this, mapping);
					} else {
						throw new Error("Unknown property info type [" + type + "].");
					}
				}
			},
			aa : function(mapping) {
				this.addDefaultNamespaces(mapping);
				return this
						.addProperty(new this.mappingStyle.anyAttributePropertyInfo(
								mapping, {
									mappingStyle : this.mappingStyle
								}));
			},
			ae : function(mapping) {
				this.addDefaultNamespaces(mapping);
				return this
						.addProperty(new this.mappingStyle.anyElementPropertyInfo(
								mapping, {
									mappingStyle : this.mappingStyle
								}));
			},
			a : function(mapping) {
				this.addDefaultNamespaces(mapping);
				return this.addProperty(new this.mappingStyle.attributePropertyInfo(
						mapping, {
							mappingStyle : this.mappingStyle
						}));
			},
			em : function(mapping) {
				this.addDefaultNamespaces(mapping);
				return this
						.addProperty(new this.mappingStyle.elementMapPropertyInfo(
								mapping, {
									mappingStyle : this.mappingStyle
								}));
			},
			e : function(mapping) {
				this.addDefaultNamespaces(mapping);
				return this.addProperty(new this.mappingStyle.elementPropertyInfo(
						mapping, {
							mappingStyle : this.mappingStyle
						}));
			},
			es : function(mapping) {
				this.addDefaultNamespaces(mapping);
				return this.addProperty(new this.mappingStyle.elementsPropertyInfo(
						mapping, {
							mappingStyle : this.mappingStyle
						}));
			},
			er : function(mapping) {
				this.addDefaultNamespaces(mapping);
				return this
						.addProperty(new this.mappingStyle.elementRefPropertyInfo(
								mapping, {
									mappingStyle : this.mappingStyle
								}));
			},
			ers : function(mapping) {
				this.addDefaultNamespaces(mapping);
				return this
						.addProperty(new this.mappingStyle.elementRefsPropertyInfo(
								mapping, {
									mappingStyle : this.mappingStyle
								}));
			},
			v : function(mapping) {
				this.addDefaultNamespaces(mapping);
				return this.addProperty(new this.mappingStyle.valuePropertyInfo(
						mapping, {
							mappingStyle : this.mappingStyle
						}));
			},
			addDefaultNamespaces : function(mapping) {
				if (Jsonix.Util.Type.isObject(mapping)) {
					if (!Jsonix.Util.Type
							.isString(mapping.defaultElementNamespaceURI)) {
						mapping.defaultElementNamespaceURI = this.defaultElementNamespaceURI;
					}
					if (!Jsonix.Util.Type
							.isString(mapping.defaultAttributeNamespaceURI)) {
						mapping.defaultAttributeNamespaceURI = this.defaultAttributeNamespaceURI;
					}
				}
			},
			addProperty : function(property) {
				this.properties.push(property);
				this.propertiesMap[property.name] = property;
				return this;
			},
			CLASS_NAME : 'Jsonix.Model.ClassInfo'
		});
Jsonix.Model.ClassInfo.prototype.propertyInfoCreators = {
	"aa" : Jsonix.Model.ClassInfo.prototype.aa,
	"anyAttribute" : Jsonix.Model.ClassInfo.prototype.aa,
	"ae" : Jsonix.Model.ClassInfo.prototype.ae,
	"anyElement" : Jsonix.Model.ClassInfo.prototype.ae,
	"a" : Jsonix.Model.ClassInfo.prototype.a,
	"attribute" : Jsonix.Model.ClassInfo.prototype.a,
	"em" : Jsonix.Model.ClassInfo.prototype.em,
	"elementMap" : Jsonix.Model.ClassInfo.prototype.em,
	"e" : Jsonix.Model.ClassInfo.prototype.e,
	"element" : Jsonix.Model.ClassInfo.prototype.e,
	"es" : Jsonix.Model.ClassInfo.prototype.es,
	"elements" : Jsonix.Model.ClassInfo.prototype.es,
	"er" : Jsonix.Model.ClassInfo.prototype.er,
	"elementRef" : Jsonix.Model.ClassInfo.prototype.er,
	"ers" : Jsonix.Model.ClassInfo.prototype.ers,
	"elementRefs" : Jsonix.Model.ClassInfo.prototype.ers,
	"v" : Jsonix.Model.ClassInfo.prototype.v,
	"value" : Jsonix.Model.ClassInfo.prototype.v
};
// jsonix-CR-006 section 3.4: an error raised while reading a property is rethrown with the element (and attribute) it
// was reading and, where the parser supplies one, the line; errors already located pass through unchanged.
Jsonix.Model.ClassInfo.locateError = function (error, input, attributeName) {
	if (!error || error.jsonixLocated || typeof error.message !== 'string') {
		return error;
	}
	var node = input ? input.node : null;
	var where = (node && node.nodeName) ? node.nodeName : '?';
	if (attributeName) {
		// Prefer the prefix a reader would see: the QName's own, else the one the element resolves for that namespace.
		var attributePrefix = attributeName.prefix;
		if (!attributePrefix && attributeName.namespaceURI && node && typeof node.lookupPrefix === 'function') {
			attributePrefix = node.lookupPrefix(attributeName.namespaceURI);
		}
		where += '/@' + (attributePrefix ? attributePrefix + ':' : '') + attributeName.localPart;
	}
	if (node && typeof node.lineNumber === 'number') {
		where += ' (line ' + node.lineNumber + ')';
	}
	var located = new Error(where + ': ' + error.message);
	located.jsonixLocated = true;
	located.cause = error;
	located.node = node;
	located.attributeName = attributeName || null;
	return located;
};
