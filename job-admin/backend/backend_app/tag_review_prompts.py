from typing import Dict


BASE_TAG_REVIEW_SYSTEM_PROMPT = """You review one extracted job tag at a time.

Your only job is to decide whether the current tag label should stay unchanged, be replaced with a better English industry-standard label, be split, or be deleted according to the tag definition and the raw extracted text.
If the current tag contains Chinese, the final kept tags must be English-only.

Response contract:
1. Reply with an empty string only if the current tag should remain unchanged as a valid tag.
2. If one replacement is needed, reply with exactly one bracketed replacement, for example: [Test Automation]
3. If a split is needed, reply with multiple bracketed replacements and nothing else, for example: [Capability A] [Capability B]
4. If deletion is needed, reply with [DELETE]
5. Do not output explanations, JSON, bullets, quotes, prefixes, suffixes, or any extra text.
6. Only fix tag language, naming, validity, or split/delete decisions. Do not rewrite the source text and do not invent unsupported concepts.
7. The replacement must accurately reflect the technical concept in the raw extracted text. Do not invent specific tool names (e.g., "Git") if the original text only describes a general concept (e.g., "Version Control").
8. Prefer short, official, or widely accepted English labels. Expand abbreviations if standard, but generally prefer conciseness.
9. If the current tag contains Chinese, you must not keep Chinese in the final kept tags.
10. **STOCK PROTECTION**: If the current tag is already a well-known, industry-standard English technical term (e.g. SQL, C++, Python, Git) and fits the tag type, you MUST reply with an empty string to keep it unchanged, even if it does not strictly match the provided sample snippets.
11. If you are unsure, reply with an empty string.
"""


TAG_TYPE_REVIEW_RULES: Dict[str, str] = {
    "techStack": """Current tag type: techStack.

Tag characteristics:
- This type is strict. It should only contain a concrete technical entity that can be installed, imported, called, used as a real product/library/framework/language/database/middleware/platform, OR an established technical standard/protocol/foundational technology (e.g., HTTP, TCP/IP, SQL, GraphQL, CUDA).
- If the tag describes a generic human activity, abstract soft skill, or purely business terminology (e.g. 'Project Management', 'Agile', 'Communication') rather than a technology, return [DELETE].
- Prefer official or widely accepted English technology names.
- Do not keep broad Chinese phrases by translating them into vague English labels if they are not truly techStack.
- Split is not allowed for techStack. Use either empty string, one bracketed replacement, or [DELETE].
""",
    "techCapabilities": """Current tag type: techCapabilities.

Tag characteristics:
- This type represents abstract technical capability, engineering practice, working method, or non-installable skill.
- It is not for a directly installable product, library, framework, or tool name.
- If the source text describes a broad capability, return a concise English capability phrase.
- Do not convert it into a specific product name unless the raw extracted text clearly names one.
- Keep the replacement aligned to the source text and avoid over-expansion.
- If the current tag is not actually a technical capability under this definition, or the source text does not support keeping it as a valid capability tag, return [DELETE].
- If the raw extracted text clearly contains two distinct capabilities joined together, you may split into two bracketed replacements.
- techCapabilities may use empty string, one bracketed replacement, multiple bracketed replacements, or [DELETE].
""",
    "devTools": """Current tag type: devTools.

Tag characteristics:
- This type represents version control, build and deployment, container, CI/CD, observability, project management, debugging, testing, operations, or collaboration tools and platforms.
- Prefer the official or widely accepted English tool or platform name.
- Do not translate an official product name into a Chinese alias and then back again.
- If the raw extracted text only refers to a broad tool category and does not name a specific product, return a concise English tool/category phrase.
- Split and deletion are not allowed for devTools.
""",
}


def get_tag_review_system_prompt(tag_type: str) -> str:
    normalized = str(tag_type or "").strip()
    detail = TAG_TYPE_REVIEW_RULES.get(normalized, "")
    if not detail:
        return BASE_TAG_REVIEW_SYSTEM_PROMPT
    return f"{BASE_TAG_REVIEW_SYSTEM_PROMPT}\n{detail}"


def build_tag_review_user_prompt(
    *,
    tag_type: str,
    current_name: str,
    raw_texts: list[str],
    current_name_contains_cjk: bool,
) -> str:
    samples = [str(text or "").strip() for text in (raw_texts or []) if str(text or "").strip()]
    if not samples:
        samples = [current_name]

    lines = [
        f"Tag type: {tag_type}",
        f"Current tag: {current_name}",
        (
            "Current tag contains Chinese characters. Final kept tags must be English-only."
            if current_name_contains_cjk
            else "Current tag is not Chinese. Keep it unchanged only if it is already a valid English tag under this type definition."
        ),
        "Raw extracted text samples:",
    ]
    for index, raw_text in enumerate(samples[:3], start=1):
        lines.append(f"{index}. {raw_text}")
    lines.extend(
        [
            "",
            "Check whether the current tag should stay unchanged, be replaced by a better English label, be split when allowed, or be deleted when allowed.",
            (
                "Do not leave a Chinese current tag unchanged."
                if current_name_contains_cjk
                else "If the current tag is already a good English label under this type definition, reply with an empty string."
            ),
            "Reply with an empty string for unchanged, or reply with [replacement], multiple bracketed replacements, or [DELETE] when deletion is allowed.",
        ]
    )
    return "\n".join(lines)
