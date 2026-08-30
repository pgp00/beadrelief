const http = require('http');
const fs = require('fs');
const path = require('path');

const generated = path.join(process.cwd(), 'generated');
const root = path.join(generated, 'dist');
const port = Number(process.argv[2] || process.env.PORT || 5174);
const types = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

http
  .createServer((request, response) => {
    let requestPath;
    try {
      requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }
    if (requestPath === '/') requestPath = '/index.html';
    const filePath = path.normalize(path.join(root, requestPath));
    const relativePath = path.relative(root, filePath);

    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
      response.end(data);
    });
  })
  .on('error', (error) => {
    fs.mkdirSync(generated, { recursive: true });
    fs.writeFileSync(path.join(generated, 'dev-server.err'), `${error.stack || error}\n`);
    process.exit(1);
  })
  .listen(port, '127.0.0.1', () => {
    fs.mkdirSync(generated, { recursive: true });
    fs.writeFileSync(path.join(generated, 'dev-server.log'), `BeadRelief is running at http://127.0.0.1:${port}/\n`);
  });
