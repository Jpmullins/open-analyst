from __future__ import annotations

import gzip
import json
import tarfile
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import asdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Sequence
import re

import aioboto3
import botocore
import httpx

from .config import Settings
from .models import PaperRecord
from .providers import OpenAlexProvider


class BulkCheckpointStore:
    def __init__(self, settings: Settings) -> None:
        self.path = settings.raw_root / "bulk_checkpoints.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text(json.dumps({"processed_files": {}, "manifests": {}}, indent=2))

    def read(self) -> dict[str, Any]:
        return json.loads(self.path.read_text())

    def write(self, payload: dict[str, Any]) -> None:
        self.path.write_text(json.dumps(payload, indent=2, sort_keys=True))

    def is_processed(self, provider: str, key: str) -> bool:
        data = self.read()
        return key in data.setdefault("processed_files", {}).setdefault(provider, {})

    def mark_processed(self, provider: str, key: str, metadata: dict[str, Any]) -> None:
        data = self.read()
        data.setdefault("processed_files", {}).setdefault(provider, {})[key] = metadata
        self.write(data)

    def store_manifest(self, name: str, payload: Any) -> None:
        data = self.read()
        data.setdefault("manifests", {})[name] = payload
        self.write(data)

    def get_manifest(self, name: str) -> Any | None:
        return self.read().setdefault("manifests", {}).get(name)


@dataclass(slots=True)
class ArxivArchiveEntry:
    filename: str
    first_item: str
    last_item: str
    size: int
    yymm: str
    timestamp: str


class OpenAlexBulkIngester:
    def __init__(self, settings: Settings, client: httpx.AsyncClient, provider: OpenAlexProvider, repository: Any, graph_store: Any) -> None:
        self.settings = settings
        self.client = client
        self.provider = provider
        self.repository = repository
        self.graph_store = graph_store
        self.checkpoints = BulkCheckpointStore(settings)

    async def bootstrap(self, max_files: int | None = None, updated_since: str | None = None) -> dict[str, Any]:
        manifest = await self._fetch_manifest("works")
        entries = [entry for entry in manifest.get("entries", []) if self._include_entry(entry["url"], updated_since)]
        processed = 0
        imported = 0
        for entry in entries[:max_files or len(entries)]:
            url = self._normalize_snapshot_url(entry["url"])
            if self.checkpoints.is_processed("openalex", url):
                continue
            count = await self._process_snapshot_file(url)
            processed += 1
            imported += count
            self.checkpoints.mark_processed("openalex", url, {"imported": count, "processed_at": datetime.now(UTC).isoformat()})
        self.checkpoints.store_manifest("openalex_works", manifest)
        return {"provider": "openalex", "files_processed": processed, "records_imported": imported}

    async def _fetch_manifest(self, entity_type: str) -> dict[str, Any]:
        url = self._normalize_snapshot_url(f"s3://openalex/data/{entity_type}/manifest")
        response = await self.client.get(url, headers={"User-Agent": self.settings.user_agent()})
        response.raise_for_status()
        return response.json()

    def _normalize_snapshot_url(self, url: str) -> str:
        if url.startswith("s3://openalex/"):
            return url.replace("s3://openalex", "https://openalex.s3.amazonaws.com", 1)
        return url

    def _include_entry(self, url: str, updated_since: str | None) -> bool:
        if not updated_since:
            return True
        match = re.search(r"updated_date=(\d{4}-\d{2}-\d{2})", url)
        if match is None:
            return True
        return match.group(1) >= updated_since

    async def _process_snapshot_file(self, url: str, batch_size: int = 200) -> int:
        response = await self.client.get(url, headers={"User-Agent": self.settings.user_agent()}, timeout=httpx.Timeout(120.0))
        response.raise_for_status()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".json.gz", dir=self.settings.raw_root) as handle:
            handle.write(response.content)
            temp_path = Path(handle.name)
        imported = 0
        try:
            with gzip.open(temp_path, "rt") as payload:
                batch: list[dict[str, Any]] = []
                for line in payload:
                    if not line.strip():
                        continue
                    batch.append(json.loads(line))
                    if len(batch) >= batch_size:
                        imported += await self._process_work_batch(batch)
                        batch = []
                if batch:
                    imported += await self._process_work_batch(batch)
        finally:
            temp_path.unlink(missing_ok=True)
        return imported

    async def _process_work_batch(self, batch: Sequence[dict[str, Any]]) -> int:
        imported = 0
        papers: list[PaperRecord] = []
        for work in batch:
            paper = self.provider._normalize_work(work)
            papers.append(paper)
            await self.graph_store.upsert_paper(paper)
            await self.graph_store.add_related(paper)
            references = [ref.rsplit("/", 1)[-1] for ref in work.get("referenced_works", []) if ref]
            await self.graph_store.add_citation_edges(paper, references, provider="openalex")
            imported += 1
        await self.repository.save_papers(papers)
        return imported


