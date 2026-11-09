FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY stockcheck ./stockcheck
COPY web ./web
COPY data/template-daily.csv data/template-fundamentals.csv ./data/
ENV PORT=8766
EXPOSE 8766
CMD ["sh", "-c", "python -m stockcheck.server --host 0.0.0.0 --port ${PORT:-8766}"]
