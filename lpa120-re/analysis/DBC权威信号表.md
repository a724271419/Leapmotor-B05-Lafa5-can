# DBC 权威信号表（C_CANFD，2026-11-05 解密）

> 来源：`can_data\can dbc已解密\C_CANFD.dbc`（70 报文 / 1,790 信号，明文）。
> **本表是解码的唯一权威**；与旧反汇编公式冲突时以本表为准。

## 与旧公式的三处符号差异（重要）

| 信号 | 旧（反汇编） | DBC（权威） | 影响 |
|---|---|---|---|
| EPS_SteerWheelAngle (0x18D b3) | `650 − raw×0.02` | `raw×0.02 − 650` | 转角**符号相反** |
| EPS_SteeringTorque (0x18D b6) | `8 − raw×0.008` | `raw×0.008 − 8` | 扭矩**符号相反** |
| ADDC_ACCTargetAcc (0x083 b4) | `5 − raw×0.05` | `raw×0.05 − 5` | 加速度**符号相反**（U13 的真因） |

## 0x18D EPS_18D  32B  sender=EPS

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| EPS_CRC_18D | 0 | 8 | 1 | 0 | - | HPCGW,VCU,ADDC,ICU,ACU,IBC,LMC,FSC,BSDRL,BSDRR |
| EPS_RollingCounter_18D | 8 | 4 | 1 | 0 | - | HPCGW,VCU,ADDC,ICU,ACU,IBC,LMC,FSC,BSDRL,BSDRR |
| EPS_Fault | 16 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,IVI,ICU,IBC,LMC,FSC |
| EPS_CalibrationSts | 17 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,IBC,FSC |
| EPS_FailureSts | 18 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,IBC,LMC,FSC |
| EPS_SteeringAngleValidData | 19 | 1 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,ACU,IBC,LMC,FSC,BSDRL,BSDRR |
| EPS_SteeringAngleSpeedValidData | 20 | 1 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,IBC,LMC,FSC |
| EPS_SteeringTorqueValidData | 21 | 1 | 1 | 0 | - | CLOUD,ADDC,IBC,LMC,FSC |
| EPS_APSAvailable | 22 | 1 | 1 | 0 | - | CLOUD,ADDC |
| EPS_APSActive | 23 | 1 | 1 | 0 | - | CLOUD,ADDC |
| EPS_SteerWheelAngle | 24 | 16 | 0.02 | -650 | �� | CLOUD,EDR,HPCGW,VCU,ADDC,ICU,ACU,IBC,LMC,FSC,BSDRL,BSDRR |
| EPS_SteerWheelRotSpd | 40 | 8 | 4 | 0 | ��/s | CLOUD,HPCGW,VCU,ADDC,ICU,IBC,LMC,FSC |
| EPS_SteeringTorque | 48 | 12 | 0.008 | -8 | N��m | CLOUD,ADDC,IBC,LMC,FSC |
| EPS_Fault_Light | 60 | 2 | 1 | 0 | - | CLOUD,ADDC,IVI,ICU |
| EPS_SelfCheckSt | 62 | 1 | 1 | 0 | - | CLOUD,VCU |
| EPS_SteeringModeSwFb | 63 | 1 | 1 | 0 | - | CLOUD,ADDC |
| EPS_SteeringModeStsFB | 64 | 2 | 1 | 0 | - | CLOUD,IVI,FSC |
| EPS_LateralAvailable | 66 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| EPS_LateralActive | 67 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| EPS_Current_follow | 68 | 1 | 1 | 0 | - | CLOUD |
| EPS_AssistanceSts | 69 | 2 | 1 | 0 | - | CLOUD,VCU |
| EPS_CalibrationSts_init | 71 | 1 | 1 | 0 | - | CLOUD |
| EPS_ColumnTorque | 72 | 16 | 0.01 | -200 | N��m | CLOUD,ADDC |
| EPS_CalibrationTimes | 88 | 8 | 1 | 0 | - | CLOUD |
| EPS_Current_of_Theory | 96 | 8 | 1 | 0 | A | CLOUD |
| EPS_Actual_Current | 104 | 8 | 1 | 0 | A | CLOUD |
| EPS_ADASFunVersion | 112 | 8 | 1 | 0 | - | CLOUD,ADDC |
| EPS_LateralNotAvailableReason | 120 | 3 | 1 | 0 | - | CLOUD,FSC |
| EPS_APSCtrlAbortFeedback | 124 | 4 | 1 | 0 | - | CLOUD,ADDC |
| EPS_MotorTorque | 128 | 11 | 0.01 | -5.2 | N��m | CLOUD,FSC |
| EPS_CalibAllow | 139 | 1 | 1 | 0 | - | CLOUD |
| EPS_EndStopStatus | 140 | 1 | 1 | 0 | - | CLOUD |
| EPS_PowerVoltage | 144 | 8 | 0.1 | 0 | V | CLOUD |
| EPS_AssistLevel | 152 | 8 | 0.5 | 0 | % | CLOUD |
| EPS_systemstatus | 160 | 4 | 1 | 0 | - | CLOUD |
| EPS_LeftSoftEndstopStatus | 164 | 2 | 1 | 0 | - | CLOUD |
| EPS_RightSoftEndstopStatus | 166 | 2 | 1 | 0 | - | CLOUD |
| EPS_LateralCtrlHandTorq | 168 | 12 | 0.008 | -8 | N��m | CLOUD,ADDC,FSC |
| EPS_PulseActiveSts | 180 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| EPS_BDC_Available | 181 | 1 | 1 | 0 | - | CLOUD,LMC |
| EPS_BDC_Active | 182 | 1 | 1 | 0 | - | CLOUD,LMC |
| EPS_CtrlActMode | 183 | 2 | 1 | 0 | - | ADDC |

