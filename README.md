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

Within each batch, one request uses the direct server connection and the rest use active proxies. The next batch starts as soon as the current batch settles, so the service uses the available Vercel runtime as aggressively as possible.

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

Base URL when running locally:

```text
http://localhost:3000
```

Base URL after Vercel deploy:

```text
https://your-app.vercel.app
```

### Health

Check whether the service is running.

```bash
curl "http://localhost:3000/health"
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-05-08T10:00:00.000Z"
}
```

### Single Video

Fetch one TikTok URL.

```bash
curl "http://localhost:3000/api/video?url=https://www.tiktok.com/@username/video/1234567890"
```

Success response is the TikWM response:

```json
{
  "code": 0,
  "msg": "success",
  "processed_time": 0.35,
  "data": {
    "id": "1234567890",
    "title": "...",
    "play": "https://..."
  }
}
```

Missing URL:

```json
{
  "code": -1,
  "msg": "URL parameter is required"
}
```

Invalid or unparseable TikTok URL:

```json
{
  "code": -1,
  "msg": "Please check url",
  "url": "https://..."
}
```

### Multiple Videos

Fetch many TikTok URLs in one synchronous call. The client only sends `urls`.
The service owns timeout/deadline settings internally.

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

Request body:

```json
{
  "urls": ["https://www.tiktok.com/@user/video/123"]
}
```

Rules:

- `urls` must be a non-empty array.
- The service uses an internal deadline of `300000` ms, matching `maxDuration: 300` in `vercel.json`.
- Proxy requests time out after `3000` ms.
- Direct server requests use a `30000` ms timeout.
- Processing lanes are `1 direct server lane + active proxy count`.
- If the deadline is reached, unfinished URLs are returned as `pending`.

Top-level response:

```json
{
  "total": 100,
  "completed": 80,
  "failed": 5,
  "pending": 15,
  "batchSize": 6,
  "maxWaitMs": 300000,
  "data": []
}
```

Top-level fields:

- `total`: number of URLs received.
- `completed`: number of items with `status: "success"`.
- `failed`: number of items that were tried and failed.
- `pending`: number of items not processed before the service deadline.
- `batchSize`: number of parallel lanes used for each batch, equal to `1 + active proxies`.
- `maxWaitMs`: internal service deadline used for this run.
- `data`: per-URL results.

Successful item:

```json
{
  "url": "https://www.tiktok.com/@user/video/123",
  "status": "success",
  "code": 0,
  "msg": "success",
  "processed_time": 0.35,
  "data": {
    "id": "123",
    "title": "...",
    "play": "https://..."
  }
}
```

Failed item:

```json
{
  "url": "https://www.tiktok.com/@user/video/456",
  "status": "failed",
  "code": -1,
  "msg": "timeout of 3000ms exceeded"
}
```

Pending item:

```json
{
  "url": "https://www.tiktok.com/@user/video/789",
  "status": "pending",
  "code": -2,
  "msg": "Not processed before deadline"
}
```

Status meanings:

- `success`: URL was processed successfully. The item includes TikWM data.
- `failed`: URL was attempted, but the request failed or TikWM returned an error.
- `pending`: URL was not processed before the service deadline. The outer job runner should retry these URLs later.

Recommended outer job handling:

- Retry `pending` URLs first.
- Retry `failed` URLs only if your job policy wants another attempt.
- Treat `success` URLs as done.
- You do not need to send any deadline field; this service handles it.

Invalid batch request:

```json
{
  "code": -1,
  "msg": "URLs array is required and must not be empty"
}
```

### Proxy API

Proxies are in-memory. On Vercel, the list can reset after redeploy, cold start,
or instance change.

#### List Proxies

```bash
curl "http://localhost:3000/api/proxies"
```

Response:

```json
{
  "success": true,
  "count": 1,
  "active": 1,
  "proxies": [
    {
      "id": 0,
      "proxy": "160.250.182.61:15136:f95u:f95u",
      "host": "160.250.182.61",
      "port": "15136",
      "username": "f95u",
      "hasAuth": true,
      "enabled": true,
      "lastUsed": 1770000000000
    }
  ]
}
```

#### Add Proxy

```bash
curl -X POST http://localhost:3000/api/proxies \
  -H "Content-Type: application/json" \
  -d '{"proxy":"160.250.182.61:15136:f95u:f95u"}'
```

Response:

```json
{
  "success": true,
  "message": "Proxy added successfully",
  "proxy": {
    "host": "160.250.182.61",
    "port": "15136",
    "username": "f95u",
    "hasAuth": true,
    "enabled": true
  }
}
```

Invalid proxy:

```json
{
  "success": false,
  "error": "Proxy string is required (format: IP:PORT:USER:PASS or IP:PORT)"
}
```

#### Toggle Proxy

```bash
curl -X PATCH http://localhost:3000/api/proxies/0/toggle
```

Response:

```json
{
  "success": true,
  "message": "Proxy disabled",
  "enabled": false
}
```

#### Delete Proxy

```bash
curl -X DELETE http://localhost:3000/api/proxies/0
```

Response:

```json
{
  "success": true,
  "message": "Proxy removed successfully"
}
```

#### Clear All Proxies

```bash
curl -X DELETE http://localhost:3000/api/proxies
```

Response:

```json
{
  "success": true,
  "message": "All proxies cleared"
}
```

## Tests

```bash
npm test
```
