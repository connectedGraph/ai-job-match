from typing import List, Literal, Optional

from pydantic import BaseModel, Field


InputMode = Literal[
    "raw_source",
    "structured_job_json_extract",
    "structured_job_json_fill_missing",
    "structured_job_json_direct_stage4",
]
STRUCTURED_INPUT_MODES = {
    "structured_job_json_extract",
    "structured_job_json_fill_missing",
    "structured_job_json_direct_stage4",
}
DIRECT_STAGE4_INPUT_MODE = "structured_job_json_direct_stage4"


class BuilderConfig(BaseModel):
    id: str
    name: str
    baseUrl: str
    apiKey: str
    model: str
    stageRole: Literal["all", "preprocess", "extract"] = "all"
    apiMode: Literal["chat_completions", "responses"] = "chat_completions"
    chatCompletionsSystemRole: Literal["system", "user"] = "system"
    concurrency: int = Field(default=30, ge=1, le=800)
    requestsPerMinute: int = Field(default=800, ge=1, le=800)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    maxTokens: int = Field(default=4000, ge=256, le=32768)
    enabled: bool = True


class ModelDiscoveryRequest(BaseModel):
    baseUrl: str
    apiKey: str


class UploadSourceRequest(BaseModel):
    fileName: str
    contentBase64: str
    inputMode: InputMode = "raw_source"


class RunOptions(BaseModel):
    maxAttemptsPerRecord: int = Field(default=2, ge=1, le=5)
    autoApplyToJobLibrary: bool = False
    normalizeWithExistingTags: bool = False


class ConfigPreflightRequest(BaseModel):
    configs: List[BuilderConfig]


class ConfigTestRequest(BaseModel):
    config: BuilderConfig


class RetryRunRequest(BaseModel):
    mode: Literal["failed_only", "unfinished_only", "full"] = "failed_only"
    configs: Optional[List[BuilderConfig]] = None
    options: Optional[RunOptions] = None


class UpdateRunConfigsRequest(BaseModel):
    configs: List[BuilderConfig]
    pauseFirst: bool = True


class RecoverCircuitRequest(BaseModel):
    configIds: List[str] = Field(default_factory=list)


class ApplyRunRequest(BaseModel):
    normalizeWithExistingTags: bool = False


class CreateRunRequest(BaseModel):
    uploadId: str
    configs: List[BuilderConfig]
    options: RunOptions = Field(default_factory=RunOptions)
    inputMode: Optional[InputMode] = None


class ConfigExecutionError(RuntimeError):
    def __init__(self, *, config: BuilderConfig, stage_role: str, stage_name: str, cause: Exception):
        self.config_id = config.id
        self.config_name = config.name
        self.stage_role = stage_role
        self.stage_name = stage_name
        self.cause = cause
        super().__init__(f"{stage_name} [{stage_role}/{config.name}] {cause}")


def config_stage_role(config: BuilderConfig) -> str:
    role = str(getattr(config, "stageRole", "") or "").strip() or "all"
    return role if role in {"all", "preprocess", "extract"} else "all"
