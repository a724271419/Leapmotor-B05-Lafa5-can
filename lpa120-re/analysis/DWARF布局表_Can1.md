# CAN 布局表（DWARF 权威导出）v1.2

- 来源：`libadas_can_debug.so` `.debug_info`（DWARF4，旧式 `DW_AT_bit_offset` **MSB** 语义）
- 位算法：`bit_pos = member_loc*8 + (container_bits - bit_offset - bit_size)`
- 生成器：v1.1 用 `G:\Codex\ota_probe\dwarf_export2.js`（缩进定父子 + 溢出断言）；v1.2 起用 `dwarf_types.js`（`DW_AT_sibling` 定父子 + `DW_AT_type` 解析），两者对 Can1 的 252 个位域输出一致
- 回归：`Proto_Can1_EPS_18D_t` = 23 字段（与 v1 一致）；`HPCVCU_0B7` = 19 字段（v1 的 219 字段为嵌套污染，已修）

## v1.1 修订说明

v1 的 0B7 节混入 200 个无位属性成员（雷达目标列表等嵌套结构体被展平），普通成员偏移最大 9312，远超 32B 帧长。
v2 按 DIE 缩进判定归属，嵌套成员不再并入父结构体；并新增 `plainLocMax >= size` 断言，此类污染可自动检出。
**v1 的 0B7 节（219 行）已作废，以本版 19 行为准。**

## v1.2 修订（2026-11-03 夜）：类型解析版，布局零变化

生成器换成 `G:\Codex\ota_probe\dwarf_types.js`（输出 `dwarf_structs_typed.json`），三处方法变化：

1. **父子关系改用 `DW_AT_sibling` 跨度**，不再依赖 llvm-dwarfdump 的空格缩进——缩进是文本排版，不是 DWARF 语义；
2. **逐成员解析 `DW_AT_type`**：typedef/const 链、数组（元素类型 × subrange 计数）、指针（ARM32 = 4 B）、嵌套结构体，普通成员因此有了精确宽度；
3. **支持负 `DW_AT_bit_offset`**：GCC 对跨存储单元的紧凑位域会给出负值（`MRS_TargetAcceleration2_X` = `-3`），按无符号解析会让该字段错位并压到前一字段上。

复核结果（对照 v1.1）：

| 项 | 结果 |
|---|---|
| Can1 15 个结构体的位布局 | **逐字段完全一致**（252 个成员，0 处移动）→ 下游解码表不需要改 |
| Can1 覆盖 | 15/15 零内部空洞、零重叠，末位恰好等于 `byte_size*8` |
| 普通成员宽度 | v2 里 165/166 个为 0（无法判覆盖）；现在全部有精确宽度 |
| Can3 `Target_4X0` | 修正 4 处负 `bit_offset` 字段，512 位无缝铺满（v2 把其中 4 个误当 64 位普通成员） |
| 其余 5 个非协议结构体 | 剩 24–32 位内部空洞，均为匿名填充（DWARF 不描述），不是漏成员 |

结论：**协议布局没有变；变的是“以前靠 8 字节容器默认值蒙对、且无法自证覆盖”**。现在每个字段都带
`containerBits` 与 `typeName`，覆盖可由脚本重算。

---

## Can1 系（本车 CCAN，权威）

### Proto_Can1_ACU_2A3_t — 16 字节，12 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | ACU_CRC_2A3 | bit |
| 8 | byte1.0 | 4 | ACU_RollingCounter_2A3 | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 8 | ACU_CrashOutputSts | bit |
| 24 | byte3.0 | 6 | rsv1 | bit |
| 30 | byte3.6 | 2 | ACU_FLSeatBeltRSt | bit |
| 32 | byte4.0 | 2 | ACU_FRSeatBeltRSt | bit |
| 34 | byte4.2 | 2 | ACU_RLSeatBeltRSt | bit |
| 36 | byte4.4 | 2 | ACU_RMSeatBeltRSt | bit |
| 38 | byte4.6 | 2 | ACU_RRSeatBeltRSt | bit |
| 40 | byte5.0 | 24 | rsv2 | bit |
| 64 | byte8.0 | 64 | rsv3 | bit |

