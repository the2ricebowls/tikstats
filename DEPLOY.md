# Hướng dẫn Deploy

## 🚀 Deploy Server Chủ lên Vercel

### 1. Chuẩn bị

```bash
cd tikwm-service
npm install
```

### 2. Deploy lên Vercel

#### Option A: Dùng Vercel CLI

```bash
# Cài Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy production
vercel --prod
```

#### Option B: Dùng Vercel Dashboard

1. Push code lên GitHub
2. Vào https://vercel.com
3. Import repository
4. Vercel tự động detect và deploy

### 3. Cấu hình Environment Variables

Trong Vercel Dashboard > Settings > Environment Variables, thêm:

```
URL_POOL=http://vps1.example.com:3001|http://vps2.example.com:3001|http://vps3.example.com:3001
```

**Lưu ý:** Thay `vps1.example.com` bằng IP hoặc domain thực của VPS.

### 4. Redeploy sau khi thêm env

```bash
vercel --prod
```

---

## 🖥️ Deploy Worker lên VPS

### VPS 1

```bash
# 1. SSH vào VPS
ssh user@vps1.example.com

# 2. Cài Python & PM2
sudo apt update
sudo apt install python3 python3-pip -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs -y
sudo npm install -g pm2

# 3. Upload code
# Từ máy local:
scp -r tikwm-worker user@vps1.example.com:~/

# 4. Cài dependencies
cd ~/tikwm-worker
pip3 install -r requirements.txt

# 5. Tạo thư mục logs
mkdir -p logs

# 6. Start với PM2
pm2 start ecosystem.config.js

# 7. Auto-start khi reboot
pm2 startup
pm2 save

# 8. Kiểm tra
pm2 status
pm2 logs tikwm-worker
curl http://localhost:3001/health
```

### VPS 2 & VPS 3

Lặp lại các bước trên cho VPS 2 và VPS 3.

### Mở Port (nếu cần)

```bash
# Ubuntu/Debian
sudo ufw allow 3001

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

---

## ✅ Kiểm tra

### 1. Test Worker trực tiếp

```bash
curl "http://vps1.example.com:3001/health"
curl "http://vps1.example.com:3001/api/video?url=https://www.tiktok.com/@user/video/123"
```

### 2. Test Server Chủ

```bash
# Health check
curl "https://your-app.vercel.app/health"

# Single video
curl "https://your-app.vercel.app/api/video?url=https://www.tiktok.com/@user/video/123"

# Multiple videos (sẽ dùng pool)
curl -X POST https://your-app.vercel.app/api/videos \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.tiktok.com/@user1/video/123",
      "https://www.tiktok.com/@user2/video/456",
      "https://www.tiktok.com/@user3/video/789"
    ]
  }'
```

---

## 📊 Monitoring

### PM2 Commands

```bash
# Xem status
pm2 status

# Xem logs
pm2 logs tikwm-worker

# Xem logs realtime
pm2 logs tikwm-worker --lines 100

# Restart
pm2 restart tikwm-worker

# Stop
pm2 stop tikwm-worker

# Delete
pm2 delete tikwm-worker

# Xem resource usage
pm2 monit
```

### Vercel Logs

```bash
vercel logs
```

Hoặc xem trong Vercel Dashboard > Deployments > Logs

---

## 🔧 Troubleshooting

### Worker không start

```bash
# Kiểm tra logs
pm2 logs tikwm-worker --err

# Chạy trực tiếp để debug
python3 worker.py
```

### Server chủ không connect được workers

1. Kiểm tra firewall/port
2. Kiểm tra URL_POOL trong Vercel env
3. Test worker trực tiếp từ browser
4. Kiểm tra logs trong Vercel

### Rate limit vẫn xảy ra

- Đảm bảo mỗi worker delay đúng 1s
- Kiểm tra số lượng workers trong pool
- Xem logs để debug

---

## 📈 Scale Up

Khi cần tăng throughput:

1. Deploy thêm workers trên VPS mới
2. Thêm URL vào `URL_POOL` trong Vercel
3. Redeploy Vercel

**Ví dụ:** 10 workers = ~10 requests/second = 600 requests/minute = 36,000 requests/hour

---

## 💡 Tips

- Dùng domain cho VPS thay vì IP (dễ quản lý)
- Setup SSL cho workers nếu cần (nginx reverse proxy)
- Monitor resource usage với `pm2 monit`
- Backup ecosystem.config.js và requirements.txt
- Dùng `.env` file cho local development
