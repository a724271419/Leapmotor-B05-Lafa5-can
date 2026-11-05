#!/usr/bin/env node
/*
 * check_capture.js — 用 OTA 静态分析的判别项检查实车抓包
 *
 * 用法: node check_capture.js <capture.csv>
 *
 * 回答四个问题：
 *  1. 抓包里有没有 0x083（FSC 的 HPC→FSC 组合命令帧）？多长、周期多少？
 *  2. 有没有 0x18D（EPS 反馈）？长度是 8 还是 32（runtime 版本）？
 *  3. 0x083 里的 SteerTarget / SteerRate 是否随方向盘动作变化？
 *  4. 是否存在与 SteerTarget 同步变化的"第三条帧"（可能是最终 EPS 控制）
 */
'use strict';
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('usage: node check_capture.js <capture.csv>'); process.exit(2); }

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
const header = lines.shift().split(',').map(s => s.trim().toLowerCase());
const idx = k => header.indexOf(k);
for (const required of ['timestamp', 'id', 'data']) {
  if (idx(required) < 0) { console.error(`fatal: missing required column ${required}`); process.exit(2); }
}
const frames = [];
for (const line of lines) {
  const c = line.split(',');
  const g = k => { const i = idx(k); return i >= 0 ? (c[i] || '').trim() : ''; };
  const id = parseInt(g('id').replace(/^0x/i, ''), 16);
  if (Number.isNaN(id)) continue;
  const hex = (g('data') || '').replace(/\s+/g, '');
  if (hex.length % 2 || !/^[0-9a-f]*$/i.test(hex)) continue;
  const data = Buffer.from(hex, 'hex');
  const t = parseFloat(g('timestamp'));
  if (!Number.isFinite(t)) continue;
  frames.push({
    t, id, data,
    dlc: parseInt(g('dlc'), 10), fd: (g('frame_type') || '').toLowerCase() === 'fd',
    channel: g('channel') || '', scenario: g('scenario') || ''
  });
}
frames.sort((a, b) => a.t - b.t);

const byId = new Map();
for (const f of frames) {
  const k = '0x' + f.id.toString(16).toUpperCase();
  if (!byId.has(k)) byId.set(k, []);
  byId.get(k).push(f);
}

function stats(list) {
  const dt = [];
  for (let i = 1; i < list.length; i++) dt.push(list[i].t - list[i - 1].t);
  const sortedDt = [...dt].sort((a, b) => a - b);
  const median = sortedDt.length ? sortedDt[Math.floor(sortedDt.length / 2)] : 0;
  const lens = {};
  const channels = {};
  for (const f of list) lens[f.data.length] = (lens[f.data.length] || 0) + 1;
  for (const f of list) channels[f.channel || '(unknown)'] = (channels[f.channel || '(unknown)'] || 0) + 1;
  return { n: list.length, len: lens, channels, period: median * 1000 };
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 10) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

function nearest(list, t, tolerance = 0.015) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].t < t) lo = mid + 1; else hi = mid; }
  const candidates = [list[lo - 1], list[lo]].filter(Boolean);
  candidates.sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t));
  return candidates[0] && Math.abs(candidates[0].t - t) <= tolerance ? candidates[0] : null;
}

function plusOneRatio(values, modulus) {
  if (values.length < 2) return 0;
  let hit = 0;
  for (let i = 1; i < values.length; i++) if (values[i] === (values[i - 1] + 1) % modulus) hit++;
  return hit / (values.length - 1);
}

const out = [];
out.push('# 抓包判别报告\n');
out.push(`帧数 ${frames.length}，唯一 ID ${byId.size}\n`);

function check(idHex, expectLens, note) {
  const list = byId.get(idHex);
  out.push(`## ${idHex} ${note}`);
  if (!list) { out.push('❌ **未出现**\n'); return null; }
  const s = stats(list);
  out.push(`✅ 出现 ${s.n} 帧，周期 ${s.period.toFixed(2)} ms，长度分布 ${JSON.stringify(s.len)}`);
  if (Object.keys(s.channels).length > 1) out.push(`   ⚠️ 同一 ID 来自多个通道 ${JSON.stringify(s.channels)}，必须按通道分开判断`);
  const hit = expectLens.find(l => s.len[l]);
  if (hit) out.push(`   → 符合预期长度 ${hit} 字节`);
  else out.push(`   ⚠️ 长度不在预期 ${expectLens.join('/')} 内`);
  out.push('');
  return list;
}

