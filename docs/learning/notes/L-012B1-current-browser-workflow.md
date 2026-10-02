# L-012B1：怎样证明完整操作在当前稳定浏览器可用？

| 项目 | 内容 |
| --- | --- |
| 日期 / 版本 | 2026-10-03；基于62fb452的T-403A工作树 |
| 关联 | L-012B1；T-403A；E2E-01/05、NFR-001/002、REQ-004/005/006/009/010/011 |
| 状态 | 讲解：已整理；实验：六条真实生产工作流通过；复述：未记录 |
| 前置知识 | [文件与相机](L-011A2-browser-files-and-camera.md)、[恢复](L-011A3-indexeddb-recovery.md)、[STL](L-011B2-selected-solid-stl.md) |

## 1. 本次问题

三个部署入口不是三种浏览器。测试库绑定的浏览器版本也不一定等于开发时当前稳定版本。本次把环境和操作流程作为输入，把真实求解诊断、提交体积、下载字节和刷新恢复作为输出，证明生产界面形成完整闭环。

## 2. 原理与数据流

先核对官方稳定版本，固定实际可执行文件；同一界面脚本经过浏览器原生输入执行。只读取公开DOM诊断，不向应用注入特征、几何或假求解结果。保存和STL必须真正下载到隔离目录，再用Node读取和独立解析。

```mermaid
flowchart LR
    Versions[官方版本 / 实际exe / 哈希] --> Browser[原生按钮 / 键盘 / 文件输入]
    Browser --> Model[真实WASM / 拉伸 / 历史]
    Model --> Files[真实下载 / 手动重开 / IndexedDB恢复]
    Files --> Evidence[DOF / 体积 / 稳定ID / 文件解析]
```

Chrome/Edge使用Playwright驱动实际稳定exe；Firefox通过Geckodriver驱动Mozilla原版稳定exe，避免把Playwright绑定的旧Firefox155当作当前157。驱动差异放在测试端口，生产代码没有浏览器专用分支。

## 3. 最小实验

输入：空项目，XY矩形(0,0)—(40,30)，绘制默认固定基点，加宽40/高30长度约束；native DOF应为0。拉伸10得到12000mm³，宽60得到18000；撤销12000/重做18000，稳定ID不变。文本焦点Ctrl+Z不得改模型，Ctrl+S应实际下载。

刷新后手动打开刚下载的文件，文档精确相同、历史为空；宽70得到21000，再下载STL，检查84+50N文件长度、单位法线、闭合和包围盒/体积。继续刷新显式恢复真实IndexedDB副本，保持dirty/空历史；再刷新明确放弃保留新空项目。

```powershell
. ./scripts/use-node.ps1
./scripts/prepare-browser-runtimes.ps1
node scripts/probe-current-browsers.mjs
npm run check:current-browsers
npm run build
npm run check:docs
```

三浏览器各跑生产root与/cad，共六条流程；完整绘制在1280×720完成，再检查1024折叠和500窄屏提示/无横向溢出。直边体积容差1e-6mm³，法线长度1e-5。Windows/Node24.21.0/npm11.19.0/Playwright1.63.0/Geckodriver0.37.1/Three0.186.1；CPU/RAM/GPU、官方元数据、URL和档案SHA256见运行时证据。

## 4. 实际结果与证据

| 检查 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| 当前稳定环境 | 实际启动核对后的浏览器 | Chrome154.0.8037.92、Edge154.0.4258.53、Firefox157.0，真实WASM/WebGL ready | [运行时](../evidence/T-403A-browser-runtimes.json)、[启动](../evidence/T-403A-browser-probe.json) |
| 矩形全过程 | DOF0、12000→18000→21000、ID稳定 | 六条生产流程实际通过，撤销/重做体积正确 | [工作流](../evidence/T-403A-current-browsers.json) |
| 文件/STL | 下载后独立检查 | 六个JSON和六个STL实际读取；手动重开文档精确一致；STL闭合/单位法线/包围盒/21000mm³通过 | 同上 |
| 刷新与布局 | 真实恢复/放弃、宽屏全流程 | 六次显式恢复dirty且空历史；六次放弃保留空项目；1280×720/1024/500通过 | 同上 |
| 焦点与离页 | 文本撤销保护模型，保存可用 | 文本Ctrl+Z模型/revision不变，Ctrl+S实际文件；dirty取消beforeunload事件通过 | 同上 |

Windows原版Firefox窗口最小宽为500，首次要求390超时；记录实际innerWidth500后改为500窄屏检查，PRD只要求窄屏提示，没有新增移动端编辑承诺。Firefox首次下载读到刚创建的空占位文件；增加非空、无.part且大小连续200ms稳定后再解析，后续两路径通过。首次恢复按钮误写为不存在的“恢复上次项目”，改用实际“恢复项目”，并等待真实副本事务已更新后刷新。准备脚本首次Chrome哈希漏抄中段，按实际完整SHA256修正，所有档案核对通过。