## 0x083 ADDC_83  32B  sender=ADDC

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| ADDC_CRC_83 | 0 | 8 | 1 | 0 | - | VCU,IVI,ICU,ACU,EPS,IBC,LMC |
| ADDC_RollingCounter_83 | 8 | 4 | 1 | 0 | - | VCU,IVI,ICU,ACU,EPS,IBC,LMC |
| ADDC_ACC_FunType | 20 | 2 | 1 | 0 | - | VCU |
| ADDC_ACCMode | 25 | 3 | 1 | 0 | - | CLOUD,EDR,VCU,IVI,ICU,ACU,IBC,LMC |
| ADDC_Driveoff_Request | 28 | 1 | 1 | 0 | - | CLOUD,VCU,IBC,LMC |
| ADDC_DecToStop | 29 | 1 | 1 | 0 | - | CLOUD,VCU,IBC,LMC |
| ADDC_ACCAvailable | 30 | 1 | 1 | 0 | - | CLOUD,VCU,ICU,ACU,IBC,LMC |
| FSC_IACC_Speed_Change_Request | 31 | 1 | 1 | 0 | - | CLOUD,ICU |
| ADDC_ACCTargetAcc | 32 | 8 | 0.05 | -5 | - | CLOUD,VCU,IBC |
| ADDC_ACCTargetAccVD | 40 | 1 | 1 | 0 | - | CLOUD,VCU,IBC |
| ADDC_ACC_RecordingPulse | 42 | 2 | 1 | 0 | - | CLOUD,VCU |
| ADDC_VehicleSpeedCtlVD | 44 | 1 | 1 | 0 | - | CLOUD,VCU |
| ADDC_VehicleSpeedCtl | 45 | 11 | 0.1 | 0 | KPH | CLOUD,VCU |
| ADDC_ACC_EPBReq | 56 | 2 | 1 | 0 | - | CLOUD,VCU,IBC |
| ADDC_ACC_VehicleDirectCtl | 58 | 2 | 1 | 0 | - | CLOUD,VCU |
| ADDC_ACC_VehicleDirectCtlVD | 60 | 1 | 1 | 0 | - | CLOUD,VCU |
| ADDC_AEBTargetDec | 64 | 16 | 0.0005 | -16 | m/s2 | CLOUD,VCU,IBC,LMC |
| ADDC_AEBDecCtrl | 80 | 1 | 1 | 0 | - | CLOUD,VCU,IBC,LMC |
| ADDC_ABAlevel | 81 | 2 | 1 | 0 | - | CLOUD,IBC,LMC |
| ADDC_ABAavailable | 83 | 1 | 1 | 0 | - | CLOUD,IBC,LMC |
| ADDC_AWBlevel | 84 | 4 | 1 | 0 | - | CLOUD,IBC,LMC |
| ADDC_AWBavailable | 88 | 1 | 1 | 0 | - | CLOUD,IBC,LMC |
| ADDC_AEBLVehiclehold | 89 | 1 | 1 | 0 | - | CLOUD,IBC,LMC |
| ADDC_ESPPrefill | 90 | 1 | 1 | 0 | - | CLOUD,IBC,LMC |
| ADDC_AEBMode | 91 | 3 | 1 | 0 | - | CLOUD,EDR,VCU,HPCBCM,ICU,ACU,IBC,LMC |
| ADDC_AEBAvailable | 94 | 1 | 1 | 0 | - | CLOUD,VCU,ACU,IBC,LMC |
| FSC_AEB_EBAReq | 95 | 1 | 1 | 0 | - | CLOUD,IBC |
| ADDC_LKAmode | 96 | 3 | 1 | 0 | - | CLOUD,ICU,ACU,EPS |
| ADDC_LKA_SteerWheelAngReq | 99 | 1 | 1 | 0 | - | CLOUD,EPS |
| FSC_LKA_WarningType | 100 | 2 | 1 | 0 | - | CLOUD,ICU |
| FSC_LKAEscapeLevel | 102 | 2 | 1 | 0 | - | CLOUD,ICU |
| ADDC_LKA_SteeringWheelAngle | 104 | 16 | 0.02 | -650 | �� | CLOUD,EPS |
| ADDC_LKA_SteeringWheelRotSpd | 120 | 8 | 4 | 0 | ��/s | CLOUD,EPS |
| FSC_Lateral_ControlMode | 128 | 1 | 1 | 0 | - | CLOUD,EPS |
| ADDC_AngCtrl_TrqUpprLim | 129 | 7 | 0.05 | 0 | N��m | CLOUD,EPS |
| ADDC_AngCtrl_TrqLowrLim | 136 | 7 | 0.05 | -6 | N��m | CLOUD,EPS |
| FSC_LKA_RecordingPulse | 143 | 1 | 1 | 0 | - | CLOUD |
| ADDC_LKA_FuncType | 144 | 3 | 1 | 0 | - | CLOUD,EPS |
| ADDC_LKA_DILMode | 147 | 1 | 1 | 0 | - | EPS |
| ADDC_ESS_TqReq | 148 | 1 | 1 | 0 | - | EPS |
| ADDC_ESS_Tq | 149 | 11 | 0.008 | -8 | N��m  | EPS |
| FSC_LKA_FuncType | 160 | 1 | 1 | 0 | - | Vector__XXX |
| ADDC_LDWReq | 176 | 2 | 1 | 0 | - | CLOUD,EPS |
| ADDC_ACC_VLCCtlReq | 178 | 1 | 1 | 0 | - | CLOUD,VCU,IBC |
| ADDC_ACC_OvrdSts | 179 | 1 | 1 | 0 | - | CLOUD,VCU,IBC |
| ADDC_RCTB_Available | 180 | 1 | 1 | 0 | - | IBC |
| ADDC_RCTB_DecReq | 181 | 1 | 1 | 0 | - | VCU,IBC |
| ADDC_TargetDecel | 182 | 10 | 0.05 | -16 | m/s2 | IBC |
| ADDC_RAEB_Available | 192 | 1 | 1 | 0 | - | IBC |
| ADDC_RAEB_DecReq | 193 | 1 | 1 | 0 | - | VCU,IBC |
| ADDC_MEB_Available | 194 | 1 | 1 | 0 | - | IBC |
| ADDC_MEB_DecReq | 195 | 1 | 1 | 0 | - | VCU,IBC |

