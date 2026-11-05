# LPA120（零跑 B05 / Lafa5）CAN 逆向与 openpilot 可行性资料

> 车型：Leapmotor B05 / Lafa5 515Pro（LPA120），OS 3.01.20  
> 结论时间：2026-11-05  
> 性质：个人研究，与厂家无关；只读分析为主，不含注入实现。

## 一句话状态

```
读：CCAN 39 个 ID 全部解码（以解密 DBC 为权威），CarState 9 个核心字段可用
写：0x083 的 E2E 已完全复原（CRC8_H2F + 56 张 seed 表），剩余障碍是发送仲裁与安全红线
感知：0x2D1/0x2D5（车道线/目标）布局已知，但不在已抓的 CCAN 上
```

## 这个仓库是什么

对一辆车的 CAN 总线做逆向后留下的**可复现资料包**：

- **文档**：架构、解码、行为、失败记录、决策台账、E2E 算法、控制接入设计；
- **DBC 说明**：本车用到的 11 份矩阵清单与用途（文件本身不分发）；
- **E2E**：`CRC8_H2F + seed[counter]` 算法与 56 张表（17 条已用实车帧互证）；
- **工具**：ndjson → 50 Hz CSV → CarState JSONL 的离线管线，以及数据质量闸门；
- **样例**：一个小会话的输入与输出，用来验证工具链。

原始抓包（1.17 GB）、整车镜像（约 20 GB）与派生 CSV（576 MB）**不入库**，见下文“数据”。

## 快速开始

```bash
# 需要 Node.js >= 18，无 npm 依赖
node tools/e2e_check.js fixtures/59c08f67.ndjson        # E2E 命中率 / 自动反推 seed 表
node tools/carstate_offline.js fixtures/59c08f67.ndjson /tmp/cs
node tools/verify_carstate.js /tmp/cs.carstate.jsonl     # 期望 hard invariant violations=0
node tools/carstate_offline_test.js                      # 11/11 夹具
```

## 目录

| 目录 | 内容 |
|---|---|
| `docs/` | 12 篇交接文档（00 总览 + 01–11），从架构到控制接入设计 |
| `dbc/` | 说明页（**DBC 本身不随仓库分发**，见 `NOTICE.md`） |
| `e2e/` | 56 张二进制表 + 37 张观测反推表 |
| `analysis/` | 解码表、控制信息清单、openpilot 视角总表、DBC 对比 |
| `tools/` | 离线管线、数据质量、E2E 工具 |
| `fixtures/` | 一个会话的输入/输出样例 |
| `data/` | 抓包清单（SHA-256） |

完整文件树见 [`资料说明.md`](资料说明.md)。

## 文档索引

| 文件 | 主题 |
|---|---|
| `docs/00_交接总览.md` | 阅读顺序、覆盖自检、外部依赖 |
| `docs/01_architecture.md` | E/E 架构、总线拓扑、针脚、软件数据链 |
| `docs/02_assets.md` | 资产清单（路径/大小/用途） |
| `docs/03_flows_findings.md` | 关键调用关系、已验证事实 |
| `docs/04_failures_gotchas.md` | 失败方案与工具坑（**最省时间**） |
| `docs/05_progress_next.md` | 进度、未完成项、下一步（N1–N14） |
| `docs/06_completeness_check.md` | 决策台账 D1–D53、覆盖矩阵、被推翻清单 |
| `docs/07_can_pipeline_and_decoding.md` | 采集链路、39 个 ID、信号解码表 |
| `docs/08_timebase_data_quality.md` | 时间基（1 ms）、在线率、数据准入 |
| `docs/09_结论台账.md` | 按 ID 可引用的结论 + U1–U13 未验证项 |
| `docs/10_E2E_CRC与seed表.md` | **E2E 算法与 56 张 seed 表** |
| `docs/11_控制接入方案.md` | 两种 MITM 拓扑、灯光通道、硬件要求（设计稿） |

## 关键结论（便于快速判断是否值得读）

1. **解码以 DBC 为准**：反汇编给的 5 处符号是错的（角度/转向扭矩/电机扭矩/LKA 转角/ACC 目标加速度），已按 DBC 更正并复验；
2. **E2E 已解**：`byte0 = CRC8_H2F(data[1..len-1] || seed[counter])`，poly 0x2F / init 0xFF / xorout 0xFF；56 张表，18 条报文约 130 万帧 0 失配；
3. **0x083 的发送方是 ADDC（域控）**，不是摄像头 FSC；FSC 只是解析端；
4. **打转向灯 = LCC 暂停并自动恢复**，不是退出（11 次样本 9 次恢复）；
5. **0x23C（灯光请求）只在以太网 DBC 里**，不是 CAN 帧；B-CAN 上真正的灯光帧是 `0x1F3`。

## 数据（未入库）

| 数据 | 体积 | 说明 |
|---|---:|---|
| 实车抓包（31 个 ndjson） | 1.17 GB | 每文件 SHA-256 见 `data/captures_manifest_2026-11-04.json` |
| OTA/整车镜像 | ~20 GB | 含厂家内容，不宜公开 |
| DBC 矩阵（11 份） | 5.7 MB | 厂家版权，**已从仓库移除** |
| 派生 CSV/JSONL（31 会话） | 576 MB | 可由工具从 ndjson 重新生成 |

## 安全与法律

- 本项目**不包含**任何向车辆总线注入报文的实现；`docs/11` 是设计方案与验证顺序，属于红线之外的讨论；
- DBC 与车辆数据的版权归原权利人，仅用于互操作研究，见 `NOTICE.md`；
- 任何实车操作都可能造成伤害或触发故障码，风险自负。

## 许可

- 代码（`tools/`）：MIT；
- 文档（`docs/`、`analysis/`）：CC BY-NC-SA 4.0；
- `dbc/`、`data/`、`fixtures/`：见 `NOTICE.md`。
