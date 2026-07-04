---
name: alchemy-ocr
description: 拉取未识别合成截图，使用 Vision Agent 自动 OCR 识别配方，去重校验后回填入库
tags:
  - alchemy
  - ocr
  - data-pipeline
tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - WebFetch
---

# 炼金合成截图自动 OCR 识别管道

## 触发方式

```
/alchemy-ocr
```

或在对话中说："跑 OCR 管道"、"识别待标注截图"、"alchemy-ocr"

---

## 执行流程

### Step 1: 检查待识别记录

在 `uploader_service/` 目录下运行：

```bash
cd uploader_service && python ocr_pipeline.py --pending
```

解析输出：
- 若输出 `CLEAR:` → 所有截图已识别，结束流程，告知用户无待处理记录
- 若输出 `PENDING_COUNT: N` → 继续 Step 2

注意 `EXISTING_RECIPES` 区块列出的已知配方——后续识别时用于去重参考。

### Step 2: 逐张识别（Vision Agent）

对每张 pending 图片：

1. 使用 `WebFetch` 获取图片 URL，仔细分析截图内容
2. 提取每条合成配方，包括：
   - **目标产物**：绿色物等数字 + 蓝色物品名称
   - **主材料 (Slot1)**：橙色「主」标记行，绿色物等 + 物品名称
   - **副材料 (Slot2-5)**：绿色「副」标记行，绿色物等 + 物品名称（数量如有多槽）
   - **百科书**：若有「炼金百科一/二/三/四」提示，记录对应数字(1-4)；无则为 0
   - **物等**：所有物等均为整数

3. **可信度判断**（每条配方标注）：
   - `confidence`: `"high"` — 文字清晰可辨，物等和名称无歧义
   - `confidence`: `"medium"` — 部分文字模糊但可合理推断
   - `confidence`: `"low"` — 关键信息缺失或图片不是合成截图

4. 若图片明显不是合成记录截图（是聊天框、背包等），标记整张图为 `"invalid": true`

### Step 3: 生成结果文件

将所有识别结果写入 `uploader_service/results.json`，格式：

```json
[
  {
    "image_url": "https://pln-pic-1259639420.cos.ap-guangzhou.myqcloud.com/images/xxx.png",
    "invalid": false,
    "recipes": [
      {
        "target_name": "白玉",
        "target_level": 5,
        "slot1_name": "白玉",
        "slot1_level": 5,
        "slot2_name": "粉水晶",
        "slot2_level": 5,
        "slot3_name": "黑玉",
        "slot3_level": 4,
        "book": 0,
        "confidence": "high"
      }
    ]
  }
]
```

注意事项：
- Slot3-Slot5 为可选字段，若截图只有 2 个材料则不填
- `confidence` 为 `"low"` 的配方仍保留，但会在后续验证中被标记
- 不要编造数据——看不清的字段留空或不填

### Step 4: 验证与去重

```bash
cd uploader_service && python ocr_pipeline.py --validate
```

这会：
- 与数据库中已有配方比对，标记 `_duplicate: true`
- 检查必要字段完整性
- 输出 VALIDATION REPORT

### Step 5: 人工确认（安全阀）

在执行导入前，汇总识别结果给用户确认：
- 显示有效配方数量 vs 重复数量
- 标注 low confidence 的配方供人工复核
- 若全部重复或无效 → 结束，告知用户

向用户提问确认是否执行导入。

### Step 6: 导入入库

用户确认后：

```bash
cd uploader_service && python import_results.py
```

这会：
- 将识别结果写入 `uploads.json`，状态改为 `recognized`
- 自动从 `alchemy_db.json` 补全材质属性（slot1_material, slot2_material 等）
- 将 `results.json` 归档为 `results_imported.json`

### Step 7: 报告结果

向用户报告：
- 成功录入 N 条新配方
- 跳过 M 条重复
- 忽略 K 张无效图片
- 当前数据库统计（运行 `python ocr_pipeline.py --stats`）

---

## 重要约束

- **不可编造数据**：看不清的字段宁缺毋滥
- **去重优先**：与已有配方签名完全匹配的自动跳过
- **无效图片过滤**：非合成截图的图片标记 invalid，不入库
- **材质补全**：依赖 `import_results.py` 自动完成，无需手动填写 slot1_material 等
- **Slot 数量**：根据截图实际情况提取 2-5 槽，不要强行补全不存在的槽位
