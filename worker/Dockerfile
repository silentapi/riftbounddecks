# Worker Dockerfile: executes the DigitalOcean Spaces uploader that refreshes cards/img data.
# Required env vars: SPACES_ENDPOINT, SPACES_KEY, SPACES_SECRET, SPACES_BUCKET, SPACES_PREFIX (optional).
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY official.py .

CMD ["python", "official.py"]

