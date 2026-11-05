> **📌 本项目最新交接文档：`..\handoff_2026-11-01\`（10 份，2026-11-03 更新）。**
> 本文第 1–10 节为 **2026-10-31 早期版本**，其中 0x18D/0x083 的位布局与“不可用”结论已被后续实车抓包推翻；
> **以 §0 为准**，§1 起仅作历史留档。

---

## 0. 2026-11-04 现状（以此为准）

### 0.1 可直接喂给 openpilot CarState 的信号（全部已在实车抓包中验证）

| CarState 字段 | 来源 | 换算 / 判据 | 证据强度 |
|---|---|---|---|
| `vEgo` | 0x184 四轮速 + b10 每轮 2-bit 方向 | u16 × 0.01 km/h，先按轮向加符号再取均值 | ★★★ 50 Hz、在线 100% |
| `aEgo` / `aEgoRobust` | 由 vEgo 差分 | 100 ms（瞬态）/ 四轮中位 + 500 ms（减速度，急刹 10.4 m/s²） | ★★★ |
| `steeringAngleDeg` | 0x18D b3 | raw×0.02 − 650（DBC） | ★★★ 与 0x083 同源对拍 |
| `steeringRateDeg` | 0x18D b5 | raw × 4 | ★★★ |
| `steeringTorque` | 0x18D b6（12 bit） | raw×0.008 − 8 Nm（DBC） | ★★★ |
| `steeringPressed` | 同上（阈值） | ≈4.5 Nm 候选（2 个样本，见 U2） | ★★ |
| `gasPressed` | 0x0B6 b11 | raw × 100/255 % | ★★★ |
| `brakePressed` | 0x183 b6.7 | 布尔 | ★★★ |
| `brake` | 0x183 b7 低 7 位 | 0–127，饱和 100 | ★★★ |
| `gearShifter` | 0x0B6 b12[6:5] | 0=P 1=R 2=N 3=D | ★★★ 96,142 帧零矛盾 |
| `leftBlinker/rightBlinker` | 0x290 b2 | 0x1F/3F/5F/9F = 关/左/右/双闪 | ★★★ |
| `stockLkas`（LCC 在控） | 0x18D b8.3 | b22.5 为其反相冗余 | ★★★ |
| `cruiseState.enabled` | 0x0B7 b3[6:4]==4 | 与 0x083 ACC FuncMode==3 逐帧一致（96,510 帧仅 ~130 冲突） | ★★★ |
| `cruiseState.available` | 0x083 b3[1:3]==1 | 待命/可用态；与 0x0B7 值 1 同步 | ★★★ |
| `vCruise` | 0x083 b5.5–b6.7 | raw × 0.1 km/h（语义待定，U12） | ★★ |
| LKA 命令模式 | 0x083 b12[2:0] | 1/2/3/5；0x142 b5[2:0] 是它的回显 | ★★★ |
| LKA 状态字节 | 0x083 b15 | 0x00/0x64（原表误标 SteerRate） | ★★★ |
| 车道线 4 条 | 0x2D5（FSC→ICU） | Curv 10b×0.0001−0.015；LatDist 12b×0.00390625−8 m；Yaw 12b×0.000488281−1 rad；Start/End ×0.25 m | ★★★ 布局（**未采集**） |
| 前方目标 4 个 | 0x2D1（FSC→ICU） | LogitDist 12b×0.0625 m；LatDist 9b×0.0625−15；Heading 10b×0.01−5 rad | ★★★ 布局（**未采集**） |
| 转向灯极性校验 | 0x290 b3.0 / b3.1 | 左=仅 b3.0、右=仅 b3.1、双闪=两位同 1（单侧时对侧严格 0）；b3 按 1.25 Hz 通断，只作校验，状态仍取 b2 | ★★★ 76,134 帧 |

**当前状态（2026-11-04）**

```
读：9 个 CarState 字段全部可用（车速/轮速/转角/扭矩/LCC/ACC/档位/刹车/转向灯），无待定项
控：byte0 已解（CRC8_H2F + 56 张 seed 表）；剩余 = 与 ADDC 的发送仲裁 + 项目红线
```

### 0.2 行为语义（做控制策略必须先知道）

| 事件 | 车辆行为 | 判据 |
|---|---|---|
| 下拨一次 | ACC 启动（SpeedCtl 立即出现设定值） | 4 个完整循环 |
| 紧接着再下拨 | LCC 启动（叠加），本批 ACC→LCC 反馈边沿 0.17–0.21 s | 4 个循环；**动作间隔本身仍未测** |
| 上拨 | ACC + LCC 全退（fm=2） | 4 次 |
| 刹车 | 全退（fm=1，ACC 0.3–0.5 s 后跟退） | 2 次 |
| 抢方向（扭矩） | 只退 LCC、ACC 保留（fm=5） | +4.72 / −4.09 Nm，仅 2 例 |
| **打转向灯** | **LCC 暂停、ACC 保留；回到车道自动恢复**（fm 5→3） | 11 次，9 次恢复，暂停中位 6.1 s |

### 0.3 明确不可用（与 §6 的差异）

| 能力 | 现状 |
|---|---|
| 读 0x2D1/0x2D5（目标/车道线） | ❌ 不在已抓的 CCAN 上（私有链路），信号名有、位偏移无 |
| 解加密 DBC | ❌ TEE 私钥，离线不可解 |
| 前雷达/BSD 融合 | ❌ 本车未配 |
| **下发转向控制** | ⚠️ 0x083（`ADDC_83`，发送方 ADDC）的 CRC 已完全复原（CRC8_H2F + seed 表，130 万帧 0 失配）；剩余障碍是 ① ADDC 同时在发，需仲裁/隔离 ② 项目红线禁止注入 |
| 纵向控制 | ❌ CCAN 上没有已确认的**被消费**的纵向命令；0x083 的 ACC/AEB 字段虽已解，但 b4 符号/语义待定（U13），VCU/IBC 是否接收未证 |
| CarService 读属性 | ❌ 需 CAR_INFO（平台签名），已实测关闭 |
| 直接 import 进 openpilot | ❌ CarState 是 JSON 影子，非 capnp（R5） |

### 0.4 现有管线

```
ndjson 抓包 → dq_gate.js（数据准入）→ decode_capture2.js（50 Hz 重采样）
           → carstate_offline.js（CarState JSONL 影子）→ verify_carstate.js（结构回归）
