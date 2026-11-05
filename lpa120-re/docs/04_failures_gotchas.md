# 04 · 失败方案与工具坑

> 本文是最省时间的一份：所有走过的死路、根因、证据都在这里。**遇到相似问题时先查这里**。

---

## A. 被否决的方案（安全/法律，不再讨论）

| 方案 | 结论 |
|---|---|
| 给 OTA 包加 root / 重签名 | ❌ 无签名私钥；且属伪造固件，不做 |
| 利用内核漏洞提权 | ❌ 不做 |
| 通过 DDS 向 `/leap/hpc/public/p/lpGateway` 发布控制帧 | ❌ 等于经网关注入 CAN 控制帧，红线 |
| 删除 `/opt/fota/` 触发重新下载 | ❌ 会进入半升级状态，红线 |

---

## B. 软件只读路径（三条全关，根因相同）

### B1. CarService 读车辆属性

| 尝试 | 结果 |
|---|---|
| `cmd car_service get-property-value 0x11600209` | ❌ `SecurityException: requires non-user build` |
| `dumpsys android.hardware.automotive.vehicle@1.0-service` | ❌ 服务名不存在（实际是 **2.0**） |
| `dumpsys` VHAL 2.0 | ❌ 不可 dump |
| 自签 APK 调 `CarPropertyManager.getProperty` | ✅ 能调通（无崩溃），但返回 `ERR:SecurityException` |
| 加 `sharedUserId="android.uid.system"` | ❌ 安装报 `INSTALL_FAILED_SHARED_USER_INCOMPATIBLE` |
| 去掉 sharedUserId | ✅ 装上了，但属性全 `SecurityException` |

**根因**：`android.car.permission.CAR_INFO` 的 protectionLevel 是 `signature|privileged` → 需平台签名。

**附带事实**：`adb install` 自签 APK 报 `INSTALL_FAILED_INVALID_APK: Install app package has to be legal` —— 车机 PM 有签名白名单。

---

### B2. DDS / lpcom 订阅 CAN 桥

**调用链本身是通的**：`create → RC_OK`、`lookup → ok`、`open → RC_OK`、`isReady=true`。

**但 `matched` 回调从未触发，`msgs=0`。**

**根因（决定性证据）**：

```
avc: denied { ioctl } for comm="Thread-2" path="socket:[...]" ioctlcmd=0x8927
     scontext=u:r:untrusted_app:s0:c117,c256,c522,c768
     tclass=udp_socket permissive=0
```

`0x8927` = **SIOCGIFHWADDR**（取网卡 MAC）。Fast-DDS 用它生成 participant GUID/locator，
被 `untrusted_app` 域拒绝 → 发现不到发布者 → 永远收不到数据。

**对照**：`com.leapmotor.cameraaround` 跑在 `u:r:system_app:s0`，它的
`LpComManager -> /leap/mainlycontrol/command` 能正常收消息。

**试过的变体全部失败**：

| 变体 | 结果 |
|---|---|
| transType=0（仅网络） | open OK，avc 拒 ioctl → 无发现 |
| transType=1（仅共享内存） | `lookup` 返回 **null**（不可用） |
| transType=2（两者） | 同 transType=0 |
| profile 里放两个通道 | `lookup` **全部 null**（解析器只认第一个通道） |

→ **DDS 只读路径同样需要平台签名（system_app 域）**。

---

### B3. 安装工具重签

「安全安装中心」`moe.jozooqm.pdyfglpOb`（v1.1.40038_zh）分析结论：

```
自身签名：CN=Android, O=Android, EMAILADDRESS=android@android.com
SHA-256: a40da80a59d170caa950cf15c18c454d47a39b26989d8b640ecd745ba71bf5dc（AOSP testkey）
内置：libinstall_runtime.so + libSecShell.so
dex 字符串：adbkey.pk8 / adbkey.pub.der / signToken / KeyGenParameterSpec
行为：用 AndroidKeyStore 生成 ADB 密钥 → 签 ADB 认证令牌 → 拿 shell → pm install
```

