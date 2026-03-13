"""Tests for web_tools.py — web fetch and search (mocked httpx)."""

import os
import sys
import types
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

_stubbed_module_names: list[str] = []


def _install_stub(name: str, module: types.ModuleType) -> None:
    if name in sys.modules:
        return
    sys.modules[name] = module
    _stubbed_module_names.append(name)

strands_mod = types.ModuleType("strands")
def _mock_tool(fn=None, *, name=None, **_kw):
    def decorator(func):
        if name:
            func.tool_name = name
        return func
    if fn is not None:
        return decorator(fn)
    return decorator

strands_mod.tool = _mock_tool
_install_stub("strands", strands_mod)

bs4_mod = types.ModuleType("bs4")


class _FakeSoup:
    def __init__(self, html, _parser):
        self.html = html
        self.title = types.SimpleNamespace(string="Test Page")

    def get_text(self, separator=" ", strip=True):
        return str(self.html)

    def __call__(self, _selectors):
        return []

    def find(self, tag_name):
        if tag_name in {"article", "main", "body"}:
            return self
        return None


bs4_mod.BeautifulSoup = _FakeSoup
_install_stub("bs4", bs4_mod)

from tools.web_tools import web_fetch, web_search

for _module_name in reversed(_stubbed_module_names):
    sys.modules.pop(_module_name, None)


def _mock_response(text="", status_code=200, content_type="text/html", content=b""):
    resp = MagicMock()
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.headers = {"content-type": content_type}
    resp.text = text
    resp.content = content or text.encode()
    return resp


class TestWebSearch:
    @patch("tools.web_tools.httpx.get")
    def test_formats_response(self, mock_get):
        mock_get.return_value = _mock_response(
            text="",
            content_type="application/json",
        )
        # Make .json() work
        mock_get.return_value.json.return_value = {
            "Heading": "Python",
            "AbstractText": "Python is a programming language.",
            "RelatedTopics": [
                {"Text": "Python tutorial", "FirstURL": "https://example.com/python"},
            ],
        }

        result = web_search(query="python programming")
        assert "Query: python programming" in result
        assert "DuckDuckGo" in result
        assert "Python is a programming language" in result
        assert "Python tutorial" in result

    def test_empty_query_raises(self):
        with pytest.raises(ValueError, match="query is required"):
            web_search(query="")


class TestWebFetch:
    @patch("tools.web_tools.httpx.get")
    def test_extracts_html(self, mock_get):
        html = "<html><head><title>Test Page</title></head><body><p>Hello world</p></body></html>"
        mock_get.return_value = _mock_response(text=html, content_type="text/html; charset=utf-8")

        result = web_fetch(url="https://example.com/page")
        assert "URL: https://example.com/page" in result
        assert "Status: 200" in result
        assert "Hello world" in result

    def test_empty_url_raises(self):
        with pytest.raises(ValueError, match="url is required"):
            web_fetch(url="")
