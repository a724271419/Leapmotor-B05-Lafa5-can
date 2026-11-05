# 03 · 关键调用关系与已验证事实

---

## 1. OTA 解密

### 1.1 参数

```
块：1,048,576 密文 / 1,048,560 明文 / 16 字节 GCM tag
key = 清单 aes 字段前 32 个 ASCII 字符
iv  = 第 32–43 个字符（12 字节）
算法：AES-256-GCM（每块独立 tag）
```

### 1.2 验证

- 13 个文件、3850+ 块，**全部通过 GCM tag 认证** → 明文正确是密码学证明
- 清单里的 `sha256` 字段**对不上**实际文件，不能用它校验；权威校验是 GCM tag + 清单 `sign`（RSA，用 otaCert）

### 1.3 ICSW 容器尾块

```
[payload][32B SHA-256(payload)][976B DER 证书][314B][JSON][len][LEAP]
```

**不含 RSA 签名**——签名在清单里。

脚本：`ota_probe\decrypt_stream.js`（>2GB 可用）。

---

## 2. QNX 配置拉取（-101 / -102）

### 2.1 调用链

```
工程控制台 UI（VehicleSystemUpdateActivity）
  → CommonTools.handleAllDiagnoseCommand(functionID, command, ecu)
  → OTAUpdate.obtainQnxDirectory(path)         type 33，列目录
  → OTAUpdate.recursionCopyFile(path, dest)    type 34，复制文件/递归
      → OTATCPClient socketConnect("192.168.1.1", 3850)
      → 帧格式：'LP' + type(u16BE) + 8B 字段 + pyid(u16) + mode/readsize(u32) + exlen(u32) + exdata
```

### 2.2 语义（实测）

| 入参 | 行为 |
|---|---|
| 文件路径 | **复制**到 `/storage/emulated/10/Documents/log/<文件名>` |
| 目录路径 | **只返回文件名列表**（不复制） |
| `lpPNC/config_*` 目录 | 返回 **-216**（目录不可列），但**目录里的文件可以正常复制**（2026-11-03 实测）——旧结论“伪目录不可读”只对目录本身成立 |

### 2.3 回传（-102）

```
-102 执行 shell 命令；**ecu 决定执行侧**（2026-11-03 实测，关键）：
  ecu = -1 → 命令在 QNX 侧执行，stdout 经 JSON 返回，**上限 2048 B**（超过即静默截断）
  ecu =  0 → 命令在本机 Android（system UID）执行，stdout 同样走 JSON，上限一致
成功用法（大文件）：toybox nc -l -p <端口> cat /storage/emulated/10/Documents/log/<文件>
电脑端：  adb exec-out toybox nc 127.0.0.1 <端口> > 本地文件
整棵树：  QNX tar -cf /tmp/x.tar -C <根> . → -101 复制 /tmp/x.tar → nc 流式取回（3 个请求/树）
失败用法：base64 到 stdout（503KB 撑爆管道死锁）、dd 写 /data/local/tmp（SELinux 拒）
```

### 2.4 局限

- 3850 是**按需/短连接**，跑几十次后返回 `-150`，需重启车机恢复
- **长路径（>~48 字符）会被 `input text` 截断** → 深层文件（`lpPNC/config_*` 等约 170 个）未取
- 每次 `-101` 会触发**日志打包上传**（`tsp-free.leapmotor.com`），是该功能固有副作用

---

## 3. DDS 探针调用链（lpcom）

### 3.1 官方调用顺序（源自 `PSChannelManager.initPSManager`）

```java
writeProfile();                       // 把 profile.xml 写进 filesDir
LpComEnv.setLpComEnv();               // 等价于 Os.setenv("DISCOVERY_SERVER_IPADDRESS", "192.168.1.1")
PSChannelMgr mgr = PSChannelMgr.getInstance();
mgr.registerMatchedStatusCallback(cb);
ReturnCode rc = mgr.createPSChannelWithProfile(profilePath);   // 必须 RC_OK
SubscriberChannel ch = mgr.lookupSubscriberChannel(topic);     // 只能取 profile 里声明过的
ch.registerMessageCallback(subCb);
ReturnCode ro = ch.open();                                     // open() 无参
```

