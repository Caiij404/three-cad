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

## 尚未执行

通用轮廓分类/自交/曲线、完整布尔/导出 UI；一般后代重算；其余 P0 约束和完整 CAD 操作；文件保存/打开/恢复；三浏览器；完整性能与长期资源生命周期。

M0 gate 已通过；REQ-004 四项 AC 已有实际证据；本记录仍不代表全部 P0、MVP 或完整 E2E 已通过。
