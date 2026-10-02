# 实施任务与交接

更新：2026-10-02。用户已授权连续开发至会话预算耗尽，以辅助学习为主要目标。M0 gate与M1（T-101—104）完成，T-201完成，REQ-005六项AC已验证，T-202轮廓/拉伸已完成，REQ-006五项AC有证据，T-203参数/曲线/孔洞历史回归已完成，M2完成，T-301A真实网格布尔/原子管线已完成，T-301B工作区布尔完成，REQ-007五AC有证据，T-302A/B与REQ-008已完成，现有拉伸参数/级联确认及真实历史有证据；按用户要求完成本子任务后暂停，下一T-303。每个子任务的实现、学习记录、证据和交接共同组成一个commit。

状态：todo / doing / blocked / done。不得将文档规划当作 done。M0 gate 不通过时只处理技术验证，不建设完整编辑器。

## 学习准备与仓库同步

| ID | 状态 | 交付物 | 完成条件 |
| --- | --- | --- | --- |
| T-L01 | done | `docs/learning/`、更新的项目约定 | 技术拆分、任务关联、统一模板、真实状态与项目地图齐全；Markdown 与内部链接检查通过 |
| T-G01 | done | Git 仓库与首次远程同步 | 文档提交成功；远程分支 SHA 与本地提交一致；不覆盖既有远程历史 |

学习单元和实施任务是不同维度，映射见 `docs/learning/ROADMAP.md`。所有实现任务仍需满足各自完成条件。

## M0：技术验证

| ID | 状态 | 依赖 | 交付物 | 完成条件 |
| --- | --- | --- | --- | --- |
| T-001 | done | 无 | `docs/UPSTREAM.md`、第三方清单 | 固定 upstream SHA；核对源码/WASM 来源、许可证、可重建方法及拟复用路径；实际重建由 T-003 验证 |
| T-002 | done | T-001 | 最小 Vue/Vite/TS 工程、锁文件 | 无 React/Redux；启动、类型检查、构建和生产预览可用；记录 Node/npm/依赖实际版本 |
| T-003 | done | T-002 | solver adapter + Worker 验证页 | 真实矩形尺寸、圆弧/相切、矛盾约束、重复求解；原生 DOF 0/1；生产与 `/cad/` 路径通过 |
| T-004 | done | T-002 | solid adapter + 网格验证夹具 | 19 项真实几何检查、16 个 STL 往返；三入口 Worker；非流形接触明确拒绝 |
| T-005 | done | T-003,T-004 | `docs/TECH-SPIKE.md` | 真内核同页并行，三入口实际 10s 超时/恢复；矩阵/限制/版本/PRD/ADR 已同步 |

M0 gate：T-005 已完成，依据见 [TECH-SPIKE](TECH-SPIKE.md)。可以开始 M1；不代表完整 P0/E2E 或学习复述通过。

## M1：工作区、领域模型与草图

| ID | 状态 | 依赖 | 覆盖需求 | 完成条件 |
| --- | --- | --- | --- | --- |
| T-101 | done | T-005 | REQ-001,REQ-012 | Vue/Pinia 工作区壳、纯状态机、真内核加载/错误重试；未实现操作禁用 |
| T-102 | done | T-005 | REQ-008,REQ-009,REQ-010（基础） | 领域类型、schema 校验、命令/事务基础、稳定 ID 与 DAG 校验 |
| T-103 | done | T-101,T-102 | REQ-002,REQ-003 | 正交相机、Z-up、三基准面、选择联动、resize/dispose/context 恢复 |
| T-104 | done | T-103 | REQ-004 | 线/矩形/圆/三点圆弧、捕捉、删除与 Esc；绘制作为可撤销命令 |

### T-104 的学习子任务

2026-10-02：为保持每个技术实验与 commit 可独立审阅，将 T-104 拆成下列子任务；不放宽整体完成条件。

| ID | 状态 | 依赖 | 完成条件 |
| --- | --- | --- | --- |
| T-104A | done | T-103 | 领域点/线/圆/圆弧映射至真实 WASM；默认绘制约束、独立残差与失败事务；Worker/生产路径 |
| T-104B | done | T-104A | 绘制工具、三点圆弧、8 CSS px 捕捉和显式 coincident、取消预览、可撤销提交 |
| T-104C | done | T-104B | 端点拖动最新队列与一手势一命令、删除清理、快捷键焦点、三入口完整 REQ-004 回归 |

## M2：求解与拉伸

| ID | 状态 | 依赖 | 覆盖需求 | 完成条件 |
| --- | --- | --- | --- | --- |
| T-201 | done | T-104,T-003 | REQ-005,REQ-012 | 所有 P0 约束 UI/adapter、残差校验、错误回滚、乱序丢弃与拖动节流 |
| T-202 | done | T-201 | REQ-006 | 连通轮廓、外轮廓与孔洞分类、自交检查、三平面/正负深度拉伸 |
| T-203 | done | T-202 | REQ-005,REQ-006,REQ-009 | 矩形尺寸和曲线/孔洞夹具；撤销重做保持几何与约束一致 |

### T-201 的学习子任务

按新增原生语义划分，不改变完整 REQ-005 的验收条件；每个子任务一个 commit。

| ID | 状态 | 依赖 | 完成条件 |
| --- | --- | --- | --- |
| T-201A | done | T-104 | parallel/perpendicular/angle/equal 真实适配、单位/方向/独立残差、非法组合与 Worker |
| T-201B | done | T-201A | P0 全相切组合、接触方向与弧范围验证、真实成功/非法输入和失败事务 |
| T-201C | done | T-201B | 约束面板/数值/删除/DOF、40→60与冲突/拖动/三入口完整REQ-005回归 |

T-201B继续拆分原生接触表达与领域集成，保留完整B完成条件：

| ID | 状态 | 依赖 | 完成条件 |
| --- | --- | --- | --- |
| T-201B1 | done | T-201A | 真实辅助接触点表达、外切/内切/弧圆及有限范围反例，可重做证据 |
| T-201B2 | done | T-201B1 | 全领域相切/范围/方向/失败事务、Worker和三入口回归；完成后才将B标done |

T-201C先隔离真实诊断的一致性，再接面板；保持C整体验收条件：

| ID | 状态 | 依赖 | 完成条件 |
| --- | --- | --- | --- |
| T-201C1 | done | T-201B2 | 真实诊断随候选原子提交/撤销/回滚，元数据操作保留、空/新项目无猜测DOF |
| T-201C2 | done | T-201C1 | 全约束面板/数值/删除/标注/DOF与三入口完整REQ-005验收 |

### T-202 的学习子任务

按独立几何问题推进，不放宽整体验收条件：

| ID | 状态 | 依赖 | 完成条件 |
| --- | --- | --- | --- |
| T-202A | done | T-201 | 双精度圆/弧细分，弦误差0.05mm/步进5度/圆至少24/上限4096明确拒绝，真实求解后验证 |
| T-202B | done | T-202A | 端点连通/闭合、自交与曲线接触检查、外轮廓/孔洞分类、多区域显式选择（core API，UI由C接入） |
| T-202C | done | T-202B | 通用拉伸适配与Worker、三平面正负深度/孔洞证据、预览/取消/事务/UI |

