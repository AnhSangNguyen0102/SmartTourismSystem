# ==============================================================================
# Smart Tourism System Parallel Process Launcher
# Runs both Frontend (React SPA) and Backend (FastAPI) servers in parallel.
# ==============================================================================

Clear-Host

# 1. Dependency check for Frontend node_modules
$frontendDir = Join-Path $PSScriptRoot "Frontend"
$nodeModulesDir = Join-Path $frontendDir "node_modules"

if (-not (Test-Path $nodeModulesDir)) {
    Write-Host "INFO: node_modules directory not found in Frontend. Installing dependencies..."
    Push-Location $frontendDir
    npm install
    Pop-Location
} else {
    Write-Host "INFO: node_modules exists in Frontend."
}

# 2. Port conflict check and automatic release
Write-Host "INFO: Checking ports 3000 and 8000..."

# Helper function to find and kill process on port using netstat
function Stop-ProcessOnPort ($port) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($connections) {
            foreach ($conn in $connections) {
                $pidVal = $conn.OwningProcess
                if ($pidVal -and $pidVal -gt 0) {
                    Write-Host "WARNING: Port $port is occupied by process PID $pidVal. Terminating process..."
                    Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
                }
            }
            Start-Sleep -Seconds 1
        }
    } catch {
        # Fallback to netstat if Get-NetTCPConnection fails or is unavailable
        $netstatOut = netstat -ano | Select-String ":$port "
        if ($netstatOut) {
            foreach ($line in $netstatOut) {
                $parts = $line.ToString() -split '\s+'
                $pidVal = $parts[-1]
                if ($pidVal -and $pidVal -match '^\d+$' -and $pidVal -ne "0") {
                    Write-Host "WARNING: Port $port is occupied by process PID $pidVal. Terminating process..."
                    Stop-Process -Id [int]$pidVal -Force -ErrorAction SilentlyContinue
                }
            }
            Start-Sleep -Seconds 1
        }
    }
}

Stop-ProcessOnPort 3000
Stop-ProcessOnPort 8000

# 3. Parallel process execution
# Force fallback to Start-Process to avoid Windows Terminal string parsing bugs
Write-Host "INFO: Launching in separate windows..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$PSScriptRoot\Backend`"; python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$PSScriptRoot\Frontend`"; `$env:BROWSER='none'; npm start"

# 4. Wait for both servers to be online
Write-Host "INFO: Waiting for Backend and Frontend to be online..."

$backendReady = $false
$frontendReady = $false
$retryCount = 0
$maxRetries = 25

while (-not ($backendReady -and $frontendReady) -and ($retryCount -lt $maxRetries)) {
    $retryCount++
    Start-Sleep -Seconds 1
    
    if (-not $backendReady) {
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($response -and $response.status -eq "ok") {
                $backendReady = $true
                Write-Host "SUCCESS: Backend is online!"
            }
        } catch {}
    }
    
    if (-not $frontendReady) {
        try {
            $tcpClient = New-Object System.Net.Sockets.TcpClient
            $connect = $tcpClient.BeginConnect("localhost", 3000, $null, $null)
            $success = $connect.AsyncWaitHandle.WaitOne(500, $false)
            if ($success) {
                $tcpClient.EndConnect($connect)
                $frontendReady = $true
                Write-Host "SUCCESS: Frontend is online!"
            }
            $tcpClient.Close()
        } catch {}
    }
}

# 5. Open app in default browser
Write-Host "INFO: Launching browser..."
Start-Process "http://localhost:3000"
Write-Host "INFO: Startup completed."
