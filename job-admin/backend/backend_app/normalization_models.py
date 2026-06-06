from typing import Literal

from pydantic import BaseModel, Field

from portrait_builder.api_models import BuilderConfig


class TagReviewStartRequest(BaseModel):
    config: BuilderConfig
    maxAttempts: int = Field(default=3, ge=1, le=5)
    reviewMode: Literal["all", "unreviewed_only"] = "all"
