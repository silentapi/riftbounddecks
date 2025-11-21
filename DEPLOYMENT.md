# Deployment Guide

This document describes the deployment process for the Riftbound Deckbuilder application to the VPS.

## Server Structure

```
/opt/riftbounddecks/
├── backend/          # Current backend deployment
├── backend_backup/   # Previous backend deployment (for rollback)
└── backend.zip       # Uploaded backend package

/var/www/html/        # Frontend static files (served by web server)
```

## Prerequisites

**Initial setup must be completed first.** See [SETUP.md](./SETUP.md) for one-time server configuration.

After setup, you need:
1. **SSH Access**: You must have SSH access to the VPS as `root@rift.basedboats.com`
2. **Server configured**: Node.js, MongoDB, Nginx, and systemd service must be set up (see SETUP.md)

## Deployment Process

### Frontend Deployment

The frontend is built and deployed as static HTML files to `/var/www/html/`:

1. Build the production frontend bundle
2. Create a zip archive of the dist folder
3. Upload to server
4. Extract and replace existing files

### Backend Deployment

The backend follows a zero-downtime deployment strategy:

1. **Package**: Create a zip of the backend (excluding `node_modules`, `.env`, `logs/`)
2. **Upload**: Transfer `backend.zip` to `/opt/riftbounddecks/backend.zip`
3. **Deploy** (via SSH):
   - Stop the `rift-backend.service`
   - Clean `/opt/riftbounddecks/backend_backup/`
   - Move current code files to `/opt/riftbounddecks/backend_backup/` (preserves `.env` and `logs/`)
   - Extract `backend.zip` to `/opt/riftbounddecks/backend/` (preserves existing `.env` and `logs/`)
   - Install npm dependencies
   - Start the `rift-backend.service`

## Deployment Scripts

### Full Deployment (Frontend + Backend)

```bash
./scripts/deploy.sh
```

This script:
- Builds and deploys the frontend
- Packages and deploys the backend
- Handles all SSH operations automatically

### Frontend Only

```bash
cd frontend
npm run deploy
```

### Backend Only

```bash
./scripts/deploy-backend.sh
```

## Manual Deployment Steps

### Frontend

```bash
cd frontend
rm -rf dist/
npm run build:prod
cd dist
zip -r html.zip .
scp html.zip root@rift.basedboats.com:/var/www/html/
ssh root@rift.basedboats.com "cd /var/www/html && find . -mindepth 1 ! -name 'html.zip' -exec rm -rf {} + && unzip -o html.zip && rm html.zip"
cd ../..
```

### Backend

```bash
cd backend
# Create zip excluding node_modules, .env, logs
zip -r ../backend.zip . -x "node_modules/*" ".env" "logs/*" "*.log" ".DS_Store"
cd ..
scp backend.zip root@rift.basedboats.com:/opt/riftbounddecks/
ssh root@rift.basedboats.com << 'EOF'
  systemctl stop rift-backend.service
  rm -rf /opt/riftbounddecks/backend_backup/*
  mv /opt/riftbounddecks/backend/* /opt/riftbounddecks/backend_backup/ 2>/dev/null || true
  cd /opt/riftbounddecks
  unzip -o backend.zip -d backend
  systemctl start rift-backend.service
  systemctl status rift-backend.service
EOF
rm backend.zip
```

## Environment Configuration

### Backend `.env` File

The backend `.env` file must be manually configured on the server at `/opt/riftbounddecks/backend/.env`. It should contain:

```env
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/riftbound_deckbuilder
JWT_SECRET=your-production-secret-key
JWT_EXPIRES_IN=24h
LOG_LEVEL=info
LOG_DIR=./logs
FRONTEND_URL=https://rift.basedboats.com
```

**Important**: The `.env` file is excluded from deployment. Ensure it exists on the server before first deployment.

### Nginx Configuration

The nginx configuration file is located at `/etc/nginx/sites-available/rift.basedboats.com`. It:

- Serves static frontend files from `/var/www/html`
- Proxies `/api/*` requests to the backend at `http://localhost:3000`
- Handles SSL/TLS with Let's Encrypt certificates

**To update nginx configuration manually:**
```bash
# Backup current config
ssh root@rift.basedboats.com "cp /etc/nginx/sites-available/rift.basedboats.com /etc/nginx/sites-available/rift.basedboats.com.backup"

# Upload new config
scp scripts/nginx-rift.basedboats.com.conf root@rift.basedboats.com:/etc/nginx/sites-available/rift.basedboats.com

# Test and reload
ssh root@rift.basedboats.com "nginx -t && systemctl reload nginx"
```

