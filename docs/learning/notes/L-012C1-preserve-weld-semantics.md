# L-012C1：怎样加速网格验证而不改变焊接语义？

| 项目 | 内容 |
| --- | --- |
| 日期 / 版本 | 2026-10-03；基于f728408的T-403C1工作树 |
| 关联 | L-012C1；T-403C1；NFR-003/004前置定位，NFR-005几何正确性 |
| 状态 | 讲解：已整理；实验：真实大网格/30预热后样本与回归通过；复述：未记录 |
| 前置知识 | [几何证据](L-009A-solid-evidence.md)、[STL独立解析](L-011B2-selected-solid-stl.md) |

## 1. 本次问题

真正大一点的网格进入验证时，Worker外还有多少CPU成本？先测一个实际拉伸，再优化实测瓶颈；完整浏览器性能另行验收。

## 2. 原理与数据流

STL式非索引三角面重复记录顶点，拓扑验证先按欧氏距离焊接。原算法对每个点扫描全部已保留代表，成本随顶点数近似平方增长。它选择第一个匹配代表，不是最近点，也不能把距离链传递合并。

```mermaid
flowchart LR
    Mesh[实际非索引坐标] --> Cell[宽2倍容差的空间桶]
    Cell --> Neighbors[27邻桶 / 欧氏距离仍须满足容差]
    Neighbors --> First[选择最小原代表ID]
    First --> Topology[原边 / 顶点link / 体积 / 包围盒算法]
```

桶只缩小候选搜索。跨负坐标/边界的邻桶仍查；距阈值包含等号，多个匹配选最小ID，保持旧first-match。无效/极端tol或不安全整数尺度回退原扫描语义。使用三层数值Map，避免每点27个字符串键分配；领域层没有新增运行时依赖。

## 3. 最小实验

输入外圆R4000、九个R500孔，中心在{-1800,0,1800}×{-1800,0,1800}；原native解出轮廓后真正拉伸100，10576三角面。另有100条线/100长度约束，native DOF300。十实体完整场景DTO已准备，本次只实际生成一实体作定位。

```powershell
. ./scripts/use-node.ps1
# 修改前执行，保留一预热/三实测；不能在修改后伪造旧结果
node scripts/probe-mesh-performance.mjs
# 本次已保存旧实测为 T-403C1-mesh-before.json
node --test tests/weld-vertices.test.mjs
$env:PERF_REFERENCE='docs/learning/evidence/T-403C1-mesh-before.json'
$env:PERF_METRIC_SAMPLES='31'
$env:MESH_PERF_PATH='docs/learning/evidence/T-403C1-mesh-after.json'
node scripts/probe-mesh-performance.mjs
```

修改后剔除首个预热，30样本。必须精确匹配原网格坐标SHA256和全部metrics，体积与理论值相对误差<0.001；默认焊接1e-6mm。Windows/Node24.21.0，固定WASM/Three0.186.1；同一基准机见[机器](../evidence/T-403A-browser-runtimes.json)。这些是Node核心成本，不等于浏览器主线程/FPS。

## 4. 实际结果与证据

| 检查 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| 旧真实成本 | 先测量 | 10576面验证1061—1095ms，生成含校验1236ms | [旧实测](../evidence/T-403C1-mesh-before.json) |
| 新成本/正确性 | 30样本更快，语义不变 | 30预热后p95=29.2575ms；生成含校验91.0959ms；坐标哈希/全部metrics精确相等 | [新实测](../evidence/T-403C1-mesh-after.json) |
| 边界/first-match | 与独立欧氏扫描一致 | 四测试，含跨格/负值/球距/等号、距离链、5000确定点、异常尺度通过 | [测试](../../../tests/weld-vertices.test.mjs)、[37Node回归](../evidence/T-403C1-node-replay.log) |
| 几何/历史/文件 | 保持原行为 | 37Node、19实体/16STL、16领域/18纯core通过 | [实体](../evidence/T-403C1-solid-replay.json)、[领域](../evidence/T-403C1-domain-replay.json) |
| 生产回归 | 实际UI仍正确 | 三稳定浏览器root/cad六完整布尔/传播/文件/级联/孔洞曲线流程通过 | [六流程](../evidence/T-403C1-e2e-geometry-replay.json) |

第一版字符串桶约110—120ms，改数值分层Map后得到上述结果。旧实现已在更改前真实运行，不把重新跑新代码输出当旧baseline。重跑旧测试自动生成的历史证据文件恢复至已提交版本，本次实际结果另存C1日志/证据，避免改写旧任务记录。

## 5. 接回项目

[weldVertices](../../../src/core/geometry/weld-vertices.ts)替换[meshMetrics](../../../src/core/geometry/mesh-metrics.ts)中的全扫描；后面的闭合、流形、方向、体积算法保持。正确性测试用独立慢扫描作为spec参考，针对优化可能改变的代表ID/距离边界；不是复制空间桶实现。

[性能输入](../../../src/experiments/performance-fixtures.ts)定义恰好100线/100约束、10个真实拉伸的文档；本次没有把一网格乘十计为完整场景已运行。下一C2真实Worker构造全部十实体，测30样本求解/CSG、交互FPS、主线程200ms和长期资源。C1 done，C/T-403/M4/MVP仍未验收。

## 6. 我的复述与检查题

- 我的解释：未记录。
- 小练习：预测[0,.6,1.2]在tol=.7的代表ID为何是[0,0,1]。
- 为什么：为什么查到一个更近点不能替代“最小原代表ID”？

## 7. 疑问与下一步

即使单个网格验证约30ms，十个连续验证、历史拷贝、GPU重建仍可能超过200ms；必须测浏览器完整事务，不能从本次优化推断完整NFR达标。

## 8. 来源

- [原meshMetrics](../../../src/core/geometry/mesh-metrics.ts)：原基线f728408，2026-10-03；旧first-match与欧氏距离/流形规则。
- [PRD NFR-003/004/005](../../PRD.md)：f728408，2026-10-03；指定规模/30样本/主线程预算/正确性优先。
- 本任务源码、前后实测与上述回归：T-403C1工作树，2026-10-03；没有新上游库或修改固定内核。