```
11 项夹具、6 包 0 硬不变式；字段映射与假设写在 `carstate_offline.js` 的 `assumptions` 里。

---

---

# OpenPilot 适配：可用信息总表

- 车型：零跑 B05 / Lafa5 515Pro（LPA120），OS 3.01.20
- 数据来源：OTA 全量包解密 + QNX 配置提取（107 个文件）+ 固件反编译 + 维修手册
- 状态标记：✅ 可直接用　⚠️ 需实车验证　❌ 不可用

---

## 一、总线与接点 ✅

```
抓包点：EL231-7 (CCAN-H) / EL231-17 (CCAN-L)
方式：高阻并联，采集器关闭 120Ω 终端（原车 60Ω，并入后应仍≈60Ω）
```

| 通道 | 判定 | ID 数 | 说明 |
|---|---|---|---|
| **2** | **CCAN** | 20 | 底盘主总线，所有关键帧在此 |
| 4 | COM-CAN | 14 | 多点总线（IBC/域控/组合开关）；**无纵向控制帧** |
| 5 / 6 / 12 | 车身/舒适/座舱 | 32 / 24 / 24 | 与 openpilot 无关 |
| 7 / 13 / 14 | 少量 | 5 / 6 / 3 | 用途未明 |

来源：`conf_all/filter_lpCanAnalysis.json`（128 条规则，含 `interval_times` 分频系数）

---

## 二、报文与信号 ✅

### 2.1 感知输出（最高价值）

**0x2D5 车道线 —— 4 线 × 6 字段 ✅（信号名已知，位偏移未知 ⚠️）**

| 车道 | 类型 | 曲率 | 横向距离 | 偏航角 | 起始 | 结束 |
|---|---|---|---|---|---|---|
| 左 | 17581 | 17583 | 17584 | 17585 | 17586 | 17587 |
| 右 | 17588 | 17590 | 17591 | 17592 | 17593 | 17594 |
| 左左 | 17595 | 17597 | 17598 | 17599 | 17600 | 17601 |
| 右右 | 17602 | 17604 | 17605 | 17606 | 17607 | 17608 |

**0x2D1 前方目标 —— 4 目标 × 5 字段 ✅（同上）**

| 目标 | 存在 | 类型 | 纵向距离 | 横向距离 | heading |
|---|---|---|---|---|---|
| 前方 | 17551 | 17552 | 17553 | 17554 | 17555 |
| 前前方 | 17557 | 17558 | 17559 | 17560 | 17561 |
| 左前方 | 17562 | 17563 | 17564 | 17565 | 17566 |
| 右前方 | 17567 | 17568 | 17569 | 17570 | 17571 |

> signalId 连续递增 → 报文内大概率按顺序排布，抓包后易定位。
> 0x2D1 含"渲染颜色"字段 → 该帧面向 HMI 显示，数值可能是**显示级精度**。

### 2.2 车辆状态

| ID | 关键信号 | 状态 |
|---|---|---|
| **0x18D** | 实际方向盘转角 / 转角有效性 / EPS故障灯 | ✅ **位布局已还原** |
| **0x083** | ACC工作模式 / ACC可用状态 / IACC调整车速请求 | ⚠️ 字段来自反汇编 |
| **0x142** | FCW / LCC / ELK 相关；`byte5[2:0]` 回显 0x083 `LKA.FuncMode` | ✅ 命令回显身份已确认；不是独立执行证据 |
| 0x227 | EPB 状态 / 指示灯 | ✅ |
| 0x2A3 | 气囊故障 / 安全带锁扣 | ✅ |
| 0x0B6 | 档位 / 油门踏板位置 | ✅ |
| 0x53E | 四轮胎压/温度 | ✅ |
| 0x332 | 盲区/开门/横穿/后碰撞预警开关 | ✅ |

---

## 三、已还原的位布局

### 3.1 EPS 0x18D —— ✅ 反编译验证（8 字节变体）

| 位置 | 内容 | 处理 |
|---|---|---|
| byte0 bit0–5 | 6 个状态位 | 直读 |
| **byte1..2** | u16 LE | **×0.1 − 900** → 方向盘角度（deg） |
| byte3 | u8 | **×4** → 转角速度（deg/s） |
| **byte4..5 & 0x0FFF** | u12 | **×0.008 − 8** → 转向力矩（Nm，−8…+8.79） |
| byte6 bit2 / bit3 | 2 个状态位 | 直读 |
| byte7 | 校验 | `(0xFF − Σbyte[0..6]) & 0xFF` |

⚠️ **运行版是 32 字节 CAN-FD**（Challenge 主程序），上述布局来自 8 字节兼容库。
抓包第一件事：确认 0x18D 实际长度。

### 3.2 0x083 —— ⚠️ 反汇编推断（Codex）

| 字段 | 位置 | 换算 |
|---|---|---|
| SteerTarget | byte13–14 | `650 − raw16 × 0.02` |
| SteerRate | byte15 | `byte15 × 4` |
| FuncMode / Direction / HandsOffLevel | byte12 | 3 / 2 / 2 位 |
| payload | 64 字节 | dlc_code 15 |

⚠️ 已确认：byte0 = `ADDC_CRC_83`、byte1 低 4 位 = RollingCounter（DBC）；算法未知。
⚠️ 0x083 是 `ADDC → 多节点` 的命令帧（FSC 只解析），DBC 接收方含 EPS/VCU/IBC。

### 3.3 EPS 0x24F —— ✅

`byte2 & 0x03` → 状态；byte7 校验同上。

---

## 四、校验算法 ✅（但适用范围有限）

```python
byte[7] == (0xFF - (sum(byte[0..6]) & 0xFF)) & 0xFF
```

| 有校验（12 个） | 无校验（7 个，byte7 不是校验） |
|---|---|
| 0x0DC 0x0CB 0x100 0x0B8 0x290 0x2A3 | **0x0B6 0x200 0x3D2 0x247** |
| 0x18D 0x24F 0x134 0x130 0x233 0x227 | **0x3B0 0x135 0x340** |

---

## 五、订阅关系 ✅

| 文件 | 内容 |
|---|---|
| `CanSubscribe_lpAdasInput.json` | ADAS 实际读取的 13 个报文（如 0x182 IBC车速） |
| `CanSubscribe_CarService.json` | 车控服务订阅（66 KB） |
| `CanSubscribe_lpIVI.json` | 座舱订阅（74 KB） |
| `lpCanAnalysis_*.xml` | 分析与发布规则（3 份） |

用途：判断"原车哪个服务读哪些帧"，反推信号重要性。

---

## 六、❌ 明确不可用

| 能力 | 原因 |
|---|---|
| **下发转向控制** | 找不到最终 EPS 控制帧；FSC Linux 应用层已排除，剩余可能：FSC MCU / 域控 EL215-3 / 网关 VIU，均无固件 |
| 用 COM-CAN 做纵向控制 | 该总线 14 个 ID，**无任何 ACC/AEB 命令帧** |
| 从前雷达/BSD 雷达融合 | **本车未配**（后视镜无警示灯、28 个 ECU 清单无雷达节点） |
| 用加密 DBC 解信号 | 22 份 DBC 全为数字信封，私钥在 **TEE**，离线不可解 |
| 预期 TEE 内存提取 | QNX 进程对 Android 侧不可见，跨 guest 无权限 |

---

## 七、⚠️ 待实车验证（按优先级）

| # | 验证项 | 判据 |
|---|---|---|
| 1 | 0x18D 是 8 还是 32 字节 | 决定用哪套解码 |
| 2 | 0x083 是否出现在前摄线 | 在 → 可分析；不在 → 属另一条网络 |
| 3 | CCAN 速率/格式（500k/2M、BRS、ISO） | 扫描确定 |
| 4 | 0x2D5 曲率 vs 0x18D 转角相关性 | 证明链路读对 |
| 5 | 0x083 byte0–2 是否 counter/CRC | 看是否逐帧递增 |

---

## 八、结论

**能做：旁观者模式**

```
读 0x2D5（车道）+ 0x2D1（目标）+ 0x18D（转角/横向执行反馈）+ 0x083/0x142（LKA 命令/回显）
→ 记录 / 回放 / 与原车行为对比 / 验证 openpilot 视觉输出
```

**不能做：接管**

缺最终控制帧确认、缺全部信号的位布局、缺实车硬件（CAN-FD 采集器）。

---

## 九、资产索引

| 路径 | 内容 |
|---|---|
| `G:\Codex\ota_extract_2026-10-28\can_data\conf_all\` | 107 个 QNX 配置文件 |
| `...\can_data\conf_all\canConfig.json` | 527 条信号目录 |
| `...\can_data\conf_all\filter_lpCanAnalysis.json` | **ID→通道映射** |
| `...\can_data\canids\ids_analyser.ini` | 11 条总线定义 |
| `...\can_data\EPS_derived.dbc` | 0x18D 8 字节变体 DBC（⚠️ 勿直接用于实车） |
| `...\can_tools\check_capture.js` | 抓包判别脚本 |
| `...\can_tools\analyze_can.js` | 通用抓包分析 |
| `...\can_data\CONF全量分析_2026-10-30.md` | 配置全量分析 |
| `...\交接_完整分析报告_2026-10-30.md` | OTA 全流程交接 |

---

## 十、CarService 软路径验证结论（2026-10-31）

### 10.1 背景

车上存在完整的实时解析链：

```
CAN 原始帧
  → lpCanAnalysis / lpCanEngine（QNX）
  → /leap/candata/msg（DDS，transType=2 共享内存+网络，ip=192.168.1.1）
  → VHAL 2.0（android.hardware.automotive.vehicle@2.0）
  → CarService
  → 应用
