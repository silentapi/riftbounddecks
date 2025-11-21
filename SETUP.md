# Initial Server Setup Guide

This document describes the one-time setup required on the VPS before deploying the application.

## Prerequisites

- Ubuntu/Debian server
- Root SSH access to `root@rift.basedboats.com`
- Domain name configured: `rift.basedboats.com`

## 1. Install Node.js and npm

### Option A: Install via nvm (Recommended)

```bash
ssh root@rift.basedboats.com << 'EOF'
  # Install nvm
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
  source ~/.bashrc
  
  # Install Node.js 18+
  nvm install 18
  nvm use 18
  nvm alias default 18
  
  # Create symlinks for systemd
  ln -sf $(which node) /usr/bin/node
  ln -sf $(which npm) /usr/bin/npm
  
  # Verify installation
  node --version
  npm --version
EOF
```

### Option B: Install via package manager

```bash
ssh root@rift.basedboats.com << 'EOF'
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
  
  # Verify installation
  node --version
  npm --version
EOF
```

## 2. Install MongoDB

```bash
ssh root@rift.basedboats.com << 'EOF'
  # Import MongoDB GPG key
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  
  # Add MongoDB repository
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
  
  # Update and install
  apt-get update
  apt-get install -y mongodb-org
  
  # Start and enable MongoDB
  systemctl start mongod
  systemctl enable mongod
  
  # Verify MongoDB is running
  systemctl status mongod
EOF
```

## 3. Create Directory Structure

```bash
ssh root@rift.basedboats.com << 'EOF'
  mkdir -p /opt/riftbounddecks/backend
  mkdir -p /opt/riftbounddecks/backend_backup
  mkdir -p /var/www/html
EOF
```

## 4. Install and Configure Nginx

### Install Nginx

```bash
ssh root@rift.basedboats.com "apt-get update && apt-get install -y nginx"
```

### Upload Nginx Configuration

```bash
scp scripts/nginx-rift.basedboats.com.conf root@rift.basedboats.com:/etc/nginx/sites-available/rift.basedboats.com
```

### Enable Site and Test

```bash
ssh root@rift.basedboats.com << 'EOF'
  # Enable site
  ln -sf /etc/nginx/sites-available/rift.basedboats.com /etc/nginx/sites-enabled/
  
  # Remove default site if it exists
  rm -f /etc/nginx/sites-enabled/default
  
  # Test configuration
  nginx -t
  
  # Reload nginx
  systemctl reload nginx
EOF
```

### Set Up SSL with Let's Encrypt

```bash
ssh root@rift.basedboats.com << 'EOF'
  # Install certbot
  apt-get install -y certbot python3-certbot-nginx
  
  # Obtain SSL certificate
  certbot --nginx -d rift.basedboats.com
  
  # Certbot will automatically update nginx config
  # Verify auto-renewal is set up
  systemctl status certbot.timer
EOF
```

## 5. Install Systemd Service

### Upload Service File

```bash
scp scripts/rift-backend.service root@rift.basedboats.com:/etc/systemd/system/rift-backend.service
```

### Enable and Start Service

```bash
ssh root@rift.basedboats.com << 'EOF'
  # Reload systemd
  systemctl daemon-reload
  
  # Enable service (will start on boot)
  systemctl enable rift-backend.service
  
  # Note: Don't start yet - we need to deploy the backend first
EOF
```

## 6. Create Backend .env File

```bash
ssh root@rift.basedboats.com << 'EOF'
  cat > /opt/riftbounddecks/backend/.env << 'ENVFILE'
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/riftbound_deckbuilder
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h
LOG_LEVEL=info
LOG_DIR=./logs
FRONTEND_URL=https://rift.basedboats.com
ENVFILE
  
  # Secure the .env file
  chmod 600 /opt/riftbounddecks/backend/.env
  
  echo "Backend .env file created. IMPORTANT: Update JWT_SECRET with a secure random string!"
EOF
```

**Important:** Generate a secure JWT secret:

```bash
# Generate a secure random string
openssl rand -hex 32
```

Then update the `.env` file:

```bash
ssh root@rift.basedboats.com "sed -i 's|JWT_SECRET=.*|JWT_SECRET=YOUR_GENERATED_SECRET_HERE|' /opt/riftbounddecks/backend/.env"
```

## 7. Initialize Master Registration Key

After the first backend deployment, initialize the master registration key:

```bash
ssh root@rift.basedboats.com << 'EOF'
  cd /opt/riftbounddecks/backend
  npm run init-master-key
EOF
```

Save the master key that's printed - you'll need it for the first user registration.

## 8. Verify Setup

### Check Node.js/npm

```bash
ssh root@rift.basedboats.com "node --version && npm --version"
```

### Check MongoDB

```bash
ssh root@rift.basedboats.com "systemctl status mongod"
```

### Check Nginx

```bash
ssh root@rift.basedboats.com "systemctl status nginx && nginx -t"
```

### Check Systemd Service

```bash
ssh root@rift.basedboats.com "systemctl status rift-backend.service"
```

## 9. First Deployment

After completing all setup steps, perform your first deployment:

```bash
# Full deployment (frontend + backend)
./scripts/deploy.sh
```

## Troubleshooting

### Node.js/npm Not Found

If deployment scripts can't find npm:

1. Verify Node.js is installed: `ssh root@rift.basedboats.com "which node && which npm"`
2. If using nvm, ensure symlinks exist: `ssh root@rift.basedboats.com "ln -sf \$(which node) /usr/bin/node && ln -sf \$(which npm) /usr/bin/npm"`

### MongoDB Connection Issues

1. Check MongoDB is running: `ssh root@rift.basedboats.com "systemctl status mongod"`
2. Verify connection string in `.env`: `ssh root@rift.basedboats.com "grep MONGODB_URI /opt/riftbounddecks/backend/.env"`

### CORS Errors

Ensure `FRONTEND_URL` is set correctly in `.env`:

```bash
ssh root@rift.basedboats.com "grep FRONTEND_URL /opt/riftbounddecks/backend/.env"
```

Should show: `FRONTEND_URL=https://rift.basedboats.com`

### Nginx Not Proxying

1. Check nginx config: `ssh root@rift.basedboats.com "nginx -t"`
2. Verify site is enabled: `ssh root@rift.basedboats.com "ls -la /etc/nginx/sites-enabled/"`
3. Check nginx error logs: `ssh root@rift.basedboats.com "tail -f /var/log/nginx/error.log"`

### Service Won't Start

1. Check service status: `ssh root@rift.basedboats.com "systemctl status rift-backend.service"`
2. Check logs: `ssh root@rift.basedboats.com "journalctl -u rift-backend.service -n 50"`
3. Verify `.env` file exists: `ssh root@rift.basedboats.com "test -f /opt/riftbounddecks/backend/.env && echo 'OK' || echo 'MISSING'"`

## Next Steps

After setup is complete, see [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment procedures.

