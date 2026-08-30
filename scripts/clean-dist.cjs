const fs = require('fs');
const path = require('path');

const dist = path.join(process.cwd(), 'generated', 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(process.cwd(), 'index.html'), path.join(dist, 'index.html'));
