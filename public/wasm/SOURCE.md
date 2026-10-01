# SolveSpace WASM 构建来源

本目录的 `slvs.mjs` / `slvs.wasm` 是本项目从官方源码实际编译的产物，不是上游 three.cad 的旧二进制。完整哈希、依赖、工具链和原始路径见 [BUILD_SOURCE.json](BUILD_SOURCE.json)。许可原文在 [SolveSpace COPYING](licenses/solvespace-COPYING-txt.txt)，项目采用 GPL-3.0-or-later，保留各依赖自己的声明。

## 固定输入

- SolveSpace：`2879a02d2866e103d7a4817721ead9ac43558aea`。
- Eigen：`3147391d946bb4b6c68edd901f2add6ac1f31f8c`；构建启用 `EIGEN_MPL2_ONLY`。
- mimalloc：`f81bf1b31af819a31195e08f9546dc80f8931587`。
- Emscripten：4.0.8；CMake：3.31.8；Ninja wheel：1.13.2，具体二进制后缀见清单。

核对：2026-10-02。改动为 [四元组索引补丁](../../patches/solvespace-js-array.patch)、[ESM 构建补丁](../../patches/solvespace-esm-build.patch)、[Windows gitdir 补丁](../../patches/solvespace-gitdir.patch)。原始路径和补丁哈希均登记；没有复制整个上游应用。

## 在仓库重建

```powershell
. ./scripts/use-node.ps1
./scripts/setup-solver.ps1 -BootstrapPython python
./scripts/build-solver.ps1
npm.cmd run record:solver
npm.cmd run check:solver
npm.cmd run build
npm.cmd run check:solver:browser
```

首次 SDK 安装需要可运行的 Python 与网络；之后使用 SDK 自带 Python。工具和源码放在忽略的 `.research/`，安装只影响当前构建会话。构建日志、失败修复和验证范围见 [学习笔记](../../docs/learning/notes/L-006A-wasm-worker.md)。本次 Windows 环境已真实构建；其他操作系统流程未执行。
