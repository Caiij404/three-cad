# Three CAD Vue

浏览器端参数化建模项目，参考 [twpride/three.cad](https://github.com/twpride/three.cad)，使用 Vue 3 实现界面。

## 当前状态

- 项目目录：`D:\Fighting\Learn\three-cad-vue`
- 阶段：立项与需求定义完成，学习路线与记录约定已建立；功能代码尚未创建。
- 开发方式：以辅助学习为主，逐个技术点讲解、实验、验证和复盘；实现仍按 M0—M4 的依赖推进。
- 技术方向：Vue 3、TypeScript、Vite、Pinia、Three.js、SolveSpace WASM、网格 CSG。
- 产品目标：在网页中完成草图、约束、拉伸、布尔运算、参数修改重算、保存及 STL 导出。
- 实施前置条件：完成 M0 技术验证；求解器与 CSG 的具体版本尚未锁定。

## 文档入口

1. [需求文档 PRD](docs/PRD.md)：范围、需求编号、交互、数据约定、验收标准。
2. [技术决策](docs/DECISIONS.md)：Vue 替换边界、内核路线、已知事实和待验证事项。
3. [实施任务](docs/TASKS.md)：按依赖排列的里程碑、交付物与完成条件。
4. [Agent 工作约定](AGENTS.md)：后续 AI agent 的阅读与执行入口。
5. [学习入口](docs/learning/README.md)：学习路线、记录模板、进度和第一篇项目地图。

## 如何开始学习

先读 [项目地图](docs/learning/notes/L-000-project-map.md)，用自己的话描述一次“改宽度”的数据流；再按 [学习路线](docs/learning/ROADMAP.md) 选择当前技术点。

每次开发只聚焦一个主要问题：先讲清为什么需要它，再做最小实验，记录实际结果，最后接回项目。学习状态在 [学习进度](docs/learning/PROGRESS.md) 维护，功能状态在 `docs/TASKS.md` 维护。

GitHub 仓库：[Caiij404/three-cad](https://github.com/Caiij404/three-cad)。本地目录与仓库名称不同是现有命名，不影响学习或运行。

本目录当前没有 `package.json`、应用源码或安装依赖；PRD 中的目录结构和命令均为后续实施目标，不能当作已经实现的功能。

## 项目关系

这是以 three.cad 为功能参考的新项目，不是官方 Vue 版本，也不承诺读取原版的项目文件。代码复用前必须记录来源和许可证。原版仓库标注 GPL-3.0；本轮仅创建自写文档，没有复制上游代码或 WASM 文件。