C拆成网格证据和交互集成，每项一个commit，完整REQ-006条件不变：

| ID | 状态 | 依赖 | 完成条件 |
| --- | --- | --- | --- |
| T-202C1 | done | T-202B | 一般拉伸adapter/Worker、三平面正负深度/直边孔/曲线/闭合方向体积及非法输入证据 |
| T-202C2 | done | T-202C1 | 区域选择UI/有符号深度、真实预览与取消、原子提交/历史、三入口完整REQ-006验收 |

C2先隔离原子特征管线/最新预览，再接界面与完整验收：

| ID | 状态 | 依赖 | 完成条件 |
| --- | --- | --- | --- |
| T-202C2a | done | T-202C1 | 真实Sketch→Extrude原子缓存/诊断/历史、最新预览队列/取消/失败/迟到证据 |
| T-202C2b | done | T-202C2a | 区域选择与深度UI、临时网格所有权、实际三入口预览/取消/提交及完整REQ-006 |

## M3：CSG 与参数化历史

| ID | 状态 | 依赖 | 覆盖需求 | 完成条件 |
| --- | --- | --- | --- | --- |
| T-301 | done | T-203,T-004 | REQ-007 | union/subtract/intersect、A/B 选择、empty 结果和失败恢复 |
| T-302 | done | T-301 | REQ-008,REQ-012 | 特征树、拓扑重算、级联删除、事务缓存、稳定ID；E2E-02几何/传播/级联/历史，文件往返待T-401，完整场景待T-403 |
| T-303 | todo | T-302 | REQ-009 | 全命令覆盖、100 步历史、保存快照 dirty 状态、异步计算时一致性 |

### T-301 的学习子任务

| ID | 状态 | 依赖 | 完成条件 |
| --- | --- | --- | --- |
| T-301A | done | T-203,T-004 | 真实世界网格CSG/Worker、明确empty/错误码、原子隐藏/失败/取消与后代管线 |
| T-301B | done | T-301A | 工作区A/B与顺序、结果/empty、实际确认/取消/历史和完整REQ-007 |

### T-302 的学习子任务

| ID | 状态 | 依赖 | 完成条件 |
| --- | --- | --- | --- |
| T-302A | done | T-301 | 不可变基线与受影响DAG重算、实际调用计数、复用/冷重建/失败历史 |
| T-302B | done | T-302A | 特征依赖说明/级联影响列表与明确确认、已有拉伸参数编辑、完整REQ-008 |

## 审查修复

| ID | 状态 | 覆盖需求 | 完成条件 |
| --- | --- | --- | --- |
| T-R01 | done | REQ-006/009/012 | 折叠保留拉伸生命周期；计算中可导航；三入口真实晚回复、一次历史、隐藏取消与WebGL恢复通过 |

用户2026-10-02仅授权修复本次审查的两个问题。T-303仍todo，连续开发继续暂停。

## M4：文件、导出与交付

| ID | 状态 | 依赖 | 覆盖需求 | 完成条件 |
| --- | --- | --- | --- | --- |
| T-401 | todo | T-303 | REQ-010 | JSON 保存/打开、运行时校验、标准文件回退、IndexedDB 恢复和失败提示；补齐E2E-02文件往返 |
| T-402 | todo | T-303 | REQ-011 | 单实体 binary STL、单位说明、导出前闭合检查和独立解析 |
| T-403 | todo | T-401,T-402 | REQ-001—012,NFR-001—007 | E2E-01—05、生产子路径、三浏览器、性能/资源生命周期验收 |
| T-404 | todo | T-403 | 全部 | README 运行说明、第三方声明、已知限制、最终 `docs/VERIFICATION.md` |

## 目标源码组织

以下为目标结构。当前已有工作区、领域/schema/DAG/事务历史、独立真实 Three 视口与空草图生命周期及真内核适配层/Worker/指定夹具；绘制/拖动/实体删除、受影响实体重算和级联/参数编辑已接入，文件及最终验收尚未完成。实施时可按职责细化，不得打破 core 边界。

```text
src/
  app/                 # 事务、调度、文档 session、应用服务
  components/          # Vue 工作区、工具栏、树、属性/约束面板
  composables/         # Vue 生命周期与应用服务连接
  stores/              # Pinia：UI 状态、选择 ID、文档快照
  core/
    model/             # schema、实体/约束/特征与校验
    commands/          # 成功提交、撤销/重做
    geometry/          # 2D 轮廓、坐标与数值规则
    features/          # 依赖图、重算顺序和契约
  adapters/
    viewport/          # Three.js、拾取、渲染、释放
    solver/            # SolveSpace WASM 映射
    solid/             # 拉伸、网格 CSG、几何验证
    persistence/       # 文件/IndexedDB/schemaVersion
  workers/             # Worker、协议、超时与取消
tests/
  unit/                # 领域、轮廓、事务、竞态
  integration/         # 真求解器、真 CSG、文件重建
  e2e/                 # 浏览器用户闭环
  fixtures/            # PRD 的确定性几何输入
public/wasm/           # 需 T-001/T-003 确认的资源布局
```

## 目标验证命令

T-002 已建立下列命令，实际版本见 [第三方清单](third-party/README.md)。Windows 当前会话先按 README 切换到锁定的 Node/npm：

```text
npm ci
npm run dev
npm run typecheck
npm run build
npm run preview
npm run learn:typecheck
npm run check:bootstrap
npm run check:solver
npm run check:solver:browser
npm run record:solver
npm run check:solid
npm run check:solid:browser
npm run check:worker
npm run check:gate
npm run check:workspace:state
npm run check:workspace
npm run check:domain
npm run check:project
npm run check:plane
npm run check:viewport
npm run check:domain-solver
npm run check:domain-solver:browser
npm run check:drawing
npm run check:drawing:browser
npm run check:sketch-edit
npm run check:sketch-edit:browser
npm run check:linear-constraints
npm run check:linear-constraints:browser
npm run record:toolchain
npm run check:docs
```

`npm run test`、`npm run test:e2e` 尚未建立；后续领域/几何测试可使用 Vitest，完整浏览器闭环可使用 Playwright。当前 bootstrap 检查只证明最小页面的开发/生产运行链。几何正确性必须有数值断言，不只做视觉截图。

## 验证记录要求

`docs/VERIFICATION.md` 至少记录：需求/AC ID、fixture、环境、命令、实际结果、容差、失败原因和证据文件路径。性能记录基准机、模型规模、预热/采样方法。没有执行的检查明确标记未执行。

## 当前交接

- 已完成：T-001 来源、T-002 工程、T-003 真实求解、T-004 真实 CSG/孔洞/STL 及 Worker 指定夹具。
- 当前重点：以学习单元推进 M1；学习掌握状态尚待用户反馈。
- 已通过：M0 技术 gate，两内核同页与默认 10 秒恢复；学习复述未记录。
- 已完成：T-101 工作区壳、状态机、真实启动与错误恢复；T-103 正交视口、平面/拾取/真实 context 恢复和空草图生命周期。
- 已完成：T-102 领域/schema/DAG/原子历史基础和项目元数据操作；完整 P0/E2E 尚未验收。
- 默认技术方案：Vue 3 + TS + Three.js；SolveSpace WASM + 网格 CSG。
- 已完成：T-104A真实领域adapter/Worker/事务前置；T-104B真实绘制/8px捕捉/取消/连续线与撤销。
- 已完成：T-104C最新拖动队列/一手势一命令、删除引用清理与完整REQ-004回归；整体T-104 done。
- 已完成：T-201A方向/角度/相等适配与独立残差；整体T-201 still doing。
- 下一步：T-201B / L-006E，全相切组合/接触位置与独立残差，随后C面板。

