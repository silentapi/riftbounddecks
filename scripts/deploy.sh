#!/bin/bash

# Full deployment script for Riftbound Deckbuilder
# Deploys both frontend and backend to the VPS

set -e  # Exit on error

# Configuration
SERVER="root@rift.basedboats.com"
FRONTEND_DEST="/var/www/html"
BACKEND_DEST="/opt/riftbounddecks"
SERVICE_NAME="rift-backend.service"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Riftbound Deckbuilder Deployment ===${NC}\n"

# Function to print step
print_step() {
    echo -e "${YELLOW}[STEP]${NC} $1"
}

# Function to print success
print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1\n"
}

# Function to print error
print_error() {
    echo -e "${RED}[ERROR]${NC} $1\n"
    exit 1
}

# Check if we're in the project root
if [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    print_error "Please run this script from the project root directory"
fi

# ============================================
# FRONTEND DEPLOYMENT
# ============================================
print_step "Deploying Frontend..."

cd frontend

# Clean and build for production
# Uses build:prod which sets VITE_ENVIRONMENT=prod for production optimizations
print_step "Building frontend for production..."
rm -rf dist/
if ! npm run build:prod; then
    print_error "Frontend build failed"
fi

# Create zip
print_step "Creating frontend package..."
cd dist
if ! zip -r html.zip . > /dev/null; then
    print_error "Failed to create frontend zip"
fi

# Upload and deploy
print_step "Uploading frontend to server..."
if ! scp html.zip "${SERVER}:${FRONTEND_DEST}/"; then
    print_error "Failed to upload frontend"
fi

print_step "Extracting frontend on server..."
ssh "${SERVER}" << EOF
    cd ${FRONTEND_DEST}
    find . -mindepth 1 ! -name 'html.zip' -exec rm -rf {} + 2>/dev/null || true
    unzip -o html.zip > /dev/null
    rm html.zip
EOF

# Cleanup local zip
rm html.zip
cd ../..

print_success "Frontend deployed successfully"

# ============================================
# BACKEND DEPLOYMENT
# ============================================
print_step "Deploying Backend..."

cd backend

# Create zip (excluding node_modules, .env, logs)
print_step "Creating backend package..."
if ! zip -r ../backend.zip . \
    -x "node_modules/*" \
    -x ".env" \
    -x "logs/*" \
    -x "*.log" \
    -x ".DS_Store" \
    -x ".git/*" \
    > /dev/null; then
    print_error "Failed to create backend zip"
fi

cd ..

# Upload backend zip
print_step "Uploading backend to server..."
if ! scp backend.zip "${SERVER}:${BACKEND_DEST}/"; then
    print_error "Failed to upload backend"
fi

# Deploy backend via SSH
print_step "Deploying backend on server..."
ssh "${SERVER}" bash << EOF
    set -e
    
    SERVICE_NAME="${SERVICE_NAME}"
    BACKEND_DEST="${BACKEND_DEST}"
    
    # Find npm - try multiple methods
    NPM_CMD=""
    
    # Try sourcing nvm if it exists
    if [ -s "\$HOME/.nvm/nvm.sh" ]; then
        source "\$HOME/.nvm/nvm.sh"
        NPM_CMD=\$(command -v npm)
    fi
    
    # If still not found, try common locations
    if [ -z "\$NPM_CMD" ]; then
        if [ -f "/usr/bin/npm" ]; then
            NPM_CMD="/usr/bin/npm"
        elif [ -f "/usr/local/bin/npm" ]; then
            NPM_CMD="/usr/local/bin/npm"
        elif command -v npm > /dev/null 2>&1; then
            NPM_CMD=\$(command -v npm)
        fi
    fi
    
    # If still not found, try sourcing bash profile
    if [ -z "\$NPM_CMD" ]; then
        if [ -f "\$HOME/.bashrc" ]; then
            source "\$HOME/.bashrc" > /dev/null 2>&1
            NPM_CMD=\$(command -v npm 2>/dev/null || echo "")
        fi
    fi
    
    if [ -z "\$NPM_CMD" ]; then
        echo "ERROR: npm not found! Please install Node.js and npm on the server."
        echo "Tried: nvm, /usr/bin/npm, /usr/local/bin/npm, PATH lookup"
        exit 1
    fi
    
    echo "Using npm: \$NPM_CMD"
    echo "npm version: \$(\$NPM_CMD --version)"
    
    echo "Stopping \${SERVICE_NAME}..."
    systemctl stop \${SERVICE_NAME} || true
    
    echo "Cleaning backup directory..."
    rm -rf \${BACKEND_DEST}/backend_backup/*
    
    echo "Backing up current deployment (preserving .env and logs)..."
    if [ -d "\${BACKEND_DEST}/backend" ]; then
        # Move everything except .env and logs to backup
        cd \${BACKEND_DEST}/backend
        find . -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'logs' ! -name 'node_modules' -exec mv {} \${BACKEND_DEST}/backend_backup/ \; 2>/dev/null || true
    fi
    
    echo "Extracting new backend..."
    mkdir -p \${BACKEND_DEST}/backend
    cd \${BACKEND_DEST}
    if [ ! -f "backend.zip" ]; then
        echo "ERROR: backend.zip not found in \${BACKEND_DEST}"
        exit 1
    fi
    # Extract to backend directory (preserves existing .env and logs)
    unzip -o backend.zip -d backend > /dev/null
    
    # Ensure logs directory exists (in case it was deleted)
    mkdir -p \${BACKEND_DEST}/backend/logs
    
    echo "Installing dependencies..."
    cd \${BACKEND_DEST}/backend
    if ! \$NPM_CMD install --production; then
        echo "Production install failed, trying full install..."
        \$NPM_CMD install
    fi
    
    # Verify node_modules exists
    if [ ! -d "node_modules" ]; then
        echo "ERROR: node_modules directory not found after npm install!"
        exit 1
    fi
    
    # Verify express is installed
    if [ ! -d "node_modules/express" ]; then
        echo "ERROR: express package not found in node_modules!"
        exit 1
    fi
    
    echo "Dependencies installed successfully"
    
    echo "Starting \${SERVICE_NAME}..."
    systemctl start \${SERVICE_NAME}
    
    echo "Checking service status..."
    sleep 2
    systemctl status \${SERVICE_NAME} --no-pager -l || true
EOF

# Cleanup local zip
rm backend.zip

print_success "Backend deployed successfully"

# ============================================
# VERIFICATION
# ============================================
print_step "Verifying deployment..."

echo -e "\n${GREEN}=== Deployment Complete ===${NC}"
echo -e "Frontend: ${FRONTEND_DEST}"
echo -e "Backend: ${BACKEND_DEST}/backend"
echo -e "\nTo check backend status:"
echo -e "  ssh ${SERVER} 'systemctl status ${SERVICE_NAME}'"
echo -e "\nTo view backend logs:"
echo -e "  ssh ${SERVER} 'journalctl -u ${SERVICE_NAME} -f'"

