# 02 · 资产清单

所有路径以 `G:\Codex\` 为根。常用根变量：

```powershell
$P='G:\Codex\ota_extract_2026-10-28'
$R="$P\review_2026-10-31"
```

---

## 1. OTA 原始与解密

| 路径 | 内容 | 大小 |
|---|---|---|
| `$P\files\*.encrypt` | 13 个原始加密包 | ~4 GB |
| `$P\plain\` | 13 个解密后包 | 3.96 GB |
| `$P\manifest\` | 清单 / 证书 | — |

解密参数（见 `03_flows_findings.md` §1）：AES-256-GCM，块 1,048,576 密文 / 1,048,560 明文 / 16 tag。

---

## 2. 固件解包

| 路径 | 内容 |
|---|---|
| `$P\ichs\` | ICHS 22 子镜像（`sw-description`、`boot.bin`、QNX IFS、`super.android.img`、`oem.img`） |
| `$P\ichs\super.android.img` | Android 动态分区（4.74 GB，liblp） |
| `$P\ichs\oem.img` | QNX oem 分区（3 GB） |
| `$P\android\` | Android 分区提取物 |
| `$P\reanalysis\fsc\` | FSC 相机固件（4 个 squashfs + `extracted\` 库） |
| `$P\reanalysis\tbox\` | TBOX 五卷 UBI + `oemapp_forensic\` |

**分区偏移**（`ext4_extract.js` 第 3 参，十六进制）：

```
system     = 100000
vendor     = 54d00000
system_ext = 6f800000
product    = 7b900000     ← CarControl.apk (inode 62)
```

---

## 3. CAN 数据资产（`$P\can_data\`）

### 3.1 从车上实拉的配置（107 个文件，7.2 MB）

| 路径 | 内容 |
|---|---|
| `conf_all\` | **主集合**：107 个 `/opt/usr/conf` 文件（含子目录扁平化） |
| `conf\` | 第一批 89 个（子集） |
| `conf_full\` | 2026-11-03 按目录树原样拉回：`lpAlgCommon` 36 / `lpLocalization` 91 / `lpAlgDesensi` 10 / `lpAudioAes` 5（共 143，含完整相对路径）。**N7 已弃（D43），`lpPNC` 1,151 未拉** |
| `canids\` | `ids_analyser.ini` + 两份 profile + 日志包 |

**核心文件**：

| 文件 | 大小 | 用途 |
|---|---|---|
| `conf_all\canConfig.json` | 102 KB | **527 条信号目录**（canId/comment/signalId/filterTimes/periodicSignal） |
| `conf_all\filter_lpCanAnalysis.json` | 21.7 KB | **ID→通道映射**（128 条规则，含 `interval_times`） |
| `conf_all\CanSubscribe_lpAdasInput.json` | — | ADAS 实际订阅的 13 条 |
| `conf_all\CanSubscribe_CarService.json` | 66 KB | 车控订阅 |
| `conf_all\CanSubscribe_lpIVI.json` | 74 KB | 座舱订阅 |
| `conf_all\lpCanAnalysis_*.xml`（3 份） | — | DDS 通道配置 |
| `conf_all\lpIcuGw\A\netcfg_lpGateway.xml` | — | 网关网络配置 |
| `canids\ids_analyser.ini` | 3,519 B | 11 条总线定义 |

⚠️ `conf_all\` 是**扁平化**的（丢了原目录结构），`conf_full\_files.txt` 里有原始相对路径。

### 3.2 DBC（22 份，全部加密）

| 路径 | 大小 | 说明 |
|---|---|---|
| `can_data\C_CANFD.dbc` | 503,116 | 正式目录版 |
| `can_data\COM_CAN.dbc` | 332,620 | |
| `conf_all\*.dbc`（11 份） | — | testDBC 那套（同样加密） |
| `can_data\EPS_derived.dbc` | 661 | **0x18D 8 字节变体，禁止用于实车** |

加密结构：`8B 头 + 256B RSA 包裹块 + 4B 密文长度 + AES-256-CBC 主体`，私钥在 TEE。

### 3.3 布局与解码表

| 文件 | 内容 |
|---|---|
| `can_data\DWARF布局表_Can1.md` | **Can1 系 15 个结构体逐字段位表** + OutArgs 附录（26.9 KB） |
| `G:\Codex\ota_probe\dwarf_structs.json` | 61 个 DWARF 结构体原始导出（含位域属性） |
| `can_data\layouts.json` | 0x18D(8B)/0x24F 布局 |
| `can_data\layout_0x083.json` | 0x083 字段（来自 Challenge 反汇编，未独立复核） |
| `can_data\checksums.json` | 校验算法 + 有/无校验 ID 名单 |
| `can_data\buses.csv` / `ids.csv` / `pins.csv` | 总线 / ID / 针脚表 |

### 3.4 文档（`can_data\` 内）

| 文件 | 内容 |
|---|---|
| `OPENPILOT可用信息总表.md` | ★ 主文档：能用/不能用/待验证（含第十章软路径验证） |
| `CONF全量分析_2026-10-30.md` | 107 个配置的全量分析 |
| `CARPROP探针_构建说明.md` | CarProperty 探针原理与构建 |
| `IDS运行时只读取证_2026-10-30.md` | IDS 运行时取证 |
| `README.md` | can_data 目录说明 |

---

## 4. 抓包工具（`$P\can_tools\`）

| 文件 | 用途 |
|---|---|
| `analyze_can.js` | 通用抓包分析（counter/CRC 识别、周期、DLC 分布），`--self-test` 通过 |
| `check_capture.js` | 判别脚本：0x083/0x18D 是否存在、长度、SteerTarget 变化、找同步帧 |
| `decode_dbc.py` | cantools 后端解码（`--strict` exit 3） |
| `README_抓包格式.md` | CSV 字段规范 |
| `sample*.csv` / `signals*.json` | 自测样本 |

---

## 5. 探针工程

### 5.1 `G:\Codex\carprop-probe\`（CarProperty）

| 文件 | 说明 |
|---|---|
| `src\com\probe\carprop\MainActivity.java` | 反射调用 `android.car.Car`，60s×1Hz 读 5 个属性 |
| `AndroidManifest.xml` / `AndroidManifest2.xml` / `AndroidManifest4.xml` | 三代 manifest（4 = 带 sharedUserId + 类型化 getter） |
| `build_probe.ps1` | 构建脚本 |
| `probe.keystore` | **共享签名密钥**（storepass/keypass `123456`，别名 `probe`） |
| `app-signed.apk` / `app4-signed.apk` | 已签名产物（12,685 B） |

### 5.2 `G:\Codex\lpcom-probe2\`（DDS/lpcom）

| 文件 | 说明 |
|---|---|
| `src\com\leapmotor\lpcom\*.java`（2 个） | IpcMessage / ReturnCode（从 CarControl.apk 反编译） |
| `src\com\leapmotor\lpcom\ps\*.java`（6 个） | PSChannelMgr / SubscriberChannel / PublisherChannel / PSChannelAttribute / 两个回调接口 |
| `src\com\probe\lpcom2\MainActivity.java` | 探针主逻辑（当前版本：单 topic `/leap/mainlycontrol/command`，transType=0） |
| `build.ps1` | **含产物自检门禁**（见 README §6） |
| `lib\armeabi-v7a\libprobeabi.so` | 32 位占位库（复制自 liblpComCS.so），仅用于强制 32 位安装 |
| `app-signed.apk` | 当前产物（74,201 B，dex `02c1363692eba5ab`） |

---

## 6. 复核产物（`$P\review_2026-10-31\`）

### 6.1 文档

| 文件 | 内容 |
|---|---|
| `lpCom_JNI_API_交接.md` | **lpcom Java API 全量交接**（14 个 JNI 符号、profile 格式、调用顺序、红线） |
| `DWARF布局路线_2026-10-31.md` | DWARF 路线裁决记录（含 Codex 误判存档） |

### 6.2 提取物

| 路径 | 内容 |
|---|---|
| `extracted\libs\liblpComPSJNI.so` | 265,608 B，ELF32 ARM |
| `extracted\libs\liblpComPS.so` / `liblpComCS.so` / `libsomeip.leapmotor.so` | 依赖库 |
| `extracted\libs\CarControl.apk` | 47,139,375 B（ext4 depth bug 修复后完整提取） |
| `extracted\libs\apk_scan\classes6.dex` | lpcom Java 类所在 dex |
| `extracted\system\system_etc_gateway_netcfg_*.xml` | 两个网关守护进程配置 |
| `extracted\system\system_etc_public.libraries.txt` | **DDS 库白名单**（含 liblpComPSJNI.so） |
| `jadx_lpcom_src\` | **13 个 lpcom 相关 Java 源文件**（含官方 profile 原件与用法示例） |

### 6.3 脚本（27 个，按用途）

| 类别 | 脚本 |
|---|---|
| 通道/ID 分析 | `review_21_channels.js`、`review_21_deep.js` |
| signalId 分析 | `review_23_signals.js`、`review_23_refine.js`、`review_23_details.js` |
| DWARF | `dwarf_recon.js`、`dwarf_eps18d_check.js`、`verify_18d_entry.js`、`verify_18d_pairs.js`、`scale_pool_scan.js` |
| JNI/ELF | `elf_dynsym.js`、`jni_strings.js`、`jni_strings2.js`、`setenv_const.js` |
| 探针 QA | `probe_qa.js`、`probe2_qa.js`、`probe2_classes.js`、`manifest_scan.js`、`dex_scan.js` |
| 其它 | `eventid_vs_signalid.js`、`decode_probe_dump.js`（载荷解码器） |

---

## 7. 一次性分析脚本（`G:\Codex\ota_probe\`，100+ 个）

按名检索，常用的：

| 脚本 | 用途 |
|---|---|
| `decrypt_stream.js` / `decrypt_ota.js` | GCM 分块解密 |
| `swupdate_list.js` / `swupdate_extract.js` | SWUpdate cpio 解析 |
| `lp_parse.js` / `ext4.js` / `ext4_extract.js` / `ext4_index.js` | liblp + 只读 ext4（**ext4.js 已修 depth=1 bug**） |
| `inventory_dhzip.js` / `extract_dhzip.js` | FSC DHZIP 容器 |
| `parse_fsc_can.js` | 批量反汇编解析（**结果需人工复核**） |
| `dwarf_export.js` / `dwarf_table.js` | DWARF → JSON / Markdown |
| `qnx_ota.py` / `doip_read.py` | 3850 客户端 / DoIP 客户端（**仅从车机内部可用**，见 `04_failures_gotchas.md`） |
| `fetch_canids.ps1` / `crawl_conf.ps1` / `crawl2.ps1` | 配置批量抓取（UI 自动化） |

---

## 8. 手册与 OCR

| 路径 | 内容 |
|---|---|
| `G:\deepseek\零跑专修离线库\lafa\2026-Lafa5\515\515Pro\铁锂-中航\pages\` | 离线维修手册（电路图/技术文件） |
| `$P\wis_ocr\` / `$P\eps_ocr\` | 手册扫描图 OCR 结果 |

---

## 9. 完整交付包

`$P\零跑B05_CAN分析交付包_2026-10-31.zip` —— 14.58 MB / 723 项（can_data + can_tools + 主交接文档）。

---

## 10. 补充资产（2026-11-01 晚更新）

### 10.1 布局与导出器（DWARF 线）

| 路径 | 内容 |
|---|---|
| `G:\Codex\ota_probe\dwarf_export2.js` | **导出器 v2（权威）**：按 DIE 缩进尊重嵌套边界 + `plainLocMax >= size` 溢出断言 |
| `G:\Codex\ota_probe\dwarf_structs_v2.json` | **v2 导出结果**（61 结构体 + 逐结构体审计 `report`） |
| `G:\Codex\ota_probe\dwarf_report.json` | 污染审计摘要（kept/dropped/plainMax/contaminated） |
| `G:\Codex\ota_probe\dwarf_structs.json` | ⚠️ v1 产物（0B7 被嵌套污染，**仅供追溯，勿用于解码**） |
| `G:\Codex\ota_probe\dwarf_export.js` / `dwarf_table.js` / `gen_table2.js` | v1 导出 / 表格生成 / v1.1 重生成 |
| `can_data\DWARF布局表_Can1.md` | **v1.1 权威布局表**（0B7 已按 19 位域重写，旧 219 行作废） |

### 10.2 DDS 探针实车证据

| 路径 | 内容 |
|---|---|
| `handoff_2026-11-01\evidence_avc_2026-11-01.log` | **2.8 MB 全量 logcat 存档**，含 3 条探针相关 `avc: denied ioctl 0x8927` |
| `can_data\log_bundle2.tar` | 第二次 `-102` 打包（296,960 B，含 4 份 CanSubscibe + 日志） |

关键 avc 原始行（两条独立事件）：

```
11-01 10:47:38.859 14020: avc: denied { ioctl } ioctlcmd=0x8927 tclass=udp_socket scontext=u:r:untrusted_app:s0:c117
11-01 10:53:52.907 17426: avc: denied { ioctl } ioctlcmd=0x8927 tclass=udp_socket scontext=u:r:untrusted_app:s0:c117
```

### 10.3 探针产物变更

| 项 | 状态 |
|---|---|
| `G:\Codex\lpcom-probe2\app-signed.apk` | 最后一版（transType=0 单通道 `/leap/mainlycontrol/command`，dex `02c1363692eba5ab`） |
| 车机上的 `com.probe.lpcom2` | **已卸载**；`/sdcard/*.apk` 已清空 |
| `G:\Codex\carprop-probe\probe.keystore` | 仍在，可复用（`123456`/`probe`） |

---

## 11. 采集与解码工具（2026-11-02 新增）

| 路径 | 用途 |
|---|---|
| `G:\Codex\ota_probe\can_live.js` | 无头实时采集（CRP1 over WebSocket），落盘 ndjson + 周期统计 + ID watch |
| `G:\Codex\ota_probe\decode_capture.js` | ndjson → 信号 CSV（openpilot 字段） |
| `G:\Codex\ota_probe\brake_calib.js` | 刹车标定（事件切分 / maxRod / 压力 / 减速度 / 满量程判定） |
| `G:\Codex\ota_probe\blinker_find.js` | 转向灯自动发现（全 ID 全位扫描） |
| `G:\Codex\ota_probe\lcc_check.js` | LCC 激活段 + 指令 vs 反馈误差 + 0x331 开关位 |
| `G:\Codex\ota_probe\scale_extract.js` / `scale_pair.js` | 从 15 个 parse 函数提取 literal pool 常量并配对字段 |
| `G:\Codex\ota_probe\crc_bruteforce.js` / `crc2..6.js` / `crc_pure.js` | CRC 爆破（370 万组合，全部失败，保留备查） |
| `G:\Codex\ota_extract_2026-10-28\cap_c3286193.ndjson` | 166 s / 198,619 帧 行驶数据（79 MB） |
| `G:\Codex\ota_extract_2026-10-28\cap_be9b567b.ndjson` | 89.6 s / 105,464 帧（42 MB） |
| `G:\Codex\ota_extract_2026-10-28\can_signals.csv` | 解码后的信号 CSV（53,212 行） |

### 采集器（第三方，非本项目代码）

| 路径 | 说明 |
|---|---|
| `G:\deepseek\can to debian\can-remote-system\` | 采集系统源码（服务端 + .NET WPF 客户端 + 手机端） |
| `...\can-remote-analyzer\publish\win-x64\CanRemoteAnalyzer.exe` | GUI 实时监控（.NET 8 WPF） |
| `...\can-remote-analyzer\Protocol\Crp.cs` | **CRP1 协议权威定义** |
| `...\can-remote-analyzer\Services\RelaySession.cs` | 握手/订阅逻辑（Hello 未使用，直接 Subscribe） |

---

## 12. 场景包与 CarState 管线（2026-11-03 新增）

### 12.1 原始数据（PCAN-View .trc，未复制进交接目录）

| 目录 | 内容 | 帧数 |
|---|---|---|
| `$P\can抓包\*.trc` | 第一批 6 个：`低速行驶` `先下单拨.再下双拨` `去` `回` `左转向10秒右转向10秒双闪10秒` `运动跨0` | 523,903 |
| `$P\can抓包\2\*.trc` | 第二批 11 个：`单拨` `单拨2` `双拨` `shuangbo2` `双拨3` `设定速度1/2` `接管1/2` `急刹1/2` | 512,903 |
| 同名 `.ndjson` | 由 `trc2ndjson.js` 转换，字段与 `fullcap\*.ndjson` 完全一致 | — |

### 12.2 文档

| 路径 | 内容 |
|---|---|
| `handoff_2026-11-01\09_结论台账与待验证清单.md` | **结论台账（A/B/C/D 分组）+ 未验证项 + 坑清单 + 复核顺序** |
| `can_data\第二批场景分析_2026-11-03.md` | 11 拍逐项分析：拨杆分级启动 / FuncMode 四态 / 接管阈值 / 设定速度 / 急刹 |
| `can_data\CarState离线空跑_2026-11-03.md` | CarState JSON 影子管线、字段映射、缺陷与修复 |
| `can_data\0x142状态机_2026-11-03.md` | 0x142 命令回显身份、四值上下文、接入边界 |
| `can_data\0x182发送门控_2026-11-03.md` | 0x182 的 20 ms 内部时基、约 1.3–1.4 s 突发窗与变化率反证 |
| `can_data\CAN控制信息清单_2026-11-04.md` | 44 个 ID 的角色/发送方/解码/可写性；读侧字段级清单 + 写侧判定 |
| `can_data\can_control_inventory.json` | 上表的机读版（逐 ID 结构化） |
| `can_data\captures_manifest_2026-11-04.json` | 31 个抓包（1.17 GB）的 SHA-256 与字节数 |
| `can_data\OPENPILOT可用信息总表.md` §0 | openpilot 视角的读/控/缺总表（2026-11-04 现状） |
| `can_data\信号解码表_2026-11-02.md` | 主解码表（§5 时间基、§7 第二批场景结论） |
| `can_data\can dbc已解密\*.dbc` | **11 份明文 DBC（2026-11-05）**：C_CANFD 70 报文 / 1,790 信号，含 0x2D1/0x2D5 布局与接收方列表 |
| `can_data\dbc_c_canfd.json` | C_CANFD.dbc 的机读解析（报文→信号→因子/偏移/接收方） |
| `can_data\DBC权威信号表_2026-11-05.md` | 关键报文的 DBC 权威信号表 + 与旧公式的符号差异 |
| `can_data\DBC_vs_实测_全量对比_2026-11-05.md` | 70 报文 vs 44 ID 的全量对比（DLC/周期/信号符号/未用信号） |
| `products_v2_2026-11-05\` | 31 个会话的 v2 产物：`.signals.csv` + `.carstate.jsonl` + `.summary.json`（DBC 符号 + `longAccMps2`） |
| `reanalysis\fsc\0x083_完整解码表_2026-11-02.md` | 0x083 全字段表（b15 已更正为状态字节） |

### 12.3 工具与产物（`G:\Codex\ota_probe\`）

| 脚本 | 用途 |
|---|---|
| `trc2ndjson.js` | .trc → 项目 ndjson |
| `dq_gate.js` | 闸门：时间基（按 Δ 分布）/ 重复戳 / 逐 ID 在线率 / 时间戳逆序 |
| `decode_capture2.js` | ndjson → 50 Hz 信号 CSV（每列带 age） |
| `carstate_offline.js` + `carstate_offline_test.js` | 信号 CSV → CarState JSONL（影子）；11 项夹具 |
| `verify_carstate.js` `verify_eps_bug.js` `verify_signed_vego.js` `verify_signflip.js` `verify_standstill.js` | 结构与数值回归 |
| `exit_cause.js` `takeover.js` `lcc_edges_full.js` `stalk_model.js` `set_step.js` `set_speed_timeline.js` | 行为取证 |
| `b10_audit.js` `b22_probe.js` `b15_probe.js` `m142_lag.js` `m142_state4.js` `blinker_b2.js` `blinker_detail.js` | 字段级审计 |
| `parity_check.js` `parity_tail.js` | candump 导出 vs ndjson 全量对质 |
| `crc8_*.js` `affine_solve.js` `crc_pure.js` `make_synthetic.js` | CRC 线性性排除（含合成正控） |
| `m182_trigger.js` | 0x182 发送机会、counter/20 ms、速度变化 AUC、簇首周期与状态分层 |
| `n7_tar.js` | 工程面板整棵树取回：QNX `tar` → `-101` 复制 → `-102 ecu=0` nc 流式（3 请求/树） |
| `n7_pull2.js` | 逐文件版取回（`-101` + nc），带续跑状态，用于补单文件 |
| `n124_mine.js` | N1/N2/N4 回溯挖掘：打灯×ACC、LAT 退出扭矩分布、fm=5 无输入事件 |
| `n1_pause.js` | 打灯「暂停→自动恢复」模型验证（恢复率、暂停时长、ACC 是否保持） |
| `id_inventory.js` / `build_control_inventory.js` | 全 ID 普查（帧数/周期/payload 多样性）→ 控制信息清单 + 机读 JSON + 抓包哈希清单 |
| `acc_cross.js` | 0x0B7 ACC 状态 × 0x083 ACC FuncMode 交叉对照（96,510 帧，冲突 ~130） |
| `u67_check.js` | 0x143 b6.7 驱动量、0x0CD 短/长周期 payload 对比 |
| `acc_cmd_effect.js` | 历史探针：旧符号下 0x083 b4 与加速度负相关（−0.84），用于发现符号反转 |
| `acc_sign_check.js` | DBC 符号版的同一相关性（+0.88），与上者成对 |
| `n12_longacc_check.js` | `IBC_LongitAcceAct` vs 500 ms 轮速差分（r/RMSE） |
| `regen_products.js` | 31 个会话批量重生成 v2 产物（CSV/JSONL/summary） |
| `affine_by_counter.js` | 按 0x083 counter 分组做 GF(2) 仿射检验（16 组零矛盾） |
| `verify_e2e.js` | 用 CRC8_H2F + seed 表复验抓包（18 报文约 130 万帧，0 失配） |
| `can_data\e2e_seed_tables.json` | 56 张 seed 表 + 算法说明（二进制提取） |
| `can_data\e2e_seed_tables_observed.json` | 37 张观测反推表（含 0x084）+ 与二进制表的交叉核对 |
| `e2e_check.js` | 任意 ndjson/ID：查已知表命中率，或自动反推 16 项 seed 表 |
| `11_控制接入方案_2026-11-05.md` | EPS/EL215 两种 MITM 拓扑、灯光 0x23C/0x1F3、硬件与验证顺序 |
| `crc8_counter_salt.js` | 普通 CRC-8 全参数 + 每 counter XOR 常量搜索（未命中） |
| `tier1_check.js` / `tier1b.js` / `tier1c.js` | U1/U6/U7/U10 离线核验：fm 分类、0x143 位义、0x0CD 双周期、0x0B7 ACC 状态 |
| `gear_check.js` | 档位 `0x0B6 b12[6:5]` × 轮向对齐核验（96,142 帧零矛盾） |

### 12.4 生成产物（`$P\fullcap\`、`$P\can抓包\2\`）

| 文件 | 内容 |
|---|---|
| `69229f22_signals.csv` | 50 Hz 信号栅格（11,708 行） |
| `69229f22_carstate_offline.carstate.jsonl` / `.summary.json` | CarState 影子 + 统计 |
| `c3286193_carstate_offline.*` `03d93adb_carstate_offline.*` | 倒车与 P/R/N/D 覆盖 |
| `can抓包\2\*_cs.carstate.jsonl` | 第二批会话的 CarState 回归产物 |
