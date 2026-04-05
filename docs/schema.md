---
layout: default
title: Schema Validation
---

# Schema Validation

Nodes can define JSON Schema for input and output validation. Validation runs automatically during workflow execution.

## Schema helpers

```javascript
import { Schema } from 'light-process';

Schema.string()                  // { type: 'string' }
Schema.string({ minLength: 1 }) // { type: 'string', minLength: 1 }
Schema.number()                  // { type: 'number' }
Schema.number({ minimum: 0 })   // { type: 'number', minimum: 0 }
Schema.integer()                 // { type: 'integer' }
Schema.boolean()                 // { type: 'boolean' }
Schema.array(Schema.string())   // { type: 'array', items: { type: 'string' } }
Schema.object(props, required)   // { type: 'object', properties, required }
```

## Define on a node

### SDK

```javascript
node.inputs = Schema.object({
  name: Schema.string({ minLength: 1 }),
  age: Schema.integer({ minimum: 0, maximum: 150 }),
  tags: Schema.array(Schema.string(), { minItems: 1 }),
  active: Schema.boolean(),
}, ['name', 'age']); // required fields

node.outputs = Schema.object({
  result: Schema.string(),
  score: Schema.number({ minimum: 0, maximum: 100 }),
});
```

### .node.json

```json
{
  "inputs": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "minLength": 1 },
      "age": { "type": "integer", "minimum": 0 }
    },
    "required": ["name", "age"]
  },
  "outputs": {
    "type": "object",
    "properties": {
      "result": { "type": "string" }
    }
  }
}
```

## Validation behavior

- **Input validation** runs before the node executes
- **Output validation** runs after the node completes (only if successful)
- If validation fails, the node result is marked as failed with the error details
- If `inputs` or `outputs` is `null`, validation is skipped

## Supported JSON Schema properties

| Property | Applies to | Description |
|---|---|---|
| `type` | all | "string", "number", "integer", "boolean", "array", "object" |
| `properties` | object | Field definitions |
| `required` | object | Required field names |
| `items` | array | Item schema |
| `minItems` | array | Minimum array length |
| `maxItems` | array | Maximum array length |
| `minimum` | number/integer | Minimum value |
| `maximum` | number/integer | Maximum value |
| `minLength` | string | Minimum string length |
| `maxLength` | string | Maximum string length |
| `pattern` | string | Regex pattern |
| `enum` | all | Allowed values |
| `default` | all | Default value |
| `description` | all | Human-readable description |

## Error format

Validation errors include the field path:

```
Input validation failed: input.name: must NOT have fewer than 1 characters
Output validation failed: output.score: must be >= 0
```

## Manual validation

```javascript
import { validate, validateInput, validateOutput } from 'light-process';

const schema = Schema.object({
  name: Schema.string({ minLength: 1 }),
}, ['name']);

const result = validateInput({ name: '' }, schema);
// { valid: false, errors: ['input.name: must NOT have fewer than 1 characters'] }

const result2 = validateInput({ name: 'Alice' }, schema);
// { valid: true, errors: [] }
```