### 3.2 精确签名（反编译自 CarControl.apk classes6.dex）

```java
package com.leapmotor.lpcom;
public class IpcMessage { public int type, sequence, length, checksum; public byte[] buffer; }
public enum  ReturnCode { RC_OK, RC_BAD_PARAMETER, RC_NOT_ENABLED, RC_TIMEOUT, RC_RESOURCES_BUSY,
    RC_ILLEGAL_OPERATION, RC_NO_DATA, RC_NOT_ALLOWED_BY_SECURITY, RC_IN_PROGRESS, RC_ALREADY_DELETED,
    RC_UNSUPPORTED, RC_OUT_OF_RESOURCES, RC_PRECONDITION_NOT_MET, RC_ERROR }

package com.leapmotor.lpcom.ps;
public class PSChannelAttribute { public String[] ips; public String topic;
    public boolean durability=false; public int numOfMessages=8, sizeOfMessages=65536; }
public class PSChannelMgr { public static PSChannelMgr getInstance();
    public native ReturnCode createPSChannelWithProfile(String);
    public native SubscriberChannel lookupSubscriberChannel(String);
    public native PublisherChannel lookupPublisherChannel(String);
    public native void destroyAllChannels(); public native ReturnCode destroySubscriberChannel(String);
    public void registerMatchedStatusCallback(MatchedStatusCallback); }
public class SubscriberChannel { public SubscriberChannel(PSChannelAttribute, MatchedStatusCallback);
    public native ReturnCode open(); public native ReturnCode close(); public native boolean isReady();
    public void registerMessageCallback(SubMessageCallback); }
public interface SubMessageCallback { void handleSubMessage(IpcMessage m); }
public interface MatchedStatusCallback { void handleMatchedStatus(int); void handleMatchedStatus(String,int); }
```

静态块里 `System.loadLibrary("lpComPSJNI")`。

### 3.3 profile.xml 格式（决定通道能否创建）

```xml
<config><channels>
  <channel side="sub">
    <topic>/leap/ivi/public/p/lpGwIviCan</topic>
    <transType>0</transType><durability>0</durability>
    <numOfMessages>8</numOfMessages><sizeOfMessages>65536</sizeOfMessages>
    <ip>192.168.1.3</ip>
  </channel>
</channels></config>
```

**实测约束**：
- `transType` 0=仅网络 / 1=仅共享内存 / 2=两者
- **`transType=1` 会让 `lookup` 返回 null**（不可用）
- **一个 profile 只能放一个通道**：放两个 → `lookup` 全部 null（解析器只认第一个）

### 3.4 包约束

- **必须 32 位**：`/system/lib/liblpComPSJNI.so` 只有 ARM32；64 位在 vendor 且名带 `_vnd` 后缀
- 强制方法：APK 内放 `lib/armeabi-v7a/*.so`（本项目用复制来的 `liblpComCS.so` 当占位）
- lpcom 类**不在 framework**，每个 app 自己打包 → 探针须自带同包名同类名桩类

---

## 4. DWARF → 位布局流水线

### 4.1 输入

`reanalysis\fsc\extracted\libadas_can_debug.so`（101,824 B，ELF32 ARM，**完整 `.debug_info`**）

### 4.2 关键语义（曾出错，务必保留）

```
DWARF 版本 = 4  →  使用旧式 DW_AT_bit_offset（MSB 计数），不是 DWARF5 的 data_bit_offset

换算公式：
  bit_pos = data_member_location*8 + (container_bits − bit_offset − bit_size)
  其中 container_bits 必须逐成员读 DW_AT_byte_size（基类型大小），不可全局硬编码 8

非位域成员（无 bit_offset/bit_size）：
  bit_pos = data_member_location*8
  宽度 = 类型字节数*8（当前 JSON 缺该字段，gap 推定只能近似）
```

