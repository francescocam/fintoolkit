import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, Type, TypeVar, Any
from urllib.parse import quote_plus

from pydantic import ValidationError

from app.core import config
from app.models.domain import (
    AppSettings,
    CacheDescriptor,
    CachedPayload,
    DataromaScreenerSession,
    ProviderKey,
    AppSettingsPreferences,
    CachePreferences
)

T = TypeVar("T")

class FileCacheStore:
    def __init__(self, base_dir: Path = config.CACHE_DIR):
        self.base_dir = base_dir

    def _file_path(self, descriptor: CacheDescriptor) -> Path:
        provider_dir = self.base_dir / self._sanitize_segment(descriptor.provider)
        scope_dir = provider_dir / self._sanitize_segment(descriptor.scope)
        file_name = f"{quote_plus(descriptor.key)}.json"
        return scope_dir / file_name

    def _sanitize_segment(self, segment: str) -> str:
        normalized = segment.strip()
        if not normalized:
            return "default"
        keep_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
        return "".join(c if c in keep_chars else "_" for c in normalized)

    async def read(self, descriptor: CacheDescriptor, model_type: Type[T]) -> Optional[CachedPayload[T]]:
        file_path = self._file_path(descriptor)
        if not file_path.exists():
            return None

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            # Reconstruct generic CachedPayload
            # We assume payload is compatible with model_type
            # For complex generic unpacking we might need TypeAdapter, but let's try direct dict access first
            # to validate descriptor/timestamps, then parse payload.
            
            # Since CachedPayload is generic, we can't easily instruct pydantic to parse 'payload' as T 
            # without a concrete type.
            # We will manually construct.
            
            descriptor_data = raw_data.get("descriptor", {})
            payload_data = raw_data.get("payload")
            created_at_str = raw_data.get("createdAt")
            
            if not created_at_str:
                return None
            
            # Check expiration
            expires_at_str = descriptor_data.get("expiresAt")
            if expires_at_str:
                expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                if expires_at.timestamp() < datetime.now().timestamp():
                    await self.safe_unlink(file_path)
                    return None

            # Parse Payload using pydantic if T is a BaseModel, otherwise raw
            parsed_payload = payload_data
            if hasattr(model_type, 'model_validate'):
                # Handle List[Model] case slightly differently or assume T matches
                # If T is List[DataromaEntry], model_type passed might be raw type hint?
                # Python runtime types are tricky.
                # Let's rely on TypeAdapter if available or just raw dicts if it's simple
                # For now, let's trust the caller handles the typed conversion of payload if needed
                # or we just return the dicts and let Pydantic model validation on the Service layer handle it?
                # Ideally read matches the TS version which returns Typed objects.
                
                # Let's try to use TypeAdapter for robust parsing
                from pydantic import TypeAdapter
                adapter = TypeAdapter(CachedPayload[model_type])
                return adapter.validate_python(raw_data)
            
            # Fallback for simple types or List types if passed correctly
            from pydantic import TypeAdapter
            adapter = TypeAdapter(CachedPayload[model_type])
            return adapter.validate_python(raw_data)

        except (json.JSONDecodeError, ValidationError, OSError):
            return None

    async def write(self, descriptor: CacheDescriptor, payload: T) -> CachedPayload[T]:
        file_path = self._file_path(descriptor)
        file_path.parent.mkdir(parents=True, exist_ok=True)

        cached_payload = CachedPayload(
            descriptor=descriptor,
            payload=payload,
            createdAt=datetime.now()
        )
        
        # Serialize
        from pydantic import TypeAdapter
        # We don't know T at runtime easily for TypeAdapter(CachedPayload[T]) without passing it.
        # But we can dump the instance we created.
        data = cached_payload.model_dump(by_alias=True, mode='json')
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f)
            
        return cached_payload

    async def clear(self, descriptor: CacheDescriptor) -> None:
        await self.safe_unlink(self._file_path(descriptor))

    async def safe_unlink(self, file_path: Path) -> None:
        try:
            file_path.unlink()
        except FileNotFoundError:
            pass


class FileSessionStore:
    def __init__(self, base_dir: Path = config.SESSION_DIR):
        self.base_dir = base_dir

    def _file_path(self, session_id: str) -> Path:
        return self.base_dir / f"{session_id}.json"

    async def load(self, session_id: str) -> Optional[DataromaScreenerSession]:
        file_path = self._file_path(session_id)
        if not file_path.exists():
            return None
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return DataromaScreenerSession.model_validate(data)
        except (json.JSONDecodeError, ValidationError):
            return None

    async def save(self, session: DataromaScreenerSession) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)
        file_path = self._file_path(session.id)
        
        data = session.model_dump(by_alias=True, mode='json')
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)


class FileSettingsStore:
    def __init__(self, file_path: Path = config.SETTINGS_FILE):
        self.file_path = file_path
        self._default_settings = AppSettings(
            providerKeys=[],
            preferences=AppSettingsPreferences(
                defaultProvider=config.DEFAULT_PROVIDER_ID,
                cache=CachePreferences(dataromaScrape=True, stockUniverse=True)
            )
        )

    async def load(self) -> AppSettings:
        if not self.file_path.exists():
            return self._default_settings.model_copy()

        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Merge logic is complex in TS version (normalizing cache), 
            # but Pydantic handles defaults well if fields are missing.
            # We'll just validate what we have.
            # We might want to ensure defaults for missing fields manually if Pydantic doesn't cover deep merge.
            
            # Simple approach: Load into model, if fails or partial, fallback to defaults?
            # Creating a robust merge is better.
            
            # Let's rely on Pydantic's default values if we construct it carefully.
            # actually our AppSettings model requires most fields.
            
            return AppSettings.model_validate(data)
        except (json.JSONDecodeError, ValidationError):
            return self._default_settings.model_copy()

    async def save(self, settings: AppSettings) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        data = settings.model_dump(by_alias=True, mode='json')
        with open(self.file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