## 任务交接记录

### T-L01：学习资料准备（2026-10-01）

```text
任务 ID：T-L01
状态：done
覆盖需求 ID：LEARN-001；关联 REQ-001—012 的学习拆分，不代表功能通过
修改文件：README.md、AGENTS.md、docs/PRD.md、docs/DECISIONS.md、docs/TASKS.md、docs/learning/README.md、ROADMAP.md、PROGRESS.md、TEMPLATE.md、notes/L-000-project-map.md、scripts/check-docs.mjs、.gitattributes
执行验证（命令、环境、结果）：Windows / PowerShell 7.6 / Node v20.11.1；node scripts/check-docs.mjs 通过，检查 10 个 Markdown 文件与 21 个本地文件链接；检查了 UTF-8、标题层级、代码围栏、行尾空格和学习表格最多四列
未覆盖验收条件：LEARN-001 文档交付条件已覆盖；尚未运行应用、几何与浏览器验收；未验证 Mermaid 的视觉渲染
已知限制/阻塞：学习基础暂按基础 JS 编排；用户复述与独立练习尚未发生，不标记已掌握
下一任务：T-G01；随后以 L-001A/L-006A 对应 T-001 开始来源调查
```

### T-G01：GitHub 首次同步（2026-10-01）

```text
任务 ID：T-G01
状态：done
覆盖需求 ID：用户要求上传 GitHub；关联 NFR-007 的可追踪记录，尚不代表应用依赖与 WASM 已锁定
修改文件：本地 Git 仓库、.gitattributes、docs/TASKS.md、docs/learning/PROGRESS.md
执行验证（命令、环境、结果）：Windows / PowerShell 7.6 / Git；git ls-remote --heads 确认远程无已有分支；git init -b main、git commit、git push -u origin main 成功；git diff --cached --check 通过
首次同步证据：本地 HEAD 与 git ls-remote origin refs/heads/main 均为 dd6bc6143835853f22681dc3d44104bf6b55461e；git status --short --branch 显示 main...origin/main 且无改动
远程：https://github.com/Caiij404/three-cad；默认跟踪 origin/main
未覆盖验收条件：没有应用可运行；本次只上传需求和学习准备资料；后续本交接记录的提交另行同步，不修改首次同步证据
已知限制/阻塞：无 Git 同步阻塞；不覆盖远程历史，不使用 force push
下一任务：T-001，先以 L-001A/L-006A 说明上游来源和真实 WASM 构建链
```

### T-001：上游来源与重建入口（2026-10-01）

```text
任务 ID：T-001
状态：done
覆盖需求 ID：NFR-007 来源/构建说明部分、LEARN-001；REQ-005/REQ-012 为前置调查，功能 AC 未通过
修改文件：docs/UPSTREAM.md、docs/third-party/*、docs/VERIFICATION.md、docs/learning/notes/L-001A-source-provenance.md、docs/learning/evidence/*、scripts/audit-upstream.mjs、scripts/probe-float32.mjs、patches/solvespace-js-array.patch、README/PRD/DECISIONS/TASKS/AGENTS、学习进度及入口、.gitignore/.gitattributes、文档检查忽略配置
执行验证（命令、环境、结果）：Windows / PowerShell 7.6 / Node v20.11.1 / Git 2.40.1.windows.1；node scripts/audit-upstream.mjs --check 验证四个固定仓库、33 个文件指纹及两个子模块指针；WebAssembly.Module 解析旧二进制导出通过但未实例化；node scripts/probe-float32.mjs 复现两项超出 1e-5 mm 的转换误差；git apply --cached --check 验证最小索引补丁匹配固定源码；Markdown/本地链接检查和 git diff --check 通过
未覆盖验收条件：新 solver 实际编译、真实求解/DOF/残差、Worker、CSG、生产路径及浏览器均未执行；旧 libslvs.a 的原始构建链未补全，已明确拒绝复用
已知限制/阻塞：SDK/CMake/Ninja 当前 PATH 未发现；仅提出已定位目标的重建方法，尚无成功构建记录；不把旧 WASM 的格式验证当成求解证据；用户复述未记录
下一任务：T-002 / L-001B，最小 Vue/Vite/TS 工程；后续 T-003 实际验证重建方法
```

### T-002：最小 Vue / TypeScript / Vite 工程（2026-10-01）

```text
任务 ID：T-002
状态：done
覆盖需求 ID：NFR-007 的 npm 锁定/来源部分、LEARN-001；REQ-001 为启动前置，AC-001-1 尚未通过（没有真实求解器）
修改文件：package.json/package-lock.json、Node/npm 配置、index.html、vite.config.ts、tsconfig.json、src/*、scripts/setup-node.ps1/use-node.ps1/probe-typecheck.mjs/check-bootstrap.mjs/record-toolchain.mjs、public/THIRD_PARTY_NOTICES.txt、docs/third-party/*、L-001B 学习笔记及三份证据、README/AGENTS/PRD/DECISIONS/TASKS/VERIFICATION、学习入口/路线/进度、.gitattributes
执行验证（命令、环境、结果）：Windows x64 / PowerShell 7.6 / Node v24.21.0 / npm 11.19.0 / Edge 154.0.4258.48；官方 Node 归档 SHA-256 匹配；npm ci 重新安装 49 个包；npm run typecheck/build 通过；实际 npm run dev/preview 两入口 HTTP 200；npm run check:bootstrap 开发/生产计数 0→1、未实现操作禁用、390 px 无横向溢出、浏览器无错误；npm run learn:typecheck 观测 TS2345 退出 2 与独立 Vite 退出 0；npm run record:toolchain 登记 74 个锁定包（49 个在本平台安装）；文档/内部链接与 git diff --check 通过
未覆盖验收条件：T-002 完成条件已覆盖；真实求解、DOF/残差、CSG/几何、Worker、/cad/ WASM 资源、完整 P0 与三浏览器均未验证
已知限制/阻塞：TypeScript 7.0.2 与当前 vue-tsc 的实际检查失败，改锁 6.0.3 后通过；Windows 便携运行时与已安装 Edge 为本次环境，其他系统/浏览器未实测；学习复述未记录；全局 Node 未更改
下一任务：T-003 / L-006A，固定官方 SolveSpace 源码真实构建与 Worker 求解；任务内分步验证，整项完成后一个 commit
```

### T-003：真实 WASM 与 Worker 求解（2026-10-01—02）