**它给自己签 ADB 授权令牌，不给 APK 签名。** 装 sharedUserId 包时明确报"A**原版** WiFi ADB 安装失败: INSTALL_FAILED_SHARED_USER_INCOMPATIBLE"。

**APK 里没有私钥**（只有公钥证书 + 授权校验用 `rsa.pub`/`rsa.sig`），这是密码学事实，不是"没找到"。

---

## C. 网络/协议类失败

### C1. "电脑可直接访问车内网络" —— **假象**

`Test-NetConnection 192.168.1.1:3850` 全绿，实际是 Windows 上的 **FlClash 虚拟网卡**接的 TCP 握手，根本没到车。

**真相**（车机内部实测）：

| 目标 | 结果 |
|---|---|
| 192.168.1.1:3850 | ✅ **可连**（但服务按需起停） |
| 192.168.1.1:3800 | ✅ |
| 192.168.1.202:13400（FSC） | ❌ 拒绝（当前不监听） |
| 192.168.8.1:13400 | ✅ DoIP v3，回 `03 FC 00 07 00 00 00 00`（Alive Check） |

**修正**：Android 的 `eth0 = 192.168.1.3/24`，`ping 192.168.1.1` = 0.4ms **通**。
早期"1.x 不可达"的判断是错的——当时是端口没监听，不是网络隔离。

### C2. DoIP 只到座舱

- 路由激活（RA）申请 SA=0x0E00 → 收 `07 DF 0E 00 10`（code 0x10 接受）
- 诊断到 `0x0777`（ICHS）✅ 返回 `62 F1 89 "3.16.0907"`
- `0x0756`(FSC) / `0x0796`(TBOX) / `0x0E00` → `NACK 0x03 未知目标`
- 用 SA=0x0E00 发诊断 → 只有 0x8002 正应答，**无 UDS 响应**，且服务端 0.05s 内关闭连接

→ DoIP 分支已停，仅存档。

### C3. 3850 原始客户端（`qnx_ota.py`）

从电脑跑永远连不上（FlClash 假象 + 服务按需）；从车机内部也常在 `refused` 与 `-150` 之间摇摆。

**正确做法**：走 App 的 `-101` 功能（见 `03_flows_findings.md` §2），不要裸连 3850。

---

## D. 数据/加密类失败

| 尝试 | 结果 | 根因 |
|---|---|---|
| 用测试密钥解 DBC | ❌ | 私钥在 TEE（`lpTeeEngine → liblpSecTeeRpc`） |
| 假设 `testDBC/` 是明文备份 | ❌ | 同一套数字信封，`C_CANFD.dbc` 长度都是 503,116，头 `00 00 00 00 06 02 00 00` |
| 用清单 `sha256` 校验明文 | ❌ | 对不上；权威校验是 GCM tag |
| 在配置文件里找密钥 | ❌ | 107 个文件全量检索，唯一命中是 topic 名 `/leap/account/passwd` |
| 假设 eventid = signalId | ❌ | 交叉检验命中率 3.3%，等于随机噪声密度 3.2% |

---

## E. 工具坑（会浪费一整天的那种）

### E1. `aapt add` 不替换同名条目 ★★★

```
现象：aapt2 link / aapt add / zipalign / apksigner 全部返回 0，无任何报错，
      但产物里的 classes.dex 是旧的。
根因：往已存在的 APK 里 aapt add 同名条目不会替换。
修法：构建前必删 app-unsigned/ap-aligned/app-signed.apk；构建后从 APK 内读回 dex 校验哈希。
```

已固化在 `G:\Codex\lpcom-probe2\build.ps1`（7 步 + 产物自检 + `-Baseline` 门禁）。

### E2. PowerShell 脚本必须存成 UTF-8 **带 BOM**

```
现象：含中文的 .ps1 报 "字符串缺少终止符" / 表达式意外。
根因：PS 5.1 按 ANSI 读无 BOM 的 UTF-8，中文变乱码破坏引号配对。
```

### E3. `am force-stop com.leapmotor.systemupdate` 会毁掉 QNX 会话 ★★