### Proto_Can1_ACU_233_t — 8 字节，11 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | ACU_CRC_233 | bit |
| 8 | byte1.0 | 4 | ACU_RollingCounter_233 | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 10 | ACU_LateralAcce | bit |
| 26 | byte3.2 | 10 | ACU_LongitAcce | bit |
| 36 | byte4.4 | 1 | ACU_LateralAcceValid | bit |
| 37 | byte4.5 | 1 | ACU_LongitAcceValid | bit |
| 38 | byte4.6 | 2 | rsv1 | bit |
| 40 | byte5.0 | 14 | ACU_YawRate | bit |
| 54 | byte6.6 | 1 | ACU_YawRateValid | bit |
| 55 | byte6.7 | 9 | rsv2 | bit |

### Proto_Can1_HPCBCM_290_t — 8 字节，36 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | BCM_CRC_290 | bit |
| 8 | byte1.0 | 4 | BCM_RollingCounter_290 | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 1 | BCM_KeyPosition_ON1A | bit |
| 17 | byte2.1 | 1 | BCM_KeyPosition_ON1B | bit |
| 18 | byte2.2 | 1 | BCM_KeyPosition_ON2A | bit |
| 19 | byte2.3 | 1 | BCM_KeyPosition_ON2B | bit |
| 20 | byte2.4 | 1 | BCM_KeyPosition_ON3 | bit |
| 21 | byte2.5 | 1 | BCM_TurnLeftSwtSts | bit |
| 22 | byte2.6 | 1 | BCM_TurnRightSwtSts | bit |
| 23 | byte2.7 | 1 | BCM_HazardSwtSts | bit |
| 24 | byte3.0 | 1 | BCM_TurnLeftCtrl | bit |
| 25 | byte3.1 | 1 | BCM_TurnRightCtrl | bit |
| 26 | byte3.2 | 1 | BCM_LowBeamCtrl | bit |
| 27 | byte3.3 | 1 | BCM_HighBeamCtrl | bit |
| 28 | byte3.4 | 2 | rsv1 | bit |
| 30 | byte3.6 | 2 | BCM_FLOC_PPD_Status | bit |
| 32 | byte4.0 | 2 | BCM_FROC_PPD_Status | bit |
| 34 | byte4.2 | 2 | BCM_RLOC_PPD_Status | bit |
| 36 | byte4.4 | 2 | BCM_RMOC_PPD_Status | bit |
| 38 | byte4.6 | 2 | BCM_RROC_PPD_Status | bit |
| 40 | byte5.0 | 4 | rsv2 | bit |
| 44 | byte5.4 | 1 | BCM_DriverDoorSts | bit |
| 45 | byte5.5 | 1 | BCM_DriverDoorSts_VD | bit |
| 46 | byte5.6 | 1 | BCM_LFDoorSts | bit |
| 47 | byte5.7 | 1 | BCM_FRDoorSts | bit |
| 48 | byte6.0 | 1 | BCM_RearLeftDoorSts | bit |
| 49 | byte6.1 | 1 | BCM_RearRightDoorSts | bit |
| 50 | byte6.2 | 1 | BCM_BackDoorSts | bit |
| 51 | byte6.3 | 1 | BCM_FrontCoverSts | bit |
| 52 | byte6.4 | 1 | BCM_HazardSwtOpenSts | bit |
| 53 | byte6.5 | 2 | BCM_BrakeFluidLevel | bit |
| 55 | byte6.7 | 2 | BCM_FrontWiperSts | bit |
| 57 | byte7.1 | 2 | rsv3 | bit |
| 59 | byte7.3 | 1 | BCM_RearFogCtrl | bit |
| 60 | byte7.4 | 4 | rsv4 | bit |

