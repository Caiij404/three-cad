# 第三方来源清单

核对日期：2026-10-01。当前阶段为审计，所有运行时复用项尚未集成。

完整固定版本和路径见 [sources.json](sources.json)，检查证据见 [文件指纹](../learning/evidence/T-001-source-audit.json)。这些记录描述来源事实，不把仓库顶层许可证自动套用到每个第三方文件。

## 计划与声明

| 对象 | 原始声明 | 状态 / 处理 |
| --- | --- | --- |
| three.cad | 顶层 LICENSE 为 GPL v3；各文件有独立来源 | 仅参考；不复制应用与旧二进制 |
| SolveSpace | README 声明 GPL v3 or later；有 COPYING.txt | 固定源码重建候选；保留 GPL 文本、版权和 THIRD_PARTIES.txt |
| THREE-CSGMesh | README 与 csg-lib.js 声明 MIT；Evan Wallace/thrax 来源 | 两个 JS 文件为候选；保留声明与 MIT 许可文本 |
| Eigen | COPYING.README 声明主要为 MPL2，部分代码 BSD/LGPL | SolveSpace 子模块已锁定；构建前核对实际包含文件和相关 COPYING 文件 |
| mimalloc | 固定 commit 的 LICENSE 为 MIT | solver 构建依赖；保留原版权和许可文本 |
| Vue / TS / Vite / Pinia / Three.js | 尚未选择本项目版本 | 在 T-002 安装前核对各版本声明并加入锁文件 |

Eigen 固定 commit 为 `3147391d946bb4b6c68edd901f2add6ac1f31f8c`。已读取其 [COPYING.README](https://gitlab.com/libeigen/eigen/-/raw/3147391d946bb4b6c68edd901f2add6ac1f31f8c/COPYING.README) 和 [COPYING.MPL2](https://gitlab.com/libeigen/eigen/-/raw/3147391d946bb4b6c68edd901f2add6ac1f31f8c/COPYING.MPL2)；不能把整个目录笼统标成只有 MPL2。mimalloc 许可已通过 Git 对象读取验证，未采用失败的 HTTP 下载结果作为证据。

## 修改与构建记录

- SolveSpace 原始路径：`src/slvs/jslib.cpp`；固定 commit 见清单；计划修改为数组导出索引 `0,1,2,3`，补丁位于 `patches/solvespace-js-array.patch`。本次只做 `git apply --cached --check`，未应用到发布源码。
- SolveSpace 原始构建目标：`slvs-wasm`，依赖 `slvs-interface`、求解器源文件、Eigen 与 mimalloc。重建计划和未验证范围见 [UPSTREAM](../UPSTREAM.md)。
- CSG 原始路径：`csg-lib.js`、`three-csg.js`；本次无改动、无构建、无 vendoring。复制前记录实际修改，再做 T-004 兼容用例。
- 上游旧静态库与 WASM：记录哈希用于辨认，未取得旧静态库的完整构建来源，不选作新应用输入。

后续每增加一个实际复用文件或二进制，追加原始路径、固定 SHA/版本、许可文件、修改、构建日志和产物哈希。保留源文件原声明；项目 LICENSE 与分发声明在实际复用时确定。
