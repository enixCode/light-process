import { existsSync, readFileSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const UI_OUT_DIR = join(__dirname, '..', '..', 'ui', 'out');
export const UI_AVAILABLE = existsSync(UI_OUT_DIR);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

export function serveStatic(res: ServerResponse, pathname: string): boolean {
  if (!UI_AVAILABLE) return false;
  const candidates: string[] = [];
  if (pathname === '/') {
    candidates.push(join(UI_OUT_DIR, 'index.html'));
  } else {
    candidates.push(join(UI_OUT_DIR, pathname), join(UI_OUT_DIR, pathname, 'index.html'));
  }
  for (const filePath of candidates) {
    try {
      const stat = statSync(filePath);
      if (stat.isFile()) {
        const mime = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(readFileSync(filePath));
        return true;
      }
    } catch {
      // try next candidate
    }
  }
  return false;
}
