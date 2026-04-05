import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CircularDependencyError,
  LightProcessError,
  LinkValidationError,
  WorkflowTimeoutError,
} from '../../dist/errors.js';

describe('LightProcessError', () => {
  it('is instanceof Error', () => {
    const err = new LightProcessError('test message');
    assert.ok(err instanceof Error);
  });

  it('is instanceof LightProcessError', () => {
    const err = new LightProcessError('test message');
    assert.ok(err instanceof LightProcessError);
  });

  it('has correct name', () => {
    const err = new LightProcessError('test message');
    assert.equal(err.name, 'LightProcessError');
  });

  it('has correct message', () => {
    const err = new LightProcessError('something went wrong');
    assert.equal(err.message, 'something went wrong');
  });
});

describe('LinkValidationError', () => {
  it('is instanceof Error', () => {
    const err = new LinkValidationError('bad link', 'l1', 'link-name', 'a', 'b');
    assert.ok(err instanceof Error);
  });

  it('is instanceof LightProcessError', () => {
    const err = new LinkValidationError('bad link', 'l1', 'link-name', 'a', 'b');
    assert.ok(err instanceof LightProcessError);
  });

  it('is instanceof LinkValidationError', () => {
    const err = new LinkValidationError('bad link', 'l1', 'link-name', 'a', 'b');
    assert.ok(err instanceof LinkValidationError);
  });

  it('has correct name', () => {
    const err = new LinkValidationError('bad link', 'l1', 'link-name', 'a', 'b');
    assert.equal(err.name, 'LinkValidationError');
  });

  it('has correct properties', () => {
    const err = new LinkValidationError('bad link', 'l1', 'my-link', 'nodeA', 'nodeB');
    assert.equal(err.message, 'bad link');
    assert.equal(err.linkId, 'l1');
    assert.equal(err.linkName, 'my-link');
    assert.equal(err.from, 'nodeA');
    assert.equal(err.to, 'nodeB');
  });
});

describe('CircularDependencyError', () => {
  it('is instanceof Error', () => {
    const err = new CircularDependencyError('wf-1', ['A', 'B', 'A']);
    assert.ok(err instanceof Error);
  });

  it('is instanceof LightProcessError', () => {
    const err = new CircularDependencyError('wf-1', ['A', 'B', 'A']);
    assert.ok(err instanceof LightProcessError);
  });

  it('has correct name', () => {
    const err = new CircularDependencyError('wf-1', ['A', 'B', 'A']);
    assert.equal(err.name, 'CircularDependencyError');
  });

  it('has correct properties', () => {
    const err = new CircularDependencyError('wf-1', ['A', 'B', 'A']);
    assert.equal(err.workflowId, 'wf-1');
    assert.deepEqual(err.cycle, ['A', 'B', 'A']);
  });

  it('message includes cycle path', () => {
    const err = new CircularDependencyError('wf-1', ['X', 'Y', 'X']);
    assert.ok(err.message.includes('X'));
    assert.ok(err.message.includes('Y'));
    assert.ok(err.message.includes('Circular dependency'));
  });
});

describe('WorkflowTimeoutError', () => {
  it('is instanceof Error', () => {
    const err = new WorkflowTimeoutError('wf-1', 5000, 6000);
    assert.ok(err instanceof Error);
  });

  it('is instanceof LightProcessError', () => {
    const err = new WorkflowTimeoutError('wf-1', 5000, 6000);
    assert.ok(err instanceof LightProcessError);
  });

  it('has correct name', () => {
    const err = new WorkflowTimeoutError('wf-1', 5000, 6000);
    assert.equal(err.name, 'WorkflowTimeoutError');
  });

  it('has correct properties', () => {
    const err = new WorkflowTimeoutError('wf-1', 5000, 6000);
    assert.equal(err.workflowId, 'wf-1');
    assert.equal(err.timeout, 5000);
    assert.equal(err.elapsed, 6000);
  });

  it('message includes workflow id and timing', () => {
    const err = new WorkflowTimeoutError('wf-1', 5000, 6000);
    assert.ok(err.message.includes('wf-1'));
    assert.ok(err.message.includes('6000'));
    assert.ok(err.message.includes('5000'));
  });
});
