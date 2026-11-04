// Makes the PNG and ICO icons from src/favicon.svg. Needs @napi-rs/canvas, which isn't a
// project dependency: run it from a folder where that's installed, e.g.
//   node tools/make-icons.js            (after npm i --no-save @napi-rs/canvas)
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const src = path.join(__dirname, '..', 'src');
const svg = fs.readFileSync(path.join(src, 'favicon.svg'), 'utf8');
// Phones round the corners themselves and fill transparent ones with black, so the home-screen
// icon uses a square tile.
const square = svg.replace('rx="14" fill="#151514"', 'fill="#151514"');

async function png(text, size) {
  const img = await loadImage(Buffer.from(text));
  const c = createCanvas(size, size);
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  return c.toBuffer('image/png');
}

// An .ico file is a small header plus PNGs stored back to back.
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p.data)]);
}

(async () => {
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map(async size => ({ size, data: await png(svg, size) })));
  fs.writeFileSync(path.join(src, 'favicon.ico'), ico(pngs));
  fs.writeFileSync(path.join(src, 'apple-touch-icon.png'), await png(square, 180));
  console.log('wrote favicon.ico (16/32/48) and apple-touch-icon.png (180)');
})();