```text
任务 ID：T-003
状态：done
覆盖需求 ID：REQ-001/AC-001-1 的 solver 资源加载部分、REQ-005 指定夹具、REQ-012 的 Worker 前置、NFR-007、LEARN-001；不代表完整功能 AC 通过
修改文件：solver core 类型/adapter/Worker/fixture/验证页、三个源码补丁、SDK 准备和构建/检查/来源脚本、自建 public/wasm 与许可、LICENSE/package/config、L-006A/B 学习笔记、构建/Node/浏览器证据、需求/决策/交接/来源/学习入口
执行验证（命令、环境、结果）：Windows x64 / PowerShell 7.6 / Node 24.21.0 / npm 11.19.0 / Edge 154.0.4258.48；Emscripten 4.0.8 + CMake 3.31.8 + Ninja wheel 1.13.2 编译固定 SolveSpace 2879a02d 成功；setup-solver 在已准备环境重复通过；record:solver 核对来源/补丁/许可/产物；typecheck/build 通过；check:solver 8 项真实检查、60 次矩形、5 项非法输入通过，热身后缓冲区稳定 40304640 bytes；check:solver:browser 开发/生产/cad 三入口各 8 项真实 Worker 检查、WASM MIME 和 503 重试通过；check:bootstrap 与 check:docs 通过；最终 cached diff 检查发现原始许可/日志/生成文件空白，不能记为全部通过，T-004 补充字节保留属性
未覆盖验收条件：完整 P0 约束与 UI、文档事务/撤销/拖动、人为乱序/超时、全环境一键安装和其他系统/浏览器、CSG 与 M0 gate 未验证
已知限制/阻塞：只支持 M0 子集；首次内存扩展不是泄漏证据，热身稳定也不是完整原生泄漏证明；Windows gitdir 与 Vite SDK HTML 扫描问题已实测修复；用户复述未记录
下一任务：T-004 / L-009A；核对 T-002 依赖后验证真实 CSG 和孔洞网格，不进入完整编辑器
```

### T-004：真实 CSG、孔洞与 STL 前置（2026-10-02）

```text
任务 ID：T-004
状态：done
覆盖需求 ID：REQ-006/007/011 指定几何夹具前置、REQ-012 Worker 前置、NFR-007、LEARN-001；完整功能 UI 与 AC 未通过
修改文件：mesh 数字契约/独立指标、未修改固定 CSG 核心与自写 bridge/Worker/client、孔洞三角化与 STL 导出/独立解析、固定夹具和检查脚本、Three.js 锁文件/声明/来源、三篇学习笔记与数值/浏览器/分发证据、README/PRD/ADR/任务/进度；Git 原始生成文件与许可证字节属性
执行验证（命令、环境、结果）：Windows x64 / PowerShell 7.6 / Node 24.21.0 / npm 11.19.0 / Edge 154.0.4258.48；Three.js 0.186.1 + @types/three 0.186.0；npm run check:solid：19 项真实几何、16 个独立 STL 往返、5 个非法输入、2 个非流形 union 拒绝、4 个验证器负向检查通过；build/typecheck、check:solid:browser（开发/生产/cad 各 19 项）、check:bootstrap、check:docs、cached diff 检查通过；check-distribution --staged 核对实际原始产物/许可与 Git index 字节一致
未覆盖验收条件：任意轮廓分类/自交/曲线、通用实体命令与编辑/导出 UI、任意退化几何、完整性能场景与三浏览器、文档事务/超时/乱序；M0 gate 待 T-005
已知限制/阻塞：原始扇形 union 虽体积正确但有 12 条未配对边；自写边界一致三角化修复后通过，最多 2000 顶点；边/顶点相切 union 非流形明确拒绝；Node/STL 限于小夹具；T-003 原始字节/行尾检查问题在本任务纠正，保留其提交历史；用户复述未记录
下一任务：T-005 / L-012A，确认两内核兼容矩阵、限制与 gate，不用完整产品验收替代前置验证
```

### T-005：M0 集成 gate（2026-10-02）

```text
任务 ID：T-005
状态：done
覆盖需求 ID：REQ-001/005/006/007/011/012 的技术前置、NFR-007、NFR-004 默认截止前置、LEARN-001；完整功能/性能 AC 未通过
修改文件：TECH-SPIKE、共享 WorkerRpc/两个客户端与协议、gate 真实双内核/静默 Worker 实验与页面、8 项协议测试/浏览器 gate 脚本与证据、L-007A/L-012A、README/PRD/ADR/任务/学习进度
执行验证（命令、环境、结果）：Windows x64 / Node 24.21.0 / npm 11.19.0 / Edge 154.0.4258.48，i7-13700KF / 34163970048 bytes RAM / RTX 4070 Ti；check:worker 8 项通过；build/typecheck 通过；check:gate 开发/生产/cad 两内核并行 8+19 数值夹具、30 次热身后各内核采样、默认真实 10 秒超时与新 solver 60 mm 恢复通过；协议改变后重放 check:solver:browser 资源/MIME/503 重试通过；文档/内部链接和 cached diff 通过
未覆盖验收条件：完整 P0/E2E、文档 revision 权威/原子事务/拖动、transferable 大网格、100 线/100 约束/10 实体/10 万面性能、三浏览器与长时间泄漏
已知限制/阻塞：小夹具 p95 solver 0.3—0.4 ms / solid 1.1—1.2 ms 仅作实测记录；控制端口单测不作几何证据；BSP/曲线/精度限制沿用 TECH-SPIKE；用户复述未记录
下一任务：T-101 / L-003A；M0 gate 实际通过，允许进入 M1
```

### T-101：Vue/Pinia 工作区与状态（2026-10-02）

```text
任务 ID：T-101
状态：done
覆盖需求 ID：REQ-001 工作区/真实 solver 加载与 WASM 错误入口部分、REQ-012 状态前置、NFR-002/006/007 前置、LEARN-001；完整 AC 未通过
修改文件：App/独立 M0 入口/Workspace、纯状态机/Pinia store/KernelBootstrap、样式、Pinia 锁文件与 8 个原声明、状态/浏览器/来源检查与证据、L-003A、README/PRD/ADR/任务/验证/学习进度
执行验证（命令、环境、结果）：Windows x64 / Node 24.21.0 / npm 11.19.0 / Edge 154.0.4258.48 / Pinia 4.0.3；4 个状态边界测试通过；typecheck/build 通过；check:workspace 开发/生产/cad 真内核启动、503 明确错误/重试、视图重挂载和 1280/1024/390 布局通过；check:bootstrap 独立实验入口通过；1280×720 截图已查看（仅排版）；check-distribution --task=T-101 --staged 核对 27 文件原字节；docs/cached diff 通过
未覆盖验收条件：Three 视口/坐标轴/平面及 WebGL 错误、可编辑文档/新建重置/撤销/保存、完整建模模式操作、三浏览器与完整资源生命周期
已知限制/阻塞：工作区壳不能绘制；模式图有单测但绘制按钮禁用；generation 只保护 UI 加载，不替代文档事务；用户复述未记录
下一任务：T-102 / L-002A，纯领域与事务基础；M0 与 T-101 依赖已满足
```

### T-102：领域校验与原子历史基础（2026-10-02）

