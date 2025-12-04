#!/usr/bin/env pwsh
#Requires -Version 7.0

<#
.SYNOPSIS
    Sends encrypted heartbeat to Inside-Out Monitor server
.DESCRIPTION
    This script sends a device heartbeat to the monitoring server using
    encrypted UDP packets with libsodium (via TweetNaCl).
.PARAMETER DeviceName
    Name to identify this device (default: hostname)
.PARAMETER ServerHost
    Monitor server hostname or IP
.PARAMETER ServerPort
    Monitor server UDP port (default: 4000)
.PARAMETER Interval
    If specified, run continuously sending heartbeats every N seconds (default: 0 = run once)
.EXAMPLE
    .\send-heartbeat.ps1 -DeviceName "web-server-01" -ServerHost "monitor.example.com"
.EXAMPLE
    .\send-heartbeat.ps1 -ServerHost "192.168.1.100" -Interval 60
#>

param(
    [string]$DeviceName = $env:COMPUTERNAME,
    [string]$ServerHost = "127.0.0.1",
    [int]$ServerPort = 4000,
    [int]$Interval = 0
)

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check PowerShell version
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host "ERROR: This script requires PowerShell 7 or later" -ForegroundColor Red
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "You are running: PowerShell $($PSVersionTable.PSVersion)" -ForegroundColor Yellow
    Write-Host "You need: PowerShell 7.0 or later" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install PowerShell 7+:" -ForegroundColor Cyan
    Write-Host "  winget install Microsoft.PowerShell" -ForegroundColor White
    Write-Host ""
    Write-Host "After installation, run this script using:" -ForegroundColor Cyan
    Write-Host "  pwsh $($MyInvocation.MyCommand.Path)" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Check if Node.js is available
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed or not in PATH" -ForegroundColor Yellow
    Write-Host ""

    # Try to install via winget if available
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "Attempting to install Node.js LTS via winget..." -ForegroundColor Cyan
        Write-Host ""

        try {
            winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements

            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

            # Check again
            if (Get-Command node -ErrorAction SilentlyContinue) {
                Write-Host "Node.js installed successfully!" -ForegroundColor Green
                Write-Host ""
            } else {
                Write-Error "Node.js installation completed but node is not in PATH. Please restart your terminal."
                exit 1
            }
        } catch {
            Write-Error "Failed to install Node.js via winget: $_"
            Write-Error "Please install Node.js manually from: https://nodejs.org/"
            exit 1
        }
    } else {
        Write-Error "Node.js is not installed and winget is not available"
        Write-Error "Install Node.js from: https://nodejs.org/"
        exit 1
    }
}

# Check if client.js exists
$ClientScript = Join-Path $ScriptDir "client.js"
if (-not (Test-Path $ClientScript)) {
    Write-Error "client.js not found at: $ClientScript"
    exit 1
}

# Check if secret.key exists
$KeyFile = Join-Path $ScriptDir "secret.key"
if (-not (Test-Path $KeyFile)) {
    Write-Error "secret.key not found at: $KeyFile"
    Write-Error "Copy the pre-shared key from the server to this location"
    exit 1
}

# Check if npm dependencies are installed
$NodeModules = Join-Path $ScriptDir "node_modules"
$PackageJson = Join-Path $ScriptDir "package.json"

if ((Test-Path $PackageJson) -and (-not (Test-Path $NodeModules))) {
    Write-Host "Node modules not found. Running npm install..." -ForegroundColor Yellow
    Write-Host ""

    try {
        Push-Location $ScriptDir
        npm install
        Pop-Location

        Write-Host ""
        Write-Host "Dependencies installed successfully!" -ForegroundColor Green
        Write-Host ""
    } catch {
        Pop-Location
        Write-Error "Failed to install npm dependencies: $_"
        Write-Error "Please run 'npm install' manually in: $ScriptDir"
        exit 1
    }
}

# Set environment variables for client.js
$env:MONITOR_DEVICE_NAME = $DeviceName
$env:MONITOR_HOST = $ServerHost
$env:MONITOR_PORT = $ServerPort

# Function to send heartbeat
function Send-Heartbeat {
    try {
        & node $ClientScript
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Heartbeat sent to $ServerHost`:$ServerPort"
            return $true
        } else {
            Write-Error "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Failed to send heartbeat (exit code: $LASTEXITCODE)"
            return $false
        }
    }
    catch {
        Write-Error "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Failed to send heartbeat: $_"
        return $false
    }
}

# Run based on interval setting
if ($Interval -gt 0) {
    # Continuous mode
    Write-Host "Starting continuous heartbeat mode (every $Interval seconds)"
    Write-Host "Device: $DeviceName"
    Write-Host "Server: $ServerHost`:$ServerPort"
    Write-Host "Press Ctrl+C to stop"
    Write-Host ""

    $iteration = 0
    while ($true) {
        $iteration++
        Write-Host "=== Iteration $iteration ==="
        Send-Heartbeat | Out-Null

        if ($Interval -gt 0) {
            Start-Sleep -Seconds $Interval
        }
    }
} else {
    # Single run mode
    $success = Send-Heartbeat
    if (-not $success) {
        exit 1
    }
}
