#!/usr/bin/env pwsh
#Requires -Version 7.0

<#
.SYNOPSIS
    Creates a deployment package for the Inside-Out Monitor dashboard
.DESCRIPTION
    Builds the production React app and packages it for deployment.
.PARAMETER OutputPath
    Directory where the deployment package will be created (default: ../deploy/dashboard)
.PARAMETER ApiUrl
    API server URL (e.g., http://192.168.1.100:3000)
.EXAMPLE
    .\create-deployment.ps1 -ApiUrl "http://192.168.203.241:3000"
#>

param(
    [string]$OutputPath = "../deploy/dashboard",
    [string]$ApiUrl = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Creating Inside-Out Monitor Dashboard Deployment Package..." -ForegroundColor Cyan
Write-Host ""

# Prompt for API URL if not provided
if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
    Write-Host "Enter the API server URL:" -ForegroundColor Yellow
    Write-Host "(Example: http://192.168.1.100:3000)" -ForegroundColor Gray
    $ApiUrl = Read-Host "API URL"

    if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
        Write-Error "API URL is required"
        exit 1
    }
}

Write-Host ""
Write-Host "API URL: $ApiUrl" -ForegroundColor Green
Write-Host ""

# Resolve paths
$dashboardDir = $PSScriptRoot
$outputPath = Join-Path $dashboardDir $OutputPath

# Convert to absolute path
if ([System.IO.Path]::IsPathRooted($outputPath)) {
    $outputDir = $outputPath
} else {
    $outputDir = [System.IO.Path]::GetFullPath($outputPath)
}

# Check if node_modules exists
$nodeModules = Join-Path $dashboardDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    Push-Location $dashboardDir
    npm install
    Pop-Location
    Write-Host ""
}

# Update API URL in api.js for production build
Write-Host "Configuring API URL for production..." -ForegroundColor Cyan
$apiJsPath = Join-Path $dashboardDir "src\api.js"
$apiJsContent = Get-Content $apiJsPath -Raw
$apiJsBackup = $apiJsContent

# Update the production API URL
$apiJsContent = $apiJsContent -replace "http://.*:3000/api", "$ApiUrl/api"
$apiJsContent | Set-Content $apiJsPath -NoNewline

Write-Host "  ✓ API URL configured: $ApiUrl/api" -ForegroundColor Green
Write-Host ""

try {
    # Build the production app
    Write-Host "Building production React app..." -ForegroundColor Cyan
    Write-Host ""
    Push-Location $dashboardDir
    npm run build
    Pop-Location
    Write-Host ""
    Write-Host "✓ Build completed successfully!" -ForegroundColor Green
    Write-Host ""

    # Create output directory
    if (Test-Path $outputDir) {
        Write-Host "⚠ Output directory already exists. Cleaning..." -ForegroundColor Yellow
        Remove-Item -Path $outputDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Write-Host "✓ Created output directory: $outputDir" -ForegroundColor Green
    Write-Host ""

    # Copy dist folder
    Write-Host "Copying built files..." -ForegroundColor Cyan
    $distDir = Join-Path $dashboardDir "dist"
    Copy-Item -Path "$distDir\*" -Destination $outputDir -Recurse -Force
    Write-Host "  ✓ Dashboard files copied" -ForegroundColor Green

} finally {
    # Restore original api.js
    $apiJsBackup | Set-Content $apiJsPath -NoNewline
}

# Create deployment README
Write-Host ""
Write-Host "Creating deployment README..." -ForegroundColor Cyan

$readmeContent = @"
# Inside-Out Monitor Dashboard - Deployment Package

This is a production-ready build of the Inside-Out Monitor dashboard.

**Configured API URL:** $ApiUrl/api

## Deployment Options

### Option 1: Static File Server (Simplest)

Use any static file server to serve the contents of this directory.

**Using Node.js serve:**
``````bash
# Install serve globally
npm install -g serve

# Serve the dashboard
cd $outputDir
serve -s . -p 5000
``````

Access at: http://localhost:5000

**Using Python:**
``````bash
cd $outputDir
python -m http.server 5000
``````

### Option 2: Nginx

``````nginx
server {
    listen 80;
    server_name monitor.example.com;

    root $outputDir;
    index index.html;

    location / {
        try_files `$uri `$uri/ /index.html;
    }

    # Optional: Proxy API requests through nginx
    location /api/ {
        proxy_pass $ApiUrl/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade `$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host `$host;
        proxy_cache_bypass `$http_upgrade;
    }
}
``````

### Option 3: Apache

``````apache
<VirtualHost *:80>
    ServerName monitor.example.com
    DocumentRoot $outputDir

    <Directory $outputDir>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # Enable React Router
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html`$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
</VirtualHost>
``````

### Option 4: Docker

Create a `Dockerfile`:

``````dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html

# Configure nginx for React Router
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files `$uri `$uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
``````

Build and run:
``````bash
docker build -t inside-out-dashboard .
docker run -d -p 5000:80 inside-out-dashboard
``````

### Option 5: Windows IIS

1. Open IIS Manager
2. Create new website pointing to: $outputDir
3. Install URL Rewrite module
4. Add web.config:

``````xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <rule name="React Routes" stopProcessing="true">
                    <match url=".*" />
                    <conditions logicalGrouping="MatchAll">
                        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                    </conditions>
                    <action type="Rewrite" url="/" />
                </rule>
            </rules>
        </rewrite>
    </system.webServer>
</configuration>
``````

## Updating the API URL

If you need to change the API URL after deployment, you have two options:

**Option A: Rebuild with new URL**
``````powershell
cd dashboard
.\create-deployment.ps1 -ApiUrl "http://new-server:3000"
``````

**Option B: Edit the built file**
Edit `assets/index-*.js` and search for the old API URL, replace with new URL.

## Firewall Configuration

Ensure the API server ($ApiUrl) is accessible from wherever the dashboard is hosted.

If hosting the dashboard on the same server as the API, no additional firewall rules are needed beyond what's configured for the API (port 3000).

## Security Considerations

- Serve over HTTPS in production (use Let's Encrypt with nginx/Apache)
- Configure CORS on the API server to only allow your dashboard domain
- Consider using a reverse proxy (nginx) to avoid CORS issues
- Set appropriate cache headers for static assets

## File Structure

``````
dashboard/
├── index.html              # Main HTML file
├── assets/
│   ├── index-*.js         # React app bundle
│   └── index-*.css        # Styles
└── vite.svg               # Favicon
``````

## Troubleshooting

### Dashboard loads but shows errors
- Check browser console for errors
- Verify API URL is correct: $ApiUrl/api
- Ensure API server is running and accessible
- Check CORS settings on API server

### 404 on page refresh
- Configure your web server to redirect all routes to index.html
- See deployment option instructions above

### Blank page
- Check browser console for errors
- Verify all files copied correctly
- Check web server has permission to read files
"@

$readmeContent | Set-Content (Join-Path $outputDir "DEPLOY.md")
Write-Host "  ✓ DEPLOY.md created" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Deployment package created successfully!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Location: $outputDir" -ForegroundColor White
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  API URL: $ApiUrl/api" -ForegroundColor White
Write-Host ""
Write-Host "Quick Test:" -ForegroundColor Yellow
Write-Host "  npm install -g serve"
Write-Host "  cd $outputDir"
Write-Host "  serve -s . -p 5000"
Write-Host ""
Write-Host "See $outputDir\DEPLOY.md for all deployment options" -ForegroundColor Cyan
Write-Host ""