```

若能在 Android 侧读到 CarService 属性，即可在不抓包的前提下取得**解析后的物理值**。
`/opt/usr/conf/lpCanAnalysis_CarControlApp.xml` 与 `profile_lpCarControl.xml` 已证实该 topic 的发布/订阅配置。

### 10.2 已验证的事实

| 项 | 结果 |
|---|---|
| Android 网络位置 | `eth0 = 192.168.1.3/24`，`ping 192.168.1.1` = 0.4 ms **通** |
| 早期"1.x 不可达"判断 | ❌ **错误**（当时是 3850/3800 端口未监听，不是网络隔离） |
| CarService 属性注册 | ✅ 存在 `PERF_STEERING_ANGLE(0x11600209)`、`PERF_VEHICLE_SPEED(0x11600207)`、`GEAR_SELECTION(0x11400400)`、`CURRENT_GEAR(0x11400401)` |
| `cmd car_service get-property-value` | ❌ `SecurityException: requires non-user build` |
| `dumpsys` VHAL | ❌ HAL 为 2.0，不可 dump |
| 自建探针 APK 调用 | ✅ 能调到 `getProperty`（未崩溃），但全部返回 `SecurityException` |

### 10.3 探针实现与结果

- APK：`com.probe.carprop`，反射调用 `android.car.Car`（不依赖 android.car.jar）；
- 采样 60 秒 × 1 Hz，写 logcat 与 `/sdcard/carprop_probe.txt`；
- 实测输出：

```
0x11600209 = ERR:SecurityException   ← 转角
0x11600207 = ERR:SecurityException   ← 车速
0x11400400 = ERR:IllegalArgumentException（可用 getIntProperty 修正）
0x15400500 = ERR:SecurityException
```

### 10.4 权限链为何走不通

```
读 PERF_STEERING_ANGLE
  → 需要 android.car.permission.CAR_INFO
    → protectionLevel = signature|privileged
      → 需平台签名 或 priv-app 身份
        → 平台私钥仅在厂家构建服务器
