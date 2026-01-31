#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const candidates = [
  path.join(distDir, 'main.js'),
  path.join(distDir, 'src', 'main.js'),
];

const main = candidates.find((p) => fs.existsSync(p));
if (!main) {
  console.error('Build output not found. Run: npm run build');
  console.error('Looked for:', candidates);
  process.exit(1);
}

require(main);