### Proto_Can1_EPS_18D_t — 32 字节，23 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | EPS_CRC_18D | bit |
| 8 | byte1.0 | 4 | EPS_RollingCounter_18D | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 1 | EPS_Fault | bit |
| 17 | byte2.1 | 1 | EPS_CalibrationSts | bit |
| 18 | byte2.2 | 1 | EPS_FailureSts | bit |
| 19 | byte2.3 | 1 | EPS_SteeringAngleValidData | bit |
| 20 | byte2.4 | 1 | EPS_SteeringAngleSpeedValidData | bit |
| 21 | byte2.5 | 1 | EPS_SteeringTorqueValidData | bit |
| 22 | byte2.6 | 2 | rsv1 | bit |
| 24 | byte3.0 | 16 | EPS_SteerWheelAngle | bit |
| 40 | byte5.0 | 8 | EPS_SteerWheelRotSpd | bit |
| 48 | byte6.0 | 12 | EPS_SteeringTorque | bit |
| 60 | byte7.4 | 4 | rsv2 | bit |
| 64 | byte8.0 | 2 | EPS_SteeringModeSts | bit |
| 66 | byte8.2 | 1 | EPS_LateralAvailable | bit |
| 67 | byte8.3 | 1 | EPS_LateralActive | bit |
| 68 | byte8.4 | 52 | rsv3 | bit |
| 120 | byte15.0 | 3 | EPS_LateralNotAvailableReason | bit |
| 123 | byte15.3 | 5 | rsv4 | bit |
| 128 | byte16.0 | 11 | EPS_MotorTorque | bit |
| 139 | byte17.3 | 53 | rsv5 | bit |
| 192 | byte24.0 | 64 | rsv6 | bit |

### Proto_Can1_HPCGW_3B0_t — 16 字节，9 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | GW_CRC_3B0 | bit |
| 8 | byte1.0 | 4 | GW_RollingCounter_3B0 | bit |
| 12 | byte1.4 | 6 | rsv0 | bit |
| 18 | byte2.2 | 2 | GW_TMS_FrontDefrostSts | bit |
| 20 | byte2.4 | 11 | rsv1 | bit |
| 31 | byte3.7 | 1 | GW_TMC_OutsideTempVD | bit |
| 32 | byte4.0 | 8 | GW_TMC_OutsideTemp_Corrected | bit |
| 40 | byte5.0 | 24 | rsv2 | bit |
| 64 | byte8.0 | 64 | rsv3 | bit |

### Proto_Can1_IBC_182_t — 8 字节，14 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | IBC_CRC_182 | bit |
| 8 | byte1.0 | 4 | IBC_RollingCounter_182 | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 16 | IBC_VehicleSpeed | bit |
| 32 | byte4.0 | 1 | IBC_VehicleSpeedVD | bit |
| 33 | byte4.1 | 1 | IBC_ABSActive | bit |
| 34 | byte4.2 | 1 | IBC_ABSFailed | bit |
| 35 | byte4.3 | 1 | IBC_TCSActive | bit |
| 36 | byte4.4 | 1 | IBC_TCSFailed | bit |
| 37 | byte4.5 | 1 | IBC_ESCFunctionStatus | bit |
| 38 | byte4.6 | 1 | rsv1 | bit |
| 39 | byte4.7 | 1 | IBC_Vehiclestandstill | bit |
| 40 | byte5.0 | 1 | IBC_EBDFailed | bit |
| 41 | byte5.1 | 23 | rsv2 | bit |

### Proto_Can1_IBC_183_t — 16 字节，10 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | IBC_CRC_183 | bit |
| 8 | byte1.0 | 4 | IBC_RollingCounter_183 | bit |
| 12 | byte1.4 | 22 | rsv0 | bit |
| 34 | byte4.2 | 2 | IBC_sOutputRodDriverPer_Q | bit |
| 36 | byte4.4 | 2 | IBC_BrakePedalApplied_Q | bit |
| 38 | byte4.6 | 17 | rsv1 | bit |
| 55 | byte6.7 | 1 | IBC_BrakePedalApplied | bit |
| 56 | byte7.0 | 7 | IBC_sOutputRodDriverPer | bit |
| 63 | byte7.7 | 1 | rsv2 | bit |
| 64 | byte8.0 | 64 | rsv3 | bit |

