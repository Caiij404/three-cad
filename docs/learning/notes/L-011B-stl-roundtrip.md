# L-011B：导出的 STL 怎样独立核对？

| 项目 | 内容 |
| --- | --- |
| 日期 / 版本 | 2026-10-02；Three.js STLExporter 0.186.1 |
| 关联 | L-011B；T-004；REQ-011 前置，完整导出 UI 待 T-402 |
| 状态 | 讲解：已整理；实验：已执行；复述：未记录 |
| 前置知识 | [体积和闭合性](L-009A-solid-evidence.md) |

## 1. 本次问题

下载一个文件不等于导出成功：文件的三角面是否与目标实体一致？

## 2. 原理与数据流

binary STL 由 80 字节头、4 字节小端面数及每面 50 字节记录构成。每面包括 Float32 法向与三个 Float32 顶点，再加 2 字节属性。没有索引、约束、特征树或明确单位。

```text
有效数字网格 → Three.js STLExporter → ArrayBuffer
→ 自写文件结构解析器 → 普通三角形坐标 → 位置焊接 / 体积 / 包围盒 / 方向
```

独立解析器只读 DataView 文件布局，不调用导出器反向 API。重复顶点按位置焊接；不能把 STL 中不同面重复记录的顶点序号当成不闭合证据。

## 3. 最小实验

```powershell
. ./scripts/use-node.ps1
npm.cmd run check:solid
```

输入为 19 项几何夹具中的 16 个非空实体；空结果不导出。期望面数与文件长度满足 `84 + 50*N`，再次验证原夹具体积和包围盒，焊接容差 `1e-6 mm`、体积相对容差 `1e-4`。

环境：Windows x64 / Node 24.21.0 / Three.js 0.186.1。代码见 [导出适配器](../../../src/adapters/solid/stl-spike.ts) 与 [独立解析器](../../../src/experiments/parse-binary-stl.ts)。实验文件保存于忽略的 `.research/stl/`，证据提交面数、体积和 SHA。

## 4. 实际结果与证据

| 检查 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| 16 个实体往返 | 正确文件长度、体积、闭合性、方向 | 16 项通过；残差见逐项记录 | [Node JSON stl](../evidence/T-004-solid-node.json) |
| 83 字节文件 | 拒绝截断头 | INVALID_STL | 同上负向检查 |
| 将面数改为 99999 | 拒绝结构不匹配 | INVALID_STL | 同上负向检查 |

## 5. 接回项目

本实验没有创建下载 UI、单实体选择或文件名流程。完整 REQ-011 待 T-402。STL 的 Float32 会引入坐标量化；本次夹具通过不能证明所有 ±10000 mm 坐标都满足相同误差。可编辑模型应保存领域 JSON，不从 STL 推断约束或历史。

## 6. 我的复述与检查题

- 我的解释：未记录。
- 小练习：预测 32 个三角面的 binary STL 长度应为 1684 字节，再检查一个实际文件。
- 为什么问题：为什么 STL 能用于打印，却不能恢复“宽度约束为 40”的可编辑模型？

## 7. 疑问与下一步

单位边界、位置焊接、Float32 量化尚待用户反馈。T-005 汇总真实兼容范围；T-402 再把验证接入用户导出流程。

## 8. 来源

- [固定 STLExporter](https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/examples/jsm/exporters/STLExporter.js)：核对 2026-10-02，本地锁定源码已读取，实际 binary 输出为 DataView。
- [STLExporter 官方文档](https://threejs.org/docs/pages/STLExporter.html)：滚动文档，核对 2026-10-02，结构与单位限制；具体返回值以本次源码和实验为准。
