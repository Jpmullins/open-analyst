"""Research tools: arXiv, HuggingFace, and deep research."""

from concurrent.futures import ThreadPoolExecutor, as_completed
import re
import time
from urllib.parse import urlencode, quote

import httpx
from strands import tool

from util.capture import ProjectAPI
from tools.web_tools import web_search, web_fetch

USER_AGENT = "open-analyst-headless"


def _decode_xml(value: str) -> str:
    return (
        str(value or "")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )


def _extract_tag(block: str, tag_name: str) -> str:
    match = re.search(
        rf"<{tag_name}[^>]*>([\s\S]*?)</{tag_name}>", block, re.IGNORECASE
    )
    return _decode_xml(match.group(1).strip()) if match else ""


def _capture_document(
    api: ProjectAPI | None,
    collection_id: str,
    collection_name: str,
    title: str,
    source_type: str,
    source_uri: str,
    content: str,
    metadata: dict | None = None,
) -> dict | None:
    if not api:
        return None
    cid = collection_id
    if not cid:
        col = api.ensure_collection(collection_name)
        cid = col.get("id", "")
    if not cid:
        return None
    return api.create_document(
        collection_id=cid,
        title=title,
        source_type=source_type,
        source_uri=source_uri,
        content=content,
        metadata=metadata or {},
    )


@tool
def arxiv_search(
    query: str,
    max_results: int = 5,
    collection_name: str = "arXiv",
    project_id: str = "",
    api_base_url: str = "http://localhost:5173",
    collection_id: str = "",
) -> str:
    """Search arXiv for academic papers matching a query.

    Args:
        query: The search query.
        max_results: Maximum number of results (1-20).
        collection_name: Collection name for captured papers.
        project_id: Project ID for document capture.
        api_base_url: Base URL of the Node.js API.
        collection_id: Optional specific collection ID.

    Returns:
        Formatted list of arXiv papers with titles, authors, and summaries.
    """
    query = (query or "").strip()
    if not query:
        raise ValueError("query is required")
    max_results = min(20, max(1, max_results))

    params = {
        "search_query": f"all:{query}",
        "start": "0",
        "max_results": str(max_results),
    }
    res = httpx.get(
        f"https://export.arxiv.org/api/query?{urlencode(params)}",
        headers={"User-Agent": USER_AGENT},
        timeout=30.0,
    )
    if not res.is_success:
        raise RuntimeError(f"arXiv request failed with status {res.status_code}")

    xml = res.text
    entries = re.findall(r"<entry>([\s\S]*?)</entry>", xml)

    api = ProjectAPI(api_base_url, project_id) if project_id else None
    lines = [f"Query: {query}", "Source: arXiv API", f"Results: {len(entries)}"]

    for entry in entries:
        entry_id = _extract_tag(entry, "id")
        title = re.sub(r"\s+", " ", _extract_tag(entry, "title")).strip()
        summary = re.sub(r"\s+", " ", _extract_tag(entry, "summary")).strip()
        published = _extract_tag(entry, "published")
        authors = [
            _decode_xml(m.group(1).strip())
            for m in re.finditer(r"<name>([\s\S]*?)</name>", entry)
        ]

        _capture_document(
            api,
            collection_id,
            collection_name,
            title or entry_id,
            "arxiv",
            entry_id,
            "\n".join(filter(None, [title, f"Authors: {', '.join(authors)}", f"Published: {published}", summary])),
            {"query": query, "authors": authors, "published": published, "source": "arxiv"},
        )

        lines.append(f"- {title}")
        lines.append(f"  id: {entry_id}")
        lines.append(f"  authors: {', '.join(authors) or 'n/a'}")
        lines.append(f"  published: {published or 'n/a'}")
        trunc = summary[:360] + ("..." if len(summary) > 360 else "")
        lines.append(f"  summary: {trunc}")

    return "\n".join(lines)


