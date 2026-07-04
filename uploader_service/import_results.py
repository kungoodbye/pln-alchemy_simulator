# -*- coding: utf-8 -*-
import json
import os

def main():
    db_path = "uploads.json"
    results_path = "results.json"
    db_json_path = "../../alchemy_db.json"

    if not os.path.exists(results_path):
        print(f"错误: 待录入的结果文件 {results_path} 不存在！")
        print("请先将大语言模型识别的 JSON 结果保存为 results.json 并放置于当前文件夹中。")
        return

    if not os.path.exists(db_path):
        print("错误: 数据库文件 uploads.json 不存在！")
        return

    # Load uploads.json
    with open(db_path, "r", encoding="utf-8") as f:
        try:
            records = json.load(f)
        except Exception as e:
            print(f"错误: 解析 uploads.json 失败: {e}")
            return

    # Load results.json
    with open(results_path, "r", encoding="utf-8") as f:
        try:
            results_data = json.load(f)
        except Exception as e:
            print(f"错误: 解析 results.json 失败: {e}")
            return

    # Load alchemy_db.json if available to autocomplete material names
    db_items = {}
    if os.path.exists(db_json_path):
        try:
            with open(db_json_path, "r", encoding="utf-8") as f:
                raw_db = json.load(f)
                # Map by name for fast lookup
                for item in raw_db:
                    if item.get("name"):
                        db_items[item["name"]] = item
            print(" -> 成功载入 alchemy_db.json，自动补全材料材质功能已启用。")
        except Exception as e:
            print(f"警告: 载入 alchemy_db.json 失败 (将无法自动补全材质): {e}")
    else:
        print("警告: ../alchemy_db.json 未找到 (将无法自动补全材质)。")

    # Process imports
    update_count = 0
    
    # Make a lookup map of records by image_url
    records_map = {r.get("image_url"): r for r in records}

    for entry in results_data:
        image_url = entry.get("image_url")
        if not image_url:
            continue
            
        if image_url in records_map:
            record = records_map[image_url]
            
            # Enrich and deduplicate recipes
            unique_recipes = []
            seen = set()
            for recipe in entry.get("recipes", []):
                # Hashable key for comparison
                key = (
                    recipe.get("target_name"),
                    recipe.get("target_level"),
                    recipe.get("slot1_name"),
                    recipe.get("slot1_level"),
                    recipe.get("slot2_name"),
                    recipe.get("slot2_level"),
                    recipe.get("book", 0)
                )
                if key not in seen:
                    seen.add(key)
                    
                    # Auto-fill Slot 1 material
                    slot1_name = recipe.get("slot1_name")
                    if slot1_name in db_items:
                        recipe["slot1_material"] = db_items[slot1_name].get("material", "")
                    
                    # Auto-fill Slot 2 material
                    slot2_name = recipe.get("slot2_name")
                    if slot2_name in db_items:
                        recipe["slot2_material"] = db_items[slot2_name].get("material", "")
                    
                    unique_recipes.append(recipe)

            # Update record
            record["status"] = "recognized"
            record["result"] = {
                "recipes": unique_recipes
            }
            update_count += 1
            print(f" [+] 成功录入 ID #{record.get('id')} 的标注数据 (包含 {len(unique_recipes)} 条配方)")
        else:
            print(f" 警告: 结果中的图片 URL 不在数据库记录中，已跳过: {image_url}")

    if update_count > 0:
        # Save back to uploads.json
        with open(db_path, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
            
        print(" -> 已经保存更新至 uploads.json。")
        
        # Rename results.json to avoid importing again
        imported_path = "results_imported.json"
        if os.path.exists(imported_path):
            os.remove(imported_path)
        os.rename(results_path, imported_path)
        print(f" -> 已自动将 results.json 重命名归档为 {imported_path}。")
    else:
        print(" 没有记录被更新。")

if __name__ == "__main__":
    main()
