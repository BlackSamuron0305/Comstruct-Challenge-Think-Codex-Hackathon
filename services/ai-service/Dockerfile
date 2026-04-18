FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev curl && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install -e .

COPY . .
EXPOSE 8005
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8005"]
