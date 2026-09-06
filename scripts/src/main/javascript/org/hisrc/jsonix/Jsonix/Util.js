Jsonix.Util = {};

Jsonix.Util.extend = function(destination, source) {
	destination = destination || {};
	if (source) {
		/*jslint forin: true */
		for ( var property in source) {
			var value = source[property];
			if (value !== undefined) {
				destination[property] = value;
			}
		}

		/**
		 * IE doesn't include the toString property when iterating over an
		 * object's properties with the for(property in object) syntax.
		 * Explicitly check if the source has its own toString property.
		 */

		/*
		 * FF/Windows < 2.0.0.13 reports "Illegal operation on WrappedNative
		 * prototype object" when calling hawOwnProperty if the source object is
		 * an instance of window.Event.
		 */

		// REWORK
		// Node.js
		sourceIsEvt = typeof window !== 'undefined' && window !== null && typeof window.Event === "function" && source instanceof window.Event;

		if (!sourceIsEvt && source.hasOwnProperty && source.hasOwnProperty('toString')) {
			destination.toString = source.toString;
		}
	}
	return destination;
};
/**
 * Parent pointers (jsonix-CR-002). Defines a non-enumerable, writable PARENT on an object; no-op for non-objects.
 */
Jsonix.Util.setParent = function (value, parent) {
	if (value !== null && typeof value === 'object') {
		Object.defineProperty(value, 'PARENT', {
			value: parent,
			enumerable: false,
			writable: true,
			configurable: true
		});
	}
};
/**
 * Deep copy (jsonix-CR-002). Primitives are shared; QNames, calendars, dates and DOM nodes are cloned; arrays and
 * plain objects (element wrappers, durations, maps, typed objects with TYPE_NAME, instanceFactory instances) are
 * copied recursively, own enumerable properties only. An object referenced twice is copied once. PARENT pointers
 * inside the copy are re-linked to the copied parents (by topology, not by shape); the copy's own PARENT is the
 * parent argument if given, otherwise unset.
 */
Jsonix.Util.deepCopy = function (value, parent) {
	var map = (typeof Map === 'function') ? new Map() : null;
	var originals = [];
	var copies = [];
	var lookup = function (original) {
		if (map) {
			return map.get(original);
		}
		var index = originals.indexOf(original);
		return index >= 0 ? copies[index] : undefined;
	};
	var remember = function (original, copy) {
		if (map) {
			map.set(original, copy);
		} else {
			originals.push(original);
			copies.push(copy);
		}
	};
	var parented = [];
	var hasOwn = Object.prototype.hasOwnProperty;
	var copyValue = function (original) {
		if (original === null || typeof original !== 'object') {
			return original;
		}
		var existing = lookup(original);
		if (typeof existing !== 'undefined') {
			return existing;
		}
		var copy;
		if (Jsonix.Util.Type.isNode(original)) {
			copy = original.cloneNode(true);
			remember(original, copy);
		} else if (Jsonix.Util.Type.isDate(original)) {
			copy = new Date(original.getTime());
			remember(original, copy);
		} else if (original instanceof Jsonix.XML.QName || original instanceof Jsonix.XML.Calendar) {
			copy = original.clone();
			remember(original, copy);
		} else if (Jsonix.Util.Type.isArray(original)) {
			copy = [];
			remember(original, copy);
			for (var index = 0; index < original.length; index++) {
				copy[index] = copyValue(original[index]);
			}
		} else {
			copy = Object.create(Object.getPrototypeOf(original));
			remember(original, copy);
			for (var property in original) {
				if (hasOwn.call(original, property)) {
					copy[property] = copyValue(original[property]);
				}
			}
		}
		if (hasOwn.call(original, 'PARENT')) {
			parented.push(original);
		}
		return copy;
	};
	var result = copyValue(value);
	// Re-link PARENT by topology: every copied object points at the copy of its original's parent.
	for (var index = 0; index < parented.length; index++) {
		var original = parented[index];
		if (original === value) {
			continue;
		}
		var parentCopy = lookup(original.PARENT);
		if (typeof parentCopy !== 'undefined') {
			Jsonix.Util.setParent(lookup(original), parentCopy);
		}
	}
	if (typeof parent !== 'undefined' && result !== null && typeof result === 'object') {
		Jsonix.Util.setParent(result, parent);
	}
	return result;
};
