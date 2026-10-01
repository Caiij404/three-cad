# L-003A：Vue 工作区如何管理状态，却不持有几何内核？

| 项目 | 内容 |
| --- | --- |
| 日期 / 版本 | 2026-10-02；Vue 3.5.43、Pinia 4.0.3 |
| 关联 | L-003A/B、L-010 前置；T-101；REQ-001、REQ-012 |
| 状态 | 讲解：已整理；实验：已执行；复述：未记录 |
| 前置知识 | [Vue 与 Vite](L-001B-vue-ts-vite.md)、[Worker](L-007A-worker-correlation.md) |

## 1. 本次问题

加载失败、重试、切换界面发生时，哪一份状态决定按钮和提示？如何避免过期回调覆盖新界面？

## 2. 原理与数据流

```mermaid
flowchart LR
    Event[组件事件 / 内核完成] --> Transition[纯状态转换函数]
    Transition --> Pinia[普通状态: mode / phase / ID / generation]
    Pinia --> Vue[computed / 模板更新]
    Lifecycle[组件生命周期] --> Service[KernelBootstrap]
    Service --> Worker[真实 solver / solid Worker]
    Worker --> Event
```

Pinia setup store 中 `ref` 是状态、`computed` 是派生值、普通函数是 action。这里仅保存可序列化 UI 状态和选择 ID；KernelBootstrap 由组件单独拥有，卸载时销毁。它不放入 ref/reactive/Pinia，也不会被深度代理。

计算状态 loading/ready/running/error 与交互模式 model.select/sketch.drawLine 等是两个维度。正在加载时不能绘制；进入草图才有绘制上下文；Esc 回到该草图的选择模式并清理临时选择。

每次加载增加 generation，完成/失败回调必须与当前代次匹配。这保护 UI 的加载状态；文档事务权威仍待 T-102，不把 generation 当成完整文档历史。

## 3. 最小实验

```powershell
. ./scripts/use-node.ps1
npm.cmd run check:workspace:state
npm.cmd run build
npm.cmd run check:workspace
```

浏览器打开默认工作区，真实求解 40 mm 矩形并计算方块交集后进入 ready；拦截 WASM 返回 503 时进入 error，解除拦截后点重试。再折叠两面板、切换实验页/工作区，以及改变宽度。

环境为 Windows x64 / Node 24.21.0 / npm 11.19.0 / Edge 154.0.4258.48。主要代码：[纯状态机](../../../src/app/workspace-state.ts)、[Pinia](../../../src/stores/workspace.ts)、[生命周期组件](../../../src/components/Workspace.vue)。

## 4. 实际结果与证据

| 检查 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| 4 个状态边界测试 | 过期代次忽略、上下文限制、计算禁用、取消清理 | 4 项通过 | [状态测试](../../../tests/workspace-state.test.mjs)、[运行日志](../evidence/T-101-state.log) |
| 默认工作区真实启动 | ready，资源/MIME 正确 | 开发、生产、cad 均通过 | [浏览器](../evidence/T-101-workspace-browser.json) |
| 503 → 明确失败 → 重试 | 无无限 loading，选择按钮失败时禁用 | 失败可见，重试恢复 ready | 同上 |
| 1280/1024/390 px 与折叠 | 面板宽度响应，无横向溢出，窄屏提示 | 均通过，切换页面重新加载成功 | 同上 |

截图仅用于检查 1280×720 排版，未用作几何正确性证据。未实现文件/历史/绘制按钮均禁用并有原因。

## 5. 接回项目

T-101 已建立工作区壳与状态/加载错误入口。真实 Three.js 视口和坐标轴尚未建立，完整 REQ-001/AC-001-2 的 WebGL 部分待 T-103；新建可编辑文档、撤销与保存尚未实现。状态机中的草图模式有单测，但绘制按钮仍禁用，没有虚构草图功能。

实验页面保留在 `?view=experiments`，可从导航切换。当前默认是工作区，两者组件卸载/挂载独立，Pinia 不存 Worker。

## 6. 我的复述与检查题

- 我的解释：未记录。
- 小练习：先预测 `loaded(generation=1)` 晚于第二次加载时界面如何变化，再阅读测试。
- 为什么问题：为什么 Worker 客户端应归组件生命周期，而选择 ID 适合放 Pinia？

## 7. 疑问与下一步

用户对 ref/computed、状态机与运行时边界尚未反馈。下一任务 T-102 / L-002A：TypeScript 类型、运行时 schema 与稳定 ID 各自解决什么问题？

## 8. 来源

- [Pinia setup stores](https://pinia.vuejs.org/core-concepts/)、[state](https://pinia.vuejs.org/core-concepts/state.html)：滚动官方文档，核对 2026-10-02；本项目锁定 4.0.3，Vue 3.5.43，实际类型/构建/浏览器已验证。
- [UI 依赖来源与原许可](../../third-party/ui-dependencies.json)：精确 npm 版本/integrity/原文件 SHA，核对 2026-10-02；包含 Pinia 内联 nostics 与 devtools 声明。