## 0x2D5 FSC_2D5  32B  sender=FSC

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| FSC_CRC_2D5 | 0 | 8 | 1 | 0 | - | ICU |
| FSC_RollingCounter_2D5 | 8 | 4 | 1 | 0 | - | ICU |
| FSC_L_Lane_Type | 16 | 3 | 1 | 0 | - | ICU |
| FSC_L_Lane_Colour | 19 | 3 | 1 | 0 | - | ICU |
| FSC_L_Lane_Curv | 22 | 10 | 0.0001 | -0.015 | - | ICU |
| FSC_L_Lane_Lat_Distance | 32 | 12 | 0.00390625 | -8 | m | ICU |
| FSC_L_Lane_Yaw_Ang | 44 | 12 | 0.000488281 | -1 | rad | ICU |
| FSC_L_Lane_Start_Posn | 56 | 8 | 0.25 | 0 | m | ICU |
| FSC_L_Lane_End_Posn | 64 | 9 | 0.25 | 0 | m | ICU |
| FSC_R_Lane_Type | 76 | 3 | 1 | 0 | - | ICU |
| FSC_R_Lane_Colour | 79 | 3 | 1 | 0 | - | ICU |
| FSC_R_Lane_Curv | 82 | 10 | 0.0001 | -0.015 | - | ICU |
| FSC_R_Lane_Lat_Distance | 92 | 12 | 0.00390625 | -8 | m | ICU |
| FSC_R_Lane_Yaw_Ang | 104 | 12 | 0.000488281 | -1 | rad | ICU |
| FSC_R_Lane_Start_Posn | 116 | 8 | 0.25 | 0 | m | ICU |
| FSC_R_Lane_End_Posn | 124 | 9 | 0.25 | 0 | m | ICU |
| FSC_LL_Lane_Type | 136 | 3 | 1 | 0 | - | ICU |
| FSC_LL_Lane_Colour | 139 | 3 | 1 | 0 | - | ICU |
| FSC_LL_Lane_Curv | 142 | 10 | 0.0001 | -0.015 | - | ICU |
| FSC_LL_Lane_Lat_Distance | 152 | 12 | 0.00390625 | -8 | m | ICU |
| FSC_LL_Lane_Yaw_Ang | 164 | 12 | 0.000488281 | -1 | rad | ICU |
| FSC_LL_Lane_Strat_Posn | 176 | 8 | 0.25 | 0 | m | ICU |
| FSC_LL_Lane_End_Posn | 184 | 9 | 0.25 | 0 | m | ICU |
| FSC_RR_Lane_Type | 196 | 3 | 1 | 0 | - | ICU |
| FSC_RR_Lane_Colour | 199 | 3 | 1 | 0 | - | ICU |
| FSC_RR_Lane_Curv | 202 | 10 | 0.0001 | -0.015 | - | ICU |
| FSC_RR_Lane_Lat_Distance | 212 | 12 | 0.00390625 | -8 | m | ICU |
| FSC_RR_Lane_Yaw_Ang | 224 | 12 | 0.000488281 | -1 | rad | ICU |
| FSC_RR_Lane_Start_Posn | 236 | 8 | 0.25 | 0 | m | ICU |
| FSC_RR_Lane_End_Posn | 244 | 9 | 0.25 | 0 | m | ICU |

## 0x2D1 FSC_2D1  32B  sender=FSC

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| FSC_CRC_2D1 | 0 | 8 | 1 | 0 | - | ICU |
| FSC_RollingCounter_2D1 | 8 | 4 | 1 | 0 | - | ICU |
| FSC_F_Obj_Status | 16 | 1 | 1 | 0 | - | ICU |
| FSC_F_Obj_Type | 17 | 3 | 1 | 0 | - | ICU |
| FSC_F_Obj_Logit_Distance | 20 | 12 | 0.0625 | 0 | m | ICU |
| FSC_F_Obj_Lat_Distance | 32 | 9 | 0.0625 | -15 | m | ICU |
| FSC_F_Obj_Heading | 46 | 10 | 0.01 | -5 | rad | ICU |
| FSC_F_Obj_Colour | 56 | 3 | 1 | 0 | - | ICU |
| FSC_FF_Obj_Status | 64 | 1 | 1 | 0 | - | ICU |
| FSC_FF_Obj_Type | 65 | 3 | 1 | 0 | - | ICU |
| FSC_FF_Obj_Logit_Distance | 68 | 12 | 0.0625 | 0 | m | ICU |
| FSC_FF_Obj_Lat_Distance | 80 | 9 | 0.0625 | -15 | m | ICU |
| FSC_FF_Obj_Heading | 94 | 10 | 0.01 | -5 | rad | ICU |
| FSC_LF_Obj_Status | 112 | 1 | 1 | 0 | - | ICU |
| FSC_LF_Obj_Type | 113 | 3 | 1 | 0 | - | ICU |
| FSC_LF_Obj_Logit_Distance | 116 | 12 | 0.0625 | 0 | m | ICU |
| FSC_LF_Obj_Lat_Distance | 128 | 9 | 0.0625 | -15 | m | ICU |
| FSC_LF_Obj_Heading | 142 | 10 | 0.01 | -5 | rad | ICU |
| FSC_RF_Obj_Status | 160 | 1 | 1 | 0 | - | ICU |
| FSC_RF_Obj_Type | 161 | 3 | 1 | 0 | - | ICU |
| FSC_RF_Obj_Logit_Distance | 164 | 12 | 0.0625 | 0 | m | ICU |
| FSC_RF_Obj_Lat_Distance | 176 | 9 | 0.0625 | -15 | m | ICU |
| FSC_RF_Obj_Heading | 192 | 10 | 0.01 | -5 | rad | ICU |