### Systemd Service File

The `rift-backend.service` should be configured at `/etc/systemd/system/rift-backend.service`:

```ini
[Unit]
Description=Riftbound Deckbuilder Backend
After=network.target mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/riftbounddecks/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

## Post-Deployment

1. **Check Backend Status**:
   ```bash
   ssh root@rift.basedboats.com "systemctl status rift-backend.service"
   ```

2. **Check Backend Logs**:
   ```bash
   ssh root@rift.basedboats.com "journalctl -u rift-backend.service -f"
   ```

3. **Verify Frontend**: Visit `https://rift.basedboats.com` in a browser

4. **Test API**: Verify backend endpoints are responding

## Rollback Procedure

If deployment fails, you can rollback the backend:

```bash
ssh root@rift.basedboats.com << 'EOF'
  systemctl stop rift-backend.service
  rm -rf /opt/riftbounddecks/backend/*
  mv /opt/riftbounddecks/backend_backup/* /opt/riftbounddecks/backend/
  systemctl start rift-backend.service
EOF
```

## Troubleshooting

### Backend Won't Start

1. Check service status: `systemctl status rift-backend.service`
2. Check logs: `journalctl -u rift-backend.service -n 50`
3. Verify `.env` file exists and is configured correctly
4. Verify Node.js version: `node --version` (should be 18+)
5. Check MongoDB is running: `systemctl status mongod`

### CORS Errors

If you see errors like `Not allowed by CORS: https://rift.basedboats.com`:

**Fix:**
```bash
ssh root@rift.basedboats.com << 'EOF'
  # Add or update FRONTEND_URL in .env
  if grep -q "^FRONTEND_URL=" /opt/riftbounddecks/backend/.env; then
    sed -i 's|^FRONTEND_URL=.*|FRONTEND_URL=https://rift.basedboats.com|' /opt/riftbounddecks/backend/.env
  else
    echo "FRONTEND_URL=https://rift.basedboats.com" >> /opt/riftbounddecks/backend/.env
  fi
  
  # Restart backend
  systemctl restart rift-backend.service
EOF
```

**Verify:**
```bash
ssh root@rift.basedboats.com "grep FRONTEND_URL /opt/riftbounddecks/backend/.env"
```

### Missing Dependencies (ERR_MODULE_NOT_FOUND)

If you see errors like `Cannot find package 'express'`, the `node_modules` directory is missing or incomplete:

**Fix:**
```bash
ssh root@rift.basedboats.com << 'EOF'
  systemctl stop rift-backend.service
  cd /opt/riftbounddecks/backend
  
  # Find npm (handles nvm installations)
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
  fi
  
  npm install --production
  systemctl start rift-backend.service
EOF
```

**Verify Installation:**
```bash
ssh root@rift.basedboats.com "cd /opt/riftbounddecks/backend && ls -la node_modules/express"
```

### Frontend Not Loading

1. Check web server (nginx/apache) is running
2. Verify files exist in `/var/www/html/`
3. Check web server logs
4. Verify file permissions: `chmod -R 755 /var/www/html`

### Connection Issues

1. Verify firewall allows traffic on ports 80/443 (frontend) and 3000 (backend)
2. Check CORS settings in backend `.env` (`FRONTEND_URL`)
3. Verify backend is accessible from frontend domain

### Nginx Proxy Issues

If API requests are not reaching the backend:

1. **Check nginx configuration:**
   ```bash
   ssh root@rift.basedboats.com "nginx -t"
   ```

2. **Check nginx error logs:**
   ```bash
   ssh root@rift.basedboats.com "tail -f /var/log/nginx/error.log"
   ```

3. **Verify backend is running:**
   ```bash
   ssh root@rift.basedboats.com "systemctl status rift-backend.service"
   ```

4. **Test backend directly:**
   ```bash
   ssh root@rift.basedboats.com "curl http://localhost:3000/api/health"
   ```

5. **Check nginx access logs:**
   ```bash
   ssh root@rift.basedboats.com "tail -f /var/log/nginx/access.log"
   ```

6. **Verify proxy headers are set correctly** - The nginx config includes:
   - `X-Real-IP` - Client's real IP
   - `X-Forwarded-For` - Proxy chain
   - `X-Forwarded-Proto` - Original protocol (http/https)

