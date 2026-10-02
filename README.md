# Three CAD Vue

浏览器端参数化建模项目，参考 [twpride/three.cad](https://github.com/twpride/three.cad)，使用 Vue 3 实现界面。

## 当前状态

- 2026-10-03更新：连续执行已恢复，M3、T-401文件恢复、T-402单实体STL、T-403A/B/C1完成。E2E-01—05已有当前稳定三浏览器root/cad证据；真实大网格验证语义保持优化完成。T-403整体doing，下一C2完整场景性能/长期资源/全NFR汇总。M4/MVP仍未验收，下方暂停说明仅为历史。
- 项目目录：`D:\Fighting\Learn\three-cad-vue`
- 阶段：M0 gate 与 M1（T-101—104）已完成；T-201 全约束/面板/真实诊断已完成，REQ-005六项AC有证据，T-202轮廓/拉伸已完成，REQ-006五项AC有证据，T-203参数/曲线/孔洞历史回归已完成，M2完成，T-301A真实网格布尔/原子管线完成，T-301B工作区布尔完成，REQ-007五AC有证据，T-302A/B与REQ-008已完成，现有拉伸参数/级联确认及真实历史有证据；按用户要求完成本子任务后暂停，下一T-303。
- 开发方式：以辅助学习为主，逐个技术点讲解、实验、验证和复盘；实现仍按 M0—M4 的依赖推进。
- 技术方向：Vue 3、TypeScript、Vite、Pinia、Three.js、SolveSpace WASM、网格 CSG。
- 产品目标：在网页中完成草图、约束、拉伸、布尔运算、参数修改重算、保存及 STL 导出。
- 技术依据：[M0 实测矩阵](docs/TECH-SPIKE.md)；真实内核、Worker、子路径和恢复有证据，完整产品尚未实现。

## 文档入口

1. [需求文档 PRD](docs/PRD.md)：范围、需求编号、交互、数据约定、验收标准。
2. [技术决策](docs/DECISIONS.md)：Vue 替换边界、内核路线、已知事实和待验证事项。
3. [实施任务](docs/TASKS.md)：按依赖排列的里程碑、交付物与完成条件。
4. [Agent 工作约定](AGENTS.md)：后续 AI agent 的阅读与执行入口。
5. [学习入口](docs/learning/README.md)：学习路线、记录模板、进度和第一篇项目地图。
6. [上游来源](docs/UPSTREAM.md) / [第三方清单](docs/third-party/README.md)：固定版本、拟复用路径、已知接口问题与重建入口。
7. [验证记录](docs/VERIFICATION.md)：已执行检查及其实际边界。

## 如何开始学习

先读 [项目地图](docs/learning/notes/L-000-project-map.md)，用自己的话描述一次“改宽度”的数据流；再按 [学习路线](docs/learning/ROADMAP.md) 选择当前技术点。

已完成的第一个实验见 [L-001A：来源链与 Float32 精度](docs/learning/notes/L-001A-source-provenance.md)。可直接运行 `node scripts/probe-float32.mjs` 重做数值实验；源码审计还需要准备固定上游仓库。

当前工程实验见 [L-001B：Vue、TypeScript 与 Vite 的职责](docs/learning/notes/L-001B-vue-ts-vite.md)。从“技术实验”的计数器开始，观察开发模块与生产产物，再运行故意写错类型的独立样例。

每次开发只聚焦一个主要问题：先讲清为什么需要它，再做最小实验，记录实际结果，最后接回项目。学习状态在 [学习进度](docs/learning/PROGRESS.md) 维护，功能状态在 `docs/TASKS.md` 维护。

GitHub 仓库：[Caiij404/three-cad](https://github.com/Caiij404/three-cad)。本地目录与仓库名称不同是现有命名，不影响学习或运行。

## 运行最小工程

已验证环境：Windows x64、PowerShell 7.6、Node `24.21.0`、npm `11.19.0`。直接依赖与间接依赖均由 [package-lock.json](package-lock.json) 锁定；实际版本与来源见 [第三方清单](docs/third-party/README.md)。

当前机器的全局 Node `20.11.1` 低于 Vite 8 的要求。Windows 可以下载官方便携运行时，并只切换当前 PowerShell 会话：

```powershell
./scripts/setup-node.ps1
. ./scripts/use-node.ps1
npm.cmd ci
npm.cmd run dev
```

`setup-node.ps1` 首次下载时核对官方归档 SHA-256，运行时放在忽略的 `.research/runtime/`。已有相同版本 Node/npm 的机器可直接运行 npm；其他系统的安装流程本次未验证。

开发页默认地址为 `http://127.0.0.1:5173/`，显示 Vue/Pinia 工作区、真实 Three 视口并加载两个内核。支持项目重命名/新建/撤销/重做、三平面空草图的创建/编辑/退出/命名/隐藏/删除。选平面后点击“新建草图”；中键平移、右键旋转、滚轮缩放，草图模式锁定旋转。草图模式支持线段/连续线、矩形、圆、三点圆弧、8 CSS px 捕捉、精确坐标输入、Esc 取消与撤销。选择模式支持端点拖动、对象数值查看、Ctrl 多选实体和 Delete 删除；一次拖动一次撤销。约束面板支持12类约束的创建/改值/删除、真实DOF与尺寸标注；现有拉伸区域/深度可编辑，布尔及级联删除已启用；打开/保存/STL仍禁用。导航“技术实验”或 `?view=experiments` 保留 M0 数值实验。

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
```

`build` 先执行类型检查，再打包到 `dist/`。`preview` 默认端口为 `4173`，用于本地检查已构建产物；修改源码后需重新构建。

## 重做本次实验

```powershell
npm.cmd run learn:typecheck
npm.cmd run check:bootstrap
npm.cmd run record:toolchain
npm.cmd run check:docs
```

类型实验使用 `.research/typecheck-probe/` 内的错误样例，预期 `vue-tsc` 报 TS2345，而单独 Vite 打包成功。命令成功表示观察到了这组预期差异，主工程不含该类型错误。

浏览器检查使用本机已安装的 Edge，实际调用 Vite 开发服务与生产预览。若使用已安装的 Chrome，可先设置 `$env:BOOTSTRAP_BROWSER_CHANNEL = 'chrome'`；本次实测为 Edge，其他浏览器未计入验收。

工具来源记录会重读安装包与锁文件，并保留 Vue 的许可声明。证据保存在 [学习证据目录](docs/learning/evidence/T-002-bootstrap.json)，功能验收边界见 [验证记录](docs/VERIFICATION.md)。

## 项目关系

这是以 three.cad 为功能参考的新项目，不是官方 Vue 版本，也不承诺读取原版的项目文件。现在已引入从固定官方源码构建的 SolveSpace，项目采用 [GPL-3.0-or-later](LICENSE)，并保留 Vue、Eigen、mimalloc 和编译运行时的各自声明。未复制上游应用或旧 solver 二进制。

## 真实求解与重建

```powershell
npm.cmd run check:solver
npm.cmd run check:solver:browser
npm.cmd run check:solid
npm.cmd run check:solid:browser
npm.cmd run check:worker
npm.cmd run check:gate
```

前者执行真实 WASM 并独立计算残差；后者验证开发、生产、`/cad/` 的 Worker 与加载失败重试。实验与检查题见 [L-006A](docs/learning/notes/L-006A-wasm-worker.md) 和 [L-006B](docs/learning/notes/L-006B-constraint-evidence.md)。

仓库已包含本次自建的 ESM/WASM，运行前端无需 SDK。如需重建，按照 [构建来源](public/wasm/SOURCE.md) 使用 `setup-solver.ps1`、`build-solver.ps1` 和 `record:solver`；首次 SDK 安装需要 Python，具体来源与哈希见 [构建清单](docs/third-party/solver-build.json)。

几何实验见 [L-009A](docs/learning/notes/L-009A-solid-evidence.md)、[孔洞拉伸](docs/learning/notes/L-008B-hole-extrusion.md)、[STL 独立解析](docs/learning/notes/L-011B-stl-roundtrip.md)。19 项固定夹具与 16 个 STL 往返通过；边/顶点接触形成非流形时明确拒绝。草图、一般轮廓与工作区布尔已交付；文件与导出 UI 仍待后续开发。

共享 Worker 恢复见 [L-007A](docs/learning/notes/L-007A-worker-correlation.md)，技术 gate 与完整验收的区别见 [L-012A](docs/learning/notes/L-012A-m0-gate.md)。`check:gate` 包含三个真实 10 秒超时实验，约需半分钟。

工作区状态见 [L-003A](docs/learning/notes/L-003A-workspace-state.md)。`npm run check:workspace:state` 检查状态边界；`npm run check:workspace` 实测三入口加载/503 重试、面板折叠和 1280/1024/390 px 布局。Pinia 锁定 4.0.3，原声明随生产资源保留。

领域与事务见 [L-002A](docs/learning/notes/L-002A-domain-validation.md)、[L-010A](docs/learning/notes/L-010A-atomic-history.md)。`npm run check:domain` 实测 schema/DAG/历史/失败回滚及真实 CSG 缓存恢复；`npm run check:project` 验证三个入口的项目操作。受影响实体后代重算已完成，文件 UI 尚待后续。

视口学习见 [世界与像素](docs/learning/notes/L-004A-world-screen-picking.md)、[三平面坐标](docs/learning/notes/L-005A-plane-coordinates.md)、[资源生命周期](docs/learning/notes/L-004C-viewport-lifecycle.md)。`npm run check:plane` 保留 double 数值证据；`npm run check:viewport` 实测三个入口的拾取、控制、真实 WebGL 丢失/恢复、20 次新建和资源数量。大模型性能与其他浏览器仍待验收。

领域求解见 [L-006C](docs/learning/notes/L-006C-domain-solver.md)。运行 `npm run check:domain-solver` / `npm run check:domain-solver:browser`，或在“技术实验”点击“运行领域草图求解”，可重做12项真实矩形/圆/圆弧/重合/相切/距离/冲突与Worker事务实验。绘制已由 T-104B 接入；完整P0约束适配与面板已由T-201交付，非法对象明确拒绝。

屏幕捕捉见 [L-005B](docs/learning/notes/L-005B-screen-snapping.md)。`npm run check:drawing` 验证 3 项纯函数和 12 个真实三平面工具夹具；`npm run check:drawing:browser` 验证三入口绘制、显式重合、连续线、撤销/重做、非法圆弧和取消求解后的恢复。

拖动见 [L-007C](docs/learning/notes/L-007C-latest-drag.md)。`npm run check:sketch-edit` 验证最新队列、真实三平面拖动/约束维持/删除/失败回滚；`npm run check:sketch-edit:browser` 验证实际手势、数值查看、一个历史步骤、zoom 捕捉、快捷键焦点与冷加载时 Esc/退出/新建。

方向、角度和相等见 [L-006D](docs/learning/notes/L-006D-angle-and-equal.md)。`npm run check:linear-constraints` / `npm run check:linear-constraints:browser` 验证 12 项新增真实约束、8 项非法输入及角度 60°→120°→撤销/重做/冲突回滚；技术实验页可交互重做。

相切接触前置见 [L-006E](docs/learning/notes/L-006E-tangent-contact.md)。`npm run check:tangent-primitives`重做4实际接触表达与2范围反例；领域全组合见 [L-006F](docs/learning/notes/L-006F-domain-tangency.md)，`npm run check:tangency` / `npm run check:tangency:browser`重做51组合、范围拒绝与事务；T-201B完成，约束面板继续C。

真实DOF的一致性见 [L-007D](docs/learning/notes/L-007D-atomic-diagnostics.md)。`npm run check:diagnostics`重做原子诊断、DOF0/1/0、冗余成功、取消和失败；C1完成，面板与完整REQ-005继续C2。

面板学习见 [L-006G](docs/learning/notes/L-006G-constraint-panel.md)。`npm run check:constraint-edit` / `npm run check:constraints:browser`重做全部类型与三平面40→60mm、冲突回滚、删除宽/自由拖动/固定和标注。T-201完成，下一T-202轮廓。

一般拉伸数值实验见 [L-008D](docs/learning/notes/L-008D-general-extrusion.md)。`npm run check:extrusion` / `npm run check:extrusion:browser`验证三平面正负深度、直边孔、曲线、共线顶点、范围与方向；工作区预览/提交继续T-202C2。

工作区拉伸已启用：完成草图后选中它，点击“拉伸”，选择区域并输入有符号深度；确认加入特征，Esc取消。多个区域须显式选择，非法轮廓给出具体错误。学习与数值证据见 [L-008E](docs/learning/notes/L-008E-extrusion-ui.md)，`npm run check:extrusion-ui:browser`重做三入口实际流程。T-202/REQ-006完成，下一T-203参数/孔洞历史回归；布尔和文件仍禁用。

参数重算学习见 [L-010C](docs/learning/notes/L-010C-parameter-history.md)。`npm run check:parameters` / `npm run check:parameters:browser`重做矩形40→60、孔宽10→20、圆/半圆R10→12、后代失败整体回滚与精确历史。M2完成，下一T-301真实布尔；布尔/文件UI仍禁用。

真实网格布尔学习见 [L-009C](docs/learning/notes/L-009C-world-mesh-boolean.md)。技术实验页“运行真实网格布尔实验”及`check:mesh-booleans`/`check:mesh-booleans:browser`验证23夹具、8拒绝、empty、原子隐藏/历史与503恢复；工作区A/B入口已由T-301B交付。

工作区布尔见 [L-009D](docs/learning/notes/L-009D-boolean-ui.md)：两个非空实体可选择主体A/工具B、交换、并/差/交与确认；empty明确显示，Esc/取消/新建取消计算，成功默认隐藏输入，撤销同时恢复。`check:boolean-ui:browser`重做三入口三平面与真实晚Worker结果；下一T-302分支/级联，文件仍禁用。

受影响分支学习见 [L-010D](docs/learning/notes/L-010D-affected-recompute.md)，`check:affected-recompute`用实际native/mesh调用计数验证复用、冷重建、失败与历史；工作区三入口参数编辑仅发送来源求解/拉伸/后代布尔三个请求。下一T-302B影响列表/级联确认与现有拉伸参数编辑。

现有特征编辑和级联见 [L-010E](docs/learning/notes/L-010E-feature-edit-and-cascade.md)：选择拉伸可修改区域/有符号深度；删除被引用来源先列后代，默认取消，明确级联后一次提交和撤销。`check:feature-edit:browser`验证三入口三平面40→60、区域/深度、失败/晚取消与1024px排版。T-302/REQ-008完成，文件往返仍待T-401，完整E2E-02未验收；当前已按用户要求暂停，下次T-303。

审查修复T-R01见 [L-007F](docs/learning/notes/L-007F-interaction-lifetime.md)：折叠属性保留深度草稿和在途提交，计算中可平移/缩放并禁用对象编辑。`npm run check:interaction:browser`重做三入口真实晚回复、一次历史与隐藏取消；WebGL恢复由`check:viewport`回归。修复已交付，T-303继续暂停。

恢复后的全命令历史见[L-010F](docs/learning/notes/L-010F-complete-history.md)：`npm run check:history`执行四个真实集成测试，`npm run check:history:browser`在开发/root/cad操作全部命令及105次混合修改，最近100条精确撤销/重做、零恢复内核请求。REQ-009四AC已验证，保存token基础不等同真实文件保存；下一T-401。

文件契约和原子重建基础见[L-011A1](docs/learning/notes/L-011A1-atomic-file-load.md)：`npm run check:project-files`与`check:project-files:browser`验证真实冷重建/失败回滚、保存确认与继续编辑。T-401A done，整体T-401 doing；实际打开/保存按钮仍禁用，标准文件UI/运行时相机待B，IndexedDB恢复待C。

2026-10-03文件UI接续优先：T-401B完成，打开/保存和Ctrl+S可用，标准Blob下载由用户确认后标记该快照已保存；相机导航参与dirty而不进入几何历史。三入口三平面真实下载/重新打开/拾取/继续尺寸编辑、失败与晚取消证据见[L-011A2](docs/learning/notes/L-011A2-browser-files-and-camera.md)和`check:project-file-ui:browser`。下一T-401C恢复入口；完整REQ-010、E2E-02、STL和最终三浏览器/性能仍未验收。

最新恢复接续：T-401/REQ-010六AC完成，`check:project-recovery`与`check:project-recovery:browser`验证一秒防抖、真实IndexedDB刷新后显式恢复/放弃、配额/事务中止/不可用与手动下载、旧读取/晚回复和文件后级联历史。恢复副本不替代手动保存，恢复后的项目保持dirty；切换技术实验页面仍有未保存离页提示。见[L-011A3](docs/learning/notes/L-011A3-indexeddb-recovery.md)。下一T-402；T-403仍需从UI绘制开始复跑完整E2E-02及最终验收。

单实体导出接续：T-402/REQ-011三AC完成，`check:project-stl`覆盖36真实导出和非法/Float32精度拒绝，`check:project-stl:browser`在三入口读取54实际下载文件。选择一个非空实体后导出STL，按mm输出，文件本身不记录单位；导出不改变项目/历史/dirty。见[L-011B2](docs/learning/notes/L-011B2-selected-solid-stl.md)。完整端到端、最终三浏览器/性能和交付文档待T-403/404。
