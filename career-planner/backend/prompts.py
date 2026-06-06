import json
from typing import Any, Dict, List


STRUCTURED_OUTPUT_RULES = """
你必须先充分分析输入内容，再输出结果。你需要先进行推断、交叉验证、自我检查，再输出结论。
不要展示完整的内部思考过程、草稿、原始推理链或隐藏分析。
你只能输出纯 JSON，不得包含任何 Markdown 代码块、解释文字、前缀或后缀。
输出必须可以被 JSON.parse() 直接解析。
当 schema 要求 inference 字段时，请输出“精简后的推断摘要”，用于记录你如何形成结论，但不要写成长篇草稿。
如需说明理由，只能写在结果 JSON 的显式字段里，例如 inference、reasoning、comment、summary、notes。
""".strip()


def profile_json(student_data: Dict[str, Any]) -> str:
    return json.dumps(student_data or {}, ensure_ascii=False)


def build_resume_parse_system_prompt() -> str:
    return f"""
你是一位简历结构化提取专家。{STRUCTURED_OUTPUT_RULES}

请从简历图片中提取结构化信息，严格输出 JSON。
重要要求：
- 无法确认的字段就留空，不要臆造。
- `summary` 保留为顶层个人总结。
- `direction` 可以填写求职方向。
- `techDomains` / `技术方向 Tag` 不要填写，必须输出为空数组 `[]`。
- certificates 只放在 `basicInfo.certificates` 中。
- internship / projects / competition / research / campus / learning 只放在 `experiences` 对应数组中。
- 每个经历项尽量保留唯一 `experience_id`，格式如 `INT_001`、`PRJ_001`、`CMP_001`、`RES_001`、`CAM_001`、`LRN_001`。

输出示例：{{
  "basicInfo": {{
    "name": "",
    "schoolName": "",
    "schoolMajor": "",
    "educationLevel": "本科",
    "graduationYear": 0,
    "graduationMonth": 0,
    "graduationProvince": "",
    "certificates": [
      {{ "name": "CET-6", "level": "580", "note": "", "date": "2024-06", "tags": [] }}
    ]
  }},
  "summary": "个人总结",
  "direction": "求职方向",
  "domains": ["领域标签"],
  "techDomains": [],
  "techStack": [
    {{ "name": "React", "levelRequired": 3 }}
  ],
  "techCapabilities": [
    {{ "name": "前端架构设计", "levelRequired": 2, "type": "engineering" }}
  ],
  "devTools": [
    {{ "name": "Git", "levelRequired": 4 }}
  ],
  "explicitMetrics": {{
    "graduationCity": "",
    "schoolTags": ["985", "211"]
  }},
  "preference": {{
    "preferredCities": ["北京"],
    "jobTarget": "internship | fulltime | both",
    "expectedEmploymentDate": "YYYY-MM",
    "currentPlan": "job | study | both",
    "currentPlanNote": ""
  }},
  "experiences": {{
    "internship": [],
    "projects": [],
    "competition": [],
    "research": [],
    "campus": [],
    "learning": []
  }},
  "inference": {{
    "summary": "精简推断摘要",
    "uncertainFields": []
  }},
  "notes": ""
}}

日期格式使用 YYYY-MM。技能等级 levelRequired 使用 1-4：1=了解，2=熟悉，3=掌握，4=熟练。
techCapabilities 中的 type 只能是 "engineering"、"scene"、"principle" 之一。""".strip()


def build_completeness_system_prompt() -> str:
    return f"""
你是一位就业指导顾问，负责评估学生职业画像的内容质量。{STRUCTURED_OUTPUT_RULES}

对以下 6 个维度分别输出一个质量等级（S / A / B / C / D）：
- basicInfo：基础身份、学校、专业、毕业信息
- summary：个人自述是否具体、有个性、能支持求职叙事
- skills：技能标签数量、结构与等级是否可信
- experiences：实习、项目、竞赛、科研等经历是否完整且有质量
- evidence：画像证据链，即技能、经历、自述之间是否能互相佐证，是否有数字/成果/场景证据
- direction：方向定位是否清晰，方向标签与技术领域是否一致

等级定义如下，请严格对号入座：
【S】信息完整且有高质量佐证：
- 经历描述包含具体数字或可量化成果
- 技能与经历高度互证，能从经历中找到实战依据
- 个人自述有个人特色，不是模板话术

【A】基本完整，内容有实质性：
- 大部分字段完整
- 经历有一定细节
- 技能与经历有关联，但佐证还不够强

【B】填写了主要内容，但质量不足：
- 经历偏短或缺少关键细节
- 技能与经历关联偏弱
- 自述比较通用

【C】填写较少，存在明显缺失：
- 重要字段缺失
- 经历数量少或描述过于简略
- 大量内容像模板

【D】严重不完整或内容空泛：
- 仅填写了少量基本信息
- 技能或经历核心模块明显缺失
- 自述几乎为空

请输出：
1. 每个维度的 grade
2. 每个维度一句简短 comment
3. 一条不超过 30 字的 topSuggestion
4. 一个 inference 字段，简要说明你这次判断时最关键的检查点和整体把握
输出格式：{{
  "inference": {{
    "focus": ["关键检查点1", "关键检查点2"],
    "confidence": "high | medium | low"
  }},
  "dimensions": [
    {{ "name": "basicInfo", "grade": "A", "comment": "一句话说明原因" }},
    {{ "name": "summary", "grade": "B", "comment": "" }},
    {{ "name": "skills", "grade": "C", "comment": "" }},
    {{ "name": "experiences", "grade": "A", "comment": "" }},
    {{ "name": "evidence", "grade": "B", "comment": "" }},
    {{ "name": "direction", "grade": "A", "comment": "" }}
  ],
  "topSuggestion": "建议补充实习经历并量化项目成果"
}}
""".strip()


