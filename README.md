# TikWM Service

Service Express để gọi TikWM API với tính năng retry, error handling và **URL Pool** để scale throughput.

## 🌟 Tính năng

- ✅ Retry tự động khi gặp lỗi (3 lần với exponential backoff)
- ✅ Xử lý rate limit (429) tự động
- ✅ Timeout handling
- ✅ Error handling chi tiết
- ✅ Hỗ trợ single và multiple URLs
- ✅ **URL Pool** - Phân phối requests đều cho nhiều workers
- ✅ **Proxy Manager** - Giao diện web quản lý proxy
- ✅ **Scale throughput** - Càng nhiều workers + proxies càng nhanh

## 🏗️ Kiến trúc

```
┌─────────────────┐
│  Client/User    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Server Chủ (Vercel)    │
│  Express + Pool + Proxy │
│  - Direct (1 req/s)     │
│  - Proxy 1 (1 req/s)    │
│  - Proxy 2 (1 req/s)    │
└────────┬────────────────┘
         │
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Worker 1│ │Worker 2│ │Worker 3│ │Worker N│
│(VPS 1) │ │(VPS 2) │ │(VPS 3) │ │(VPS N) │
│+Proxies│ │+Proxies│ │+Proxies│ │+Proxies│
└────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘
     │          │          │          │
     └──────────┴──────────┴──────────┘
                    │
                    ▼
            ┌──────────────┐
            │  TikWM API   │
            └──────────────┘
```

**Throughput:** (1 + P) × (1 + W)
- P = số proxies
- W = số workers

## 📦 Cài đặt

### Server Chủ (Express)

```bash
cd tikwm-service
npm install
```

### Workers (Python)

Xem [tikwm-worker/README.md](../tikwm-worker/README.md)

## 🚀 Deploy

Xem hướng dẫn chi tiết: [DEPLOY.md](DEPLOY.md)

**Tóm tắt:**
1. Deploy server chủ lên **Vercel**
2. Deploy workers lên **VPS** với PM2
3. Cấu hình `URL_POOL` trong Vercel env

## ⚙️ Cấu hình

### .env

```bash
PORT=3000

# URL Pool - các worker servers (phân cách bằng |)
URL_POOL=http://vps1.com:3001|http://vps2.com:3001|http://vps3.com:3001
```

**Lưu ý:**
- Nếu **không có** `URL_POOL`: Server gọi trực tiếp TikWM API (1 req/s)
- Nếu **có** `URL_POOL`: Server phân phối requests cho workers (N req/s)

## 📡 API Endpoints

### 1. Health Check
```bash
GET /health
```

### 2. Lấy thông tin 1 video
```bash
GET /api/video?url=<tiktok_url>
```

**Example:**
```bash
curl "http://localhost:3000/api/video?url=https://www.tiktok.com/@username/video/1234567890"
```

### 3. Lấy thông tin nhiều videos (dùng pool)
```bash
POST /api/videos
Content-Type: application/json

{
  "urls": [
    "https://www.tiktok.com/@user1/video/123",
    "https://www.tiktok.com/@user2/video/456"
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/videos \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.tiktok.com/@user1/video/123",
      "https://www.tiktok.com/@user2/video/456",
      "https://www.tiktok.com/@user3/video/789"
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "total": 3,
  "successful": 3,
  "failed": 0,
  "usingPool": true,
  "poolSize": 3,
  "data": [
    {
      "success": true,
      "url": "https://...",
      "data": {...},
      "worker": "http://vps1.com:3001"
    },
    ...
  ]
}
```

## 🎯 URL Pool Strategy

### Round-Robin Distribution

Pool phân phối requests theo vòng tròn:

```
Request 1 → Worker 1
Request 2 → Worker 2
Request 3 → Worker 3
Request 4 → Worker 1 (lặp lại)
...
```

### Delay Management

- Mỗi worker: **1s delay** giữa các requests
- Batch processing: Gọi parallel theo số workers
- Auto-wait nếu worker chưa đủ 1s

### Example với 3 workers:

```
Time 0s:   Worker1, Worker2, Worker3 (parallel)
Time 1s:   Worker1, Worker2, Worker3 (parallel)
Time 2s:   Worker1, Worker2, Worker3 (parallel)
...
```

**Throughput:** 3 requests/second = 180 requests/minute

## 📊 Response Structure

```json
{
  "success": true,
  "data": {
    "id": "7636777940394462471",
    "url": "https://...",
    "region": "VN",
    "title": "Video title...",
    "contentDesc": ["Line 1", "Line 2"],
    
    "playCount": 277,
    "likeCount": 10,
    "commentCount": 0,
    "shareCount": 0,
    "downloadCount": 0,
    "collectCount": 1,
    
    "cover": "https://...",
    "videoUrl": "https://...",
    "videoUrlWatermark": "https://...",
    "duration": 41,
    
    "musicInfo": {
      "title": "original sound",
      "author": "username",
      "original": true
    },
    
    "author": {
      "uniqueId": "username",
      "nickname": "Display Name",
      "avatar": "https://..."
    },
    
    "createTime": 1778075928,
    "isAd": false,
    "_raw": {...}
  }
}
```

## 🔧 Error Handling

Service tự động xử lý:

- **400**: URL không hợp lệ hoặc lỗi từ TikWM API
- **404**: Video không tìm thấy
- **408**: Request timeout
- **429**: Rate limit (retry tự động)
- **500-599**: Server errors (retry tự động)
- **503**: Network errors

## 📈 Scaling

### Tăng throughput:

1. Deploy thêm workers trên VPS mới
2. Thêm URL vào `URL_POOL`
3. Redeploy

**Example:**
- 1 worker = ~1 req/s = 3,600 req/hour
- 5 workers = ~5 req/s = 18,000 req/hour
- 10 workers = ~10 req/s = 36,000 req/hour

## 🛠️ Development

```bash
# Local development
npm run dev

# Production
npm start
```

## 📝 Logs

Server sẽ log:
- 📥 Đang fetch video
- ✅ Thành công
- ❌ Lỗi
- 🔄 Retry attempts
- ⏳ Delay/waiting
- 📦 Processing batch
- 🌐 Pool info
- 📡 Worker calls

## 🔗 Links

- [Deploy Guide](DEPLOY.md)
- [Proxy Guide](PROXY-GUIDE.md) ⭐ **NEW**
- [Worker README](../tikwm-worker/README.md)
- [TikWM API](https://www.tikwm.com/)

## 💡 Tips

- Dùng pool cho batch processing (>10 URLs)
- **Thêm proxies qua Web UI để tăng throughput** ⭐
- Monitor worker health với `/health` endpoint
- Scale workers + proxies theo nhu cầu
- Backup env variables
- Use domain thay vì IP cho workers

## 🎯 Quick Start

```bash
# 1. Cài đặt
cd tikwm-service
npm install

# 2. Chạy
npm start

# 3. Mở Web UI
open http://localhost:3000

# 4. Thêm proxies qua UI
# 5. Test API
curl "http://localhost:3000/api/video?url=https://tiktok.com/@user/video/123"
```