```text
任务 ID：T-102
状态：done
覆盖需求 ID：REQ-008/009/010 的类型、DAG、稳定 ID、schema 与事务/历史基础；REQ-001 新建前置；LEARN-001；完整 AC 未通过
修改文件：core/model/features/commands、app/ProjectSession/注入、Pinia 普通文档快照、Workspace 项目操作/样式、领域/事务/浏览器检查、两篇学习笔记与数值/日志/浏览器证据、README/AGENTS/PRD/ADR/任务/验证/学习入口
执行验证（命令、环境、结果）：Windows x64 / PowerShell 7.6 / Node 24.21.0 / npm 11.19.0 / Edge 154.0.4258.48 / Three 0.186.1；check:domain 15 项通过，7 个 core 文件无 Vue/Pinia/DOM/Three 依赖；真实 CSG 深度 20→30→undo→redo 体积 8000→12000→8000→12000 mm³，绝对误差≤1e-8，闭合/ID稳定；typecheck/build 通过；check:project 三入口重命名/新建保护/撤销分支/快捷键焦点/文字安全/视图切换通过；check:workspace 三入口启动/503/布局回归通过，原 T-101 证据保留；文档和 cached diff 检查通过
未覆盖验收条件：完整 REQ-008/009/010、通用几何命令/后代重算、绘制/约束/拖动历史、保存/打开/自动恢复、Three 视口、完整 P0/E2E、三浏览器/性能
已知限制/阻塞：固定矩形真实 CSG 桥接只作事务夹具，不是通用拉伸；应用尚无几何重算入口，几何命令明确拒绝；保存 UI 禁用，dirty 算法验证不能代替文件保存；用户复述未记录
下一任务：T-103 / L-004A、L-005A，真实视口与平面坐标；依赖已满足
```

### T-103：真实 Three 视口与空草图生命周期（2026-10-02）

```text
任务 ID：T-103
状态：done
覆盖需求 ID：REQ-001 WebGL 分支与坐标/平面前置、REQ-002 视口/选择/resize/context/新建生命周期、REQ-003 坐标与空草图生命周期、LEARN-001；完整功能 AC 未通过
修改文件：纯 plane 函数、独立 viewport runtime/SFC、Workspace 树/平面/空草图/属性/快捷键/样式、明确的空草图事务回调、数值/浏览器/资源夹具与证据、历史回归独立输出、三篇学习笔记、README/AGENTS/PRD/ADR/任务/验证/进度
执行验证（命令、环境、结果）：Windows x64 / Node 24.21.0 / npm 11.19.0 / Edge 154.0.4258.48 / Three 0.186.1 / DPR=2 / ANGLE RTX 4070 Ti D3D11；check:plane 2 测试、12 基准面数值记录通过，往返误差 0≤1e-6 mm；check:viewport 开发/root/cad 四类拾取与真实 8000 mm³ CSG 实体、resize/鼠标/模式/隐藏/树联动/实际 context 扩展恢复通过，每入口20次模型重置资源稳定8geometry/1canvas且回调单次，20次实际新建清空项目，dispose后资源/画布0；无WebGL故障注入解除后重试恢复；typecheck/build、15项领域与三入口项目/工作区回归、文档/cached diff通过
未覆盖验收条件：非空绘制/捕捉/拖动/完整求解、一般实体命令、文件打开20次、完整AC-003-3、相机文件保存、长期浏览器/驱动堆、完整P0/E2E/三浏览器/性能
已知限制/阻塞：空草图无方程/缓存，恒等回调拒绝任何非空几何，不当作模拟求解成功；Float32仅显示；近平行填充过滤、交点选择歧义已说明；独立夹具不进入普通构建；生产包约688kB的chunk提示保留；用户复述未记录
下一任务：T-104 / L-005B，真实绘制与捕捉/撤销命令；依赖已满足
```

### T-104A：真实领域草图求解前置（2026-10-02）

```text
任务 ID：T-104A
状态：done；T-104整体仍doing
覆盖需求 ID：REQ-004/005/012的领域实体/默认绘制约束/事务技术前置、LEARN-001；完整功能AC未通过
修改文件：领域解数据契约、native类型扩充/自写领域adapter、专用Worker/client、app真实sketch-only回调与服务销毁、交互式学习实验、12项fixture/原子Worker事务/Node与浏览器检查、L-006C、来源/验证/任务/学习入口与回归独立证据
执行验证（命令、环境、结果）：Windows x64 / Node24.21.0 / npm11.19.0 / Edge154.0.4258.48 / 固定SolveSpace2879a02d自建WASM（产物未改）；check:domain-solver 12项真实矩形/圆/方向圆弧/重合/距离/相切/冲突/拖动提示、4项拒绝和真实事务通过，独立残差≤1e-5；check:domain-solver:browser 开发/root/cad真实专用Worker、资源200/MIME、503重试、40→60→undo→redo及冲突文档/历史不变通过；原M0 8项/重复负载、15领域/9core边界、8协议、bootstrap/项目和全视口回归通过；typecheck/build/docs/cached diff通过
未覆盖验收条件：绘制/8px捕捉/取消预览/删除/完整手势队列，全部P0约束、一般实体后代重算、文件和完整P0/E2E/三浏览器/性能
已知限制/阻塞：仅sketch-only，最多2000元素；支持8种约束的指定范围，其他类型明确拒绝；候选中全部非空草图都求解，分支优化待T-302；markDragged提示不是手势队列通过；绘制按钮未启用；用户复述未记录
下一任务：T-104B / L-005B，屏幕捕捉到显式coincident与绘制命令；随后T-104C
```

### T-104B：真实二维绘制与屏幕捕捉（2026-10-02）

```text
任务 ID：T-104B
状态：done；T-104整体仍doing
覆盖需求 ID：REQ-003/004/012绘制、捕捉、取消与历史部分；LEARN-001；拖动/实体删除未验收
修改文件：core绘制/圆弧/捕捉、视口射线与预览、Vue输入工具/精确坐标、项目取消权威、16项领域回归及3项绘制/12项真实native/三入口浏览器与视口缩放实验、L-005B和证据/状态文档
执行验证（命令、环境、结果）：Windows x64 / PowerShell7.6 / Node24.21.0 / npm11.19.0 / Edge154.0.4258.48；check:drawing 3纯函数+12真实工具×平面通过，残差≤1e-5；check:drawing:browser开发/root/cad各三平面40×30矩形、r10圆、三点圆弧、7px端点显式coincident、连续线一段一命令、undo/redo/再次编辑稳定ID、共线失败/预览Esc不改文档通过；冷native加载取消后新Worker恢复；check:domain16/10core边界、check:viewport三zoom的7.99/8/8.01px与真实WebGL/资源、check:project/workspace三入口回归、typecheck/build/docs/cached diff通过
未覆盖验收条件：AC-004-1拖点、AC-004-3实体删除、完整实际手势最新队列；全部P0约束/通用后代重算/文件/三浏览器/性能
已知限制/阻塞：圆半径点/圆弧过点是构造输入，只对持久点建立捕捉约束；预览不入文档；sketch-only范围沿用A；生产约709kB chunk提示保留；用户复述未记录
下一任务：T-104C / L-007C，拖动最新请求队列、取消与一手势一命令，实体删除引用清理
```

### T-104C：最新拖动队列与实体删除（2026-10-02）

