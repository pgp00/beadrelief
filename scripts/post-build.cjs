const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dist = path.join(root, 'generated', 'dist');
const vendor = path.join(dist, 'vendor');
const samples = path.join(dist, 'samples');

fs.mkdirSync(vendor, { recursive: true });
fs.mkdirSync(samples, { recursive: true });
fs.copyFileSync(path.join(root, 'src', 'styles.css'), path.join(dist, 'styles.css'));
fs.copyFileSync(path.join(root, 'src', 'help.css'), path.join(dist, 'help.css'));
fs.copyFileSync(path.join(root, 'beadrelief-icon.svg'), path.join(dist, 'beadrelief-icon.svg'));
fs.copyFileSync(path.join(root, 'samples', 'beadrelief-heart-source.png'), path.join(samples, 'beadrelief-heart-source.png'));
fs.copyFileSync(path.join(root, 'node_modules', 'react', 'umd', 'react.production.min.js'), path.join(vendor, 'react.production.min.js'));
fs.copyFileSync(path.join(root, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'), path.join(vendor, 'react-dom.production.min.js'));
fs.copyFileSync(path.join(root, 'node_modules', 'three', 'build', 'three.module.min.js'), path.join(vendor, 'three.module.js'));
fs.copyFileSync(path.join(root, 'node_modules', 'three', 'build', 'three.core.min.js'), path.join(vendor, 'three.core.min.js'));
