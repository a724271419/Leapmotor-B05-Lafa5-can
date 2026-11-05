'use strict';
// id_inventory.js - per-ID census across every capture: frames, DLC, period, payload variability
const fs = require('fs'), path = require('path'), rl = require('readline');
(async () => {
  const files = [];
  for (const r of process.argv.slice(2)) {
    const st = fs.statSync(r);
    if (st.isDirectory()) for (const n of fs.readdirSync(r).filter(x => x.endsWith('.ndjson')).sort()) files.push(path.join(r, n));
    else files.push(r);
  }
  const byId = new Map();
  for (const f of files) {
    let prev = new Map();
    for await (const line of rl.createInterface({ input: fs.createReadStream(f) })) {
      if (!line) continue;
      const o = JSON.parse(line), b = Buffer.from(o.data_hex, 'hex');
      let s = byId.get(o.can_id);
      if (!s) { s = { id: o.can_id, n: 0, dlc: new Set(), payloads: new Set(), deltas: [], last: 0, files: new Set() }; byId.set(o.can_id, s); }
      s.n++; s.dlc.add(b.length); s.files.add(path.basename(f));
      if (s.payloads.size < 5000) s.payloads.add(b.subarray(1).toString('hex'));
      if (s.last) { const d = (o.timestamp_unix_us - s.last) / 1000; if (d > 0 && d < 5000) s.deltas.push(d); }
      s.last = o.timestamp_unix_us;
    }
  }
  const rows = [...byId.values()].sort((a, b) => b.n - a.n);
  const out = rows.map(s => {
    const d = s.deltas.sort((x, y) => x - y);
    return { id: '0x' + s.id.toString(16).toUpperCase().padStart(3, '0'), frames: s.n, dlc: [...s.dlc].join('/'),
      medianMs: d.length ? +(d[d.length >> 1]).toFixed(1) : null, payloads: s.payloads.size, files: s.files.size };
  });
  console.log('IDs=' + out.length + ' files=' + files.length);
  for (const r of out) console.log([r.id, String(r.frames).padStart(7), ('dlc=' + r.dlc).padEnd(8), ('p50=' + r.medianMs + 'ms').padEnd(11), ('uniq=' + r.payloads).padEnd(11), 'inFiles=' + r.files].join(' '));
  fs.writeFileSync('G:\\Codex\\ota_probe\\_n7\\id_inventory.json', JSON.stringify(out, null, 1), 'utf8');
})();
