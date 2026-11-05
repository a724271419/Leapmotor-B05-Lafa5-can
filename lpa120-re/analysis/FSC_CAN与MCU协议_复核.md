# FSC CAN 与 MCU 协议复核（Codex，2026-10-30）

范围：只读静态复核四个 FSC 文件系统、`libDAEIVS_ADAS_Can.so`、`libadas_can*.so`、`libudsclient.so` 与 `Fast_dds_profile.xml`。没有执行目标程序、没有连接车辆、没有发送 CAN/UDS 报文。

## 结论摘要

DeepSeek 找到的 FSC CAN 接收适配、EPS 0x18D 布局，以及 MCU 升级使用 UDS/ISO-TP 的主线成立；但“所有报文统一校验”“批量表 109 个字段可直接生成 DBC”“DDS writer 已证明 FSC 向底盘发布控制”“FSC↔MCU 只走 UDS、不是 SPI”均超过现有证据。

对 OpenPilot 当前最可靠的新增价值是：可以用 0x18D 的接收布局验证实车抓包中的方向盘角度、转速和扭矩；尚未得到 EPS 横向控制命令帧、发送布局、滚动计数或控制授权条件。

## 1. 已确认

### 1.1 文件与架构

| 文件 | 大小 | SHA-256 | 架构 |
|---|---:|---|---|
| `libDAEIVS_ADAS_Can.so` | 26776 | `8b8dd98501022c73428c6f0fb204f51e0597546e04b3b9602d08fa4182d0617f` | ELF64 AArch64 |
| `libadas_can.so` | 21912 | `5e5b87467a09d2b9db4949c0270615b6a84bf9a7bba49bbaa74b0463feb34f31` | ELF32 ARM |
| `libadas_can_debug.so` | 101824 | `2e1fe7eff62f6062eb62e166c27253cf01c246ec4afde095ecf7ed8766e00f31` | ELF32 ARM |
| `libudsclient.so` | 93636 | `7e974351844574e2f452c970ffa31e9bd7a5d97f22ade441c569964d9f0dc243` | ELF |

四个 uImage 包裹的 SquashFS 已能离线读取。CAN 库、Fast DDS 配置和 UDS 客户端均真实存在。

### 1.2 `unpackCan1Msg` 的实际分发表

`libDAEIVS_ADAS_Can.so` 的分发代码直接比较 CAN ID，并进入 19 个 CAN1 解析器：

`0x0CB, 0x0DC, 0x0B6, 0x0B8, 0x100, 0x130, 0x134, 0x135, 0x18D, 0x200, 0x227, 0x233, 0x247, 0x24F, 0x290, 0x2A3, 0x340, 0x3B0, 0x3D2`。

调试库中的更多 ID 和信号名是有价值的协议字典线索，但不能自动证明它们全属于同一车型、同一 CAN 通道或当前运行配置。

### 1.3 EPS 0x18D 接收布局（兼容库；不代表当前运行链）

> **2026-10-30 后续复核更正：**本节描述的是 AArch64 `libDAEIVS_ADAS_Can.so` 的 8 字节兼容布局。实际 `Challenge` 是 ARM32 程序，并动态依赖 ARM32 `libadas_can.so`；该库调试信息中的当前 `Proto_Can1_EPS_18D_t` 为 **32 字节 CAN-FD**。因此本节不得用于当前车型抓包解码，运行链布局以新增的《OpenPilot适配证据_OTA深挖_2026-10-30.md》为准。

手工核对 AArch64 指令后，下列解码成立：

| 原始位置 | 解码 |
|---|---|
| byte1..2，小端 u16 | `raw * 0.1 - 900`，高度符合方向盘角度 |
| byte3，u8 | `raw * 4`，高度符合方向盘转速 |
| byte4..5 低 12 位 | `raw * 0.008 - 8`，高度符合转向扭矩 |
| byte0 bit0..5 | 六个状态位，具体名称仍需结构体偏移对齐 |
| byte6 bit2..3 | 两个状态位，具体名称仍需对齐 |
| byte7 | 与 byte0..6 累加取反结果比较 |

