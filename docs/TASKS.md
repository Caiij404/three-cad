# 实施任务与交接

更新：2026-10-02。用户已授权连续开发至会话预算耗尽，以辅助学习为主要目标。T-001—T-004 完成，继续 T-005。自 T-002 起，每个子任务的实现、学习记录、证据和交接共同组成一个 commit。

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

以下为目标结构。当前已有最小验证页、纯 solver 数据类型、solver adapter/Worker/固定夹具；完整领域模型、视口和工作区尚未创建。实施时可按职责细化，不得打破 core 边界。

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
npm run record:toolchain
npm run check:docs
```

`npm run test`、`npm run test:e2e` 尚未建立；后续领域/几何测试可使用 Vitest，完整浏览器闭环可使用 Playwright。当前 bootstrap 检查只证明最小页面的开发/生产运行链。几何正确性必须有数值断言，不只做视觉截图。

## 验证记录要求

`docs/VERIFICATION.md` 至少记录：需求/AC ID、fixture、环境、命令、实际结果、容差、失败原因和证据文件路径。性能记录基准机、模型规模、预热/采样方法。没有执行的检查明确标记未执行。

## 当前交接

- 已完成：T-001 来源、T-002 工程、T-003 真实求解、T-004 真实 CSG/孔洞/STL 及 Worker 指定夹具。
- 当前重点：以学习单元推进后续 M0；学习掌握状态尚待用户反馈。
- 未开始：完整工作区及完整 P0/E2E 验收；M0 总结 gate 待 T-005。
- 默认技术方案：Vue 3 + TS + Three.js；SolveSpace WASM + 网格 CSG。
- 下一步：T-005 / L-012A，总结真实兼容矩阵、范围与 gate；尚未进入完整编辑器。

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
