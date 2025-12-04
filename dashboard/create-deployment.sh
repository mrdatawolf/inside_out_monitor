#!/bin/bash

#
# Creates a deployment package for the Inside-Out Monitor dashboard
# Builds the production React app and packages it for deployment.
#

set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parameters
OUTPUT_PATH="${1:-../deploy/dashboard}"
API_URL="${2:-}"

echo -e "${CYAN}Creating Inside-Out Monitor Dashboard Deployment Package...${NC}"
echo ""

# Prompt for API URL if not provided
if [ -z "$API_URL" ]; then
    echo -e "${YELLOW}Enter the API server URL:${NC}"
    echo -e "${NC}(Example: http://192.168.1.100:3000)${NC}"
    read -p "API URL: " API_URL

    if [ -z "$API_URL" ]; then
        echo -e "${RED}ERROR: API URL is required${NC}" >&2
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}API URL: $API_URL${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OUTPUT_DIR="$(cd "$(dirname "$OUTPUT_PATH")" 2>/dev/null && pwd)/$(basename "$OUTPUT_PATH")" || OUTPUT_DIR="$SCRIPT_DIR/$OUTPUT_PATH"

# Check if node_modules exists
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo -e "${CYAN}Installing dependencies...${NC}"
    cd "$SCRIPT_DIR"
    npm install
    echo ""
fi

# Update API URL in api.js for production build
echo -e "${CYAN}Configuring API URL for production...${NC}"
API_JS_PATH="$SCRIPT_DIR/src/api.js"
cp "$API_JS_PATH" "$API_JS_PATH.backup"

# Update the production API URL (works with both GNU sed and BSD sed)
if sed --version 2>&1 | grep -q GNU; then
    # GNU sed (Linux)
    sed -i "s|http://[^:]*:[0-9]*/api|$API_URL/api|g" "$API_JS_PATH"
else
    # BSD sed (macOS)
    sed -i '' "s|http://[^:]*:[0-9]*/api|$API_URL/api|g" "$API_JS_PATH"
fi

echo -e "${GREEN}  ✓ API URL configured: $API_URL/api${NC}"
echo ""

# Build the production app
echo -e "${CYAN}Building production React app...${NC}"
echo ""

cleanup() {
    # Restore original api.js
    if [ -f "$API_JS_PATH.backup" ]; then
        mv "$API_JS_PATH.backup" "$API_JS_PATH"
    fi
}

trap cleanup EXIT

cd "$SCRIPT_DIR"
npm run build

echo ""
echo -e "${GREEN}✓ Build completed successfully!${NC}"
echo ""

# Create output directory
if [ -d "$OUTPUT_DIR" ]; then
    echo -e "${YELLOW}⚠ Output directory already exists. Cleaning...${NC}"
    rm -rf "$OUTPUT_DIR"
fi

mkdir -p "$OUTPUT_DIR"
echo -e "${GREEN}✓ Created output directory: $OUTPUT_DIR${NC}"
echo ""

# Copy dist folder
echo -e "${CYAN}Copying built files...${NC}"
cp -r "$SCRIPT_DIR/dist/"* "$OUTPUT_DIR/"
echo -e "${GREEN}  ✓ Dashboard files copied${NC}"

# Create deployment README
echo ""
echo -e "${CYAN}Creating deployment README...${NC}"

cat > "$OUTPUT_DIR/DEPLOY.md" << EOF
# Inside-Out Monitor Dashboard - Deployment Package

This is a production-ready build of the Inside-Out Monitor dashboard.

**Configured API URL:** $API_URL/api

## Deployment Options

### Option 1: Static File Server (Simplest)

Use any static file server to serve the contents of this directory.

**Using Node.js serve:**
\`\`\`bash
# Install serve globally
npm install -g serve

# Serve the dashboard
cd $OUTPUT_DIR
serve -s . -p 5000
\`\`\`

Access at: http://localhost:5000

**Using Python:**
\`\`\`bash
cd $OUTPUT_DIR
python -m http.server 5000
\`\`\`

### Option 2: Nginx

\`\`\`nginx
server {
    listen 80;
    server_name monitor.example.com;

    root $OUTPUT_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Optional: Proxy API requests through nginx
    location /api/ {
        proxy_pass $API_URL/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
\`\`\`

### Option 3: Apache

\`\`\`apache
<VirtualHost *:80>
    ServerName monitor.example.com
    DocumentRoot $OUTPUT_DIR

    <Directory $OUTPUT_DIR>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # Enable React Router
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
</VirtualHost>
\`\`\`

### Option 4: Docker

Create a \`Dockerfile\`:

\`\`\`dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html

# Configure nginx for React Router
RUN echo 'server { \\
    listen 80; \\
    location / { \\
        root /usr/share/nginx/html; \\
        index index.html; \\
        try_files \$uri \$uri/ /index.html; \\
    } \\
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
\`\`\`

Build and run:
\`\`\`bash
docker build -t inside-out-dashboard .
docker run -d -p 5000:80 inside-out-dashboard
\`\`\`

## Updating the API URL

If you need to change the API URL after deployment, you have two options:

**Option A: Rebuild with new URL**
\`\`\`bash
cd dashboard
./create-deployment.sh ../deploy/dashboard http://new-server:3000
\`\`\`

**Option B: Edit the built file**
Edit \`assets/index-*.js\` and search for the old API URL, replace with new URL.

## Firewall Configuration

Ensure the API server ($API_URL) is accessible from wherever the dashboard is hosted.

If hosting the dashboard on the same server as the API, no additional firewall rules are needed beyond what's configured for the API (port 3000).

## Security Considerations

- Serve over HTTPS in production (use Let's Encrypt with nginx/Apache)
- Configure CORS on the API server to only allow your dashboard domain
- Consider using a reverse proxy (nginx) to avoid CORS issues
- Set appropriate cache headers for static assets

## File Structure

\`\`\`
dashboard/
├── index.html              # Main HTML file
├── assets/
│   ├── index-*.js         # React app bundle
│   └── index-*.css        # Styles
└── vite.svg               # Favicon
\`\`\`

## Troubleshooting

### Dashboard loads but shows errors
- Check browser console for errors
- Verify API URL is correct: $API_URL/api
- Ensure API server is running and accessible
- Check CORS settings on API server

### 404 on page refresh
- Configure your web server to redirect all routes to index.html
- See deployment option instructions above

### Blank page
- Check browser console for errors
- Verify all files copied correctly
- Check web server has permission to read files
EOF

echo -e "${GREEN}  ✓ DEPLOY.md created${NC}"

# Summary
echo ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${GREEN}Deployment package created successfully!${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""
echo -e "Location: ${OUTPUT_DIR}"
echo ""
echo -e "${CYAN}Configuration:${NC}"
echo -e "  API URL: $API_URL/api"
echo ""
echo -e "${YELLOW}Quick Test:${NC}"
echo "  npm install -g serve"
echo "  cd $OUTPUT_DIR"
echo "  serve -s . -p 5000"
echo ""
echo -e "${CYAN}See $OUTPUT_DIR/DEPLOY.md for all deployment options${NC}"
echo ""
