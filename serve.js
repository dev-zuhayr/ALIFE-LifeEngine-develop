// Minimal static file server for local development.
//   node serve.js        -> http://localhost:8000
//   node serve.js 3000   -> http://localhost:3000
// Needed because the app fetches ./assets/... which browsers block on file:// URLs.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'dist');
const PORT = parseInt(process.argv[2], 10) || 8000;
const TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

http.createServer(function (req, res) {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { // don't serve outside dist/
        res.writeHead(403);
        res.end('forbidden');
        return;
    }
    fs.readFile(file, function (err, data) {
        if (err) {
            res.writeHead(404);
            res.end('not found: ' + rel);
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, function () {
    console.log('The Life Engine -> http://localhost:' + PORT);
    console.log('serving ' + ROOT);
    console.log('ctrl+c to stop');
});
