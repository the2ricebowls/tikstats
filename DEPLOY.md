# Deploy Guide

This service is now a single Vercel Express app. There are no workers, no VPS setup, and no `URL_POOL`.

## Local Check

```bash
npm install
npm test
npm run dev
```

Open:

```text
http://localhost:3000/
```

## Vercel Deploy

### Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
vercel --prod
```

### Vercel Dashboard

1. Push this folder to GitHub.
2. Import the repository in Vercel.
3. Deploy.
4. Open the deployed URL and add proxies from the web UI.

## Environment Variables

No proxy or worker environment variables are required.

`PORT=3000` is only useful for local development. Vercel handles runtime ports for the deployment.

## After Deploy

Open:

```text
https://your-app.vercel.app/
```

Add proxies using:

```text
IP:PORT
IP:PORT:USER:PASS
```

The proxy list is in-memory. It can reset after a redeploy, cold start, or instance change.

## Smoke Tests

```bash
curl "https://your-app.vercel.app/health"
curl "https://your-app.vercel.app/api/proxies"
```

```bash
curl -X POST https://your-app.vercel.app/api/proxies \
  -H "Content-Type: application/json" \
  -d '{"proxy":"160.250.182.61:15136:f95u:f95u"}'
```

```bash
curl -X POST https://your-app.vercel.app/api/videos \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.tiktok.com/@user1/video/123",
      "https://www.tiktok.com/@user2/video/456"
    ]
  }'
```

## Throughput

```text
throughput ~= 1 direct Vercel IP + active proxy count
```

Examples:

- 0 proxies: about `1 req/s`
- 5 proxies: about `6 req/s`
- 10 proxies: about `11 req/s`