```
现象：之后所有 -101 返回 -150，重启 App / 点刷新都无效。
日志：updateService send heartbeat failed! + socketDisConnect 3850/3900
修法：只能重启车机（Android 重启即可恢复，因 QNX 侧状态随之重建）。
```

### E4. `input text` 长字符串截断

```
现象：路径被截到 20–34 字符，尾部丢失。
影响：深层文件（/opt/usr/conf/lpPNC/config_*/xxx，约 170 个）未能取回。
修法：分两段输入（每段 <40 字符），每段之间 sleep。
```

### E5. 车机 UI 自动化的边界

| 现象 | 说明 |
|---|---|
| `screencap` 主屏全黑 | 三 display（0:2560×1440 / 1:864×480 / 2:1920×480），HWC 直通抓不到 |
| `input tap` 有时不改变焦点 | 但 `keyevent` 对**已聚焦**字段有效 |
| 软键盘弹出后布局位移 | 点按坐标会错位，必须 `keyevent 4` 收键盘再回读 |
| 负数字符串参数 | `input text -- '-101'` 会把 `--` 当字面文本；**负号必须用 `keyevent 69`** |
| 多 display 输入 | `input -d <id> tap` 可指定，但当前焦点窗口才有意义 |

**可靠做法**：`uiautomator dump` 回读 → 校验四个字段 → 再点确认。回读解析脚本必须**传入文件路径**，不要硬编码（曾因硬编码旧 dump 文件连续误判多轮）。

### E6. `ext4.js` 的 depth=1 bug（已修）

```
现象：>几 MB 的多级 extent 文件读出 0 字节（CarControl.apk 47MB）。
根因：extent 索引节点按叶子条目布局解析（ei_leaf_lo 偏移取错）。
修法：索引条目 ei_leaf_lo@+4、ei_leaf_hi@+8。修后 CarControl.apk 完整提取 47,139,375 B。
```

### E7. DWARF `bit_offset` 语义 ★★

```
坑：DWARF4 的 DW_AT_bit_offset 是 MSB 计数；DWARF5 的 DW_AT_data_bit_offset 是 LSB 绝对位。
误判后果：整套布局整体错位 5 字节。
裁决方法：反汇编看解析函数从哪个字节取该字段（本例 byte2 bit0 证实 MSB 语义）。
教训：语义歧义必须用代码证据关闭，不能用"内部一致性"推理。
```

### E8. 别的坑

| 坑 | 说明 |
|---|---|
| `python` 是 Store 占位符 | 用 `C:\Users\<user>\.dsh\dsh-runtimes\...\python\python.exe` |
| Ghidra Windows 版不认 ELF | 用 NDK `llvm-objdump` / `llvm-dwarfdump`（`28.2.13676358`） |
| `llvm-objdump -t` 空 | 库被 strip，用 `-T`（动态符号）或自写 dynsym 解析器 |
| PowerShell `>` 重定向写二进制 | 会写 UTF-16，必须 `[IO.File]::WriteAllBytes` 或 `adb pull` |
| `adb exec-out screencap -p > f.png` | 同上，会损坏；改 `screencap -p /path && adb pull` |
| `Get-Content` 读 UTF-8 | 要显式 `-Encoding UTF8`，否则中文乱码导致 XML 解析失败 |
| PowerShell 通配符不传给原生 exe | `node x.js dir\*.ndjson` 会 ENOENT（exit 1）。用 `Get-ChildItem` 取 `FullName` 数组作为参数传入，或外层 `ForEach-Object` 逐个调用（写法见 `dq_gate_selftest\README.md`） |
| 我的 `p3.js`/`pf.js` 硬编码 dump 路径 | 导致"字段没变"的假象，连续误判多轮；**解析脚本一律传参** |

---

## F. 解析/导出器类失败（2026-11-01 新增）

### F1. DWARF 导出器把嵌套结构体展平（★ 静默产生垃圾数据）

