// Objectflix: this is the dev part, kept here so the rest of the app knows exactly where to look.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 5173;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.ass': 'text/plain', '.vtt': 'text/vtt', '.srt': 'text/plain' };
createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const segments = pathname.split(/[\\/]/).filter(Boolean);
    if (segments.some((part) => part.startsWith('.')) || ['worker', 'node_modules', 'scripts'].includes(segments[0])) { response.writeHead(404).end(); return; }
    const target = resolve(root, segments.join(sep) || 'index.html');
    const extension = extname(target).toLowerCase();
    if (!target.startsWith(root) || !types[extension] || !(await stat(target)).isFile()) { response.writeHead(404).end(); return; }
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': `${types[extension]}${['.html', '.css', '.js', '.svg', '.ass', '.vtt', '.srt'].includes(extension) ? '; charset=utf-8' : ''}`, 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404).end(); }
}).listen(port, '127.0.0.1', () => console.log(`Objectflix is ready at http://localhost:${port}`));
