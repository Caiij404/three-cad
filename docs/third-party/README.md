# 第三方来源清单

核对日期：2026-10-03。Vue/Pinia、自建 SolveSpace、固定BSP/Three.js已用于完整工作区。`sources.json`保留T-001候选快照，实际集成以`solver-build.json`/`csg-source.json`/`ui-dependencies.json`为准。T-404锁文件重装65包、90包来源重读、27原产物/许可/核心SHA及Git index/生产分发字节通过，见[最终审计](../learning/evidence/T-404-delivery-audit.json)。

完整固定版本和路径见 [sources.json](sources.json)，检查证据见 [文件指纹](../learning/evidence/T-001-source-audit.json)。这些记录描述来源事实，不把仓库顶层许可证自动套用到每个第三方文件。

## 已使用的来源与声明

| 对象 | 原始声明 | 状态 / 处理 |
| --- | --- | --- |
| three.cad | 顶层 LICENSE 为 GPL v3；各文件有独立来源 | 仅参考；不复制应用与旧二进制 |
| SolveSpace | README 声明 GPL v3 or later；有 COPYING.txt | 固定源码实际构建；原文和 THIRD_PARTIES 随分发保留 |
| THREE-CSGMesh | README 与 csg-lib.js 声明 MIT；Evan Wallace/thrax 来源 | 只复用未修改 csg-lib.js；自写 bridge，保留原声明与 MIT 原文 |
| Eigen | COPYING.README 声明主要为 MPL2，部分代码 BSD/LGPL | 固定子模块实际编译；启用 EIGEN_MPL2_ONLY，保留全部 COPYING 原文 |
| mimalloc | 固定 commit 的 LICENSE 为 MIT | solver 构建依赖；保留原版权和许可文本 |
| Vue / TS / Vite | 已锁版本，详见下表 | 最小工程已使用；保留 Vue 声明与完整锁定包来源 |
| Three.js | 0.186.1 / MIT；@types/three 0.186.0 | 实体适配/Worker与真实视口；三稳定浏览器生产验收通过 |
| Pinia | 4.0.3 / MIT | T-101 仅管理普通 UI 状态；内核不放 store |

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

来源是 [package-lock.json](../../package-lock.json) 的官方npm tarball/integrity；[npm-dependencies.json](npm-dependencies.json)记录当前90个锁定包的版本、许可、来源、安装状态、上游仓库和安装包gitHead。Windows安装65包，其余是平台可选项。T-002时的74/49保留在历史验证记录，不代表当前清单。

清单由 `npm run record:toolchain` 从真实锁文件和安装包读取，并断言已安装版本一致。本次没有修改这些包的源码，也没有从浮动 Git 分支复制包代码。许可分类是各包原声明，不把直接依赖的 MIT/Apache 自动套用到全部间接依赖。

Vue 原 MIT 文本保存在 [vue-MIT.txt](licenses/vue-MIT.txt)。脚本实际比对 Vue 与四个运行时 @vue 包的 LICENSE 文本一致；[生产声明](../../public/THIRD_PARTY_NOTICES.txt) 列出这些组件与版本，并保留原许可全文，Vite 构建时复制到 dist。

工具运行时使用官方 [Node 24.21.0 ZIP](https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip)，归档和 node.exe 的 SHA-256 见来源 JSON；ZIP 保留官方 LICENSE，位于不提交的 `.research/runtime/`。实际配套 npm 为 `11.19.0`，无需提交 Node/npm 可执行文件。

实际构建命令为 `npm ci` 后 `npm run build`，验证见 [VERIFICATION](../VERIFICATION.md)。失败候选 TS `7.0.2` 未保留在当前锁文件中；当前选择以实际兼容结果为依据。

## 修改与构建记录

- SolveSpace 修改路径为 `src/slvs/jslib.cpp`、`src/slvs/CMakeLists.txt`、`cmake/GetGitCommitHash.cmake`；三个补丁已实际应用、构建，补丁哈希见清单。
- SolveSpace 原始目标为 `slvs-wasm`，真实构建依赖 `slvs-interface`、求解器源码、Eigen 与 mimalloc。可重建入口见 [SOURCE](../../public/wasm/SOURCE.md)。
- CSG 原始路径：`csg-lib.js`；T-004 原字节复用，无改动。`three-csg.js` / `csg-worker.js` 未采用，bridge/协议独立编写。
- 上游旧静态库与 WASM：记录哈希用于辨认，未取得旧静态库的完整构建来源，不选作新应用输入。

## T-003：实际 WASM 构建与分发

