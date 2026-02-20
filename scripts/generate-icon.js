// Generate a simple OP icon as a PNG using Canvas
// Run: node scripts/generate-icon.js

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

// Background: rounded dark rect
const radius = 100;
ctx.fillStyle = '#141413';
ctx.beginPath();
ctx.roundRect(0, 0, SIZE, SIZE, radius);
ctx.fill();

// Border
ctx.strokeStyle = '#2e2e2c';
ctx.lineWidth = 4;
ctx.beginPath();
ctx.roundRect(2, 2, SIZE - 4, SIZE - 4, radius - 2);
ctx.stroke();

// Accent dot (top-right, like the status indicator)
ctx.fillStyle = '#6fb89f';
ctx.beginPath();
ctx.arc(SIZE - 80, 80, 24, 0, Math.PI * 2);
ctx.fill();

// Text: OP
ctx.fillStyle = '#e8e6e1';
ctx.font = 'bold 220px -apple-system, BlinkMacSystemFont, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('OP', SIZE / 2, SIZE / 2 + 10);

const buffer = canvas.toBuffer('image/png');
const outPath = path.join(__dirname, '..', 'assets', 'icon.png');
fs.writeFileSync(outPath, buffer);
console.log('Icon saved to', outPath);
