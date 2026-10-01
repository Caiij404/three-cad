# 技术决策记录

更新：2026-10-01。状态：进入 M0，来源调查完成；应用功能尚未开始。

## ADR-001：以 Vue 3 替换 React

**决策：** Vue 3 SFC + Composition API + TypeScript，Pinia 管理 UI 状态和领域快照；Vite 构建。

**依据：** 上游 package.json 使用 React/React DOM、Redux/react-redux；Three.js 本身不要求 React。但 Scene.js 接收 store，并通过 subscribe/getState 与 Redux 连接，直接访问 DOM 和 window 全局。

**迁移边界：**

| 上游职责 | 新项目实现 |
| --- | --- |
| React JSX、组件生命周期、工具栏 | Vue SFC、onMounted/onUnmounted、composables |
| Redux 选择/模式/树状态 | Pinia + 领域命令服务 |
| Scene 的 Redux 回调和全局对象 | 显式 ViewportRuntime 接口，选择事件输出 ID |
| Three.js 绘制、拾取、空间变换 | 视口适配层；按所锁定版本重写或适配 |
| WASM 求解和实体操作 | Worker + solver/solid adapter |
| Webpack 与旧 Babel/Tailwind 配置 | Vite + TypeScript；首期使用普通 CSS |

不能通过 npm 卸载 React、安装 Vue 就完成迁移。复用范围由 M0 确定，不预设所有上游 JS 都可直接搬迁。

**响应式规则：** 领域数据可以响应式；renderer、scene、mesh、WASM 模块不深度代理。必要时用 shallowRef/markRaw；运行时实例由组件外专用对象持有并销毁。

## ADR-002：首期使用网格 CSG 路线

**决策：** 保留 three.cad 的草图求解、拉伸、网格布尔路线。SolveSpace WASM 负责二维约束，Three.js 负责展示/预览，CSG 负责布尔。

**原因：** 这是用户选定的项目方向，先实现对应闭环。引入 OpenCascade 会改变实体表达、选择拓扑、导出和构建成本，不属于简单替换 React。

**限制：** 圆弧/圆需要细分；布尔可能遇到共面、相切、薄片失败；MVP 仅 STL，不承诺 STEP 或工业精度。

**验证要求：** M0 以 THREE-CSGMesh 路线作为首选，测量所选版本与 Three.js 兼容性。失败时评估其他网格 CSG 库并记录替代证据；不得静默改成 BREP 或删除约束功能。

## ADR-003：领域数据与显示分离

**决策：** 纯 TS core 存草图、约束、特征和依赖；网格为可再生缓存。Vue/Pinia/Three.js/SolveSpace 指针均不能成为文件格式。

**原因：** 重算、撤销、保存和迁移需要稳定数据。上游对象序列化方式作为参考，不作为新文件兼容契约。

**代价：** 需要显式类型、适配器、事务和依赖图；避免 UI、GPU 对象和求解器对象互相持有。

## ADR-004：Worker 与原子事务

**决策：** 求解和布尔运行于 Worker。请求包含 session、requestId、revision；候选文档全链重算成功才提交。

**原因：** 约束拖动和 CSG 可能耗时，且异步结果会乱序。失败时保留旧有效项目比提交半个特征图更可预测。

**取舍：** MVP 对失败上游修改整体回滚，而不是提交一个含失败后代的文档。UI 提供具体失败原因，未来可增加显式失效特征模式。

## ADR-005：新目录与分阶段交付

**决策：** 项目名 three-cad-vue，路径 `D:\Fighting\Learn\three-cad-vue`。初次交付只创建立项文档；后续实现从 M0 起。

**原因：** 用户要求先立项并写 AI agent 可执行的需求。先消除内核/版本风险，再建设完整 UI。

## ADR-006：复用与第三方来源

上游仓库提供 GPL-3.0 LICENSE，这是已核对的仓库事实。本轮没有复制其代码，也没有把新项目标注为 MIT。

M0 应为计划复用的源码、WASM 和第三方库建立清单，记录来源 URL、固定 SHA/版本、许可证、改动及构建方法；复用上游文件时保留对应声明。项目最终 LICENSE 在复用清单确定后设置，不在立项阶段猜测第三方授权。

## 待验证表

| 问题 | 当前结论 | 所需证据 |
| --- | --- | --- |
| Vue 能否替代 React | 可行，需重写 UI 与 Redux 连接 | M1 Vue 工作区无 React 依赖 |
| 求解器具体 API 与 DOF | 未验证 | Worker 中真实矩形、圆弧、矛盾约束用例 |
| 旧 WASM 是否适配 Vite/Worker | 未验证 | 开发、生产、子路径加载记录 |
| CSG 与新版 Three.js | 未验证 | 标准体积、闭合性及退化输入记录 |
| 性能预算 | 需求目标，尚无实测 | 基准机、场景与采样报告 |

## ADR-007：以项目辅助学习，分开记录学习与验收

**原决策：** ADR-005 规定从 M0 分阶段交付，但尚未定义学习节奏和笔记格式。

**新增依据：** 用户于 2026-10-01 已授权开发，随后明确项目主要用于辅助学习，要求细分技术点并注意记录排版。

**决策：** 建立 `docs/learning/`，按学习单元记录“问题 → 原理 → 最小实验 → 证据 → 复盘”；实施继续按 M0—M4。每次开发聚焦一个主要学习问题，并关联任务与需求。用户复述与独立练习单独记录，agent 不替用户判断掌握。

**影响：** 增加学习文档和交接要求，调整实现节奏；不改变领域模型、P0 范围或 M0 gate。当前先同步文档至 `https://github.com/Caiij404/three-cad`，尚不安装应用依赖。

## ADR-008：从固定 SolveSpace 源码重建，不采用旧求解器分发文件

**原决策：** SolveSpace WASM 路线确定，是否直接使用 three.cad 的 WASM 与包装器待 M0 验证。

**证据：** T-001 固定四个仓库与 33 个文件指纹；旧静态库未找到完整源码/工具/参数链。旧包装器使用 float/Float32，未回传 result/dof；独立转换实验中 9999.0001 mm 的误差约 1e-4 mm，超过 PRD 的 1e-5 mm 目标。此实验未执行求解器。

**决策：** 不把旧 dist/solver.* 或 libslvs.a 当作应用输入。采用固定官方 SolveSpace 源码的 slvs-wasm 目标作为重建候选，保留许可证与依赖指纹；登记数组索引补丁，实际构建、精度、错误、DOF 与 Worker 行为在 T-003 验证。CSG 从固定 THREE-CSGMesh 原库选取候选路径，兼容性在 T-004 验证。

**影响：** 保持 SolveSpace + 网格 CSG 路线、领域数据和 P0 范围。新增可追踪构建工作，没有把源码审计判作 M0 gate 通过。详见 [UPSTREAM](UPSTREAM.md)。

后续修改按 ADR-009 起追加。描述原决策、实测证据、替代决策、对需求/数据格式的影响，不只写“换一个更好用的库”。
