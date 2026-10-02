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

## T-003：真实 WASM / Worker / 数值检查

日期：2026-10-01—02。环境为 Windows x64 / PowerShell 7.6 / Node 24.21.0 / npm 11.19.0 / Edge 154.0.4258.48，SDK 与源版本见 [solver-build.json](third-party/solver-build.json)。关联 AC-001-1 的 solver 资源部分、REQ-005 指定夹具、REQ-012 Worker 前置、NFR-007 与 LEARN-001。

| 命令 / 输入 | 期望 / 容差 | 实际 | 证据 |
| --- | --- | --- | --- |
| `build-solver.ps1` / 固定源码与三个补丁 | 真实 C++ 编译并产生可加载模块 | 26 步编译与链接成功；独立 mjs/wasm | [构建](learning/evidence/T-003-build.log)、[Ninja](learning/evidence/T-003-ninja.log)、[配置](learning/evidence/T-003-configure.log) |
| `check:solver` / 宽 40、60、40.123456789、9999.0001，高 30 | 尺寸/方向残差 ≤1e-5 mm；DOF 0 | 所有残差 0；原生 DOF 0 | [Node JSON](learning/evidence/T-003-solver-node.json) |
| 圆弧半径 10 + 水平相切线长 20 | 半径/长度 ≤1e-5 mm；单位向量点积 ≤1e-5 | 残差均 0；DOF 0 | 同上，夹具实际初值见源码 |
| 宽 40 与 50 冲突；删除宽 | inconsistent / 不提交点；欠约束 DOF | 原生冲突集合包含两宽约束、points=null；删除宽 DOF=1 | 同上 |
| 重复负载与非法输入 | 不被前一模型污染；原生前明确拒绝 | Node 60 次矩形；5 项非法输入拒绝；热身前后缓冲区相等 | 同上 |
| `check:solver:browser` | 开发/生产/cad 真实 Worker、资源 200、正确 MIME | 三入口各 8 项数值检查通过；无非预期页面错误 | [浏览器 JSON](learning/evidence/T-003-solver-browser.json) |
| HTTP 503 → 解除拦截 → 重试 | 明确失败后能恢复 | 错误显示后重试 8 项通过 | 同上 |

重建首次因绝对 gitdir 路径拼接失败，保留 [失败日志](learning/evidence/T-003-configure-first-failure.log)。首次缓冲区从 33554432 增长到 40304640 bytes，第二批稳定；记录只支持当前负载的容量稳定，不能证明全部原生分配无泄漏。SDK HTML 入口扫描与 favicon 404 在浏览器实际检查中发现并修复。

前端已接入真实求解与 Worker，但完整 CAD 工作区和所有 P0 约束尚未实现。局部输入不被修改不是 AC-005-3 完整事务回滚证据；10 秒超时与乱序策略虽有代码，尚未人为验证。历史 T-001/T-002 证据保留原始时间与范围。

## T-004：真实 CSG、孔洞、STL 与 Worker

日期：2026-10-02。环境同 T-003，新增 Three.js 0.186.1、@types/three 0.186.0；BSP 来源固定 `8bd00fe9`，无改动，见 [CSG 清单](third-party/csg-source.json)。REQ-006/007/011 为指定几何夹具前置，完整 UI/AC 未通过。

| 命令 / 输入 | 期望 / 容差 | 实际 | 证据 |
| --- | --- | --- | --- |
| `check:solid` / 两个 20³ 方块，中心差 10 | union 12000，A-B/B-A/intersect 4000；相对体积 ≤1e-4 | 全部通过；体积最大相对误差约 5.7e-16；包围盒正确 | [Node](learning/evidence/T-004-solid-node.json) |
| 分离、面相切、相同，共 9 项 | empty 显式零三角形；其他结果闭合/外向 | 均满足预期 | 同上 |
| 原始 union 扇形网格 → 一致边界三角化 | 严格位置焊接后边/顶点二流形 | 原始有 12 条未配对边；修复后 0，方向一致 | 同上 rawFanTriangulation / cases |
| 孔洞外 40×30，内 10×10，三平面 ±10 | 11000 mm³，包围盒 ≤4e-4 mm | 6 项均闭合、外向与尺寸通过 | 同上 |
| STLExporter → 独立解析器 | 长度 84+50N，体积/闭合/方向满足原夹具 | 16 个非空实体往返通过；实际 SHA/面数记录 | 同上 stl |
| 非法输入与验证器负向 | 错误不伪装有效实体 | 5 个非法输入；缺面/反向/截断 STL/错误面数拒绝 | 同上 |
| 边相切与顶点相切 union | 非流形明确失败 | 前者 1 条非流形边；后者边检查合法但 1 个非流形顶点；均拒绝 | 同上 degeneracies |
| `check:solid:browser` | 实际 Worker 中相同数值断言 | 开发、生产、`/cad/` 各 19 项通过 | [浏览器](learning/evidence/T-004-solid-browser.json) |
| `check-distribution.mjs --staged` | 精确来源 bytes 与 Git index 一致 | 所登记产物/许可/核心指纹一致 | [分发检查](learning/evidence/T-004-distribution.json) |

位置焊接 `1e-6 mm`，BSP 固定平面分类 `1e-5`；两者用途不同。三角化桥接暂限 2000 个顶点，指标采用直接位置扫描；没有覆盖复杂模型性能。STL 使用 Float32，本次通过不能推断全部坐标范围都满足同一误差。

T-003 最终 cached diff 的上游空白提示在交接中纠正。T-004 保留原始许可/生成文件字节并核对 index SHA，不修改上游文本来使空白检查“通过”。

## T-005：两内核集成与默认超时恢复

日期：2026-10-02。环境、机器与固定版本见 [TECH-SPIKE](TECH-SPIKE.md)。M0 gate 通过，不代表完整 P0。传输层抽为共用 WorkerRpc，内核协议同步改变，因此真实求解的资源失败兼容用例已重放。

