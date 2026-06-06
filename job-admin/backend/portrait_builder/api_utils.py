import io
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import HTTPException


CSV_ENCODINGS = ("utf-8-sig", "utf-8", "gb18030", "gbk")


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def sanitize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        if isinstance(value, float) and pd.isna(value):
            return None
        return value
    if isinstance(value, dict):
        return {str(k): sanitize_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    if pd.isna(value):
        return None
    return str(value)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def parse_iso_datetime(value: Any) -> Optional[datetime]:
    text = clean_text(value)
    if not text:
        return None
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def max_iso_timestamp(*values: Any) -> str:
    parsed = [dt for dt in (parse_iso_datetime(value) for value in values) if dt is not None]
    if not parsed:
        return ""
    return max(parsed).isoformat(timespec="seconds")


def run_timeline_timestamp(manifest: Dict[str, Any], progress: Dict[str, Any]) -> str:
    lifecycle = manifest.get("lifecycle") or {}
    return (
        max_iso_timestamp(
            manifest.get("createdAt"),
            progress.get("createdAt"),
            progress.get("startedAt"),
            progress.get("completedAt"),
            lifecycle.get("buildQueuedAt"),
            lifecycle.get("buildStartedAt"),
            lifecycle.get("buildCompletedAt"),
            lifecycle.get("latestApplyAt"),
            lifecycle.get("lastRetryAt"),
            lifecycle.get("lastPausedAt"),
            lifecycle.get("lastResumedAt"),
        )
        or clean_text(lifecycle.get("latestApplyAt"))
        or clean_text(manifest.get("createdAt"))
        or clean_text(progress.get("createdAt"))
    )


def split_lines(value: Any) -> List[str]:
    if isinstance(value, list):
        items = [clean_text(v) for v in value]
    else:
        text = clean_text(value)
        if not text:
            return []
        items = re.split(r"[\r\n]+|[；;]|(?<=。)|(?<=！)|(?<=？)", text)
    result: List[str] = []
    for item in items:
        text = clean_text(item)
        text = re.sub(r"^[\-\*\d\.\)\(、\s]+", "", text)
        text = clean_text(text)
        if text:
            result.append(text)
    return result


def merge_line_sources(*values: Any) -> List[str]:
    merged: List[str] = []
    seen = set()
    for value in values:
        for item in split_lines(value):
            if item not in seen:
                seen.add(item)
                merged.append(item)
    return merged


def format_numbered_lines(lines: List[str]) -> str:
    if not lines:
        return "[]"
    return "\n".join(f"[{index}] {line}" for index, line in enumerate(lines, start=1))


def _normalize_column_name(value: Any, index: int, seen: Dict[str, int]) -> str:
    name = clean_text(value).lstrip("\ufeff")
    if not name or name.lower().startswith("unnamed:"):
        name = f"column_{index + 1}"
    seen[name] = seen.get(name, 0) + 1
    if seen[name] == 1:
        return name
    return f"{name}_{seen[name]}"


def _has_record_value(row: Dict[str, Any]) -> bool:
    for value in row.values():
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return True
    return False


def _dataframe_to_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    df = df.dropna(axis=0, how="all").dropna(axis=1, how="all")
    if df.empty:
        return []
    seen: Dict[str, int] = {}
    df = df.copy()
    df.columns = [_normalize_column_name(column, index, seen) for index, column in enumerate(df.columns)]
    records = [sanitize_value(row) for row in df.to_dict(orient="records")]
    return [row for row in records if _has_record_value(row)]


def _read_csv_dataframe(raw_bytes: bytes) -> pd.DataFrame:
    last_decode_error: Optional[Exception] = None
    for encoding in CSV_ENCODINGS:
        try:
            return pd.read_csv(io.BytesIO(raw_bytes), encoding=encoding)
        except UnicodeDecodeError as exc:
            last_decode_error = exc
            continue
        except pd.errors.EmptyDataError as exc:
            raise HTTPException(status_code=400, detail="CSV 文件没有可读取内容") from exc
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"CSV 文件解析失败: {exc}") from exc
    raise HTTPException(status_code=400, detail=f"CSV 文件编码无法识别: {last_decode_error}")


def _read_excel_dataframe(raw_bytes: bytes) -> pd.DataFrame:
    try:
        return pd.read_excel(io.BytesIO(raw_bytes))
    except ImportError as exc:
        raise HTTPException(status_code=500, detail=f"缺少 Excel 解析依赖: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Excel 文件格式不支持或内容为空: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Excel 文件解析失败: {exc}") from exc


def normalize_records(file_name: str, raw_bytes: bytes) -> List[Dict[str, Any]]:
    suffix = Path(file_name).suffix.lower()
    if suffix == ".json":
        try:
            payload = json.loads(raw_bytes.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=400, detail=f"JSON 文件解析失败: {exc}") from exc
        if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
            raise HTTPException(status_code=400, detail="JSON 文件必须是 object 列表")
        return [sanitize_value(row) for row in payload]
    if suffix == ".jsonl":
        rows: List[Dict[str, Any]] = []
        try:
            lines = raw_bytes.decode("utf-8-sig").splitlines()
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"JSONL 文件编码解析失败: {exc}") from exc
        for line_no, line in enumerate(lines, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail=f"JSONL 第 {line_no} 行解析失败: {exc}") from exc
            if not isinstance(item, dict):
                raise HTTPException(status_code=400, detail=f"JSONL 第 {line_no} 行不是 object")
            rows.append(sanitize_value(item))
        return rows
    if suffix == ".csv":
        return _dataframe_to_records(_read_csv_dataframe(raw_bytes))
    if suffix in {".xls", ".xlsx"}:
        return _dataframe_to_records(_read_excel_dataframe(raw_bytes))
    raise HTTPException(status_code=400, detail="暂不支持该文件类型，仅支持 json/jsonl/csv/xls/xlsx")


def build_upload_summary(
    records: List[Dict[str, Any]],
    file_name: str,
    upload_id: str,
    input_mode: str = "raw_source",
) -> Dict[str, Any]:
    fields: List[str] = sorted({str(key) for row in records for key in row.keys()})
    return {
        "uploadId": upload_id,
        "fileName": file_name,
        "inputMode": input_mode,
        "recordCount": len(records),
        "fields": fields,
        "preview": records[:5],
        "createdAt": now_iso(),
    }
