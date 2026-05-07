# 🔐 Hướng dẫn sử dụng Proxy

## Tổng quan

Hệ thống hỗ trợ proxy để tăng throughput. **Mỗi proxy = +1 request/second**.

### Công thức throughput:

```
Throughput = 1 (base) + số proxy active
```

**Ví dụ:**
- 0 proxy: 1 req/s
- 2 proxies: 3 req/s (1 direct + 2 proxies)
- 5 proxies: 6 req/s (1 direct + 5 proxies)
- 10 proxies: 11 req/s (1 direct + 10 proxies)

## 🌐 Giao diện Web

Truy cập: `http://localhost:3000/` hoặc `https://your-app.vercel.app/`

### Tính năng:

- ✅ Thêm/xóa proxy
- ✅ Enable/disable proxy
- ✅ Xem stats realtime
- ✅ Hỗ trợ auth (username/password)
- ✅ Auto-refresh mỗi 10s

## 📝 Thêm Proxy

### Qua Web UI:

1. Mở `http://localhost:3000/`
2. Điền thông tin proxy:
   - **URL**: `http://proxy.example.com:8080` hoặc `socks5://proxy.example.com:1080`
   - **Username** (optional): `your_username`
   - **Password** (optional): `your_password`
3. Click "Thêm Proxy"

### Qua API:

```bash
curl -X POST http://localhost:3000/api/proxies \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://proxy.example.com:8080",
    "username": "user",
    "password": "pass"
  }'
```

## 🔧 Quản lý Proxy

### Xem danh sách:

```bash
GET /api/proxies
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "active": 2,
  "proxies": [
    {
      "id": 0,
      "url": "http://proxy1.com:8080",
      "username": "user1",
      "enabled": true,
      "lastUsed": 1234567890
    },
    ...
  ]
}
```

### Enable/Disable:

```bash
PATCH /api/proxies/:id/toggle
```

### Xóa proxy:

```bash
DELETE /api/proxies/:id
```

### Xóa tất cả:

```bash
DELETE /api/proxies
```

## 🚀 Cách hoạt động

### 1. Single Request (GET /api/video)

Hệ thống tự động chọn proxy theo round-robin:

```
Request 1 → No proxy
Request 2 → Proxy 1
Request 3 → Proxy 2
Request 4 → No proxy (lặp lại)
...
```

### 2. Multiple Requests (POST /api/videos)

Xử lý parallel theo batch:

```
Batch 1 (3 URLs):
  URL 1 → No proxy
  URL 2 → Proxy 1  } Parallel
  URL 3 → Proxy 2

Wait 1s

Batch 2 (3 URLs):
  URL 4 → No proxy
  URL 5 → Proxy 1  } Parallel
  URL 6 → Proxy 2
...
```

**Throughput:** 3 URLs/second (với 2 proxies)

## 📊 Ví dụ thực tế

### Scenario 1: Không có proxy

```bash
curl "http://localhost:3000/api/video?url=https://tiktok.com/@user/video/123"
```

- Throughput: **1 req/s**
- Gọi trực tiếp TikWM API

### Scenario 2: Có 2 proxies

```bash
# Thêm proxies
curl -X POST http://localhost:3000/api/proxies \
  -H "Content-Type: application/json" \
  -d '{"url": "http://proxy1.com:8080"}'

curl -X POST http://localhost:3000/api/proxies \
  -H "Content-Type: application/json" \
  -d '{"url": "http://proxy2.com:8080"}'

# Gọi multiple URLs
curl -X POST http://localhost:3000/api/videos \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://tiktok.com/@user1/video/123",
      "https://tiktok.com/@user2/video/456",
      "https://tiktok.com/@user3/video/789",
      "https://tiktok.com/@user4/video/101",
      "https://tiktok.com/@user5/video/112",
      "https://tiktok.com/@user6/video/131"
    ]
  }'
```

- Throughput: **3 req/s** (1 direct + 2 proxies)
- 6 URLs = 2 batches = 2 giây

### Scenario 3: Có 10 proxies

- Throughput: **11 req/s**
- 100 URLs = ~10 batches = ~10 giây
- 1000 URLs = ~91 batches = ~91 giây