| 命令 / 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| `check:worker` | 乱序、错 session/id/revision、错误/超时/旧事件/销毁等正确处理 | 8 个测试通过；控制端口只作协议证据 | [测试](learning/evidence/T-005-worker-rpc.json) |
| `check:gate` / 两内核同页并行 | 实际 8 solver +19 solid 数值检查 | 三入口均通过，非法 solid 后正常调用恢复 | [浏览器](learning/evidence/T-005-gate-browser.json) |
| 实际静默 Worker，默认 10000 ms | 明确超时终止，新会话真实求解 | 三入口约 10001.8—10015.1 ms；新 solver 正确 60 mm | 同上 |
| 热身后每内核 30 次，小夹具 | 原样记录往返采样 | p95 solver 0.3—0.4 / solid 1.1—1.2 ms；未记录 longtask | 同上、[机器](learning/evidence/T-005-machine.json) |
| 重放 solver 浏览器检查 | 改协议后 MIME/路径/503 重试仍成立 | 开发/生产/cad 及 503 恢复通过；原 T-003 证据保留 | [重放摘要](learning/evidence/T-005-load-retry.json) |

技术 gate 结果见 [矩阵](TECH-SPIKE.md)。真实 10 秒恢复不同于 Node 控制端口的 20 ms 快测；新会话恢复调用实际 WASM，没有填充模拟几何。小夹具计时不构成 NFR-003/NFR-004 完整基准场景验收。

## T-101：工作区壳与状态边界

日期：2026-10-02，环境沿用 T-005，新增 Pinia 4.0.3。覆盖 REQ-001 加载入口和 REQ-012 状态前置；完整文档/视口尚未实现。

| 命令 / 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| `check:workspace:state` | 代次/模式上下文/计算锁/取消清理边界 | 4 项真实状态测试通过 | [日志](learning/evidence/T-101-state.log) |
| `check:workspace` | 三入口实际加载 solver 与 solid | 开发/生产/cad ready，WASM 200/MIME 正确 | [浏览器](learning/evidence/T-101-workspace-browser.json) |
| 启动 WASM 503 → 重试 | 明确 error，重试返回 ready | 选择禁用后恢复；不无限 loading | 同上 |
| 面板折叠、页面切换、1280/1024/390 | 宽度变化/重挂载正常、无溢出/窄屏提示 | 全部通过；未实现按钮禁用 | 同上 |
| 分发指纹与许可 | Pinia/内联依赖/devtools 原文可追踪 | 8 个声明保留，27 原始文件/index SHA 一致 | [UI 来源](third-party/ui-dependencies.json)、[分发](learning/evidence/T-101-distribution.json) |

截图实际查看，仅确认排版；没有借助截图声称视口/几何正确。真实内核 probe 是指定矩形/交集，工作区中心明确标注尚未实现视口。AC-001-2 的 WebGL 分支及 AC-001-3 的新建文档/撤销仍待后续。

## T-102：领域、DAG 与原子历史基础

日期：2026-10-02，环境沿用 T-101。覆盖 REQ-008/009/010 基础、REQ-001 新建前置和 LEARN-001，完整需求仍未通过。

| 命令 / 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| `check:domain` / JSON/引用/数值/DAG | 合法往返、非法拒绝、拓扑顺序可靠 | 共 15 项领域/事务测试通过；7 个 core 文件边界检查通过 | [汇总](learning/evidence/T-102-domain.json)、[日志](learning/evidence/T-102-domain.log) |
| 真实 CSG 矩形 20×20，深度 20→30→undo→redo | 8000→12000→8000→12000 mm³；误差≤1e-8 | 四态闭合，误差最大约 7.3e-12，feature ID 稳定 | [数值](learning/evidence/T-102-transaction-geometry.json) |
| 失败/晚到/保存快照/100 步/ID 防复用 | 文档/缓存/历史一致，旧结果不能提交 | 已有网格失败保持原样；新事务锁不被旧 finally 解开；100 步及 dirty 通过 | 同上测试日志 |
| `check:project` | 元数据命令与新建保护、快捷键焦点和视图重挂载正确 | 开发/生产/cad 全部通过；文字注入不执行；保存仍禁用 | [浏览器](learning/evidence/T-102-project-browser.json) |
| `check:workspace` 回归 | 启动/503/布局仍可用 | 三入口通过，历史 T-101 证据未覆盖 | [回归](learning/evidence/T-102-workspace-replay.json) |

`typecheck`/`build` 已通过；1280×720 界面截图实际查看，仅辅助排版。固定轴对齐矩形的实际 CSG 缓存用来验证事务，不宣称一般草图拉伸、所有约束、完整后代重算通过。schema 结构合法也不代表曲线等半径或轮廓闭合；这些需后续几何计算。

## T-103：坐标、真实视口与空草图

日期：2026-10-02。Windows x64 / Node 24.21.0 / npm 11.19.0 / Edge 154.0.4258.48 / Three 0.186.1 / DPR=2；实际 WebGL2 驱动 ANGLE / RTX 4070 Ti / D3D11。覆盖 REQ-001/002/003 的指定前置，不代表完整绘制/求解通过。

| 命令 / 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| `check:plane` / 三平面 12 点、平移旋转基与非法输入 | 往返≤1e-6 mm，法线遵守 PRD | 12 点误差0；2测试通过，离面/非法基拒绝 | [JSON](learning/evidence/T-103-plane.json)、[日志](learning/evidence/T-103-plane.log) |
| `check:viewport` / 点、线、圆、圆弧、真实 CSG 方块 | 领域ID正确，实体体积8000 mm³，误差≤1e-8 | 开发/root/cad全部通过；隐藏对象不能拾取 | [浏览器](learning/evidence/T-103-viewport-browser.json) |
| CSS resize、鼠标与模式 | 3比例+DPR2拾取正确；草图不旋转，退出恢复 | 精确CSS尺寸/ID；相机恢复≤1e-8；树双向联动 | 同上 |
| 真实 WEBGL_lose_context / 恢复 | 文档不变、画面与拾取恢复 | 三入口真实扩展通过；不是模拟context事件 | 同上 |
| getContext 强制null→解除→重试 | 明确错误/重试；项目ID不变 | 恢复一个真实canvas，ID保留 | 同上独立故障注入条目 |
| 20次模型重置/实际UI新建/重复dispose | 资源与回调不累计 | 8自有/GPU geometry、1canvas恒定；最终0资源/0canvas；UI空项目/历史清空 | 同上 |
| 领域/项目/工作区回归 | 原功能仍正确，历史证据保留 | 15领域、三入口项目/加载/503/布局通过；8core边界检查 | [领域](learning/evidence/T-103-domain-replay.json)、[项目](learning/evidence/T-103-project-replay.json)、[工作区](learning/evidence/T-103-workspace-replay.json) |

