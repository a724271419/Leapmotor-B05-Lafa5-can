// dq_gate.js - CAN capture data-quality gate (time base / per-ID presence)
// usage: node dq_gate.js <capture.ndjson> [more.ndjson ...] [--json]
'use strict';
const fs = require('fs');
const rl = require('readline');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const files = args.filter(a => !a.startsWith('--'));
if (!files.length) { console.error('usage: node dq_gate.js <capture.ndjson> [...] [--json]'); process.exit(2); }

const WIN_MS = 100;          // presence window
const SLOW_ID_WARN = 0.90;   // present-in-window ratio below this is flagged when 0x18D is high
const REF_ID = 0x18d;

async function audit(path) {
  const st = new Map();
  let n = 0, first = Infinity, last = 0, prevT = 0, prevSeq = -1;
  let dup = 0, back = 0, seqBack = 0, usNotMs = 0, nsMismatch = 0, nsPresent = 0;
  let gridHits = 0, gridHitsWide = 0, deltaCount = 0; // delta-based quantum test (see below)
  const loseMs = new Set();

  for await (const ln of rl.createInterface({ input: fs.createReadStream(path) })) {
    if (!ln) continue;
    const o = JSON.parse(ln);
    const t = o.timestamp_unix_us;
    n++;
    if (t < first) first = t;
    if (t > last) last = t;
    if (o.timestamp_unix_us % 1000 !== 0) usNotMs++;
    if (typeof o.timestamp_monotonic_ns === 'number') {
      nsPresent++;
      if (Math.abs(o.timestamp_monotonic_ns - t * 1000) > 2000) nsMismatch++;
    }
    if (prevT) {
      if (t === prevT) dup++;
      if (t < prevT) back++;
      const d = t - prevT;
      if (d > 0) { deltaCount++; const r = d % 1000; if (r <= 2 || r >= 998) gridHits++; if (r <= 10 || r >= 990) gridHitsWide++; }
    }
    prevT = t;
    if (o.sequence <= prevSeq) seqBack++;
    prevSeq = o.sequence;
    loseMs.add(Math.floor(t / 1000));

    const id = o.can_id;
    let s = st.get(id);
    if (!s) { s = { n: 0, first: 0, last: 0, d: [], wins: new Set(), dlc: new Set() }; st.set(id, s); }
    s.n++;
    if (!s.first) s.first = t;
    if (s.last) s.d.push(t - s.last);
    s.last = t;
    s.wins.add(Math.floor(t / 1000 / WIN_MS));
    s.dlc.add(o.payload_length !== undefined ? o.payload_length : o.dlc);
  }

  const spanS = (last - first) / 1e6;
  const ids = [];
  for (const [id, s] of st.entries()) {
    const d = s.d.slice().sort((a, b) => a - b);
    ids.push({
      id,
      n: s.n,
      fps: s.n / spanS,
      medianMs: d.length ? d[Math.floor(d.length / 2)] / 1000 : 0,
      meanMs: d.length ? (s.d.reduce((a, b) => a + b, 0) / s.d.length) / 1000 : 0,
      p99Ms: d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.99))] / 1000 : 0,
      maxMs: d.length ? d[d.length - 1] / 1000 : 0,
      present: s.wins.size,
      dlc: [...s.dlc],
    });
  }
  const totalWins = Math.max(...ids.map(i => i.present));
  for (const i of ids) i.presence = totalWins ? i.present / totalWins : 0;
  ids.sort((a, b) => b.n - a.n);

  const ref = ids.find(i => i.id === REF_ID);
  // Only flag "fast" messages (median <= 100 ms) that go missing, not intentional 1 Hz / 2 s frames.
  const slow = ids.filter(i => i.id !== REF_ID && i.n >= 50 && i.medianMs <= 100 &&
    i.presence < SLOW_ID_WARN && (!ref || ref.presence - i.presence > 0.10));

  const framesPerMs = n / loseMs.size;
  const dupPct = (dup / Math.max(n, 1)) * 100;
  // Classify the effective inter-frame grid from DELTAS, not from value modulus.
  // This is a data-set signature, not a general proof of the timestamp clock's
  // physical resolution: a genuinely fine timestamp on an exactly periodic bus
  // can also have integer-ms deltas. The many identical timestamps in these CAN-FD
  // files show that sub-ms ordering inside a batch is unavailable in practice.
  //
  // Direction: a capture is a sub-ms CANDIDATE only when its deltas are NOT pinned
  // to the 1 ms grid (fewer than 99% within +/-10 us) AND stamps do not pile up
  // (<= 1%). Grid-locked or heavily-duplicated captures fall back to 1 ms.
  // The name is 'candidate', not 'microsecond': a spread-out delta distribution
  // proves sub-ms information is present, not that the physical clock is accurate
  // to that resolution.
  // 2026-11-03 review: 5 of the 11 second-batch packages scored only 89.6-94.8%
  // at +/-2 us, yet 99.83-99.92% at +/-10 us with ~50% duplicate stamps. There the
  // shortfall at +/-2 us is jitter around a 1 ms grid, not usable sub-ms ordering,
  // so a +/-2 us cut alone must not relabel the capture 'microsecond'.
  const gridFrac = deltaCount ? gridHits / deltaCount : 0;
  const gridFracWide = deltaCount ? gridHitsWide / deltaCount : 0;
  const timebase = (gridFracWide < 0.99 && dupPct <= 1) ? 'microsecond-candidate' : 'millisecond-grid';
  return {
    file: path, frames: n, spanS, fps: n / spanS,
    msResolution: timebase === 'millisecond-grid', timebase, gridFrac, gridFracWide,
    usNotMs, dupPct, back, seqBack,
    framesPerMs, nsPresent, nsMismatch,
    ids: ids.slice(0, 40), slowIds: slow.map(i => i.id), totalWins,
  };
}

