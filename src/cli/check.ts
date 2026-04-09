import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { loadWorkflowFromFolder } from '../CodeLoader.js';
import { Workflow } from '../Workflow.js';
import { type Command, getPositional, hasFlag, wantsHelp } from './utils.js';

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

interface CheckReport {
  checks: CheckResult[];
  workflow: Workflow | null;
  source: string;
  deadNodes: string[];
  metaPath: string | null;
}

function runChecks(resolved: string): CheckReport {
  const checks: CheckResult[] = [];
  let workflow: Workflow | null = null;
  let source = 'json';
  const deadNodes: string[] = [];
  let metaPath: string | null = null;

  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    source = 'folder';
    metaPath = join(resolved, 'workflow.json');

    if (!existsSync(metaPath)) {
      checks.push({ name: 'workflow.json exists', passed: false, message: 'not found' });
      metaPath = null;
    } else {
      checks.push({ name: 'workflow.json exists', passed: true, message: '' });

      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));

        if (!meta.name || !Array.isArray(meta.nodes)) {
          checks.push({ name: 'workflow.json structure', passed: false, message: 'missing name or nodes' });
        } else {
          checks.push({ name: 'workflow.json structure', passed: true, message: '' });

          for (const nodeRef of meta.nodes) {
            const nodeDir = join(resolved, nodeRef.dir);
            if (!existsSync(nodeDir)) {
              checks.push({ name: `Node folder "${nodeRef.dir}"`, passed: false, message: 'directory not found' });
              deadNodes.push(nodeRef.dir);
            } else if (!existsSync(join(nodeDir, '.node.json'))) {
              checks.push({ name: `Node "${nodeRef.dir}"`, passed: false, message: '.node.json not found' });
              deadNodes.push(nodeRef.dir);
            }
          }
        }

        workflow = loadWorkflowFromFolder(resolved);
        if (!workflow) {
          checks.push({ name: 'Workflow loads', passed: false, message: 'failed to load from folder' });
        } else {
          checks.push({ name: 'Workflow loads', passed: true, message: '' });
        }
      } catch (err: unknown) {
        checks.push({ name: 'workflow.json valid JSON', passed: false, message: (err as Error).message });
      }
    }
  } else {
    try {
      const content = readFileSync(resolved, 'utf-8');
      const json = JSON.parse(content);
      workflow = Workflow.fromJSON(json);
      checks.push({ name: 'Workflow loads', passed: true, message: '' });
    } catch (err: unknown) {
      checks.push({ name: 'Workflow loads', passed: false, message: (err as Error).message });
    }
  }

  if (workflow) {
    let nodesValid = true;
    for (const node of workflow.nodes.values()) {
      if (!node.image) {
        checks.push({ name: `Node "${node.name}" image`, passed: false, message: 'image is null' });
        nodesValid = false;
      }
      if (!node.entrypoint && Object.keys(node.files).length === 0) {
        checks.push({ name: `Node "${node.name}" code`, passed: false, message: 'no entrypoint and no files' });
        nodesValid = false;
      }
    }
    if (nodesValid) {
      checks.push({ name: 'Nodes valid', passed: true, message: `${workflow.nodes.size} node(s)` });
    }
    checks.push({ name: 'Links valid', passed: true, message: `${workflow.links.size} link(s)` });

    const entryNodes = workflow.getEntryNodes();
    if (entryNodes.length === 0 && workflow.nodes.size > 0) {
      checks.push({ name: 'Entry nodes', passed: false, message: 'no entry nodes found' });
    } else {
      checks.push({ name: 'Entry nodes', passed: true, message: `${entryNodes.length} entry node(s)` });
    }
  }

  return { checks, workflow, source, deadNodes, metaPath };
}

function printReport(target: string, report: CheckReport): void {
  const name = report.workflow?.name || target;
  console.log(`\nChecking: ${name} (from ${report.source})\n`);

  for (const c of report.checks) {
    const icon = c.passed ? '[ok]' : '[fail]';
    const detail = c.message ? ` - ${c.message}` : '';
    console.log(`  ${icon} ${c.name}${detail}`);
  }

  const passed = report.checks.filter((c) => c.passed).length;
  const total = report.checks.length;
  const allPassed = report.checks.every((c) => c.passed);
  console.log(`\n${allPassed ? '[ok]' : '[fail]'} ${passed}/${total} checks passed`);
}

export const check: Command = {
  desc: 'Validate a workflow without running it',
  usage: 'light check [dir|file] [--fix]',
  run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light check [dir|file] [--fix]

Validates a workflow structure without running it.

Options:
  --fix   Auto-fix issues (e.g., remove dead node references)

Examples:
  light check ./workflows/example
  light check ./workflows/example --fix`);
      return;
    }

    const target = getPositional(0) || '.';
    const resolved = resolve(target);
    const fix = hasFlag('--fix');

    let report = runChecks(resolved);

    if (fix && report.deadNodes.length > 0 && report.metaPath) {
      const meta = JSON.parse(readFileSync(report.metaPath, 'utf-8'));
      meta.nodes = meta.nodes.filter((n: any) => !report.deadNodes.includes(n.dir));
      writeFileSync(report.metaPath, JSON.stringify(meta, null, 2));
      console.log(`Fixed: removed ${report.deadNodes.length} dead node ref(s)`);
      report = runChecks(resolved);
    }

    printReport(target, report);

    const allPassed = report.checks.every((c) => c.passed);
    if (!allPassed) {
      if (!fix) console.log('Run "light check --fix" to auto-fix issues');
      process.exit(1);
    }
  },
};
