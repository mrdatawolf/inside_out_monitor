#!/usr/bin/env pwsh
#Requires -Version 7.0

<#
.SYNOPSIS
    Creates a deployment package for the Inside-Out Monitor client
.DESCRIPTION
    Packages only the necessary production files for deployment to remote devices.
    Excludes test files, dev dependencies, and build artifacts.
.PARAMETER OutputPath
    Directory where the deployment package will be created (default: ../deploy/client)
.EXAMPLE
    .\create-deployment.ps1
.EXAMPLE
    .\create-deployment.ps1 -OutputPath "C:\deployments\monitor-client"
#>

param(
    [string]$OutputPath = "../deploy/client",
    [string]$ServerHost = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Creating Inside-Out Monitor Client Deployment Package..." -ForegroundColor Cyan
Write-Host ""

# Prompt for server IP if not provided
if ([string]::IsNullOrWhiteSpace($ServerHost)) {
    Write-Host "Enter the monitor server IP address or hostname:" -ForegroundColor Yellow
    Write-Host "(This will be set as the default in client scripts)" -ForegroundColor Gray
    $ServerHost = Read-Host "Server host"

    if ([string]::IsNullOrWhiteSpace($ServerHost)) {
        Write-Host "⚠ No server host provided. Using '127.0.0.1' (localhost)" -ForegroundColor Yellow
        $ServerHost = "127.0.0.1"
    }
}

Write-Host ""
Write-Host "Server host: $ServerHost" -ForegroundColor Green
Write-Host ""

# Resolve paths
$clientDir = $PSScriptRoot
$outputPath = Join-Path $clientDir $OutputPath

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
    "client.js",
    "network-stats.js",
    "send-heartbeat.ps1",
    "send-heartbeat.sh",
    "package.json"
)

# Copy production files
Write-Host ""
Write-Host "Copying production files..." -ForegroundColor Cyan

foreach ($file in $filesToCopy) {
    $source = Join-Path $clientDir $file
    $dest = Join-Path $outputDir $file

    if (Test-Path $source) {
        # Special handling for script files - update default server host
        if ($file -eq "send-heartbeat.ps1") {
            $content = Get-Content $source -Raw
            $content = $content -replace 'ServerHost = "127\.0\.0\.1"', "ServerHost = `"$ServerHost`""
            $content | Set-Content $dest -NoNewline
            Write-Host "  ✓ $file (configured with server: $ServerHost)" -ForegroundColor Green
        }
        elseif ($file -eq "send-heartbeat.sh") {
            $content = Get-Content $source -Raw
            $content = $content -replace 'SERVER_HOST="\$\{2:-127\.0\.0\.1\}"', "SERVER_HOST=`"`${2:-$ServerHost}`""
            $content | Set-Content $dest -NoNewline
            Write-Host "  ✓ $file (configured with server: $ServerHost)" -ForegroundColor Green
        }
        else {
            Copy-Item -Path $source -Destination $dest -Force
            Write-Host "  ✓ $file" -ForegroundColor Green
        }
    } else {
        Write-Host "  ⚠ $file (not found, skipping)" -ForegroundColor Yellow
    }
}

# Create a production package.json (without devDependencies)
Write-Host ""
Write-Host "Creating production package.json..." -ForegroundColor Cyan

$packageJson = Get-Content (Join-Path $clientDir "package.json") | ConvertFrom-Json

# Remove devDependencies
if ($packageJson.PSObject.Properties.Name -contains 'devDependencies') {
    $packageJson.PSObject.Properties.Remove('devDependencies')
}

# Remove test scripts
if ($packageJson.scripts) {
    $packageJson.scripts.PSObject.Properties.Remove('test')
    $packageJson.scripts.PSObject.Properties.Remove('test:watch')
    $packageJson.scripts.PSObject.Properties.Remove('test:coverage')
}

$packageJson | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $outputDir "package.json")
Write-Host "  ✓ Production package.json created" -ForegroundColor Green

# Create deployment README
Write-Host ""
Write-Host "Creating deployment README..." -ForegroundColor Cyan

$readmeContent = @"
# Inside-Out Monitor Client - Deployment Package

This is a production-ready deployment package for the Inside-Out Monitor client.

