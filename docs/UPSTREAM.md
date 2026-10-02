# 上游来源与重建入口

核对日期：2026-10-01。对应任务 T-001，学习单元 L-001A/L-006A。

T-001 完成来源调查、文件指纹、构建入口核对和精度实验。T-003 完成真实源码构建与求解，T-004 完成 CSG 指定夹具；M0 总结 gate 待 T-005。以下 T-001 调查结论保留历史语境，实际集成见末节。

## 1. 固定来源

完整 commit、拟复用方式和检查路径见 [来源清单](third-party/sources.json)，字节数、Git blob ID、SHA-256 及 WASM 导出见 [审计证据](learning/evidence/T-001-source-audit.json)。

| 来源 | 固定 commit 链接 | 本次用途 |
| --- | --- | --- |
| three.cad | [03fbc467](https://github.com/twpride/three.cad/tree/03fbc46749f148d5226378924bfec0d496a1cc06) | 参考流程，审计旧接口和二进制 |
| SolveSpace | [2879a02d](https://github.com/solvespace/solvespace/tree/2879a02d2866e103d7a4817721ead9ac43558aea) | 候选求解器源码，重建独立库 |
| THREE-CSGMesh | [8bd00fe9](https://github.com/manthrax/THREE-CSGMesh/tree/8bd00fe919ad464500653ad98d8d9a4de2f59015) | 候选网格 CSG 与 Three.js 转换层 |
| mimalloc | [f81bf1b3](https://github.com/microsoft/mimalloc/tree/f81bf1b31af819a31195e08f9546dc80f8931587) | SolveSpace 固定的构建依赖与许可 |

SolveSpace 此 commit 的 CMake 项目版本为 3.2；它是固定源码快照，不称为已验证的稳定发布。Eigen 和 mimalloc 的子模块 commit 由 SolveSpace 的 Git tree 锁定。

本地审计仓库位于 `.research/`，已被 Git 和文档检查忽略。本次没有把上游应用、React 组件、证书、JS 库或 WASM 复制进应用目录。

## 2. 旧 WASM：能追踪文件，不能还原完整构建链

three.cad 的 `wasm/readme.md` 提供了一条 emcc 链接命令，输入为 `wasm/solver.c` 与预编译 `wasm/libslvs.a`。命令输出路径为 `static/solver.js`，仓库实际提交的分发文件位于 `dist/solver.js` 与 `dist/solver.wasm`。

未找到把该 `libslvs.a` 对应到 SolveSpace commit、编译器版本及静态库构建参数的记录。因此已记录文件哈希，但不能证明“该 WASM 正是由该源码和命令产生”，也不能声称能够逐字节复现旧二进制。

| 对象 | 实际检查 | 结论 |
| --- | --- | --- |
| dist/solver.wasm | 143466 bytes；WASM 格式验证与导出读取通过 | 可解析，有 solver/main/malloc/free；未实例化、未求解 |
| dist/solver.js | 78787 bytes；已记录哈希 | 旧加载胶水，不选作新项目运行时 |
| wasm/libslvs.a | 21289420 bytes；已记录哈希 | 不使用来源链不完整的旧静态库重建 |
| wasm/solver.c + src/Sketch.js | float 指针、Float32Array、HEAPF32；函数末尾返回 0 | 不满足新接口的精度与结构化状态要求 |

`Slvs_System` 本身有 `result`、`dof` 和 `failed`。旧包装器仅打印失败信息，没有把这些字段回传 JS。这里需要改变的是接口边界，并非把 SolveSpace 内核判定为不可用。

包装器还使用固定 500 项数组，没有按输入容量分配和边界拒绝逻辑；新适配器需要单独处理容量、错误和释放。所有这些结论来自固定版本源码审计，尚未通过运行旧求解器复现。

## 3. 计划复用的路径与改动

| 路径 | 处理方式 | 进入应用前条件 |
| --- | --- | --- |
| three.cad/src/react、Scene.js、Sketch.js | 学习参考，重新实现边界 | 不直接搬入 Vue 工程 |
| three.cad/dist/solver.*、wasm/libslvs.a | 不采用 | 从固定官方源码重建 |
| SolveSpace/include/slvs.h、src/slvs、求解器及构建依赖 | 按官方 slvs-wasm 目标构建候选库 | 保留声明、记录补丁、构建日志和产物哈希 |
| THREE-CSGMesh/csg-lib.js、three-csg.js | 候选 solid adapter 输入 | 保留 MIT 声明，记录 import/版本适配，完成 T-004 |

CSG 原始来源选择 THREE-CSGMesh 的固定版本，不直接使用 three.cad 的副本。旧副本的 Three.js import 指向 `../node_modules/three/src/Three`；候选原库使用包名 `three`。这只说明导入方式差异，不证明与任何新 Three.js 版本兼容。

## 4. 官方 solver 构建入口与已识别补丁

官方 `src/slvs/CMakeLists.txt` 定义 `slvs-wasm`，通过 `slvs-interface` 链接真实求解器和 mimalloc，并用 Embind 导出 JS 接口。`src/slvs/jslib.cpp` 与 `js/slvs.d.ts` 声明返回 `result、dof、nbad、bad`；运行结果是否正确仍由 T-003 验证。

源码中 `std::array<uint32_t, 4>` 的导出索引为 `0,1,3,4`，遗漏 2 并访问 4。已准备 [最小补丁](../patches/solvespace-js-array.patch)，修正为 `0,1,2,3`。本次只校验补丁能匹配固定源码；未应用于分发产物，也未编译或声称修复已在运行时生效。

原目标采用 `SINGLE_FILE=1`，WASM 嵌入 `slvs.js`，并设置 512 MB 初始内存。T-003 需要实测 Worker/模块加载、内存预算和生产子路径；必要调整另行记录补丁，不在 T-001 猜测其可用性。

## 5. 重建方法（待 T-003 实际执行）

下面是从已核对的 CMake 目标整理出的构建方案，不是成功构建记录。

1. 取得 SolveSpace 固定 commit，并初始化 Eigen/mimalloc 两个子模块。
2. 准备 Emscripten SDK、CMake 和 Ninja。SDK 候选 4.0.8 对应 tag 已核对，commit 为 `419021fa040428bc69ef1559b325addb8e10211f`；CMake/Ninja 实际版本在构建时记录。
3. 应用已登记的数组索引补丁，关闭 GUI、CLI、测试与 OpenMP，只构建 solver 目标。
4. 保留源码、子模块 commit、许可证、补丁、完整命令、构建环境、日志与产物哈希。
5. 运行矩形尺寸、冲突、圆弧/相切及重复求解，独立检查残差；通过后才接入 Worker 验证页。

在本地审计仓库中，后续构建步骤的参考命令如下。第一条会取出源码；本次未执行这些 checkout、子模块、安装或构建命令。

```powershell
git -C .research/solvespace checkout --detach 2879a02d2866e103d7a4817721ead9ac43558aea
git -C .research/solvespace submodule update --init --depth 1 extlib/eigen extlib/mimalloc
git -C .research/solvespace apply ../../patches/solvespace-js-array.patch
emcmake cmake -S .research/solvespace -B .research/solvespace-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DENABLE_GUI=OFF -DENABLE_CLI=OFF -DENABLE_TESTS=OFF -DENABLE_PYTHON_LIB=OFF -DENABLE_OPENMP=OFF -DFORCE_VENDORED_Eigen3=ON
cmake --build .research/solvespace-build --target slvs-wasm
```

SDK 的安装/激活方式见 [Emscripten 官方文档](https://emscripten.org/docs/getting_started/downloads.html)。选定版本而非 `latest`，并把激活限定到构建会话。当前 PATH 未发现 emcc/emcmake、CMake 或 Ninja；本次没有安装这些工具。

## 6. 复现本次审计

需要 Node 与 Git。先取得清单对应仓库，固定 HEAD，再运行审计。three.cad、SolveSpace、THREE-CSGMesh 使用以下模式；mimalloc 的 checkout 需固定在清单中的子模块 commit。

```powershell
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/twpride/three.cad.git .research/three-cad
git -C .research/three-cad fetch --depth 1 origin 03fbc46749f148d5226378924bfec0d496a1cc06
git -C .research/three-cad reset --soft 03fbc46749f148d5226378924bfec0d496a1cc06
node scripts/audit-upstream.mjs --check
node scripts/probe-float32.mjs
```

示例只展示第一个仓库。其余 URL、目录名与 SHA 在清单中；全部准备好后才可运行审计。脚本不主动 clone/checkout，也不调用求解 API；部分克隆读取缺失 Git 对象时可能由 Git 自动下载。`--check` 比较现有证据，省略该参数会重新生成来源证据。

## 7. 完成边界

T-001 的“可重建方法”是已定位源码、依赖、构建目标、已知补丁和待执行命令。实际重建及功能验证属于 T-003；如果构建方案实测失败，保持 M0 未通过并补充证据。

许可证和声明汇总见 [第三方清单](third-party/README.md)。T-001 时尚未引入内核；T-003 已引入自建 SolveSpace，并设置 GPL-3.0-or-later 项目 LICENSE，保留原声明。

## 8. T-003：实际重建（2026-10-01—02）

以独立 `.research/solvespace-src` 工作树保留原审计目录，初始化固定 Eigen/mimalloc 子模块，使用 Emscripten 4.0.8、CMake 3.31.8、Ninja wheel 1.13.2。源 SHA 仍为 T-001 候选，没有采用浮动新版本。

三项最小改动：数组索引、独立 ESM/WASM 构建设置、Windows 绝对 gitdir。实际 CMake 参数包含 `EIGEN_MPL2_ONLY`、关闭 GUI/CLI/Python/OpenMP、Release/LTO；26 个编译步骤和后续链接记录随仓库保存。

可执行的准备/重建脚本、产物尺寸/哈希、全部工具与许可指纹见 [构建来源](../public/wasm/SOURCE.md) 和 [solver-build.json](third-party/solver-build.json)。已有环境执行准备脚本可重复通过；从空目录的一键安装流程未独立重演，初次安装与构建已分步真实执行。

指定夹具通过真实 API 求解，双精度范围内的小数保留；开发/生产/`/cad/` 的 Worker 与资源重试通过。完整需求与未覆盖条件见 [VERIFICATION](VERIFICATION.md)，不能据此提前通过 M0。

## 9. T-004：实际 CSG 集成（2026-10-02）

固定来源不变，只复制 `csg-lib.js` 的原始 Git blob。旧 Three 桥接/Worker 不采用；本项目自写 TypeScript bridge 对齐 BSP 多边形边界上的已有顶点，三角化后独立检查闭合与方向。原始 union 体积正确但有 T 接点，未将该原始结果当成功实体。

19 个确定夹具、16 个 STL 往返及开发/生产/cad 实际 Worker 通过；边/顶点接触 union 非流形，明确失败。许可证、来源原路径、核心 SHA、实际 Three.js/npm 锁定来源见 [CSG 清单](third-party/csg-source.json) 和 [学习实验](learning/notes/L-009A-solid-evidence.md)。一般曲线/轮廓与复杂模型仍待后续。

## 10. T-403A：隔离测试浏览器与提取工具（2026-10-03）

测试专用Chrome154.0.8037.92、Edge154.0.4258.53、Firefox157.0、Geckodriver0.37.1、7zr26.03均从官方来源准备在忽略的.research，原包/版权声明未改，不进入生产bundle或Git。准确URL、档案SHA256、Firefox源码stamp和实际版本见[运行时证据](learning/evidence/T-403A-browser-runtimes.json)与[L-012B1来源](learning/notes/L-012B1-current-browser-workflow.md)。Chrome/Edge二进制的原条款保留，不能把驱动/脚本许可套用于浏览器。

Edge只读读取MSI Binary资源、PE B/102、LZMA与BCJ2后提取7z，不运行安装/更新exe。BCJ2来源7-Zip26.03 commit0766b733fe3e06dd2a7f9a3cfbf2108ac73abd17，C/Bcj2.c、Bcj2.h、7zTypes.h、CpuArch.h、Precomp.h、Compiler.h原样保留Public domain声明；原源码仅在忽略工具目录，项目新增自己的I/O包装，用既有Emscripten4.0.8编译。应用SolveSpace/CSG/Three版本和产物未修改。Geckodriver/Firefox许可来源MPL2、提取工具声明及来源核对日期见学习笔记。