## 0x184 IBC_184  32B  sender=IBC

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| IBC_CRC_184 | 0 | 8 | 1 | 0 | - | HPCGW,VCU,ADDC,IVI,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_RollingCounter_184 | 8 | 4 | 1 | 0 | - | HPCGW,VCU,ADDC,IVI,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_FLWheelSpeedKPH | 16 | 16 | 0.01 | 0 | KPH | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_FRWheelSpeedKPH | 32 | 16 | 0.01 | 0 | KPH | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_RLWheelSpeedKPH | 48 | 16 | 0.01 | 0 | KPH | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_RRWheelSpeedKPH | 64 | 16 | 0.01 | 0 | KPH | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_FLWheelDirection | 80 | 2 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_FRWheelDirection | 82 | 2 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_RLWheelDirection | 84 | 2 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_RRWheelDirection | 86 | 2 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_FLWheelSpeedVD | 88 | 1 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_FRWheelSpeedVD | 89 | 1 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_RLWheelSpeedVD | 90 | 1 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_RRWheelSpeedVD | 91 | 1 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_FLWheelSpeedRC | 92 | 12 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,LMC,FSC |
| IBC_FRWheelSpeedRC | 104 | 12 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,LMC,FSC |
| IBC_RLWheelSpeedRC | 116 | 12 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,LMC,FSC |
| IBC_RRWheelSpeedRC | 128 | 12 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,ICU,LMC,FSC |
| IBC_WheelAccFrontLeftVD | 140 | 1 | 1 | 0 | - | LMC |
| IBC_WheelAccFrontRightVD | 141 | 1 | 1 | 0 | - | LMC |
| IBC_WheelAccRearLeftVD | 142 | 1 | 1 | 0 | - | LMC |
| IBC_WheelAccRearRightVD | 143 | 1 | 1 | 0 | - | LMC |
| IBC_WheelAccFrontLeft | 144 | 10 | 0.03125 | -16 | m/s2 | LMC |
| IBC_WheelAccFrontRight | 154 | 10 | 0.03125 | -16 | m/s2 | LMC |
| IBC_WheelAccRearLeft | 164 | 10 | 0.03125 | -16 | m/s2 | LMC |
| IBC_WheelAccRearRight | 174 | 10 | 0.03125 | -16 | m/s2 | LMC |
| IBC_DiscTemperatureFL | 184 | 3 | 1 | 0 | - | VCU,LMC |
| IBC_DiscTemperatureFLVD | 187 | 1 | 1 | 0 | - | VCU,LMC |
| IBC_DiscTemperatureFR | 188 | 3 | 1 | 0 | - | VCU,LMC |
| IBC_DiscTemperatureFRVD | 191 | 1 | 1 | 0 | - | VCU,LMC |
| IBC_DiscTemperatureRL | 192 | 3 | 1 | 0 | - | VCU,LMC |
| IBC_DiscTemperatureRLVD | 195 | 1 | 1 | 0 | - | VCU,LMC |
| IBC_DiscTemperatureRR | 196 | 3 | 1 | 0 | - | VCU,LMC |
| IBC_DiscTemperatureRRVD | 199 | 1 | 1 | 0 | - | VCU,LMC |
| IBC_LACPressure | 200 | 11 | 0.125 | 0 | bar | Vector__XXX |
| IBC_LACPressure_Q | 211 | 1 | 1 | 0 | - | Vector__XXX |

## 0x0B6 VCU_B6  16B  sender=VCU

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| VCU_CRC_B6 | 0 | 8 | 1 | 0 | - | HPCGW,ICU,ICUSC,ACU,EPS,IBC,LMC,FSC,BSDRL,BSDRR |
| VCU_RollingCounter_B6 | 8 | 4 | 1 | 0 | - | HPCGW,ICU,ICUSC,ACU,EPS,IBC,LMC,FSC,BSDRL,BSDRR |
| VCU_MDrvRequestTorque | 16 | 16 | 0.1 | -500 | Nm | CLOUD,IBC,FSC |
| VCU_MDriverRequireTorque | 32 | 16 | 0.1 | -500 | Nm | CLOUD,IBC |
| VCU_SDrvRequestTorque | 48 | 16 | 0.1 | -500 | Nm | CLOUD,IBC,FSC |
| VCU_SDriverRequireTorque | 64 | 16 | 0.1 | -500 | Nm | CLOUD,IBC |
| VCU_ThrottlePosition | 88 | 8 | 0.393 | 0 | % | CLOUD,EDR,ACU,IBC,LMC,FSC,BSDRL,BSDRR |
| VCU_AccPedalValid | 96 | 1 | 1 | 0 | - | CLOUD,EDR,ACU,IBC,LMC,FSC |
| VCU_BrakeSysFault | 97 | 1 | 1 | 0 | - | CLOUD,EDR,IVI,ICU,ACU,FSC |
| VCU_BrakeLightReq | 98 | 1 | 1 | 0 | - | CLOUD,HPCBCM |
| VCU_BrakePedalSts | 99 | 1 | 1 | 0 | - | CLOUD,GB,EDR,HPCGW,ACU,IBC,FSC,BSDRL,BSDRR |
| VCU_BrakePedalStsValid | 100 | 1 | 1 | 0 | - | CLOUD,EDR,HPCGW,ACU,IBC,FSC,BSDRL,BSDRR |
| VCU_GearLevelPosSts | 101 | 2 | 1 | 0 | - | CLOUD,EDR,IVI,ICU,ICUSC,ACU,EPS,IBC,LMC,FSC,BSDRL,BSDRR |
| VCU_GearLeverValid | 103 | 1 | 1 | 0 | - | CLOUD,EDR,ICUSC,ACU,EPS,IBC,LMC,FSC |
| VCU_BrakeFirstSts | 104 | 1 | 1 | 0 | - | CLOUD |
| VCU_DeliveryModeSts | 105 | 1 | 1 | 0 | - | LMC |

