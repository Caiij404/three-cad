# 验证记录

日期：2026-10-01。环境：Windows、PowerShell 7.6、Node v20.11.1、Git 2.40.1.windows.1。

## T-001：来源与接口边界

关联 NFR-007、LEARN-001。REQ-005/REQ-012 仅完成前置调查，没有功能 AC 通过。

| 检查 / 命令 | 输入与期望 | 实际结果 | 证据 |
| --- | --- | --- | --- |
| `node scripts/audit-upstream.mjs --check` | 四个仓库 HEAD 匹配清单；原始字节指纹匹配；两子模块 commit 匹配 | 4 仓库、33 文件通过 | [审计 JSON](learning/evidence/T-001-source-audit.json) |
| `WebAssembly.Module` | 固定旧 WASM 可解析，可读取导出 | 143466 bytes；有 solver/main/malloc/free；未实例化、未执行 | 同上 exports/imports |
| `node scripts/probe-float32.mjs` | 一个整数对照、三个小数；至少一个范围内输入误差 >1e-5 mm | 9999.0001 与 9999.123456789 两项超阈值；断言通过 | [Float32 JSON](learning/evidence/L-001A-float32.json) |
| `git -C .research/solvespace apply --cached --check ../../patches/solvespace-js-array.patch` | 固定源码能匹配补丁上下文 | 通过；未应用修改 | [补丁](../patches/solvespace-js-array.patch) |
| `node scripts/check-docs.mjs` / `git diff --check` | 内部链接、编码、标题、围栏、表格及空格符合约定 | 通过；不验证外部网页或 Mermaid 视觉渲染 | 本次文档 |

补丁校验前使用 `git -C .research/solvespace read-tree HEAD` 建立只用于审计的 index。最初的补丁缺少尾部上下文，`--check` 失败；补充上下文后重跑通过。没有把第一次失败写成成功，也没有实际编译这个补丁。

Float32 误差是一次 JS 类型转换的结果，不是约束求解残差。容差依据 PRD 的 `1e-5 mm` 目标；实验用来判断接口能否普遍保留所需细节。

旧 WASM 哈希只证明所审计文件的身份，未证明旧 libslvs.a 的源码来源或分发二进制与构建命令之间的对应关系。旧构建链缺口与候选重建方法见 [UPSTREAM](UPSTREAM.md)。

## 尚未执行

应用启动、类型检查与构建；新 WASM 构建；真实求解与 DOF；矩形/曲线/孔洞/布尔几何验证；STL 解析；Worker 竞态/超时；三浏览器与生产 `/cad/`；性能与资源生命周期。

本记录不代表 M0 gate、任何完整 P0 需求或 E2E 已通过。