`typecheck`/`build` 通过，截图仅检查界面排版。初次DPR CSS尺寸放大与恢复时重新获取扩展null的问题已修复；近平行平面填充不参与拾取，三平面交点歧义用独立区域验证。空草图UI与非空显示夹具有明确区分；文件打开20次、长期堆、完整绘制/约束/预览清理未验证。普通生产包约688kB的Vite chunk提示没有隐藏，完整性能验收后续执行。

## T-104A：真实领域草图求解与Worker事务

日期：2026-10-02，环境沿用T-103；SolveSpace/WASM来源与产物没有变化，只增加自写adapter与专用Worker。T-104拆分A/B/C，整体未完成。

| 命令 / 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| `check:domain-solver` / 12个领域夹具 | 稳定ID、真实DOF、独立残差≤1e-5 | 矩形/圆/重合/相切DOF0；圆弧/删除宽/点距DOF1；自由圆DOF3；冲突无候选 | [Node](learning/evidence/T-104A-domain-solver.json) |
| 4个非法输入 | 原生前拒绝，不能假成功 | 未支持parallel、radius引用线、缺点、NaN拒绝 | 同上 |
| `check:domain-solver:browser` | 真实专用Worker与同源资源 | 开发/root/cad的12项通过，WASM200/MIME，503重试通过 | [浏览器](learning/evidence/T-104A-domain-browser.json) |
| 真实Worker原子事务 | 40→60→undo→redo；冲突不改文档/历史 | 三入口尺寸40/60/40/60，误差≤1e-5 mm；native冲突拒绝 | 同上transaction条目 |
| 原M0/领域/协议/工程/项目/视口回归 | 原功能仍通过，历史证据保留 | 8M0/重复负载、15领域、8协议、bootstrap、三入口项目与全视口通过 | [M0](learning/evidence/T-104A-m0-solver-replay.json)、[领域](learning/evidence/T-104A-domain-replay.json)、[项目](learning/evidence/T-104A-project-replay.json)、[视口](learning/evidence/T-104A-viewport-replay.json) |

Node与Worker都实际执行既有WASM；native错误输出为空。顺时针圆弧交换native首尾、按原ID回写；圆半径从真实独立参数读取。固有等半径与显式约束残差分别检查。原M0重放JSON内部保留T-003来源标签，文件名与本节说明其T-104A回归用途，不覆盖原始记录。

应用回调仅支持sketch-only，当前8种约束的指定子集，其他类型明确拒绝。空草图无方程不调用native；UI绘制仍禁用。markDragged仅是提示用例，未替代完整拖动/最新队列验证。全部非空草图暂一并求解，按受影响后代优化后续实现。typecheck/build通过，包约698kB的chunk提示继续保留。

## T-104B：实际绘制、8 CSS px捕捉与取消

环境沿用T-104A；WASM/依赖/许可未改变。T-104整体仍doing。

| 命令 / 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| `check:drawing` | 像素边界/闭合关系/非法输入、4工具×3平面真实求解 | 3单测+12native通过，残差≤1e-5，40×30矩形、r10圆 | [Node](learning/evidence/T-104B-drawing-node.json)、[日志](learning/evidence/T-104B-drawing.log) |
| `check:drawing:browser` | 真鼠标7px显式捕捉、连续线、三点圆弧、历史和重编辑 | 开发/root/cad各三平面通过；共线/预览Esc保持文档 | [浏览器](learning/evidence/T-104B-drawing-browser.json) |
| 冷native加载中Esc | 候选不提交，新Worker可恢复 | 文档精确不变，重新绘制成功 | 同上cancel-native-load |
| `check:domain` | 取消后旧回复不覆盖新事务 | 16项通过、10core边界；真实CSG事务原夹具仍通过 | [领域](learning/evidence/T-104B-domain-replay.json)、[缓存事务](learning/evidence/T-104B-transaction-replay.json) |
| 视口/项目/布局回归 | 旧功能仍正确；8px不随zoom变化 | 3zoom×7.99/8/8.01px、真实WebGL/资源、新建/快捷键/503/布局三入口通过 | [视口](learning/evidence/T-104B-viewport-replay.json)、[项目](learning/evidence/T-104B-project-replay.json)、[工作区](learning/evidence/T-104B-workspace-replay.json) |

`typecheck/build`通过，生产包约709kB chunk提示保留；截图已查看，仅作布局检查。捕捉圆中心/圆弧端点，不为构造输入伪造持久关系。T-104C继续拖点与实体删除，B不代表完整REQ-004通过。

## T-104C：最新手势、一条历史与实体删除

环境沿用T-104B；真实WASM未改变，M1完成。结合A/B证据，REQ-004/AC-004-1—4通过。

| 命令 / 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| `check:sketch-edit` | 最新槽/迟到拒绝/取消/失败/共享点清理 | 7测试通过；控制回复只证明调度 | [日志](learning/evidence/T-104C-edit.log) |
| 3平面30输入矩形真实求解 | (40,30)→(50,35)，一手势一历史 | 各2次求解/1预览/1历史，undo redo精确 | [Node](learning/evidence/T-104C-edit-node.json) |
| 固定宽高/圆心/圆弧/退化手势/删除 | 约束残差≤1e-5、失败不改权威数据 | DOF0保持40×30；圆心(65,5)r10；圆弧等半径残差0；退化/失败历史不变，删除3实体/6点 | 同上 |
| `check:sketch-edit:browser` | 实际预览与坐标显示、一次revision、删除/取消 | 三入口各3平面通过；每Worker最多1在途，undo redo精确，7/9px捕捉、5非法输入、文本焦点/多实体删除通过 | [浏览器](learning/evidence/T-104C-edit-browser.json) |
| 拦住真实预览WASM加载 | Esc/退出/新建拒绝旧手势，显式恢复 | 三路径通过；Esc后新真实Worker成功 | 同上cold条目 |
| 原功能回归 | 历史证据保留、原行为通过 | 16领域/11core、12native/4拒绝/三入口MIME503、12绘制native与实际绘制、全视口/项目/工作区通过 | [领域](learning/evidence/T-104C-domain-replay.json)、[原生](learning/evidence/T-104C-domain-solver-replay.json)、[求解浏览器](learning/evidence/T-104C-domain-browser-replay.json)、[绘制](learning/evidence/T-104C-drawing-browser-replay.json)、[视口](learning/evidence/T-104C-viewport-replay.json)、[项目](learning/evidence/T-104C-project-replay.json)、[工作区](learning/evidence/T-104C-workspace-replay.json) |

