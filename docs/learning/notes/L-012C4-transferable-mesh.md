# L-012C4：转移缓冲区后，撤销历史还能保留网格吗？

| 项目 | 内容 |
| --- | --- |
| 日期 / 版本 | 2026-10-03 / 基线07fa3b2，T-403C2b2 |
| 关联 | L-012C、T-403C2b2、REQ-009/012、PRD6.4、NFR-004/005 |
| 状态 | 已讲解；已实验；复述未记录 |
| 前置 | [不可变网格](L-012C2-immutable-mesh-history.md)、[特征资源](L-012C3-feature-resources.md) |

## 1. 本次问题

transfer 把 ArrayBuffer 的所有权交给接收方，发送方的缓冲区随即脱离。若直接转移历史或缓存持有的数据，撤销就可能拿到空网格。输入是已有实体 number[]，输出应保持同一组双精度坐标，同时只脱离独立的消息副本。

## 2. 原理与数据流

领域网格始终为普通 number[]。适配层分配独立 Float64Array，连同三角面数发到实体 Worker；接收校验后转换为内核输入。真实输出也编码到新 Float64Array，转移回主线程，再校验解码到领域对象。每个三角面占9×8=72字节。

```mermaid
flowchart LR
  A[历史 / 冻结领域网格] -->|独立复制| B[消息 Float64Array]
  B -->|transfer / 发送方脱离| C[真实实体 Worker]
  C --> D[内核 number 数组]
  D --> E[新输出 Float64Array]
  E -->|transfer| F[校验解码 / 候选事务]
  F --> G[完整几何验证 / 原子提交]
```

传输关联只证明回包属于某个 Worker 请求。项目 session、baseRevision 和最新事务号还要在 await 后和提交前核对，取消后的正确网格同样没有提交资格。

## 3. 最小实验

```powershell
. ./scripts/use-node.ps1
npm.cmd run check:solid-wire
$env:PERF_ASSERT_BUDGETS='1'
$env:PERF_FULL_ACCEPTANCE='1'
$env:PERF_SCENE_PATH='docs/learning/evidence/T-403C2b2-performance-transfer.json'
npm.cmd run check:scene-performance
$env:NFR_EVIDENCE_PATH='docs/learning/evidence/T-403C2b2-nfr-root.json'
npm.cmd run check:nfr-contracts
$env:NFR_BASE='/cad/'
$env:NFR_EVIDENCE_PATH='docs/learning/evidence/T-403C2b2-nfr-cad.json'
npm.cmd run check:nfr-contracts
```

Windows/PowerShell7.6/Node24.21.0/npm11.19.0；浏览器Chrome154.0.8037.92、Edge154.0.4258.53、原版Firefox157.0。实际CPU/RAM/GPU见性能证据。Native MessageChannel 和 worker_threads 执行生产 SolidClient/solid.worker；不以模拟端口断言 detach。double坐标用 Object.is/深相等，直边体积容差1e-6mm³。

## 4. 实际结果与证据

| 检查 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| 独立消息副本 | double逐值相同，发送方字节0，原数组不变 | 含-0/极值/小数的9坐标精确相同；Float32小数对照有损失 | [三测试](../evidence/T-403C2b2-solid-wire.log) |
| 同一实体作两操作数 | 两个独立buffer，不脱离原网格 | 两输入各864→0字节，原8000mm³不变；坏类型/计数/非有限拒绝 | 同上 |
| 生产内核双向传输 | 真实union/失败恢复/empty | union12000，与直接内核坐标深相等；真实拒绝后intersect4000；输出发送侧byteLength0 | 同上 |
| 全部原子/文件/历史回归 | 传输变化不破坏旧权威 | 50Node与16领域测试通过；18纯core边界无运行时依赖 | [50测试](../evidence/T-403C2b2-node-replay.log)、[领域](../evidence/T-403C2b2-domain.json) |

