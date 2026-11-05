# 01 · 架构

## 1. 车辆 E/E 总览

```
                    ┌──────────────── 车机（SA8155 双系统）────────────────┐
                    │  Android 11 (user/test-keys)  │  QNX (hypervisor)    │
                    │  CarService / VHAL 2.0        │  lpCanAnalysis       │
                    │  lpGateway / lpGwIviCan 守护   │  lpCanEngine         │
                    │  ← DDS domain 10 / eth0 →     │  lpIdsM / lpIdsR     │
                    └───────────────┬───────────────┴──────────┬───────────┘
                                    │ eth0 192.168.1.3          │
                                    │                           │
        ┌───────────────────────────┴───────────┐     ┌─────────┴──────────┐
        │ 多域融合控制器 EL215-3 / EL216         │     │ 前视单目摄像头 FSC  │
        │ 12V 常电 + ON2C                        │     │ EL231（20 针）      │
        └───────┬───────────────┬───────────────┘     └────────────────────┘
                │               │
          CCAN (FD)        COM-CAN (500k)
                │               │
    ┌───────────┼───────┬───────┴────┐
    │           │       │            │
   EPS         IBC      FSC         DS003（安全气囊）
 CH020-2     CH024    EL231        DS003-1
```

## 2. 11 条总线（`/opt/usr/conf/canids/ids_analyser.ini` 原文）

```
can_bus_num=11
can_bus_config0 = 0,  500,  UDS_CAN.dbc
can_bus_config1 = 1,  2000, C_CANFD.dbc
can_bus_config2 = 2,  2000, P_CANFD.dbc
can_bus_config3 = 3,  2000, B_CANFD.dbc
can_bus_config4 = 4,  500,  COM_CAN.dbc
can_bus_config5 = 5,  2000, A_CANFD.dbc
can_bus_config6 = 6,  2000, MRS_CANFD.dbc
can_bus_config7 = 7,  2000, BSDR_CANFD.dbc
can_bus_config8 = 8,  2000, ETH_CANFD.dbc
can_bus_config9 = 9,  500,  EX_CAN.dbc
can_bus_config10= 10, 500,  ETH_CAN.dbc
DBC 路径：/opt/usr/conf/canids/dbc/
```

⚠️ 单个 `2000` 未区分仲裁段/数据段，也未确认 BRS —— **必须实测**。

## 3. 三套"通道编号"互不相同（易混淆，务必分清）

| 编号体系 | 来源 | 取值 | 语义 |
|---|---|---|---|
| `can_bus_config%d` | `ids_analyser.ini` | 0–10 | IDS 的 DBC 分组 |
| `can_chn` | `filter_lpCanAnalysis.json` 等 5 张 filter 表 | 0,2,4,5,6,7,9,11,12,13,14 | **网关物理端口编号**（超出 0–10） |
| DDS domain | `netcfg_lp*.xml` | 10 | Fast-DDS 域号 |

**已裁决**：`can_chn` **不等于** `can_bus_config` 索引（filter 用了 11–14，ini 只到 10）。
内容交叉后判定：**`can_chn=2` 是 CCAN**（含 0x18D/0x83/0x2D1/0x2D5/0x182-185/0x227/0x2A3/0x3CE/0x290）。

filter 表各通道 ID 数（车上实配）：ch2=20, ch4=14, ch5=32, ch6=24, ch7=5, ch12=24, ch13=6, ch14=3（合计 128）。

## 4. CCAN 物理成员与针脚