### 4.3 验证方法（三源闭环）

1. **JSON 审计**：字段位段全覆盖、零间隙零重叠
2. **反汇编抽查**：`ldrb r3,[r1,#2] / and r3,#1 / strb r3,[r2,#0xaf]` ↔ `EPS_Fault` 计算位 = byte2.0 ✅
3. **literal pool 配对**：函数尾常量 ↔ 字段缩放

### 4.4 产出

- `ota_probe\dwarf_types.js` → `ota_probe\dwarf_structs_typed.json`（61 DIE → 35 去重结构体，逐字段带 `containerBits`/`typeName`）
- `ota_probe\dwarf_table.js` → `can_data\DWARF布局表_Can1.md`
- 旧版 `dwarf_export.js` / `dwarf_export2.js` 保留作回归对照：三者对 Can1 的 252 个位域给出**完全相同**的位布局

---

## 5. 已验证事实（逐条带证据）

### 5.1 EPS 0x18D（32 字节版）★ 三源闭环

结构体 `Proto_Can1_EPS_18D_t`，23 字段，源文件 `protoCan1_eps.h:132`。

| 位偏移 | 字节.位 | 宽 | 字段 | 缩放（指令级实证） |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | EPS_CRC_18D | — |
| 8 | byte1.0 | 4 | EPS_RollingCounter_18D | — |
| 12 | byte1.4 | 4 | rsv0 | — |
| 16 | byte2.0 | 1 | EPS_Fault | — |
| 17 | byte2.1 | 1 | EPS_CalibrationSts | — |
| 18 | byte2.2 | 1 | EPS_FailureSts | — |
| 19 | byte2.3 | 1 | EPS_SteeringAngleValidData | — |
| 20 | byte2.4 | 1 | EPS_SteeringAngleSpeedValidData | — |
| 21 | byte2.5 | 1 | EPS_SteeringTorqueValidData | — |
| 22 | byte2.6 | 2 | rsv1 | — |
| 24 | byte3.0 | 16 | **EPS_SteerWheelAngle** | **raw×0.02 − 650**（DBC 权威） |
| 40 | byte5.0 | 8 | EPS_SteerWheelRotSpd | **raw×4** |
| 48 | byte6.0 | 12 | EPS_SteeringTorque | **raw×0.008 − 8**（DBC 权威） |
| 60 | byte7.4 | 4 | rsv2 | — |
| 64 | byte8.0 | 2 | EPS_SteeringModeSts | — |
| 66 | byte8.2 | 1 | EPS_LateralAvailable | — |
| 67 | byte8.3 | 1 | EPS_LateralActive | — |
| 120 | byte15.0 | 3 | EPS_LateralNotAvailableReason | — |
| 128 | byte16.0 | 11 | EPS_MotorTorque | **raw×0.01 − 5.2**（DBC 权威） |

**证据**：
- 布局：DWARF（`DW_AT_byte_size=0x20`）
- 语义：`adasCan1_parseEps_18D` 反汇编（byte2 六个位逐个 `ubfx`）
- 缩放：literal pool `0.02/650.0/0.008/0.01/5.2` + `vnmls` 指令（已字节级核验编码）

**两个必须立牌的坑**：
```
① 角度公式：32B = `raw×0.02 − 650`（DBC 权威）；8B 兼容版 = `raw×0.1 − 900`（同号）
② 扭矩：32B = `raw×0.008 − 8`；8B 同号 —— 早期反汇编把 vnmls 操作数读反，已按 DBC 更正
```
照抄 8B 版会得到**反向 + 错误斜率**，且不报错。

### 5.2 Can1 系 15 个结构体 ↔ 15 个 parse 函数（一一对应，无缺无余）

```
ACU_2A3(16B/12)  ACU_233(8B/11)   HPCBCM_290(8B/36)  EPS_18D(32B/23)
HPCGW_3B0(16B/9) IBC_182(8B/14)   IBC_183(16B/10)    IBC_184(32B/21)
IBC_185(16B/33)  IBC_227(8B/7)    IBC_3CE(8B/5)      ICU_24D(32B/9)
IVI_331(16B/27)  HPCVCU_0B6(16B/16)  HPCVCU_0B7(32B/19)
```