```text
任务 ID：T-104C
状态：done；T-104整体done，M1完成
覆盖需求 ID：REQ-004/AC-004-1—4（结合A/B证据）、REQ-003退出/重编辑、REQ-009/012手势历史与取消部分、LEARN-001
修改文件：core移动/删除/退化/预览、app最新拖动队列与独立预览Worker、viewport指针捕获/生命周期、Vue拖动/选择/数值/删除/快捷键和样式、7项单测/真实native/三入口浏览器检查、独立回归输出、L-007C与状态/验证文档
执行验证（命令、环境、结果）：Windows x64 / PowerShell7.6 / Node24.21.0 / npm11.19.0 / Edge154.0.4258.48；check:sketch-edit 7项编辑/竞态/清理测试、三平面30输入→2真实求解→1历史、矩形50×35、固定尺寸40×30/DOF0、圆心/圆弧、删除与真实失败不改文档历史通过，残差≤1e-5；check:sketch-edit:browser开发/root/cad各三平面实际预览/拖点/拾取数值/一次revision/undo redo/取消退出、模型旋转后进入和zoom7/9px捕捉、5非法输入、文本焦点与多实体删除通过，每Worker最多1在途；冷native加载中Esc/退出/新建保持旧或新项目，Esc后新Worker恢复；16领域/11core、12领域native/4拒绝/三入口MIME503、12绘制native/绘制浏览器、完整视口/项目/工作区回归、typecheck/build/docs/cached diff通过
未覆盖验收条件：全P0约束面板/一般实体后代、通用轮廓/布尔/文件/三浏览器/性能；MVP仍未通过
已知限制/阻塞：markDragged为软优先，圆弧端点目标偏差约0.001198mm但等半径残差0；显示与提交使用实际求解坐标；原生微小扰动≤1e-8不增加历史；sketch-only沿用A；包约720kB提示保留；用户复述未记录
下一任务：T-201 / L-006D，全部P0约束真实adapter/组合验证与面板，按实验继续细分
```

### T-201A：方向、角度与相等约束（2026-10-02）

```text
任务 ID：T-201A
状态：done；T-201整体doing
覆盖需求 ID：REQ-005/AC-005-5的parallel/perpendicular/angle/equal成功/非法组合部分、REQ-012事务前置、LEARN-001
修改文件：自写native类型/四类映射/独立残差、schema重复对象拒绝、12项fixture与实际角度事务、Node/浏览器检查和学习交互组件、回归独立输出、L-006D及范围/状态/验证文档
执行验证（命令、环境、结果）：Windows x64 / PowerShell7.6 / Node24.21.0 / npm11.19.0 / Edge154.0.4258.48；check:linear-constraints 12真实正向/反向平行/垂直/30/60/120/170度/线长/圆弧半径相等、8原生前拒绝通过，独立残差≤1e-5rad或mm；角度60→120→undo→redo按快照端点实际计算，冲突文档/历史不变；check:linear-constraints:browser开发/root/cad各12真实Worker/事务、WASM200 MIME与503重试通过；16领域/11core、原12native/4拒绝、7编辑与真实三平面手势/删除回归、bootstrap、typecheck/build/docs/cached diff通过
未覆盖验收条件：P0完整相切组合、约束面板和完整REQ-005；通用实体后代/文件/三浏览器/性能
已知限制/阻塞：tangent仍限共享端点弧线；native equal的线/弧长组合不属于PRD，领域拒绝；极接近0/π角度与病态尺度未完整验收，残差不合格明确拒绝；WASM/锁文件未变，包约726kB提示保留；用户复述未记录
下一任务：T-201B / L-006E，全相切组合/接触范围；随后T-201C面板
```

### T-201B1：原生接触表达前置（2026-10-02）

```text
任务 ID：T-201B1
状态：done；T-201B与T-201整体仍doing
覆盖需求 ID：REQ-005相切底层前置、LEARN-001；完整AC未通过
修改文件：scripts/check-tangent-primitives.mjs、package命令、6组真实native证据、L-006E及任务/学习/验证接续
执行验证（命令、环境、结果）：Windows x64 / PowerShell7.6 / Node24.21.0 / npm11.19.0 / 固定SolveSpace2879a02d既有WASM；check:tangent-primitives 4组实际线圆/圆圆外切/内切/弧圆及2有限范围反例通过；线y10/接触(0,10)，圆心距18/2/接触(10,0)，误差≤1e-5mm；延长线t4、弧偏移3π/2>π/2说明native支撑曲线成功仍需拒绝；native错误0；docs/cached diff通过
未覆盖验收条件：领域全相切adapter、全部配对/方向、范围拒绝接入、Worker/事务回滚；完整REQ-005/面板和后续P0
已知限制/阻塞：只有Node原生二维实验；辅助点尚未接生产领域；初始弧夹具的无用半径参数已去掉，最终DOF0；WASM/依赖未变；用户复述未记录
下一任务：T-201B2 / L-006E续，全领域相切与范围验证，随后T-201C
```

## T-201B2 交接

任务 ID：T-201B2（T-201B整体完成）
状态：done
覆盖需求 ID：REQ-005/AC-005-5相切适配部分、REQ-012、LEARN-001
修改文件：core/geometry/tangency、solver adapter/types、Worker错误码、tangent fixture/Vue实验/Node与浏览器脚本、4边界测试/9协议测试、L-006F/证据与相关状态文档。
执行验证（命令、环境、结果）：Node24.21.0/npm11.19.0/Windows/Edge154.0.4258.48；check:tangency 4单测、51真实组合、3范围拒绝、5原生前拒绝、私有handle到领域ID、18/22mm真实历史和三失败回滚通过；build/typecheck；check:tangency:browser开发/root/cad各51项及事务、MIME/一次加载/503恢复通过；领域16/12core、旧native12、编辑7/三平面、方向12/拒绝8、Worker9回归通过。证据见learning/evidence/T-201B2-*。
未覆盖验收条件：完整约束面板/标注与REQ-005全UI验收、通用重算/文件/三浏览器/性能。
已知限制/阻塞：共心初值明确要求先移动；极限尺度和任意分支切换未穷尽，但每次强制残差与有限范围；无阻塞。主包736.06kB提示保留；用户复述未记录。
下一任务：T-201C/L-006G约束面板与完整REQ-005回归。

## T-201C1 交接

任务 ID：T-201C1
状态：done
覆盖需求 ID：REQ-005诊断一致性前置、REQ-009/012、LEARN-001
修改文件：core/sketch-solution与ProjectEngine诊断快照、sketchRecompute/ProjectSession、solver冗余ID语义、domain事务fixture/Worker回归、5真实测试、L-007D/证据/状态。
执行验证（命令、环境、结果）：Node24.21.0/npm11.19.0/Windows/Edge154.0.4258.48；check:diagnostics 5通过，DOF0/1/0与精确历史、元数据、空/删除/新项目、迟到真实WASM、4损坏数据拒绝；16领域/12core、12native/4拒绝；build/typecheck；三入口真实WorkerDOF1/0/1/0、冗余码4、诊断冲突回滚和503恢复通过。
未覆盖验收条件：约束面板/标注/全部UI操作与完整REQ-005；通用重算/文件/最终验收。
已知限制/阻塞：缺少native诊断时不猜DOF，文件恢复需重新求解；无阻塞。主包738.71kB提示保留，用户复述未记录。
下一任务：T-201C2/L-006G。

