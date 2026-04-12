import type { IOSchema, JSONSchema } from './schema.js';

export type CodeLanguage = 'javascript' | 'python';

export interface HelperFile {
  filename: string;
  content: string;
}

export const OUTPUT_FILE = '.lp-output.json';

const helpers: Record<CodeLanguage, HelperFile> = {
  javascript: {
    filename: 'lp.js',
    content: `const input = JSON.parse(require('fs').readFileSync(0, 'utf-8') || '{}');
const send = (output) => { require('fs').writeFileSync('.lp-output.json', JSON.stringify(output)); };
module.exports = { input, send };
`,
  },
  python: {
    filename: 'lp.py',
    content: `import json, sys
input = json.loads(sys.stdin.read() or '{}')
def send(output):
    with open('.lp-output.json', 'w') as f:
        json.dump(output, f)
`,
  },
};

export function getHelper(language: CodeLanguage): HelperFile {
  return helpers[language];
}

export function getAllHelpers(): HelperFile[] {
  return Object.values(helpers);
}

function jsonSchemaToTs(schema: JSONSchema): string {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return schema.items ? `${jsonSchemaToTs(schema.items)}[]` : 'unknown[]';
    case 'object':
      if (schema.properties) return schemaToInterface(schema as IOSchema);
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

function safeKey(key: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return key;
  return JSON.stringify(key);
}

function schemaToInterface(schema: IOSchema): string {
  const props = schema.properties;
  const required = schema.required ?? [];
  const lines = Object.entries(props)
    .filter(([key]) => key !== '')
    .map(([key, prop]) => {
      const opt = required.includes(key) ? '' : '?';
      return `  ${safeKey(key)}${opt}: ${jsonSchemaToTs(prop)};`;
    });
  if (lines.length === 0) return 'Record<string, unknown>';
  return `{\n${lines.join('\n')}\n}`;
}

/** Generate a lp.d.ts file content from input/output schemas */
export function generateDts(inputs: IOSchema | null, outputs: IOSchema | null): string {
  const inputType = inputs?.properties ? schemaToInterface(inputs) : 'Record<string, unknown>';
  const outputType = outputs?.properties ? schemaToInterface(outputs) : 'Record<string, unknown>';
  return `export declare const input: ${inputType};\nexport declare function send(output: ${outputType}): void;\n`;
}
