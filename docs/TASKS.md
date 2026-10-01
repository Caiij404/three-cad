# 实施任务与交接

更新：2026-10-01。用户已授权开发，并补充以辅助学习为主要目标。当前先交付学习文档与 GitHub 同步；以下功能任务全部未开始，后续按依赖执行。

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
| T-001 | todo | 无 | `docs/UPSTREAM.md`、第三方清单 | 固定 upstream SHA；核对源码/WASM 来源、许可证、可重建方法及拟复用路径 |
| T-002 | todo | T-001 | 最小 Vue/Vite/TS 工程、锁文件 | 无 React/Redux；启动、类型检查、构建和生产预览可用；记录 Node/npm/依赖实际版本 |
| T-003 | todo | T-002 | solver adapter + Worker 验证页 | 真实矩形尺寸、圆弧/相切、矛盾约束、重复求解；验证是否提供 DOF；生产与 `/cad/` 路径可用 |
| T-004 | todo | T-002 | solid adapter + 网格验证夹具 | 两方块三类布尔、相切/共面/不相交、孔洞拉伸；独立算体积和闭合性；确认 STL 可解析 |
| T-005 | todo | T-003,T-004 | `docs/TECH-SPIKE.md` | 真实求解与 CSG 在 Worker 可运行；记录兼容矩阵、限制和版本；PRD/ADR 同步实测结果 |

M0 gate：T-005 完成。不能用静态截图、假求解器、只执行加载而未调用求解 API 来通过。

## M1：工作区、领域模型与草图

| ID | 状态 | 依赖 | 覆盖需求 | 完成条件 |
| --- | --- | --- | --- | --- |
| T-101 | todo | T-005 | REQ-001,REQ-012 | Vue 工作区、状态机、加载/错误入口、无未实现可点击按钮 |
| T-102 | todo | T-005 | REQ-008,REQ-009,REQ-010（基础） | 领域类型、schema 校验、命令/事务基础、稳定 ID 与 DAG 校验 |
| T-103 | todo | T-101,T-102 | REQ-002,REQ-003 | 正交相机、Z-up、三基准面、选择联动、resize/dispose/context 恢复 |
| T-104 | todo | T-103 | REQ-004 | 线/矩形/圆/三点圆弧、捕捉、删除与 Esc；绘制作为可撤销命令 |

## M2：求解与拉伸

| ID | 状态 | 依赖 | 覆盖需求 | 完成条件 |
| --- | --- | --- | --- | --- |
| T-201 | todo | T-104,T-003 | REQ-005,REQ-012 | 所有 P0 约束 UI/adapter、残差校验、错误回滚、乱序丢弃与拖动节流 |
| T-202 | todo | T-201 | REQ-006 | 连通轮廓、外轮廓与孔洞分类、自交检查、三平面/正负深度拉伸 |
| T-203 | todo | T-202 | REQ-005,REQ-006,REQ-009 | 矩形尺寸和曲线/孔洞夹具；撤销重做保持几何与约束一致 |

## M3：CSG 与参数化历史

| ID | 状态 | 依赖 | 覆盖需求 | 完成条件 |
| --- | --- | --- | --- | --- |
| T-301 | todo | T-203,T-004 | REQ-007 | union/subtract/intersect、A/B 选择、empty 结果和失败恢复 |
| T-302 | todo | T-301 | REQ-008,REQ-012 | 特征树、拓扑重算、级联删除、事务缓存、稳定 ID；E2E-02 |
| T-303 | todo | T-302 | REQ-009 | 全命令覆盖、100 步历史、保存快照 dirty 状态、异步计算时一致性 |

## M4：文件、导出与交付

| ID | 状态 | 依赖 | 覆盖需求 | 完成条件 |
| --- | --- | --- | --- | --- |
| T-401 | todo | T-303 | REQ-010 | JSON 保存/打开、运行时校验、标准文件回退、IndexedDB 恢复和失败提示 |
| T-402 | todo | T-303 | REQ-011 | 单实体 binary STL、单位说明、导出前闭合检查和独立解析 |
| T-403 | todo | T-401,T-402 | REQ-001—012,NFR-001—007 | E2E-01—05、生产子路径、三浏览器、性能/资源生命周期验收 |
| T-404 | todo | T-403 | 全部 | README 运行说明、第三方声明、已知限制、最终 `docs/VERIFICATION.md` |

## 目标源码组织

以下为后续结构，当前尚未创建应用文件。实施时可按职责细化，不得打破 core 边界。

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

这些命令尚不存在，T-002 应建立并记录对应工具版本：

```text
npm ci
npm run dev
npm run typecheck
npm run test
npm run build
npm run preview
npm run test:e2e
```

建议领域/几何测试使用 Vitest，浏览器闭环使用 Playwright；几何正确性必须有数值断言，不只做视觉截图。WASM 测试需要真实适配器，UI 测试可以隔离非相关 Worker 错误。

## 验证记录要求

`docs/VERIFICATION.md` 至少记录：需求/AC ID、fixture、环境、命令、实际结果、容差、失败原因和证据文件路径。性能记录基准机、模型规模、预热/采样方法。没有执行的检查明确标记未执行。

## 当前交接

- 已完成：项目立项、agent 可读文档、学习路线与笔记排版约定、GitHub 首次同步。
- 当前重点：以学习单元推进后续 M0；学习掌握状态尚待用户反馈。
- 未开始：依赖安装、上游仓库拉取、WASM 验证、应用源码实现、运行/几何测试。
- 默认技术方案：Vue 3 + TS + Three.js；SolveSpace WASM + 网格 CSG。
- 下一步：以 L-001/L-006 为学习主线执行 T-001，再推进 M0 技术验证。

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
