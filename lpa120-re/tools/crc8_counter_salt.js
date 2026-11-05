// Find CRC-8 algorithms where observed byte0 differs from CRC(bytes[1..])
// by one counter-dependent constant. This models E2E/Data-ID selection.
const fs = require('fs');
const readline = require('readline');

const input = process.argv[2];
const target = Number.parseInt(process.argv[3] || '83', 16);
const maxFrames = Number.parseInt(process.argv[4] || '20000', 10);

function reverse8(x) {
  let y = 0;
  for (let i = 0; i < 8; i++) y = (y << 1) | ((x >> i) & 1);
  return y;
}

function crc8(bytes, poly, reflected) {
  let crc = 0;
  if (!reflected) {
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = ((crc << 1) & 0xff) ^ ((crc & 0x80) ? poly : 0);
    }
  } else {
    const rpoly = reverse8(poly);
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >> 1) ^ ((crc & 1) ? rpoly : 0);
    }
  }
  return crc;
}

(async () => {
  const frames = [];
  for await (const line of readline.createInterface({input: fs.createReadStream(input)})) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (row.can_id !== target) continue;
    frames.push(Buffer.from(row.data_hex, 'hex'));
    if (frames.length >= maxFrames) break;
  }

  const layouts = [
    {name: 'b1..end', select: (b) => b.subarray(1)},
    {name: 'b2..end', select: (b) => b.subarray(2)},
    {name: 'b1_low_nibble_zeroed..end', select: (b) => {
      const x = Buffer.from(b.subarray(1));
      x[0] &= 0xf0;
      return x;
    }},
  ];

  const matches = [];
  for (const layout of layouts) {
    for (let poly = 1; poly < 256; poly++) {
      for (const reflected of [false, true]) {
        const residual = Array(16).fill(null);
        let ok = true;
        for (const frame of frames) {
          const counter = frame[1] & 0x0f;
          const r = frame[0] ^ crc8(layout.select(frame), poly, reflected);
          if (residual[counter] === null) residual[counter] = r;
          else if (residual[counter] !== r) { ok = false; break; }
        }
        if (ok) matches.push({layout: layout.name, poly: `0x${poly.toString(16).padStart(2, '0')}`, reflected, residual});
      }
    }
  }
  console.log(JSON.stringify({frames: frames.length, matches}, null, 2));
})();
