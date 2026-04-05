export const DEFAULT_WORKDIR = '/app';

export const DEFAULT_IGNORE = ['node_modules', '.git', '__pycache__', '.env'];

export const DEFAULT_IMAGES = {
  javascript: 'node:20-alpine',
  python: 'python:3.12-alpine',
} as const;
