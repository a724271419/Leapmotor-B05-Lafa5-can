// can_live.js — 无头实时采集器（CRP1 over WebSocket）
//
// 协议来源：G:\deepseek\can to debian\can-remote-system\can-remote-analyzer\Protocol\Crp.cs
//   header 24B: magic "CRP1" | ver=1 | type | flags | 0 | crc32(hdr[0..8]) | bodyLen | corrId(u64)
//   trailer 4B: crc32(body)
//   batch  header 40B: sessionId(uuid16) first(u64) last(u64) count(u32) flags(u32)
//          record 36B: seq(u64) canId(u32) channel(u8) flags(u8) dlc(u8) len(u8)
//                      quality(u8) capture(u8) pad(2) tsMono(u64) tsUnix(u64) + payload
//
// 用法：
//   node can_live.js --token <TOKEN> [--url ws://host:1995/can/api/v1/live]
//                    [--out cap.ndjson] [--seconds 60] [--ids 0x18d,0x83] [--stats 5]
'use strict';
const fs = require('fs');
const zlib = require('zlib');

// ---------- args ----------
const A = { url: 'ws://192.168.1.231:1995/can/api/v1/live', out: '', seconds: 0, ids: null, stats: 10, token: '' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (k === '--token') { A.token = v; i++; }
  else if (k === '--url') { A.url = v; i++; }
  else if (k === '--out') { A.out = v; i++; }
  else if (k === '--seconds') { A.seconds = +v; i++; }
  else if (k === '--stats') { A.stats = +v; i++; }
  else if (k === '--ids') { A.ids = v.split(',').map(s => parseInt(s.trim(), 16)); i++; }
}
if (!A.token) { console.error('需要 --token'); process.exit(2); }
if (!A.out) A.out = `can_live_${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;

// ---------- CRP ----------
const MAGIC = Buffer.from('CRP1', 'ascii');
const MSG = { Hello: 1, HelloAck: 2, FrameBatch: 3, DurableAck: 4, Subscribe: 5, SubscribeAck: 6, LiveBatch: 7, GapNotice: 8, Ping: 9, Pong: 10, Error: 11, ResumeRequest: 12, HistoryRequest: 13, HistoryBatch: 14, HistoryEnd: 15, SessionState: 16 };

function crc32(buf) {
  // zlib.crc32 exists in Node >= 22.2; fallback to table implementation
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c, crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xFF;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function encode(type, bodyObj) {
  const body = Buffer.from(bodyObj === undefined || bodyObj === null ? '' : JSON.stringify(bodyObj), 'utf8');
  const hdr = Buffer.alloc(24);
  MAGIC.copy(hdr, 0);
  hdr[4] = 1; hdr[5] = type; hdr[6] = 0; hdr[7] = 0;
  hdr.writeUInt32LE(crc32(hdr.subarray(0, 8)), 8);
  hdr.writeUInt32LE(body.length, 12);
  hdr.writeBigUInt64LE(0n, 16);
  const out = Buffer.alloc(24 + body.length + 4);
  hdr.copy(out, 0);
  body.copy(out, 24);
  out.writeUInt32LE(crc32(body), 24 + body.length);
  return out;
}

function decode(buf) {
  if (buf.length < 28) throw new Error('short');
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('bad magic');
  const type = buf[5];
  const bodyLen = buf.readUInt32LE(12);
  const body = buf.subarray(24, 24 + bodyLen);
  return { type, body };
}

function decodeBatch(body) { // returns {sessionId, first, last, count, frames:[...]}
  const sessionHex = body.subarray(0, 16).toString('hex');
  const first = body.readBigUInt64LE(16), last = body.readBigUInt64LE(24);
  const count = body.readUInt32LE(32);
  let off = 40;
  const frames = [];
  for (let i = 0; i < count; i++) {
    if (off + 36 > body.length) break;
    const rec = body.subarray(off, off + 36);
    const seq = rec.readBigUInt64LE(0);
    const canId = rec.readUInt32LE(8);
    const channel = rec[12];
    const flags = rec[13];
    const dlc = rec[14];
    const len = rec[15];
    const quality = rec[16];
    const capture = rec[17];
    const tsMono = rec.readBigUInt64LE(20);
    const tsUnix = rec.readBigUInt64LE(28);
    if (off + 36 + len > body.length) break;
    const data = body.subarray(off + 36, off + 36 + len);
    frames.push({ seq: seq.toString(), canId, channel, flags, dlc, len, quality, capture, tsMono: tsMono.toString(), tsUnix: tsUnix.toString(), dataHex: data.toString('hex') });
    off += 36 + len;
  }
  return { sessionHex, first: first.toString(), last: last.toString(), count, frames };
}

// ---------- state ----------
const byId = new Map();      // id -> {n, lens:Map, lastTs}
let total = 0, startedAt = Date.now(), lastStats = Date.now(), batches = 0, errors = 0;
const out = fs.createWriteStream(A.out, { flags: 'w' });
const watch = A.ids ? new Set(A.ids) : null;

function onFrames(frames, sessionHex) {
  const lines = [];
  for (const f of frames) {
    total++;
    let e = byId.get(f.canId);
    if (!e) { e = { n: 0, lens: new Map(), lastTs: 0 }; byId.set(f.canId, e); }
    e.n++; e.lens.set(f.len, (e.lens.get(f.len) || 0) + 1);
    e.lastTs = Number(f.tsUnix);
    lines.push(JSON.stringify({
      sequence: Number(f.seq), session_id: sessionHex, can_id: f.canId, channel: f.channel,
      is_extended: (f.flags & 1) !== 0, is_fd: (f.flags & 2) !== 0, brs: (f.flags & 4) !== 0,
      esi: (f.flags & 8) !== 0, is_remote: (f.flags & 16) !== 0, dlc: f.dlc,
      payload_length: f.len, data_hex: f.dataHex, timestamp_unix_us: Number(f.tsUnix),
      timestamp_monotonic_ns: f.tsMono, timestamp_quality: f.quality, capture_flags: f.capture
    }));
    if (watch && watch.has(f.canId)) {
      console.log(`[WATCH] 0x${f.canId.toString(16).toUpperCase()} len=${f.len} data=${f.dataHex}`);
    }
  }
  if (lines.length) out.write(lines.join('\n') + '\n');
}

function printStats() {
  const now = Date.now();
  const dt = (now - lastStats) / 1000; lastStats = now;
  const elapsed = (now - startedAt) / 1000;
  const rows = [...byId.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  console.log(`\n--- ${elapsed.toFixed(0)}s  总帧=${total}  (最近 ${dt.toFixed(1)}s 速率=${(total / Math.max(elapsed, 1)).toFixed(0)}/s)  ID=${byId.size}  batch=${batches}`);
  for (const [id, e] of rows) {
    const lens = [...e.lens.entries()].map(([k, v]) => `${k}:${v}`).join(',');
    console.log(`  0x${id.toString(16).toUpperCase().padStart(3, '0')}  n=${String(e.n).padStart(6)}  len[${lens}]`);
  }
  const key = [0x18d, 0x083, 0x2d1, 0x2d5];
  const miss = key.filter(k => !byId.has(k)).map(k => '0x' + k.toString(16).toUpperCase());
  if (miss.length) console.log('  ⚠ 尚未出现: ' + miss.join(' '));
}

// ---------- ws ----------
let ws;
function connect() {
  ws = new WebSocket(A.url, { headers: { Authorization: 'Bearer ' + A.token } });
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    console.log('WS 已连接: ' + A.url);
    // 订阅全部设备、全部 ID
    ws.send(encode(MSG.Subscribe, { device_ids: [], id_ranges: [] }));
    console.log('已发送 Subscribe');
  };
  ws.onmessage = (m) => {
    if (typeof m.data === 'string') { console.log('text: ' + m.data.slice(0, 200)); return; }
    try {
      const buf = Buffer.from(new Uint8Array(m.data));
      const { type, body } = decode(buf);
      if (type === MSG.LiveBatch || type === MSG.FrameBatch || type === MSG.HistoryBatch) {
        const b = decodeBatch(body);
        batches++;
        onFrames(b.frames, b.sessionHex);
      } else if (type === MSG.SubscribeAck) {
        console.log('SubscribeAck: ' + body.toString('utf8').slice(0, 200));
      } else if (type === MSG.Error) {
        errors++;
        console.log('服务器 Error: ' + body.toString('utf8').slice(0, 300));
      } else if (type === MSG.GapNotice) {
        console.log('GapNotice: ' + body.toString('utf8').slice(0, 200));
      } else if (type === MSG.SessionState) {
        console.log('SessionState: ' + body.toString('utf8').slice(0, 200));
      } else if (type === MSG.Ping) {
        ws.send(encode(MSG.Pong, null));
      }
    } catch (e) { errors++; console.log('decode err: ' + e.message); }
  };
  ws.onerror = () => console.log('WS error');
  ws.onclose = (e) => {
    console.log(`WS 关闭 code=${e.code} reason=${e.reason || ''}`);
    if (!A.seconds) setTimeout(connect, 2000);
  };
}

connect();
const pingTimer = setInterval(() => {
  try { if (ws && ws.readyState === 1) ws.send(encode(MSG.Ping, { nonce: Math.random().toString(36).slice(2), client_time_unix_us: Date.now() * 1000 })); } catch (e) { }
}, 10000);
const statsTimer = setInterval(printStats, Math.max(2, A.stats) * 1000);

function finish() {
  clearInterval(pingTimer); clearInterval(statsTimer);
  printStats();
  out.end(() => {
    console.log(`\n写入完成: ${A.out}  (${total} 帧, ${(fs.statSync(A.out).size / 1048576).toFixed(2)} MB)`);
    try { ws.close(); } catch (e) { }
    process.exit(0);
  });
}
if (A.seconds) setTimeout(finish, A.seconds * 1000);
process.on('SIGINT', finish);
