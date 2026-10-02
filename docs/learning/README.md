# 学习入口

这个项目的主要用途是辅助你学习网页 CAD 涉及的技术。每次学习解决一个具体问题，并留下能够重做的实验记录。

## 从哪里开始

1. 阅读 [L-000 项目地图](notes/L-000-project-map.md)，理解功能闭环和模块关系。
   已完成的首个技术实验见 [L-001A 来源链与精度](notes/L-001A-source-provenance.md)。
   当前工程运行链见 [L-001B Vue、TS 与 Vite](notes/L-001B-vue-ts-vite.md)。
   真实内核实验见 [L-006A WASM/Worker](notes/L-006A-wasm-worker.md) 与 [L-006B 约束证据](notes/L-006B-constraint-evidence.md)。
   几何证据见 [L-009A 布尔](notes/L-009A-solid-evidence.md)、[L-008B 孔洞](notes/L-008B-hole-extrusion.md)、[L-011B STL](notes/L-011B-stl-roundtrip.md)。
   集成与恢复见 [L-007A](notes/L-007A-worker-correlation.md)，证据层级见 [L-012A](notes/L-012A-m0-gate.md)。
   工作区状态与运行时边界见 [L-003A](notes/L-003A-workspace-state.md)。
   领域校验与原子历史见 [L-002A](notes/L-002A-domain-validation.md)、[L-010A](notes/L-010A-atomic-history.md)。
   视口见 [L-004A 世界与像素](notes/L-004A-world-screen-picking.md)、[L-005A 平面坐标](notes/L-005A-plane-coordinates.md)、[L-004C 生命周期](notes/L-004C-viewport-lifecycle.md)。
   规范领域草图接真实内核见 [L-006C](notes/L-006C-domain-solver.md)，屏幕捕捉与真实绘制见 [L-005B](notes/L-005B-screen-snapping.md)，拖动/删除见 [L-007C](notes/L-007C-latest-drag.md)，方向/相等见 [L-006D](notes/L-006D-angle-and-equal.md)，完整相切与面板见后续L-006F/G，T-201已完成。
2. 查看 [学习路线](ROADMAP.md)，找到当前里程碑所需的学习单元。
3. 用 [记录模板](TEMPLATE.md) 写笔记，在 [学习进度](PROGRESS.md) 记录讲解、实验和复述。
4. 用 [实施任务](../TASKS.md) 与 [PRD](../PRD.md) 核对功能完成条件。

默认从基础 JavaScript 能读懂、Vue/TypeScript/Three.js 需要分步说明的起点编排。实际基础确认后可以跳过已掌握部分，保留实验与验证。

## 一次学习怎么进行

```text
提出一个问题 → 解释原理与数据流 → 预测实验结果
→ 做最小实验 → 对比期望与实际 → 接入项目 → 自己复述或改一处验证
```

例如学习 Worker 时，先回答“旧求解结果为什么会覆盖新项目”，再人为制造回复乱序，验证 session/revision 的过滤规则。通过证据理解规则，再用于草图拖动。

一个单元以问题可单独验证为边界，通常只覆盖 1—3 个概念；复杂单元继续拆成 A/B/C。时间不作为完成条件，也不要求一次读完整条路线。

## 文档各管什么

| 文件 | 主要问题 | 更新时机 |
| --- | --- | --- |
| PRD | 功能应满足什么验收 | 需求变化时 |
| DECISIONS | 为什么选这条技术路线 | 证据改变决策时 |
| TASKS | 哪个实现任务实际完成 | 每个任务交接时 |
| learning/ROADMAP | 技术怎么拆、先学什么 | 路线或基础变化时 |
| learning/PROGRESS | 讲过、试过、复述过什么 | 每次学习结束时 |
| learning/notes | 原理、实验与我的理解 | 当前单元实验后 |

学习笔记链接 PRD 和 [验证记录](../VERIFICATION.md)，不复制整段需求。M0 技术 gate 已通过，完整 CAD 尚未实现。用户已授权连续推进，笔记仍按具体问题拆分，复述待用户实际反馈。

## 记录与排版约定

- 一篇笔记聚焦一个技术问题，文件名为 `L-编号-英文主题.md`；拆分时使用 `L-006A` 这类 ID。
- 标题最多三级。正文使用短段落，步骤使用编号，比较内容使用最多四列的表格。
- 代码块必须标语言；只展示解释当前问题所需的片段，并链接对应源码。避免把整份源文件复制进笔记。
- 数值与单位同时出现，实验写出输入、期望、实际、容差和环境。没有执行时明确写“未执行”。
- 图示用于解释职责、依赖或数据流；Mermaid 图保持简短，正文补充含义。
- 长日志、fixture 和数值结果保存到 `docs/learning/evidence/`，笔记链接证据并提取必要结论。不保存密钥、令牌、个人目录快照或无关日志。
- 技术来源优先上游源码与官方文档；记录核对日期和所用版本/commit，不把浮动分支当成可复现来源。
- 留下“我的复述”和“未解决问题”。agent 可以给检查题，但不能替你填写已经掌握。