## T-201C2 交接

任务 ID：T-201C2（C及T-201整体完成）
状态：done
覆盖需求 ID：REQ-005/AC-005-1—6（A/B/C共同）、REQ-012、LEARN-001
修改文件：core/geometry/constraint-edit、ConstraintPanel/Workspace/ModelViewport、Viewport渲染通知、SketchRejectedError、真实Node/浏览器面板与编辑回归脚本、L-006G/证据/状态。
执行验证（命令、环境、结果）：Node24.21.0/npm11.19.0/Windows/Edge154.0.4258.48；check:constraint-edit 12真实/12非法、宽/固定编辑及删除DOF；check:constraints:browser三入口×三平面40→60mm/冲突/自由65mm/固定70mm/DOF0-1-0/标注、12P0成功和非法、角120度/R14mm；check:sketch-edit:browser实际三入口手势/捕捉/取消Esc/退出/新项目/焦点/删除，最多1在途；16领域/13core、7编辑/三平面native、9协议；build/typecheck通过。证据见T-201C2-*。
未覆盖验收条件：REQ-006一般轮廓/拉伸、完整实体/通用后代/文件/三浏览器/性能与最终MVP。
已知限制/阻塞：共心初值先移动；病态尺度/任意分支切换未穷尽但逐次检查；无阻塞。普通包约750kB提示保留，用户复述未记录。审批曾因用量限制拒绝启动回归，后已正常恢复并实际通过。
下一任务：T-202/L-008A。

## T-202A 交接

任务 ID：T-202A
状态：done
覆盖需求 ID：REQ-006曲线精度前置、LEARN-001
修改文件：core/geometry/sample-entity、curve-sampling测试/package命令、L-008C/数值证据与状态文档。
执行验证（命令、环境、结果）：Windows/Node24.21.0/npm11.19.0；check:curves 6/6，9真实三平面圆/弧、三尺度、9非法输入/解析极值、端点预算与4096容量通过；check:domain 16/16和14纯core；build/typecheck通过。
未覆盖验收条件：轮廓连通/自交/孔洞、一般拉伸和REQ-006全部完整AC；浏览器未执行。
已知限制/阻塞：显示仍用旧视口近似，后续接入；弧端点预算不足明确拒绝。无阻塞，用户复述未记录，主包提示保留。
下一任务：T-202B/L-008A。

## T-202B 交接

任务 ID：T-202B
状态：done
覆盖需求 ID：REQ-006/AC-006-3轮廓前置、LEARN-001
修改文件：core/geometry/curve-contact与sketch-regions、region-fixtures、10测试/package命令、L-008A/证据与状态。
执行验证（命令、环境、结果）：Windows/Node24.21.0/npm11.19.0；check:regions 10/10，6三平面直边/18曲线、324独立解析包含点/凹环、多区域选择、开放/分叉/自交/重叠/孔接触/闭合传递链/精度反例通过；check:domain 16/16和16纯core；build/typecheck通过。
未覆盖验收条件：一般实体网格/正负深度/零深度/区域选择UI/预览取消/完整REQ-006；浏览器未执行。
已知限制/阻塞：全实体参与，暂无构造线模式；默认细分无法表达狭小有效区域时明确拒绝，core可收紧精度。无阻塞，用户复述未记录，主包提示保留。
下一任务：T-202C一般拉伸，先C1网格/Worker，再C2UI/预览/事务。

## T-202C1 交接

任务 ID：T-202C1
状态：done
覆盖需求 ID：REQ-006几何/AC-006-1—5前置、REQ-012、LEARN-001
修改文件：extrude-sketch adapter/SolidInput/solid Worker错误码、一般拉伸夹具/实验组件/Node与浏览器脚本、solid证据覆盖路径、L-008D/证据与状态。
执行验证（命令、环境、结果）：Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；check:extrusion 60真实+10拒绝/7边界，三平面±深度/直边孔/曲线/共线/斜平面、闭合/体积/孔壁/范围；check:extrusion:browser三入口各60+10/一次WASM/MIME/错误恢复/持续503重试通过；旧solid19/STL16/2拒绝、Worker9、领域16/16core、build/typecheck通过。
未覆盖验收条件：工作区区域选择、真实预览/取消、原子提交/撤销重做与完整REQ-006；通用后代/布尔/文件/最终三浏览器/性能。
已知限制/阻塞：默认精度狭小区域明确拒绝；无构造线模式；工作区拉伸按钮仍禁用。无阻塞，用户复述未记录，主包770.44kB提示保留。
下一任务：T-202C2。

## T-202C2a 交接

任务 ID：T-202C2a
状态：done
覆盖需求 ID：REQ-006/009/012预览事务前置、LEARN-001
修改文件：feature-recompute/extrusion-preview/ProjectSession几何客户端交接、7真实测试、约束浏览器证据覆盖路径、L-007E/证据与状态。
执行验证（命令、环境、结果）：Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；check:extrusion-transactions 7真实native/mesh，原子12000/18000/36000mm³与精确历史/失败/保存、30输入2请求1历史、取消/迟到/错误恢复、旧客户端交接测试通过；16领域/16core、build/typecheck；三入口全约束与三平面编辑/冷WASM取消回归通过。
未覆盖验收条件：区域选择与深度UI、临时GPU网格所有权、实际拉伸预览/取消/提交界面/完整REQ-006；Boolean/分支优化/文件/最终验收。
已知限制/阻塞：全量重算Sketch/Extrude；工作区拉伸按钮仍禁用。无阻塞，用户复述未记录，主包774.65kB提示保留。
下一任务：T-202C2b。

## T-202C2b 交接

```text
任务 ID：T-202C2b（C2/C/T-202整体完成）
状态：done
覆盖需求 ID：REQ-006/AC-006-1—5（A/B/C共同）、REQ-009/012、LEARN-001
修改文件：ExtrusionPanel/Workspace/ModelViewport、临时Mesh所有权与正面渲染、样式/真实UI脚本/package、L-008E/数值证据/状态。
执行验证（命令、环境、结果）：Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；check:extrusion-ui:browser三入口三平面±深度/矩形/孔/圆/半圆/多区域/四非法轮廓和0/取消资源与文档/一次提交与精确历史；生产冷preview/commit/new取消和恢复；视口拾取/控制/context/20重建；16领域/16core、build/typecheck通过。
未覆盖验收条件：T-203真实参数/曲线/孔洞来源后续回归；Boolean/分支优化/文件/STL/最终三浏览器/性能与MVP。
已知限制/阻塞：默认精度狭小区域明确拒绝，全实体参与无构造线；当前Sketch/Extrude全量重算。无阻塞，用户复述未记录，主包约781kB提示保留。
下一任务：T-203。
```

## T-203 交接

```text
任务 ID：T-203
状态：done（M2完成）
覆盖需求 ID：REQ-005/006/009尺寸和拉伸历史、REQ-008后代失败部分、LEARN-001
修改文件：parameter-history真实测试、check-parameters-browser/package、L-010C与真实证据/状态文档；生产算法未改。
执行验证（命令、环境、结果）：Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；check:parameters四测试（21三平面参数夹具及后代晚失败）通过；check:parameters:browser开发/root/cad共24实际尺寸/孔/圆弧/原子失败/稳定ID/精确历史流程通过；build/typecheck/docs通过。
未覆盖验收条件：Boolean及受影响分支优化、完整REQ-008/009/文件/STL/最终三浏览器与性能。
已知限制/阻塞：Sketch/Extrude全量重算；无阻塞。曲线网格体积误差约0.127%，未代表精确BREP；用户复述未记录。
下一任务：T-301 / L-009真实网格布尔。
```

