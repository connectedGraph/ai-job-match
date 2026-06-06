import base64
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from .api_client import call_model_messages, discover_models, merge_token_usage, normalize_base_url, preflight_configs
from .api_models import (
    ConfigPreflightRequest,
    ConfigTestRequest,
    ModelDiscoveryRequest,
    UploadSourceRequest,
)
from .api_storage import UPLOADS_DIR, read_json, write_json
from .api_utils import build_upload_summary, clean_text, normalize_records, now_iso


router = APIRouter()


@router.post("/uploads")
async def upload_source_file(request: UploadSourceRequest):
    try:
        raw_bytes = base64.b64decode(request.contentBase64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"文件内容解码失败: {exc}") from exc
    records = normalize_records(request.fileName or "upload", raw_bytes)
    if not records:
        raise HTTPException(status_code=400, detail="上传文件没有有效岗位记录")
    upload_id = f"upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    upload_dir = UPLOADS_DIR / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    write_json(upload_dir / "records.json", records)
    summary = build_upload_summary(records, request.fileName or "upload", upload_id, request.inputMode)
    write_json(upload_dir / "summary.json", summary)
    return summary


@router.get("/uploads/{upload_id}")
async def get_upload(upload_id: str):
    upload_dir = UPLOADS_DIR / upload_id
    summary = read_json(upload_dir / "summary.json")
    if not summary:
        raise HTTPException(status_code=404, detail="上传记录不存在")
    return summary


@router.post("/models")
async def get_remote_models(request: ModelDiscoveryRequest):
    try:
        models = await discover_models(request.baseUrl, request.apiKey)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"模型路由获取失败: {exc}") from exc
    return {"models": models}


@router.post("/configs/preflight")
async def builder_configs_preflight(request: ConfigPreflightRequest):
    configs = [config for config in request.configs if config.enabled]
    if not configs:
        raise HTTPException(status_code=400, detail="至少需要一个启用的配置")
    return await preflight_configs(configs)


@router.post("/configs/test")
async def builder_config_test(request: ConfigTestRequest):
    config = request.config
    started = datetime.now()
    try:
        response = await call_model_messages(
            config,
            [{"role": "user", "content": "测试，请直接回复1"}],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"模型测试失败: {exc}") from exc

    latency_ms = int((datetime.now() - started).total_seconds() * 1000)
    output = clean_text(response.get("text"))
    if not output:
        raise HTTPException(status_code=502, detail="模型测试失败: 请求已返回，但没有拿到有效回复内容")

    return {
        "ok": True,
        "configId": config.id,
        "configName": config.name,
        "apiMode": config.apiMode,
        "model": config.model,
        "baseUrl": normalize_base_url(config.baseUrl),
        "latencyMs": latency_ms,
        "testedAt": now_iso(),
        "responseText": output,
        "tokenUsage": merge_token_usage(response.get("usage"), None),
        "hasCompletion": True,
    }
