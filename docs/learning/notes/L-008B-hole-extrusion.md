# L-008B：孔洞怎样变成闭合拉伸网格？

| 项目 | 内容 |
| --- | --- |
| 日期 / 版本 | 2026-10-02；Three.js 0.186.1 内含 Earcut 3.0.2 |
| 关联 | L-008B；T-004；REQ-006 前置；不是完整轮廓编辑器 |
| 状态 | 讲解：已整理；实验：已执行；复述：未记录 |
| 前置知识 | [网格证据](L-009A-solid-evidence.md)、二维环与法向 |

## 1. 本次问题

孔洞不是少画一个盖子：如何给外边界、孔边界和两端盖正确的方向？

## 2. 原理与数据流

外环按逆时针，孔环按顺时针。ShapeUtils/Earcut 对带孔平面进行三角化；适配器把每个点沿局部法向复制到两端，再连接侧壁。顶盖按法向排序，底盖反向；内孔侧壁朝向孔内。

世界位置为 `u*x + v*y + n*depth`。XY 法向 +Z；XZ 法向 -Y；YZ 法向 +X，均满足 `u × v = n`。负深度使用 low=min(0,depth)、high=max(0,depth)，方向仍朝实体外侧，不能只把正深度坐标乘 -1 而保留原排序。

## 3. 最小实验

```text
输入：外环 (0,0),(40,0),(40,30),(0,30)；孔环 (15,10),(15,20),(25,20),(25,10)
操作：XY/XZ/YZ 各拉伸 +10 与 -10 mm
期望：(40×30 - 10×10)×10 = 11000 mm³；闭合、外向、包围盒正确
容差：体积相对 1e-4；包围盒 4e-4 mm；焊接 1e-6 mm
命令：npm run check:solid；npm run check:solid:browser
环境：Windows x64、Node 24.21.0、Three.js 0.186.1、Edge 154.0.4258.48
```

具体代码是 [holeExtrusion](../../../src/adapters/solid/solid-spike.ts)；使用 Number 直接构造坐标，没有通过 ExtrudeGeometry 的 Float32 输出做中转。

## 4. 实际结果与证据

| 检查 | 期望 | 实际 | 证据 |
| --- | --- | --- | --- |
| 三平面 × 两深度 | 6 项各 11000 mm³ | 全部满足容差，闭合、顶点邻域和方向通过 | [Node JSON](../evidence/T-004-solid-node.json) |
| Worker 同输入 | 与 Node 几何断言一致 | 开发/生产/cad 各 6 项通过 | [浏览器 JSON](../evidence/T-004-solid-browser.json) |
| 0 深度、未知平面 | 明确拒绝 | INVALID_EXTRUSION | Node JSON invalid |

## 5. 接回项目

这只是固定直边孔洞夹具。没有实现自动环分类、自交检查、重叠孔洞、一般开放草图、曲线弦误差或用户编辑；这些仍由 T-202/T-203 完成。手写输入环正确不等于轮廓发现算法已经存在。

## 6. 我的复述与检查题

- 我的解释：未记录。
- 小练习：把深度改为 -20，预测体积 22000 和对应法向范围，再核对。
- 为什么问题：为什么 XZ 的正深度会向世界 -Y 方向延伸？

## 7. 疑问与下一步

用户对环方向和基向量尚未反馈。下一篇 [STL](L-011B-stl-roundtrip.md) 验证这些三角形写入文件后能否保持正确。

## 8. 来源

- [ShapeUtils 固定版本](https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/src/extras/ShapeUtils.js)、[Earcut 3.0.2](https://github.com/mapbox/earcut/tree/v3.0.2)：核对 2026-10-02；本地锁定源码已读取，原许可保留在 public/solid。
- [Shape 官方说明](https://threejs.org/docs/pages/Shape.html)：滚动文档，核对 2026-10-02，外环与孔洞方向；具体 API 以锁定版本为准。
