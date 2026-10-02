# L-012B3：故障和晚结果怎样证明没有污染权威数据？

| 项目 | 内容 |
| --- | --- |
| 日期 / 版本 | 2026-10-03；基于d21312a的T-403B2工作树 |
| 关联 | L-012B3；T-403B2；E2E-04、REQ-009/010/012、NFR-004超时/005 |
| 状态 | 讲解：已整理；实验：六真实生产故障流程通过；复述：未记录 |
| 前置知识 | [原子历史](L-010A-atomic-history.md)、[Worker关联](L-007A-worker-correlation.md)、[恢复存储](L-011A3-indexeddb-recovery.md) |

## 1. 本次问题

候选已经由真实内核计算成功，但到达时用户取消或切换项目，它还能改变当前文档吗？成功几何不等于仍有提交资格。故障实验必须同时检查真实结果和权威数据/历史，不能只看错误文案。

## 2. 原理与数据流

输入是界面创建的40×30×10有效零件。测试扣留原Worker产生的回包，保持内核和几何真实；在回包到达应用前进行取消、项目切换或等待实际10秒请求截止。输出应是旧有效项目或新空项目，以及可重试的操作状态。

```mermaid
flowchart LR
    Request[真实候选请求] --> Kernel[原WASM / 拉伸Worker]
    Kernel --> Hold[扣留原成功回包]
    Hold --> Gate[取消 / 新项目 / 10秒超时]
    Gate --> Authority[旧权威保留 / 晚结果拒收]
    Authority --> Retry[新Worker / 存储重试 / WebGL重建]
```

只改变回包交付时间和故障输入；不制造网格。存储故障向真实IDB put抛原生QuotaExceededError；旧记录用实际readonly事务读取比较。WebGL通过真实WEBGL_lose_context扩展丢失，再使用产品的“重试视口”。

## 3. 最小实验

原生UI固定40×30，拉伸10得到12000。增加同一宽边50长度造成native冲突；旧文档/revision/历史完全不变，仍可实际下载。打开损坏“{”与未来schemaVersion2同样保留旧权威。

已有深度20的实际回包应为24000，扣留期间文档/revision仍旧；实际等待≥9900ms后WORKER_TIMEOUT，旧12000及历史保留。释放已终止Worker的旧回包不能提交；新Worker重试24000，撤销12000。

真实IDB旧副本已更新后，注入配额故障、改项目名；旧副本精确保留，仍能手动下载；关闭注入重试，新副本JSON与当前文档相同。真实WebGL丢失/重建后文档/指标/历史相同，再改深11得到13200，撤销恢复。

连续填宽41—70共30输入，仅最后明确应用；扣留实际21000网格，Esc取消后新建，再释放旧结果，新空项目精确不变。另建自由宽矩形，删除宽约束，原生鼠标30次移动，扣留实际WASM DOF1/残差≤1e-5结果；取消/新建/释放后空项目仍精确一致。

```powershell
. ./scripts/use-node.ps1
npm run check:e2e-failures
npm run build
npm run check:docs
```

Windows/Node24.21.0/npm11.19.0；Chrome154.0.8037.92、Edge154.0.4258.53、原版Firefox157.0各root/cad，1280×720；Three0.186.1、固定WASM/CSG未改。体积1e-6mm³，残差1e-5mm/rad，实际10秒计时没有缩短。

## 4. 实际结果与证据

| 检查 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| 冲突/文件 | 旧权威与历史保留、仍能保存 | 六native冲突、12坏文件拒绝，六真实旧零件下载通过 | [六故障流程](../evidence/T-403B2-e2e-failures.json) conflictFiles |
| 真实超时 | 24000扣留，10s后旧12000可重试 | 六实际等待、精确权威/历史、旧回包拒收、新Worker24000及undo12000通过 | workerTimeout |
| IDB/WebGL | 错误明确、旧记录/文档有效 | 六真实旧副本保留、故障中下载/存储重试；实际context丢失重建、深11及撤销通过 | storageViewport |
| 连续尺寸/拖点 | 切项目后晚结果不能提交 | 六实际21000晚网格与六30移动WASM DOF1结果，新空项目均精确不变 | dimensions / drag |
| 异步错误 | 无未处理异常 | 六流程window error/unhandledrejection记录为空 | unhandledErrors |

首轮把监听器挂在Worker.postMessage时，应用onmessage已经先注册，回包先提交导致超时文案未出现。改为Worker构造时先注册拦截，再让产品注册处理器；新增扣留后文档/revision硬检查。不是把已提交结果当作超时回滚通过。拖动结果是扁平SketchSolution/status=under-constrained，不是猜测的diagnostics.status=solved，按实际契约核对。成功编辑后undo正常增加revision并建立redo，只比较精确文档/指标；失败才要求revision/历史完全不动。

## 5. 接回项目

[故障脚本](../../../scripts/check-e2e-failures.mjs)在隔离浏览器中安装回包与配额探针，[原生端口](../../../scripts/browser-ui-port.mjs)新增Firefox W3C指针动作。生产应用、超时阈值、内核、依赖不变，没有为测试添加假成功分支。

T-403B2/E2E-04及B完成，合并A/B1/B2，E2E-01—05指定流程已有三稳定浏览器root/cad结果。NFR-004主线程200ms与NFR-003基准性能、长期资源、全NFR汇总仍在C；T-403/M4/MVP未完成。

## 6. 我的复述与检查题

- 我的解释：未记录。
- 小练习：预测取消后释放24000回包是否产生可撤销命令，再执行。
- 为什么：为什么“网格正确”仍不足以允许提交到新项目？

## 7. 疑问与下一步

进入L-012C：大模型期间主线程是否真能保持响应？Worker计算不保证主线程的验证、拷贝和显示便宜，需要指定规模与至少30个预热后样本。

## 8. 来源

- [PRD E2E-04/NFR](../../PRD.md)：d21312a，2026-10-03核对；真实错误/异步/超时和性能边界。
- [WorkerRpc](../../../src/workers/worker-rpc.ts)、[恢复适配器](../../../src/adapters/files/recovery-store.ts)：d21312a，2026-10-03核对；实际10000ms、reset后新Worker、IDB事务完成/配额分类。
- 本任务脚本和上述真实证据：T-403B2工作树，2026-10-03核对；原回包、实际存储和原生指针动作。
