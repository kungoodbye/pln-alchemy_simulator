# -*- coding: utf-8 -*-
import json
import os

def main():
    db_path = "uploads.json"
    prompt_path = "prompt.txt"

    if not os.path.exists(db_path):
        print("错误: 数据库文件 uploads.json 不存在！")
        return

    with open(db_path, "r", encoding="utf-8") as f:
        try:
            records = json.load(f)
        except Exception as e:
            print(f"错误: 解析 JSON 失败: {e}")
            return

    # Filter pending records
    pending_records = [r for r in records if r.get("status") == "pending"]

    if not pending_records:
        print("[*] 所有上传的截图都已被识别并录入，当前待标注列表为空！")
        return

    print("=" * 60)
    print(f" 找到 {len(pending_records)} 张待标注的合成截图：")
    print("=" * 60)

    urls = []
    for r in pending_records:
        url = r.get("image_url")
        urls.append(url)
        print(f" - ID #{r.get('id')}: {url}")

    # Generate Prompt Template for user
    prompt_content = (
        "你是一个高精度游戏数据提取 AI 助手。\n"
        "请分析我提供给你的以下飘流幻境合成截图列表。\n"
        "\n"
        "这些截图展示的是游戏内的合成记录窗口，每一张图通常垂直包含 3 条合成结果。\n"
        "每一条结果包含：\n"
        "1. 最终产物（最左侧圆形图标）：包含绿色的【物等】和下方的蓝色【物品名称】。\n"
        "2. 主材料（右侧第一行，带橙色主字）：包含绿色的【物等】、中间的【物品名称】和数量。\n"
        "3. 副材料1（右侧第二行，带绿色副字）：包含绿色的【物等】、中间的【物品名称】和数量。\n"
        "4. 副材料2-4（右侧后续行，带绿色副字）：若截图中有更多副材料槽位，按顺序依次提取（slot3～slot5）。"
        "若截图中只有2个材料，则 slot3～slot5 字段不填或省略。\n"
        "5. 炼金术标记（右侧金黄色椭圆标签）：通常为高阶炼金术。"
        "如果额外使用了百科书，会在右侧或标题有百科书提示（一/二/三/四，若无默认为 0）。\n"
        "\n"
        "请把你的识别结果整理为标准的 JSON 数组格式，直接输出该 JSON 数组，"
        "不要包裹任何 Markdown 格式（如 ```json）或多余解释文字，"
        "严格遵循以下 JSON Schema（slot3～slot5 为可选字段）：\n"
        "\n"
        "[\n"
    )

    for url in urls:
        prompt_content += (
            '  {\n'
            f'    "image_url": "{url}",\n'
            '    "recipes": [\n'
            '      {\n'
            '        "target_name": "柔软的藤蔓",\n'
            '        "target_level": 3,\n'
            '        "slot1_name": "神职帽",\n'
            '        "slot1_level": 6,\n'
            '        "slot2_name": "蜘蛛丝",\n'
            '        "slot2_level": 6,\n'
            '        "slot3_name": "棉布",\n'
            '        "slot3_level": 5,\n'
            '        "book": 0\n'
            '      },\n'
            '      {\n'
            '        "target_name": "麻布手套",\n'
            '        "target_level": 8,\n'
            '        "slot1_name": "神职帽",\n'
            '        "slot1_level": 6,\n'
            '        "slot2_name": "蜘蛛丝",\n'
            '        "slot2_level": 6,\n'
            '        "book": 0\n'
            '      },\n'
            '      {\n'
            '        "target_name": "神职帽",\n'
            '        "target_level": 6,\n'
            '        "slot1_name": "神职帽",\n'
            '        "slot1_level": 6,\n'
            '        "slot2_name": "蜘蛛丝",\n'
            '        "slot2_level": 6,\n'
            '        "book": 0\n'
            '      }\n'
            '    ]\n'
            '  },\n'
        )

    # strip last comma
    if urls:
        prompt_content = prompt_content.rstrip(",\n") + "\n"
    prompt_content += "]\n"

    # Write prompt to file
    with open(prompt_path, "w", encoding="utf-8") as pf:
        pf.write(prompt_content)

    print("\n" + "=" * 60)
    print(f" -> 已经自动在本地生成了大模型提示词模板：{prompt_path}")
    print("你可以直接复制里面的提示词和图片 URL 给 GPT-4o / Claude / Gemini 进行识别！")
    print("=" * 60)

if __name__ == "__main__":
    main()
