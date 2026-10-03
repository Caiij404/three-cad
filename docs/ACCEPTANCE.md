# 最终逐项验收

日期：2026-10-03。基线7cc1879的最终生产协议已覆盖三稳定原版Chrome154.0.8037.92/Edge154.0.4258.53/Firefox157.0，各root和/cad。下表52条P0均有真实实现/实验；“通过”指限定输入与PRD容差内的验收，不表示任意几何可靠。

历史分步证据保留当时环境和覆盖范围，最终交叉浏览器复跑见[E2E-01/05](learning/evidence/T-403C2b2-current-browsers.json)、[02/03](learning/evidence/T-403C2b2-e2e-geometry.json)、[04](learning/evidence/T-403C2b2-e2e-failures.json)。7条NFR的具体预算与观察限制见[最终NFR矩阵](VERIFICATION.md)。交付审计会核对编号、证据状态和SHA，并检查当前dist资源与最终浏览器实际请求一致；审计本身不重新执行几何。

| 验收ID | 实际结果 | 证据 | 状态 |
| --- | --- | --- | --- |
| AC-001-1 | 开发/root/cad真实WASM资源/MIME/两个内核ready | [启动](learning/evidence/T-101-workspace-browser.json)、[最终同源](learning/evidence/T-403C2b2-nfr-root.json) | 通过 |
| AC-001-2 | WASM503和无WebGL都有明确错误/重试 | [启动失败](learning/evidence/T-101-workspace-browser.json)、[无WebGL](learning/evidence/T-103-viewport-browser.json)、[最终故障](learning/evidence/T-403C2b2-e2e-failures.json) | 通过 |
| AC-001-3 | dirty新建保存/丢弃/默认取消，清选择/草稿/历史 | [文件UI](learning/evidence/T-401B-file-ui-browser.json) | 通过 |
| AC-002-1 | resize/折叠/投影拾取一致，实际相机文件后拾取 | [视口](learning/evidence/T-103-viewport-browser.json)、[文件相机](learning/evidence/T-401B-file-ui-browser.json) | 通过 |
| AC-002-2 | 树/视口领域ID联动，隐藏不拾取/树可选 | [视口](learning/evidence/T-103-viewport-browser.json) | 通过 |
| AC-002-3 | 20次新建/冷开真实十实体，单canvas/单回调、GPU342→8/Worker2→0 | [资源适配](learning/evidence/T-403C2b1-viewport.json)、[最终20轮](learning/evidence/T-403C2b2-performance-transfer.json) | 通过 |
| AC-002-4 | 实际WebGL丢失/重建保留领域/指标/历史并继续编辑 | [最终故障](learning/evidence/T-403C2b2-e2e-failures.json) | 通过 |
| AC-003-1 | 三平面12数值记录，double投影往返≤1e-6mm | [平面](learning/evidence/T-103-plane.json) | 通过 |
| AC-003-2 | 编辑只影响当前草图，背景不收工具事件 | [三平面交互](learning/evidence/T-104C-edit-browser.json) | 通过 |
| AC-003-3 | 退出丢弃未完成预览，重编辑ID/约束保持 | [三平面交互](learning/evidence/T-104C-edit-browser.json) | 通过 |
| AC-004-1 | 40×30绘制、实际自由拖动/native坐标一致 | [绘制拖动](learning/evidence/T-104C-edit-browser.json) | 通过 |
| AC-004-2 | 共线/重合/零长/半径非法输入不改权威 | [绘制拒绝](learning/evidence/T-104C-drawing-replay-node.json)、[交互拒绝](learning/evidence/T-104C-edit-browser.json) | 通过 |
| AC-004-3 | Esc无历史，删除清理所有无主点/关联约束 | [编辑](learning/evidence/T-104C-edit-node.json)、[界面](learning/evidence/T-104C-edit-browser.json) | 通过 |
| AC-004-4 | 模型旋转后草图捕捉正确；三zoom 7.99/8/8.01px边界 | [视口捕捉](learning/evidence/T-104C-viewport-replay.json)、[编辑](learning/evidence/T-104C-edit-browser.json) | 通过 |
| AC-005-1 | 固定基点40×30/DOF0，拖动仍维持约束 | [全约束UI](learning/evidence/T-201C2-constraints-browser.json) | 通过 |
| AC-005-2 | 宽40→60领域/标注/后代同时更新 | [全约束UI](learning/evidence/T-201C2-constraints-browser.json)、[最终全过程](learning/evidence/T-403C2b2-current-browsers.json) | 通过 |
| AC-005-3 | 40/50真实冲突拒绝，旧文档/历史/实际保存保持 | [最终故障](learning/evidence/T-403C2b2-e2e-failures.json) | 通过 |
| AC-005-4 | 删除宽自由拖动，固定点更新原生DOF | [全约束UI](learning/evidence/T-201C2-constraints-browser.json) | 通过 |
| AC-005-5 | 12类型实际成功/非法对象，长度≤1e-5mm/方向≤1e-5rad | [领域类型](learning/evidence/T-201C2-constraint-native.json)、[方向](learning/evidence/T-201A-linear-native.json)、[相切51例](learning/evidence/T-201B2-tangency-native.json) | 通过 |
| AC-005-6 | 最新队列一在途，30拖动晚native回包Esc/new拒收 | [编辑队列](learning/evidence/T-104C-edit-node.json)、[最终故障](learning/evidence/T-403C2b2-e2e-failures.json) | 通过 |
| AC-006-1 | 40×30×10闭合外向，12000mm³ | [最终全过程](learning/evidence/T-403C2b2-current-browsers.json) | 通过 |
| AC-006-2 | 三平面负深度闭合外向/厚度轴正确 | [最终孔洞方向](learning/evidence/T-403C2b2-e2e-geometry.json) | 通过 |
| AC-006-3 | 开放/自交/相切相交孔/零深度明确拒绝 | [轮廓拒绝](learning/evidence/T-202C2b-ui-browser.json) | 通过 |
| AC-006-4 | 40×30减10×10孔，11000mm³ | [最终孔洞](learning/evidence/T-403C2b2-e2e-geometry.json) | 通过 |
| AC-006-5 | 三平面同尺寸±拉伸包围盒符合各世界轴 | [区域UI](learning/evidence/T-202C2b-ui-browser.json)、[最终方向](learning/evidence/T-403C2b2-e2e-geometry.json) | 通过 |
| AC-007-1 | 方块并/差/交12000/4000/4000mm³ | [最终布尔](learning/evidence/T-403C2b2-e2e-geometry.json) | 通过 |
| AC-007-2 | A−B x=[0,10]、B−A x=[20,30] | [最终布尔](learning/evidence/T-403C2b2-e2e-geometry.json) | 通过 |
| AC-007-3 | 分离交集显式empty、零三角面，无伪实体 | [布尔边界](learning/evidence/T-301B-boolean-ui-browser.json) | 通过 |
| AC-007-4 | 实际内核失败/空操作数保留旧文档/网格/redo | [真实布尔事务](learning/evidence/T-301A-mesh-booleans.json)、[后代回滚](learning/evidence/T-302B-affected-recompute-replay.json) | 通过 |
| AC-007-5 | 成功隐藏输入，undo/文件重开精确恢复显隐 | [最终布尔文件](learning/evidence/T-403C2b2-e2e-geometry.json) | 通过 |
| AC-008-1 | 来源改尺寸只重算其后代，稳定ID/真实几何 | [受影响调用计数](learning/evidence/T-302B-affected-recompute-replay.json)、[最终布尔](learning/evidence/T-403C2b2-e2e-geometry.json) | 通过 |
| AC-008-2 | 完整后代列表，Enter/Esc默认取消，明确级联一次历史 | [级联UI](learning/evidence/T-302B-feature-edit-browser.json)、[最终级联](learning/evidence/T-403C2b2-e2e-geometry.json) | 通过 |
| AC-008-3 | 晚后代失败不提交已算前代，旧redo/save bytes保持 | [受影响失败](learning/evidence/T-302B-affected-recompute-replay.json) | 通过 |
| AC-008-4 | schema拒绝DAG循环/悬空；名称/显隐零内核请求 | [最终领域](learning/evidence/T-403C2b2-domain.json)、[受影响计数](learning/evidence/T-302B-affected-recompute-replay.json) | 通过 |
| AC-008-5 | 历史草图重编辑，来源参数与ID保持 | [参数/级联UI](learning/evidence/T-302B-feature-edit-browser.json) | 通过 |
| AC-009-1 | 全命令/105混合操作、最近100条200次精确恢复 | [历史Node](learning/evidence/T-303-history-node.json)、[历史UI](learning/evidence/T-303-history-browser.json) | 通过 |
| AC-009-2 | undo后新分支清redo，保存token/dirty准确 | [历史Node](learning/evidence/T-303-history-node.json) | 通过 |
| AC-009-3 | 文档/诊断/网格快照一致，undo/redo零内核请求 | [历史Node](learning/evidence/T-303-history-node.json)、[最终全过程](learning/evidence/T-403C2b2-current-browsers.json) | 通过 |
| AC-009-4 | busy快捷键/入口禁止部分恢复，晚结果丢弃 | [历史UI](learning/evidence/T-303-history-browser.json) | 通过 |
| AC-010-1 | 领域/显隐/view一致，实际文件后相机拾取/继续编辑 | [文件相机](learning/evidence/T-401B-file-ui-browser.json)、[最终文件继续](learning/evidence/T-403C2b2-current-browsers.json) | 通过 |
| AC-010-2 | 纯领域JSON，无缓存/Three/指针/历史；冷重建成功 | [文件契约](learning/evidence/T-401A-project-files-node.json) | 通过 |
| AC-010-3 | 坏JSON/未来版本/引用/循环/非有限/UTF8>10MiB拒绝，旧权威保持 | [文件契约](learning/evidence/T-401A-project-files-node.json)、[最终坏文件](learning/evidence/T-403C2b2-e2e-failures.json) | 通过 |
| AC-010-4 | 实际IDB刷新明确恢复/放弃，旧read不覆盖手动打开 | [恢复](learning/evidence/T-401C-project-recovery-browser.json)、[最终刷新](learning/evidence/T-403C2b2-current-browsers.json) | 通过 |
| AC-010-5 | quota/abort/不可用提示，旧副本保持/手动下载可用 | [恢复故障](learning/evidence/T-401C-project-recovery-browser.json)、[最终quota](learning/evidence/T-403C2b2-e2e-failures.json) | 通过 |
| AC-010-6 | 名称纯文本、无HTML执行；文件仅解析校验数据 | [安全名称文件](learning/evidence/T-401B-file-ui-browser.json) | 通过 |
| AC-011-1 | 36真实导出/54实际下载独立解析闭合、法线、包围盒/体积 | [STL](learning/evidence/T-402-project-stl-browser.json)、[最终STL](learning/evidence/T-403C2b2-current-browsers.json) | 通过 |
| AC-011-2 | 只导出选中实体缓存，隐藏来源/Scene辅助不混入 | [单实体STL](learning/evidence/T-402-project-stl-browser.json) | 通过 |
| AC-011-3 | empty/非有限/不闭合/Float32损失拒绝；mm提示 | [STL拒绝](learning/evidence/T-402-project-stl-node.json)、[UI拒绝](learning/evidence/T-402-project-stl-browser.json) | 通过 |
| AC-012-1 | solver/solid/轮廓/WASM/保存稳定错误码和明确恢复入口 | [启动](learning/evidence/T-101-workspace-browser.json)、[轮廓](learning/evidence/T-202C2b-ui-browser.json)、[最终故障](learning/evidence/T-403C2b2-e2e-failures.json) | 通过 |
| AC-012-2 | 实际预览取消/晚结果拒收、10s超时后新Worker恢复 | [最终故障](learning/evidence/T-403C2b2-e2e-failures.json) | 通过 |
| AC-012-3 | busy中实际平移/缩放，重复提交禁用，折叠不破坏在途操作 | [交互生命周期](learning/evidence/T-401B-interaction-replay.json) | 通过 |
| AC-012-4 | 原子文档/cache/诊断，同revision对应树/面板/保存；失败不更新部分权威 | [历史](learning/evidence/T-303-history-node.json)、[最终文件与传播](learning/evidence/T-403C2b2-e2e-geometry.json) | 通过 |

## 交付与边界

E2E-01—05最后完整三浏览器复跑没有通过注入假几何补齐操作；实际文件下载/解析、真实Worker/WASM/CSG和真实WebGL上下文均有记录。存储配额及晚回复实验只改变外部失败或结果交付，不改变几何内核或10000ms截止。

T-404已重装锁定依赖65包并更新90包来源清单，[npm ci](learning/evidence/T-404-npm-ci.log)、[类型检查和构建](learning/evidence/T-404-build.log)保留真实输出。最终[交付审计](learning/evidence/T-404-delivery-audit.json)记录证据SHA、锁文件/构建资源与编号覆盖，不声称重新执行全部历史任务。原始字节来源另经[27项分发核对](learning/evidence/T-404-distribution.json)。

已知边界见[README](../README.md)：2000面布尔输入/2000桥顶点、默认曲线/闭合容差、非流形接触拒绝、10MiB文件、Float32 STL精度拒绝、桌面布局和固定机器性能。P1/P2不计完成条件。生产>500kB提示、失败实验和测试观察局限保留。技术交付与用户复述分开，学习掌握未记录。