Can3 系 3 个结构体（BSD/FM MRS）——**雷达变体，本车未配雷达**，导出但打标。

### 5.3 校验

```
算法：byte[7] = (0xFF − Σbyte[0..6]) & 0xFF
覆盖：12/19 报文（0x0DC 0x0CB 0x100 0x0B8 0x290 0x2A3 0x18D 0x24F 0x134 0x130 0x233 0x227）
无校验：0x0B6 0x200 0x3D2 0x247 0x3B0 0x135 0x340
```

⚠️ 以上来自 8 字节兼容库；**32B 帧体系的校验未解**（0x18D 32B 的 byte0 是 CRC，算法未知）。

### 5.4 信号字典

```
全局 signalId = 1089 条（12 份 CanSub* 并集，case-fold 去重）
canConfig.json = 527 条，是订阅全集的子集（覆盖 46%）
唯一真实冲突：9373/9374 —— lpIVI 记 0x22a，正确应为 0x2aa（转向灯帧）
```

### 5.5 感知帧字段（名称已知，位偏移未知）

- `0x2D5` 24 条：4 条车道 ×（类型/曲率/横向距离/偏航角/起始/结束），signalId 17581–17608，**有 4 个空洞**（17582/17589/17596/17603）
- `0x2D1` 21 条：4 目标 ×（存在/类型/纵距/横距/heading），signalId 17551–17571 **连续**

⚠️ signalId 连续 **不等于** 帧内位顺序（反例：0x142 里 17514 排在 17505 前）。

### 5.6 本车配置

```
前视单目摄像头 FSC ✅（EL231）
多域融合控制器 CDU ✅（0x780）
超声波 UPA ✅ / 环视 SVV ×4 ✅
前向毫米波雷达 ❌   后角 BSD 雷达 ❌
```

### 5.7 CarService 属性存在（但读不到）

```
PERF_STEERING_ANGLE  0x11600209
PERF_VEHICLE_SPEED   0x11600207
GEAR_SELECTION       0x11400400
CURRENT_GEAR         0x11400401
HVAC_FAN_SPEED       0x15400500
```

---

## 6. 抓包参数（硬件到位后）

| 项 | 建议值 |
|---|---|
| 模式 | CAN FD |
| 协议 | ISO 11898-1:2015 |
| 仲裁段 | **500 kbit/s**，采样点 80% |
| 数据段 | **2 Mbit/s**，采样点 75–80% |
| BRS / ESI | 开 |
| 终端电阻 | **关闭**（原车 60Ω） |
| 模式 | **监听/silent** |
| 滤波 | 全通过 |

**降级梯度**：ISO 500k/2M → non-ISO → 500k/5M → 500k/4M → 纯 CAN 500k → 250k / 1M。

**上车前**：断电量 EL231-7↔17 ≈ 60Ω。

**场景序列**：静止未上电 → 上电静止 → 低速直行 → 打方向到底 → 开 LCC 跟车 → 关 LCC；每段留 5s 空档。

**首要判据**（已于 2026-11-02 全部确认）：0x18D = **32 字节 / 10 ms**；0x083 = **32 字节 / 20 ms**；0x2D1/0x2D5 **不在 CCAN**。

---

## 7. DDS 探针实测调用序列与终局（2026-11-01）

### 7.1 实际执行链（车机在线，4 个变体）

```
am start -n com.probe.lpcom2/.MainActivity
  -> Os.setenv("DISCOVERY_SERVER_IPADDRESS", <env>)      // lpcom_env.txt 可覆盖
  -> 写 profile.xml 到 getFilesDir()
  -> PSChannelMgr.getInstance()
  -> registerMatchedStatusCallback(...)
  -> createPSChannelWithProfile(path)      -> RC_OK
  -> lookupSubscriberChannel(topic)        -> 对象 / null
  -> registerMessageCallback(new SubMessageCallback(){...})
  -> open()                                -> RC_OK / RC_ERROR
  -> sleep 90s -> 写 getExternalFilesDir()/lpcom*_probe.txt
```

