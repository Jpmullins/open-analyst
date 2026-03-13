"""Web fetch and search tools for the Strands agent."""

import re
from urllib.parse import urlencode, quote

import httpx
from bs4 import BeautifulSoup
from strands import tool

from util.capture import ProjectAPI

USER_AGENT = "open-analyst-headless"


def _html_to_text(html: str) -> tuple[str, str]:
    """Extract title and body text from HTML."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    title = soup.title.string.strip() if soup.title and soup.title.string else "Web page"
    body_el = soup.find("article") or soup.find("main") or soup.find("body")
    body = body_el.get_text(" ", strip=True) if body_el else ""
    return title, re.sub(r"\s+", " ", body).strip()


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
    """Helper to capture a document into the project store via Node.js API."""
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
def web_fetch(
    url: str,
    collection_name: str = "Task Sources",
    project_id: str = "",
    api_base_url: str = "http://localhost:5173",
    collection_id: str = "",
) -> str:
    """Fetch a web page and extract its text content. The content is captured into the project.

    Args:
        url: The URL to fetch.
        collection_name: Name of the collection to store the captured content.
        project_id: The project ID for document capture.
        api_base_url: Base URL of the Node.js API.
        collection_id: Optional specific collection ID.

    Returns:
        Formatted output with URL, status, content type, and extracted text.
    """
    url = url.strip()
    if not url:
        raise ValueError("url is required")

    res = httpx.get(url, headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=30.0)
    content_type = res.headers.get("content-type", "unknown").lower()

    extracted_text = ""
    title = url
    if "text/html" in content_type:
        title, extracted_text = _html_to_text(res.text)
    elif any(t in content_type for t in ("json", "text/plain", "text/markdown", "xml")):
        extracted_text = res.text

    api = ProjectAPI(api_base_url, project_id) if project_id else None
    doc = _capture_document(
        api,
        collection_id,
        collection_name,
        title,
        "url",
        url,
        extracted_text or f"[Binary content, {len(res.content)} bytes]",
        {"status": res.status_code, "contentType": content_type, "bytes": len(res.content)},
    )

    preview = extracted_text
    if len(preview) > 20000:
        preview = preview[:20000] + f"\n\n[Truncated {len(extracted_text) - 20000} chars]"
    if not preview:
        preview = f"[Binary content, {len(res.content)} bytes]"

    lines = [
        f"URL: {url}",
        f"Status: {res.status_code}",
        f"Content-Type: {content_type}",
        f"Stored Document ID: {doc.get('id', 'n/a') if doc else 'n/a'}",
        "",
        preview,
    ]
    return "\n".join(lines)


@tool
def web_search(query: str) -> str:
    """Search the web using DuckDuckGo.

    Args:
        query: The search query.

    Returns:
        Formatted search results with titles and URLs.
    """
    query = (query or "").strip()
    if not query:
        raise ValueError("query is required")

    # DuckDuckGo Instant Answer API
    params = {
        "q": query,
        "format": "json",
        "no_redirect": "1",
        "no_html": "1",
        "skip_disambig": "1",
    }
    res = httpx.get(
        f"https://api.duckduckgo.com/?{urlencode(params)}",
        headers={"User-Agent": USER_AGENT},
        timeout=15.0,
    )
    if not res.is_success:
        raise RuntimeError(f"Search request failed with status {res.status_code}")

    data = res.json()
    heading = data.get("Heading", "")
    abstract_text = data.get("AbstractText", "")
    related = data.get("RelatedTopics", [])

    results = []

    def collect(item):
        if not isinstance(item, dict):
            return
        text = item.get("Text", "")
        first_url = item.get("FirstURL", "")
        if text:
            results.append(f"- {text}" + (f" ({first_url})" if first_url else ""))
        for nested in item.get("Topics", []):
            collect(nested)

    for topic in related:
        collect(topic)

    lines = [f"Query: {query}", "Source: DuckDuckGo Instant Answer"]
    if heading:
        lines.append(f"Heading: {heading}")
    if abstract_text:
        lines.append(f"Abstract: {abstract_text}")

    if results:
        lines.append("Results:")
        lines.extend(results[:8])
    elif not abstract_text:
        # Fallback to HTML scraping
        html_url = f"https://duckduckgo.com/html/?q={quote(query)}"
        html_res = httpx.get(html_url, headers={"User-Agent": USER_AGENT}, timeout=15.0)
        fallback = []
        for match in re.finditer(
            r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
            html_res.text,
        ):
            href, title_html = match.groups()
            title = re.sub(r"<[^>]+>", "", title_html).strip()
            if title:
                fallback.append(f"- {title}" + (f" ({href})" if href else ""))
            if len(fallback) >= 8:
                break
        if fallback:
            lines.append("Results:")
            lines.extend(fallback)
        else:
            lines.append("Results: No related topics found.")

    return "\n".join(lines)
