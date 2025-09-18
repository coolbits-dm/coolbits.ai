# Example production image for Andy Gateway
FROM python:3.11-slim

WORKDIR /srv

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

CMD ["gunicorn","-w","2","-k","uvicorn.workers.UvicornWorker","app.main:app","--bind","0.0.0.0:$PORT"]