### 7.2 四个变体结果矩阵

| 变体 | profile | lookup | open | matched | msgs |
|---|---|---|---|---|---|
| v2 | 单通道 `/leap/ivi/public/p/lpGwIviCan`，transType=0 | ok | **RC_ERROR** | 未触发 | 0 |
| v3 | 双通道，transType=1 | **null ×2** | — | — | 0 |
| v4 | 双通道，transType=2 | **null ×2** | — | — | 0 |
| **v5** | **单通道 `/leap/mainlycontrol/command`，transType=0** | ok | **RC_OK** | 未触发 | **0** |

**v5 是对照实验，决定性**：`/leap/mainlycontrol/command` 已被证实是活 topic
（`com.leapmotor.cameraaround` 每 60s 打印
`LpComManager -> /leap/mainlycontrol/command, onMessage: sdis state 0`），仍然 `msgs=0`。

**同时排除三个混淆变量**：topic 选错、发布端不在、时序运气。

### 7.3 死因（SELinux ioctl）

```
avc: denied { ioctl } ioctlcmd=0x8927 tclass=udp_socket
     scontext=u:r:untrusted_app:s0:c117,... permissive=0
```

`0x8927` = `SIOCGIFHWADDR`（取网卡 MAC）。Fast-DDS 用它生成 participant GUID/locator。
被拒 → 无法正确宣告 locator → **发现层死亡**。

`open() 返回 RC_OK` 只是本地对象创建成功的假象，`isReady=true` 同理。

**域对照**：

```
u:r:system_app:s0     com.leapmotor.cameraaround   -> 正常收数
u:r:untrusted_app     com.probe.lpcom2             -> ioctl 被拒
```

### 7.4 结论

**DDS 只读路径需要 `system_app` 域 = 平台签名。** 与 CarService 是同一堵墙。

---

## 8. 0x0B7 与平台级头部约定（2026-11-01 抽查）

### 8.1 头部约定（第三次确认，已可升格为平台级）

| 帧 | CRC | 滚动计数 | 状态位起点 |
|---|---|---|---|
| 0x18D EPS | byte0 | byte1 低 4 位 | byte2 |
| 0x0B7 VCU | byte0 | byte1 低 4 位 | byte2 |
| 0x083（先验，待 Challenge 确认） | byte0 | byte1 | byte2 |

### 8.2 0x0B7 真身（19 位域，ACC/油门状态帧）

```
byte0.0  w8   VCU_CRC_B7
byte1.0  w4   VCU_RollingCounter_B7
byte1.4  w4   rsv0
byte2.0  w2   VCU_Vehicle_Warning
byte2.2  w1   VCU_VehicleSts
byte2.3  w9   rsv1
byte3.4  w2   VCU_ACCRequest          <- 0x083 下游对照
byte3.6  w1   VCU_ACCStates
byte3.7  w12  rsv2
byte5.3  w1   VCU_DecEnable
byte5.4  w2   rsv3
byte5.6  w1   VCU_DriverAssistProhibitSts
byte5.7  w9   rsv4
byte7.0  w8   VCU_TheoAccePedalPercent
byte8.0  w32  rsv5
byte12.0 w1   VCU_TheoAccePedalValid
byte12.1 w31  rsv6
byte16.0 w64  rsv7
byte24.0 w64  rsv8
```

**价值**：`ACCRequest / ACCStates / DecEnable / TheoAccePedalPercent` 是 0x083 命令的效果回读，
抓包时可作为对照帧。

### 8.3 0B7 曾出现的污染（已修，留档警示）

v1 导出器把 9 KB 的嵌套结构体（雷达目标列表 `Xaxis/Yaxis/XrelVelocity` 等 200 个成员）展平并入 0B7，
使其显示为 219 字段、普通成员偏移最大 9312（远超 32 字节帧长）。

