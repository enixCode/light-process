export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  default?: unknown;
  description?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface IOSchema extends JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchema>;
}

export const Schema = {
  string: (opts: Partial<JSONSchema> = {}): JSONSchema => ({ type: 'string', ...opts }),
  number: (opts: Partial<JSONSchema> = {}): JSONSchema => ({ type: 'number', ...opts }),
  integer: (opts: Partial<JSONSchema> = {}): JSONSchema => ({ type: 'integer', ...opts }),
  boolean: (opts: Partial<JSONSchema> = {}): JSONSchema => ({ type: 'boolean', ...opts }),
  array: (items: JSONSchema, opts: Partial<JSONSchema> = {}): JSONSchema => ({ type: 'array', items, ...opts }),
  object: (properties: Record<string, JSONSchema>, required?: string[]): IOSchema => ({
    type: 'object',
    properties,
    required,
  }),
};

import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

const ajv = new (Ajv as any)({ allErrors: true, strict: false });
const validatorCache = new WeakMap<JSONSchema, ValidateFunction>();

function getValidator(schema: JSONSchema): ValidateFunction {
  const cached = validatorCache.get(schema);
  if (cached) return cached;
  const validate = ajv.compile(schema) as ValidateFunction;
  validatorCache.set(schema, validate);
  return validate;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Returns { valid: true } if schema is null (skip validation) */
export function validate(data: unknown, schema: IOSchema | null, label: string = 'value'): ValidationResult {
  if (!schema) return { valid: true, errors: [] };

  if (data === undefined) {
    if (schema.default !== undefined) return { valid: true, errors: [] };
    return { valid: false, errors: [`${label}: value is required`] };
  }

  const validator = getValidator(schema);
  const valid = validator(data);
  if (valid) return { valid: true, errors: [] };

  const errors = (validator.errors || []).map((e: ErrorObject) => {
    const loc = e.instancePath ? `${label}${e.instancePath.replace(/\//g, '.')}` : label;
    return `${loc}: ${e.message}`;
  });
  return { valid: false, errors };
}

export function validateInput(data: unknown, schema: IOSchema | null): ValidationResult {
  return validate(data, schema, 'input');
}

export function validateOutput(data: unknown, schema: IOSchema | null): ValidationResult {
  return validate(data, schema, 'output');
}
