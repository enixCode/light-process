const VALID_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'ne', 'in', 'exists', 'regex', 'or'] as const;

/** @throws Error if an unknown operator is found */
export function validateWhen(when: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(when)) {
    const operator = key;

    // Check if it's an operator at top level (like $or or or)
    if (VALID_OPERATORS.includes(operator as (typeof VALID_OPERATORS)[number])) {
      // Recursively validate or arrays
      if (operator === 'or' && Array.isArray(value)) {
        for (const condition of value) {
          if (typeof condition === 'object' && condition !== null) {
            validateWhen(condition as Record<string, unknown>);
          }
        }
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Validate nested operator conditions like { count: { gt: 5 } } or { count: { $gt: 5 } }
      const nested = value as Record<string, unknown>;
      for (const nestedKey of Object.keys(nested)) {
        const nestedOp = nestedKey;
        if (!VALID_OPERATORS.includes(nestedOp as (typeof VALID_OPERATORS)[number])) {
          throw new Error(`Unknown operator: "${nestedKey}". Valid operators: ${VALID_OPERATORS.join(', ')}`);
        }
      }
    }
  }
}

export function checkCondition(when: Record<string, unknown>, output: Record<string, unknown>): boolean {
  validateWhen(when);

  for (const [key, condition] of Object.entries(when)) {
    // Handle or/$or operator at top level
    if (key === 'or') {
      if (!Array.isArray(condition)) {
        return false;
      }
      const orResult = condition.some((subCondition) =>
        checkCondition(subCondition as Record<string, unknown>, output),
      );
      if (!orResult) {
        return false;
      }
      continue;
    }

    const outputValue = output[key];

    // If condition is an object with operators
    if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
      const conditionObj = condition as Record<string, unknown>;

      for (const [op, expected] of Object.entries(conditionObj)) {
        const operator = op;

        switch (operator) {
          case 'gt':
            if (typeof outputValue !== 'number' || typeof expected !== 'number' || !(outputValue > expected))
              return false;
            break;
          case 'gte':
            if (typeof outputValue !== 'number' || typeof expected !== 'number' || !(outputValue >= expected))
              return false;
            break;
          case 'lt':
            if (typeof outputValue !== 'number' || typeof expected !== 'number' || !(outputValue < expected))
              return false;
            break;
          case 'lte':
            if (typeof outputValue !== 'number' || typeof expected !== 'number' || !(outputValue <= expected))
              return false;
            break;
          case 'ne':
            if (outputValue === expected) return false;
            break;
          case 'in':
            if (!Array.isArray(expected) || !expected.includes(outputValue)) return false;
            break;
          case 'exists':
            if (expected !== (outputValue !== undefined)) return false;
            break;
          case 'regex':
            if (typeof outputValue !== 'string' || typeof expected !== 'string') return false;
            if (!new RegExp(expected).test(outputValue)) return false;
            break;
          default:
            throw new Error(`Unknown operator: "${op}"`);
        }
      }
    } else {
      // Direct equality check
      if (outputValue !== condition) {
        return false;
      }
    }
  }

  return true;
}
