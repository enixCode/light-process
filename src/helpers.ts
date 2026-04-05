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