@tool
def hf_daily_papers(
    date: str = "",
    collection_name: str = "Hugging Face Papers",
    project_id: str = "",
    api_base_url: str = "http://localhost:5173",
    collection_id: str = "",
) -> str:
    """Fetch Hugging Face daily papers for a given date.

    Args:
        date: Date in YYYY-MM-DD format (defaults to today).
        collection_name: Collection name for captured papers.
        project_id: Project ID for document capture.
        api_base_url: Base URL of the Node.js API.
        collection_id: Optional specific collection ID.

    Returns:
        Formatted list of daily papers.
    """
    if not date:
        import datetime
        date = datetime.date.today().isoformat()

    url = f"https://huggingface.co/api/daily_papers?date={quote(date)}"
    res = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=30.0)
    if not res.is_success:
        raise RuntimeError(f"Hugging Face daily papers request failed with status {res.status_code}")

    data = res.json()
    papers = data if isinstance(data, list) else (data.get("papers", []) if isinstance(data, dict) else [])

    api = ProjectAPI(api_base_url, project_id) if project_id else None
    lines = [f"Date: {date}", "Source: Hugging Face Daily Papers", f"Results: {len(papers)}"]

    for paper in papers[:20]:
        title = str(paper.get("title") or paper.get("paper", {}).get("title", "Untitled Paper"))
        arxiv_id = str(paper.get("arxiv_id") or paper.get("id") or paper.get("paper", {}).get("id", ""))
        summary = str(paper.get("summary") or paper.get("paper", {}).get("summary", ""))
        source_uri = f"https://huggingface.co/papers/{arxiv_id}" if arxiv_id else "https://huggingface.co/papers"

        _capture_document(
            api, collection_id, collection_name, title,
            "huggingface-paper", source_uri,
            "\n".join(filter(None, [title, summary])),
            {"date": date, "arxivId": arxiv_id, "source": "huggingface-daily-papers"},
        )

        lines.append(f"- {title}" + (f" ({arxiv_id})" if arxiv_id else ""))
        if summary:
            trunc = summary[:300] + ("..." if len(summary) > 300 else "")
            lines.append(f"  summary: {trunc}")

    return "\n".join(lines)


@tool
def hf_paper(
    arxiv_id: str,
    collection_name: str = "Hugging Face Papers",
    project_id: str = "",
    api_base_url: str = "http://localhost:5173",
    collection_id: str = "",
) -> str:
    """Fetch a specific paper from Hugging Face by arXiv ID.

    Args:
        arxiv_id: The arXiv paper ID.
        collection_name: Collection name for the captured paper.
        project_id: Project ID for document capture.
        api_base_url: Base URL of the Node.js API.
        collection_id: Optional specific collection ID.

    Returns:
        Paper details including title, summary, and URL.
    """
    arxiv_id = (arxiv_id or "").strip()
    if not arxiv_id:
        raise ValueError("arxiv_id is required")

    url = f"https://huggingface.co/api/papers/{quote(arxiv_id)}"
    res = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=30.0)
    if not res.is_success:
        raise RuntimeError(f"Hugging Face paper request failed with status {res.status_code}")

    paper = res.json()
    title = str(paper.get("title", f"Paper {arxiv_id}"))
    summary = str(paper.get("summary", ""))
    paper_url = f"https://huggingface.co/papers/{arxiv_id}"

    api = ProjectAPI(api_base_url, project_id) if project_id else None
    _capture_document(
        api, collection_id, collection_name, title,
        "huggingface-paper", paper_url,
        "\n".join(filter(None, [title, summary])),
        {"arxivId": arxiv_id, "source": "huggingface-paper-api"},
    )

    return "\n".join([
        "Source: Hugging Face Paper API",
        f"Paper: {title}",
        f"arXiv ID: {arxiv_id}",
        f"URL: {paper_url}",
        "",
        summary or "No summary provided",
    ])


def _parse_search_result_urls(search_output: str) -> list[str]:
    """Extract URLs from search output text."""
    urls = re.findall(r"https?://[^\s\)]+", search_output)
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            unique.append(u)
    return unique


def _resolve_collection_id(
    project_id: str,
    api_base_url: str,
    collection_id: str,
    collection_name: str,
) -> str:
    if collection_id or not project_id:
        return collection_id
    api = ProjectAPI(api_base_url, project_id)
    collection = api.ensure_collection(collection_name)
    return str(collection.get("id", "")).strip()


