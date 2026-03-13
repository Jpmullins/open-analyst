FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_LINK_MODE=copy
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PROJECT_WORKSPACES_ROOT=/var/open-analyst/workspaces

RUN pip install --no-cache-dir uv \
  && useradd --create-home --uid 10001 appuser \
  && mkdir -p /var/open-analyst/workspaces \
  && chown -R appuser:appuser /var/open-analyst

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project

COPY src ./src
RUN uv sync --locked

USER appuser

EXPOSE 8080

CMD ["python", "src/main.py"]
