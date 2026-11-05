#!/usr/bin/env node
/*
 * analyze_can.js — 纯被动 CAN/CAN-FD 抓包分析器
 *
 * 用法:
 *   node analyze_can.js <capture.csv|dump.txt> [--out r.md] [--json r.json] [--signals signals.json]
 *   node analyze_can.js --self-test
 *
 * 输入:
 *   - 本工具规范 CSV (见 README_抓包格式.md)
 *   - 或 candump -L 文本: (1729000000.123456) can0 123#DEADBEEF
 *   - --signals: decode_dbc.py 产出的信号解码 JSON（可选）
 *
 * 本工具只读文件，不连接任何设备。
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- DLC 映射 ----------
// 经典 CAN: 0-8 直接表示字节数；CAN-FD: 9-15 是编码，不是字节数
const FD_DLC_MAP = { 9: 12, 10: 16, 11: 20, 12: 24, 13: 32, 14: 48, 15: 64 };
function dlcToLen(dlc, isFd) {
  if (dlc <= 8) return dlc;
  if (!isFd) return NaN;              // 经典帧不允许 >8
  return FD_DLC_MAP[dlc] ?? NaN;
}

// ---------- 解析 ----------
function parseFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  const frames = [];
  const issues = [];
  const isCsv = lines[0] && lines[0].toLowerCase().startsWith('timestamp');
  let header = null;
  if (isCsv) header = lines.shift().split(',').map(s => s.trim().toLowerCase());
  const need = ['timestamp', 'id', 'dlc', 'data'];
  if (isCsv) for (const n of need) if (header.indexOf(n) < 0) issues.push({ level: 'fatal', msg: `CSV 缺少必需列: ${n}` });

  for (const [ln, line] of lines.entries()) {
    let f = null;
    if (isCsv) {
      const c = line.split(',');
      const g = k => { const i = header.indexOf(k); return i >= 0 ? (c[i] || '').trim() : ''; };
      const id = parseInt((g('id') || '').replace(/^0x/i, ''), 16);
      if (Number.isNaN(id)) { issues.push({ level: 'warn', msg: `第 ${ln + 2} 行 ID 无法解析` }); continue; }
      const data = Buffer.from(g('data') || '', 'hex');
      const fd = (g('frame_type') || 'classic').toLowerCase() === 'fd';
      f = {
        t: parseFloat(g('timestamp')),
        ch: g('channel') || '0',
        id,
        ext: (g('id_type') || 'std').toLowerCase() === 'ext',
        fd,
        brs: g('brs') === '1',
        esi: g('esi') === '1',
        dlc: parseInt(g('dlc'), 10),
        data,
        err: parseInt(g('rx_err') || '0', 10) || 0,
        state: g('bus_state') || 'ok',
        scenario: g('scenario') || '',
        line: ln + 2
      };
    } else {
      const m = line.match(/^\((\d+\.\d+)\)\s+(\S+)\s+([0-9A-Fa-f]+)#([0-9A-Fa-f]*)/);
      if (!m) { issues.push({ level: 'warn', msg: `第 ${ln + 1} 行无法解析: ${line.slice(0, 40)}` }); continue; }
      const idRaw = m[3];
      const data = Buffer.from(m[4], 'hex');
      f = { t: parseFloat(m[1]), ch: m[2], id: parseInt(idRaw, 16), ext: idRaw.length > 3, fd: false, brs: false, esi: false, dlc: data.length, data, err: 0, state: 'ok', scenario: '', line: ln + 1 };
    }
    if (!f || Number.isNaN(f.t)) { issues.push({ level: 'warn', msg: `第 ${ln + 2} 行时间戳无效` }); continue; }
    frames.push(f);
  }
  return { frames, issues, isCsv };
}

// ---------- 严格校验 ----------
function validate(frames) {
  const issues = [];
  let prevT = -Infinity;
  for (const f of frames) {
    const len = dlcToLen(f.dlc, f.fd);
    if (Number.isNaN(len)) {
      issues.push({ level: 'error', msg: `ID ${f.id.toString(16)} DLC=${f.dlc} 与 frame_type=${f.fd ? 'fd' : 'classic'} 不合法`, line: f.line });
    } else if (len !== f.data.length) {
      issues.push({ level: 'error', msg: `ID ${f.id.toString(16)} DLC=${f.dlc}→应为 ${len} 字节，实际 ${f.data.length} 字节`, line: f.line });
    }
    if (!f.ext && f.id > 0x7ff) issues.push({ level: 'error', msg: `标准帧 ID 0x${f.id.toString(16)} 超出 11 位`, line: f.line });
    if (f.ext && f.id > 0x1fffffff) issues.push({ level: 'error', msg: `扩展帧 ID 0x${f.id.toString(16)} 超出 29 位`, line: f.line });
    if (f.t < prevT - 1e-6) issues.push({ level: 'warn', msg: `时间戳非单调（第 ${f.line} 行）`, line: f.line });
    prevT = f.t;
    if (f.data.length > 64) issues.push({ level: 'error', msg: `载荷 ${f.data.length} 字节超过 64`, line: f.line });
    if (f.state !== 'ok') issues.push({ level: 'warn', msg: `总线状态 ${f.state}（第 ${f.line} 行）`, line: f.line });
  }
  // 去重同类错误，避免刷屏
  const seen = new Map();
  for (const i of issues) { const k = i.level + '|' + i.msg.replace(/\d+/g, '#'); seen.set(k, (seen.get(k) || 0) + 1); }
  return { issues, summary: [...seen.entries()].map(([k, n]) => ({ level: k.split('|')[0], msg: k.split('|')[1], count: n })) };
}

// ---------- 统计 ----------
const key = f => f.ch + ':' + f.id.toString(16).toUpperCase();
const q = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

function perIdStats(frames) {
  const groups = new Map();
  for (const f of frames) { const k = key(f); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  const out = [];
  for (const [k, list] of groups) {
    const dt = [];
    for (let i = 1; i < list.length; i++) dt.push(list[i].t - list[i - 1].t);
    const dlcs = {}; let fd = 0, brs = 0, esi = 0;
    for (const f of list) { dlcs[f.dlc] = (dlcs[f.dlc] || 0) + 1; if (f.fd) fd++; if (f.brs) brs++; if (f.esi) esi++; }
    const len = Math.max(...list.map(f => f.data.length));
    const byteChange = [];
    for (let b = 0; b < len; b++) {
      let ch = 0, tot = 0, flips = 0;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1].data[b], c = list[i].data[b];
        if (a === undefined || c === undefined) continue;
        tot++; if (a !== c) ch++;
        let x = (a ^ c) & 0xff; while (x) { flips += x & 1; x >>= 1; }
      }
      byteChange.push({ byte: b, changeRate: tot ? ch / tot : 0, bitFlipRate: tot ? flips / (tot * 8) : 0 });
    }
    out.push({
      key: k, ch: list[0].ch, id: '0x' + list[0].id.toString(16).toUpperCase(), ext: list[0].ext,
      count: list.length, first: list[0].t, last: list[list.length - 1].t,
      periodMean: dt.length ? mean(dt) * 1000 : 0,
      periodMedian: dt.length ? q(dt, 0.5) * 1000 : 0,
      periodStd: dt.length ? std(dt) * 1000 : 0,
      periodP95: dt.length ? q(dt, 0.95) * 1000 : 0,
      jitterPct: dt.length && mean(dt) > 0 ? (std(dt) / mean(dt)) * 100 : 0,
      dlcs, fdRatio: list.length ? fd / list.length : 0, brsRatio: list.length ? brs / list.length : 0,
      esiCount: esi, byteChange, maxLen: len,
      scenarioCounts: list.reduce((m, f) => { if (f.scenario) m[f.scenario] = (m[f.scenario] || 0) + 1; return m; }, {})
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

// ---------- counter 候选 ----------
// 不自动"认定"counter：只给候选，并区分 strong / weak。
// strong 要求：连续 +1 比例 = 100%、见过满量程、且至少发生一次 满量程→0 回绕。
// 这样可排除"单调递增的传感器值"（如 i%200 这种在非满量程处回零的序列）。
function counterCandidates(stats, frames, opts = {}) {
  const byKey = new Map();
  for (const f of frames) { const k = key(f); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(f); }
  const res = [];
  for (const s of stats) {
    const list = byKey.get(s.key);
    if (!list || list.length < 50) continue;
    for (let b = 0; b < s.maxLen; b++) {
      const cands = [];
      for (const [w, sh] of [[8, 0], [4, 0], [4, 4]]) {
        const mask = (1 << w) - 1;
        const vals = [];
        for (const f of list) if (b < f.data.length) vals.push((f.data[b] >> sh) & mask);
        if (vals.length < 50) continue;
        let plus1 = 0, tot = 0, wraps = 0, maxSeen = 0, minSeen = mask;
        for (let i = 1; i < vals.length; i++) {
          tot++;
          if (((vals[i - 1] + 1) & mask) === vals[i]) plus1++;
          if (vals[i - 1] === mask && vals[i] === 0) wraps++;
        }
        for (const v of vals) { if (v > maxSeen) maxSeen = v; if (v < minSeen) minSeen = v; }
        const ratio = tot ? plus1 / tot : 0;
        const fullRange = maxSeen === mask;
        const strong = ratio >= 0.999 && fullRange && wraps >= 1;
        if (ratio >= 0.9) cands.push({ id: s.id, ch: s.ch, byte: b, shift: sh, width: w, ratio, samples: tot, wraps, maxSeen, minSeen, strong });
      }
      // 去重：同一字节上，只要 8 位字段本身也呈 +1 序列（≥90%），就抑制其覆盖的 4 位候选
      // —— 4 位"成立"往往只是 8 位线性变化的低半字节，属于派生现象，不是独立计数器
      const has8 = cands.some(c => c.width === 8 && c.ratio >= 0.9);
      for (const c of cands) {
        if (has8 && c.width === 4) continue;
        res.push(c);
      }
    }
  }
  res.sort((a, b) => (b.strong - a.strong) || (b.ratio - a.ratio) || (b.wraps - a.wraps));
  const out = res.slice(0, 40);
  if (opts.crossSet) for (const c of out) c.seenInCross = opts.crossSet.has(`${c.ch}:${c.id}:${c.byte}:${c.shift}:${c.width}`);
  return out;
}

// ---------- CRC 候选 ----------
const CRC8_TABLES = {};
function crc8Table(poly) {
  if (CRC8_TABLES[poly]) return CRC8_TABLES[poly];
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let b = 0; b < 8; b++) c = (c & 0x80) ? ((c << 1) ^ poly) & 0xff : (c << 1) & 0xff; t[i] = c; }
  return (CRC8_TABLES[poly] = t);
}
function crc8(buf, poly, init, xorout) {
  const t = crc8Table(poly); let c = init;
  for (const b of buf) c = t[c ^ b];
  return (c ^ xorout) & 0xff;
}
function crc16(buf, poly, init) {
  let crc = init;
  for (const b of buf) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ poly) & 0xffff : (crc << 1) & 0xffff; }
  return crc & 0xffff;
}
const CRC8_VARIANTS = [
  { name: 'SAE-J1850 (0x1D,00,FF)', poly: 0x1d, init: 0x00, xor: 0xff },
  { name: 'AUTOSAR/SAE-H2F (0x2F,FF,FF)', poly: 0x2f, init: 0xff, xor: 0xff },
  { name: 'ATM (0x07,00,00)', poly: 0x07, init: 0x00, xor: 0x00 },
  { name: 'MAXIM (0x31,00,00)', poly: 0x31, init: 0x00, xor: 0x00 }
];
const CRC16_VARIANTS = [
  { name: 'CCITT-FALSE (0x1021,FFFF)', poly: 0x1021, init: 0xffff },
  { name: 'XMODEM (0x1021,0000)', poly: 0x1021, init: 0x0000 },
  { name: 'DNP (0x3D65,0000)', poly: 0x3d65, init: 0x0000 }
];

function crcCandidates(stats, frames) {
  const byKey = new Map();
  for (const f of frames) { const k = key(f); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(f); }
  const res = [];
  const layouts = [];
  for (const withId of [false, true]) for (const withDlc of [false, true]) layouts.push({ name: `${withId ? 'id+' : ''}${withDlc ? 'dlc+' : ''}payload[:-1]`, withId, withDlc });
  for (const s of stats) {
    const list = byKey.get(s.key);
    if (!list || list.length < 100 || s.maxLen < 2) continue;
    for (const v of CRC8_VARIANTS) for (const lay of layouts) {
      let ok = 0, tot = 0;
      for (const f of list) {
        if (f.data.length < 2) continue;
        const parts = [];
        if (lay.withId) { const idb = Buffer.alloc(2); idb.writeUInt16BE(f.id & 0xffff); parts.push(idb); }
        if (lay.withDlc) parts.push(Buffer.from([f.dlc]));
        parts.push(Buffer.from(f.data.subarray(0, f.data.length - 1)));
        const calc = crc8(Buffer.concat(parts), v.poly, v.init, v.xor);
        tot++; if (calc === f.data[f.data.length - 1]) ok++;
      }
      if (tot >= 100 && ok / tot >= 0.95) res.push({ id: s.id, ch: s.ch, algo: v.name, layout: lay.name, ratio: ok / tot, samples: tot, width: 8 });
    }
    for (const v of CRC16_VARIANTS) for (const lay of layouts) {
      let ok = 0, tot = 0;
      for (const f of list) {
        if (f.data.length < 3) continue;
        const parts = [];
        if (lay.withId) { const idb = Buffer.alloc(2); idb.writeUInt16BE(f.id & 0xffff); parts.push(idb); }
        if (lay.withDlc) parts.push(Buffer.from([f.dlc]));
        parts.push(Buffer.from(f.data.subarray(0, f.data.length - 2)));
        const calc = crc16(Buffer.concat(parts), v.poly, v.init);
        const got = f.data.readUInt16BE(f.data.length - 2);
        tot++; if (calc === got) ok++;
      }
      if (tot >= 100 && ok / tot >= 0.95) res.push({ id: s.id, ch: s.ch, algo: v.name, layout: lay.name, ratio: ok / tot, samples: tot, width: 16 });
    }
  }
  return res.sort((a, b) => b.ratio - a.ratio).slice(0, 30);
}

// ---------- 场景 ----------
function scenarioDiff(stats) {
  const scen = new Set();
  for (const s of stats) for (const k of Object.keys(s.scenarioCounts)) scen.add(k);
  const list = [...scen];
  if (list.length < 2) return { scenarios: list, diff: [] };
  const diff = [];
  for (const s of stats) {
    const present = Object.keys(s.scenarioCounts);
    if (present.length === 1 && list.length > 1) diff.push({ id: s.id, ch: s.ch, only: present[0], count: s.count });
  }
  return { scenarios: list, diff };
}

// ---------- 信号合并 ----------
function mergeSignals(frames, stats, signalsPath) {
  if (!signalsPath || !fs.existsSync(signalsPath)) return null;
  const dec = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
  const byIdx = dec.by_index || {};
  const sigStats = new Map(); // "msg.sig" -> values[]
  for (let i = 0; i < frames.length; i++) {
    const rec = byIdx[String(i)];
    if (!rec || !rec.signals) continue;
    for (const [name, val] of Object.entries(rec.signals)) {
      if (!sigStats.has(name)) sigStats.set(name, []);
      if (typeof val === 'number') sigStats.get(name).push(val);
    }
  }
  const out = [];
  for (const [name, vals] of sigStats) {
    if (vals.length < 10) continue;
    const mn = Math.min(...vals), mx = Math.max(...vals);
    out.push({ signal: name, count: vals.length, min: mn, max: mx, mean: +mean(vals).toFixed(4), range: mx - mn, uniform: mx === mn });
  }
  out.sort((a, b) => b.range - a.range);
  return { meta: dec.meta || {}, signals: out };
}

// ---------- 报告 ----------
function buildReport(result) {
  let md = `# CAN 抓包分析报告\n\n`;
  md += `- 文件: \`${result.input}\`\n- 帧数: ${result.frames}\n- 时长: ${result.durationSec} s\n- 唯一 ID: ${result.uniqueIds}\n- 通道: ${result.buses.join(', ')}\n`;
  md += `- 帧类型: classic=${result.frameTypes.classic} FD=${result.frameTypes.fd} BRS=${result.frameTypes.brs} ESI=${result.frameTypes.esi}\n`;
  md += `- 错误帧: ${result.errorFrames}；总线状态: ${result.busStates.join(', ')}\n\n`;

  md += `## 0. 数据校验\n\n`;
  if (!result.validation.length) md += `未发现格式问题。\n`;
  else {
    md += `| 级别 | 问题 | 次数 |\n|---|---|---|\n`;
    for (const v of result.validation) md += `| ${v.level} | ${v.msg} | ${v.count} |\n`;
    md += `\n> DLC 是**编码值**：经典帧 0–8 为字节数；FD 帧 9–15 分别表示 12/16/20/24/32/48/64 字节，分析器按实际 payload 长度校验。\n`;
  }

  md += `\n## 1. 位速率/物理层自检\n\n`;
  md += result.frameTypes.fd > 0
    ? `检测到 ${result.frameTypes.fd} 个 FD 帧${result.frameTypes.brs ? `（其中 ${result.frameTypes.brs} 个 BRS）` : '（无 BRS）'}。\n`
    : `**未检测到 FD 帧**——可能是经典 CAN 总线，或采样率/位速率/帧格式设置不对（FD 帧可能被当成错误帧丢弃）。\n`;
  if (result.errorFrames > 0) md += `\n⚠️ 存在 ${result.errorFrames} 帧带错误计数，需检查终端电阻/支线长度/位速率。\n`;

  md += `\n## 2. ID 统计（按帧数排序，前 40）\n\n`;
  md += `| ID | 通道 | 帧数 | 周期均值(ms) | 中位数 | 抖动% | DLC | FD | BRS | 载荷长度 |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const s of result.ids.slice(0, 40)) {
    md += `| ${s.id}${s.ext ? '(ext)' : ''} | ${s.ch} | ${s.count} | ${s.periodMean.toFixed(2)} | ${s.periodMedian.toFixed(2)} | ${s.jitterPct.toFixed(1)} | ${Object.keys(s.dlcs).join('/')} | ${(s.fdRatio * 100).toFixed(0)}% | ${(s.brsRatio * 100).toFixed(0)}% | ${s.maxLen} |\n`;
  }

  md += `\n## 3. 变化最剧烈的字节（Top 20）\n\n`;
  const byteTop = [];
  for (const s of result.ids) for (const b of s.byteChange) if (s.count > 50) byteTop.push({ id: s.id, ch: s.ch, ...b, count: s.count });
  byteTop.sort((a, b) => b.changeRate - a.changeRate);
  md += `| ID | 字节 | 变化率 | 位翻转率 | 帧数 |\n|---|---|---|---|---|\n`;
  for (const b of byteTop.slice(0, 20)) md += `| ${b.id} | ${b.byte} | ${(b.changeRate * 100).toFixed(1)}% | ${(b.bitFlipRate * 100).toFixed(2)}% | ${b.count} |\n`;

  md += `\n## 4. Counter 候选\n\n`;
  md += result.counters.length
    ? `| ID | 字节 | 位偏移 | 位宽 | 等级 | 连续+1比例 | 回绕次数 | 最大观测 | 跨会话 | 样本 |\n|---|---|---|---|---|---|---|---|---|---|\n` +
      result.counters.map(c => `| ${c.id} | ${c.byte} | ${c.shift} | ${c.width} | ${c.strong ? '**strong**' : 'weak'} | ${(c.ratio * 100).toFixed(2)}% | ${c.wraps} | ${c.maxSeen} | ${c.seenInCross === undefined ? '—' : (c.seenInCross ? '是' : '否')} | ${c.samples} |`).join('\n')
    : `无（连续 +1 比例 ≥ 90% 的字段未找到）`;
  md += `\n\n> 这里只是**候选**，不是结论。strong 的判断条件是：连续 +1 比例 100% + 见过满量程 + 至少一次 满量程→0 回绕；\n`;
  md += `> 但"单调变化的传感器值"仍可能满足其中部分条件，必须跨 200 帧、多个上电周期（或多次抓包）复核。\n`;

  md += `\n## 5. CRC/Checksum 候选\n\n`;
  md += result.crcs.length
    ? `| ID | 算法 | 输入布局 | 匹配率 | 样本 |\n|---|---|---|---|---|\n` + result.crcs.map(c => `| ${c.id} | ${c.algo} | ${c.layout} | ${(c.ratio * 100).toFixed(2)}% | ${c.samples} |`).join('\n')
    : `无（≥95% 匹配的组合未找到；不代表没有校验，可能是自定义算法或包含 counter/DataID）`;
  md += `\n\n> 最后一字节频繁变化不等于 CRC；需验证输入是否包含 CAN ID、DLC、counter。\n`;

  md += `\n## 6. 场景对比\n\n`;
  if (result.scenarios.length < 2) md += `仅检测到场景: ${result.scenarios.join(', ') || '（无）'}，无法对比。\n`;
  else {
    md += `场景: ${result.scenarios.join(', ')}\n\n`;
    md += result.scenarioOnly.length
      ? `只出现在单一场景的 ID：\n\n| ID | 通道 | 场景 | 帧数 |\n|---|---|---|---|\n` + result.scenarioOnly.map(d => `| ${d.id} | ${d.ch} | ${d.only} | ${d.count} |`).join('\n')
      : `未发现只在单一场景出现的 ID。`;
  }

  if (result.signals) {
    md += `\n## 7. DBC 信号解码（cantools）\n\n`;
    if (result.signals.meta && result.signals.meta.dbc) md += `- DBC: \`${result.signals.meta.dbc}\`\n`;
    if (result.signals.meta && result.signals.meta.messages != null) md += `- 报文数: ${result.signals.meta.messages}\n`;
    md += `\n| 信号 | 样本 | 最小 | 最大 | 均值 | 变化范围 |\n|---|---|---|---|---|---|\n`;
    for (const s of result.signals.signals.slice(0, 40)) md += `| ${s.signal} | ${s.count} | ${s.min} | ${s.max} | ${s.mean} | ${s.range} |\n`;
    md += `\n> 变化范围 > 0 的信号在本次窗口内有变化；范围 = 0 只说明**本次采集窗口内没有变化**，\n`;
    md += `> 它可能是配置常量，也可能是当前场景未触发的状态/枚举/故障位/使能位/保留位——需增加场景后再判断。\n`;
  }
  return md;
}

// ---------- 自测 ----------
function selfTest() {
  const failures = [];
  const assert = (cond, msg) => { if (!cond) failures.push(msg); };
  // 确定性 LCG
  let seed = 123456789;
  const rnd = () => (seed = (1103515245 * seed + 12345) & 0x7fffffff) / 0x7fffffff;

  const frames = [];
  let t = 1729000000.0;
  const push = (id, data, scenario, fd = true, brs = true) => {
    frames.push({ t, ch: '0', id, ext: false, fd, brs, esi: false, dlc: fd ? (data.length <= 8 ? data.length : (data.length === 12 ? 9 : data.length === 16 ? 10 : data.length === 20 ? 11 : data.length === 24 ? 12 : data.length === 32 ? 13 : data.length === 48 ? 14 : 15)) : data.length, data: Buffer.from(data), err: 0, state: 'ok', scenario, line: frames.length + 2 });
    t += 0.01 + rnd() * 0.0005;
  };
  // 0x123: 300 帧，byte6 counter，byte7 CRC8 SAE-J1850(payload[0..6])
  let ctr = 0;
  for (let i = 0; i < 300; i++) {
    const d = Buffer.alloc(8);
    d[0] = i % 200; d[1] = (i * 3) & 0xff; d[2] = 0x10; d[5] = 0x20; d[6] = ctr;
    d[7] = crc8(d.subarray(0, 7), 0x1d, 0x00, 0xff);
    push(0x123, d, i < 150 ? 'idle' : 'lcc_on');
    ctr = (ctr + 1) & 0xff;
  }
  // 0x1A5: 只在 lcc_on
  for (let i = 0; i < 100; i++) push(0x1a5, [i & 0xff, 0, 0x80, 0x40, 0, 0, 0, 0], 'lcc_on', false, false);

  const v = validate(frames);
  assert(v.issues.filter(i => i.level === 'error').length === 0, 'validation: 不应有 error 级问题');
  const stats = perIdStats(frames);
  assert(stats.length === 2, `stats: 期望 2 个 ID，实际 ${stats.length}`);
  const s123 = stats.find(s => s.id === '0x123');
  assert(!!s123, 'stats: 缺少 0x123');
  assert(s123 && Math.abs(s123.periodMean - 10) < 0.5, `period: 期望 ~10ms，实际 ${s123 && s123.periodMean}`);
  assert(s123 && s123.fdRatio === 1 && s123.brsRatio === 1, 'fd/brs: 0x123 应全为 FD+BRS');

  const ctrs = counterCandidates(stats, frames);
  const c6 = ctrs.find(c => c.id === '0x123' && c.byte === 6 && c.width === 8);
  assert(!!c6 && c6.strong === true && c6.ratio === 1, 'counter: 未识别 byte6 的强 8 位 counter');
  assert(!ctrs.some(c => c.id === '0x123' && c.byte === 0 && c.strong), 'counter: byte0(i%200) 不应被判为 strong');
  assert(!ctrs.some(c => c.id === '0x123' && c.byte === 6 && c.width === 4), 'counter: 8 位成立时不应再报同字节 4 位候选');

  const crcs = crcCandidates(stats, frames);
  const crc = crcs.find(c => c.id === '0x123' && c.algo.startsWith('SAE-J1850') && c.layout === 'payload[:-1]');
  assert(!!crc && crc.ratio === 1, 'crc: 未识别 SAE-J1850 payload[:-1]');

  const sc = scenarioDiff(stats);
  assert(sc.diff.some(d => d.id === '0x1A5' && d.only === 'lcc_on'), 'scenario: 未识别 0x1A5 只在 lcc_on');

  // DLC 边界
  assert(dlcToLen(15, true) === 64, 'dlc: FD DLC=15 应为 64 字节');
  assert(Number.isNaN(dlcToLen(12, false)), 'dlc: classic DLC=12 应非法');
  assert(dlcToLen(8, false) === 8, 'dlc: classic DLC=8 应为 8');

  if (failures.length) {
    console.error('SELF-TEST FAILED:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`SELF-TEST PASSED (${frames.length} frames, ${stats.length} ids, ${ctrs.length} counters, ${crcs.length} crcs)`);
  process.exit(0);
}

// ---------- 主流程 ----------
if (process.argv.includes('--self-test')) selfTest();

const argv = process.argv.slice(2);
const input = argv[0];
if (!input || input.startsWith('--')) { console.error('usage: node analyze_can.js <capture.csv|dump.txt> [--out r.md] [--json r.json] [--signals s.json] | --self-test'); process.exit(2); }
const opt = {};
for (let i = 1; i < argv.length; i += 2) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1];

const parsed = parseFile(input);
const frames = parsed.frames.sort((a, b) => a.t - b.t);
if (!frames.length) { console.error('no frames parsed'); process.exit(1); }
const val = validate(frames);
const stats = perIdStats(frames);

// 可选的第二次抓包（不同上电周期），用于 counter 候选的跨会话复核
let crossSet = null;
if (opt.cross) {
  if (!fs.existsSync(opt.cross)) { console.error('cross 文件不存在: ' + opt.cross); process.exit(2); }
  const cframes = parseFile(opt.cross).frames.sort((a, b) => a.t - b.t);
  if (cframes.length) {
    crossSet = new Set(counterCandidates(perIdStats(cframes), cframes)
      .map(c => `${c.ch}:${c.id}:${c.byte}:${c.shift}:${c.width}`));
  }
}

const counters = counterCandidates(stats, frames, { crossSet });
const crcs = crcCandidates(stats, frames);
const sc = scenarioDiff(stats);
const signals = mergeSignals(frames, stats, opt.signals);

const result = {
  input: path.basename(input),
  frames: frames.length,
  durationSec: +(frames[frames.length - 1].t - frames[0].t).toFixed(3),
  uniqueIds: stats.length,
  buses: [...new Set(frames.map(f => f.ch))],
  frameTypes: { classic: frames.filter(f => !f.fd).length, fd: frames.filter(f => f.fd).length, brs: frames.filter(f => f.brs).length, esi: frames.filter(f => f.esi).length },
  errorFrames: frames.filter(f => f.err > 0).length,
  busStates: [...new Set(frames.map(f => f.state))],
  parseIssues: parsed.issues,
  validation: val.summary,
  scenarios: sc.scenarios,
  ids: stats, counters, crcs, scenarioOnly: sc.diff, signals
};

const md = buildReport(result);
if (opt.out) fs.writeFileSync(opt.out, md, 'utf8');
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(result, null, 2), 'utf8');
if (!opt.out) process.stdout.write(md);
console.log(`\n[ok] frames=${frames.length} ids=${stats.length} counters=${counters.length} crcs=${crcs.length}${signals ? ' signals=' + signals.signals.length : ''}${opt.out ? ' -> ' + opt.out : ''}`);