| 节点 | 接插件 | 针脚 | 备注 |
|---|---|---|---|
| EPS | CH020-2 | 5=CCAN-H, 6=CCAN-L, 8=ON3 | 电源 CH020-1 1/2 |
| IBC | CH024 | 39=CCAN-H, 40=CCAN-L | 另 33/34=COM-CAN，2/3 左 EPB，12/13 右 EPB |
| FSC 相机 | EL231 | 7=CCAN-H(红黑), 17=CCAN-L(蓝黑) | 见 §5 |
| 域控（**ADDC 推断**） | EL215-3 | 13=CCAN-L, 14=CCAN-H；15/16=ACAN；17/18=PCAN；**19=BCAN-L, 20=BCAN-H** | 电源 EL215-1/2，GND EL215-6；多域控制器特征与 DBC 的 ADDC 一致（推断，未物理确认） |
| 安全气囊 | DS003-1 | 22=CCAN-L, 23=CCAN-H | |
| 组合开关 | EL091-2 | 14=COM-CANH、15=COM-CANL；8/9=方向盘开关 CAN-H/L；20=P 档输出 | **拨杆/按键不接 CCAN**（见下） |

**COM-CAN**：IBC CH024-33/34 ↔ EL215-4-3/4（500 kbps），并且**组合开关 EL091-2 的 14/15 也挂在这条总线上** —— 所以它不是点对点，而是至少 3 节点的多点总线。
**方向盘开关 CAN**：EL091-2 的 8/9 是另一路独立 CAN（方向盘按键），不进 CCAN。

**ADDC = EL215 的证据链**：DBC 发送节点名 `ADDC`；E2E 表把 0x083 命名为 `HPCADAS_83`；CRC 生成代码在 QNX `lpAdasInput`/`lpCanEngine`；维修手册里 CCAN 上唯一的多域/HPC 节点是 EL215，且 EL215-3 同时带 CCAN/ACAN/PCAN/BCAN。**结论仍属高置信推断**，物理确认方法见 `11_控制接入方案_2026-11-05.md` §2.2。

**灯光通道**：`0x23C ADDC_23C` **只存在于 ETH_CAN/ETH_CANFD**（13 信号、无 CRC/计数器）→ 以太网侧映射，**不是 CAN 帧**；B-CAN 上真正的帧是 `0x1F3 HPCBCM_1F3`（32B、CRC+计数器、发往 ZCUL/ZCUR/ZCUB/AHLL）。详见 `11_控制接入方案_2026-11-05.md` §3，位图见 §3.5。

由此：换挡拨杆与方向盘按键的**动作**只在 COM-CAN / 方向盘开关 CAN 上，CCAN 只能看到 VCU 消化后的结果（0x0B6 档位、0x0B7 ACC 状态）。这也是“按键本体在 CCAN 上找不到”的物理原因，不是信号缺失。

**但档位不需要 COM-CAN**：`0x0B6 b12[6:5]`（0=P 1=R 2=N 3=D）是 VCU 消化后的权威结果，11 条会话、数千运动帧验证（前进码 3、倒车码 1 各 100%）。拨杆只是“意图”，档位是“结果”——喂 CarState 用后者即可。COM-CAN 的唯一增量是拨杆的**瞬时动作**（单拨/双拨），属研究性需求。
**ENET 100M**：FSC EL231-11/12 ↔ EL215-4-16/17。

## 5. FSC 前视摄像头 EL231（带电动遮阳帘版本，本车）

接插件型号 `IMSA-13065S-2-20A`（IRISO，1.0mm 间距，2×10）。

| 针 | 线色 | 功能 |
|---|---|---|
| **7** | 0.35 R/B | **CCAN-H** |
| 8 | 0.35 Y | 摄像头加热电源输出 |
| 9 | 0.35 B | 接地 1 |
| 10 | 0.35 R/Br | 蓄电池电源 1 |
| 11 | 0.35 W | ENET-100M-MDIP |
| 12 | 0.35 W/G | ENET-100M-MDIN |
| **17** | 0.35 L/B | **CCAN-L** |
| 18 | 0.35 R/L | ON2C 电源（行车档 12V） |
| 19 | 0.35 B | 接地 2 |
| 20 | 0.35 R/Br | 蓄电池电源 2 |

其余针（1–6, 13–16）为空。

⚠️ **手册针号 ≠ 插座丝印**：实测插座可见针为 1–8 + 18 + 20（也是 10 个），与手册编号不是同一套。**定针必须靠万用表**（对地 0Ω = GND；两针间 60Ω = CAN 对）。

