'use strict';
// acc_cross.js - what does 0x0B7 b3 really encode? cross-check with 0x083 ACC fields
const fs = require('fs'), path = require('path'), rl = require('readline');
async function scan(file) {
  let f083 = null; // {mode, drvOff, decelStop, avail}
  const table = new Map(); // key "b7=..|mode=..|drv=..|avail=.." -> n
  const trans = [];
  let prev = null;
  for await (const line of rl.createInterface({ input: fs.createReadStream(file) })) {
    if (!line) continue;
    const o = JSON.parse(line), b = Buffer.from(o.data_hex, 'hex'), t = o.timestamp_unix_us;
    if (o.can_id === 0x083) {
      f083 = { mode: (b[3] >> 1) & 0x07, drvOff: (b[3] >> 4) & 1, decel: (b[3] >> 5) & 1, avail: ((b[3] >> 6) & 1) ? 0 : 1 };
    } else if (o.can_id === 0x0b7) {
      const v = (b[3] >> 4) & 0x07; // bits 4..6 as one field
      if (!f083) continue;
      const k = 'b7=' + v + '|083mode=' + f083.mode + '|drvOff=' + f083.drvOff + '|avail=' + f083.avail;
      table.set(k, (table.get(k) || 0) + 1);
      if (prev !== v) { trans.push({ t, v }); prev = v; }
    }
  }
  return { table, trans };
}
(async () => {
  const files = [];
  for (const r of process.argv.slice(2)) {
    const st = fs.statSync(r);
    if (st.isDirectory()) for (const n of fs.readdirSync(r).filter(x => x.endsWith('.ndjson')).sort()) files.push(path.join(r, n));
    else files.push(r);
  }
  const A = new Map(); let transCount = 0;
  for (const f of files) { const s = await scan(f); for (const [k, v] of s.table) A.set(k, (A.get(k) || 0) + v); transCount += s.trans.length; }
  const rows = [...A.entries()].sort((a, b) => b[1] - a[1]);
  console.log('combos=' + rows.length + ' transitions=' + transCount);
  for (const [k, v] of rows.slice(0, 20)) console.log('  ' + k.padEnd(46) + v);
})();