## 0x0B7 VCU_B7  32B  sender=VCU

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| VCU_CRC_B7 | 0 | 8 | 1 | 0 | - | ICU,ICUSC,ACU,EPS,IBC,LMC,FSC,BSDRL,BSDRR |
| VCU_RollingCounter_B7 | 8 | 4 | 1 | 0 | - | ICU,ICUSC,ACU,EPS,IBC,LMC,FSC,BSDRL,BSDRR |
| VCU_Vehicle_Warning | 16 | 2 | 1 | 0 | - | CLOUD,IVI,ICU,FSC |
| VCU_VehicleSts | 18 | 1 | 1 | 0 | - | CLOUD,IVI,ICU,ICUSC,ACU,EPS,IBC,LMC,FSC,BSDRL,BSDRR |
| VCU_PowerReduceReq | 19 | 2 | 1 | 0 | - | CLOUD,IVI,ICU |
| VCU_ParkingReqToEPB_VD | 24 | 2 | 1 | 0 | - | CLOUD,IBC |
| VCU_ParkingReqToEPB | 26 | 2 | 1 | 0 | - | CLOUD,IBC |
| VCU_ACCRequest | 28 | 2 | 1 | 0 | - | CLOUD,ADDC,IBC,FSC |
| VCU_ACCStates | 30 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| VCU_Active_APS | 31 | 1 | 1 | 0 | - | CLOUD,ADDC |
| VCU_Available_APS | 32 | 1 | 1 | 0 | - | CLOUD,ADDC,IBC |
| VCU_ESCActive | 33 | 1 | 1 | 0 | - | CLOUD |
| VCU_ESCTorqReqAvailability | 34 | 1 | 1 | 0 | - | CLOUD,IBC |
| VCU_AutoHold_ibit | 35 | 1 | 1 | 0 | - | CLOUD |
| VCU_VehicleSpeedVD | 36 | 2 | 1 | 0 | - | CLOUD |
| VCU_CCSStatus | 38 | 2 | 1 | 0 | - | CLOUD,EDR,ACU |
| VCU_AutoDriveRequest | 40 | 2 | 1 | 0 | - | CLOUD,ICU |
| VCU_CCSAllow | 42 | 1 | 1 | 0 | - | CLOUD |
| VCU_DecEnable | 43 | 1 | 1 | 0 | - | CLOUD,FSC |
| VCU_HoldReqSts | 44 | 1 | 1 | 0 | - | CLOUD,IBC |
| VCU_HoldReqStsValid | 45 | 1 | 1 | 0 | - | CLOUD,IBC |
| VCU_DriverAssistProhibitSts | 46 | 1 | 1 | 0 | - | CLOUD,FSC |
| VCU_SpeedLimitedSts | 47 | 1 | 1 | 0 | - | CLOUD |
| VCU_SpeedLimitedValue | 48 | 8 | 1 | 0 | km/h | CLOUD |
| VCU_TheoAccePedalPercent | 56 | 8 | 0.393 | 0 | - | CLOUD,IBC,LMC,FSC |
| VCU_RecuBrakeTorqueCap | 64 | 15 | 1 | 0 | N��m | CLOUD,IBC,LMC |
| VCU_RecuBrakeTorqueAct | 80 | 15 | 1 | 0 | N��m | CLOUD,IBC,LMC |
| VCU_TheoAccePedalValid | 96 | 1 | 1 | 0 | - | CLOUD,IBC,LMC,FSC |
| VCU_BrakCompTrqTgt | 97 | 15 | 1 | 0 | N��m | CLOUD,IBC |
| VCU_RecuBrakeTorqueActDrag | 112 | 15 | 1 | 0 | N��m | CLOUD,IBC,LMC |
| VCU_RecuBrakeTorqueCap_Q | 128 | 2 | 1 | 0 | - | CLOUD,IBC,LMC |
| VCU_RecuBrakeTorqueAct_Q | 130 | 2 | 1 | 0 | - | CLOUD,IBC,LMC |
| VCU_BrakCompTrqTgtp_Q | 132 | 2 | 1 | 0 | - | CLOUD,IBC |
| VCU_RecuBrakeTorqueActDrag_Q | 134 | 2 | 1 | 0 | - | CLOUD,IBC,LMC |
| VCU_RecuBrakeTorqueTarget_Drag | 136 | 15 | 1 | 0 | N��m | CLOUD,IBC,LMC |
| VCU_PreventVehSlipSts | 151 | 1 | 1 | 0 | - | CLOUD,IBC |
| VCU_RecuBrakeTorqueTarget_Drag_Q | 152 | 2 | 1 | 0 | - | CLOUD,IBC,LMC |
| VCU_ACCAPA_TorqueMax | 154 | 14 | 1 | -6000 | N��m | CLOUD,IBC |
| VCU_ACCAPA_TorqueMax_VD | 168 | 1 | 1 | 0 | - | CLOUD,IBC |
| VCU_TorqueMax_Sub | 169 | 15 | 1 | 0 | N��m | CLOUD,LMC |
| VCU_TorqueMax_Sub_VD | 184 | 1 | 1 | 0 | - | CLOUD,LMC |
| VCU_TorqueMax_Main_VD | 185 | 1 | 1 | 0 | - | CLOUD,LMC |
| VCU_LSFC_Allow | 186 | 1 | 1 | 0 | - | CLOUD,LMC |
| VCU_LSFC_Active | 187 | 1 | 1 | 0 | - | CLOUD,LMC |
| VCU_TorqueMax_Main | 192 | 15 | 1 | 0 | N��m | CLOUD,LMC |
| VCU_EscapeModeSts | 207 | 1 | 1 | 0 | - | CLOUD,IVI,IBC |

## 0x183 IBC_183  16B  sender=IBC

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| IBC_CRC_183 | 0 | 8 | 1 | 0 | - | VCU,ADDC,ACU,LMC,FSC |
| IBC_RollingCounter_183 | 8 | 4 | 1 | 0 | - | VCU,ADDC,ACU,LMC,FSC |
| IBC_RecuBrakeTorqueRequest | 16 | 15 | 1 | 0 | N��m | CLOUD,VCU |
| IBC_RecuBrakeTorqueRequest_Q | 32 | 2 | 1 | 0 | - | CLOUD,VCU |
| IBC_sOutputRodDriverPer_Q | 34 | 2 | 1 | 0 | - | CLOUD,VCU,ACU,LMC,FSC |
| IBC_BrakePedalApplied_Q | 36 | 2 | 1 | 0 | - | CLOUD,VCU,FSC |
| IBC_BrakCompTrqAct_Q | 38 | 2 | 1 | 0 | - | CLOUD,VCU |
| IBC_BrakCompTrqAct | 40 | 15 | 1 | 0 | N��m | CLOUD,VCU |
| IBC_BrakePedalApplied | 55 | 1 | 1 | 0 | - | CLOUD,VCU,FSC |
| IBC_sOutputRodDriverPer | 56 | 7 | 1 | 0 | % | CLOUD,VCU,ACU,LMC,FSC |
| IBC_CtrlMode | 64 | 3 | 1 | 0 | - | CLOUD,VCU,ADDC |
| IBC_InPutRodDriver | 68 | 12 | 0.0128 | -5 | mm | CLOUD,VCU |
| IBC_InPutRodDriver_Q | 80 | 2 | 1 | 0 | - | CLOUD,VCU |
| IBC_SystemAssistedStatus | 82 | 3 | 1 | 0 | - | CLOUD,VCU |
| IBC_EngTorq_VLC_Vaild | 87 | 1 | 1 | 0 | - | VCU |
| IBC_EngTorq_VLC | 88 | 14 | 1 | -6000 | N��m | VCU |
| IBC_BrkTorq_VLC | 112 | 15 | 1 | -32767 | N��m | VCU |
| IBC_BrkTorq_VLC_Vaild | 127 | 1 | 1 | 0 | - | VCU |

