from __future__ import annotations

import fnmatch
import threading
from datetime import UTC, datetime
from pathlib import PurePosixPath
from typing import Any

import boto3
from botocore.exceptions import ClientError
from deepagents.backends.protocol import (
    BackendProtocol,
    EditResult,
    FileDownloadResponse,
    FileInfo,
    FileUploadResponse,
    GrepMatch,
    WriteResult,
)
from deepagents.backends.utils import (
    check_empty_content,
    format_content_with_line_numbers,
    perform_string_replacement,
    validate_path,
)


class S3Backend(BackendProtocol):
    """Deep Agents backend for shared project files stored in S3-compatible object storage."""

    def __init__(
        self,
        *,
        bucket: str,
        prefix: str = "",
        region: str = "",
        endpoint: str = "",
    ) -> None:
        self.bucket = str(bucket or "").strip()
        if not self.bucket:
            raise ValueError("S3Backend requires a bucket")
        self.prefix = str(prefix or "").strip().strip("/")
        self.region = str(region or "").strip() or None
        self.endpoint = str(endpoint or "").strip() or None
        self._client: Any | None = None
        self._client_lock = threading.Lock()

    def _get_client(self) -> Any:
        client = self._client
        if client is not None:
            return client

        with self._client_lock:
            client = self._client
            if client is None:
                client = boto3.client(
                    "s3",
                    region_name=self.region,
                    endpoint_url=self.endpoint,
                )
                self._client = client
        return client

    def _normalize(self, path: str) -> str:
        return validate_path(path)

    def _key_for_path(self, path: str) -> str:
        normalized = self._normalize(path)
        relative = normalized.lstrip("/")
        if not relative:
            return self.prefix
        return "/".join(part for part in [self.prefix, relative] if part)

    def _dir_prefix(self, path: str) -> str:
        normalized = self._normalize(path)
        if normalized == "/":
            return f"{self.prefix}/" if self.prefix else ""
        key = self._key_for_path(normalized).rstrip("/")
        return f"{key}/"

    def _path_for_key(self, key: str) -> str:
        cleaned = str(key or "").strip().lstrip("/")
        if self.prefix:
            prefix = f"{self.prefix}/"
            if cleaned == self.prefix:
                return "/"
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):]
        return f"/{cleaned}".rstrip("/") or "/"

    def _object_info(self, path: str, size: int, modified_at: Any) -> FileInfo:
        iso = ""
        if isinstance(modified_at, datetime):
            iso = modified_at.astimezone(UTC).isoformat().replace("+00:00", "Z")
        return {
            "path": path,
            "size": int(size),
            "modified_at": iso,
        }

    def _head(self, path: str) -> dict[str, Any] | None:
        client = self._get_client()
        key = self._key_for_path(path)
        if not key:
            return None
        try:
            return client.head_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            code = str(error.response.get("Error", {}).get("Code") or "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise

    def _iter_objects(self, prefix: str) -> list[dict[str, Any]]:
        paginator = self._get_client().get_paginator("list_objects_v2")
        objects: list[dict[str, Any]] = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for item in page.get("Contents", []) or []:
                objects.append(item)
        return objects

    def ls_info(self, path: str) -> list[FileInfo]:
        normalized = self._normalize(path)
        if normalized != "/":
            stat = self._head(normalized)
            if stat is not None:
                return [self._object_info(normalized, int(stat.get("ContentLength") or 0), stat.get("LastModified"))]

        prefix = self._dir_prefix(normalized)
        paginator = self._get_client().get_paginator("list_objects_v2")
        files: list[FileInfo] = []
        seen_dirs: set[str] = set()
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix, Delimiter="/"):
            for common_prefix in page.get("CommonPrefixes", []) or []:
                raw_prefix = str(common_prefix.get("Prefix") or "").rstrip("/")
                child_path = self._path_for_key(raw_prefix)
                if child_path and child_path not in seen_dirs:
                    seen_dirs.add(child_path)
                    files.append({"path": child_path, "is_dir": True})
            for item in page.get("Contents", []) or []:
                key = str(item.get("Key") or "")
                if not key or key == prefix.rstrip("/"):
                    continue
                files.append(
                    self._object_info(
                        self._path_for_key(key),
                        int(item.get("Size") or 0),
                        item.get("LastModified"),
                    )
                )
        return files

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> str:
        client = self._get_client()
        key = self._key_for_path(file_path)
        try:
            result = client.get_object(Bucket=self.bucket, Key=key)
        except ClientError:
            return f"Error: File '{file_path}' not found"

        body = result["Body"].read()
        try:
            content = body.decode("utf-8")
        except UnicodeDecodeError as error:
            return f"Error reading file '{file_path}': {error}"

        empty_msg = check_empty_content(content)
        if empty_msg:
            return empty_msg

        lines = content.splitlines()
        if offset >= len(lines):
            return f"Error: Line offset {offset} exceeds file length ({len(lines)} lines)"
        selected = lines[offset : min(offset + limit, len(lines))]
        return format_content_with_line_numbers(selected, start_line=offset + 1)

    def grep_raw(
        self,
        pattern: str,
        path: str | None = None,
        glob: str | None = None,
    ) -> list[GrepMatch] | str:
        try:
            prefix = self._dir_prefix(path or "/")
        except ValueError as error:
            return str(error)

        matches: list[GrepMatch] = []
        for item in self._iter_objects(prefix):
            key = str(item.get("Key") or "")
            if not key or key.endswith("/"):
                continue
            virtual_path = self._path_for_key(key)
            if glob and not fnmatch.fnmatch(PurePosixPath(virtual_path).name, glob):
                continue
            try:
                payload = self._get_client().get_object(Bucket=self.bucket, Key=key)["Body"].read().decode("utf-8")
            except UnicodeDecodeError:
                continue
            except ClientError:
                continue
            for line_number, line in enumerate(payload.splitlines(), 1):
                if pattern in line:
                    matches.append({"path": virtual_path, "line": int(line_number), "text": line})
        return matches

    def glob_info(self, pattern: str, path: str = "/") -> list[FileInfo]:
        prefix = self._dir_prefix(path)
        base_path = self._normalize(path)
        matches: list[FileInfo] = []
        for item in self._iter_objects(prefix):
            key = str(item.get("Key") or "")
            if not key or key.endswith("/"):
                continue
            virtual_path = self._path_for_key(key)
            try:
                relative = PurePosixPath(virtual_path).relative_to(PurePosixPath(base_path))
                relative_path = relative.as_posix()
            except ValueError:
                relative_path = virtual_path.lstrip("/")
            if fnmatch.fnmatch(relative_path, pattern) or fnmatch.fnmatch(virtual_path.lstrip("/"), pattern):
                matches.append(
                    self._object_info(
                        virtual_path,
                        int(item.get("Size") or 0),
                        item.get("LastModified"),
                    )
                )
        return matches

    def write(self, file_path: str, content: str) -> WriteResult:
        if self._head(file_path) is not None:
            return WriteResult(
                error=f"Cannot write to {file_path} because it already exists. Read and then make an edit, or write to a new path."
            )
        key = self._key_for_path(file_path)
        self._get_client().put_object(Bucket=self.bucket, Key=key, Body=content.encode("utf-8"))
        return WriteResult(path=self._normalize(file_path), files_update=None)

    def edit(
        self,
        file_path: str,
        old_string: str,
        new_string: str,
        replace_all: bool = False,
    ) -> EditResult:
        client = self._get_client()
        key = self._key_for_path(file_path)
        try:
            content = client.get_object(Bucket=self.bucket, Key=key)["Body"].read().decode("utf-8")
        except ClientError:
            return EditResult(error=f"Error: File '{file_path}' not found")
        except UnicodeDecodeError as error:
            return EditResult(error=f"Error editing file '{file_path}': {error}")

        result = perform_string_replacement(content, old_string, new_string, replace_all)
        if isinstance(result, str):
            return EditResult(error=result)

        updated_content, occurrences = result
        client.put_object(Bucket=self.bucket, Key=key, Body=updated_content.encode("utf-8"))
        return EditResult(path=self._normalize(file_path), files_update=None, occurrences=int(occurrences))

    def upload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        responses: list[FileUploadResponse] = []
        for path, content in files:
            try:
                key = self._key_for_path(path)
            except ValueError:
                responses.append(FileUploadResponse(path=path, error="invalid_path"))
                continue
            try:
                self._get_client().put_object(Bucket=self.bucket, Key=key, Body=content)
                responses.append(FileUploadResponse(path=self._normalize(path), error=None))
            except ClientError:
                responses.append(FileUploadResponse(path=path, error="invalid_path"))
        return responses

    def download_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        responses: list[FileDownloadResponse] = []
        for path in paths:
            try:
                key = self._key_for_path(path)
            except ValueError:
                responses.append(FileDownloadResponse(path=path, content=None, error="invalid_path"))
                continue
            try:
                content = self._get_client().get_object(Bucket=self.bucket, Key=key)["Body"].read()
                responses.append(FileDownloadResponse(path=self._normalize(path), content=content, error=None))
            except ClientError as error:
                code = str(error.response.get("Error", {}).get("Code") or "")
                response_error = "file_not_found" if code in {"404", "NoSuchKey", "NotFound"} else "invalid_path"
                responses.append(FileDownloadResponse(path=path, content=None, error=response_error))
        return responses
