# 截图 OCR 标注数据流开发任务清单

- [x] 1. 升级 Go 服务端 `main.go` 中的 `SynthesisRecord` 结构，增加 `status` 和 `result` 字段
- [x] 2. 升级已有的 `uploads.json`，补充 `"status": "pending"` 与 `"result": null`
- [x] 3. 编写 `uploader_service/export_pending.py`，拉取未识别图片并生成大模型提示词
- [x] 4. 运行 `export_pending.py` 并直接输出当前库里唯一的图片 URL 与大模型 Prompt 模板给用户
- [x] 5. 编写 `uploader_service/import_results.py`，实现解析大模型返回结果并回填入库
- [x] 6. 验证整个导入导出数据流
