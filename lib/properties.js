'use strict';

var reduce = require('lodash/collection/reduce'),
    assign = require('lodash/object/assign'),
    mathjs = require('mathjs');

var Types = require('./types'),
    Base = require('./base');


/**
 * A utility that gets and sets properties of model elements.
 *
 * @param {Model} model
 */
function Properties(model) {
  this.model = model;
}

module.exports = Properties;


/**
 * Sets a named property on the target element.
 * If the value is undefined, the property gets deleted.
 *
 * @param {Object} target
 * @param {String} name
 * @param {Object} value
 */
Properties.prototype.set = function(target, name, value) {

  var property = this.model.getPropertyDescriptor(target, name);

  var propertyName = property && property.name;

  if (isUndefined(value)) {
    // unset the property, if the specified value is undefined;
    // delete from $attrs (for extensions) or the target itself
    if (property) {
      delete target[propertyName];
    } else {
      delete target.$attrs[name];
    }
  } else {
    // set the property, defining well defined properties on the fly
    // or simply updating them in target.$attrs (for extensions)
    if (property) {
      if (!this.checkValue(property, value)) {
        throw new Error(
          'Value \'' + value + '\' is/are not of type <' + property.type + '>'
        );
      }
      if (!this.constrainValue(property, value)) {
        throw new Error(
          value + ' did not met constraints of property <' + property.name + '>'
        );
      }
      if (propertyName in target) {
        target[propertyName] = value;
      } else {
        defineProperty(target, property, value);
      }
    } else {
      target.$attrs[name] = value;
    }
  }
};

/**
 * Returns the named property of the given element
 *
 * @param  {Object} target
 * @param  {String} name
 *
 * @return {Object}
 */
Properties.prototype.get = function(target, name) {

  var property = this.model.getPropertyDescriptor(target, name);

  if (!property) {
    return target.$attrs[name];
  }

  var propertyName = property.name;

  // check if access to collection property and lazily initialize it
  if (!target[propertyName] && property.isMany) {
    defineProperty(target, property, []);
  }

  return target[propertyName];
};


/**
 * Define a property on the target element
 *
 * @param  {Object} target
 * @param  {String} name
 * @param  {Object} options
 */
Properties.prototype.define = function(target, name, options) {
  Object.defineProperty(target, name, options);
};


/**
 * Define the descriptor for an element
 */
Properties.prototype.defineDescriptor = function(target, descriptor) {
  this.define(target, '$descriptor', { value: descriptor });
};

/**
 * Define the model for an element
 */
Properties.prototype.defineModel = function(target, model) {
  this.define(target, '$model', { value: model });
};

Properties.prototype.checkValue = function(property, value) {
  if (property.isMany) {
    var p = assign({}, property, { isMany: false });
    return reduce(value, function(result, v) {
      return result && this.checkValue(p, v);
    }, true, this);
  }

  if (Types.isBuiltIn(property.type)) {
    return Types.checkBuiltInType(property.type, value);
  }

  if (property.type in this.model.registry.typeMap) {
    return value instanceof Base && this.model.getType(value.$type).hasType(property.type);
  } else { // property.type in this.model.registry.enumerationMap
    var enumeration = this.model.registry.enumerationMap[property.type];
    return value in enumeration.literalValuesByName;
  }
};

Properties.prototype.constrainValue = function(property, value) {
  var constraint = property.constraint;
  if (!constraint || !Types.isBuiltIn(property.type) || property.type === 'Element') {
    return true;
  }

  if (property.isMany) {
    var p = assign({}, property, { isMany: false });
    return reduce(value, function(result, v) {
      return result && this.constrainValue(p, v);
    }, true, this);
  }

  if (constraint.enum) {
    for (var i in constraint.enum) {
      if (constraint.enum[i] === value) {
        return true;
      }
    }
    return false;
  }

  if (constraint.math) {
    return mathjs.eval(constraint.math, {
      x: value,
    });
  }

  if (constraint.regex) {
    return new RegExp(constraint.regex).test(value);
  }

  throw new Error(
    'Property <' + property.name + '> has field constraint but no constraints'
  );
};


function isUndefined(val) {
  return typeof val === 'undefined';
}

function defineProperty(target, property, value) {
  Object.defineProperty(target, property.name, {
    enumerable: !property.isReference,
    writable: true,
    value: value,
    configurable: true
  });
}