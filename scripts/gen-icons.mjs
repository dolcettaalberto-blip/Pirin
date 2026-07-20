// One-off PWA icon generator: writes raw PNGs (no image deps) with a simple
// two-peak mountain mark on the app's dark background.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw.writeUInt8(r, row + 1 + x * 4);
      raw.writeUInt8(g, row + 2 + x * 4);
      raw.writeUInt8(b, row + 3 + x * 4);
      raw.writeUInt8(255, row + 4 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex("#0d0d0d");
const BLUE = hex("#3987e5");
const AQUA = hex("#199e70");

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function makeIcon(size) {
  const s = size / 512;
  // back peak (aqua, left), front peak (blue, right)
  const back = [
    [180 * s, 150 * s],
    [30 * s, 430 * s],
    [330 * s, 430 * s],
  ];
  const front = [
    [330 * s, 90 * s],
    [130 * s, 430 * s],
    [500 * s, 430 * s],
  ];
  return png(size, (x, y) => {
    if (inTriangle(x, y, ...front)) return BLUE;
    if (inTriangle(x, y, ...back)) return AQUA;
    return BG;
  });
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-512.png", makeIcon(512));
writeFileSync("public/icons/icon-192.png", makeIcon(192));
writeFileSync("app/apple-icon.png", makeIcon(180));
console.log("icons written");
