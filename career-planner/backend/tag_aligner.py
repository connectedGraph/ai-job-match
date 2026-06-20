import json
import logging
from typing import Any, Dict, List
from .llm_client import call_ai_chat_json
from .tech_capability import search_professional_skills, search_tech_domains

logger = logging.getLogger("matcher")

async def align_profile_tags(profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Refines and aligns raw skill names in the parsed profile using the tag center database and LLM.
    """
    if not isinstance(profile, dict):
        return profile
        
    cleaned = dict(profile)
    
    # 1. Gather all items to search
    tech_stack = cleaned.get("techStack") or []
    # Support both singular and plural forms for technical capabilities
    tech_capability = cleaned.get("techCapability") or cleaned.get("techCapabilities") or []
    dev_tools = cleaned.get("devTools") or []
    tech_domains = cleaned.get("techDomains") or []
    
    # We build a list of tasks for the LLM to extract clean search queries
    items_to_query = []
    for idx, item in enumerate(tech_stack):
        name = item.get("name") if isinstance(item, dict) else str(item)
        if name:
            items_to_query.append({"category": "techStack", "index": idx, "name": name})
    for idx, item in enumerate(tech_capability):
        name = item.get("name") if isinstance(item, dict) else str(item)
        if name:
            items_to_query.append({"category": "techCapability", "index": idx, "name": name})
    for idx, item in enumerate(dev_tools):
        name = item.get("name") if isinstance(item, dict) else str(item)
        if name:
            items_to_query.append({"category": "devTools", "index": idx, "name": name})
    for idx, item in enumerate(tech_domains):
        name = item.get("name") if isinstance(item, dict) else str(item)
        if name:
            items_to_query.append({"category": "techDomains", "index": idx, "name": name})
            
    if not items_to_query:
        return cleaned

    # Stage 1: LLM extracts search queries
    extract_prompt = """你是一个专业的技能搜索关键词提取专家。
请根据提供的原始提取技能或领域名称，为每一项提取一个最合适、最精炼的用于在标准数据库中搜索的“搜索关键词（query）”。
例如：
- "熟练掌握React/Redux" -> "React"
- "分布式高并发架构" -> "分布式系统"
- "Git版本控制及Github" -> "Git"
- "前端安全开发" -> "网络安全"

输出必须为 JSON，格式如下：
{
  "queries": [
    { "category": "techStack", "index": 0, "query": "提取的关键词" }
  ]
}
"""
    try:
        extract_result = await call_ai_chat_json([
            {"role": "system", "content": extract_prompt},
            {"role": "user", "content": json.dumps({"items": items_to_query}, ensure_ascii=False)}
        ])
        queries = extract_result.get("queries") or []
    except Exception as e:
        logger.error(f"[TagAligner] Failed to extract search queries: {e}")
        queries = [{"category": item["category"], "index": item["index"], "query": item["name"]} for item in items_to_query]

    # Map queries back to original names and categories
    query_map = {(q["category"], q["index"]): q["query"] for q in queries if "category" in q and "index" in q}
    
    # Stage 2: Perform searches in Python
    alignment_tasks = []
    for item in items_to_query:
        cat = item["category"]
        idx = item["index"]
        name = item["name"]
        query = query_map.get((cat, idx)) or name
        
        candidates = []
        try:
            if cat == "techDomains":
                res = search_tech_domains(query=query, limit=5)
                options = res.get("options") or []
                for opt in options:
                    candidates.append({
                        "name": opt.get("name") or opt.get("displayName") or opt.get("normalizedTag"),
                        "tagId": opt.get("domainId") or opt.get("tagId") or "",
                        "normalizedTag": opt.get("normalizedTag") or opt.get("domain") or opt.get("name")
                    })
            else:
                res = await search_professional_skills(query=query, category=cat, limit=5)
                options = res.get("options") or []
                for opt in options:
                    candidates.append({
                        "name": opt.get("displayName") or opt.get("name") or opt.get("normalizedTag"),
                        "tagId": opt.get("tagId") or "",
                        "normalizedTag": opt.get("normalizedTag") or opt.get("name")
                    })
        except Exception as e:
            logger.error(f"[TagAligner] Search failed for {cat}/{name}: {e}")
            
        alignment_tasks.append({
            "category": cat,
            "index": idx,
            "original_name": name,
            "candidates": candidates
        })
        
    # Stage 3: Call LLM to choose the best standard tag
    align_prompt = """你是一个个人画像技能词标准对齐专家。
我们会给你一组原始画像中的技能或领域名称，以及通过数据库相似度搜索返回的前5个标准词候选列表（candidates）。
请为每一个原始技能挑选最合适的一个标准词作为对齐结果：
1. 候选词包含 `name`、`tagId`、`normalizedTag` 字段。
2. 挑选语义完全对等或最贴近的候选标准词。如果候选词中没有任何一个在语义上与原词相符，你可以选择保留原词，并将 `tagId` 设为空字符串 `""`，`normalizedTag` 设为原词。
3. 请只输出纯 JSON，结构如下：
{
  "alignments": [
    {
      "category": "techStack",
      "index": 0,
      "aligned": {
        "name": "对齐的标准词",
        "tagId": "标准词的 tagId",
        "normalizedTag": "标准词的 normalizedTag"
      }
    }
  ]
}
"""
    try:
        align_result = await call_ai_chat_json([
            {"role": "system", "content": align_prompt},
            {"role": "user", "content": json.dumps({"items": alignment_tasks}, ensure_ascii=False)}
        ])
        alignments = align_result.get("alignments") or []
    except Exception as e:
        logger.error(f"[TagAligner] Failed to align standard tags: {e}")
        alignments = []

    # Stage 4: Apply the alignment results back to the profile
    alignment_map = {(a["category"], a["index"]): a.get("aligned") for a in alignments if "category" in a and "index" in a}
    
    # Update techStack
    for idx, item in enumerate(tech_stack):
        aligned = alignment_map.get(("techStack", idx))
        if aligned and isinstance(item, dict):
            item["name"] = aligned.get("name") or item["name"]
            
    # Update techCapability / techCapabilities
    # Note: we update both lists to keep them in sync
    for idx, item in enumerate(tech_capability):
        aligned = alignment_map.get(("techCapability", idx))
        if aligned and isinstance(item, dict):
            item["name"] = aligned.get("name") or item["name"]
            item["tagId"] = aligned.get("tagId") or ""
            item["normalizedTag"] = aligned.get("normalizedTag") or aligned.get("name") or item.get("name")
            
    # Update devTools
    for idx, item in enumerate(dev_tools):
        aligned = alignment_map.get(("devTools", idx))
        if aligned and isinstance(item, dict):
            item["name"] = aligned.get("name") or item["name"]
            
    # Update techDomains
    new_tech_domains = []
    for idx, item in enumerate(tech_domains):
        aligned = alignment_map.get(("techDomains", idx))
        if aligned:
            new_item = {
                "name": aligned.get("name") or (item.get("name") if isinstance(item, dict) else str(item)),
                "tagId": aligned.get("tagId") or "",
                "normalizedTag": aligned.get("normalizedTag") or aligned.get("name") or ""
            }
            new_tech_domains.append(new_item)
        else:
            if isinstance(item, dict):
                new_tech_domains.append(item)
            else:
                new_tech_domains.append({"name": str(item), "tagId": "", "normalizedTag": str(item)})
                
    cleaned["techDomains"] = new_tech_domains
    
    # Write back sync for techCapability and techCapabilities
    cleaned["techCapability"] = tech_capability
    cleaned["techCapabilities"] = tech_capability
    
    logger.info(f"[TagAligner] Successfully aligned {len(alignment_map)} profile tags.")
    return cleaned
