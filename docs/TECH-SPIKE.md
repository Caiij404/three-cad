# M0 技术验证与进入 M1 的依据

日期：2026-10-02。结论：T-001—T-005 的技术验证通过，可以开始 M1。此 gate 证明选定内核与构建路线可执行，不代表完整 P0、三浏览器或最终产品已验收。

## 固定兼容矩阵

| 边界 | 固定输入 | 实际验证 | 证据 |
| --- | --- | --- | --- |
| 工程 | Node 24.21.0 / npm 11.19.0；Vue 3.5.43 / Vite 8.3.2 / TS 6.0.3 | 类型/构建、实际开发/生产入口通过 | [工具链](third-party/npm-dependencies.json) |
| 求解 | SolveSpace 2879a02d + 三补丁；Emscripten 4.0.8 | 真矩形/圆弧相切/冲突、DOF、残差和重复负载 | [Node](learning/evidence/T-003-solver-node.json) |
| 实体 | BSP 8bd00fe9；Three.js 0.186.1 / types 0.186.0 | 19 项几何、16 个 STL 独立解析；非流形接触拒绝 | [Node](learning/evidence/T-004-solid-node.json) |
| 浏览器 | Windows x64 / Edge 154.0.4258.48 | 两内核在开发/生产/cad 同页实际 Worker 并行 | [集成](learning/evidence/T-005-gate-browser.json) |
| 资源恢复 | 同源独立 mjs/wasm；Vite base `/cad/` | 资源与 MIME 正确；实际 503 失败后显式重试 | [重放](learning/evidence/T-005-load-retry.json) |
| 传输生命周期 | 共用 WorkerRpc；默认 10000 ms 截止 | 8 项控制端口测试；实际静默 Worker 超时后真 solver 恢复 | [单测](learning/evidence/T-005-worker-rpc.json)、[浏览器](learning/evidence/T-005-gate-browser.json) |
| 来源 | 固定源码/锁文件/原声明/产物哈希 | Git index 字节与构建来源一致 | [分发](learning/evidence/T-004-distribution.json) |

失败候选和实际修复不隐藏：旧 Float32 包装器拒绝采用；TS 7.0.2 与 vue-tsc 不兼容改锁 6.0.3；Windows gitdir、ESM/WASM 内存导出、Vite SDK HTML 扫描、favicon 404、BSP T 接点与生成文件行尾均有 [验证记录](VERIFICATION.md)。

## 几何与错误契约

求解长度残差 `1e-5 mm`，弧相切单位向量点积 `1e-5`；状态和 DOF 从原生 API 读取，冲突返回约束 ID，不返回候选点。完整 P0 约束仍待 T-201。

网格固定夹具体积相对误差 `1e-4`、包围盒 `4e-4 mm`；位置焊接 `1e-6 mm`。同时检查边、顶点单环邻域、有限值、正体积及方向。empty 为零三角形/bounds=null，与失败不同。BSP 平面分类阈值 `1e-5`；边界一致三角化桥接最多 2000 顶点。

面相切与完全相同方块支持范围已有证据；边/顶点相切 union 形成非流形，明确失败。并不承诺任意共面、极薄或复杂曲线都可靠。

WorkerRpc 匹配 session/requestId/revision，超时或错误终止整条待处理队列，显式下一请求才重建。旧 Worker 的迟到回复和错误不能影响新 Worker。匹配各请求不等于丢弃所有较旧文档版本；应用文档的 revision 权威、事务回滚与拖动节流仍待 M1/M2。

## 小夹具采样

基准机：[i7-13700KF / 34,163,970,048 bytes RAM / RTX 4070 Ti](learning/evidence/T-005-machine.json)。Edge 中完成初次夹具热身后，两 Worker 并行，各采样 30 次：4 点矩形与两个 20³ 方块 union；计时包括消息往返及 Worker 适配器计算，不包括 WebGL 视口。

| 入口 | solver p95 | solid p95 | 实际 10 秒截止 |
| --- | --- | --- | --- |
| 开发 | 0.3 ms | 1.1 ms | 10001.8 ms |
| 生产 | 0.4 ms | 1.2 ms | 10004.9 ms |
| `/cad/` | 0.3 ms | 1.2 ms | 10015.1 ms |

观察器支持 longtask，本次没有记录 ≥50 ms 任务。该小夹具结果不是 NFR-003 的 100 线/100 约束/10 实体/10 万面验收，也不是 NFR-004 完整场景的证明；未测渲染帧率、长时间资源泄漏和其他浏览器。

## 分发与复现

`npm ci` 后 `npm run build`；应用资源同源，无运行时 CDN。SDK 重建入口见 [SOURCE](../public/wasm/SOURCE.md)。源码/SDK 指纹、原许可和三补丁见 [solver 清单](third-party/solver-build.json)；BSP/Three/Earcut 见 [CSG 清单](third-party/csg-source.json)。没有声称不同系统能生成逐字节相同产物。

```powershell
. ./scripts/use-node.ps1
npm.cmd run check:solver
npm.cmd run check:solid
npm.cmd run check:worker
npm.cmd run build
npm.cmd run check:gate
npm.cmd run check:docs
```

浏览器默认使用已安装 Edge；不自动下载浏览器。故障端口单测只验证传输协议，不当作真内核数值证据。真正的 10 秒恢复实验使用明确标注的静默 Worker，随后创建真实 solver Worker 并校验 60 mm 矩形。

## M1 接续

下一任务 T-101：Vue 工作区、模式状态机、加载/错误入口。T-102 再建立领域文档、稳定 ID、schema、DAG 与命令/事务基础。所有未实现操作保持禁用并有原因。T-103 之后才能建设实际 Three.js 视口和草图编辑。

M0 学习资料已整理并实际实验，用户复述仍未记录。技术 gate 与用户掌握程度独立，继续按 [学习路线](learning/ROADMAP.md) 分问题学习。

当前M2接续：T-201A/B已交付。B2的51全家族相切、范围拒绝与真实Worker/事务见 [L-006F](learning/notes/L-006F-domain-tangency.md) 与 [验证](VERIFICATION.md)。约束面板、通用轮廓/后代/文件与最终验收仍待后续；M0表格保留原验证范围。