## 6. ECU 清单（UDS 0x22 只读，28 个）

```
0x777 ICHS 3.16.0907   0x796 TBOX 1.03.50    0x7C4 TBOX-S 1.02.79
0x723 VIU 5.00.21      0x727 MZCU 2.02.28    0x780 CDU(域控) 0.00.17
0x752 CCM 1.00.08      0x756 FSC 2.50.30     0x735 EPS 1.12.01
0x736 IBC 3.80.01      0x7F1 ACU 1.00.00     0x721 MCUA
0x722 BMU              0x7B0 TMS             0x7B7 TCM
0x781 PTG              0x782 SWB             0x776 WPC
0x784 BLE              0x7C3 NFC             0x754 UPA(超声波)
0x762/763/7D3/7D4 SVV×4  0x730/731 HLF×2     0x742(未答型号)
```

**关键否定结论**：**清单中没有任何毫米波雷达 ECU** → 本车未配前雷达、未配 BSD 雷达（与"后视镜无警示灯"一致）。

## 7. 软件数据链（CAN → 应用）

### 7.1 QNX 侧

```
原始 CAN 帧
  → lpCanAnalysis / lpCanEngine（按 11 条 DBC 分组解析）
  → /leap/candata/msg（DDS，transType=2：共享内存+网络，ip=192.168.1.1）
  → /leap/candata/msginfo（订阅端）
  → /leap/CanAnalysis/signalInfo
```

配置证据：`conf_all/lpCanAnalysis_CarControlApp.xml`、`profile_lpCarControl.xml`。

### 7.2 Android 侧

```
lpGateway 守护进程        发布 /leap/ivi/public/p/lpGwIviCan（CAN 数据）
                          订阅 /leap/hpc/public/p/lpGateway（控制命令，红线）
lpGwIviCan 守护进程       订阅 /leap/ivi/public/p/lpGwIviCan
                          发布 /leap/hpc/public/p/lpGateway
                          （另订阅 /leap/hpc/public/b/adasdata、
                            /leap/adas/public/b/planning/comfortmotion）
配置：/system/etc/gateway/netcfg_lpGateway.xml、netcfg_lpGwiviCan.xml（domain 10, eth0）
SOME/IP 桥：/system/etc/gateway/vsomeip.json（service 39168，数百 eventid）
```

### 7.3 到应用层

```
DDS → VHAL 2.0（android.hardware.automotive.vehicle@2.0::IVehicle）
    → CarService（注册了 PERF_STEERING_ANGLE 0x11600209、
                 PERF_VEHICLE_SPEED 0x11600207、GEAR_SELECTION 0x11400400 等）
    → 应用（需 CAR_INFO 权限）
```

## 8. FSC 相机侧（0x083 的解析端，不是发送端）

- 主程序 `/bin/Challenge`（12,518,196 B，ELF32 ARM **Thumb-2**）
- 0x083 解析函数 @ `0x7c5c2`，源文件名断言串暴露：`Vehicle/CAN/CanHpcAdasParse_83.cpp`
- 入口 `cmp r2, #0x3f` → **载荷上限检查（≤63）**；实车帧长 **32 字节 / 20 ms**（2026-11-02 实测）
- 解析体从 **byte3** 起 → **byte0–2 的 counter/CRC 在调用者（unpack 分发层）**
- 字段三组：`ACCCmd` / `LKACmd` / `AEBCmd`
- 缩放常量（literal pool）：`0.05 / 0.1 / 0.02 / 1.16 / 650 / 0.0005 / 0.75`
- 已解：`SteerTarget = raw16×0.02 − 650`（byte13–14，DBC 权威）、FuncMode 在 byte12[2:0]；**byte15 是 LKA 状态字节（0x00/0x64），不是 SteerRate**（2026-11-03 实测更正）

**注意**：`libDAEIVS_ADAS_Can.so`（AArch64，25 个 parse 符号）**没有 0x83**——0x083 只在 Challenge 里。