**根因**：llvm-dwarfdump 的 DIE 缩进在冒号之后，v1 正则从行首取缩进（恒为空）→ 归属判定失效。

**修法**：v2 按「行首空白 + 冒号后空白」计算 indent；新增 `plainLocMax >= size` 断言。

**教训**：导出器会静默产生垃圾数据——命令全成功、字段名全真，只有数量对不上才暴露。

---

## 9. 2026-11-03 新增：场景包验证的调用关系与事实

### 9.1 CAN → CarState 的完整链路（新增环）

```
PCAN-View .trc ──trc2ndjson.js──► ndjson ──dq_gate.js──► 通过
                                    │
                              decode_capture2.js       50 Hz 栅格 + 每列 age
                                    │
                              carstate_offline.js      CarState JSON 影子（非 capnp）
                                    │
                              verify_carstate.js       结构/数值回归
```

手机中继链路（旧）：`/export?format=ndjson` → `fullcap\*.ndjson`，与上面汇合在同一套解码器。

### 9.2 拨杆：分级启动（旧说法「单拨=取消/恢复」已推翻）

```
下拨 1 次（条件满足）      → 启动 ACC（SpeedCtl 立即出现设定值）
紧接着再下拨 1 次          → 启动 LCC（latActive 0→1，叠加在 ACC 上）
上拨 1 次                  → ACC + LCC 全退（30 ms 内先后归零）
```

**「紧接着」有多紧？未测**：本批 ACC→LCC 的**反馈边沿**间隔 0.17/0.18/0.18/0.21 s（0x18D 是 20 ms 帧，±1 帧量化）；这是反馈时间差，不是两次拨杆动作的间隔，有效窗口上限本轮未测。

**证据**：`can抓包\2\双拨3.ndjson` 四个完整循环（0.79/1.00、8.12/8.30、24.33/24.51、33.43/33.60 s）；
`单拨2.ndjson` 只单次下拨，ACC 启动 6 次、LCC 全程为 0。

**按键本体不在 CCAN**：稀有边沿 / 稀有值 / 与 8 个 LCC 边沿的相关性扫描均无命中；可观测的只有下游状态。
**物理原因（2026-11-04 补）**：组合开关 EL091-2 的拨杆走 **COM-CAN（14/15 针）**，方向盘按键走 **独立的方向盘开关 CAN（8/9 针）**，都不在 CCAN 上。CCAN 看到的 0x0B6 档位、0x0B7 ACC 状态是 VCU 消化后的结果。要直接看拨杆动作，得抓 COM-CAN（IBC CH024-33/34 或 EL091-2 14/15）。

### 9.3 退出分类（按 ACC 是否保留）

| 触发 | LCC | ACC | fm | 证据 |
|---|---|---|---|---|
| 刹车 | 退 | 退（0.3–0.5 s 后） | 1 | `接管1` 27.63 s、`接管2` 18.55 s |
| 上拨 | 退 | 退 | 2 | `双拨3` ×4、`接管2` 44.27 s |
| 抢方向（扭矩） | 退 | **保留** | 5 | `接管2` 35.54 s（+5.02 Nm）、`shuangbo2` 27.53 s（−4.37 Nm） |
| 打转向灯 | **暂停**，条件满足自动恢复 | **保留** | 5→3 | `1804f14c` 5 个完整循环：灯亮 20 ms 内 lat→0，2–7 s 后 lat 自动回 1、fm 回 3；`去` 46.77 s 为长暂停 |

`fm=5 ⇔ ACC 保留` 是唯一可靠的判据；`fm=1` 与 `fm=2` 都表示 ACC 也退，二者不可靠区分。

**判 fm 的时窗（2026-11-05）**：0x142 回显滞后约 0.3 s，必须在事件后 0.3–0.5 s 读，窗口开到 1.5 s 会把下一次动作吸进来（`04` H8、`06` D47）。

