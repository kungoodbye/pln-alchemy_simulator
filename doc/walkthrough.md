# 炼金合成模拟器与核心逻辑重构 Walkthrough

我们已经成功开发了高保真、精美的 **炼金合成模拟器**，并顺利完成了对现有项目中核心炼金算法的提取与重构。

---

## 变更内容

### 1. 炼金核心逻辑提取与泛化
* **新建共享模块**：[alchemy_core.js](file:///d:/飘流幻境新世界/alchemy_simulator/alchemy_core.js)
  * 提取了 `COMPATIBILITY` 材质相容表、物等区间计算、百科成本、跃升惩罚等级常量。
  * 将原本只针对 2 件或 3 件特定物品的预测算法，泛化为支持 **2 至 5 件任意材料物品** 的通用多槽合成算法：`getAlchemyResultCandidatesMulti` 与 `getRecipeOutcomeBreakdownMulti`。
  * 精确集成了原本的物等 fallback 映射逻辑，保证多槽合成的概率仿真高度可信。
* **重构主项目**：
  * 修改 [index.html](file:///d:/飘流幻境新世界/index.html) 引入 `alchemy_simulator/alchemy_core.js`。
  * 修改 [app.js](file:///d:/飘流幻境新世界/app.js)，移除了几百行冗余的算法公式，使代码专注于 UI 逻辑和 Dijkstra 路径规划展现。
* **同步测试**：
  * 升级 [tests/alchemy_logic_regression.test.js](file:///d:/飘流幻境新世界/tests/alchemy_logic_regression.test.js)，在沙箱中提前载入 `alchemy_core.js` 进行算法完整性覆盖。

### 2. 独立炼金合成模拟器开发
* **模拟器首页**：[index.html](file:///d:/飘流幻境新世界/alchemy_simulator/index.html)
  * 全新的工坊卡片式布局，融合暗黑极简与金紫科幻特效。
  * 包含主材与副材标签，支持一键清空和返回寻路器的主页导航。
* **五芒星与炼金釜样式**：[style.css](file:///d:/飘流幻境新世界/alchemy_simulator/style.css)
  * 利用 **SVG 连线** 渲染五芒星，并采用 `filter="url(#gold-glow)"` 实现流光描边金影。
  * 精准计算 5 个插槽对应的正五边形顶点坐标并进行 CSS 绝对定位。
  * 编写 `riseSteam` 烟雾、`floatBubble` 锅炉沸腾液体等微动画。
* **交互与仿真算法**：[simulator.js](file:///d:/飘流幻境新世界/alchemy_simulator/simulator.js)
  * **插槽材质选择**：点击 "?" 插槽调出全屏模糊弹窗，支持对 22 万行大数据库进行 debounced 多重过滤（模糊搜索、种类、主材质）。
  * **合成预测**：随时展示物等上下限及各个产物的精确概率表。
  * **动画抽取**：合成时播放法阵加速旋转与熔釜沸腾流光动画，随后基于真实概率权重抽取装备结果并弹窗揭晓。
  * **连续批量模拟**：支持设定特定目标产物，一键批量模拟 100/500/1000 次，统计实际命中次数、命中率与百科金币总消耗。
  * **本地历史记录**：使用 `localStorage` 本地保存最多 100 条最新合成的记录明细（材料、百科、产物与时间）。

### 3. 合成截图收集与学习服务（第一步）
* **独立上传页面**：[upload.html](file:///d:/飘流幻境新世界/alchemy_simulator/upload.html)
  * 提供了基于 HTML5 Drag & Drop API 的截图预览与上传区。
  * **联想标注表单**：与 `alchemy_db` 高度整合，输入文字即可联想选择目标产物、主材料、副材料，并自动带出材质与物等属性。
  * **数据实时比对**：从后端服务获取历史上传记录后，前端会实时调用 `alchemy_core.js` 的预测模型对收集到的合成配方进行比对。若当前模型已包含该公式，则显示 `已包含在模型中`；否则显示 `待学习/新配方`，实现直观的自动化偏离诊断。
* **直传控制逻辑**：[upload.js](file:///d:/飘流幻境新世界/alchemy_simulator/upload.js)
  * 实现三阶段上传（1. 向 Go 后端申请 presign 预签名 URL ➡️ 2. 直传图片文件流至 COS ➡️ 3. 回传包含 COS 地址与标注数据的 JSON 结构给 Go 后端入库）。
* **独立 Go 后端服务**：[main.go](file:///d:/飘流幻境新世界/uploader_service/main.go)
  * 采用 `sync.Mutex` 文件排他锁对本地 `uploads.json` 数据集进行追加读写，保证原子性。
  * 提供 `presign` 腾讯云签名接口、`record` 保存接口、`records` 列表加载接口。
* **密钥配置模板**：[config.json](file:///d:/飘流幻境新世界/uploader_service/config.json)
  * 将 SecretId/Key 与地域、端口等敏感配置从代码中解耦，防止秘钥泄露。

---

## 验证与测试结果

### 1. 自动化回归测试
运行根目录回归测试，全部逻辑断言与边缘案例均完好无损通过：
```bash
node tests/alchemy_logic_regression.test.js
```
**结果**：`Exit Code: 0` (全测试通过)

### 2. 后端服务编译测试
在 `uploader_service/` 目录下对 Go 后端服务进行编译测试，成功生成可执行文件，无任何语法与类型错误。

### 3. 手动功能验证
* 开启主页寻路器，搜索 `晚宴礼服` 生成路径树正常。
* 进入合成模拟器，点击顶部“📤 上传合成截图”导航项，能够正常跳转至数据收集平台。
* 即使在腾讯云 COS 凭证未配置的情况下，由于增加了完善的异常捕获与 CORS，上传界面能清晰定位并提示当前连接情况。