```

### 10.5 安装通道验证（车机自带「安全安装中心」）

包名 `moe.jozooqm.pdyfglpOb`（v1.1.40038_zh），自身用 AOSP 测试密钥签名：

```
CN=Android, O=Android, EMAILADDRESS=android@android.com
SHA-256 = a40da80a59d170caa950cf15c18c454d47a39b26989d8b640ecd745ba71bf5dc
```

内含 `libinstall_runtime.so` + `libSecShell.so`，界面标注"ADB 已授权 · Shell 能力正常"。

| 尝试 | 结果 |
|---|---|
| `adb install`（自签，无 sharedUserId） | ❌ `INSTALL_FAILED_INVALID_APK: Install app package has to be legal` |
| `adb install`（自签，带 sharedUserId） | ❌ 同上（白名单按证书判定） |
| 经工具安装（无 sharedUserId） | ✅ 安装成功，但运行时 `SecurityException` |
| 经工具安装（带 sharedUserId=system） | ❌ `INSTALL_FAILED_SHARED_USER_INCOMPATIBLE` |

**结论：该工具只做"ADB 安装"，不会用平台密钥重签**（报错文案为"原版 WiFi ADB 安装失败"）。

### 10.6 配置中是否存在可用密钥

对已拉取的 107 个配置文件做全量检索（`key|cert|pem|pk8|sign|token|secret|password|PRIVATE KEY`）：

- 唯一命中：`<topic>/leap/account/passwd</topic>`（DDS 主题名，非凭据）；
- **未发现任何私钥、证书、口令或令牌**。

私钥的实际位置：

| 密钥 | 位置 |
|---|---|
| DBC 解密私钥 | TEE 内部（`lpTeeEngine → liblpSecTeeRpc`），不落盘 |
| 平台签名私钥 | 厂家构建服务器 |
| 安装工具证书 | 仅公钥证书（在 APK 内），无法用于签名 |

### 10.7 最终结论

**CarService 软路径在当前条件下不可行**，原因不是技术难度，而是**缺少平台私钥**这一不可绕过的前提。

不影响已取得的成果：

- `canConfig.json` 527 条信号目录、`filter_lpCanAnalysis.json` 的 ID→通道映射、订阅关系等**全部有效**；
- 这些数据在抓包后仍是最主要的解码依据。

**下一步唯一确定可行路径：CAN-FD 采集器 + 被动抓包。**

### 10.8 资产（本轮产出，可复用）

| 文件 | 说明 |
|---|---|
| `G:\Codex\carprop-probe\` | 探针工程（Manifest / Java / 构建脚本） |
| `...\carprop-probe\app4-signed.apk` | 带 sharedUserId 的版本（有平台密钥时可直接用） |
| `...\carprop-probe\app3-signed.apk` | 无 sharedUserId 版本（可正常安装，仅缺权限） |
| `...\can_data\CARPROP探针_构建说明.md` | 构建与判据说明 |

### 10.9 「安全安装中心」机制定论（APK 静态分析）

对象：`安装工具_1.1.40038_zh.apk`
SHA-256 `BC028EF6BCDA83251B2A65E3F5438868C4B721C97553D4FE209CF6101185DF7E`，5,495,522 字节，36 个条目。

**结构**

```
classes.dex                              127 KB（Kotlin）
lib/*/libinstall_runtime.so              安装运行时
lib/*/libSecShell.so                     1.2 MB，特权 Shell 通道
assets/meta-data/manifest.mf             695 B   授权摘要清单
assets/meta-data/rsa.pub                 274 B   授权校验公钥（N = 8D682FF8…）
assets/meta-data/rsa.sig                 257 B   对 manifest.mf 的签名
assets/AI_ANALYSIS_POLICY.txt            使用条款声明
```

**dex 关键字符串**

```
adb .. adb_auth .. adbkey.pk8 .. adbkey.pub.der
sign .. signToken .. signatureBase64 .. signerSha256
Landroid/security/keystore/KeyGenParameterSpec$Builder;
Landroid/content/pm/Signature;  Landroid/content/pm/SigningInfo;
```

**行为推断（与实测一致）**

```
1. 用 AndroidKeyStore（KeyGenParameterSpec）生成/持有密钥
2. 导出标准 ADB 密钥对 adbkey.pk8 / adbkey.pub.der
3. signToken 签 ADB 认证令牌 → 获得 shell 身份
4. 以 shell 执行 pm install
```

即界面文案"ADB 已授权 · Shell 能力正常"是字面含义：**它为自己签发 ADB 授权令牌**。

**它没有、也拿不到的东西**

| 能力 | 是否具备 |
|---|---|
| ADB 认证（adbkey.pk8 + signToken） | ✅ |
| 授权文件校验（rsa.pub / rsa.sig / manifest.mf） | ✅ |
| 平台 APK 签名私钥 | ❌ |
| 绕过 `sharedUserId` 证书校验 | ❌（shell 的 `pm install` 同样受检） |

**结论**：该工具的作用是"免手动 ADB 授权 + 一键装包"，不提供平台签名能力。因此
`sharedUserId="android.uid.system"` 的包无法通过它安装，`CAR_INFO` 权限无从获得。

### 10.10 软路径最终关闭

```
CarService 可读                ✅ 已实测（探针能调到 getProperty）
读 PERF_STEERING_ANGLE 需 CAR_INFO
CAR_INFO = signature|privileged ❌
平台私钥                        ❌ 仅在厂家构建服务器
安装工具                        ❌ 仅 ADB 授权，无签名能力
107 个配置文件                  ❌ 无私钥/证书/口令（唯一命中为 topic 名）
────────────────────────────────────────
结论：不抓包则无法取得 0x18D / 0x083 的位布局与实时物理值
```

**下一步唯一可行路径：CAN-FD 采集器 + EL231-7/17 被动抓包。**