## T-301A 交接

```text
任务 ID：T-301A；T-301整体doing
状态：done
覆盖需求 ID：REQ-007数值/事务前置、REQ-008/009/012部分、LEARN-001
修改文件：mesh-boolean输入/adapter、featureRecompute布尔管线、ProjectEngine原子隐藏、23+8真实夹具/五事务测试、实验组件/三入口脚本、L-009C与证据/状态。
执行验证（命令、环境、结果）：Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；check:mesh-booleans五测试/23真实几何+8拒绝/源参数/empty/原子隐藏/失败/晚取消通过；三入口实际Worker各23+8/MIME一次模块与冷503重试；16领域/16core、19几何/16STL/2非流形回归、build/typecheck/docs通过。
未覆盖验收条件：A/B工作区选择与完整REQ-007；受影响分支优化/级联/文件/最终三浏览器与性能。
已知限制/阻塞：当前全DAG重算；每操作数2000输入三角面、桥2000唯一输出顶点，超出拒绝。固定vendor字节和WASM未改，无阻塞；复述未记录。
下一任务：T-301B/L-009。
```

## T-301B 交接

```text
任务 ID：T-301B；T-301整体完成
状态：done
覆盖需求 ID：REQ-007/AC-007-1—5（A/B共同）、REQ-009/012部分、LEARN-001
修改文件：BooleanPanel、Workspace的A/B/empty/生命周期、样式、真实UI脚本/package、实验页文案、L-009D与证据/状态。
执行验证（命令、环境、结果）：Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；check:boolean-ui:browser三入口三平面并/双向差/交、选择禁用/交换/empty/来源隐藏与精确历史/失败后8000恢复；源宽20→25交集6000稳定ID；生产真实12000网格回包扣留后的Esc/按钮/new取消和恢复；视口三入口拾取/控制/context/20重建、16领域/16core、build/typecheck/docs通过。
未覆盖验收条件：受影响分支优化、级联与完整REQ-008/009、文件/STL/最终三浏览器/性能/MVP。
已知限制/阻塞：全DAG重算，CSG容量沿用A；无阻塞。主包约791kB提示保留，复述未记录。
下一任务：T-302/L-010。
```

## T-302A 交接

```text
任务 ID：T-302A；T-302整体doing
状态：done
覆盖需求 ID：REQ-008受影响分支/AC-008-1/3/4部分、REQ-009/012、LEARN-001
修改文件：core/recompute-plan、ProjectEngine冻结基线、featureRecompute选择性重算、五真实测试/Worker追踪与证据可重定向、L-010D/独立回归与状态。
执行验证（命令、环境、结果）：Windows/Node24.21.0/npm11.19.0/Edge154.0.4258.48；check:affected-recompute五测试，源A只1native/1拉伸/2布尔，B/C精确复用；深度3/新增布尔1/元数据与级联0调用；冷/诊断缺失各3native；较晚后代失败保留redo/save；三入口×三平面实际仅solve A/extrude A/intersect三请求，6000稳定ID；7预览/4参数/5布尔/16领域与17core、build/typecheck/docs通过。
未覆盖验收条件：级联影响列表/确认UI、现有拉伸参数编辑与完整REQ-008/009、文件/STL/最终三浏览器和性能。
已知限制/阻塞：普通DTO仍克隆/校验；调用减少不代表最终性能通过，主包792.01kB提示保留。CSG容量不变，无阻塞，复述未记录。
下一任务：T-302B/L-010。
```

## T-302B 交接

任务 ID：T-302B；T-302整体完成
状态：done；完成后按用户2026-10-02新指令暂停，不进入T-303
覆盖需求 ID：REQ-008/AC-008-1—5（A/B共同）、REQ-009/012部分、LEARN-001
修改文件：ExtrudeParameters/DeleteFeatureDialog、Workspace依赖说明/确认上下文、样式、真实UI检查/package、回归证据另存、L-010E与状态/决策/验证。
执行验证（命令、环境、结果）：Windows x64/PowerShell7.6/Node24.21.0/npm11.19.0/Edge154.0.4258.48；check:feature-edit:browser三入口×三平面宽40→60：12000→18000/差6000→12000，实际3请求；现有深度20差30000/-10差18000，仅2网格；区域4000→1000仅1拉伸，稳定ID/精确undo redo；0/空/NaN/草稿取消无命令；默认Enter/Esc/按钮取消和明确级联/元数据0请求，无关B精确；晚empty后代失败整体回滚/3000恢复；生产扣留实际8000网格的Esc/按钮取消和恢复；1024编辑控件无横向溢出并查看1280/1024截图；5真实affected/16领域/17纯core、标准布尔三入口三平面与实际晚回包回归、build/typecheck/docs/diff通过。
未覆盖验收条件：REQ-009全部命令/100步、文件/STL、完整E2E-02保存打开、最终三浏览器/性能/MVP；ADR-033保留完整验收，仅明确依赖阶段。
已知限制/阻塞：CSG/曲线容量沿用A，无新依赖或vendor改动；主包797.83kB/cad909.51kB提示保留；复述未记录。首次恢复夹具漏加C体积，修正期望3000后完整重跑通过；无技术阻塞，暂停来自用户明确指令。
下一任务：T-303/L-010全命令历史；等待用户恢复后执行。

## T-R01 交接

```text
任务 ID：T-R01
状态：done；修复后继续暂停，不进入T-303
覆盖需求 ID：REQ-006/009/012，AC-012-2/3/4及拉伸一次提交/精确历史；LEARN-001
修改文件：Workspace属性v-show、ModelViewport导航属性、ViewportRuntime独立开关与恢复；真实三入口交互脚本/视口恢复回归/package；L-007F、独立证据及状态/决策/验证记录
执行验证（命令、环境、结果）：Windows x64/PowerShell7.6/Node24.21.0/npm11.19.0/Edge154.0.4258.48；check:interaction:browser开发/root/cad真实25mm回复扣留期间平移/缩放，选择/绘制禁用、旋转锁定、取消保留文档/revision并恢复5000mm³；12mm预览折叠零重发，实际4800mm³隐藏提交只新增1特征/1revision，返回模型选择与精确undo/redo；隐藏Esc拒收实际4000mm³晚回复，新提交恢复；check:viewport三入口WebGL恢复独立开关/拾取/20次资源回归通过；7真实事务+4状态测试、typecheck/build/check:docs/diff通过
未覆盖验收条件：REQ-009完整命令/100步、文件/STL/完整E2E-02、最终三浏览器/性能/MVP
已知限制/阻塞：依赖/内核/容量未变；root798.55kB/cad910.31kB大chunk提示保留；首轮测试拦截器误扣启动回复，修正后完整重跑通过；用户复述未记录，无技术阻塞
下一任务：T-303；需用户明确恢复
```
