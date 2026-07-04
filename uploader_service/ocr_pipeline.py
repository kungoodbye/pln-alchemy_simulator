# -*- coding: utf-8 -*-
"""
OCR Pipeline — 炼金合成截图自动识别管道

Usage:
  python ocr_pipeline.py --pending          列出所有待识别图片 URL（供 Agent 使用）
  python ocr_pipeline.py --validate         对 results.json 做去重和可信度预检
  python ocr_pipeline.py --stats            显示当前数据库统计
"""

import json
import os
import sys

DB_PATH = "uploads.json"
RESULTS_PATH = "results.json"
DB_JSON_PATH = "../../alchemy_db.json"


def load_records():
    if not os.path.exists(DB_PATH):
        return []
    with open(DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_alchemy_db():
    """Load alchemy_db.json for material compatibility cross-ref."""
    items = {}
    if os.path.exists(DB_JSON_PATH):
        try:
            with open(DB_JSON_PATH, "r", encoding="utf-8") as f:
                for item in json.load(f):
                    if item.get("name"):
                        items[item["name"]] = item
        except Exception:
            pass
    return items


def recipe_signature(recipe):
    """Generate a canonical tuple for dedup across all 5 slots."""
    return (
        recipe.get("target_name"),
        recipe.get("target_level"),
        recipe.get("slot1_name"),
        recipe.get("slot1_level"),
        recipe.get("slot2_name"),
        recipe.get("slot2_level"),
        recipe.get("slot3_name"),
        recipe.get("slot3_level"),
        recipe.get("slot4_name"),
        recipe.get("slot4_level"),
        recipe.get("slot5_name"),
        recipe.get("slot5_level"),
        recipe.get("book", 0),
    )


def cmd_pending():
    """Output pending image URLs for the Agent to process."""
    records = load_records()
    pending = [r for r in records if r.get("status") == "pending"]

    if not pending:
        print("CLEAR: 所有截图均已识别，无待处理记录。")
        return

    print(f"PENDING_COUNT: {len(pending)}")
    for r in pending:
        print(f"PENDING: id={r['id']} | url={r['image_url']}")

    # Output already-recognized recipes for dedup reference
    recognized = [r for r in records if r.get("status") == "recognized"]
    if recognized:
        print(f"\nEXISTING_RECIPES ({len(recognized)} records):")
        seen = set()
        for r in recognized:
            for recipe in r.get("result", {}).get("recipes", []):
                sig = recipe_signature(recipe)
                if sig not in seen:
                    seen.add(sig)
                    parts = [f"({recipe.get('slot1_level')}){recipe.get('slot1_name')}"]
                    for s in range(2, 6):
                        name = recipe.get(f"slot{s}_name")
                        level = recipe.get(f"slot{s}_level")
                        if name:
                            parts.append(f"+ ({level}){name}")
                    print(f"  -> ({recipe.get('target_level')}){recipe.get('target_name')} "
                          f"[{' + '.join(parts)}] book={recipe.get('book', 0)}")


def cmd_validate():
    """Validate results.json: dedup against DB, basic sanity checks."""
    if not os.path.exists(RESULTS_PATH):
        print("ERROR: results.json 不存在。请先运行 Agent 识别并将结果保存为 results.json。")
        return

    records = load_records()

    # Build existing recipe signatures
    existing_sigs = set()
    for r in records:
        if r.get("status") == "recognized":
            for recipe in r.get("result", {}).get("recipes", []):
                existing_sigs.add(recipe_signature(recipe))

    with open(RESULTS_PATH, "r", encoding="utf-8") as f:
        results_data = json.load(f)

    issues = []
    for entry in results_data:
        image_url = entry.get("image_url", "")
        recipes = entry.get("recipes", [])

        if not recipes:
            issues.append(f"WARN: {image_url} — 未提取到任何配方（无效截图？）")
            continue

        # Check each recipe
        for i, recipe in enumerate(recipes):
            sig = recipe_signature(recipe)

            # Dedup check
            if sig in existing_sigs:
                issues.append(f"DUP: recipe #{i} in {image_url} — 配方已存在于数据库")
                recipe["_duplicate"] = True
            else:
                recipe["_duplicate"] = False

            # Sanity: slot1 must exist (主材)
            if not recipe.get("slot1_name"):
                issues.append(f"ISSUE: recipe #{i} in {image_url} — 缺少主材 (slot1)")

            # Sanity: target must exist
            if not recipe.get("target_name"):
                issues.append(f"ISSUE: recipe #{i} in {image_url} — 缺少目标产物")

            # Sanity: level ranges
            for s in range(1, 6):
                lv = recipe.get(f"slot{s}_level")
                if lv is not None and (lv < 1 or lv > 200):
                    issues.append(f"ISSUE: recipe #{i} in {image_url} — slot{s} 物等异常 ({lv})")

    # Print validation report
    print(f"VALIDATION REPORT ({len(results_data)} images, {sum(len(e.get('recipes', [])) for e in results_data)} recipes):")
    if issues:
        for issue in issues:
            print(f"  {issue}")
    else:
        print("  ALL CLEAN — 未发现重复或异常。")

    # Count duplicates
    dup_count = sum(1 for e in results_data for r in e.get("recipes", []) if r.get("_duplicate"))
    valid_count = sum(1 for e in results_data for r in e.get("recipes", []) if not r.get("_duplicate"))
    print(f"\nSUMMARY: {valid_count} new, {dup_count} duplicate(s)")

    # Write back cleaned results (with _duplicate flags)
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results_data, f, indent=2, ensure_ascii=False)
    print("results.json 已更新（含 _duplicate 标记）。")


def cmd_stats():
    """Print database statistics."""
    records = load_records()
    pending = sum(1 for r in records if r.get("status") == "pending")
    recognized = sum(1 for r in records if r.get("status") == "recognized")
    total_recipes = sum(
        len(r.get("result", {}).get("recipes", []))
        for r in records if r.get("status") == "recognized"
    )
    print(f"Database: {DB_PATH}")
    print(f"  Total records:   {len(records)}")
    print(f"  Pending:         {pending}")
    print(f"  Recognized:      {recognized}")
    print(f"  Total recipes:   {total_recipes}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ocr_pipeline.py --pending | --validate | --stats")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "--pending":
        cmd_pending()
    elif cmd == "--validate":
        cmd_validate()
    elif cmd == "--stats":
        cmd_stats()
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