const f083 = check('0x83', [32], '（HPC→FSC 组合命令，含 ACC/LKA/AEB）');
const f18d = check('0x18D', [32, 8], '（EPS 反馈；runtime 32B FD，兼容库 8B）');
if (f18d) {
  const lengths = new Set(f18d.map(f => f.data.length));
  if (lengths.size === 1 && lengths.has(32)) out.push('→ `0x18D` 判定：32B 运行版候选；禁止使用 8B `EPS_derived.dbc`\n');
  else if (lengths.size === 1 && lengths.has(8)) out.push('→ `0x18D` 判定：8B 兼容布局候选；仍需核对通道和校验\n');
  else out.push('⚠️ `0x18D` 同时出现多种长度：先按 channel/FD 标志拆分，不能混合解码\n');
}

// 0x083 字段解码（来自静态分析：SteerTarget = 650 - raw16*0.02 @byte13-14，SteerRate = byte15*4）
if (f083) {
  const targets = [], rates = [];
  for (const f of f083) {
    if (f.data.length < 16) continue;
    const raw = f.data.readUInt16LE(13);
    targets.push(650 - raw * 0.02);
    rates.push(f.data[15] * 4);
  }
  if (targets.length) {
    const mn = Math.min(...targets), mx = Math.max(...targets);
    out.push(`## 0x083 字段\n`);
    out.push(`- SteerTarget 范围 ${mn.toFixed(2)} … ${mx.toFixed(2)} °（跨度 ${(mx - mn).toFixed(2)}）`);
    out.push(`- SteerRate 范围 ${Math.min(...rates)} … ${Math.max(...rates)} \n`);
    out.push(mx - mn > 5 ? '   → 变化明显，可能是实时控制量' : '   → 几乎不变，可能未激活或字段偏移不符');
    out.push('');
  }

  out.push('## 0x083 byte0–2 候选特征\n');
  for (let byte = 0; byte < 3; byte++) {
    const values = f083.filter(f => f.data.length > byte).map(f => f.data[byte]);
    const low = values.map(v => v & 0xf), high = values.map(v => v >> 4);
    const unique = new Set(values).size;
    out.push(`- byte${byte}: unique=${unique}, +1(byte)=${(plusOneRatio(values, 256) * 100).toFixed(1)}%, +1(low4)=${(plusOneRatio(low, 16) * 100).toFixed(1)}%, +1(high4)=${(plusOneRatio(high, 16) * 100).toFixed(1)}%`);
  }
  out.push('\n> 连续 +1 只能标记 counter 候选；CRC/E2E 必须再做算法匹配，并跨上电周期验证。\n');
}

// 找与 SteerTarget 同步变化的第三帧
if (f083 && f083.length > 20) {
  const targetSeries = f083.map(f => ({ t: f.t, v: f.data.length >= 16 ? 650 - f.data.readUInt16LE(13) * 0.02 : null })).filter(x => x.v !== null);
  const t0 = f083[0].t, t1 = f083[f083.length - 1].t;
  out.push('## 与 SteerTarget 同步变化的其它帧\n');
  out.push('| ID | 长度 | 周期(ms) | 时间覆盖率 | 最佳内容相关窗口 |');
  out.push('|---|---|---|---|---|');
  for (const [k, list] of byId) {
    if (k === '0x83' || list.length < 20) continue;
    const pairs = targetSeries.map(tp => ({ tp, f: nearest(list, tp.t) })).filter(p => p.f);
    const coverage = pairs.length / targetSeries.length;
    if (coverage > 0.9) {
      const s = stats(list);
      const width = Math.min(...pairs.map(p => p.f.data.length));
      const targetValues = pairs.map(p => p.tp.v);
      let best = { kind: '-', offset: -1, corr: 0 };
      for (let off = 0; off < width; off++) {
        const corr = pearson(targetValues, pairs.map(p => p.f.data[off]));
        if (Math.abs(corr) > Math.abs(best.corr)) best = { kind: 'u8', offset: off, corr };
      }
      for (let off = 0; off + 1 < width; off++) {
        const corr = pearson(targetValues, pairs.map(p => p.f.data.readUInt16LE(off)));
        if (Math.abs(corr) > Math.abs(best.corr)) best = { kind: 'u16le', offset: off, corr };
      }
      if (Math.abs(best.corr) >= 0.7) {
        out.push(`| ${k} | ${Object.keys(s.len).join('/')} | ${s.period.toFixed(1)} | ${(coverage * 100).toFixed(1)}% | ${best.kind}@${best.offset}, r=${best.corr.toFixed(3)} |`);
      }
    }
  }
  out.push('\n> 这里只报告时间覆盖率 >90% 且某个 u8/u16LE 窗口 |Pearson r|≥0.7 的候选；相关仍不等于因果，需分场景和跨上电复核。');
}

console.log(out.join('\n'));