0x18D 校验算法确认是：

```text
check = (~(sum(byte[0..6]) & 0xff)) & 0xff
```

它是接收状态帧，不是 EPS 控制命令帧。仅凭这些字段不能生成 OpenPilot 的转向发送代码。

### 1.4 MCU 升级/诊断路径

`libudsclient.so` 含标准 UDS 服务与 ISO-TP 流控语义；结合 `peripheral` 中 `uds:LP:0x787` 和刷写地址 `0x1CC00000`，可以确认 FSC MCU 的升级/诊断路径使用 UDS over CAN/ISO-TP。

准确边界是“升级/诊断路径已确认”。当前证据不能证明 FSC 与 MCU 的所有运行时通信都只走 UDS，也不能仅因存在独立 `spidump` 就排除其它 SPI 用途。

## 2. 必须纠正

### 2.1 不是所有报文都使用同一校验

19 个 CAN1 解析器中只有 12 个调用地址 `0x1c68` 的累加取反函数：

`0x0DC, 0x0CB, 0x100, 0x0B8, 0x290, 0x2A3, 0x18D, 0x24F, 0x134, 0x130, 0x233, 0x227`。

以下 7 个解析器没有该校验调用：

`0x0B6, 0x200, 0x3D2, 0x247, 0x3B0, 0x135, 0x340`。

因此不能把 byte7 统一解释为 checksum，更不能据此宣称全库或整车 E2E 规则一致。

### 2.2 批量布局表存在已证实的错误

`parse_fsc_can.js` 是线性、路径不敏感的简化寄存器追踪器，不能可靠处理控制流、寄存器复用和跨基本块数据流。结果中已经出现不可能或明显错误的值：

- `parseEsc_233` 报告“byte2，位偏移 24，位宽 14”；单字节不存在 bit24。
- 同一字段给出 `5.9374700256967084e-123` 的物理偏移，显然是把浮点常量位模式追错。
- 脚本会把所有识别到的 store 都当成可信字段，但没有验证源宽度、基本块可达性和结构体类型。

所以 `109 fields` 只能视为候选清单，不能直接转成 DBC。0x18D 是单独手工核对过的例外。

### 2.3 Fast DDS 配置不等于已证明的底盘控制输出

`Fast_dds_profile.xml` 确实定义：

- topic profile `leap_topic_controlcommand`
- `control_command_data_writer`
- 同名 data reader

这证明固件包准备了控制命令主题和读写 QoS profile。XML 本身不证明：

- 当前车型运行时一定创建并使用 writer；
- topic 的消息结构是什么；
- 消息最终被转换为哪条 CAN 帧；
- FSC 是控制源、转发者还是测试/兼容节点；
- 它能直接控制 EPS/IBC。

需要在实际可执行文件中找到 topic 名、writer 创建点、publish 调用和 CAN 打包调用之间的可追踪数据流，才能升级为“FSC 发布底盘控制”。

## 3. 对 OpenPilot 的可用性排序

1. **立即可用（被动验证）**：用 0x18D 布局解码实车抓包，验证方向盘角、角速度和扭矩的周期、量程与动作相关性。
2. **已完成并排除**：两份 CAN 适配库的 `unpackAlgControl` 都是空实现，不能从中取得 EPS/LKA 发送协议。
3. **辅助线索**：将调试库的信号字符串与结构体目标偏移对齐，逐条给接收字段命名；跨车型字符串必须标车型/版本置信度。
4. **暂不能用于控制**：DDS `controlcommand`、0x787 UDS 和接收帧 0x18D 都不是现成的 OpenPilot 横向控制接口。

## 4. 当时的建议（已在 §5 执行）

先逆向 32 位 ARM 的 `libadas_can.so`，因为它更可能包含 `DAEIVS_unpackAlgControl`、CAN 白名单和发送打包路径。输出应按“函数地址 → 输入结构体字段 → CAN ID/DLC → payload 位布局 → counter/checksum → 调用者”逐项留证。未获得发送路径前，不生成可用于车辆发送的 DBC，也不做实车注入测试。