**发送端是 ADDC（域控）**：`C_CANFD.dbc` 的 `BO_ 131 ADDC_83: 32 ADDC`，接收方含 EPS/VCU/IBC/ICU/ACU/IVI/LMC。FSC 只是解析方（`CanHpcAdasParse_83.cpp` 是 parse，不是 send）。

## 9. TBOX（MDM9607 / ARM32）

- `oemapp.ubi` → 5 卷（certchain/hashtree/roothash/signature/oemapp），oemapp 是 SquashFS，111 文件
- 服务：`lpUds`、`lpSecuritySrv`、`lpKey`、`lpIdsM`、`lpEthids`、`liblpDoIPServer.so`
- DDS 通道：`/leap/tbox/can`、`/leap/tbox/uds/msg`、`/leap/remoteCtrl/msg` 等
- `lpUds` 内含 `UpdateFctRxCan`、`FCT_CAN 0x%03X`、`E2E crc err canID:0x%03x` → TBOX 能看 CAN 帧但受 E2E + 安全元件校验
- **无 SocketCAN、无 can0/can1** → 不直连底盘总线

## 10. 三个"编号系"之外的两个重要区分

| 概念 | 说明 |
|---|---|
| `eventid`（SOME/IP） | vsomeip 表的属性 ID，**≠ signalId**（交叉检验命中率 3.3%，等于随机噪声） |
| `signalId` | CAN 信号字典编号，全局 1089 条（12 份 CanSub* 并集） |

**载荷解码不能靠字典直查**，必须用运行时样本经验匹配。

---

## 11. 离线分析链（2026-11-03 新增，与车上链路并行）

```
两路数据源                       统一中间格式              分析/产物
──────────────────────────      ──────────────          ─────────────────────────
手机中继 /export?format=ndjson ┐
                               ├─► ndjson（39 ID） ─► decode_capture2.js ─► 50 Hz CSV
PCAN-View .trc ─ trc2ndjson.js ┘        │                    │
                                        │                    └─► carstate_offline.js ─► CarState JSON 影子
                                        └─► dq_gate.js（闸门：时间基/在线率/逆序）
```

| 层 | 说明 |
|---|---|
| 采集 | 手机（CAN-FD 适配器 + App 上传）或 PCAN-View 直接录 `.trc`；两者都只读监听 |
| 归一 | `trc2ndjson.js` 把 `.trc` 转成与手机源完全同构的 ndjson（字段、sequence、payload 一致） |
| 闸门 | `dq_gate.js`：1 ms 栅格判定、重复戳、逐 ID 在线率、时间戳逆序 |
| 解码 | `decode_capture2.js`：50 Hz 栅格，vEgo/转角/扭矩/档位/灯/LKA 状态/设定速度，每列带 age |
| 投影 | `carstate_offline.js`：CarState JSON 影子（**不是 capnp**），11 项夹具、6 包 0 硬不变式（`aEgo` / `aEgoRobust` 双口径） |

**与车上链路的关系**：车上链路（§7）是 QNX/Android 内部数据流，本项目只做只读观测；
离线链路是纯事后分析，两条互不依赖。

---

## 11. 注入点与"能否控制"（2026-11-04 补充）

### 11.1 电路图确认：EPS 直接在 CCAN 上

`4.x 前视单目摄像头系统电路图` / `CH020` 页：

| 节点 | 接插件-针 | 线色 | 归属 |
|---|---|---|---|
| EPS CAN-H | CH020-2-**5** | 0.35 **R/B** | CCAN |
| EPS CAN-L | CH020-2-**6** | 0.35 **L/B** | CCAN |
| EPS 电源+ | CH020-1-1 | 红 | 常电 |
| EPS 电源- | CH020-1-2 | 8.0 B | 地 EBG11 |
| EPS ON3 | CH020-2-8 | — | 点火 |

FSC（EL231）的 7/17 线色同为 `0.35 R/B` / `0.35 L/B`，**证实两者并接在同一条 CCAN**。

### 11.2 结论：位置不是障碍，同 ID 竞争才是