圆弧目标(-12,3)，实际约(-11.998837409,2.999709352)，偏差0.001198371mm；markDragged是软优先，约束残差标准未改变。初次观察器事件监听顺序误计在途2，修正后1；初次数值展示断言错误要求精确目标50，修正为核对真实领域显示与1e-5容差。代码没有伪造坐标。截图已查看，仅作排版；typecheck/build通过，约720kB chunk提示保留。

## T-201A：方向、角度与相等

环境沿用T-104C；使用现有WASM导出，未修改产物/依赖。整体T-201与REQ-005未完成。

| 命令 / 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| `check:linear-constraints` | parallel/perpendicular/angle/equal真实结果与独立残差 | 12项通过；30/60/120/170度含反向；角度≤1e-5rad，长度/半径≤1e-5mm | [Node](learning/evidence/T-201A-linear-native.json) |
| 8非法输入 | 类型/单位/边界/同对象在native前拒绝 | 全通过，无原生错误 | 同上 |
| 角度事务 | 60→120→undo→redo真实变化，冲突拒绝 | 按每个快照端点计算实际角度，精确历史/失败不变 | 同上transaction |
| `check:linear-constraints:browser` | 真实Worker、三入口/资源/恢复 | 各12项及事务，WASM200/MIME、503后12项通过 | [浏览器](learning/evidence/T-201A-linear-browser.json) |
| 原领域/native/编辑/工程回归 | 原操作仍正确，历史证据保留 | 16领域/11core、12native/4拒绝、7编辑+真实三平面、bootstrap/typecheck/build通过 | [领域](learning/evidence/T-201A-domain-replay.json)、[原生](learning/evidence/T-201A-domain-solver-replay.json)、[编辑](learning/evidence/T-201A-edit-replay-node.json) |

普通包约726kB，chunk提示保留。equal线/曲线弧长组合因PRD范围拒绝；圆半径可被求解改变，夹具仅排除该可变数字后比较稳定定义。相切仍限旧子集；极接近0/π角度和病态尺度未完整验收。下一T-201B全相切、T-201C面板。

## 尚未执行

通用轮廓分类/自交/曲线、完整布尔/导出 UI；一般后代重算；完整 CAD 实体操作；文件保存/打开/恢复；三浏览器；完整性能与长期资源生命周期。

M0 gate 已通过；REQ-004 四项 AC 已有实际证据；本记录仍不代表全部 P0、MVP 或完整 E2E 已通过。

## T-201B1：相切辅助接触点原生前置

`npm run check:tangent-primitives`在Node24.21.0真实既有WASM中执行6组输入；4组接触表达和2个范围反例通过，位置/半径误差≤1e-5mm，native错误0。实际坐标/DOF/返回码见[证据](learning/evidence/T-201B1-tangent-primitives.json)。原生码4确为冗余成功；未连接半径参数从最终弧夹具移除。

范围反例t=4与弧角3π/2>π/2证明支撑曲线成功不能代表有限线段/弧相切。生产adapter仍限旧相切子集；领域集成/全组合/Worker/失败事务待T-201B2。T-201B1不代表完整相切或REQ-005通过。

## T-201B2：全部相切家族与有限范围

Node24.21.0/npm11.19.0、Windows、Edge154.0.4258.48；既有固定WASM不变。T-201B完成，完整REQ-005待C。

| 命令 / 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| check:tangency | 17组合×三平面，独立接触/稳定ID | 51通过；线圆/线弧/圆圆/圆弧/弧弧，内外切/顺逆/反向 | [Node](learning/evidence/T-201B2-tangency-native.json) |
| 范围与非法对象 | 支撑曲线可解但范围无效必须拒绝 | 3范围、5原生前拒绝；4边界单测通过 | [日志](learning/evidence/T-201B2-tangency.log) |
| 实际历史/冲突 | 圆心距18→22→18→22mm，失败不变 | 精确undo/redo；3失败文档/历史/revision不变；辅助失败为领域ID | Node transaction/conflict |
| check:tangency:browser | 三入口真实Worker/MIME/503 | 各51及事务通过；几何拒绝后一次模块加载，503显式恢复 | [浏览器](learning/evidence/T-201B2-tangency-browser.json) |
| 原领域/native/编辑/方向/协议 | 历史证据保留，回归通过 | 16领域/12core、12native/4拒绝、7编辑/三平面、12方向/8拒绝、9协议通过 | [领域](learning/evidence/T-201B2-domain-replay.json)、[原生](learning/evidence/T-201B2-domain-solver-replay.json)、[编辑](learning/evidence/T-201B2-edit-replay-node.json)、[方向](learning/evidence/T-201B2-linear-replay.json)、[协议](learning/evidence/T-201B2-worker-replay.json) |

build/typecheck通过，主包736.06kB提示保留；截图已查看仅作排版。首轮实验夹具复用了circle ID为arc，角色校验正确拒绝；修正为新ID再验证范围事务。共心初值先移动；极限尺度/任意分支切换未穷尽。所有候选强制有限范围/残差。完整面板、三浏览器、性能与用户掌握未验收。

## T-201C1：真实诊断与文档同历史

check:diagnostics的5真实Node管线测试通过；实际DOF0→删除宽1→固定点0、精确undo/redo、元数据保留、失败/取消/空/重置一致性、4损坏诊断拒绝见 [证据](learning/evidence/T-201C1-diagnostics.json)。受控promise只延迟真实WASM结果。

开发/root/cad真实Worker事务DOF1/0/1/0、冗余码4的h-bottom、冲突诊断不变与503恢复通过，见 [浏览器](learning/evidence/T-201C1-worker-browser.json)。失败ID和成功冗余ID按原生状态分开；诊断不写项目JSON。