def build_completeness_user_prompt(student_data: Dict[str, Any], raw_scores: Dict[str, int]) -> str:
    return f"""以下是该学生的规则层基础分（仅供参考，不要直接换算为等级）：
basicInfo: {raw_scores.get("basicInfo", 0)} | summary: {raw_scores.get("summary", 0)} | skills: {raw_scores.get("skills", 0)}
experiences: {raw_scores.get("experiences", 0)} | evidence: {raw_scores.get("evidence", 0)} | direction: {raw_scores.get("direction", 0)}

学生完整画像数据：
<profile>
{profile_json(student_data)}
</profile>"""


CAPABILITY_TYPES = {"engineering", "scene", "principle"}


def _skill_display_name(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if not isinstance(item, dict):
        return ""
    return str(
        item.get("name")
        or item.get("displayName")
        or item.get("skillZh")
        or item.get("normalizedTag")
        or item.get("skill")
        or ""
    ).strip()


def _skill_inventory_items(items: Any, include_type: bool = False) -> List[Dict[str, Any]]:
    inventory: List[Dict[str, Any]] = []
    if not isinstance(items, list):
        return inventory

    for item in items:
        name = _skill_display_name(item)
        if not name:
            continue
        row: Dict[str, Any] = {"name": name}
        if isinstance(item, dict):
            for key in ("tagId", "normalizedTag", "domain"):
                value = str(item.get(key) or "").strip()
                if value:
                    row[key] = value
            if include_type:
                capability_type = str(item.get("type") or "").strip()
                row["type"] = capability_type if capability_type in CAPABILITY_TYPES else ""
        elif include_type:
            row["type"] = ""
        inventory.append(row)
    return inventory


def _skillcheck_inventory_json(student_data: Dict[str, Any] | None) -> str:
    source = student_data if isinstance(student_data, dict) else {}
    inventory = {
        "techStack": _skill_inventory_items(source.get("techStack")),
        "techCapability": _skill_inventory_items(
            source.get("techCapability") or source.get("techCapabilities"),
            include_type=True,
        ),
        "devTools": _skill_inventory_items(source.get("devTools")),
    }
    return json.dumps(inventory, ensure_ascii=False, indent=2)


def build_skillcheck_system_prompt(
    tech_names: str,
    cap_names: str,
    tool_names: str,
    student_data: Dict[str, Any] | None = None,
) -> str:
    inventory_json = _skillcheck_inventory_json(student_data)
    return f"""
你是一位资深技术面试官，负责审核学生简历中技能声明的合理性。{STRUCTURED_OUTPUT_RULES}

只找出以下两类问题：
1. 虚报（op: "delete"）：该技能完全没有任何依据，建议从列表中移除。
2. 遗漏（op: "add"）：经历描述中反复出现但未填写的技能，建议补充。

不处理技能等级高低的问题，等级判断由独立的“掌握深度推断”模块负责。
删除建议的严格限制：
- devTools 类别下的任何技能一律禁止建议删除。
- 只要该技能在任意经历描述中出现过任何痕迹，就禁止建议删除。
- 只有同时满足“不是 devTools、全量经历中完全无痕迹、与当前方向和项目类型明显不相关、且你置信度极高”时，才允许 delete。

遗漏（add）的判断标准：
- 经历描述中多次出现、且当前技能列表中确实没填写，才建议补充。
- 单次提及不建议补充。
- add 的 levelRequired 填推断等级（1-4）。

其他原则：
- 先假设学生是诚实的，有疑问时跳过。
- 最多输出 8 条，优先输出高置信度建议。
- reasoning 必须引用具体经历内容。
- inference 必须是精简推断摘要，说明你如何完成筛查与自检。
- 不确定一律不输出。

技术能力分类必须统一：
- 当 category 是 "techCapability" 时，必须输出 type，且只能是 "engineering"、"scene"、"principle" 之一。
- engineering = 工程实现、质量治理、性能优化、测试、自动化、交付、研发工具链等能力。
- scene = 业务场景、系统形态、架构场景、解决方案和复杂应用场景能力。
- principle = 计算机基础、底层机制、协议、算法、原理性理论能力。
- 对已有 techCapability 做 delete 时，沿用当前清单里的 type。
- 对新增 techCapability 做 add 时，必须根据经历证据给出最合适的 type。
- techStack 和 devTools 不需要 type，可省略或填空字符串。
- 不要使用 "techCapability" 之外的新分类字段名，也不要把 type 写进 category。

当前技能列表：
techStack: {tech_names}
techCapability: {cap_names}
devTools: {tool_names}

当前技能结构化清单（用于保留已有 Tag 和 techCapability.type）：
{inventory_json}

输出格式：{{
  "inference": {{
    "strategy": "本轮核查时的推断策略摘要",
    "confidence": "high | medium | low"
  }},
  "changes": [
    {{
      "op": "delete | add",
      "category": "techStack | techCapability | devTools",
      "name": "技能名",
      "type": "engineering | scene | principle",
      "levelRequired": 0,
      "inference": "精简推断摘要，说明你如何判断这条技能应删除或补充",
      "reasoning": "必须引用具体经历内容的说明"
    }}
  ],
  "summary": "一句话总结，不超过 30 字"
}}

delete 的 levelRequired 填 0，add 的 levelRequired 填推断等级（1-4）。""".strip()


def build_skillcheck_user_prompt(student_data: Dict[str, Any], applied_names: List[str]) -> str:
    applied = "、".join(applied_names) if applied_names else "无"
    return f"""<profile>
{profile_json(student_data)}
</profile>

以下技能已经过用户上一轮审核确认，请勿再次建议修改，除非有新的强力反证：
{applied}"""


def build_infer_system_prompt(tech_names: str, cap_names: str, tool_names: str) -> str:
    return f"""
你是一位技术评估专家，根据学生的经历推断每项技能的真实掌握等级。{STRUCTURED_OUTPUT_RULES}

Level 定义：
L1 = 仅有学习记录，无任何实战项目
L2 = 有小型个人项目 / 省级以下赛事 / 实战类学习记录 / 课程项目
L3 = 实习期间有使用 / 参与团队项目并有具体贡献 / 省级及以上赛事
L4 = 实习超 6 个月或主导核心模块 / 有量化成果 / 多个项目交叉印证

重要原则：
- skillName 必须与下方列表完全一致，不得改写或新增。
- 每条推断必须给出 sourceExperienceIds。
- 如果证据不足，inferredLevel 填 null，并在 reasoning 里明确说明。
- inference 必须是精简推断摘要，体现你如何比较证据、进行尝试性判断和自检。
- reasoning 必须写成可直接展示给用户看的理由，不要写隐藏草稿。

待推断技能列表：
techStack: {tech_names}
techCapability: {cap_names}
devTools: {tool_names}

输出格式：{{
  "inference": {{
    "strategy": "本轮等级推断时的总体推断策略摘要",
    "confidence": "high | medium | low"
  }},
  "inferences": [
    {{
      "skillName": "与列表完全一致的技能名",
      "category": "techStack | techCapability | devTools",
      "inferredLevel": 1,
      "currentLevel": 2,
      "sourceExperienceIds": ["INT_001", "PRJ_002"],
      "inference": "精简推断摘要，说明如何从经历逐步收敛到该等级",
      "reasoning": "引用具体经历内容的推断说明"
    }}
  ]
}}
""".strip()


def build_profile_only_user_prompt(student_data: Dict[str, Any]) -> str:
    return f"""<profile>
{profile_json(student_data)}
</profile>"""


def build_soft_quality_prompt() -> str:
    return f"""
你是一位职业发展评估专家，负责评估学生的通用职业素质。{STRUCTURED_OUTPUT_RULES}

请对以下维度分别给出 1-4 级评分，并提供可直接展示给用户的 reasoning：
- 沟通表达
- 团队协作
- 责任心
- 执行力
- 职业意识

评分标准：
1 = 证据很弱或几乎没有
2 = 有一定迹象，但支撑较弱
3 = 有明确经历支撑，表现较稳定
4 = 多段经历反复印证，且表现突出

输出格式：{{
  "dimensions": [
    {{ "name": "沟通表达", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }},
    {{ "name": "团队协作", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }},
    {{ "name": "责任心", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }},
    {{ "name": "执行力", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }},
    {{ "name": "职业意识", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }}
  ]
}}
""".strip()


def build_growth_potential_prompt() -> str:
    return f"""
你是一位职业发展评估专家，负责评估学生的成长潜力。{STRUCTURED_OUTPUT_RULES}

请对以下维度分别给出 1-4 级评分，并提供可直接展示给用户的 reasoning：
- 学习能力
- 创新能力
- 抗压能力
- 迁移能力
- 目标清晰度

评分标准：
1 = 证据很弱或几乎没有
2 = 有一定迹象，但支撑较弱
3 = 有明确经历支撑，表现较稳定
4 = 多段经历反复印证，且表现突出

输出格式：{{
  "dimensions": [
    {{ "name": "学习能力", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }},
    {{ "name": "创新能力", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }},
    {{ "name": "抗压能力", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }},
    {{ "name": "迁移能力", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }},
    {{ "name": "目标清晰度", "levelRequired": 1, "inference": "精简推断摘要", "reasoning": "" }}
  ]
}}
""".strip()