### Proto_Can1_IBC_184_t — 32 字节，21 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | IBC_CRC_184 | bit |
| 8 | byte1.0 | 4 | IBC_RollingCounter_184 | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 16 | IBC_FLWheelSpeedKPH | bit |
| 32 | byte4.0 | 16 | IBC_FRWheelSpeedKPH | bit |
| 48 | byte6.0 | 16 | IBC_RLWheelSpeedKPH | bit |
| 64 | byte8.0 | 16 | IBC_RRWheelSpeedKPH | bit |
| 80 | byte10.0 | 2 | IBC_FLWheelDirection | bit |
| 82 | byte10.2 | 2 | IBC_FRWheelDirection | bit |
| 84 | byte10.4 | 2 | IBC_RLWheelDirection | bit |
| 86 | byte10.6 | 2 | IBC_RRWheelDirection | bit |
| 88 | byte11.0 | 1 | IBC_FLWheelSpeedVD | bit |
| 89 | byte11.1 | 1 | IBC_FRWheelSpeedVD | bit |
| 90 | byte11.2 | 1 | IBC_RLWheelSpeedVD | bit |
| 91 | byte11.3 | 1 | IBC_RRWheelSpeedVD | bit |
| 92 | byte11.4 | 12 | IBC_FLWheelSpeedRC | bit |
| 104 | byte13.0 | 12 | IBC_FRWheelSpeedRC | bit |
| 116 | byte14.4 | 12 | IBC_RLWheelSpeedRC | bit |
| 128 | byte16.0 | 12 | IBC_RRWheelSpeedRC | bit |
| 140 | byte17.4 | 52 | rsv1 | bit |
| 192 | byte24.0 | 64 | rsv2 | bit |

### Proto_Can1_IBC_185_t — 16 字节，33 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | IBC_CRC_185 | bit |
| 8 | byte1.0 | 4 | IBC_RollingCounter_185 | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 11 | IBC_PlungerPressure | bit |
| 27 | byte3.3 | 1 | IBC_PlungerPressure_Q | bit |
| 28 | byte3.4 | 12 | rsv1 | bit |
| 40 | byte5.0 | 2 | IBC_ESP_FailureLamp | bit |
| 42 | byte5.2 | 1 | IBC_ABS_FailureLamp | bit |
| 43 | byte5.3 | 5 | rsv2 | bit |
| 48 | byte6.0 | 10 | IBC_LongitAcceAct | bit |
| 58 | byte7.2 | 1 | IBC_LongitAcceActValid | bit |
| 59 | byte7.3 | 4 | rsv3 | bit |
| 63 | byte7.7 | 1 | IBC_ABAAvaliable | bit |
| 64 | byte8.0 | 1 | IBC_ABA_active | bit |
| 65 | byte8.1 | 1 | IBC_AWBAvaliable | bit |
| 66 | byte8.2 | 1 | IBC_AWB_active | bit |
| 67 | byte8.3 | 1 | IBC_ABPAviliable | bit |
| 68 | byte8.4 | 1 | IBC_ABP_active | bit |
| 69 | byte8.5 | 8 | rsv4 | bit |
| 77 | byte9.5 | 1 | IBC_LdmBLC | bit |
| 78 | byte9.6 | 2 | rsv5 | bit |
| 80 | byte10.0 | 1 | IBC_AEB_active | bit |
| 81 | byte10.1 | 1 | IBC_AEBdecAvailable | bit |
| 82 | byte10.2 | 2 | IBC_AVHStatus | bit |
| 84 | byte10.4 | 1 | IBC_AVHAvailable | bit |
| 85 | byte10.5 | 4 | rsv6 | bit |
| 89 | byte11.1 | 1 | IBC_QDCAEB | bit |
| 90 | byte11.2 | 1 | IBC_CDD_Available_ACC | bit |
| 91 | byte11.3 | 1 | IBC_CDD_Active_ACC | bit |
| 92 | byte11.4 | 1 | IBC_QDCACC | bit |
| 93 | byte11.5 | 1 | rsv7 | bit |
| 94 | byte11.6 | 2 | IBC_HDCStatus | bit |
| 96 | byte12.0 | 32 | rsv8 | bit |

### Proto_Can1_IBC_227_t — 8 字节，7 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | IBC_CRC_227 | bit |
| 8 | byte1.0 | 4 | IBC_RollingCounter_227 | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 2 | IBC_EPB_FailStatus | bit |
| 18 | byte2.2 | 3 | IBC_EPB_Status | bit |
| 21 | byte2.5 | 1 | IBC_EPB_APAACCRequest_Available | bit |
| 22 | byte2.6 | 42 | rsv1 | bit |

