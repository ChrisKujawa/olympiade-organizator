import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('public');
const port = Number(process.env.PORT ?? 4173);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8']
]);

function resolveFile(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const safePath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const requested = join(root, safePath);

  if (!requested.startsWith(root)) {
    return null;
  }

  if (existsSync(requested) && statSync(requested).isFile()) {
    return requested;
  }

  return join(root, 'index.html');
}

const server = createServer((request, response) => {
  const file = resolveFile(request.url ?? '/');

  if (!file || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes.get(extname(file)) ?? 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });

  createReadStream(file).pipe(response);
});

server.listen(port, () => {
  console.log(`Olympiade Organizator running at http://localhost:${port}`);
});
