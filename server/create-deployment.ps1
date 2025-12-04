#!/usr/bin/env pwsh
#Requires -Version 7.0

<#
.SYNOPSIS
    Creates a deployment package for the Inside-Out Monitor server
.DESCRIPTION
    Packages only the necessary production files for deployment to the server host.
.PARAMETER OutputPath
    Directory where the deployment package will be created (default: ../deploy/server)
.EXAMPLE
    .\create-deployment.ps1
.EXAMPLE
    .\create-deployment.ps1 -OutputPath "C:\deployments\monitor-server"
#>

param(
    [string]$OutputPath = "../deploy/server"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating Inside-Out Monitor Server Deployment Package..." -ForegroundColor Cyan
Write-Host ""

# Resolve paths
$serverDir = $PSScriptRoot
$outputPath = Join-Path $serverDir $OutputPath

# Convert to absolute path
if ([System.IO.Path]::IsPathRooted($outputPath)) {
    $outputDir = $outputPath
} else {
    $outputDir = [System.IO.Path]::GetFullPath($outputPath)
}

# Create output directory
if (Test-Path $outputDir) {
    Write-Host "⚠ Output directory already exists. Cleaning..." -ForegroundColor Yellow
    Remove-Item -Path $outputDir -Recurse -Force
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Write-Host "✓ Created output directory: $outputDir" -ForegroundColor Green

# Files to include
$filesToCopy = @(
    "server.js",
    "api.js",
    "db.js",
    "encryption.js",
    "validation.js",
    "package.json"
)

# Copy production files
Write-Host ""
Write-Host "Copying production files..." -ForegroundColor Cyan

foreach ($file in $filesToCopy) {
    $source = Join-Path $serverDir $file
    $dest = Join-Path $outputDir $file

    if (Test-Path $source) {
        Copy-Item -Path $source -Destination $dest -Force
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ $file (not found, skipping)" -ForegroundColor Yellow
    }
}

# Create a production package.json (without devDependencies)
Write-Host ""
Write-Host "Creating production package.json..." -ForegroundColor Cyan

$packageJson = Get-Content (Join-Path $serverDir "package.json") | ConvertFrom-Json

# Remove devDependencies
if ($packageJson.PSObject.Properties.Name -contains 'devDependencies') {
    $packageJson.PSObject.Properties.Remove('devDependencies')
}

# Remove test scripts
if ($packageJson.scripts) {
    $packageJson.scripts.PSObject.Properties.Remove('test')
    $packageJson.scripts.PSObject.Properties.Remove('test:watch')
    $packageJson.scripts.PSObject.Properties.Remove('test:coverage')
    $packageJson.scripts.PSObject.Properties.Remove('keygen')
}

$packageJson | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $outputDir "package.json")
Write-Host "  ✓ Production package.json created" -ForegroundColor Green

# Create deployment README
Write-Host ""
Write-Host "Creating deployment README..." -ForegroundColor Cyan

$readmeContent = @"
# Inside-Out Monitor Server - Deployment Package

This is a production-ready deployment package for the Inside-Out Monitor server.

## Quick Setup

### 1. Generate or Copy secret.key

**Option A: Generate new key (for fresh installation)**
``````powershell
# Install dependencies first
npm install

# Generate a new key
node -e "const nacl = require('tweetnacl'); const util = require('tweetnacl-util'); const key = nacl.randomBytes(32); require('fs').writeFileSync('secret.key', util.encodeBase64(key));"
``````

**Option B: Copy existing key (if you have clients already)**
``````bash
# Copy from your existing server
# The secret.key must be identical on all clients and the server
``````

### 2. Install Dependencies

``````bash
npm install
``````

This installs only production dependencies (sql.js, tweetnacl, express, cors).

### 3. Start the Server

``````bash
npm start
``````

The server will:
- Listen for UDP heartbeats on port **4000**
- Serve REST API on port **3000**
- Create a `databases/` directory and `heartbeats.sqlite3` file automatically

### 4. Configure Firewall

Ensure the following ports are open:
- **UDP 4000** - For incoming heartbeat messages
- **TCP 3000** - For API access (if using dashboard)

**Windows:**
``````powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "Inside-Out Monitor UDP" ``
    -Direction Inbound ``
    -Protocol UDP ``
    -LocalPort 4000 ``
    -Action Allow

New-NetFirewallRule -DisplayName "Inside-Out Monitor API" ``
    -Direction Inbound ``
    -Protocol TCP ``
    -LocalPort 3000 ``
    -Action Allow
``````

**Linux:**
``````bash
sudo ufw allow 4000/udp
sudo ufw allow 3000/tcp
``````

## Automation

### Windows (Task Scheduler - Run at Startup)

``````powershell
# Run as Administrator
`$action = New-ScheduledTaskAction -Execute "node" ``
    -Argument "server.js" ``
    -WorkingDirectory "$outputDir"

`$trigger = New-ScheduledTaskTrigger -AtStartup

`$settings = New-ScheduledTaskSettingsSet ``
    -AllowStartIfOnBatteries ``
    -DontStopIfGoingOnBatteries ``
    -RestartCount 3 ``
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "Inside-Out Monitor Server" ``
    -Action `$action ``
    -Trigger `$trigger ``
    -Settings `$settings ``
    -User "SYSTEM" ``
    -RunLevel Highest
``````

### Linux (systemd service)

Create `/etc/systemd/system/inside-out-monitor.service`:

``````ini
[Unit]
Description=Inside-Out Monitor Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=$outputDir
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
``````

Then enable:
``````bash
sudo systemctl enable inside-out-monitor
sudo systemctl start inside-out-monitor
sudo systemctl status inside-out-monitor
``````

## File Structure

``````
server/
├── server.js              # Main UDP server
├── api.js                 # REST API server
├── db.js                  # Database management
├── encryption.js          # Message encryption/decryption
├── validation.js          # Message validation
├── secret.key             # Pre-shared key (GENERATE THIS!)
├── package.json           # Production dependencies only
├── databases/             # Created automatically
│   └── heartbeats.sqlite3
└── node_modules/          # Install with 'npm install'
``````

## Configuration

Edit **server.js** to change settings:

``````javascript
const PORT = 4000;              // UDP listen port
const MAX_MESSAGE_AGE = 300;    // Max age in seconds (5 minutes)
``````

Edit **api.js** to change API settings:

``````javascript
const API_PORT = 3000;          // HTTP API port
``````

## Troubleshooting

### "Failed to load secret.key"
- Generate a new key using the command in step 1
- Or copy from an existing server installation

### "Port already in use"
- Check if another instance is running: ``ps aux | grep node``
- Stop the other instance or change the port

### "Permission denied" on Linux
- Ports below 1024 require root privileges
- Use ports 4000 and 3000 (default) which don't require root
- Or use `setcap` to allow Node.js to bind to privileged ports

### Database errors
- Ensure the `databases/` directory is writable
- Check disk space

## Security Notes

- **Keep `secret.key` secure** - it authenticates all clients
- Use the same key across all trusted clients
- If compromised, generate a new key and redistribute to all clients
- Transmitted data is encrypted with XSalsa20-Poly1305
- Consider running the server behind a firewall
- Only expose ports 4000 (UDP) and 3000 (TCP) if needed
"@

$readmeContent | Set-Content (Join-Path $outputDir "DEPLOY.md")
Write-Host "  ✓ DEPLOY.md created" -ForegroundColor Green

# Create .npmrc to ensure production install
Write-Host ""
Write-Host "Creating .npmrc..." -ForegroundColor Cyan

$npmrcContent = @"
# Production dependencies only
production=true
"@

$npmrcContent | Set-Content (Join-Path $outputDir ".npmrc")
Write-Host "  ✓ .npmrc created" -ForegroundColor Green

# Create a note about secret.key
Write-Host ""
Write-Host "Creating secret.key placeholder..." -ForegroundColor Cyan

$keyPlaceholder = @"
PLACEHOLDER - GENERATE OR COPY ACTUAL KEY

To complete deployment:

Option A - Generate new key:
1. Run: npm install
2. Run: node -e "const nacl = require('tweetnacl'); const util = require('tweetnacl-util'); const key = nacl.randomBytes(32); require('fs').writeFileSync('secret.key', util.encodeBase64(key));"

Option B - Copy existing key:
1. Copy secret.key from your existing server
2. Replace this file with the actual secret.key
3. The key must be identical on all clients and the server
"@

$keyPlaceholder | Set-Content (Join-Path $outputDir "secret.key.PLACEHOLDER")
Write-Host "  ✓ secret.key.PLACEHOLDER created" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Deployment package created successfully!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Location: $outputDir" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy the entire folder to your server"
Write-Host "  2. Generate or copy secret.key (see DEPLOY.md)"
Write-Host "  3. Run: npm install"
Write-Host "  4. Run: npm start"
Write-Host "  5. Configure firewall for UDP 4000 and TCP 3000"
Write-Host ""
Write-Host "See $outputDir\DEPLOY.md for detailed instructions" -ForegroundColor Cyan
Write-Host ""
