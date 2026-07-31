const fs = require('fs');
const path = require('path');

const dist = path.join(process.cwd(), 'generated', 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