### Proto_Can1_IBC_3CE_t — 8 字节，5 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | IBC_CRC_3CE | bit |
| 8 | byte1.0 | 4 | IBC_RollingCounter | bit |
| 12 | byte1.4 | 6 | rsv0 | bit |
| 18 | byte2.2 | 1 | iTPMS_SystemStatus | bit |
| 19 | byte2.3 | 45 | rsv1 | bit |

### Proto_Can1_ICU_24D_t — 32 字节，9 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | ICU_CRC_24D | bit |
| 8 | byte1.0 | 4 | ICU_RollingCounter_24D | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 20 | ICU_TotalOdometerkm | bit |
| 36 | byte4.4 | 3 | ICU_AccelerationMode | bit |
| 39 | byte4.7 | 25 | rsv1 | bit |
| 64 | byte8.0 | 64 | rsv2 | bit |
| 128 | byte16.0 | 64 | rsv3 | bit |
| 192 | byte24.0 | 64 | rsv4 | bit |

### Proto_Can1_IVI_331_t — 16 字节，27 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | IVI_CRC_331 | bit |
| 8 | byte1.0 | 4 | IVI_RollingCounter_331 | bit |
| 12 | byte1.4 | 15 | rsv0 | bit |
| 27 | byte3.3 | 1 | IVI_BSD_SW | bit |
| 28 | byte3.4 | 1 | IVI_DOW_SW | bit |
| 29 | byte3.5 | 1 | IVI_RCTA_SW | bit |
| 30 | byte3.6 | 1 | IVI_RCW_SW | bit |
| 31 | byte3.7 | 1 | IVI_RCTB_SW | bit |
| 32 | byte4.0 | 1 | IVI_AEB_SW | bit |
| 33 | byte4.1 | 1 | IVI_FCW_SW | bit |
| 34 | byte4.2 | 2 | IVI_FCW_levelSet | bit |
| 36 | byte4.4 | 1 | IVI_IHBC_SW | bit |
| 37 | byte4.5 | 1 | IVI_LCC_SW | bit |
| 38 | byte4.6 | 1 | IVI_LDW_SW | bit |
| 39 | byte4.7 | 1 | IVI_LKA_SW | bit |
| 40 | byte5.0 | 1 | IVI_ELK_SW | bit |
| 41 | byte5.1 | 1 | IVI_ISA_SW | bit |
| 42 | byte5.2 | 1 | IVI_ISA_controlSW | bit |
| 43 | byte5.3 | 1 | IVI_SLIF_SW | bit |
| 44 | byte5.4 | 1 | IVI_SLWF_SW | bit |
| 45 | byte5.5 | 1 | IVI_SLWF_Cloud_SW | bit |
| 46 | byte5.6 | 10 | rsv1 | bit |
| 56 | byte7.0 | 1 | IVI_LDW_Cloud_SW | bit |
| 57 | byte7.1 | 1 | IVI_SLIF_SPEEDCHANGEVOICE_SW | bit |
| 58 | byte7.2 | 1 | IVI_LDW_levelSet | bit |
| 59 | byte7.3 | 5 | rsv2 | bit |
| 64 | byte8.0 | 64 | rsv3 | bit |

### Proto_Can1_HPCVCU_0B6_t — 16 字节，16 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | VCU_CRC_B6 | bit |
| 8 | byte1.0 | 4 | VCU_RollingCounter_B6 | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 16 | VCU_RDrvRequestTorque | bit |
| 32 | byte4.0 | 16 | rsv1 | bit |
| 48 | byte6.0 | 16 | VCU_FDrvRequestTorque | bit |
| 64 | byte8.0 | 24 | rsv2 | bit |
| 88 | byte11.0 | 8 | VCU_ThrottlePosition | bit |
| 96 | byte12.0 | 1 | VCU_AccPedalValid | bit |
| 97 | byte12.1 | 1 | VCU_BrakeSysFault | bit |
| 98 | byte12.2 | 1 | rsv3 | bit |
| 99 | byte12.3 | 1 | VCU_BrakeSts | bit |
| 100 | byte12.4 | 1 | VCU_BrakeStsValid | bit |
| 101 | byte12.5 | 2 | VCU_GearLevelPosSts | bit |
| 103 | byte12.7 | 1 | VCU_GearLeverValid | bit |
| 104 | byte13.0 | 24 | rsv4 | bit |

