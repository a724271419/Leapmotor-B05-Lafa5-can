'use strict';
// gear_check.js - verify 0x0B6 b12[6:5] against wheel direction/speed on existing CCAN captures
const fs = require('fs'), path = require('path'), rl = require('readline');
async function scan(file) {
  let gear = null, dir = null, speed = null;
  const c = { frames: 0, drive: 0, reverse: 0, park: 0, neutral: 0,
              fwdMismatch: 0, revMismatch: 0, parkMoving: 0 };
  for await (const line of rl.createInterface({ input: fs.createReadStream(file) })) {
    if (!line) continue;
    const o = JSON.parse(line), b = Buffer.from(o.data_hex, 'hex');
    if (o.can_id === 0x0b6) gear = (b[12] >> 5) & 3;
    else if (o.can_id === 0x184) {
      const w = [b.readUInt16LE(2), b.readUInt16LE(4), b.readUInt16LE(6), b.readUInt16LE(8)];
      const d = [b[10] & 3, (b[10] >> 2) & 3, (b[10] >> 4) & 3, (b[10] >> 6) & 3];
      const s = w.map((v, i) => d[i] === 2 ? -v : v);
      const med = (([...s].sort((x, y) => x - y))[1] + ([...s].sort((x, y) => x - y))[2]) / 2 / 100;
      if (gear === null) continue;
      c.frames++;
      if (gear === 3) { c.drive++; if (med < -0.5) c.fwdMismatch++; }
      else if (gear === 1) { c.reverse++; if (med > 0.5) c.revMismatch++; }
      else if (gear === 0) { c.park++; if (Math.abs(med) > 1) c.parkMoving++; }
      else c.neutral++;
    }
  }
  return { file: path.basename(file), ...c };
}
(async () => {
  const files = [];
  for (const r of process.argv.slice(2)) {
    const st = fs.statSync(r);
    if (st.isDirectory()) for (const n of fs.readdirSync(r).filter(x => x.endsWith('.ndjson')).sort()) files.push(path.join(r, n));
    else files.push(r);
  }
  let T = { frames: 0, drive: 0, reverse: 0, park: 0, neutral: 0, fwdMismatch: 0, revMismatch: 0, parkMoving: 0 };
  for (const f of files) { const s = await scan(f); for (const k of Object.keys(T)) T[k] += s[k];
    if (s.drive || s.reverse) console.log('  ' + s.file.padEnd(30) + 'D=' + s.drive + ' R=' + s.reverse + ' P=' + s.park + ' mism=' + (s.fwdMismatch + s.revMismatch + s.parkMoving)); }
  console.log('\nTOTAL frames=' + T.frames + ' D=' + T.drive + ' R=' + T.reverse + ' P=' + T.park + ' N=' + T.neutral);
  console.log('mismatch: D-but-reversing=' + T.fwdMismatch + ' R-but-forward=' + T.revMismatch + ' P-but-moving=' + T.parkMoving);
})();