class ArxivBulkIngester:
    def __init__(self, settings: Settings, object_store: Any) -> None:
        self.settings = settings
        self.object_store = object_store
        self.checkpoints = BulkCheckpointStore(settings)

    async def bootstrap_inventory(self, kind: str, max_archives: int | None = None) -> dict[str, Any]:
        entries = await self._fetch_manifest(kind)
        if max_archives is not None:
            entries = entries[:max_archives]
        self.checkpoints.store_manifest(f"arxiv_{kind}", [asdict(entry) for entry in entries])
        return {"provider": "arxiv", "kind": kind, "archives_indexed": len(entries)}

    async def fetch_members(self, identifiers: Sequence[str], kind: str) -> list[str]:
        manifest = self.checkpoints.get_manifest(f"arxiv_{kind}")
        if not manifest:
            entries = await self._fetch_manifest(kind)
            manifest = [asdict(entry) for entry in entries]
            self.checkpoints.store_manifest(f"arxiv_{kind}", manifest)
        saved: list[str] = []
        for identifier in identifiers:
            archive = self._find_archive_for_identifier(manifest, identifier)
            if archive is None:
                continue
            archive_path = await self._download_archive(archive["filename"])
            try:
                saved.extend(await self._extract_identifier_members(archive_path, identifier, kind))
            finally:
                archive_path.unlink(missing_ok=True)
        return saved

    async def _fetch_manifest(self, kind: str) -> list[ArxivArchiveEntry]:
        key = f"{kind}/arXiv_{kind}_manifest.xml"
        session = aioboto3.Session(
            aws_access_key_id=self.settings.aws_access_key_id,
            aws_secret_access_key=self.settings.aws_secret_access_key.get_secret_value() if self.settings.aws_secret_access_key else None,
            region_name=self.settings.aws_region,
        )
        config = botocore.config.Config(retries={"max_attempts": 5, "mode": "adaptive"})
        async with session.client("s3", config=config) as client:
            response = await client.get_object(Bucket=self.settings.arxiv_bucket, Key=key, RequestPayer="requester")
            payload = await response["Body"].read()
        root = ET.fromstring(payload)
        entries: list[ArxivArchiveEntry] = []
        for node in root.findall("file"):
            entries.append(
                ArxivArchiveEntry(
                    filename=node.findtext("filename", default=""),
                    first_item=node.findtext("first_item", default=""),
                    last_item=node.findtext("last_item", default=""),
                    size=int(node.findtext("size", default="0")),
                    yymm=node.findtext("yymm", default=""),
                    timestamp=node.findtext("timestamp", default=""),
                )
            )
        return entries

    def _find_archive_for_identifier(self, entries: Sequence[dict[str, Any]], identifier: str) -> dict[str, Any] | None:
        normalized = self._normalize_identifier(identifier)
        for entry in entries:
            start = self._normalize_identifier(entry["first_item"])
            end = self._normalize_identifier(entry["last_item"])
            if start <= normalized <= end:
                return entry
        return None

    async def _download_archive(self, key: str) -> Path:
        session = aioboto3.Session(
            aws_access_key_id=self.settings.aws_access_key_id,
            aws_secret_access_key=self.settings.aws_secret_access_key.get_secret_value() if self.settings.aws_secret_access_key else None,
            region_name=self.settings.aws_region,
        )
        config = botocore.config.Config(retries={"max_attempts": 5, "mode": "adaptive"})
        async with session.client("s3", config=config) as client:
            response = await client.get_object(Bucket=self.settings.arxiv_bucket, Key=key, RequestPayer="requester")
            with tempfile.NamedTemporaryFile(delete=False, suffix=".tar", dir=self.settings.raw_root) as handle:
                async for chunk in response["Body"].iter_chunks():
                    handle.write(chunk)
                return Path(handle.name)

    async def _extract_identifier_members(self, archive_path: Path, identifier: str, kind: str) -> list[str]:
        saved: list[str] = []
        needle = self._normalize_identifier(identifier)
        with tarfile.open(archive_path) as archive:
            for member in archive.getmembers():
                compact_name = self._normalize_identifier(member.name)
                if needle not in compact_name:
                    continue
                source = archive.extractfile(member)
                if source is None:
                    continue
                relative_path = f"arxiv/{identifier.replace('/', '_')}/{Path(member.name).name}"
                destination = await self.object_store.put_bytes(relative_path, source.read())
                saved.append(str(destination))
        return saved

    @staticmethod
    def _normalize_identifier(value: str) -> str:
        cleaned = value.replace("arXiv:", "").replace("/", "")
        return re.sub(r"v\d+$", "", cleaned)
