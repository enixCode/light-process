import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_IGNORE, DEFAULT_IMAGES, DEFAULT_WORKDIR } from '../../dist/defaults.js';

describe('DEFAULT_WORKDIR', () => {
  it('equals /app', () => {
    assert.equal(DEFAULT_WORKDIR, '/app');
  });
});

describe('DEFAULT_IGNORE', () => {
  it('is an array', () => {
    assert.ok(Array.isArray(DEFAULT_IGNORE));
  });

  it('contains node_modules', () => {
    assert.ok(DEFAULT_IGNORE.includes('node_modules'));
  });

  it('contains .git', () => {
    assert.ok(DEFAULT_IGNORE.includes('.git'));
  });

  it('contains __pycache__', () => {
    assert.ok(DEFAULT_IGNORE.includes('__pycache__'));
  });

  it('contains .env', () => {
    assert.ok(DEFAULT_IGNORE.includes('.env'));
  });
});

describe('DEFAULT_IMAGES', () => {
  it('has javascript image', () => {
    assert.equal(DEFAULT_IMAGES.javascript, 'node:20-alpine');
  });

  it('has python image', () => {
    assert.equal(DEFAULT_IMAGES.python, 'python:3.12-alpine');
  });
});