### Proto_Can1_HPCVCU_0B7_t — 32 字节，19 字段

| 位偏移 | 字节.位 | 宽 | 字段 | 类型 |
|---|---|---|---|---|
| 0 | byte0.0 | 8 | VCU_CRC_B7 | bit |
| 8 | byte1.0 | 4 | VCU_RollingCounter_B7 | bit |
| 12 | byte1.4 | 4 | rsv0 | bit |
| 16 | byte2.0 | 2 | VCU_Vehicle_Warning | bit |
| 18 | byte2.2 | 1 | VCU_VehicleSts | bit |
| 19 | byte2.3 | 9 | rsv1 | bit |
| 28 | byte3.4 | 2 | VCU_ACCRequest | bit |
| 30 | byte3.6 | 1 | VCU_ACCStates | bit |
| 31 | byte3.7 | 12 | rsv2 | bit |
| 43 | byte5.3 | 1 | VCU_DecEnable | bit |
| 44 | byte5.4 | 2 | rsv3 | bit |
| 46 | byte5.6 | 1 | VCU_DriverAssistProhibitSts | bit |
| 47 | byte5.7 | 9 | rsv4 | bit |
| 56 | byte7.0 | 8 | VCU_TheoAccePedalPercent | bit |
| 64 | byte8.0 | 32 | rsv5 | bit |
| 96 | byte12.0 | 1 | VCU_TheoAccePedalValid | bit |
| 97 | byte12.1 | 31 | rsv6 | bit |
| 128 | byte16.0 | 64 | rsv7 | bit |
| 192 | byte24.0 | 64 | rsv8 | bit |

---

## Can3 系（⚠️ 雷达变体，本车未配雷达，仅供参考）

### Proto_Can3_BSD_4XB_t — 64 字节，27 字段

| 位偏移 | 字节.位 | 宽 | 字段 |
|---|---|---|---|
| 0 | byte0.0 | 8 | BSD_MRS_WorkSts |
| 8 | byte1.0 | 4 | BSD_MRS_TargetDectEnable |
| 12 | byte1.4 | 1 | MRS_BSD_Warning_Enable |
| 13 | byte1.5 | 3 | MRS_BSD_Warning |
| 16 | byte2.0 | 1 | MRS_LCA_Warning_Enable |
| 17 | byte2.1 | 3 | MRS_LCA_Warning |
| 20 | byte2.4 | 1 | MRS_RCW_Warning_Enable |
| 21 | byte2.5 | 3 | MRS_RCW_Warning |
| 24 | byte3.0 | 1 | MRS_DOW_Warning_Enable |
| 25 | byte3.1 | 3 | MRS_DOW_Warning |
| 28 | byte3.4 | 1 | MRS_RCTA_Warning_Enable |
| 29 | byte3.5 | 3 | MRS_RCTA_Warning |
| 32 | byte4.0 | 1 | MRS_FCTA_Warning_Enable |
| 33 | byte4.1 | 3 | MRS_FCTA_Warning |
| 36 | byte4.4 | 16 | MRS_FrameIdx |
| 52 | byte6.4 | 1 | MRS_ALC_Warning_Enable |
| 53 | byte6.5 | 3 | MRS_ALC_Warning |
| 56 | byte7.0 | 8 | rsv0 |
| 64 | byte8.0 | 64 | rsv1 |
| 128 | byte16.0 | 64 | rsv2 |
| 192 | byte24.0 | 64 | rsv3 |
| 256 | byte32.0 | 64 | rsv4 |
| 320 | byte40.0 | 64 | rsv5 |
| 384 | byte48.0 | 64 | rsv6 |
| 448 | byte56.0 | 52 | rsv7 |
| 500 | byte62.4 | 4 | MRS_RollingCounter_4XB |
| 504 | byte63.0 | 8 | MRS_CheckSum_4XB |