每次交接说明学习单元、实施任务、修改文件、实际验证、未理解问题及下次入口。自 T-002 起按用户要求，每个子任务完成后提交一个 commit，包含该任务全部实现与记录。

修改文档后，在项目根目录运行 `node scripts/check-docs.mjs`，检查 UTF-8、内部文件链接、标题层级、代码围栏、行尾空格及学习表格列数。该检查不验证外部网页、Mermaid 渲染或用户是否掌握知识。

相切接触前置见 [L-006E](notes/L-006E-tangent-contact.md)，下一T-201B2领域集成。

领域有限相切集成见 [L-006F](notes/L-006F-domain-tangency.md)：T-201B2已执行，下一T-201C面板。

诊断与撤销见 [L-007D](notes/L-007D-atomic-diagnostics.md)：C1完成，下一C2。

完整约束面板与单位/事务见 [L-006G](notes/L-006G-constraint-panel.md)；T-201完成，下一轮廓L-008A/T-202。

曲线细分见 [L-008C](notes/L-008C-curve-sampling.md)：T-202A完成，下一B端点图/自交/孔洞；REQ-006尚未完整验收。

轮廓端点图、解析接触和孔洞见 [L-008A](notes/L-008A-sketch-regions.md)：T-202B core完成，下一C网格/Worker/区域选择与预览界面。

一般拉伸/负深度与孔侧壁见 [L-008D](notes/L-008D-general-extrusion.md)：C1数值和Worker完成，下一C2真实预览/取消/事务。

最新拉伸预览与原子管线见 [L-007E](notes/L-007E-extrusion-preview.md)：C2a完成，下一C2b视口/区域选择UI；完整REQ-006仍未验收。

真实区域选择/临时GPU网格与提交见 [L-008E](notes/L-008E-extrusion-ui.md)：T-202完成，REQ-006五AC有证据。下一T-203参数与孔洞历史；学习复述仍未记录。

已提交实体的来源参数与原子回滚见 [L-010C](notes/L-010C-parameter-history.md)：T-203/M2完成，下一T-301/L-009真实布尔。讲解/实验已记录，用户复述未记录。

L-009C [世界网格与原子布尔](notes/L-009C-world-mesh-boolean.md)已讲解/实验；T-301A完成，下一B工作区A/B与完整REQ-007。用户复述未记录。

L-009D [A/B与布尔界面](notes/L-009D-boolean-ui.md)已讲解/实验；T-301/REQ-007完成，下一T-302受影响分支与级联。复述未记录。

L-010D [受影响分支与不可变基线](notes/L-010D-affected-recompute.md)已讲解/实验；T-302A done，下一B级联影响/确认与现有特征参数。复述未记录。

L-010E [稳定编辑与显式级联](notes/L-010E-feature-edit-and-cascade.md)已讲解/实验；T-302/REQ-008完成，实际宽40→60、区域/正负深度、默认取消/级联、晚失败和精确历史有证据。用户复述未记录。按用户要求本子任务后暂停，下一T-303；完整E2E-02文件往返待T-401，最终场景待T-403。

[L-007F](notes/L-007F-interaction-lifetime.md)记录T-R01审查修复：属性折叠保留事务生命周期，计算中保留相机导航；三入口与WebGL恢复已实验，复述未记录。此次授权仅覆盖修复，T-303继续暂停。

2026-10-03用户明确恢复连续任务。[L-010F完整历史](notes/L-010F-complete-history.md)已讲解/实验：T-303/REQ-009与M3完成，全部命令、105混合/100步/200恢复、dirty/分支和真实晚取消有Node/三入口证据。下一T-401/L-011A文件，复述未记录。

[L-011A1原子打开](notes/L-011A1-atomic-file-load.md)已讲解/实验：T-401A文件契约与真实全量重建完成，失败保留旧项目/历史。T-401整体doing，下一B标准文件UI/相机，随后C自动恢复；复述未记录，完整REQ-010未验收。

[L-011A2浏览器文件与相机](notes/L-011A2-browser-files-and-camera.md)已讲解/实验：T-401B真实文件UI/相机往返完成，下载显式确认与busy导航独立。下一C恢复入口，复述未记录。

[L-011A3恢复](notes/L-011A3-indexeddb-recovery.md)已讲解/实验：T-401/REQ-010完成，实际IndexedDB防抖/恢复/放弃/失败回退与文件后历史有证据；下一T-402工作区STL，复述未记录。

[L-011B2单实体STL](notes/L-011B2-selected-solid-stl.md)已讲解/实验：T-402/REQ-011完成，实际选中缓存36导出/54下载独立判定通过；下一T-403完整验收，复述未记录。

[L-012B1当前稳定浏览器](notes/L-012B1-current-browser-workflow.md)记录T-403A：原版Chrome/Edge/Firefox六生产E2E-01/05、真实下载/STL/IDB与布局通过。下一B完整布尔/孔洞/失败、C性能资源；复述未记录。