```
现象：Proto_Can1_HPCVCU_0B7_t 显示 219 个字段，其中 200 个是
      Xaxis/Yaxis/XrelVelocity/IBC_EPB/iTPMS 等雷达目标列表成员；
      普通成员偏移最大 9312，远超 32 字节帧长。
根因：llvm-dwarfdump 的 DIE 缩进在"冒号之后"（`0x...:     DW_TAG_member`），
      v1 正则从行首取缩进（恒为空）→ 嵌套匿名结构体的成员被并入外层。
修法：v2 按「行首空白 + 冒号后空白」计算 indent；成员归属改为"最近的上层命名结构体"；
      新增断言 plainLocMax >= struct.size → 判污染并剔除。
产物：dwarf_export2.js / dwarf_structs_v2.json / dwarf_report.json
```

**为什么危险**：命令全部成功、字段名全是真的、结构看起来合理，**只有数量对不上才暴露**。
同类于 `aapt add` 不替换条目：**命令成功 ≠ 结果正确，必须做量纲检查**。

### F2. 位域/普通成员混排的判别

```
规律：Proto_Can1_* 全是位域成员（有 bit_size/bit_offset），结构体 ≤32 字节；
      DAEIVS_*_OutArgs_t 全是普通成员（无位属性），结构体 44–216 字节。
判据：若某结构体"普通成员且 loc >= size"，一定是嵌套污染，不是真实布局。
```

### F3. 静态表格的"看起来对"陷阱

```
0B7 的 v1 表混了 8 处污染物进 md（Xaxis 等），肉眼扫一遍很难发现
（字段名都是真的，只是不属于这个帧）。
对策：每张表都附"字段数 + 位覆盖是否恰好铺满"两个校验列。
```


---

## G. 采集链路类失败（2026-11-02 新增）

### G1. 回放会话被当成实时数据（浪费一整轮分析）

```
现象：session 313f9745 一直 active/online，frame_count 涨到 63,261，
      但所有帧的时间戳冻结在 22:23:07，而序号继续涨到 68,262。
判断：live 流收到的是历史回放（或设备端循环重发），不是实时采集。
检验：max(timestamp_unix_us) 与当前时间的差应接近 0，且 status 应为 closed。
```

### G2. 不点「结束」导致尾部不完整

```
现象：status=active 时 durable_through_sequence < last_sequence，导出尾部缺失。
做法：采集后必须在手机 App 点结束，确认 status=closed 且两者相等。
```

### G3. 静态数据被误判为「车没动」

```
现象：某会话 35 个 ID 中只有 3 个载荷有变化，油门恒 0、转角恒 5.8°。
原因：那是台架/回放数据，不是行驶数据。
判别：正常行驶时 0x0CB（电机转速）与 0x184（四轮速）必然变化。
```

### G4. CRC 爆破 370 万组合全失败

```
覆盖：CRC-8 全 poly × 全 init × refin × xorout × 所有连续区间；
      CRC-16(CCITT/XMODEM/MODBUS/IBM) 取低/高字节；CRC-32 折叠；
      Fletcher-16；加权和；逆序帧；尾部常量变体。
结论：byte0 是 bytes[1..31] 的纯函数（13,590 个唯一组合各自对应唯一 byte0），
      但不属于任何标准校验族 → 厂商自定义。
影响：读侧不需要；写侧才需要（红线内不做）。
脚本：G:\Codex\ota_probe\crc*.js
```