Node24.21.0/npm11.19.0/Edge154.0.4258.48；16领域/12core、12native/4拒绝、build/typecheck通过。主包738.71kB提示保留。C1不含面板/标注，完整REQ-005仍待C2。

## T-201C2：完整约束面板与REQ-005验收

Windows/Node24.21.0/npm11.19.0、Edge154.0.4258.48；WASM/依赖不变。T-201完成，REQ-005指定六项AC通过，完整MVP未完成。

| 验收 | 输入与期望 | 实际结果 | 证据 |
| --- | --- | --- | --- |
| AC-005-1 | 固定矩形40×30，拖动后保持 | 三入口×三平面native DOF0、几何精确保留且不增历史 | [面板](learning/evidence/T-201C2-constraints-browser.json) planes |
| AC-005-2 | 宽40→60，几何/标注同步 | 60×30mm，L60.000mm；undo/redo恢复 | 同上 |
| AC-005-3 | 已有宽60再加50冲突，拒绝且旧数据不变 | inconsistent；文档/诊断/revision不变；Node验证历史/序列化保存字节也不变 | 同上；[诊断](learning/evidence/T-201C1-diagnostics.json) |
| AC-005-4 | 删宽后自由移动，再固定点 | DOF0→1→0，自由宽约65.000003242mm，高30；固定X改70mm | 面板planes |
| AC-005-5 | 全12类成功/非法对象及独立残差 | Node12真实/12非法、面板全12；长度≤1e-5mm、方向≤1e-5rad；完整相切家族由B2验证 | [Node](learning/evidence/T-201C2-constraint-native.json)、面板types/illegalKinds；[相切](learning/evidence/T-201B2-tangency-native.json) |
| AC-005-6 | 最新输入/旧回复/退出/新项目隔离 | 7调度与9协议回归；实际三入口每Worker最多1在途，Esc/退出/新建冷WASM取消及恢复通过 | [编辑](learning/evidence/T-201C2-edit-replay-node.json)、[协议](learning/evidence/T-201C2-worker-replay.json)、[手势浏览器](learning/evidence/T-201C2-edit-browser-replay.json) |

角60→120度和R12→14mm的实际面板编辑/标注通过，非法表单不改变提交。16领域/13core边界、7编辑与三平面真实native、9协议通过；build/typecheck通过，主包约750kB提示保留。面板截图已查看，只作排版。标注DOM需等待渲染帧，不把revision事件当渲染完成。

文件按钮仍禁用，保存内容不变指权威文档序列化实验；一般轮廓、通用后代、文件、最终三浏览器/性能未完成。共心初值需先移动，极限尺度/任意分支切换未穷尽；逐候选残差/有限范围检查不放宽。

## T-202A：曲线边界前置

Windows/Node24.21.0/npm11.19.0，WASM未变。`check:curves`六测试含9个真实三平面圆/弧、三尺度、端点/容量/9非法边界通过。R10000实测994段、弦误差0.04994552924mm；R0.001/10均72段，步进≤5°（角浮点1e-12rad、大半径弦浮点1e-9mm）。解析极值检查防止采样间越界。见 [曲线证据](learning/evidence/T-202A-curves.json) 与 [学习笔记](learning/notes/L-008C-curve-sampling.md)。

16领域/14core边界与build/typecheck通过。主包750.05kB提示保留。未执行浏览器实验；视口近似未替换；闭合/自交/孔洞/一般拉伸均未验收，不把A标成完整REQ-006。

## T-202B：一般轮廓core

`check:regions`十测试通过：6三平面反向/乱序直边孔净1100mm²，18圆/双方向弧/共圆半弧/透镜闭环解析面积误差≤1e-10mm²、折线最大相对误差0.2454533%；嵌套岛/多外环须选择；6拓扑/8接触反例、1e-6mm闭合/传递链、默认精度拒绝及收紧精度、324独立解析包含点/大坐标凹环净564mm²通过。见 [证据](learning/evidence/T-202B-regions.json) / [学习](learning/notes/L-008A-sketch-regions.md)。

Windows/Node24.21.0/npm11.19.0，WASM未变；16领域/16core边界、build/typecheck通过，既有750.05kB主包提示保留。无浏览器实验；区域选择只core API、全实体参与，无构造线模式；默认精度过窄区域明确拒绝。完整REQ-006/零深度/网格/UI仍待C。

## T-202C1：一般拉伸adapter与Worker

`check:extrusion`60成功/10拒绝/7额外边界通过；9形状×三平面×±10，加平移斜平面和±0.01/±10000。矩形12000、孔10999.999999999998mm³；曲线最大相对体积误差0.2454533%（≤1%）；夹具bounds≤1e-6mm、焊接1e-6mm，闭合/非流形/退化/方向失败全0，孔壁径向朝内。共线环简化后32三角闭合；R10000为994段/3972三角、体积314157173.2479807mm³。解析极值10000.01而采样顶点9999.98仍拒绝。见 [Node](learning/evidence/T-202C1-extrusion-node.json) / [学习](learning/notes/L-008D-general-extrusion.md)。

`check:extrusion:browser`开发/root/cad各60+10通过，实际DocumentSolver+Solid Worker、一次WASM/MIME、拒绝后恢复、持续503（3请求）后明确错误/手动重试通过，见 [浏览器](learning/evidence/T-202C1-extrusion-browser.json)。Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48，Three0.186.1/Earcut3.0.2，依赖/二进制未变。旧19solid/16STL/2非流形拒绝、9协议、16领域/16core边界、build/typecheck通过。主包770.44kB（cad878.32kB）提示保留。

只是adapter/数值入口：工作区拉伸按钮仍禁用，区域选择/预览/取消/事务与完整REQ-006尚待C2；最终三浏览器/性能未验收。

## T-202C2a：真实原子管线与最新预览前置

`check:extrusion-transactions`7/7通过，真实WASM+double网格：体积12000/18000/36000mm³（≤1e-6mm³）、−20深度z范围[−20,0]、文档/缓存/诊断精确undo/redo，三失败候选连同历史/revision/保存字节不变；30输入→深度1/30两请求→有效30预览→一历史；取消/改名/新项目/迟到缓存拒绝；非法0清除旧成功并恢复−10；受控端口执行真实内核，取消旧提交后新20预览与24000mm³提交成功，旧finally不终止新客户端。见 [事务](learning/evidence/T-202C2a-transactions.json) / [学习](learning/notes/L-007E-extrusion-preview.md)。