## 0x185 IBC_185  16B  sender=IBC

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| IBC_CRC_185 | 0 | 8 | 1 | 0 | - | HPCGW,VCU,ADDC,IVI,ICU,ICUSC,ACU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_RollingCounter_185 | 8 | 4 | 1 | 0 | - | HPCGW,VCU,ADDC,IVI,ICU,ICUSC,ACU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_PlungerPressure | 16 | 11 | 0.125 | 0 | bar | CLOUD,HPCGW,VCU,ADDC,LMC,FSC |
| IBC_PlungerPressure_Q | 27 | 1 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,LMC,FSC |
| IBC_SimulatorPressure | 28 | 11 | 0.125 | 0 | bar | CLOUD,VCU,LMC |
| IBC_SimulatorPressure_Q | 39 | 1 | 1 | 0 | - | CLOUD,VCU,LMC |
| IBC_ESP_FailureLamp | 40 | 2 | 1 | 0 | - | CLOUD,ADDC,IVI,ICU,FSC |
| IBC_ABS_FailureLamp | 42 | 1 | 1 | 0 | - | CLOUD,ADDC,IVI,ICU,FSC |
| IBC_EBD_FailureLamp | 43 | 1 | 1 | 0 | - | CLOUD,ADDC,IVI,ICU |
| IBC_HHC_FailureLamp | 44 | 1 | 1 | 0 | - | CLOUD,ICU |
| IBC_HMI_WarningOn | 45 | 2 | 1 | 0 | - | CLOUD,VCU,ICU |
| IBC_MIL_WarningOn | 47 | 1 | 1 | 0 | - | CLOUD,VCU |
| IBC_LongitAcceAct | 48 | 10 | 0.03125 | -16 | m/s2 | CLOUD,VCU,LMC,FSC |
| IBC_LongitAcceActValid | 58 | 1 | 1 | 0 | - | CLOUD,VCU,LMC,FSC |
| IBC_brakeFluidWarning | 59 | 2 | 1 | 0 | - | CLOUD,VCU,ICU |
| IBC_RAB_Avatiable | 61 | 1 | 1 | 0 | - | CLOUD,HPCGW |
| IBC_RAB_Active | 62 | 1 | 1 | 0 | - | CLOUD,HPCGW |
| IBC_ABAAvaliable | 63 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| IBC_ABA_active | 64 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| IBC_AWBAvaliable | 65 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| IBC_AWB_active | 66 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| IBC_ABPAviliable | 67 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| IBC_ABP_active | 68 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| IBC_SCM_Active | 69 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,ACU |
| IBC_SCM_Failed | 70 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,ACU |
| IBC_RCTB_active | 71 | 1 | 1 | 0 | - | CLOUD,ADDC,BSDRL,BSDRR |
| IBC_RCTB_Aviliable | 72 | 1 | 1 | 0 | - | CLOUD,ADDC,BSDRL,BSDRR |
| IBC_HBAActive | 73 | 1 | 1 | 0 | - | CLOUD,ADDC,ACU,EPS,LMC |
| IBC_HBAFailed | 74 | 1 | 1 | 0 | - | CLOUD |
| IBC_ABLActive | 76 | 1 | 1 | 0 | - | CLOUD,ADDC,IVI |
| IBC_LdmBLC | 77 | 1 | 1 | 0 | - | CLOUD,HPCBCM,ADDC,FSC |
| IBC_CDPAvailable | 78 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC |
| IBC_CDPIntervention | 79 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC |
| IBC_AEB_active | 80 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC,FSC |
| IBC_AEBdecAvailable | 81 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC,FSC |
| IBC_AVHStatus | 82 | 2 | 1 | 0 | - | CLOUD,HPCGW,VCU,ADDC,IVI,ICUSC,LMC,FSC |
| IBC_AVHAvailable | 84 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC,FSC |
| IBC_HHCActive | 85 | 1 | 1 | 0 | - | CLOUD,VCU |
| IBC_HHCFailed | 86 | 1 | 1 | 0 | - | CLOUD,VCU |
| IBC_CDD_Available_APA | 87 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC |
| IBC_CDD_Active_APA | 88 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,IVI |
| IBC_QDCAEB | 89 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| IBC_CDD_Available_ACC | 90 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC,FSC |
| IBC_CDD_Active_ACC | 91 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,IVI,LMC,FSC |
| IBC_QDCACC | 92 | 1 | 1 | 0 | - | CLOUD,ADDC,FSC |
| IBC_QDCAPS | 93 | 1 | 1 | 0 | - | CLOUD |
| IBC_HDCStatus | 94 | 2 | 1 | 0 | - | CLOUD,VCU,ADDC,IVI,ICU,LMC,FSC |
| IBC_HDCAvailable | 96 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC,FSC |
| IBC_CSTStatus | 97 | 2 | 1 | 0 | - | CLOUD,VCU,IVI |
| IBC_CSTAvailable | 99 | 1 | 1 | 0 | - | CLOUD,VCU |
| IBC_VLC_Available_ACC | 100 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,FSC |
| IBC_VLC_Active_ACC | 101 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,FSC |
| IBC_VLC_Available_APA | 102 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC |
| IBC_VLC_Active_APA | 103 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC |
| IBC_VehicleHoldStatus | 104 | 2 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC,FSC |
| IBC_APS_PrecheckSts | 106 | 2 | 1 | 0 | - | CLOUD |
| IBC_HDC_TextDisplay | 108 | 3 | 1 | 0 | - | Vector__XXX |
| IBC_Low_AEB_Available | 111 | 1 | 1 | 0 | - | ADDC |
| IBC_Low_AEB_Active | 112 | 1 | 1 | 0 | - | ADDC |
| IBC_DrvrBrkTqAtWhlsReqd | 113 | 15 | 1 | 0 | N��m | VCU |

