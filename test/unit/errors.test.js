import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CircularDependencyError,
  LightProcessError,
  LinkValidationError,
  WorkflowTimeoutError,
} from '../../dist/errors.js';

describe('LinkValidationError', () => {
  it('stores link metadata for programmatic access', () => {
    const err = new LinkValidationError('bad link', 'l1', 'my-link', 'nodeA', 'nodeB');
    assert.equal(err.message, 'bad link');
    assert.equal(err.linkId, 'l1');
    assert.equal(err.linkName, 'my-link');
    assert.equal(err.from, 'nodeA');
    assert.equal(err.to, 'nodeB');
    assert.ok(err instanceof LightProcessError);
  });
});

describe('CircularDependencyError', () => {
  it('stores cycle path and includes nodes in message', () => {
    const err = new CircularDependencyError('wf-1', ['A', 'B', 'C', 'A']);
    assert.equal(err.workflowId, 'wf-1');
    assert.deepEqual(err.cycle, ['A', 'B', 'C', 'A']);
    assert.ok(err.message.includes('A'));
    assert.ok(err.message.includes('Circular dependency'));
    assert.ok(err instanceof LightProcessError);
  });
});

describe('WorkflowTimeoutError', () => {
  it('stores timeout and elapsed for diagnostics', () => {
    const err = new WorkflowTimeoutError('wf-1', 5000, 6000);
    assert.equal(err.workflowId, 'wf-1');
    assert.equal(err.timeout, 5000);
    assert.equal(err.elapsed, 6000);
    assert.ok(err.message.includes('wf-1'));
    assert.ok(err.message.includes('5000'));
    assert.ok(err instanceof LightProcessError);
  });
});