### Proto_Can3_Target_4X0_t — 64 字节，69 字段

| 位偏移 | 字节.位 | 宽 | 字段 |
|---|---|---|---|
| 0 | byte0.0 | 8 | MRS_TargetID1 |
| 8 | byte1.0 | 11 | MRS_TargetXaxis1 |
| 19 | byte2.3 | 3 | MRS_TargetMoveStatus1 |
| 22 | byte2.6 | 12 | MRS_TargetYaxis1 |
| 34 | byte4.2 | 10 | MRS_TargetReSpeed1_X |
| 44 | byte5.4 | 7 | MRS_TargetAcceleration1_X |
| 51 | byte6.3 | 7 | MRS_TargetAcceleration1_Y |
| 58 | byte7.2 | 6 | MRS_TargetWidth1 |
| 64 | byte8.0 | 10 | MRS_TargetReSpeed1_Y |
| 74 | byte9.2 | 6 | MRS_TargetPower1 |
| 80 | byte10.0 | 8 | MRS_TargetID2 |
| 88 | byte11.0 | 11 | MRS_TargetXaxis2 |
| 99 | byte12.3 | 3 | MRS_TargetMoveStatus2 |
| 102 | byte12.6 | 12 | MRS_TargetYaxis2 |
| 114 | byte14.2 | 10 | MRS_TargetReSpeed2_X |
| 64 | byte8.0 | 64 | MRS_TargetAcceleration2_X |
| 131 | byte16.3 | 7 | MRS_TargetAcceleration2_Y |
| 138 | byte17.2 | 6 | MRS_TargetWidth2 |
| 144 | byte18.0 | 10 | MRS_TargetReSpeed2_Y |
| 154 | byte19.2 | 6 | MRS_TargetPower2 |
| 160 | byte20.0 | 8 | MRS_TargetID3 |
| 168 | byte21.0 | 11 | MRS_TargetXaxis3 |
| 179 | byte22.3 | 3 | MRS_TargetMoveStatus3 |
| 128 | byte16.0 | 64 | MRS_TargetYaxis3 |
| 194 | byte24.2 | 10 | MRS_TargetReSpeed3_X |
| 204 | byte25.4 | 7 | MRS_TargetAcceleration3_X |
| 211 | byte26.3 | 7 | MRS_TargetAcceleration3_Y |
| 218 | byte27.2 | 6 | MRS_TargetWidth3 |
| 224 | byte28.0 | 10 | MRS_TargetReSpeed3_Y |
| 234 | byte29.2 | 6 | MRS_TargetPower3 |
| 240 | byte30.0 | 8 | MRS_TargetID4 |
| 192 | byte24.0 | 64 | MRS_TargetXaxis4 |
| 259 | byte32.3 | 3 | MRS_TargetMoveStatus4 |
| 262 | byte32.6 | 12 | MRS_TargetYaxis4 |
| 274 | byte34.2 | 10 | MRS_TargetReSpeed4_X |
| 284 | byte35.4 | 7 | MRS_TargetAcceleration4_X |
| 291 | byte36.3 | 7 | MRS_TargetAcceleration4_Y |
| 298 | byte37.2 | 6 | MRS_TargetWidth4 |
| 304 | byte38.0 | 10 | MRS_TargetReSpeed4_Y |
| 314 | byte39.2 | 6 | MRS_TargetPower4 |
| 320 | byte40.0 | 8 | MRS_TargetID5 |
| 328 | byte41.0 | 11 | MRS_TargetXaxis5 |
| 339 | byte42.3 | 3 | MRS_TargetMoveStatus5 |
| 342 | byte42.6 | 12 | MRS_TargetYaxis5 |
| 354 | byte44.2 | 10 | MRS_TargetReSpeed5_X |
| 364 | byte45.4 | 7 | MRS_TargetAcceleration5_X |
| 371 | byte46.3 | 7 | MRS_TargetAcceleration5_Y |
| 378 | byte47.2 | 6 | MRS_TargetWidth5 |
| 384 | byte48.0 | 10 | MRS_TargetReSpeed5_Y |
| 394 | byte49.2 | 6 | MRS_TargetPower5 |
| 400 | byte50.0 | 8 | MRS_TargetID6 |
| 408 | byte51.0 | 11 | MRS_TargetXaxis6 |
| 419 | byte52.3 | 3 | MRS_TargetMoveStatus6 |
| 422 | byte52.6 | 12 | MRS_TargetYaxis6 |
| 434 | byte54.2 | 10 | MRS_TargetReSpeed6_X |
| 384 | byte48.0 | 64 | MRS_TargetAcceleration6_X |
| 451 | byte56.3 | 7 | MRS_TargetAcceleration6_Y |
| 458 | byte57.2 | 6 | MRS_TargetWidth6 |
| 464 | byte58.0 | 10 | MRS_TargetReSpeed6_Y |
| 474 | byte59.2 | 6 | MRS_TargetPower6 |
| 480 | byte60.0 | 2 | MRS_TargetStatus1 |
| 482 | byte60.2 | 2 | MRS_TargetStatus2 |
| 484 | byte60.4 | 2 | MRS_TargetStatus3 |
| 486 | byte60.6 | 2 | MRS_TargetStatus4 |
| 488 | byte61.0 | 2 | MRS_TargetStatus5 |
| 490 | byte61.2 | 2 | MRS_TargetStatus6 |
| 492 | byte61.4 | 8 | MRS_Reserved |
| 500 | byte62.4 | 4 | MRS_RollingCounter_4X0 |
| 504 | byte63.0 | 8 | MRS_CheckSum_4X0 |