完整三浏览器[性能/传输/资源](../evidence/T-403C2b2-performance-transfer.json)实际100线100约束/十实体105760面，各30预热后求解p95 7.7/7.6/10ms，最大计算采样间隔39.3/38.2/25ms。完整CSG场景103544面，各类30次p95分别Chrome4.2/4.2/4.3、Edge4.5/4.3/4.1、Firefox5/5/5ms；最大间隔19.6/19.8/23ms。每次输入864/864→0/0，输出为Float64且bytes=triangles×72；undo精确且无内核请求。

实际旋转中位158.73/161.29/76.92fps；20次文件冷重建最大采样间隔78.6/80.3/50ms、十次实际WebGL重建，GPU342→8/Worker2→0、纹理0/canvas1。Firefox没有Long Tasks类型，使用10ms计时采样，不虚构该API观测值；计数不代表VRAM或GC堆字节稳定。

第一次Firefox测量将跨WebDriver执行环境的 Float64Array 用 instanceof 判断，报告false，但生产客户端已成功校验并冷重建十实体。[失败原记录](../evidence/T-403C2b2-harness-realm-failure.json)保留；观测改为类型标签和BYTES_PER_ELEMENT=8后完整三浏览器复跑通过，生产编码未因该观测问题修改。

[六E2E-01/05](../evidence/T-403C2b2-current-browsers.json)、[六E2E-02/03](../evidence/T-403C2b2-e2e-geometry.json)、[六E2E-04](../evidence/T-403C2b2-e2e-failures.json)最终传输回归通过；真实10s超时/晚网格拒收、文件/STL/恢复/级联继续成立。根路径与/cad的[标签/焦点/文字错误/原生离页/同源网络](../evidence/T-403C2b2-nfr-root.json)、[子路径记录](../evidence/T-403C2b2-nfr-cad.json)通过。Firefox通过实际BiDi提示事件和取消命令验证原生beforeunload，没有派发假事件代替它。

## 5. 接回项目

[solid-wire](../../../src/adapters/solid/solid-wire.ts)仅在适配层持有typed array，[WorkerRpc](../../../src/workers/worker-rpc.ts)传递transfer列表。客户端/Worker错误码和截止不变；领域缓存、文件、Pinia不保存typed array或内核指针。PRD同步写明两层字段名，保留所有取消/竞态要求。

完整NFR矩阵见[验证](../../VERIFICATION.md)，27个原产物/许可/核心来源SHA及Git index字节[核对通过](../evidence/T-403-distribution.json)。T-403完成，MVP还需T-404最终运行说明/第三方/逐项交付审计。

## 6. 我的复述与检查题

- 我的解释：未记录。
- 小练习：同一mesh作A/B，预测两个消息buffer是否共享、发送后原mesh长度，再执行原生实验。
- 为什么：为什么WorkerRpc匹配成功，仍要在领域提交前检查项目session和取消状态？

## 7. 疑问与下一步

原生传输不等于任意几何可靠，也不证明所有机器性能相同。用户复述仍未记录；下一L-012D/T-404把逐项证据、运行命令和真实边界合为可复现交付。

## 8. 来源

- [实际代码](../../../src/adapters/solid/solid-wire.ts)、[原生测试](../../../tests/solid-wire.test.mjs)：T-403C2b2/基线07fa3b2，核对2026-10-03；精度与独立所有权。
- [WebDriver BiDi](https://w3c.github.io/webdriver-bidi/)与[WebDriver](https://w3c.github.io/webdriver/)：2026-09-30编辑草案，核对2026-10-03；实际beforeunload提示的订阅、处理与能力设置，驱动代码见[BiDi端口](../../../scripts/browser-bidi-port.mjs)。
- [PRD](../../PRD.md)6.4/9、[完整NFR脚本](../../../scripts/check-nfr-contracts.mjs)：T-403C2b2，核对2026-10-03；原预算和生产资源/焦点验证。
