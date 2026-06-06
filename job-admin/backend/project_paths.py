from __future__ import annotations

import os
import shutil
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
JOB_ADMIN_DIR = BACKEND_DIR.parent
PROJECT_ROOT = JOB_ADMIN_DIR.parent
ROOT_ENV_FILE = PROJECT_ROOT / ".env"
FRONTEND_DIR = JOB_ADMIN_DIR / "frontend"
DOCS_DIR = PROJECT_ROOT / "docs"
DATASET_DIR = PROJECT_ROOT / "dataset"
TOOLS_DIR = DATASET_DIR / "tools"
DB_DIR = DATASET_DIR / "db"
RUNTIME_DIR = DATASET_DIR / "runtime_data"
EXPORTS_DIR = DATASET_DIR / "exports"
VECTORS_DIR = DATASET_DIR / "vectors"
LEGACY_DB_DIR = PROJECT_ROOT / "db"
LEGACY_RUNTIME_DIR = PROJECT_ROOT / "runtime_data"
LEGACY_TAG_DIR = LEGACY_DB_DIR / "tag_center"
LEGACY_VECTORS_DIR = PROJECT_ROOT / "vectors"
TAG_DIR = DB_DIR / "tag_center"
DOMAIN_DIR = DB_DIR / "domain_center"
BUILDER_DIR = RUNTIME_DIR / "portrait_builder_data"
BUILDER_UPLOADS_DIR = BUILDER_DIR / "uploads"
BUILDER_RUNS_DIR = BUILDER_DIR / "runs"
BUILDER_DB_DIR = BUILDER_DIR / "db"
BUILDER_SNAPSHOTS_DIR = BUILDER_DIR / "snapshots"

JOB_LIBRARY_FILE = DATASET_DIR / "career.json"
LEGACY_JOB_LIBRARY_ROOT_FILE = PROJECT_ROOT / "career.json"
LEGACY_JOB_LIBRARY_FILE = PROJECT_ROOT / "carreer.json"
LEGACY_JOB_LIBRARY_BACKUP_FILE = (
    PROJECT_ROOT / "\u6570\u636e\u5904\u7406\uff0c\u4e34\u65f6\uff01\uff01\u7b2c\u4e00\u6b65"
    / "career.json.bak"
)


def load_root_env_file(path: Path = ROOT_ENV_FILE) -> None:
    if not path.exists():
        return
    try:
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].lstrip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key:
                continue
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            os.environ.setdefault(key, value)
    except Exception:
        return


load_root_env_file()


def resolve_job_library_file() -> Path:
    env_path = os.getenv("JOB_SYSTEM_JOB_LIBRARY_PATH", "").strip()
    if env_path:
        return Path(env_path).expanduser()
    return JOB_LIBRARY_FILE


def resolve_existing_job_library_file() -> Path:
    env_path = os.getenv("JOB_SYSTEM_JOB_LIBRARY_PATH", "").strip()
    if env_path:
        return Path(env_path).expanduser()
    for candidate in (
        JOB_LIBRARY_FILE,
        LEGACY_JOB_LIBRARY_ROOT_FILE,
        LEGACY_JOB_LIBRARY_FILE,
        LEGACY_JOB_LIBRARY_BACKUP_FILE,
    ):
        if candidate.exists():
            return candidate
    return JOB_LIBRARY_FILE


def materialize_job_library_file() -> Path:
    target = resolve_job_library_file()
    if target.exists():
        return target
    source = resolve_existing_job_library_file()
    if source != target and source.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    return target


def ensure_runtime_dirs() -> None:
    for path in (
        DATASET_DIR,
        TOOLS_DIR,
        DB_DIR,
        RUNTIME_DIR,
        EXPORTS_DIR,
        VECTORS_DIR,
        TAG_DIR,
        DOMAIN_DIR,
        BUILDER_DIR,
        BUILDER_UPLOADS_DIR,
        BUILDER_RUNS_DIR,
        BUILDER_DB_DIR,
        BUILDER_SNAPSHOTS_DIR,
    ):
        path.mkdir(parents=True, exist_ok=True)
