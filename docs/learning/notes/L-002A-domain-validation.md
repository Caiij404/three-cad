# L-002A：TypeScript 为什么不能替代项目文件校验？

| 项目 | 内容 |
| --- | --- |
| 日期 / 版本 | 2026-10-02 / PRD 0.3.1；Node 24.21.0；TypeScript 6.0.3 |
| 关联 | L-002A/B、T-102、REQ-008/010 的数据基础；LEARN-001 |
| 状态 | 讲解：已整理；实验：已执行；复述：未记录 |
| 前置知识 | [TS 与构建](L-001B-vue-ts-vite.md)、JSON 数组和对象 |

## 1. 本次问题

如果 `JSON.parse` 成功，为什么仍不能把结果当作项目文档？本次区分语法、字段形状和引用关系，并验证 JSON 往返后 ID 不变。

## 2. 原理与数据流

TypeScript 在开发时检查表达式的类型，编译后不会自动检查文件。JSON 语法合法只说明能够解析；它仍可能包含未知版本、错误对象组合或不存在的引用。

```mermaid
flowchart LR
    JSON[未知 JSON / unknown] --> Shape[版本与字段 / 有限数值]
    Shape --> Refs[全局唯一 ID / 草图内引用]
    Refs --> DAG[特征依赖无环]
    DAG --> Copy[独立 ProjectDocument 副本]
```

`Feature.kind` 区分 sketch/extrude/boolean；引用持有领域 ID，不持有 Mesh 或 WASM handle。DAG 是依赖图，按引用排序，不能依赖数组碰巧排列正确。拓扑排序遇到环必须报错，否则参数重算没有合法顺序。

字段白名单同时拒绝 `mesh`、`history` 等运行时对象。数据校验和几何求解有不同职责：结构校验知道点属于哪个草图；圆弧等半径残差、轮廓闭合和约束成立仍要后续真实计算证明。

## 3. 最小实验

实际输入见 [领域夹具](../../../tests/fixtures/domain-document.mjs)，校验入口见 [validate-document.ts](../../../src/core/model/validate-document.ts)。夹具包含两个矩形草图、拉伸与布尔引用；交换特征数组顺序仍应通过，制造布尔环则拒绝。

```text
输入：schemaVersion=1，mm，稳定 ID，正交平面，20×20 矩形与特征依赖。
操作：序列化/解析；分别篡改版本、坐标、引用、对象组合、依赖和数值边界。
命令：. ./scripts/use-node.ps1；npm run check:domain；npm run typecheck
环境：Windows x64 / PowerShell 7.6 / Node 24.21.0 / TS 6.0.3。
期望：往返深相等但对象独立；非法输入明确失败。
容差：平面单位/正交 1e-8；结构与 ID 精确相等；这里只验证结构。
```

## 4. 实际结果与证据

| 检查 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| JSON 往返 | ID、参数、隐藏与相机保留 | 深相等；修改副本不影响原件 | [15 项日志](../evidence/T-102-domain.log) |
| 未知版本/额外字段/NaN/稀疏数组 | 拒绝 | 对应 DomainError；超过 10 MiB 拒绝 | 同上 |
| 跨草图点、错误 radius/distance 对象 | 拒绝 | REFERENCE_MISSING / REFERENCE_TYPE | 同上 |
| DAG 乱序/循环 | 乱序可排序，循环拒绝 | 拓扑与后代正确；FEATURE_CYCLE | 同上 |

复核需求时收紧三处边界：distance 仅两点；angle 在 `(0, π)` radians；深度绝对值至少 `0.01 mm`。反例与 `-0.01 mm` 边界均通过。7 个 core 文件的外部运行时依赖检查通过，见 [汇总](../evidence/T-102-domain.json)。

## 5. 接回项目

类型位于 core/model；依赖排序位于 core/features；命令提交前后都执行校验。项目名称通过 Vue 文本绑定展示，浏览器验证 `<img ...>` 保留为文字且不执行，见 [浏览器证据](../evidence/T-102-project-browser.json)。

本次是 REQ-008/010 基础。文件打开、保存、IndexedDB、任意曲线求解与通用轮廓尚未实现，不能把 JSON 解析函数当成完整文件功能。

## 6. 我的复述与检查题

- 我的解释：未记录。
- 小练习：让 boolean 引用一个不存在的实体，先预测错误，再执行测试。
- 为什么问题：为什么 feature 数组顺序变化不应改变依赖，而 ID 变化可能破坏项目？

## 7. 疑问与下一步

用户理解待反馈；结构合法不代表几何有效。下一篇 [L-010A](L-010A-atomic-history.md) 解释有效候选如何整体提交与撤销，随后进入视口坐标实验。

## 8. 来源

- 本项目 [PRD](../../PRD.md) 0.3.1，第 6/7 节与 REQ-008/010，2026-10-02 核对，数值和持久化契约。
- 本项目 [schema 测试](../../../tests/document-schema.test.mjs) 与 [领域类型](../../../src/core/model/document.ts)，T-102 本次提交，2026-10-02 核对；实际行为以证据为准。
