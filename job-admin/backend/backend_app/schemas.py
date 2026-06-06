from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from portrait_builder.api_models import BuilderConfig


class MatchRequest(BaseModel):
    student: Dict[str, Any]
    top_k: int = 5
    config: Optional[BuilderConfig] = None
    # batch_offsets: 每个赛道的翻页偏移量，key 为 lane id（featured/interest/switch），value 为 offset
    batch_offsets: Dict[str, int] = Field(default_factory=dict)


class MatchHarvestRequest(BaseModel):
    student: Dict[str, Any]
    jobs: List[Dict[str, Any]] = Field(default_factory=list)
    config: Optional[BuilderConfig] = None


class InternshipRecommendationRequest(BaseModel):
    student: Dict[str, Any] = Field(default_factory=dict)
    gaps: List[Dict[str, Any]] = Field(default_factory=list)
    top_k: int = 6
    config: Optional[BuilderConfig] = None


class MatchCheckRequest(BaseModel):
    student: Dict[str, Any]
    job: Dict[str, Any]
    config: Optional[BuilderConfig] = None


class ReportSection(BaseModel):
    """结构化报告中的单个分点，is_ordered=True 时前端用有序列表渲染"""
    title: str
    items: List[str]
    is_ordered: bool = False


class StructuredReport(BaseModel):
    """LLM 深度报告的结构化输出格式"""
    # jd_stars: 每个岗位 id -> 星级 1/2/3（确定性计算，不依赖 LLM）
    jd_stars: Dict[str, int] = Field(default_factory=dict)
    # interview_advice: STAR 法则面试建议（有序列表）
    interview_advice: List[str] = Field(default_factory=list)
    # tenure_growth: 入职成长路径文本
    tenure_growth: str = ""
    # future_path: 职业发展路径文本
    future_path: str = ""


class JobMutationRequest(BaseModel):
    job: Dict[str, Any]


class DebugScoreRequest(BaseModel):
    student: Dict[str, Any]
    job_id: Optional[str] = None
    job_index: Optional[int] = None


class TagExportRequest(BaseModel):
    tag_type: str = "techCapabilities"
    view: str = "normalized"
    q: str = ""
    min_ratio: float = 0.0
    limit: int = 500
    format: Literal["txt", "json"] = "txt"
    output_path: Optional[str] = None
    output_dir: Optional[str] = None
    filename: Optional[str] = None


class JobExportRequest(BaseModel):
    keyword: str = ""
    basic_keyword: str = ""
    jd_keyword: str = ""
    direction: str = ""
    industry: str = ""
    company_name: str = ""
    job_type: str = ""
    tag: str = ""
    tech_stack: str = ""
    tech_capability: str = ""
    dev_tool: str = ""
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    sort_by: str = "default"
    format: Literal["txt", "json", "jsonl"] = "txt"
    export_limit: int = 0
    output_path: Optional[str] = None
    output_dir: Optional[str] = None
    filename: Optional[str] = None


class TagCenterResolveRequest(BaseModel):
    tag_id: str = ""
    value: str = ""
    tag_type: str = ""
