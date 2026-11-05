# tools/

全部为 Node.js（>=18），无 npm 依赖；直接 `node tools/xxx.js`。

## 管线

| 脚本 | 作用 | 用法 |
|---|---|---|
| `decode_capture2.js` | ndjson → 50 Hz 信号 CSV（推荐） | `node tools/decode_capture2.js cap.ndjson out.csv` |
| `carstate_offline.js` | CSV/ndjson → CarState JSONL + summary | `node tools/carstate_offline.js cap.ndjson out_prefix` |
| `verify_carstate.js` | 结构/不变式校验 | `node tools/verify_carstate.js x.carstate.jsonl` |
| `carstate_offline_test.js` | 11 项夹具自测 | `node tools/carstate_offline_test.js` |
| `decode_capture.js` | 旧版解码器（保留对照） | 同上 |

## 数据质量与统计

| 脚本 | 作用 |
|---|---|
| `dq_gate.js` | 数据准入：时间基、重复时间戳、逐 ID 在线率 |
| `id_inventory.js` | 全 ID 普查（帧数/周期/payload 多样性） |
| `gear_check.js` | 档位 × 轮向一致性 |
| `acc_cross.js` | 0x0B7 ACC 状态 × 0x083 ACC FuncMode 交叉验证 |
| `n12_longacc_check.js` | `IBC_LongitAcceAct` vs 轮速差分 |
| `build_control_inventory.js` | 生成 `analysis/CAN控制信息清单` + JSON |
| `regen_products.js` | 批量重生成产物（指向本机路径，需改） |

## E2E

| 脚本 | 作用 |
|---|---|
| `e2e_check.js` | 任意 ndjson/ID：查已知表命中率，或**自动反推** 16 项 seed 表 |
| `verify_e2e.js` | 用 `e2e/e2e_seed_tables.json` 全量复验 |
| `affine_by_counter.js` | 按 counter 分组的 GF(2) 仿射检验（历史证据） |
| `crc8_counter_salt.js` | 普通 CRC-8 全参数搜索（历史证据，未命中） |

## 采集与通用分析

| 脚本 | 作用 |
|---|---|
| `can_live.js` | CRP1 over WebSocket 实时采集（第三方协议，仅参考） |
| `analyze_can.js` / `check_capture.js` | 抓包通用统计与格式检查 |

## 示例

```bash
node tools/e2e_check.js fixtures/59c08f67.ndjson
node tools/carstate_offline.js fixtures/59c08f67.ndjson /tmp/out
node tools/verify_carstate.js /tmp/out.carstate.jsonl
```