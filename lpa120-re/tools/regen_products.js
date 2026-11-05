// regen_products.js - regenerate products via carstate_offline's own ndjson pipeline
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const NODE = process.execPath;
const OUT = 'G:\\Codex\\ota_extract_2026-10-28\\products_v2_2026-11-05';
const dirs = ['G:\\Codex\\ota_extract_2026-10-28\\can抓包','G:\\Codex\\ota_extract_2026-10-28\\can抓包\\2','G:\\Codex\\ota_extract_2026-10-28\\fullcap'];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const files = [];
for (const d of dirs) for (const n of fs.readdirSync(d)) if (n.endsWith('.ndjson')) files.push(path.join(d, n));
let ok = 0, bad = 0, totalRows = 0;
for (const f of files) {
  const base = path.basename(f, '.ndjson');
  const prefix = path.join(OUT, base);
  const r = cp.spawnSync(NODE, ['carstate_offline.js', f, prefix], { cwd: 'G:\\Codex\\ota_probe', encoding: 'utf8' });
  if (r.status !== 0) { console.log('FAIL', base, (r.stderr || '').slice(-160)); bad++; continue; }
  let hard = '?', rows = '?';
  try { const s = JSON.parse(fs.readFileSync(prefix + '.summary.json', 'utf8')); hard = String(s.hardInvariantViolations); rows = String(s.rows); totalRows += s.rows; } catch (e) {}
  console.log(base.padEnd(26) + ' rows=' + rows + ' hard=' + hard);
  if (hard === '0') ok++; else bad++;
}
console.log('DONE ok=' + ok + ' bad=' + bad + ' rows=' + totalRows + ' -> ' + OUT);