```
从 EL231 支线注入 0x083 → EPS 逻辑上一定能收到（同一总线）
但同时 ADDC（域控）在发 0x083 → 两个发送者 → EPS 收到内容不可预测
CAN 没有"后发覆盖"，只有仲裁
```

| 方案 | 结果 |
|---|---|
| 摄像头支线**并联**注入 | ⚠️ 能到达，但与 ADDC 冲突，不可用 |
| 剪断摄像头支线 → **panda MITM** | ❌ 支线上只有“收帧的相机”。帧**会流经**这条支线（我们就在 EL231 抓到 0x083），但**发送者 ADDC 在主总线上**；EPS 照样收到原帧 → 无法独占 |
| 剪断 EPS 支线 → **panda MITM** | ⚠️ 方向正确（EPS 只能听 panda），但需双向透传 EPS 依赖的全部帧 + 处理终端电阻 + 仍要过 `ADDC_CRC_83` |

**任何注入点都必须满足：总线上只有一个 0x083 发送者。**

### 11.3 MITM 拓扑（Red Panda 3 路）

```
ADDC 支线 ──CAN0──► panda ──CAN1──► 主 CCAN（EPS / IBC / BCM）
                                CAN2 ──► COM-CAN（拨杆：打灯/换挡）
```

要点：

```
1. 剪断的是 EL231 支线（相机从总线摘下），不是主干
2. 相机侧（CAN0）只剩 FSC + panda → 必须补 120Ω 终端
3. panda 必须【双向】透传（FSC 也要收 0x18D/0x184/0x0B6 等）
4. ADDC 的 0x083 不经过此支线；本方案只隔离相机，不隔离 ADDC（要独占 0x083 得在 ADDC 支线上做）
5. 必须有硬件旁路（继电器）：panda 掉电时直通，否则 EPS 失去指令源
```

### 11.4 控制能力边界（CCAN 上）

| 功能 | 命令帧 | 可控性 |
|---|---|---|
| 横向（转向） | 0x083 `SteerTarget` | ✅ 原理可行，卡 byte0 |
| 纵向加减速 | 0x083 `ACCCmd` | ❓ VCU 是否接受未验证 |
| AEB | 0x083 `AEBCmd` | ❓ 同上 |
| ACC/LCC 激活 | 无（状态机在 FSC/域控内，输入是 COM-CAN 拨杆） | ❌ |
| 档位 | 无（0x0B6 是 VCU 输出） | ❌ |
| 转向灯/灯光/雨刮 | 无（0x290 是 BCM 输出） | ❌ 需 COM-CAN |

**openpilot 实际只需要：读状态（已全有）+ 发 0x083（卡 byte0）。**
表中"不可控"的多数项，openpilot 本就不控制（档位、灯光、AEB），或由自身状态机取代（激活）。

### 11.5 更正：0x083 由 ADDC（域控）直发 EPS/VCU/IBC（2026-11-05）

此前写"FSC 发 0x083 给域控、由域控重新组帧"，**不正确**。

```
ADDC（ADAS 域控）──0x083(CCAN)──► EPS / VCU / IBC（DBC 接收方，直收）
FSC（相机）── 私有链路 ──► ADDC          （FSC 只解析 0x083 作旁路）
```

- DBC：`BO_ 131 ADDC_83: 32 ADDC`；LKA 段接收方 = EPS，ACC/AEB 段接收方 = VCU、IBC；
- 0x083 在 CCAN 上**直达执行件**，不存在"域控重新组帧"这一层；
- 注入的对手是 **ADDC**，不是 FSC；摄像头支线 MITM 因此无效——帧会经过该支线，但**发送者不在支线上**，剪它只切掉一个监听者；
- CAN 无身份认证，接收方无法区分注入帧与 ADDC 原帧，但只要 ADDC 还在发，仲裁就会交替。

**因此：横向/纵向/AEB 共用 0x083 一个注入点；唯一硬阻塞是 `ADDC_CRC_83`。**