## 🔐 Loại Proxy hỗ trợ

### HTTP/HTTPS Proxy

```
http://proxy.example.com:8080
https://proxy.example.com:8443
```

### SOCKS5 Proxy

```
socks5://proxy.example.com:1080
```

### Proxy với Auth

```json
{
  "url": "http://proxy.example.com:8080",
  "username": "your_username",
  "password": "your_password"
}
```

## 💡 Tips

### 1. Mua proxy ở đâu?

- **Residential Proxies**: Bright Data, Oxylabs, Smartproxy
- **Datacenter Proxies**: ProxyRack, MyPrivateProxy
- **Free Proxies**: Free-proxy-list.net (không khuyến khích)

### 2. Chọn proxy tốt:

- ✅ Tốc độ cao (< 500ms latency)
- ✅ Uptime cao (> 99%)
- ✅ Rotating IPs
- ✅ Hỗ trợ HTTPS
- ✅ Không bị block bởi TikTok

### 3. Test proxy trước khi thêm:

```bash
# Test với curl
curl -x http://proxy.example.com:8080 https://www.tikwm.com/api/

# Test với auth
curl -x http://user:pass@proxy.example.com:8080 https://www.tikwm.com/api/
```

### 4. Monitor proxy health:

- Xem "Last Used" trong Web UI
- Disable proxy nếu thấy lỗi nhiều
- Rotate proxies định kỳ

### 5. Scale strategy:

```
10 URLs/day     → 0 proxies (1 req/s)
100 URLs/day    → 2-3 proxies (3-4 req/s)
1000 URLs/day   → 5-10 proxies (6-11 req/s)
10000 URLs/day  → 20-30 proxies (21-31 req/s)
```

## 🛡️ Security

### Lưu ý:

- ⚠️ Proxy credentials được lưu trong memory (không persist)
- ⚠️ Restart server = mất tất cả proxies
- ⚠️ Không expose Web UI ra public (chỉ dùng internal)
- ⚠️ Dùng HTTPS cho production

### Best practices:

1. Chỉ thêm proxy qua internal network
2. Không share proxy credentials
3. Rotate proxies định kỳ
4. Monitor usage và costs
5. Backup danh sách proxies

## 🔄 Kết hợp với URL Pool

Bạn có thể kết hợp cả **URL Pool** (workers) và **Proxies**:

```
Server chủ (Vercel)
  ├─ Direct connection (1 req/s)
  ├─ Proxy 1 (1 req/s)
  ├─ Proxy 2 (1 req/s)
  └─ URL Pool
      ├─ Worker 1 (VPS 1)
      │   ├─ Direct (1 req/s)
      │   ├─ Proxy A (1 req/s)
      │   └─ Proxy B (1 req/s)
      └─ Worker 2 (VPS 2)
          ├─ Direct (1 req/s)
          ├─ Proxy C (1 req/s)
          └─ Proxy D (1 req/s)
```

**Total throughput:** 9 req/s

## 📈 Monitoring

### Web UI Stats:

- **Total Proxies**: Tổng số proxies
- **Active Proxies**: Số proxies đang enabled
- **Max Throughput**: Throughput tối đa (req/s)

### API Stats:

```bash
curl http://localhost:3000/api/proxies
```

## ❓ Troubleshooting

### Proxy không hoạt động:

1. Check proxy URL format
2. Test proxy với curl
3. Check firewall/network
4. Verify credentials
5. Check proxy provider status

### Rate limit vẫn xảy ra:

1. Đảm bảo mỗi proxy delay đúng 1s
2. Check số proxies active
3. Verify proxy IPs khác nhau
4. Monitor logs

### Proxy chậm:

1. Test latency với ping
2. Thử proxy khác
3. Check proxy provider
4. Consider datacenter proxies

## 🎯 Kết luận

- ✅ Proxy giúp tăng throughput tuyến tính
- ✅ Dễ dàng thêm/xóa qua Web UI
- ✅ Tự động round-robin và delay management
- ✅ Hỗ trợ auth và nhiều loại proxy
- ✅ Scale theo nhu cầu

**Công thức vàng:** Throughput = 1 + số proxy active 🚀
