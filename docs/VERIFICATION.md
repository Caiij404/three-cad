# 验证记录

日期：2026-10-01。各任务使用的实际环境分别记录；T-001 使用 Node v20.11.1，T-002 使用 Node v24.21.0。

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

## T-002：最小工程与类型边界

关联 NFR-007 的 npm 锁定/来源部分、LEARN-001。REQ-001 只完成启动前置；AC-001-1 要求真实求解器，因此仍未通过。

环境：Windows x64、PowerShell 7.6、Node `24.21.0`、npm `11.19.0`、Edge `154.0.4258.48`。依赖：Vue `3.5.43`、Vite `8.3.2`、plugin-vue `6.0.9`、TypeScript `6.0.3`、vue-tsc `3.3.11`、@types/node `24.19.0`、Playwright `1.63.0`。

| 检查 / 命令 | 输入与期望 | 实际结果 | 证据 |
| --- | --- | --- | --- |
| `./scripts/setup-node.ps1` | 官方 Node 24.21.0 ZIP 的 SHA-256 匹配 | 归档匹配，Node 与 npm 实际版本如上 | [环境/来源 JSON](third-party/npm-dependencies.json) |
| `npm ci`、`npm ls --depth=0` | 锁文件可重新安装；版本与清单一致 | 重装 49 个包；74 项锁定（含其他平台可选包） | 同上，安装包逐项版本比对通过 |
| `npm run typecheck`、`npm run build` | 主工程无类型错误；生产构建成功 | 退出 0；产物为 HTML、JS、CSS 与许可声明 | [命令与复现实验](learning/notes/L-001B-vue-ts-vite.md) |
| `npm run dev -- --port 5173 --strictPort`、`npm run preview -- --port 4173 --strictPort` | 两个真实 CLI 入口加载对应模块 | HTTP 200；开发 `/src/main.ts`，生产 `/assets/index-SstTJdzJ.js` | [CLI JSON](learning/evidence/T-002-cli.json) |
| `npm run check:bootstrap` | 开发/生产真实浏览器计数 0→1，禁用内核按钮，无错误 | Edge 两模式通过；390 px 无横向溢出；锁文件无四种禁止依赖 | [浏览器 JSON](learning/evidence/T-002-bootstrap.json) |
| `npm run learn:typecheck` | 同一个错误 SFC：类型检查拒绝、单独打包成功 | TS2345 / 退出 2；Vite / 退出 0；实验断言通过 | [类型实验 JSON](learning/evidence/L-001B-typecheck.json) |
| `npm run record:toolchain` | 锁定包来源、integrity、许可证、实际安装情况可追踪 | 74 项已记录；Vue 原许可保留，生产声明可复制到 dist | [来源清单](third-party/README.md) |

首次类型检查失败的组合为 TypeScript `7.0.2` + vue-tsc `3.3.11`，错误为 `ERR_PACKAGE_PATH_NOT_EXPORTED`，涉及 `typescript/lib/tsc`。改用 `6.0.3` 后重新安装、检查与构建通过。没有保留不能实际运行的“最新版本”组合。

浏览器结果是 DOM、HTTP、真实点击及错误监听的断言，不以截图作为通过依据。计数器比较为字符串精确相等；这是工具链实验，没有几何输入或几何容差。开发/生产测试分别使用 Vite 的 `createServer` / `preview` API；CLI 入口另行真实启动并请求，二者不混写。

截图仅在忽略的 `.research/bootstrap-preview.png` 中辅助检查排版。没有验证 HMR 修改保留状态、完整 CAD 操作或用户掌握程度。

## 尚未执行

新 WASM 构建；真实求解与 DOF；矩形/曲线/孔洞/布尔几何验证；STL 解析；Worker 竞态/超时；三浏览器与生产 `/cad/` WASM/Worker；性能与资源生命周期。

本记录不代表 M0 gate、任何完整 P0 需求或 E2E 已通过。