## Quick Setup

### 1. Copy secret.key

Copy the \`secret.key\` file from your server to this directory:

\`\`\`bash
# The secret.key should be copied from: server/secret.key
\`\`\`

**IMPORTANT**: Each client device must have the same \`secret.key\` as the server.

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

This installs only production dependencies (tweetnacl, tweetnacl-util).

### 3. Test the Client

#### Windows (PowerShell):
\`\`\`powershell
.\send-heartbeat.ps1 -ServerHost "your-server-ip" -ServerPort 4000
\`\`\`

#### Linux/macOS (Bash):
\`\`\`bash
chmod +x send-heartbeat.sh
./send-heartbeat.sh "my-device-name" "your-server-ip" 4000
\`\`\`

### 4. Configure Environment Variables (Optional)

Instead of passing arguments every time, set environment variables:

#### Windows:
\`\`\`powershell
`$env:MONITOR_DEVICE_NAME = "`$env:COMPUTERNAME"
`$env:MONITOR_HOST = "your-server-ip"
`$env:MONITOR_PORT = "4000"
\`\`\`

#### Linux/macOS:
\`\`\`bash
export MONITOR_DEVICE_NAME="`$(hostname)"
export MONITOR_HOST="your-server-ip"
export MONITOR_PORT="4000"
\`\`\`

## Automation

### Windows (Task Scheduler)
\`\`\`powershell
`$action = New-ScheduledTaskAction -Execute "pwsh" -Argument "-File C:\path\to\send-heartbeat.ps1"
`$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "MonitorHeartbeat" -Action `$action -Trigger `$trigger
\`\`\`

### Linux (Cron)
\`\`\`bash
# Edit crontab
crontab -e

# Add this line (runs every 5 minutes)
*/5 * * * * cd /path/to/client && ./send-heartbeat.sh >> /var/log/monitor-heartbeat.log 2>&1
\`\`\`

### macOS (launchd)
Create \`~/Library/LaunchAgents/com.monitor.heartbeat.plist\`:
\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.monitor.heartbeat</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/send-heartbeat.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
</dict>
</plist>
\`\`\`

Then load it:
\`\`\`bash
launchctl load ~/Library/LaunchAgents/com.monitor.heartbeat.plist
\`\`\`

## File Structure

\`\`\`
client/
├── client.js              # Main client code
├── network-stats.js       # Network interface collection
├── send-heartbeat.ps1     # Windows wrapper script
├── send-heartbeat.sh      # Linux/macOS wrapper script
├── secret.key             # Pre-shared key (COPY FROM SERVER)
├── package.json           # Production dependencies only
└── node_modules/          # Install with 'npm install'
\`\`\`

## Troubleshooting

### "Failed to load secret.key"
- Ensure \`secret.key\` exists in this directory
- Copy it from \`server/secret.key\` on your monitor server

### "Failed to decrypt message" (on server)
- Ensure \`secret.key\` is identical on client and server
- Check for extra whitespace or line endings

### "Connection refused"
- Verify the server is running and listening on port 4000
- Check firewall allows UDP traffic on port 4000
- Verify \`ServerHost\` IP address is correct

### No network interfaces reported
- The client filters out loopback (127.x.x.x) and APIPA (169.254.x.x) addresses
- Ensure the device has at least one valid network interface with an IP

## Security Notes

- **Keep \`secret.key\` secure** - it authenticates all clients
- Use the same key across all trusted clients
- If compromised, generate a new key on the server and redistribute
- Transmitted data is encrypted with XSalsa20-Poly1305
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
PLACEHOLDER - COPY ACTUAL KEY FROM SERVER

To complete deployment:
1. Copy server/secret.key from your monitor server
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
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Server host: $ServerHost (pre-configured in scripts)" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy server/secret.key to: $outputDir\secret.key"
Write-Host "  2. Distribute the entire folder to target devices"
Write-Host "  3. On each device, run: npm install"
Write-Host "  4. Test with: .\send-heartbeat.ps1 (server IP already set!)"
Write-Host ""
Write-Host "See $outputDir\DEPLOY.md for detailed instructions" -ForegroundColor Cyan
Write-Host ""