**无输入 fm=5 退出（4 例）**：`接管1` 14.32 s(48 km/h)、`7ea97aae` 64.62/141.24 s(51/65)、`69229f22` 210.56 s(48)，全部 D 挡、ACC 在控、无刹车/打灯/扭矩 → 不是低速边沿，更像 LCC 自身判据丢失（`06` D48）。

**打灯不是「退出」，是「暂停」（2026-11-03 更正）**：11 次「ACC 在控时打灯」里 9 次 lat 自动恢复，暂停中位 6.1 s（p10 2.0 s、p90 20.3 s）。短暂停（2–7 s）ACC 全程保持；只有长暂停（≥4.3 s）或未恢复时 ACC 才跟着退。语义上应描述为「打灯 → LCC 让权，回到车道重新识别到线 → 自动接管」，与刹车/上拨的「退出」不是一类。

### 9.4 设定速度

- `0x083 b5.5–b6.7`（11 bit）= 设定速度，**raw × 0.1 km/h**；
- 滚轮每档 +1 km/h = **10 计数**（步长直方图众数，14 次）；
- ACC 默认值：车速 <50 → 477 计数（47.7）；>50 → 取当前车速；
- 仪表读数 ≈ CAN × 1.046（法规上偏），**不做校正**。

### 9.5 新解出的状态字节

| 字段 | 取值 | 关系 | 覆盖 |
|---|---|---|---|
| `0x083 b15` | 0x00 / 0x64 | ≡ (`b12[2:0]==3`)，LKA 在控（**原表误标 SteerRate**） | 6,963 帧 100% |
| `0x18D b22` | 0x03 / 0x23 | `b22.5 = NOT latActive` | 13,555 帧 0 例外 |
| `0x143 b6` | b6.0 ≡ latActive；b6.7 另有一路慢变状态 | 低 bit 跟随 LCC；高 bit 与 lat/fm/ACC 均无关 | 53,108 帧，b6.0 仅 17 例外 |
| `0x290 b2` | 0x1F/3F/5F/9F | 转向灯状态（关/左/右/双闪） | 三段 10 s 场景 |
| `0x0B7 b3[6:4]` | 0/1/4/6 | 与 0x083 ACC FuncMode 一一对应：0⇔2、1⇔1（待命）、4⇔3（在控）、6⇔5 | 96,510 帧，冲突 ~130（≥99.8%） |

### 9.6 0x083 的发送方与 byte0（2026-11-05 更正）

- **正式定义**（`C_CANFD.dbc`）：`BO_ 131 ADDC_83: 32 ADDC`，周期 20 ms；
- **发送方是 ADDC**（不是 HPC）；`ADDC_CRC_83` = byte0[8]、`ADDC_RollingCounter_83` = byte1 低 4 位；
- **本仓库只有接收端**：`Challenge` 是 0x083 的解析方，没有任何 CAN 发送 API；
- **byte0 已解（2026-11-05）**：`CRC8_H2F(data[1..len-1] ‖ seed[counter])`，`counter = b1 & 0x0F`，poly 0x2F / init 0xFF / xorout 0xFF；
- **三处实现互证**：`CanPacket::getCRCByE2EReal`（lpAdasInput 0xa26a0）、`GwTools::getCheckSum2E2ECrc`（lpIcuGw 0x6e3fc）、`Lp::getCheckResult`（lpCanEngine 0x99968，56 个调用点覆盖 38+18 个报文处理器）；
- **seed 表**：56 张（counter 0→15）已提取到 `e2e_seed_tables.json`；0x083 的 16 字节与 57,077 帧反推**逐字节一致**；
- **复验**：18 条报文约 130 万帧，`verify_e2e.js` **0 失配**（0x083 100,734/100,734）。

完整表与参考实现见 `10_E2E_CRC与seed表.md`。

### 9.7 数据侧产物

`fullcap\69229f22_signals.csv`（11,708 行 50 Hz）、`*_carstate_offline.carstate.jsonl`，
以及第二批 11 个会话各自的 CarState 回归产物（均 0 硬不变式违反）。