## 5. 32 位 `libadas_can.so` 继续复核结果

### 5.1 必须按 Thumb/Thumb-2 解码

该 ELF 的机器类型是 ARM，但代码使用 Thumb/Thumb-2。按 ARM 模式直接反汇编会出现大量伪指令、非法跳转和错误调用关系；此类输出不得作为协议证据。本轮用 `thumbv7a-linux-android` 重新解码。

### 5.2 `DAEIVS_unpackAlgControl` 是空实现

32 位 `libadas_can.so` 的 `DAEIVS_unpackAlgControl` 只有：打印 `DAEIVS_unpackAlgControl Success`，返回 0。64 位 AArch64 `libDAEIVS_ADAS_Can.so` 中的同名函数也只有日志和返回 0。

因此，当前两份库中都没有“算法控制量 → CAN 控制帧”的实现。函数名不能被解释为已经找到控制接口。

### 5.3 `DAEIVS_unpackPutCanMsg` 是输入帧解析入口

Thumb 调用关系显示：

- 通道 1 路径调用 `unpackCan1Msg` 与 `unpackCan3DebugMsg`；
- 通道 2 路径调用 `unpackSpiCan1Msg` 与 `unpackCanfdDdsResult`；
- 输入结构含 CAN ID、时间戳与 payload 指针，结果写入全局车辆/雷达/DDS 信号结构。

这进一步确认 `libadas_can.so` 的主体用途是接收、白名单和信号解码，而不是底盘控制发送。

### 5.4 白名单直接证据

车型分支 0 的 `DAEIVS_unpackGetCanWhiteList` 在代码中直接写入 18 个 ID：

`0x0DC, 0x0CB, 0x100, 0x0B6, 0x200, 0x0B8, 0x290, 0x247, 0x3B0, 0x2A3, 0x18D, 0x24F, 0x135, 0x134, 0x130, 0x233, 0x227, 0x340`。

这份白名单比从调试字符串归纳出的 28 ID 更强，因为它是当前库实际返回的数据；但仍需通过运行配置确认车辆选择的确是分支 0。

### 5.5 主程序 `Challenge`

从 `AX620customer` 提取 `/bin/Challenge`：

- 大小：12518196 字节
- SHA-256：`9457a446f81ad44a09666cd175d5b2fe9ff3ad4e052e4674ad391aa798b2562a`
- ELF32 ARM，可执行文件
- 动态依赖明确包含 `libadas_can.so`、Fast DDS/Fast CDR、`liblpComPS.so.1` 与 VSOME/IP
- 对 CAN 库的动态导入只有 `DAEIVS_createCANChannel`、`DAEIVS_getCANChCaps`；其余操作通过返回的能力表函数指针调用

主程序中确实存在 `LKACmd`、`LkaSwitch`、`LkaFuncMode`、`Send can data failed`、`Send IVI Can msg error!`、`DHIVS_PAL_Canfd_Send`、`UDS_Com_CanSend` 等字符串。这证明主程序同时包含 LKA 逻辑、DDS 与某些 CAN/UDS 发送能力，但字符串尚未建立“LKACmd → 某 CAN ID/payload → EPS”的数据流。它不能抵消两份 CAN 适配库中控制回调为空的事实。

## 6. 更新后的下一步

真正的发送线索应转向 `Challenge` 本体，而不是继续把接收解析库强行解释成控制库。优先追踪：

1. `DAEIVS_createCANChannel` 返回的能力表在主程序中的间接调用；确认 `unpackAlgControl` 是否被调用，以及空实现对系统意味着什么。
2. Fast DDS 的 `LKACmd`/control command protobuf 打包点与 subscriber/writer 创建点。
3. `DHIVS_PAL_Canfd_Send` 和 `Can_Send` 的调用者、固定 CAN ID 与 payload 来源，区分 UDS/状态上报/IVI 消息和真实底盘控制。
4. 只有当同一条调用链把 LKA 控制量带到具体 CAN ID 与 8/FD 字节布局时，才把它认定为 OpenPilot 可研究的发送协议。
