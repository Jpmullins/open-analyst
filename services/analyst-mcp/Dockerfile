FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_LINK_MODE=copy
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV ANALYST_MCP_DATA_DIR=/var/open-analyst/analyst-mcp/data
ENV ANALYST_MCP_STORAGE_ROOT=/var/open-analyst/analyst-mcp/data/articles
ENV ANALYST_MCP_INDEX_ROOT=/var/open-analyst/analyst-mcp/data/indexes
ENV ANALYST_MCP_RAW_ROOT=/var/open-analyst/analyst-mcp/data/raw

RUN pip install --no-cache-dir uv \
  && useradd --create-home --uid 10001 appuser \
  && mkdir -p /var/open-analyst/analyst-mcp/data/articles /var/open-analyst/analyst-mcp/data/indexes /var/open-analyst/analyst-mcp/data/raw \
  && chown -R appuser:appuser /var/open-analyst

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project

COPY README.md ./README.md
COPY src ./src
RUN uv sync --locked

USER appuser

EXPOSE 8000

CMD ["analyst-mcp", "serve"]
