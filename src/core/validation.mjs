function valueTypeMatches(type, data) {
  if (type === 'object') return typeof data === 'object' && data !== null && !Array.isArray(data);
  if (type === 'array') return Array.isArray(data);
  if (type === 'string') return typeof data === 'string';
  if (type === 'number') return typeof data === 'number' && Number.isFinite(data);
  if (type === 'integer') return Number.isInteger(data);
  if (type === 'boolean') return typeof data === 'boolean';
  return true;
}

function formatValid(format, data) {
  if (typeof data !== 'string') return true;
  if (format === 'date-time') return !Number.isNaN(Date.parse(data));
  if (format === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(data);
  if (format === 'uri') return /^(https?:\/\/|file:\/\/|git@|ssh:\/\/)/.test(data);
  return true;
}

function pushPath(pathPrefix, key) {
  return pathPrefix ? `${pathPrefix}.${key}` : key;
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let current = rootSchema;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return null;
    current = current[part];
  }
  return current || null;
}

export function validateAgainstSchema(schema, data, pathPrefix = '', rootSchema = schema) {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.$ref) {
    const resolved = resolveRef(rootSchema, schema.$ref);
    if (!resolved) {
      errors.push(`${pathPrefix || 'data'} references unsupported schema ref ${schema.$ref}`);
      return errors;
    }
    return validateAgainstSchema(resolved, data, pathPrefix, rootSchema);
  }

  if (Array.isArray(schema.anyOf)) {
    const passes = schema.anyOf.some(branch => validateAgainstSchema(branch, data, pathPrefix, rootSchema).length === 0);
    if (!passes) errors.push(`${pathPrefix || 'data'} does not match any allowed schema branch`);
    return errors;
  }

  if (Array.isArray(schema.oneOf)) {
    const passingBranches = schema.oneOf.filter(branch => validateAgainstSchema(branch, data, pathPrefix, rootSchema).length === 0);
    if (passingBranches.length !== 1) {
      errors.push(`${pathPrefix || 'data'} must match exactly one schema branch`);
    }
    return errors;
  }

  if (schema.const !== undefined && data !== schema.const) {
    errors.push(`${pathPrefix || 'data'} must equal ${JSON.stringify(schema.const)}`);
    return errors;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(data)) {
    errors.push(`${pathPrefix || 'data'} must be one of: ${schema.enum.join(', ')}`);
    return errors;
  }

  if (Array.isArray(schema.type)) {
    const matches = schema.type.some(type => valueTypeMatches(type, data));
    if (!matches) {
      errors.push(`${pathPrefix || 'data'} should be one of types: ${schema.type.join(', ')}`);
      return errors;
    }
  } else if (schema.type && !valueTypeMatches(schema.type, data)) {
    errors.push(`${pathPrefix || 'data'} should be ${schema.type}`);
    return errors;
  }

  if (schema.pattern && typeof data === 'string') {
    const re = new RegExp(schema.pattern);
    if (!re.test(data)) errors.push(`${pathPrefix || 'data'} does not match pattern ${schema.pattern}`);
  }

  if (schema.minLength !== undefined && typeof data === 'string' && data.length < schema.minLength) {
    errors.push(`${pathPrefix || 'data'} should have length >= ${schema.minLength}`);
  }

  if (schema.minimum !== undefined && typeof data === 'number' && data < schema.minimum) {
    errors.push(`${pathPrefix || 'data'} should be >= ${schema.minimum}`);
  }

  if (schema.uniqueItems && Array.isArray(data)) {
    const seen = new Set();
    for (const item of data) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        errors.push(`${pathPrefix || 'data'} must not contain duplicate items`);
        break;
      }
      seen.add(key);
    }
  }

  if (schema.format && !formatValid(schema.format, data)) {
    errors.push(`${pathPrefix || 'data'} must match format ${schema.format}`);
  }

  if (schema.type === 'object' && schema.properties) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in data)) errors.push(`${pushPath(pathPrefix, key)} is required`);
      }
    }

    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(data)) {
        if (!allowed.has(key)) errors.push(`${pushPath(pathPrefix, key)} is not allowed`);
      }
    }

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        errors.push(...validateAgainstSchema(propSchema, data[key], pushPath(pathPrefix, key), rootSchema));
      }
    }
  }

  if (schema.type === 'array' && schema.items) {
    data.forEach((item, index) => {
      errors.push(...validateAgainstSchema(schema.items, item, `${pathPrefix || 'data'}[${index}]`, rootSchema));
    });
  }

  return errors;
}