## 0x290 HPCBCM_290  8B  sender=HPCBCM

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| BCM_CRC_290 | 0 | 8 | 1 | 0 | - | HPCGW,VCU,IVI,ICU,ICUSC,ACU,EPS,IBC,LMC,FSC,BSDRL,BSDRR |
| BCM_RollingCounter_290 | 8 | 4 | 1 | 0 | - | HPCGW,VCU,IVI,ICU,ICUSC,ACU,EPS,IBC,LMC,FSC,BSDRL,BSDRR |
| BCM_KeyPosition_ON1A | 16 | 1 | 1 | 0 | - | ICUSC,FSC |
| BCM_KeyPosition_ON1B | 17 | 1 | 1 | 0 | - | IVI,ICU,ICUSC,LMC,FSC |
| BCM_KeyPosition_ON2A | 18 | 1 | 1 | 0 | - | IVI,ICU,ICUSC,FSC |
| BCM_KeyPosition_ON2B | 19 | 1 | 1 | 0 | - | ICUSC,LMC,FSC |
| BCM_KeyPosition_ON3 | 20 | 1 | 1 | 0 | - | IVI,ICU,ICUSC,EPS,IBC,LMC,FSC |
| BCM_TurnLeftSwtSts | 21 | 1 | 1 | 0 | - | EDR,IVI,ICU,ACU,FSC,BSDRL,BSDRR |
| BCM_TurnRightSwtSts | 22 | 1 | 1 | 0 | - | EDR,IVI,ICU,ACU,FSC,BSDRL,BSDRR |
| BCM_HazardSwtSts | 23 | 1 | 1 | 0 | - | VCU,IVI,ICU,ACU,FSC |
| BCM_TurnLeftCtrl | 24 | 1 | 1 | 0 | - | IVI,ICU,ICUSC,FSC,BSDRL,BSDRR |
| BCM_TurnRightCtrl | 25 | 1 | 1 | 0 | - | IVI,ICU,ICUSC,FSC,BSDRL,BSDRR |
| BCM_LowBeamCtrl | 26 | 1 | 1 | 0 | - | IVI,ICU,FSC |
| BCM_HighBeamCtrl | 27 | 1 | 1 | 0 | - | IVI,ICU,FSC |
| BCM_DrOC_PPD_Status | 28 | 2 | 1 | 0 | - | VCU,IVI,LMC |
| BCM_FLOC_PPD_Status | 30 | 2 | 1 | 0 | - | VCU,IVI,ICU,LMC,FSC |
| BCM_FROC_PPD_Status | 32 | 2 | 1 | 0 | - | VCU,IVI,ICU,LMC,FSC |
| BCM_RLOC_PPD_Status | 34 | 2 | 1 | 0 | - | IVI,ICU,LMC,FSC |
| BCM_RMOC_PPD_Status | 36 | 2 | 1 | 0 | - | IVI,ICU,LMC,FSC |
| BCM_RROC_PPD_Status | 38 | 2 | 1 | 0 | - | IVI,ICU,LMC,FSC |
| BCM_SRLOC_PPD_Status | 40 | 2 | 1 | 0 | - | IVI,ICU,LMC |
| BCM_SRROC_PPD_Status | 42 | 2 | 1 | 0 | - | IVI,ICU,LMC |
| BCM_DriverDoorSts | 44 | 1 | 1 | 0 | - | VCU,IVI,ICU,IBC,LMC,FSC,BSDRL,BSDRR |
| BCM_DriverDoorSts_VD | 45 | 1 | 1 | 0 | - | VCU,IVI,ICU,IBC,LMC,FSC,BSDRL,BSDRR |
| BCM_FLDoorSts | 46 | 1 | 1 | 0 | - | VCU,IVI,ICU,LMC,FSC,BSDRL,BSDRR |
| BCM_FRDoorSts | 47 | 1 | 1 | 0 | - | VCU,IVI,ICU,LMC,FSC,BSDRL,BSDRR |
| BCM_RLDoorSts | 48 | 1 | 1 | 0 | - | IVI,ICU,LMC,FSC,BSDRL,BSDRR |
| BCM_RRDoorSts | 49 | 1 | 1 | 0 | - | IVI,ICU,LMC,FSC,BSDRL,BSDRR |
| BCM_BackDoorSts | 50 | 1 | 1 | 0 | - | HPCGW,VCU,IVI,ICU,LMC,FSC,BSDRL,BSDRR |
| BCM_FrontCoverSts | 51 | 1 | 1 | 0 | - | VCU,ICU,LMC,FSC,BSDRL,BSDRR |
| BCM_HazardSwtOpenSts | 52 | 1 | 1 | 0 | - | VCU,FSC |
| BCM_BrakeFluidLevel | 53 | 2 | 1 | 0 | - | VCU,FSC |
| BCM_FrontWiperSts | 55 | 2 | 1 | 0 | - | FSC,BSDRL,BSDRR |
| BCM_ON2BRelaySts | 57 | 1 | 1 | 0 | - | VCU,FSC |
| BCM_ON2CRelaySts | 58 | 1 | 1 | 0 | - | VCU,FSC |
| BCM_RearFogCtrl | 59 | 1 | 1 | 0 | - | FSC |
| BCM_ScreenNotDisplay_C | 60 | 1 | 1 | 0 | - | ICUSC |
| BCM_AlarmMode_C | 61 | 2 | 1 | 0 | - | VCU,IBC |

## 0x182 IBC_182  8B  sender=IBC

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| IBC_CRC_182 | 0 | 8 | 1 | 0 | - | HPCGW,VCU,HPCBCM,ADDC,IVI,ICU,ACU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_RollingCounter_182 | 8 | 4 | 1 | 0 | - | HPCGW,VCU,HPCBCM,ADDC,IVI,ICU,ACU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_VehicleSpeed | 16 | 16 | 0.01 | 0 | KPH | CLOUD,GB,EDR,HPCGW,VCU,HPCBCM,ADDC,IVI,ICU,ACU,EPS,LMC,FSC,B |
| IBC_VehicleSpeedVD | 32 | 1 | 1 | 0 | - | CLOUD,HPCGW,VCU,HPCBCM,ADDC,IVI,ICU,ACU,EPS,LMC,FSC,BSDRL,BS |
| IBC_ABSActive | 33 | 1 | 1 | 0 | - | CLOUD,EDR,VCU,ADDC,ACU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_ABSFailed | 34 | 1 | 1 | 0 | - | CLOUD,EDR,VCU,ADDC,ACU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_TCSActive | 35 | 1 | 1 | 0 | - | CLOUD,EDR,VCU,ADDC,ICU,ACU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_TCSFailed | 36 | 1 | 1 | 0 | - | CLOUD,EDR,VCU,ADDC,ACU,EPS,LMC,FSC,BSDRL,BSDRR |
| IBC_ESCFunctionStatus | 37 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,IVI,ICU,ACU,LMC,FSC,BSDRL,BSDRR |
| IBC_BrakeForce | 38 | 1 | 1 | 0 | - | CLOUD,VCU |
| IBC_Vehiclestandstill | 39 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC,FSC,BSDRL,BSDRR |
| IBC_EBDFailed | 40 | 1 | 1 | 0 | - | CLOUD,VCU,ADDC,LMC,FSC |
| IBC_EBDActive | 41 | 1 | 1 | 0 | - | CLOUD,VCU,LMC,FSC |
| IBC_VDCActive | 42 | 1 | 1 | 0 | - | CLOUD,EDR,VCU,ADDC,IVI,ACU,LMC,FSC |
| IBC_VDCFailed | 43 | 1 | 1 | 0 | - | CLOUD,EDR,VCU,ACU,LMC,FSC |
| IBC_EDCActive | 44 | 1 | 1 | 0 | - | CLOUD,VCU,LMC,FSC |
| IBC_EDCFailed | 45 | 1 | 1 | 0 | - | CLOUD,VCU,LMC,FSC |
| IBC_SystemInitializeStatus | 46 | 1 | 1 | 0 | - | CLOUD,VCU,LMC |
| IBC_BTCSActive | 47 | 1 | 1 | 0 | - | CLOUD,VCU,LMC |
| IBC_ETCSActive | 48 | 1 | 1 | 0 | - | CLOUD,VCU,LMC |
| IBC_ARPActive | 49 | 1 | 1 | 0 | - | CLOUD,VCU,LMC |
| IBC_VCU_DrumMode | 50 | 1 | 1 | 0 | - | CLOUD,VCU,LMC |
| IBC_MPS_Elec_WarnningLamp | 51 | 1 | 1 | 0 | - | Vector__XXX |
| IBC_EscapeModeSts | 52 | 1 | 1 | 0 | - | CLOUD,VCU |