### Proto_Can3_FM_4EB_t — 64 字节，12 字段

| 位偏移 | 字节.位 | 宽 | 字段 |
|---|---|---|---|
| 0 | byte0.0 | 8 | FM_MRS_WorkSts |
| 8 | byte1.0 | 4 | FM_MRS_TargetDectEnable |
| 12 | byte1.4 | 52 | rsv0 |
| 64 | byte8.0 | 64 | rsv1 |
| 128 | byte16.0 | 64 | rsv2 |
| 192 | byte24.0 | 64 | rsv3 |
| 256 | byte32.0 | 64 | rsv4 |
| 320 | byte40.0 | 64 | rsv5 |
| 384 | byte48.0 | 64 | rsv6 |
| 448 | byte56.0 | 52 | rsv7 |
| 500 | byte62.4 | 4 | MRS_RollingCounter_4EB |
| 504 | byte63.0 | 8 | MRS_CheckSum_4EB |

---

## 平台级头部约定（第三次确认）

| 帧 | CRC | 滚动计数 | 状态位起 |
|---|---|---|---|
| 0x18D EPS | byte0 | byte1 低4位 | byte2 |
| 0x0B7 VCU | byte0 | byte1 低4位 | byte2 |
| 0x083 ADAS（先验，待 Challenge 确认） | byte0 | byte1 | byte2 |

## 0x0B7 真身（ACC/油门状态帧，19 字段）

| 字节.位 | 宽 | 字段 |
|---|---|---|
| byte0.0 | 8 | VCU_CRC_B7 |
| byte1.0 | 4 | VCU_RollingCounter_B7 |
| byte1.4 | 4 | rsv0 |
| byte2.0 | 2 | VCU_Vehicle_Warning |
| byte2.2 | 1 | VCU_VehicleSts |
| byte2.3 | 9 | rsv1 |
| byte3.4 | 2 | VCU_ACCRequest |
| byte3.6 | 1 | VCU_ACCStates |
| byte3.7 | 12 | rsv2 |
| byte5.3 | 1 | VCU_DecEnable |
| byte5.4 | 2 | rsv3 |
| byte5.6 | 1 | VCU_DriverAssistProhibitSts |
| byte5.7 | 9 | rsv4 |
| byte7.0 | 8 | VCU_TheoAccePedalPercent |
| byte8.0 | 32 | rsv5 |
| byte12.0 | 1 | VCU_TheoAccePedalValid |
| byte12.1 | 31 | rsv6 |
| byte16.0 | 64 | rsv7 |
| byte24.0 | 64 | rsv8 |

**价值**：`VCU_ACCRequest` / `VCU_ACCStates` / `VCU_DecEnable` / `VCU_TheoAccePedalPercent` —— 0x083 下游验证的对照帧。
