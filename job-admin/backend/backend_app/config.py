import logging
import os
from project_paths import (
    FRONTEND_DIR,
    JOB_LIBRARY_FILE,
    LEGACY_JOB_LIBRARY_BACKUP_FILE,
    LEGACY_JOB_LIBRARY_FILE,
    TAG_DIR,
)


JOBS_FILE = JOB_LIBRARY_FILE
LEGACY_JOBS_FILE = LEGACY_JOB_LIBRARY_FILE
LEGACY_JOBS_BACKUP_FILE = LEGACY_JOB_LIBRARY_BACKUP_FILE
LEGACY_VECTOR_FILES = ("vectors_tech.jsonl", "vectors_core.jsonl", "vectors_dev.jsonl")

FIXED_DIMENSIONS = {
    "softQuality": ["沟通表达", "团队协作", "责任心", "执行力", "职业意识"],
    "growthPotential": ["学习能力", "创新能力", "抗压能力", "迁移能力", "目标清晰度"],
}

if not os.environ.get("OPENAI_API_KEY"):
    text_api_key = os.environ.get("JOB_SYSTEM_TEXT_API_KEY", "")
    if text_api_key:
        os.environ["OPENAI_API_KEY"] = text_api_key

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("matcher")
