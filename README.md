# TikWM Service

Simple Express service for TikWM with a web UI for in-memory proxy management.

## Features

- Single video lookup: `GET /api/video?url=<tiktok_url>`
- Batch video lookup: `POST /api/videos`
- Web UI at `/` for adding, disabling, and deleting proxies
- In-memory proxy storage
- Throughput model: `1 direct server IP + active proxies`
- No worker pool and no `URL_POOL` setup

## How It Works

The Vercel server itself is always one request lane. Every active proxy adds one more lane.

Examples:

- 0 proxies: about `1 req/s`
- 2 proxies: about `3 req/s`
- 5 proxies: about `6 req/s`

For `POST /api/videos`, the service processes URLs in batches sized by:

```text
batch size = 1 + active proxy count
```

Within each batch, one request uses the direct server connection and the rest use active proxies. The next batch waits about 1 second.

Proxy entries are stored in memory only. On Vercel, this means they can disappear after a redeploy, cold start, or instance change.

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open:

```text
http://localhost:3000/
```

## Deploy To Vercel

Deploy this `tikwm-service` folder to Vercel. No worker server and no `URL_POOL` environment variable are needed.

After deploy, open:

```text
https://your-app.vercel.app/
```

Then add proxies from the UI.

## Proxy Format

Each line in the UI can be one of:

```text
IP:PORT
IP:PORT:USER:PASS
```

Examples:

```text
160.250.182.61:15136:f95u:f95u
192.168.1.1:8080
```

## API

### Health

```bash
curl "http://localhost:3000/health"
```

### Single Video

```bash
curl "http://localhost:3000/api/video?url=https://www.tiktok.com/@username/video/1234567890"
```

### Multiple Videos

```bash
curl -X POST http://localhost:3000/api/videos \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.tiktok.com/@user1/video/123",
      "https://www.tiktok.com/@user2/video/456"
    ]
  }'
```

The service uses a fixed internal deadline of `300000` ms (300 seconds), matching
the configured Vercel function duration for this project. Clients do not need to
send a deadline. When the deadline is reached,
unfinished URLs are still returned with:

```json
{
  "code": -2,
  "msg": "Not processed before deadline",
  "status": "pending"
}
```

Each completed item has `status: "success"` when TikWM returns `code: 0`.
Each failed item has `status: "failed"`.

The response also includes `completed`, `failed`, `pending`, `batchSize`, and
the service deadline used for the run, so an outside job runner can decide what
to retry.

### List Proxies

```bash
curl "http://localhost:3000/api/proxies"
```

### Add Proxy

```bash
curl -X POST http://localhost:3000/api/proxies \
  -H "Content-Type: application/json" \
  -d '{"proxy":"160.250.182.61:15136:f95u:f95u"}'
```

### Toggle Proxy

```bash
curl -X PATCH http://localhost:3000/api/proxies/0/toggle
```

### Delete Proxy

```bash
curl -X DELETE http://localhost:3000/api/proxies/0
```

## Tests

```bash
npm test
```