16领域/16core、build/typecheck通过；三入口全约束面板与三平面编辑/冷WASM Esc/退出/新项目回归通过，见 [约束](learning/evidence/T-202C2a-constraints-browser-replay.json) / [手势](learning/evidence/T-202C2a-edit-browser-replay.json)。Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48，依赖/二进制不变，主包774.65kB提示保留。

已接ProjectSession全量Sketch→Extrude重算；Boolean和受影响分支优化未交付。预览服务普通DTO，不是临时GPU预览UI；工作区拉伸仍禁用，完整REQ-006待C2b。

## T-202C2b：工作区与完整REQ-006

T-202 A/B/C共同完成REQ-006五项AC。Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；依赖/WASM/CSG未变。`check:extrusion-ui:browser`三入口全部通过，见 [UI证据](learning/evidence/T-202C2b-ui-browser.json) / [学习](learning/notes/L-008E-extrusion-ui.md)。

| 验收 | 输入/期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| AC-006-1 | 40×30×10，12000mm³/bounds | 三入口×三平面真实绘制/预览/确认，体积≤1e-6mm³/bbox≤1e-6mm | UI planes；C1 cases |
| AC-006-2 | −10反法线，闭合/外向 | 实际负预览/确认，signedVolume>0、winding=0；C1 cap/side/hole normals均0失败 | UI finalNegative；[C1](learning/evidence/T-202C1-extrusion-node.json) |
| AC-006-3 | 开放/自交/相切/相交孔/0拒绝 | 三入口四轮廓明确错误，0预览清旧成功/禁确认，文档/revision精确不变；解析孔接触边界见B | UI refusals/zeroRefused；[B](learning/evidence/T-202B-regions.json) |
| AC-006-4 | 40×30含10×10孔，11000mm³ | 三入口实际绘制/贯穿孔/预览/确认；保存来源holeEntityIds | UI regions.hole；C1 |
| AC-006-5 | 三平面world bounds | XY40×30×10、XZ40×10×30（+深度向−Y）、YZ10×40×30；C1正负都通过 | UI planes.expectedBounds；C1 |

圆1000π/半圆500π体积误差≤1%；多区域无自动选择，选择1200mm²后确认12000mm³；取消对象1→0/取消本身销毁资源，undo/redo精确、单确认1revision。生产冷solid Worker加载中preview Esc、commit Esc、新项目均取消无旧写入，前两种恢复成功。截图已查看只验排版，几何靠数字。

`check:viewport`真实拾取/控制/context恢复/20重建与三入口回归；16领域/16core边界、build/typecheck通过。主包约781kB/cad实测890.18kB提示保留，未做最终性能验收。当前Sketch/Extrude全量重算；Boolean/分支优化/文件/STL和最终三浏览器/MVP未完成。默认精度狭小区域明确拒绝，暂无构造线模式。

## T-203：来源参数与实体历史回归

Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48，固定WASM与依赖未改。[Node证据](learning/evidence/T-203-parameter-history.json)四测试、21三平面参数夹具及真实晚后代失败通过；[UI证据](learning/evidence/T-203-parameters-browser.json)三入口各8流程通过，详见[L-010C](learning/notes/L-010C-parameter-history.md)。

| 检查 | 输入/期望 | 实际 | 证据范围 |
| --- | --- | --- | --- |
| 矩形 | 宽40→60，深±10，12000→18000 | 体积误差≤1e-6mm³，来源ID不变 | Node三平面±；UI三平面XZ负 |
| 孔 | 外宽60、孔宽20，11000→17000→16000 | 三入口三平面通过，孔来源保留 | Node/UI hole |
| 曲线 | R10→12，圆1440π、半圆720π | 4518.153704039/2259.076852019，约0.127%误差，闭合外向 | Node三平面±；UI实际表单 |
| 原子失败 | 矛盾尺寸/孔穿过外边界/删除来源 | 文档/诊断/revision/history与旧缓存不变 | UI失败；Node引用拒绝 |
| 晚后代失败 | 平面Z=1，10深先成功、10000深越界 | 实际前代12000mm³/Z=[1,11]被整体丢弃；保留redo/save bytes | Node late-descendant |
| 历史 | 修改一次，撤销与重做一致 | 文档/缓存/诊断精确恢复，保存快照dirty正确 | Node/UI exact history |

T-203/M2完成；覆盖REQ-009尺寸/拉伸AC-009-1/3及REQ-008/AC-008-3的Sketch→Extrude部分。完整布尔后代/所有命令/100步历史、文件UI/三浏览器/性能仍未验收。

## T-301A：真实网格布尔与特征管线

[Node五测试](learning/evidence/T-301A-mesh-booleans.json)与[三入口Worker](learning/evidence/T-301A-mesh-booleans-browser.json)通过：三平面标准12、分离/面接触/重合9、矩形与圆形贯穿切除2，共23真实网格夹具；empty/NaN/open/reversed/capacity/unknown operation/边与点非流形共8拒绝。WASM一次200/MIME、冷solid Worker503后完整恢复。来源均由真实native草图和拉伸生成，非bbox重建。

原子隐藏同一历史、精确undo/redo、来源宽20→25三类布尔12000/4000/6000、empty来源变化后4000、失败和晚取消不写文档/缓存/隐藏通过。直边体积相对1e-4、曲线1%、bbox4e-4mm、焊接1e-6mm。详见[L-009C](learning/notes/L-009C-world-mesh-boolean.md)。

16领域/16core、19M0几何/16STL/2非流形兼容回归、build/typecheck/docs通过。固定WASM/vendor/依赖未改。完整REQ-007工作区A/B与empty/错误恢复仍待B；每操作数2000输入三角面、桥2000唯一输出顶点，全DAG重算；主包785.96kB，最终性能未验收。

## T-301B：工作区与完整REQ-007

Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；固定依赖/WASM/CSG未改。[实际UI证据](learning/evidence/T-301B-boolean-ui-browser.json)/[学习](learning/notes/L-009D-boolean-ui.md)：三入口三平面各四操作、来源参数重算和精确历史，empty与失败/恢复；生产三种扣留真实12000网格回包后取消/新项目通过。