## 0x142 FSC_142  16B  sender=FSC

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| FSC_CRC_142 | 0 | 8 | 1 | 0 | - | VCU,HPCBCM,ICU,ACU,EPS |
| FSC_RollingCounter_142 | 8 | 4 | 1 | 0 | - | VCU,HPCBCM,ICU,ACU,EPS |
| FSC_ACC_Low_jerkReq | 16 | 10 | 0.01 | -6 | m/s3 | Vector__XXX |
| FSC_ACC_upper_jerkReq | 26 | 9 | 0.01 | 0 | m/s3 | Vector__XXX |
| FSC_ACC_ShutdownReq | 35 | 2 | 1 | 0 | - | ICU |
| FSC_FCW_Mode | 37 | 3 | 1 | 0 | - | ICU |
| FSC_LCC_Mode | 40 | 3 | 1 | 0 | - | VCU,ICU,ACU,EPS |
| FSC_ELK_WarningType | 43 | 2 | 1 | 0 | - | ICU |
| FSC_ELK_Left_Type | 45 | 3 | 1 | 0 | - | ICU |
| FSC_ELK_Right_Type | 48 | 3 | 1 | 0 | - | ICU |
| FSC_ELK_Mode | 51 | 3 | 1 | 0 | - | ICU,ACU,EPS |
| FSC_LCC_EscapeLevel | 54 | 2 | 1 | 0 | - | ICU |
| FSC_LCCTakeOver | 56 | 2 | 1 | 0 | - | ICU |
| FSC_LCC_Available | 58 | 1 | 1 | 0 | - | ICU |
| FSC_IHBC_Mode | 59 | 3 | 1 | 0 | - | HPCBCM,ICU |
| FSC_IHBC_High_Beam_Request | 62 | 1 | 1 | 0 | - | HPCBCM,ICU |
| FSC_ACCWaitingReactivateRequest | 63 | 1 | 1 | 0 | - | ICU |
| FSC_FCW_Warming | 64 | 2 | 1 | 0 | - | HPCBCM,ICU |
| FSC_LDW_Mode | 66 | 3 | 1 | 0 | - | ACU |
| FSC_LDW_WarningType | 69 | 2 | 1 | 0 | - | ICU,ACU |
| FSC_NavSpeedLimit_Conf | 71 | 1 | 1 | 0 | - | ICU |
| FSC_ISA_NavSpeedLimit_Value | 72 | 8 | 1 | 0 | - | ICU |
| FSC_ISA_NavSpeedLimit_Units | 80 | 2 | 1 | 0 | - | ICU |
| FSC_ISA_OverSpeed_Warning_Status | 82 | 1 | 1 | 0 | - | ICU |
| FSC_ISA_Mode | 83 | 3 | 1 | 0 | - | ICU |
| FSC_Controllor_Status | 86 | 1 | 1 | 0 | - | Vector__XXX |
| FSC_Controllor_Failsafe_Status | 87 | 1 | 1 | 0 | - | Vector__XXX |
| FSC_AlignmentStat | 88 | 2 | 1 | 0 | - | Vector__XXX |
| FSC_OverVoltageErr | 90 | 1 | 1 | 0 | - | Vector__XXX |
| FSC_UnderVoltageErr | 91 | 1 | 1 | 0 | - | Vector__XXX |
| FSC_OverTemperature | 92 | 1 | 1 | 0 | - | Vector__XXX |
| FSC_VehicleSpdErr | 93 | 1 | 1 | 0 | - | Vector__XXX |
| FSC_BlockErr | 94 | 1 | 1 | 0 | - | Vector__XXX |
| FSC_HardwareErr | 95 | 1 | 1 | 0 | - | Vector__XXX |
| FSC_QandA_NoVIN_Fault | 96 | 1 | 1 | 0 | - | HPCBCM |
| FSC_QandA_HPC_Outtime_Fault | 97 | 1 | 1 | 0 | - | HPCBCM |
| FSC_QandA_HPC_ERROR_Fault | 98 | 1 | 1 | 0 | - | HPCBCM |
| FSC_EES_req | 99 | 1 | 1 | 0 | - | HPCBCM |

## 0x143 FSC_143  8B  sender=FSC

| 信号 | 起始位 | 长度 | 因子 | 偏移 | 单位 | 接收方 |
|---|---:|---:|---:|---:|---|---|
| FSC_CRC_143 | 0 | 8 | 1 | 0 | - | Vector__XXX |
| FSC_RollingCounter_143 | 8 | 4 | 1 | 0 | - | Vector__XXX |
| FSC_ACC_WorkingSts | 16 | 1 | 1 | 0 | - | CLOUD |
| FSC_ACCTextInfo | 17 | 4 | 1 | 0 | - | CLOUD |
| FSC_ACCTakeOver | 21 | 2 | 1 | 0 | - | CLOUD |
| FSC_AEB_WorkingSts | 23 | 1 | 1 | 0 | - | CLOUD |
| FSC_AEB_RecordingPulse | 24 | 3 | 1 | 0 | - | CLOUD |
| FSC_AEBNotAvailableReason | 27 | 7 | 1 | 0 | - | CLOUD |
| FSC_ACCNotAvailableReason | 34 | 7 | 1 | 0 | - | CLOUD |
| FSC_LKATextInfo | 41 | 4 | 1 | 0 | - | CLOUD |
| FSC_LKAAvailable | 45 | 1 | 1 | 0 | - | CLOUD |
| FSC_LKA_RecordingPulse | 46 | 2 | 1 | 0 | - | CLOUD |
| FSC_LKA_WorkingSts | 48 | 1 | 1 | 0 | - | CLOUD |