Firefox会遮蔽WebGL GPU字符串；报告保留其实际输出，不把其中GTX980当机器配置。CIM机器实际为RTX4070Ti。截图仅用于失败定位，几何通过依据来自数值和文件字节。

补查微软元数据发现已安装Edge154.0.4258.48落后最新补丁.53。下载官方MSI并核对官方SHA256；行政提取仅复制MSI，无浏览器载荷；后改用只读MsiRecordReadStream提取Binary.MicrosoftEdgeInstaller，解析PE的B/102资源，7zr解LZMA，原版BCJ2解码后提取两层7z。Edge安装/更新exe始终没有执行。新exe实际.53，最终六流程重新通过。

提取工具复用了既有M0 Emscripten4.0.8；7-Zip26.03来源commit0766b733fe3e06dd2a7f9a3cfbf2108ac73abd17的六个C文件未修改、原Public domain声明保留，只增加本地输入/输出包装。直接HTTP拉源码连接被关闭，固定tag的稀疏git下载成功。首次未做BCJ2解码就提取7z出现Headers Error；正确解码后归档完整验证通过。[准备脚本](../../../scripts/prepare-browser-runtimes.ps1)记录这条真实来源链；从空环境一键安装全部编译工具未重演，依赖此前M0工具准备。

## 5. 接回项目

[BrowserUi](../../../scripts/browser-ui-port.mjs)统一原生测试动作，[步骤](../../../scripts/e2e-ui-steps.mjs)只驱动界面，[完整脚本](../../../scripts/check-current-browsers.mjs)验证生产工作流。[准备脚本](../../../scripts/prepare-browser-runtimes.ps1)下载到忽略目录、核对固定哈希，读取官方当前元数据；未来版本变化会警告需重新验收，没有运行安装程序或修改系统浏览器。

T-403A/E2E-01与E2E-05指定项通过；beforeunload这里验证生产处理函数取消事件，真实原生离页对话框已在T-401B的Edge实际验证。没有声称三款原生对话框都经人确认，也没有以此推断性能。T-403整体doing；下一B完整UI E2E-02/03/04，随后C性能/资源。M4/MVP未验收。

## 6. 我的复述与检查题

- 我的解释：未记录。
- 小练习：宽改80，先预测24000mm³，再下载/刷新验证。
- 为什么：为什么必须区分“发起下载”、文件占位、文件内容解析成功？

## 7. 疑问与下一步

同一个实际文档经过布尔后代和错误路径还能保持权威/历史一致吗？进入L-012B2。性能仍需要指定100线/100约束/10实体/100000三角面的独立基准，不从小矩形通过推断。

## 8. 来源

- [Chrome for Testing元数据](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json)与[官方项目](https://github.com/GoogleChromeLabs/chrome-for-testing)：2026-10-03核对，Stable154.0.8037.92/2026-10-02元数据；隔离Chrome来源，二进制声明仍在原ABOUT/credits/terms，不以项目脚本许可替代Chrome条款。
- [Mozilla版本](https://product-details.mozilla.org/1.0/firefox_versions.json)：2026-10-03核对，157.0/2026-09-29；官方下载完整URL/哈希见运行时证据，application.ini BuildID20260924084938、SourceStamp8eb25af4acf031ab1e06abf1a912275083c820ed，原包未改。
- [Edge官方发布元数据](https://edgeupdates.microsoft.com/api/products?view=enterprise)：2026-10-03核对，Stable Windows x64最新154.0.4258.53及MSI SHA256；隔离测试包原声明保留，不更新系统浏览器。
- [7-Zip26.03 BCJ2](https://github.com/ip7z/7zip/blob/0766b733fe3e06dd2a7f9a3cfbf2108ac73abd17/C/Bcj2.c)：2026-10-03核对，原Public domain声明、C路径及编译来源见运行时证据；仅为测试包提取，应用依赖和内核未变。
- [Geckodriver0.37.1](https://github.com/mozilla/geckodriver/releases/tag/v0.37.1)及[原MPL2声明](https://raw.githubusercontent.com/mozilla/geckodriver/v0.37.1/LICENSE)：2026-10-03核对，驱动官方Firefox，未修改二进制。
- [Mozilla MPL2](https://www.mozilla.org/en-US/MPL/2.0/)与[7-Zip许可](https://www.7-zip.org/license.txt)：2026-10-03核对；Firefox/提取工具来源声明，工具仅本地测试使用，不进入应用产物/仓库。
- [PRD](../../PRD.md)、本篇脚本和上述真实证据：62fb452/T-403A工作树，2026-10-03核对；E2E及完成边界。
