# L-007A：旧 Worker 的回复为什么不能影响新请求？

| 项目 | 内容 |
| --- | --- |
| 日期 / 版本 | 2026-10-02；本项目 WorkerRpc、Node 24.21.0、Edge 154.0.4258.48 |
| 关联 | L-007A/B 传输部分；T-005；REQ-012、NFR-004 前置 |
| 状态 | 讲解：已整理；实验：已执行；复述：未记录 |
| 前置知识 | [WASM 与 Worker](L-006A-wasm-worker.md)、Promise |

## 1. 本次问题

Worker 超时被替换后，旧事件若迟到，会不会错误结束新请求或再次摧毁新 Worker？

## 2. 原理与数据流

```text
requestId：同一客户端中的唯一调用
revision：该调用对应的输入版本
sessionId：当前 Worker 会话，重建后改变
回复：三个值都匹配待处理调用，且来自当前 Worker，才兑现 Promise
```

仅检查 requestId 不够。旧 Worker 的 `error` 事件也必须核对实例身份，否则它可能把新 Worker 再次终止。终止时清空计时器、拒绝全部待处理调用，下一次显式请求才重建，避免错误重启循环。

传输层允许较早的独立请求正常完成；应用服务之后还需判断结果是否属于当前文档版本。两层职责不能混为一谈。

## 3. 最小实验

```powershell
. ./scripts/use-node.ps1
npm.cmd run check:worker
npm.cmd run build
npm.cmd run check:gate
```

控制端口测试人为反转回复顺序、注入错误元数据/迟到事件与消息克隆失败。它不模拟几何答案；真实几何来自浏览器内两个实际 Worker。浏览器还给真实静默 Worker 一次默认 10000 ms 截止，再用新会话加载真实 WASM 求解 60 mm 矩形。

代码见 [WorkerRpc](../../../src/workers/worker-rpc.ts)、[测试](../../../tests/worker-rpc.test.mjs) 和 [真实 gate](../../../src/experiments/gate-runner.ts)。

## 4. 实际结果与证据

| 输入 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| 8 类故障/元数据/生命周期场景 | 各请求正确兑现或拒绝 | 8 测试通过 | [协议 JSON](../evidence/T-005-worker-rpc.json) |
| 静默 Worker，默认截止 | 约 10 秒拒绝并重建 | 三入口 10001.8—10015.1 ms；恢复后真 solver 几何正确 | [浏览器](../evidence/T-005-gate-browser.json) |
| 真实 solver 与 solid 并行 | 状态隔离、错误后有效请求恢复 | 8+19 夹具及非法输入后恢复通过 | 同上 |

Node 控制端口截止用 20 ms，旨在快测清理分支；真正的默认 10 秒已另外在实际浏览器 Worker 执行，没有把缩短的单测伪装成生产截止实测。

## 5. 接回项目

两个内核客户端共用传输层；内核适配器和消息结果仍各自定义。没有完成“切换项目后旧文档绝不提交”的应用事务验收，亦未实现 transferable 大网格所有权实验；这些继续后续学习和 T-201。

## 6. 我的复述与检查题

- 我的解释：未记录。
- 小练习：先预测超时后 session、Worker 实例与 requestId 哪些改变，再看测试中实际消息。
- 为什么问题：为什么旧 Worker 的 error 事件也需要过滤，不能只过滤成功回复？

## 7. 疑问与下一步

Promise 匹配与文档提交权威的区别尚待用户反馈。下一篇 [L-012A](L-012A-m0-gate.md) 解释技术 gate 的证据层级。

## 8. 来源

- [实际协议代码](../../../src/workers/worker-rpc.ts)、[可复现测试](../../../tests/worker-rpc.test.mjs)：核对 2026-10-02，行为以实际输入/输出为准；上游二进制版本见 L-006A。