@tool
def deep_research(
    question: str,
    breadth: int = 4,
    fetch_limit: int = 4,
    collection_name: str = "Deep Research",
    project_id: str = "",
    api_base_url: str = "http://localhost:5173",
    collection_id: str = "",
) -> str:
    """Conduct multi-step deep research: decompose question, search, fetch sources, synthesize report.

    Args:
        question: The research question to investigate.
        breadth: Number of search queries to run (2-8).
        fetch_limit: Maximum URLs to fetch per query (2-8).
        collection_name: Collection name for the report.
        project_id: Project ID for document capture.
        api_base_url: Base URL of the Node.js API.
        collection_id: Optional specific collection ID.

    Returns:
        A structured research report with citations.
    """
    question = (question or "").strip()
    if not question:
        raise ValueError("question is required")
    breadth = min(8, max(2, breadth))
    fetch_limit = min(8, max(2, fetch_limit))

    # Generate search queries from the question
    queries = [question]
    for part in re.split(r"\b(?:and|or|then|vs|versus)\b|[,;]+", question, flags=re.IGNORECASE):
        part = part.strip()
        if part and part not in queries:
            queries.append(part)
        if len(queries) >= breadth:
            break

    resolved_collection_id = _resolve_collection_id(
        project_id=project_id,
        api_base_url=api_base_url,
        collection_id=collection_id,
        collection_name=collection_name,
    )

    sources = []
    notes = []
    search_results: list[tuple[str, str]] = []

    with ThreadPoolExecutor(max_workers=min(4, len(queries[:breadth]) or 1)) as pool:
        futures = {
            pool.submit(web_search, query=q): q
            for q in queries[:breadth]
        }
        for future in as_completed(futures):
            query = futures[future]
            try:
                search_output = future.result()
                notes.append(f"Search query: {query}")
                search_results.append((query, search_output))
            except Exception as e:
                notes.append(f"Search query failed: {query} ({e})")

    fetch_jobs: list[tuple[str, str]] = []
    seen_urls: set[str] = set()
    for query, search_output in search_results:
        for url in _parse_search_result_urls(search_output)[:fetch_limit]:
            if url in seen_urls:
                continue
            seen_urls.add(url)
            fetch_jobs.append((query, url))

    with ThreadPoolExecutor(max_workers=min(8, len(fetch_jobs) or 1)) as pool:
        futures = {
            pool.submit(
                web_fetch,
                url=url,
                collection_name=collection_name,
                project_id=project_id,
                api_base_url=api_base_url,
                collection_id=resolved_collection_id,
            ): (query, url)
            for query, url in fetch_jobs
        }
        for future in as_completed(futures):
            query, url = futures[future]
            try:
                fetched = future.result()
                sources.append({"query": query, "url": url, "fetched": fetched})
            except Exception as e:
                notes.append(f"Fetch failed: {url} ({e})")

    # Build citation list
    citation_list = "\n".join(
        f"[{i + 1}] {s['url']}" for i, s in enumerate(sources)
    )

    # Build a synthesis report (the agent model handles actual synthesis
    # when this is returned as tool output — it sees all the gathered data)
    source_summaries = []
    for i, s in enumerate(sources):
        text = str(s.get("fetched", ""))[:5000]
        source_summaries.append(f'Source [{i + 1}] query="{s["query"]}"\n{text}')

    report_parts = [
        f"# Deep Research Report",
        f"Question: {question}",
        "",
        "## Research Notes",
        "\n".join(notes) or "No notes.",
        "",
        "## Gathered Sources",
        "\n\n---\n\n".join(source_summaries) or "No fetched sources.",
        "",
        "## Sources",
        citation_list or "No sources captured.",
    ]
    final_report = "\n".join(report_parts)

    # Capture the report
    api = ProjectAPI(api_base_url, project_id) if project_id else None
    _capture_document(
        api, collection_id, collection_name,
        f"Deep Research: {question[:120]}",
        "deep-research-report",
        f"deep-research://{int(time.time())}",
        final_report,
        {"question": question, "queryCount": len(queries), "sourceCount": len(sources), "notes": notes},
    )

    return final_report
