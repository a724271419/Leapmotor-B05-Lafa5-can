# fixtures/

一个小会话（`59c08f67`，108 行，约 15 s），用于快速验证工具链。

| 文件 | 说明 |
|---|---|
| `59c08f67.ndjson` | 原始 CAN-FD 帧（每行一个 JSON） |
| `59c08f67.signals.csv` | `decode_capture2.js` 的 50 Hz 输出 |
| `59c08f67.carstate.jsonl` | `carstate_offline.js` 的 CarState 影子 |
| `59c08f67.summary.json` | 回归摘要（含硬不变式计数） |

```bash
node tools/decode_capture2.js fixtures/59c08f67.ndjson /tmp/sig.csv
node tools/carstate_offline.js fixtures/59c08f67.ndjson /tmp/cs
node tools/verify_carstate.js /tmp/cs.carstate.jsonl   # 期望 hard invariant violations=0
```