function verdict(r) {
  const out = [];
  if (r.msResolution) {
    out.push('OK   有效时间栅格: 约 1 ms（正 Δ 落在整毫秒 ±2 µs ' + (100 * r.gridFrac).toFixed(1) +
      '%、±10 µs ' + (100 * r.gridFracWide).toFixed(2) + '%；同戳 ' + r.dupPct.toFixed(1) + '% → 不可作亚毫秒排序）');
  } else {
    out.push('OK   亚毫秒候选（microsecond-candidate）：未见 1 ms 主导栅格（±2 µs ' +
      (100 * r.gridFrac).toFixed(1) + '%、±10 µs ' + (100 * r.gridFracWide).toFixed(2) +
      '%、同戳 ' + r.dupPct.toFixed(1) + '%）—— 仅说明数据含亚毫秒信息，不代表物理时钟精度');
  }
  out.push(r.dupPct > 1
    ? 'WARN 重复时间戳 ' + r.dupPct.toFixed(1) + '%（' + r.framesPerMs.toFixed(2) + ' 帧/ms）→ 禁止用跨 ID 相邻帧时间差'
    : 'OK   无重复时间戳（' + r.framesPerMs.toFixed(2) + ' 帧/ms）');
  if (r.seqBack) out.push('FAIL sequence 逆序 ' + r.seqBack + ' 帧');
  else out.push('OK   sequence 单调');
  if (r.back) out.push('WARN timestamp 逆序 ' + r.back + ' 帧 → 跨 ID 顺序只认 sequence');
  if (r.slowIds.length) out.push('WARN 这些 ID 的窗口在线率显著低于 0x18D（条件发送或丢帧）：' + r.slowIds.map(x => '0x' + x.toString(16).toUpperCase()).join(' '));
  out.push('规则: 任何 dt 类量（减速度/周期/加速度）窗口 >= 100 ms；车速用 0x184（50 Hz），不要用 0x182');
  return out;
}

(async () => {
  const results = [];
  for (const f of files) {
    const r = await audit(f);
    results.push(r);
    if (asJson) continue;
    const name = f.split(/[\\/]/).pop();
    console.log('=== ' + name + ' ===');
    console.log('  ' + r.frames + ' 帧 / ' + r.spanS.toFixed(1) + ' s / ' + r.fps.toFixed(0) + ' fps / ' + r.ids.length + ' 个 ID');
    for (const v of verdict(r)) console.log('  ' + v);
    console.log('  ID      帧数    fps   中位周期  均值   p99    最长间隔  在线率  长度');
    for (const i of r.ids.slice(0, 12)) {
      console.log('  0x' + i.id.toString(16).toUpperCase().padStart(3, '0') +
        String(i.n).padStart(8) + String(i.fps.toFixed(1)).padStart(7) +
        (i.medianMs.toFixed(1) + 'ms').padStart(10) + (i.meanMs.toFixed(1)).padStart(7) +
        (i.p99Ms.toFixed(0) + 'ms').padStart(7) + (i.maxMs.toFixed(0) + 'ms').padStart(10) +
        (100 * i.presence).toFixed(1).padStart(8) + '%' + i.dlc.join('/').padStart(7));
    }
    console.log('');
  }
  if (asJson) console.log(JSON.stringify(results, null, 1));
})();
