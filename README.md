# Three CAD Vue

浏览器端参数化建模项目，参考 [twpride/three.cad](https://github.com/twpride/three.cad)，使用 Vue 3 实现界面。

## 当前状态

- 项目目录：`D:\Fighting\Learn\three-cad-vue`
- 阶段：T-001—T-005 完成，M0 gate 通过；下一任务 T-101，进入 M1 工作区。
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

当前工程实验见 [L-001B：Vue、TypeScript 与 Vite 的职责](docs/learning/notes/L-001B-vue-ts-vite.md)。从 [App.vue](src/App.vue) 的计数器开始，观察开发模块与生产产物，再运行故意写错类型的独立样例。

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

开发页默认地址为 `http://127.0.0.1:5173/`。点击“运行真实求解实验”可在 Worker 中检查矩形、圆弧相切、冲突和 DOF；当前仍是 M0 验证页，完整 CAD 工作区尚未建立。

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

几何实验见 [L-009A](docs/learning/notes/L-009A-solid-evidence.md)、[孔洞拉伸](docs/learning/notes/L-008B-hole-extrusion.md)、[STL 独立解析](docs/learning/notes/L-011B-stl-roundtrip.md)。19 项固定夹具与 16 个 STL 往返通过；边/顶点接触形成非流形时明确拒绝。完整草图、通用轮廓、布尔命令和导出 UI 仍待后续开发。

共享 Worker 恢复见 [L-007A](docs/learning/notes/L-007A-worker-correlation.md)，技术 gate 与完整验收的区别见 [L-012A](docs/learning/notes/L-012A-m0-gate.md)。`check:gate` 包含三个真实 10 秒超时实验，约需半分钟。
