# Proxy Guide

The app uses the Vercel server plus the proxies you add from the web UI.

```text
throughput ~= 1 direct server lane + active proxy lanes
```

Examples:

- 0 proxy: `1 req/s`
- 2 proxies: `3 req/s`
- 5 proxies: `6 req/s`

## Storage

Proxies are stored in memory.

That keeps the app simple, but the list is not permanent. On Vercel, proxies can disappear after redeploy, cold start, or instance changes.

## Web UI

Open:

```text
http://localhost:3000/
https://your-app.vercel.app/
```

You can:

- Add multiple proxies at once
- Enable or disable a proxy
- Delete one proxy
- Clear all proxies with the API
- See total proxies, active proxies, and estimated throughput

## Supported Input Format

Add one proxy per line:

```text
IP:PORT
IP:PORT:USER:PASS
```

Examples:

```text
160.250.182.61:15136:f95u:f95u
192.168.1.1:8080
10.0.0.1:3128:user:pass
```

## API

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

### Clear All Proxies

```bash
curl -X DELETE http://localhost:3000/api/proxies
```

## Batch Requests

`POST /api/videos` uses batches sized by `1 + active proxies`.
Proxy requests time out after 3 seconds. The server keeps the call synchronous.
It uses an internal deadline of `300000` ms, matching the configured Vercel
function duration for this project. Clients only send URLs; unfinished URLs are
returned as `status: "pending"` with `code: -2`.

Example with 2 active proxies:

```text
Batch 1:
  URL 1 -> direct Vercel server IP
  URL 2 -> proxy 1
  URL 3 -> proxy 2

Batch 2 starts as soon as Batch 1 settles.

Batch 2:
  URL 4 -> direct Vercel server IP
  URL 5 -> proxy 1
  URL 6 -> proxy 2
```

Single requests also rotate through direct/proxy lanes, but high concurrency on Vercel is still best treated as approximate because serverless instances can be separate.
