---
layout: default
title: Conditions
---

# Conditions

Links support MongoDB-style `when` conditions to control routing based on node output.

## Operators

| Operator | Example | Description |
|---|---|---|
| (none) | `{ status: "ok" }` | Exact equality |
| `gt` | `{ count: { gt: 5 } }` | Greater than |
| `gte` | `{ count: { gte: 5 } }` | Greater or equal |
| `lt` | `{ count: { lt: 10 } }` | Less than |
| `lte` | `{ count: { lte: 10 } }` | Less or equal |
| `ne` | `{ status: { ne: "error" } }` | Not equal |
| `in` | `{ role: { in: ["admin", "mod"] } }` | Value in array |
| `exists` | `{ token: { exists: true } }` | Field exists |
| `or` | `{ or: [{...}, {...}] }` | Logical OR |

## Logic

- All top-level fields are **AND** (all must match)
- Use `or` for **OR** logic
- Conditions are evaluated against the source node's output

## Examples

### Simple equality

```json
{ "status": "ok" }
```

Matches if output contains `{ "status": "ok" }`.

### Multiple conditions (AND)

```json
{ "status": "ok", "count": { "gte": 10 } }
```

Matches if status is "ok" AND count is >= 10.

### OR logic

```json
{
  "or": [
    { "status": "ok" },
    { "status": "warning" }
  ]
}
```

Matches if status is "ok" OR "warning".

### Field existence

```json
{ "token": { "exists": true } }
```

Matches if the output has a `token` field (any value).

```json
{ "error": { "exists": false } }
```

Matches if the output does NOT have an `error` field.

### Membership

```json
{ "role": { "in": ["admin", "moderator", "owner"] } }
```

Matches if role is one of the listed values.

### Numeric range

```json
{ "score": { "gte": 0, "lte": 100 } }
```

Matches if score is between 0 and 100.

### Not equal

```json
{ "status": { "ne": "error" } }
```

Matches if status is anything except "error".

## Usage in links

### workflow.json

```json
{
  "links": [
    {
      "from": "validate",
      "to": "process",
      "when": { "valid": true, "score": { "gte": 80 } }
    },
    {
      "from": "validate",
      "to": "reject",
      "when": { "valid": { "ne": true } }
    }
  ]
}
```

### SDK

```javascript
wf.addLink({
  from: validate.id,
  to: process.id,
  when: { valid: true, score: { gte: 80 } },
});
```

## Validation

Conditions are validated when a link is added. Unknown operators throw `LinkValidationError`:

```
Link "my-link" has invalid 'when' condition: Unknown operator: foo
```
