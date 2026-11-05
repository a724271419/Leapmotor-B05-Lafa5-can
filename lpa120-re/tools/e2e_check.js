// e2e_check.js - generic E2E CRC probe: known-table hit rate, or auto-infer the 16-byte seed table
// usage: node e2e_check.js <ndjson|dir> [--id 0x084] [--counter-byte 1] [--counter-mask 0x0f]
'use strict';
const fs = require('fs'), path = require('path'), rl = require('readline');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('--id', '').toLowerCase();
const CB = Number(arg('--counter-byte', '1'));
const CM = Number(arg('--counter-mask', '0x0f'));
const SEEDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'e2e', 'e2e_seed_tables.json'), 'utf8')).tables;

function crc8h2f(buf, seed) {
  let crc = 0xFF;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc & 0x80) ? (((crc << 1) ^ 0x2F) & 0xFF) : ((crc << 1) & 0xFF);
  }
  crc ^= seed;
  for (let i = 0; i < 8; i++) crc = (crc & 0x80) ? (((crc << 1) ^ 0x2F) & 0xFF) : ((crc << 1) & 0xFF);
  return crc ^ 0xFF;
}

const frames = new Map(); // id -> [Buffer]
(async () => {
  const files = [];
  for (const r of process.argv.slice(2)) {
    if (r.startsWith('--')) continue;
    if (r === ONLY) continue;
    const st = fs.statSync(r);
    if (st.isDirectory()) { for (const n of fs.readdirSync(r)) if (n.endsWith('.ndjson')) files.push(path.join(r, n)); }
    else files.push(r);
  }
  for (const f of files) {
    for await (const line of rl.createInterface({ input: fs.createReadStream(f) })) {
      if (!line) continue;
      const o = JSON.parse(line);
      const id = Number(o.can_id);
      if (ONLY && '0x' + id.toString(16) !== ONLY && String(id) !== ONLY) continue;
      const b = Buffer.from(o.data_hex, 'hex');
      if (b.length < 3) continue;
      let arr = frames.get(id); if (!arr) { arr = []; frames.set(id, arr); }
      if (arr.length < 200000) arr.push(b);
    }
  }
  const ids = [...frames.keys()].sort((a, b) => a - b);
  const out = {};
  console.log('ID      frames   knownTable        inferredTable');
  for (const id of ids) {
    const arr = frames.get(id);
    const name = Object.keys(SEEDS).find(k => k.endsWith('_' + id.toString(16).toUpperCase())) || '';
    const known = name ? String(SEEDS[name]).trim().split(/\s+/).map(h => parseInt(h, 16)) : null;
    let knownHit = known ? 0 : -1;
    if (known) for (const b of arr) if (crc8h2f(b.subarray(1), known[b[CB] & CM]) === b[0]) knownHit++;
    // infer: group by counter, cap samples per group, keep seeds consistent within the group
    const groups = Array.from({ length: 16 }, () => []);
    for (const b of arr) { const c = b[CB] & CM; if (groups[c].length < 500) groups[c].push(b); }
    const cand = groups.map(g => {
      let set = new Set(Array.from({ length: 256 }, (_, i) => i));
      for (const b of g) { const body = b.subarray(1); for (const s of [...set]) if (crc8h2f(body, s) !== b[0]) set.delete(s); if (!set.size) break; }
      return set;
    });
    const inferred = cand.map(s => s.size ? [...s][0] : -1);
    let infHit = 0;
    if (inferred.every(x => x >= 0)) for (const b of arr) if (crc8h2f(b.subarray(1), inferred[b[CB] & CM]) === b[0]) infHit++;
    const infStr = inferred.every(x => x >= 0) ? inferred.map(x => x.toString(16).padStart(2, '0')).join(' ') + ' ' + infHit + '/' + arr.length : 'no-consistent-seed';
    const kStr = known ? knownHit + '/' + arr.length : '-';
    if (inferred.every(x => x >= 0)) out['0x' + id.toString(16).toUpperCase().padStart(3, '0')] = { frames: arr.length, hit: infHit, seeds: inferred.map(x => x.toString(16).padStart(2, '0')).join(' ') };
    console.log(('0x' + id.toString(16).padStart(3, '0')).padEnd(7) + String(arr.length).padStart(7) + '   ' + kStr.padEnd(17) + infStr);
  }
  if (process.argv.includes('--json')) console.log('JSON ' + JSON.stringify(out));
})();