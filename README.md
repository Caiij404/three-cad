# Three CAD Vue

浏览器端参数化建模学习项目，参考 [three.cad](https://github.com/twpride/three.cad) 的功能，使用 Vue 3、TypeScript、Pinia、Three.js、真实 SolveSpace WASM 和网格 CSG 实现。

2026-10-03：M0—M4 的 P0 功能、E2E-01—05 和 NFR-001—007 已有真实验收证据。完整需求与结果见 [最终逐项验收](docs/ACCEPTANCE.md) 和 [验证记录](docs/VERIFICATION.md)。测试通过与用户学习掌握分别记录；用户复述尚未记录。

## 运行

实测环境为 Windows x64 / PowerShell 7.6 / Node **24.21.0** / npm **11.19.0**。版本由 [package.json](package.json) 与 [锁文件](package-lock.json) 固定。需要桌面浏览器、WebGL2 和 WASM；通过本地 HTTP 服务打开。

```powershell
./scripts/setup-node.ps1
. ./scripts/use-node.ps1
npm.cmd ci
npm.cmd run dev
```

`setup-node.ps1` 校验官方便携 Node 的归档 SHA256，保存在忽略的 `.research/runtime/`；`use-node.ps1` 只修改当前 PowerShell 会话。已有同版本 Node/npm 可直接执行 npm。Windows 以外的安装流程本次未执行。

开发地址默认为 `http://127.0.0.1:5173/`。仓库包含自建的 ESM/WASM，运行前端无需安装求解器 SDK。生产预览：

```powershell
npm.cmd run build
npm.cmd run preview
```

`build` 先检查 TypeScript/Vue 类型，再生成 `dist/`。预览默认为 `http://127.0.0.1:4173/`，修改源码后需要重新构建。非根路径已验证 `/cad/`：

```powershell
npm.cmd run build -- --base=/cad/
npm.cmd run preview -- --base=/cad/
```

打开 `http://127.0.0.1:4173/cad/`。静态部署需保留 dist 中的 assets、wasm、solid、ui 和第三方声明；WASM 应以 `application/wasm` 返回。应用运行资源均为同源，无运行时 CDN、账号或后端依赖。

## 建模与文件

1. 在特征树选择 XY/XZ/YZ 平面，点击“新建草图”。线段、连续线、矩形、圆和三点圆弧可用鼠标或“下一点”数值输入；原点/端点捕捉半径为8 CSS px。
2. 在“约束”中选择点或实体，建立重合、水平、垂直、平行、垂直相交、距离、长度、角度、半径、相等、相切和固定点。数值与真实 DOF/尺寸标注同步；固定圆心不等于固定半径。
3. “完成草图”后选中草图，点击“拉伸”，选择区域和有符号深度。预览明确未提交；“确认拉伸”才生成特征，Esc取消。
4. 两个非空实体可作布尔主体A/工具B，执行并集、A−B或交集，支持交换A/B。结果保留来源依赖，成功后默认隐藏输入；empty结果会明确显示。
5. 在树中重新编辑来源草图，或修改已有拉伸区域/深度，所有受影响后代原子重算。删除被引用来源先显示影响列表，默认取消；明确级联后一次提交，可撤销。
6. “保存”或Ctrl+S下载 `.tcad.json`。浏览器下载没有磁盘写入回调，确认具体快照已保存后才清除未保存标记。“打开”校验文件并从领域数据全量重建；失败保留当前项目。
7. 提交后1秒防抖写入最后一个 IndexedDB 恢复副本；刷新后可明确“恢复项目”或“放弃恢复副本”。恢复后的项目仍需手动保存；存储失败不会禁止下载。
8. 选择单个非空有效实体后“导出 STL”，输出世界坐标 binary STL。按mm输出，STL文件本身不记录单位；导出会重新解析验证闭合、包围盒和体积。

相机位置随项目文件保存，导航参与未保存状态而不增加几何历史。撤销/重做保留最近100个成功操作，一次拖动只产生一个命令；失败和取消不进入历史。技术实验页保留真实内核的最小夹具与数值结果。

| 输入 | 操作 |
| --- | --- |
| 左键 / Ctrl+点击 | 选择 / 多选；草图工具输入或端点拖动 |
| 中键拖动 / 滚轮 | 平移 / 缩放；计算中仍可导航 |
| 右键拖动 | 模型旋转，草图模式锁定旋转 |
| Esc / Delete | 取消未提交操作 / 删除选择 |
| Ctrl+Z / Ctrl+Shift+Z或Ctrl+Y | 撤销 / 重做 |
| Ctrl+S / F | 保存 / 适应可见模型 |

文本框内的Delete、F和文本撤销保持浏览器行为。1280×720可完成全流程，1024宽可折叠面板；更窄屏显示提示，移动编辑不在本次验收范围。

## 验证

快速检查与原生传输实验：

```powershell
npm.cmd run typecheck
npm.cmd run check:domain
npm.cmd run check:solid-wire
npm.cmd run check:docs
npm.cmd run check:delivery
```

`check:delivery` 审计52条P0、7条NFR的逐项证据、最终浏览器矩阵、性能样本、锁文件和本次构建资源；它不代替重新运行几何/UI实验。完整几何、历史、文件与STL测试入口均在 package.json；输入、期望、容差、实际命令和失败记录见验证文档与学习笔记。

最终浏览器实测为 **Chrome154.0.8037.92 / Edge154.0.4258.53 / 原版Firefox157.0**，各执行生产root和/cad的完整流程。复现隔离浏览器环境与完整UI检查：

```powershell
./scripts/prepare-browser-runtimes.ps1
npm.cmd run check:current-browsers
npm.cmd run check:e2e-geometry
npm.cmd run check:e2e-failures
npm.cmd run check:nfr-contracts
$env:NFR_BASE='/cad/'
$env:NFR_EVIDENCE_PATH='.research/nfr-cad-replay.json'
npm.cmd run check:nfr-contracts
```

准备脚本校验固定官方归档，浏览器与下载只写入 `.research/`，不会运行安装程序。Edge只读提取需要已准备的M0 Emscripten工具，详情见 [浏览器来源和准备实验](docs/learning/notes/L-012B1-current-browser-workflow.md)。未来稳定版本变化需重新核对验收，不能把固定旧版本重跑称为未来当前稳定。

完整性能复现单独运行，避免与其他重负载浏览器测试同时执行：

```powershell
$env:PERF_FULL_ACCEPTANCE='1'
$env:PERF_ASSERT_BUDGETS='1'
$env:PERF_SCENE_PATH='.research/performance-replay.json'
npm.cmd run check:scene-performance
```

真实100线/100约束/十实体105760三角面场景，在i7-13700KF / 31.8GiB / RTX4070Ti上，三浏览器求解p95为7.7/7.6/10ms，实际旋转中位158.73/161.29/76.92fps。103544面完整场景的每类30简单CSG p95≤5ms；20轮冷打开与10次实际WebGL重建通过。原始样本与观测边界见 [最终NFR矩阵](docs/VERIFICATION.md)。这些数值属于记录的headless基准环境。

旧单浏览器分步脚本默认使用安装的Edge；最终三浏览器脚本使用上述固定原版exe与驱动。重做脚本可能更新其默认证据文件，提交时保留原始历史记录并为新结果指定独立路径。

## 数值与已知边界

- 默认单位mm、Z-up、正交相机；二维输入范围±10000mm，有符号拉伸深度绝对值0.01—10000mm。文件UTF-8双向上限10MiB，schemaVersion为1。
- 约束独立残差≤1e-5mm或1e-5rad。轮廓闭合/点焊接容差1e-6mm；曲线弦误差0.05mm、步进角≤5°、单曲线最多4096段，超容量会拒绝。
- 所有草图实体参与轮廓分类，没有构造线模式。开放、自交、相切/相交孔洞和默认精度不能分辨的狭小区域明确拒绝；多个外轮廓须显式选区。
- 网格CSG使用固定BSP分类阈值1e-5；每操作数最多2000输入三角面，一致边界桥最多2000唯一输出顶点。边/顶点接触形成非流形会拒绝，不承诺任意复杂、极薄或退化几何。
- STL使用Float32坐标，合法源实体也可能因输出精度损失被拒绝。空、不闭合或非有限网格不能导出；领域和Worker网格使用双精度。
- 生产主包823.17kB，构建保留>500kB提示。Firefox没有Long Tasks观测类型，主线程采用10ms采样；资源计数不代表驱动VRAM或GC堆字节恒定。

任意草图平面、修剪/偏移/阵列、更大模型、STEP/BREP、圆角/倒角和多文件恢复属于后续候选。没有以这些功能作为本轮已交付内容。

## 来源、架构与学习

本项目以three.cad为功能参考，重新实现Vue界面；不是上游官方Vue版本，也不承诺读取上游文件。`src/core`只含可序列化领域数据/算法，不依赖Vue、Pinia、DOM或Three；视口对象由运行时持有，WASM和CSG在适配层/Worker。网格为派生数据，文件只保存权威领域文档。

项目采用 [GPL-3.0-or-later](LICENSE)。SolveSpace固定官方源码自建，CSG只复用固定未改核心；原许可、源码commit、补丁、构建与哈希见 [第三方清单](docs/third-party/README.md)。重建WASM需要独立SDK准备，准确命令见 [构建来源](public/wasm/SOURCE.md)，前端运行无需重建。

从 [学习入口](docs/learning/README.md) 和 [路线](docs/learning/ROADMAP.md)选择一个问题，按具体输入/期望/实际结果重做。最新 [转移网格](docs/learning/notes/L-012C4-transferable-mesh.md)和 [可复现交付](docs/learning/notes/L-012D-reproducible-delivery.md)连接性能、数据正确性与证据。学习状态见 [PROGRESS](docs/learning/PROGRESS.md)，功能状态见 [TASKS](docs/TASKS.md)。

其他入口：[PRD](docs/PRD.md)、[决策](docs/DECISIONS.md)、[Agent约定](AGENTS.md)、[上游调查](docs/UPSTREAM.md)。仓库为 [Caiij404/three-cad](https://github.com/Caiij404/three-cad)，本地目录名称为three-cad-vue。历史技术任务的部分验收说明保留在验证文档中，以最新矩阵判断当前状态。
