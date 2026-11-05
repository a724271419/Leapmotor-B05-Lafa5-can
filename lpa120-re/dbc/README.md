# dbc/（本仓库不包含 DBC 文件）

DBC 矩阵来自车辆 OTA 包内的加密文件，版权归原权利人，**不随本仓库分发**。

## 本车实际用到的矩阵（供自行准备）

| 文件 | 总线 | 说明 |
|---|---|---|
| `C_CANFD.dbc` | **CCAN（底盘）** | 70 报文 / 1,790 信号，主战场 |
| `COM_CAN.dbc` | COM-CAN | 拨杆/档位/组合开关 |
| `B_CANFD.dbc` | 车身 | BCM/灯光（`0x1F3`） |
| `P_CANFD.dbc` | 动力 | — |
| `A_CANFD.dbc` / `EX_CAN.dbc` / `UDS_CAN.dbc` | 其它 | — |
| `ETH_CAN.dbc` / `ETH_CANFD.dbc` | 以太网映射 | `0x23C` 等只在此出现 |
| `MRS_CANFD.dbc` / `BSDR_CANFD.dbc` | 雷达 | 本车未配 |

## 本仓库内可用的替代资料

- `analysis/DBC权威信号表.md`：本项目实际使用的信号（位/因子/偏移/接收方）；
- `analysis/信号解码表.md`、`analysis/0x083_完整解码表.md`：按报文整理的解码；
- `analysis/DBC_vs_实测_全量对比.md`：DBC 与实车差异的核对结论。

> 这些表格同样是 DBC 的衍生内容，版权归属不变；仅用于互操作研究。

## 如果你有自己的 DBC

把 `.dbc` 放到本目录即可；工具不依赖 DBC（`decode_capture2.js` 公式内置），
只有需要扩展解码时才用得上。`.gitignore` 已默认排除 `*.dbc`。