| 验收 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| AC-007-1 | 并12000、差4000、交4000 | 三入口三平面闭合体积通过 | planes.cases |
| AC-007-2 | A-B/B-A空间正确 | 交换来源ID正确，沿u bbox[0,10]/[20,30] | cases swap/bounds |
| AC-007-3 | 分离交集empty | 零三角形/bounds=null、明确文案；排除操作数 | boundary.empty |
| AC-007-4 | 失败保留已有数据 | 非流形union失败/revision与可见性不变，差集恢复8000 | boundary.failure |
| AC-007-5 | 默认隐藏且可编辑/撤销/保存定义 | 一次历史隐藏A/B，精确undo/redo，来源宽25交集6000；序列化隐藏见A | planes / A Node |

REQ-007与T-301 done；体积/bbox1e-6、文档/网格指标精确比较。三入口拾取/控制/context/20重建、16领域/16core、build/typecheck/docs通过。已查看面板排版截图，几何判断来自数值。全DAG重算/容量边界、分支优化与级联/完整REQ-008/009、文件/最终三浏览器与性能/MVP仍未验收。

## T-302A：受影响DAG与不可变基线

[五真实Node测试](learning/evidence/T-302A-affected-recompute.json)：A宽20→25只1native/1拉伸/2布尔，体积10000/6000/14000，B/C缓存和诊断精确复用；深度3网格/0native、新布尔1CSG、元数据/键序与级联0内核调用。冷重建与缺诊断各3native恢复相同文档/缓存/诊断；baseline冻结，较晚Boolean拒绝empty时保留全部旧状态及redo/save bytes。

[三入口实际Worker计数与UI回归](learning/evidence/T-302A-boolean-ui-replay.json)每入口×三平面参数修改恰好solve A/extrude A/intersect三个请求，交集6000稳定ID；实际empty/失败/来源隐藏与历史、晚回包Esc/按钮/new取消回归通过。7预览/4参数/5布尔/16领域、17纯core以及build/typecheck/docs通过。详见[L-010D](learning/notes/L-010D-affected-recompute.md)。

T-302A done，整体T-302/REQ-008未完成；级联影响列表/确认和现有拉伸参数编辑继续B。CSG容量不变，主包792.01kB/cad902.45kB提示保留；仅实际调用计数，最终三浏览器/性能未执行。

## T-302B：已有拉伸参数与显式级联

Windows/PowerShell7.6/Node24.21.0/npm11.19.0/Edge154.0.4258.48；锁文件、WASM、CSG未改。[真实UI](learning/evidence/T-302B-feature-edit-browser.json)/[学习](learning/notes/L-010E-feature-edit-and-cascade.md)三入口三平面通过，实际网格闭合/方向正确，直边体积容差1e-6mm³。

| 验收 | 输入/期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| AC-008-1 | 宽40→60，拉伸12000→18000/差6000→12000 | 稳定ID，仅solve A/extrude A/subtract三请求 | UI planes.widthRequests |
| 已有参数 | 深度20差30000/-10差18000；区域4000→1000 | 深度仅2网格/区域仅1拉伸，精确历史 | UI planes/region |
| AC-008-2 | 先列完整后代，默认取消；明确级联 | Enter/Esc/按钮不改权威，确认一次revision；无关B与缓存指标一致 | UI cascade |
| AC-008-3 | 较晚union拒绝empty，不提交前代 | 全部旧文档/网格指标/revision/history保留，有效编辑恢复3000 | UI failure / Node完整缓存 |
| AC-008-4 | 元数据不重算，拒绝DAG错误 | 名称/显示/级联0请求，领域循环/悬空引用拒绝 | UI cascade / 领域回归 |
| AC-008-5 | 历史草图继续编辑 | 真实尺寸40→60，不重建来源/后代ID | UI planes |
| 取消/错误 | 0/空/NaN/草稿取消；实际晚结果 | 无成功命令；扣留实际8000回包后Esc/按钮均拒收并恢复 | UI planes/cancellations |
| 排版/构建 | 1280/1024属性和模态框可用 | 已查看截图；1024控件无横向溢出；typecheck/build通过 | UI region.narrowLayout |

[五真实Node回归](learning/evidence/T-302B-affected-recompute-replay.json)、[16领域/17纯core](learning/evidence/T-302B-domain-replay.json)/[事务](learning/evidence/T-302B-transaction-replay.json)、[标准布尔三入口三平面与实际晚取消](learning/evidence/T-302B-boolean-ui-replay.json)通过。首次恢复断言漏加C的1000mm³，修正期望3000并完整重跑通过。

T-302/REQ-008五AC完成；ADR-033明确E2E-02阶段边界，文件往返和完整场景仍未执行，REQ-009全命令/100步、STL、最终三浏览器/性能/MVP待后续。主包797.83kB/cad909.51kB警告保留。当前按用户要求完成子任务后暂停，下一T-303。

## T-R01：审查修复与真实交互回归

Windows x64/PowerShell7.6/Node24.21.0/npm11.19.0/Edge154.0.4258.48；[学习](learning/notes/L-007F-interaction-lifetime.md)。`npm run check:interaction:browser`的[证据](learning/evidence/T-R01-interaction-browser.json)开发/root/cad通过：真实25mm回复扣留期间标注平移/缩放，选择/绘制禁用、草图旋转锁定；Esc保留文档/revision，重试恢复5000mm³。

12mm预览折叠保留草稿、零请求重发；实际4800mm³回复在隐藏期间释放，只新增一个拉伸/一个revision，退出预览，文档精确undo/redo。隐藏Esc拒收真实4000mm³旧回复，新提交恢复。直边体积容差1e-6mm³、长度1e-5mm、标注屏幕移动阈值1 CSS px；不用截图代替几何证据。

`npm run check:viewport`的[回放](learning/evidence/T-R01-viewport-replay.json)三入口验证WebGL恢复后独立开关，可只开启导航并继续拒绝拾取；原拾取/相机/20次资源重建通过。`node --test tests/extrusion-transactions.test.mjs tests/workspace-state.test.mjs`共11测试通过，其中[7真实事务证据](learning/evidence/T-R01-extrusion-transactions.json)保留T-202C2a夹具来源。typecheck/build/check:docs/diff通过。