> **2026-11-03 二次定案：byte0 不是任何线性 CRC —— 不必再爆破。**
>
> 1. **纯函数成立**（干净 ndjson 复核：13,590 个唯一组合，0 冲突）；
> 2. **byte1（计数器）参与校验**：按 bytes[2..31] 分组出现 3,576 处"同输入不同 byte0" → 覆盖范围含 byte1；
> 3. **GF(2) 仿射求解不成立**：把 byte0 当作 bytes[1..31] 的仿射函数（248 位输入 + 常数）做高斯消元，
>    4,000 帧中 **1,991 行矛盾**（≈随机水平）；同一求解器在合成 CRC8 数据上 0 矛盾、4,000/4,000 命中（求解器已验证）；
> 4. **自由常数扫全多项式**：255 个 poly × 2 种反射，允许 init/xorout 任取（即常数项自由），800 帧内**无一个能恒定**；
>    sum / xor / Fletcher 变体命中率均 ≈ 0.4%（随机水平）。
>
> 推论：**任何对 31 个线上字节做线性（可任意比特重排、任意子集）的 CRC-8 都不可能产生该 byte0**。
> 之所以看起来"像 CRC"，是因为它对 bytes[1..31] 是确定性的——但确定性 ≠ 线性。
>
> **0x083 单独取证（不套用 0x18D 的结论）**：同样在干净数据上检验——纯函数 5,385 组合 0 冲突、
> 依赖 byte1（9,240 处冲突）、仿射求解 1,993–2,105 行矛盾（秩仅 29，但矛盾与秩无关）、
> 全 poly + 自由常数无解。结论同为"不是线上字节的线性校验"，同样只影响发帧。
> 详见 `reanalysis\fsc\0x083_完整解码表_2026-11-02.md` 末节。
>
> **2026-11-05 已解**：byte0 = `CRC8_H2F(data[1..len-1] ‖ seed[counter])`（poly 0x2F / init 0xFF / xorout 0xFF），
> seed 表来自 QNX `lpCanEngine`/`lpIcuGw`/`lpAdasInput` 三处实现，与 57,077 帧反推逐字节一致；
> 18 条报文约 130 万帧复验 0 失配。上述“不是线性校验”的误判源于**漏掉 seed 字节**且按 counter 分组前的表示。
> 详见 `10_E2E_CRC与seed表.md`。


### G6. 时间基只有 1 ms —— 所有 dt 类量都被量化（2026-11-03）★★★

```
现象：约一半帧的 timestamp_unix_us 与前一帧完全相同；
      任何"相邻帧 dt"算出 0 或 1 ms，减速度/加速度因此爆表。
根因：设备端 timestampUnixUs = System.currentTimeMillis() * 1000L（硬 1 ms）；
      归档里的 timestamp_monotonic_ns 是服务端由 ms 合成（records.py: int(ts)*1000），
      不含额外精度。PCAN 的 µs 硬件时戳被 XOR 进 capture_flags 后丢弃。
判别：unix_us % 1000 恒为 0；每毫秒 2 帧时重复率≈50%；200 fps 的诊断会话重复率为 0。
做法：① 任何 dt 类量窗口 >= 100 ms（推荐 200 ms）；
      ② 车速用 0x184，不用 0x182（后者 43–82% 时间不在总线上）；
      ③ 数据先过 ota_probe\dq_gate.js 闸门。
```

**为什么危险**：它看起来像"导出 bug"，于是有人去修导出——但导出是对的，坏的是采集端的时间基。
不去修源头就会一直得到"物理上不可能"的数（2.9 g），并把结论建立在噪声上。

---

### G5. 时间戳重复导致减速度计算失真（2026-11-03）

```
现象：4 条会话中约 50% 的帧时间戳完全相同（69229f22: 144,239/282,795）。
后果：任何"相邻帧时间差"都可能是 0，减速度 / 周期全被污染；
      据此算出的"峰值减速度 28.48 m/s²"（≈2.9g）违背物理，已作废。
对策：涉及时间差的量必须先做时间戳去重/重采样，或改用单调计数（0xXXXX byte1 滚动计数）。
```

> **2026-11-03 更正**：本条把"重复时间戳"当成病根，**归因错了**。
> 重复的根本原因是**时间基只有 1 ms**（1200 fps → 2 帧/ms → 约半数落在同一毫秒），属量化必然，不是异常。
> 28.48 m/s² 的真因是 **0x182 条件发送导致样本陈旧 + 60–80 ms 短窗口**。详见 `08_timebase_data_quality.md` §5。
> 本条仅作历史留档，**现行规则见 G6**。

---

## H. 场景包 / CarState 阶段新踩的坑（2026-11-03 晚）

### H1. 按 timestamp 做跨 ID join ★★★

