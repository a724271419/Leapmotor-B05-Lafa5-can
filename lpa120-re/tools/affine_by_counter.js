// Test whether byte0 is affine over visible bytes within each rolling-counter value.
const fs = require('fs');
const readline = require('readline');

const input = process.argv[2];
const target = Number.parseInt(process.argv[3] || '83', 16);
const maxFrames = Number.parseInt(process.argv[4] || '20000', 10);

function solve(frames) {
  const n = frames[0].length;
  const variables = (n - 1) * 8 + 1;
  const encode = (b) => {
    let v = 0n;
    for (let j = 1; j < b.length; j++) {
      for (let k = 0; k < 8; k++) {
        if ((b[j] >> k) & 1) v |= 1n << BigInt((j - 1) * 8 + k);
      }
    }
    return v | (1n << BigInt(variables - 1));
  };

  const result = [];
  for (let outputBit = 0; outputBit < 8; outputBit++) {
    const rows = frames.map((b) => ({v: encode(b), rhs: (b[0] >> outputBit) & 1}));
    let rank = 0;
    for (let col = 0; col < variables && rank < rows.length; col++) {
      const mask = 1n << BigInt(col);
      let pivot = -1;
      for (let i = rank; i < rows.length; i++) {
        if (rows[i].v & mask) { pivot = i; break; }
      }
      if (pivot < 0) continue;
      [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
      for (let i = 0; i < rows.length; i++) {
        if (i !== rank && (rows[i].v & mask)) {
          rows[i].v ^= rows[rank].v;
          rows[i].rhs ^= rows[rank].rhs;
        }
      }
      rank++;
    }
    const inconsistent = rows.reduce((nBad, row) => nBad + Number(row.v === 0n && row.rhs === 1), 0);
    result.push({rank, inconsistent});
  }
  return result;
}

(async () => {
  const groups = Array.from({length: 16}, () => []);
  const stream = fs.createReadStream(input);
  for await (const line of readline.createInterface({input: stream})) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (row.can_id !== target) continue;
    const frame = Buffer.from(row.data_hex, 'hex');
    groups[frame[1] & 0x0f].push(frame);
    if (groups.reduce((sum, g) => sum + g.length, 0) >= maxFrames) break;
  }

  for (let counter = 0; counter < 16; counter++) {
    const frames = groups[counter];
    if (!frames.length) continue;
    const bits = solve(frames);
    console.log(JSON.stringify({
      counter,
      samples: frames.length,
      ranks: bits.map((b) => b.rank),
      inconsistent: bits.map((b) => b.inconsistent),
      affine: bits.every((b) => b.inconsistent === 0),
    }));
  }
})();