首轮新测试拦截器误扣启动检查，限定类型后完整三入口重跑通过。root798.55kB/cad910.31kB警告保留，依赖/内核/容量未改。T-R01 done，T-303继续暂停；没有新增最终三浏览器、文件、STL或性能验收结论。

## T-303：全命令、混合100步与保存标记

Windows x64/PowerShell7.6/Node24.21.0/npm11.19.0/Edge154.0.4258.48；用户2026-10-03明确恢复连续任务。[学习](learning/notes/L-010F-complete-history.md)、[四真实Node集成](learning/evidence/T-303-history-node.json)、[三入口UI](learning/evidence/T-303-history-browser.json)。

| 验收 | 输入/期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| AC-009-1 | 四绘制工具、约束加删/尺寸、删除、拉伸、布尔、名称、显隐、级联可往返 | 全部文档/网格/诊断恢复；30输入只1命令，取消无记录 | Node all-command-families / UI operations |
| 100步容量 | 105混合含35真实深度，只保留最新100 | Node/三入口回到步骤5，正反200次完整数据比较通过，恢复0内核/Worker调用 | Node 100-complete-snapshots / UI capacity |
| AC-009-2 | 保存快照dirty、redo分支、延迟保存正确 | dirty按内容恢复而revision递增；无变化/失败保留redo，成功分支清空；旧session/伪造token拒绝 | Node saved-fingerprint-and-branch / UI pending |
| AC-009-3 | 文档与实际几何/诊断同一历史 | Node完整缓存/诊断精确比较；UI实际指标/可见诊断精确比较 | 全部操作与容量 |
| AC-009-4 | busy撤销入口禁用，无部分提交 | Node40次busy拒绝，实际12000/4000扣留后取消；UI三入口实际24000、20次快捷键无提交，取消保留redo并恢复 | Node busy-undo-and-real-late-reply / UI pending |

`check:domain`[16领域/17纯core](learning/evidence/T-303-domain-replay.json)/[既有事务](learning/evidence/T-303-transaction-replay.json)、typecheck/build通过。首轮fixture导出名与鼠标长度/体积容差已纠正，完整检查重跑通过；长度1e-5mm，解析体积1e-6mm³，快照精确比较。root798.55kB/cad910.31kB警告保留，固定依赖/WASM/CSG未改。

T-303/REQ-009四AC与M3完成。保存fingerprint通过不代表实际文件保存；文件/完整E2E-02、工作区STL、最终三浏览器与性能继续T-401—403，学习复述未记录。

## T-401A：JSON契约与原子打开基础

Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；[学习](learning/notes/L-011A1-atomic-file-load.md)、[五真实Node](learning/evidence/T-401A-project-files-node.json)、[三入口生产Session/Worker](learning/evidence/T-401A-project-files-browser.json)。文件数据只含领域和view DTO；打开不复用旧baseline，成功才换session/空历史/clean，失败保留原文档/完整缓存/诊断/redo/save bytes。

| 检查 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| 三平面文件冷建 | ID/参数/显隐/view、8000/8000/4000 | 2native/2拉伸/1CSG，完整文档/缓存/诊断精确重建；继续深30得12000 | Node three-plane-json-rebuild |
| 孔/圆 | 11000 / 1000πmm³ | 10999.999999999998 / 3137.606738915698，曲线误差<1% | Node hole-and-circle-json-rebuild |
| 非法文件/结果 | 版本/JSON/引用/循环/非有限/未知缓存/容量与坏结果拒绝 | 7文件+4重建坏结果拒绝，原session/revision/history/save bytes不变 | Node invalid-file-and-rebuild-results |
| 容量 | 10MiB边界接受，超过拒绝 | 恰好10MiB解析；12049734字节输出拒绝 | 同上 |
| 晚失败/取消 | 重建前代成功仍不能部分提交 | 晚union拒绝empty；实际4000扣留取消/新打开/new，旧finally不清新busy | Node late-actual-geometry-failure / cancelled-and-newer-openings |
| 服务/Worker | loading旧文档→完成新文档，继续编辑/历史/错误恢复 | 开发/root/cad探针通过，旧save token拒绝，晚失败保留当前项目 | Browser results |

[四历史回归](learning/evidence/T-401A-history-replay.json)、[16领域/17core](learning/evidence/T-401A-domain-replay.json)/[事务](learning/evidence/T-401A-transaction-replay.json)、typecheck/build通过，主包800.19kB警告保留。测试期望首次误写拓扑层次顺序及FEATURE_CYCLE错误码，校正后完整重跑，生产算法和错误码未改。锁文件/真实内核未更新。

T-401A done，T-401/REQ-010尚未完整验收。浏览器探针不是产品文件UI；相机只验证DTO。实际文件选择/下载/相机运行时待B，IndexedDB/恢复/配额失败待C；完整E2E-02与最终浏览器/性能尚未验收，复述未记录。

## T-401B：标准文件UI与相机

Windows/Node24.21.0/Edge154.0.4258.48；[学习](learning/notes/L-011A2-browser-files-and-camera.md)、[相机Node](learning/evidence/T-401B-project-view-node.json)、[真实文件UI](learning/evidence/T-401B-file-ui-browser.json)。开发/root/cad各三平面实际File/Blob下载、再打开、文件DTO投影并真实拾取join通过；8000/8000/4000恢复，继续宽25得到10000/6000mm³并可撤销重做。体积1e-6mm³，领域/网格指标精确比較。

5非法文件拒绝、读取/下载失败、读取消、Enter默认取消和实际8000晚回包拒收均保留当前权威/history/revision；安全名称无HTML执行。文本框Ctrl+S真实下载、未确认dirty、确认后新建与dirty离页提示通过。三Node验证busy提交保留最新view、相机无几何历史/revision与5非法view拒绝。

四历史、16领域/17core、项目/工作区/交互/视口恢复三入口回归和typecheck/build/docs通过。旧保存禁用断言随实现更新；中键浏览器默认接管已修复。root806.88kB构建警告保留。B done，整体T-401 doing，自动恢复AC-010-4/5待C；完整REQ-010/E2E-02、STL/三浏览器/性能未验收，用户复述未记录。