[solver-build.json](solver-build.json) 登记源码、子模块、SDK 源 commit、工具归档/编译器 SHA、实际命令、三个补丁及两产物哈希；副本在 `public/wasm/BUILD_SOURCE.json`。原 SDK 安装器自动删除下载归档，因此记录安装后的编译器与链接器指纹，未声称保留该归档哈希。

`slvs.mjs` 为 59795 bytes，`slvs.wasm` 为 289622 bytes，分别 SHA-256 `90b791365a4ae744254ea19159e067fc10911fbe98cde4a5eece901a7d1e553c`、`b1ebedb52e2a877338ee465543f3cabdc77b87835b4910abfc825a477e446423`。

项目 [LICENSE](../../LICENSE) 为 GPL-3.0-or-later。SolveSpace/Eigen/mimalloc、Emscripten 及 musl/libc++/libc++abi/compiler-rt 的原声明保存在 `public/wasm/licenses/`，文件指纹及来源路径见清单，构建会复制到 dist。全部 COPYING 的保留不意味着其中所有可选 GPL/LGPL 模块被使用；编译定义限制了 Eigen 的包含范围。

后续每增加实际复用文件，继续登记版本、许可、修改、构建与哈希，不覆盖历史来源审计。

## T-004：BSP 核心与 Three.js

[csg-source.json](csg-source.json) 记录固定源码 `8bd00fe919ad464500653ad98d8d9a4de2f59015`、原路径与 SHA `c9ca673c7ad46c736b1f545dd8c54c385ad1c4ffb17f03563321691af4861875`（13961 bytes）。原版权注释在源码保留；上游 README 声明和原作者 MIT 全文在 `public/solid/`。原作者 LICENSE 另从固定 `a8512af...` Git 对象取得，清单给出准确来源。

Three.js 从官方 npm `0.186.1` 锁定包安装，gitHead `9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8`。@types/three `0.186.0` 为构建类型依赖。当前 npm 来源清单含 82 锁定包，Windows 实际安装 57 包；T-002 的 74/49 是原任务历史记录。

Three.js 原 MIT 文本与内部 Earcut 3.0.2 的 ISC 原文一并保留。Earcut LICENSE 从官方 npm `earcut@3.0.2` tarball 的 `package/LICENSE` 读取；只提取原许可，不另行复制其算法或安装第二个运行时。HTTP 原文下载失败未当成成功，改用实际 npm 包证据。

实际构建命令 `npm ci` / `npm run build`，只将固定核心和自写 bridge 打包；无外部 CDN。数值/Worker/STL 证据见 [VERIFICATION](../VERIFICATION.md)。`check-distribution --staged` 还核对精确来源文件在 Git index 的字节，防止行尾自动改写造成来源 SHA 不一致。

## T-101：Pinia 与 UI 依赖

Pinia 4.0.3 从官方 npm 安装并精确锁定，与当前 Vue/TS 实测兼容。包内声明有内联 nostics 1.1.4；开发工具依赖声明也保留，详见 [ui-dependencies.json](ui-dependencies.json)。8 个实际安装包的原 LICENSE/许可文件 SHA 和来源/integrity 随生产 `public/ui/` 保留，没有从不存在的 LICENSE 路径假造内容。

当前锁定包90项，Windows安装65项，T-404已真实`npm ci`后重读；来源分类保持各包自己的声明，项目GPL-3.0-or-later。所有原声明/内核SHA和Git index见[T-404分发](../learning/evidence/T-404-distribution.json)，生成dist中的许可与public字节一致由交付审计核对。

## 最终运行与验证环境

前端运行只需固定Node/npm和已分发的ESM/WASM，无SDK或外部运行服务。WASM重新编译的准确固定输入/补丁/工具与命令见[public/wasm/SOURCE](../../public/wasm/SOURCE.md)；实际构建链及失败修复在[L-006A](../learning/notes/L-006A-wasm-worker.md)，T-404没有重新编译或改变其产物。

最终浏览器为Chrome154.0.8037.92、Edge154.0.4258.53、Mozilla原版Firefox157.0，官方归档/原exe SHA、Geckodriver0.37.1和Edge只读提取工具链见[运行时来源](../learning/evidence/T-403A-browser-runtimes.json)。测试工具留在忽略目录，不进入应用分发，不运行浏览器安装/更新程序。未来版本变化应重新验收。

三款浏览器root/cad实际请求的WASM/Worker/JS/CSS全部同源，见[NFR root](../learning/evidence/T-403C2b2-nfr-root.json)/[cad](../learning/evidence/T-403C2b2-nfr-cad.json)。GitHub/npm/SDK/浏览器下载是开发准备来源，不是应用运行时CDN。许可原文和固定源码字节保持原样；这份清单描述实际来源与分发，不扩大单个第三方文件的许可结论。
