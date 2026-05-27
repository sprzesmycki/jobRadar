FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"
ENV SECRET_KEY=dummy-build-only-not-production
ENV DEBUG=false

COPY . .
RUN python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["gunicorn", "job_radar.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
