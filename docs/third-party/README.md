# 第三方来源清单

核对日期：2026-10-02。Vue 运行时与 T-003 自建 SolveSpace 已使用；CSG 尚未集成。`sources.json` 是 T-001 候选审计快照，实际 solver 集成以 `solver-build.json` 为准。

完整固定版本和路径见 [sources.json](sources.json)，检查证据见 [文件指纹](../learning/evidence/T-001-source-audit.json)。这些记录描述来源事实，不把仓库顶层许可证自动套用到每个第三方文件。

## 计划与声明

| 对象 | 原始声明 | 状态 / 处理 |
| --- | --- | --- |
| three.cad | 顶层 LICENSE 为 GPL v3；各文件有独立来源 | 仅参考；不复制应用与旧二进制 |
| SolveSpace | README 声明 GPL v3 or later；有 COPYING.txt | 固定源码实际构建；原文和 THIRD_PARTIES 随分发保留 |
| THREE-CSGMesh | README 与 csg-lib.js 声明 MIT；Evan Wallace/thrax 来源 | 两个 JS 文件为候选；保留声明与 MIT 许可文本 |
| Eigen | COPYING.README 声明主要为 MPL2，部分代码 BSD/LGPL | 固定子模块实际编译；启用 EIGEN_MPL2_ONLY，保留全部 COPYING 原文 |
| mimalloc | 固定 commit 的 LICENSE 为 MIT | solver 构建依赖；保留原版权和许可文本 |
| Vue / TS / Vite | 已锁版本，详见下表 | 最小工程已使用；保留 Vue 声明与完整锁定包来源 |
| Pinia / Three.js | 尚未选择本项目版本 | 在对应状态/视口任务安装并验证，当前无应用依赖 |

Eigen 固定 commit 为 `3147391d946bb4b6c68edd901f2add6ac1f31f8c`。已读取其 [COPYING.README](https://gitlab.com/libeigen/eigen/-/raw/3147391d946bb4b6c68edd901f2add6ac1f31f8c/COPYING.README) 和 [COPYING.MPL2](https://gitlab.com/libeigen/eigen/-/raw/3147391d946bb4b6c68edd901f2add6ac1f31f8c/COPYING.MPL2)；不能把整个目录笼统标成只有 MPL2。mimalloc 许可已通过 Git 对象读取验证，未采用失败的 HTTP 下载结果作为证据。

## T-002：已使用的 npm 工具链

| 包 | 固定版本 | npm 声明 | 用途 / 原始路径 |
| --- | --- | --- | --- |
| vue | 3.5.43 | MIT | 应用运行时；`node_modules/vue` 及锁定的 @vue 包 |
| @vitejs/plugin-vue | 6.0.9 | MIT | SFC 编译；`node_modules/@vitejs/plugin-vue` |
| vite | 8.3.2 | MIT | 开发服务/生产构建；`node_modules/vite` |
| typescript | 6.0.3 | Apache-2.0 | 类型工具；`node_modules/typescript` |
| vue-tsc | 3.3.11 | MIT | SFC 类型检查；`node_modules/vue-tsc` |
| @types/node | 24.19.0 | MIT | 工具配置类型；`node_modules/@types/node` |
| playwright | 1.63.0 | Apache-2.0 | 真实浏览器验证；`node_modules/playwright` |

来源是 [package-lock.json](../../package-lock.json) 中的官方 npm tarball 与 integrity；[npm-dependencies.json](npm-dependencies.json) 记录全部 74 个锁定包的版本、声明、来源、安装状态、上游仓库和安装包提供的 gitHead。当前 Windows 安装 49 包，其余为平台可选项，不代表缺少应用依赖。

清单由 `npm run record:toolchain` 从真实锁文件和安装包读取，并断言已安装版本一致。本次没有修改这些包的源码，也没有从浮动 Git 分支复制包代码。许可分类是各包原声明，不把直接依赖的 MIT/Apache 自动套用到全部间接依赖。

Vue 原 MIT 文本保存在 [vue-MIT.txt](licenses/vue-MIT.txt)。脚本实际比对 Vue 与四个运行时 @vue 包的 LICENSE 文本一致；[生产声明](../../public/THIRD_PARTY_NOTICES.txt) 列出这些组件与版本，并保留原许可全文，Vite 构建时复制到 dist。

工具运行时使用官方 [Node 24.21.0 ZIP](https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip)，归档和 node.exe 的 SHA-256 见来源 JSON；ZIP 保留官方 LICENSE，位于不提交的 `.research/runtime/`。实际配套 npm 为 `11.19.0`，无需提交 Node/npm 可执行文件。

实际构建命令为 `npm ci` 后 `npm run build`，验证见 [VERIFICATION](../VERIFICATION.md)。失败候选 TS `7.0.2` 未保留在当前锁文件中；当前选择以实际兼容结果为依据。

## 修改与构建记录

- SolveSpace 修改路径为 `src/slvs/jslib.cpp`、`src/slvs/CMakeLists.txt`、`cmake/GetGitCommitHash.cmake`；三个补丁已实际应用、构建，补丁哈希见清单。
- SolveSpace 原始目标为 `slvs-wasm`，真实构建依赖 `slvs-interface`、求解器源码、Eigen 与 mimalloc。可重建入口见 [SOURCE](../../public/wasm/SOURCE.md)。
- CSG 原始路径：`csg-lib.js`、`three-csg.js`；本次无改动、无构建、无 vendoring。复制前记录实际修改，再做 T-004 兼容用例。
- 上游旧静态库与 WASM：记录哈希用于辨认，未取得旧静态库的完整构建来源，不选作新应用输入。

## T-003：实际 WASM 构建与分发

[solver-build.json](solver-build.json) 登记源码、子模块、SDK 源 commit、工具归档/编译器 SHA、实际命令、三个补丁及两产物哈希；副本在 `public/wasm/BUILD_SOURCE.json`。原 SDK 安装器自动删除下载归档，因此记录安装后的编译器与链接器指纹，未声称保留该归档哈希。

`slvs.mjs` 为 59795 bytes，`slvs.wasm` 为 289622 bytes，分别 SHA-256 `90b791365a4ae744254ea19159e067fc10911fbe98cde4a5eece901a7d1e553c`、`b1ebedb52e2a877338ee465543f3cabdc77b87835b4910abfc825a477e446423`。

项目 [LICENSE](../../LICENSE) 为 GPL-3.0-or-later。SolveSpace/Eigen/mimalloc、Emscripten 及 musl/libc++/libc++abi/compiler-rt 的原声明保存在 `public/wasm/licenses/`，文件指纹及来源路径见清单，构建会复制到 dist。全部 COPYING 的保留不意味着其中所有可选 GPL/LGPL 模块被使用；编译定义限制了 Eigen 的包含范围。

后续每增加实际复用文件，继续登记版本、许可、修改、构建与哈希，不覆盖历史来源审计。
