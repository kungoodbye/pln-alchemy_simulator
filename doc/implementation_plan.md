# 截图数据 OCR 标注与回填学习设计方案（第二步）

本项目旨在提供一套**图像异步 OCR 标注与回填机制**。通过两个极简的 Python 脚本，将用户上传的图片外链提取出来，送入大语言模型进行识别，再将大模型输出的结构化配方参数回填入库，实现模拟器数据学习的闭环。

---

## 1. 拟新增与修改文件

```
d:\飘流幻境新世界\uploader_service/
├── main.go                       [MODIFY] 升级结构体，默认写入 "status": "pending"
├── uploads.json                  [MODIFY] 升级旧记录，补全 status 与 result 字段
├── export_pending.py             [NEW] 脚本 1：拉取并输出所有未识别图片外链及提示词
└── import_results.py             [NEW] 脚本 2：接收大模型识别的 JSON 结果并录入回填
```

---

## 2. 详细设计方案

### A. 数据库结构升级 (`uploads.json`)
数据库将升级包含识别状态与识别结果：
* `status`：状态字符串，取值为 `"pending"`（待识别）或 `"recognized"`（已识别）。
* `result`：包含合成产物、主材、副材及百科等级的结构化对象，未识别时为 `null`。

```json
[
  {
    "id": 1,
    "timestamp": "2026-07-04T07:35:39+08:00",
    "image_url": "https://pln-pic-1259639420.cos.ap-guangzhou.myqcloud.com/images/1783121739404_clipboard_1783121738538.png",
    "status": "pending",
    "result": null
  }
]
```

### B. [NEW] 脚本 1：`export_pending.py` (拉取并输出)
* **执行方式**：`python export_pending.py`
* **功能**：
  1. 读取 `uploads.json`，查找所有 `status == "pending"` 的记录。
  2. 提取并打印出所有未识别的图片 URL，供您复制使用。
  3. **模型助手**：在控制台直接输出为您准备好的 **大模型视觉识别提示词（Prompt Template）**，包含预期的输出 JSON Schema。您只需将提示词和图片发给任意视觉大语言模型（如 GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro）即可。

### C. [NEW] 脚本 2：`import_results.py` (解析并回填)
* **执行方式**：将大模型输出的 JSON 结果保存到 `results.json`，然后运行 `python import_results.py`。
* **功能**：
  1. 读取 `results.json`，解析出每个图片 URL 对应的识别参数。
  2. 根据图片 URL 对比 `uploads.json`，更新相应记录的 `status` 为 `"recognized"` 并填入 `result` 的参数。
  3. 自动匹配 `alchemy_db.js` 以获取材质等额外属性，确保数据清洗规范。

---

## 3. 验证与测试方案

### 自动与手动验证
1. 运行 `python export_pending.py`，确认其能够识别并输出您之前上传的唯一图片地址：
   - `https://pln-pic-1259639420.cos.ap-guangzhou.myqcloud.com/images/1783121739404_clipboard_1783121738538.png`
2. 构造一个包含该图片识别结果的 mock `results.json` 文件：
   ```json
   [
     {
       "image_url": "https://pln-pic-1259639420.cos.ap-guangzhou.myqcloud.com/images/1783121739404_clipboard_1783121738538.png",
       "recipes": [
         {"target_name": "柔软的藤蔓", "target_level": 3, "slot1_name": "神职帽", "slot1_level": 6, "slot2_name": "蜘蛛丝", "slot2_level": 6, "book": 0},
         {"target_name": "麻布手套", "target_level": 8, "slot1_name": "神职帽", "slot1_level": 6, "slot2_name": "蜘蛛丝", "slot2_level": 6, "book": 0},
         {"target_name": "神职帽", "target_level": 6, "slot1_name": "神职帽", "slot1_level": 6, "slot2_name": "蜘蛛丝", "slot2_level": 6, "book": 0}
       ]
     }
   ]
   ```
3. 运行 `python import_results.py`。
4. 确认 `uploads.json` 状态变更为 `"recognized"`，且结果字段已被录入。
