import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadWorkflowFromFolder } from '../CodeLoader.js';
import type { Workflow } from '../Workflow.js';
import { type Command, getFlagValue, getPositional, hasFlag, resolveWorkflow, wantsHelp } from './utils.js';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Sanitize node ID for Mermaid - wrap in quotes if it contains non-alphanumeric chars */
function mermaidId(id: string): string {
  if (/^[a-zA-Z0-9_-]+$/.test(id)) return id;
  return `"${id.replace(/"/g, '')}"`;
}

const OP_SYMBOLS: Record<string, string> = {
  eq: '==',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'in',
  exists: 'exists',
  regex: '~',
};

/** Format condition for display - short readable format instead of raw JSON */
function formatCondition(when: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(when)) {
    if (key === 'or') {
      const items = Array.isArray(val) ? val.map((v: any) => formatCondition(v)) : [];
      parts.push(items.join(' | '));
    } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const ops = Object.entries(val as Record<string, unknown>);
      for (const [op, v] of ops) {
        parts.push(`${key} ${OP_SYMBOLS[op] || op} ${JSON.stringify(v)}`);
      }
    } else {
      parts.push(`${key}==${JSON.stringify(val)}`);
    }
  }
  return parts.join(', ');
}

export const describe: Command = {
  desc: 'Show workflow structure',
  usage: 'light describe <file|dir|id|name> [--no-html]',
  run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light describe <file|dir|id|name> [--no-html]

Shows the DAG structure of a workflow: nodes, links, entry points, and schemas.
Generates describe.html with Mermaid visualization (use --no-html to skip).

Examples:
  light describe example.json
  light describe my-workflow
  light describe . --no-html`);
      return;
    }

    const target = getPositional(0) || '.';

    const dir = getFlagValue('--dir', '.');
    const resolved = resolve(target);

    let workflow: Workflow;
    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      const wf = loadWorkflowFromFolder(resolved);
      if (!wf) {
        console.error('Invalid workflow folder.');
        process.exit(1);
      }
      workflow = wf;
    } else {
      workflow = resolveWorkflow(target, dir);
    }

    const nodes = [...workflow.nodes.values()];
    const links = [...workflow.links.values()];
    const entryNodes = workflow.getEntryNodes();

    console.log(`\n  ${workflow.name} (${workflow.id})`);
    console.log(
      `  ${nodes.length} nodes, ${links.length} links${workflow.network ? `, network: ${workflow.network}` : ''}\n`,
    );

    const printed = new Set<string>();
    const printNode = (nodeId: string, indent: number, viaCondition?: string) => {
      const node = workflow.nodes.get(nodeId);
      if (!node) return;
      const pad = '  '.repeat(indent);
      const arrow = indent > 1 ? '-> ' : '';
      const cond = viaCondition ? ` [${viaCondition}]` : '';
      const revisit = printed.has(nodeId);
      const image = node.image ? ` (${node.image})` : '';

      console.log(`${pad}${arrow}${node.name}${cond}${revisit ? ' (*)' : image}`);

      if (revisit) return;
      printed.add(nodeId);

      const outgoing = workflow.getOutgoingLinks(nodeId);
      for (const lnk of outgoing) {
        const condStr = lnk.when ? formatCondition(lnk.when) : undefined;
        const backLabel = lnk.maxIterations ? ` (loop max:${lnk.maxIterations})` : '';
        printNode(lnk.to, indent + 1, condStr ? condStr + backLabel : backLabel || undefined);
      }
    };

    for (const entry of entryNodes) {
      printNode(entry.id, 1);
    }

    const orphans = nodes.filter((n) => !printed.has(n.id));
    if (orphans.length > 0) {
      console.log(`\n  disconnected:`);
      for (const node of orphans) {
        console.log(`    ${node.name} (${node.image || 'no image'})`);
      }
    }

    console.log('');

    if (hasFlag('--no-html')) return;

    const mermaidLines: string[] = ['graph TD'];

    for (const node of nodes) {
      const label = node.name.replace(/"/g, "'");
      mermaidLines.push(`  ${mermaidId(node.id)}["${label}"]`);
    }

    for (const lnk of links) {
      const from = mermaidId(lnk.from);
      const to = mermaidId(lnk.to);
      let label = '';
      if (lnk.when) label = formatCondition(lnk.when).replace(/"/g, "'");
      if (lnk.maxIterations) {
        label += `${label ? ' ' : ''}loop max:${lnk.maxIterations}`;
      }
      if (label) {
        mermaidLines.push(`  ${from} -->|"${label}"| ${to}`);
      } else {
        mermaidLines.push(`  ${from} --> ${to}`);
      }
    }

    for (const node of orphans) {
      mermaidLines.push(`  style ${mermaidId(node.id)} stroke-dasharray: 5 5`);
    }

    const mermaidDef = mermaidLines.join('\n');
    const safeName = escapeHtml(workflow.name);

    const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>${safeName} - Workflow</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #fafafa; }
    h1 { margin-bottom: 0.25rem; }
    .info { color: #666; margin-bottom: 1.5rem; }
    .mermaid { background: white; padding: 2rem; border-radius: 8px; border: 1px solid #e0e0e0; }
  </style>
</head><body>
  <h1>${safeName}</h1>
  <p class="info">${nodes.length} nodes - ${links.length} links${orphans.length > 0 ? ` - ${orphans.length} disconnected` : ''}</p>
  <pre class="mermaid">
${mermaidDef}
  </pre>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'default' });</script>
</body></html>`;

    const htmlDir = existsSync(resolved) && statSync(resolved).isDirectory() ? resolved : dirname(resolved);
    const htmlPath = join(htmlDir, 'describe.html');
    writeFileSync(htmlPath, html);
    console.log(`HTML: ${htmlPath}`);
  },
};
