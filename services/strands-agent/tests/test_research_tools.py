"""Tests for research_tools.py — arXiv, HF papers, deep research (mocked httpx)."""

import os
import sys
import types
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

strands_mod = types.ModuleType("strands")
strands_mod.tool = lambda fn: fn
sys.modules.setdefault("strands", strands_mod)

bs4_mod = types.ModuleType("bs4")


class _FakeSoup:
    def __init__(self, html, _parser):
        self.html = html
        self.title = types.SimpleNamespace(string="Research Page")

    def get_text(self, separator=" ", strip=True):
        return str(self.html)

    def __call__(self, _selectors):
        return []

    def find(self, tag_name):
        if tag_name in {"article", "main", "body"}:
            return self
        return None


bs4_mod.BeautifulSoup = _FakeSoup
sys.modules.setdefault("bs4", bs4_mod)

from tools.research_tools import arxiv_search, hf_daily_papers, hf_paper


def _mock_response(text="", status_code=200, content_type="text/xml"):
    resp = MagicMock()
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.headers = {"content-type": content_type}
    resp.text = text
    resp.content = text.encode()
    return resp


ARXIV_XML = """<?xml version="1.0"?>
<feed>
<entry>
<id>http://arxiv.org/abs/2301.00001v1</id>
<title>Test Paper Title</title>
<summary>This is a test summary about machine learning.</summary>
<published>2023-01-01T00:00:00Z</published>
<author><name>Jane Doe</name></author>
<author><name>John Smith</name></author>
</entry>
</feed>"""


class TestArxivSearch:
    @patch("tools.research_tools.httpx.get")
    def test_returns_parsed_entries(self, mock_get):
        mock_get.return_value = _mock_response(text=ARXIV_XML)

        result = arxiv_search(query="machine learning")
        assert "Query: machine learning" in result
        assert "arXiv API" in result
        assert "Test Paper Title" in result
        assert "Jane Doe" in result
        assert "2301.00001" in result

    def test_empty_query_raises(self):
        with pytest.raises(ValueError, match="query is required"):
            arxiv_search(query="")


class TestHfDailyPapers:
    @patch("tools.research_tools.httpx.get")
    def test_returns_papers(self, mock_get):
        resp = _mock_response(content_type="application/json")
        resp.json.return_value = [
            {"title": "Cool Paper", "arxiv_id": "2301.99999", "summary": "A cool paper about AI."},
        ]
        mock_get.return_value = resp

        result = hf_daily_papers(date="2023-01-01")
        assert "Date: 2023-01-01" in result
        assert "Cool Paper" in result
        assert "2301.99999" in result


class TestHfPaper:
    @patch("tools.research_tools.httpx.get")
    def test_returns_paper_details(self, mock_get):
        resp = _mock_response(content_type="application/json")
        resp.json.return_value = {
            "title": "Specific Paper",
            "summary": "Detailed summary of the paper.",
        }
        mock_get.return_value = resp

        result = hf_paper(arxiv_id="2301.12345")
        assert "Specific Paper" in result
        assert "2301.12345" in result
        assert "Detailed summary" in result

    def test_empty_arxiv_id_raises(self):
        with pytest.raises(ValueError, match="arxiv_id is required"):
            hf_paper(arxiv_id="")