```
现象：两份导出对不上，帧内容『完全不像』；或对齐后状态全乱。
根因：约 50% 的帧共享同一毫秒（2 帧/ms），按时间戳等值匹配必然串行。
做法：一律按 sequence 对齐（会话内单调）；candump 与 ndjson 对质也用 sequence。
```

### H2. candump 的 ## 两位是 flags，不是 payload ★★

```
现象：解析出的 payload 与 ndjson 差半个字节，但 counter 仍连续、角度仍平滑（看起来正常）。
形如：18D##10780242...   ← ## 后面 10 是 BRS/ESI，真实 payload 从 78 开始。
做法：剥 ## 后再丢 2 个十六进制字符；或直接与同 sequence 的 ndjson 逐字节对质。
```

### H3. 四轮均值 + 短窗口算减速度 → 假值 ★★★

```
现象：急刹时算出 13–18 m/s²（1.3–1.9 g），物理不可能。
根因：ABS 工作时单轮可在一帧内跳 13 km/h（急刹2 9.57 s：FL 5.9 而其余 11.3）。
做法：四轮取中位 + 窗口 ≥500 ms。**2026-11-03 更正**：单改中位不够——ABS 时四轮同涨同落，中位只削 1.6 m/s²；真正起作用的是窗口（300 ms ≤12、500 ms ≈10.5）。管线因此拆双口径：`aEgo`（100 ms，瞬态）与 `aEgoRobust`（中位 + 500 ms，减速度）。
```

### H4. 窗口比较的浮点边界 ★★

```
现象：aEgo 有 25% 的行恒为 0，看起来像『车匀速』。
根因：50 Hz 栅格的 5×20 ms 常求和为 0.09999999999999999；搜索用 1e-9 容差、返回前却要求精确 ≥0.1。
做法：搜索与最终判定用同一个 epsilon（现为 TIME_EPSILON_S=1e-9），并加专项夹具。
```

### H5. .trc 的 3 位小数不是 µs ★★

```
现象：看到 x.778 ms 就以为是 µs 分辨率，去做亚毫秒差分。
实测：亚毫秒 Δ 几乎全是 999 µs，真实量子 1 ms；小数是 0.999 缩放的表示抖动。
做法：用 Δ 分布判量子（dq_gate.js 已改），不要用『值是否落整毫秒』判。
```

### H6. PCAN-View 单文件上限 100,000 条 ≈ 87 s

```
现象：长测试被截断，尾部没有。
做法：每拍控制 ≤75 s 或调大上限；文件名写清场景（不要用 去/回）。
```

### H7. 把仪表读数当刻度反推单位（思维坑）

```
现象：仪表显示 50、CAN 读到 47.7 → 反推『单位是 0.1046』，写进解码表。
实情：单位就是 0.1；仪表读数整体上偏 ≈4.6%（法规允许），滚轮步长 10 计数/1 km/h 可独立证明。
教训：单位要用『步长』或『同源比值』证明，不要用单个显示值除法。
```

### H8. 用 1.5 s 窗口判 fm（会把后续事件吸进来）

```
现象：统计 LAT 退出原因时，取「事件后 0–1.5 s 的第一个非 3 的 fm」，得到 8 个 fm=1；
      改成「事件后 0.3–0.5 s」后，fm=1 里无刹车的案例从 2 个变成 0 个。
原因：0x142 是 0x083 命令的回显，滞后约 0.3 s；窗口开太大就会读到下一次动作的 fm。
做法：判退出原因统一用 0.3–0.5 s 窗口；长度超过 0.5 s 的结论要标注窗口宽度。
```

### H9. 把「无输入退出」当成低速边沿

```
现象：7 例无输入 fm=5 被假设为「低速/启动边沿」。
实测：严格口径只有 4 例，且全部发生在 48–65 km/h 的 D 挡巡航（`接管1` 14.32 s、`7ea97aae` 64.62/141.24 s、`69229f22` 210.56 s）。
教训：先按严格阈值（|T|<1 Nm、无刹车、无打灯）筛，再看速度分布，不要先给假设再找例子。
```