param(
  [string]$ServerUrl,
  [string]$PairingCode,
  [string]$InstallDirectory = $PSScriptRoot,
  [switch]$SkipTask
)

$ErrorActionPreference = "Stop"

trap {
  Write-Host "`nPrint Agent setup failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Review the error above. Agent logs, if it started, are in C:\ProgramData\ExamPrintAgent\logs\agent.log."
  try { Read-Host "Press Enter to close Setup" | Out-Null } catch {}
  exit 1
}

function Normalize-ServerUrl([string]$Value) {
  $result = if ($null -eq $Value) { "" } else { $Value.Trim().TrimEnd('/') }
  if ($result.EndsWith('/api/v1')) { $result = $result.Substring(0, $result.Length - 7).TrimEnd('/') }
  if (-not $result) { throw "API Server URL is required." }
  return $result
}

function Read-RequiredValue([string]$Prompt, [string]$Value) {
  if ($Value) { return $Value.Trim() }
  do { $result = (Read-Host $Prompt).Trim() } while (-not $result)
  return $result
}

function Select-WindowsPrinter {
  $printers = @(Get-Printer | Sort-Object Name)
  if (-not $printers.Count) { throw "No Windows printer was found. Install the printer driver first." }
  if ($printers.Count -eq 1) { return $printers[0].Name }

  Write-Host "`nWindows printers:"
  for ($index = 0; $index -lt $printers.Count; $index++) { Write-Host ("[{0}] {1}" -f ($index + 1), $printers[$index].Name) }
  do {
    $selected = 0
    [int]::TryParse((Read-Host "Select printer number"), [ref]$selected) | Out-Null
  } while ($selected -lt 1 -or $selected -gt $printers.Count)
  return $printers[$selected - 1].Name
}

function Set-DirectoryPermissions([string]$Directory, [string]$UserSid) {
  New-Item -ItemType Directory -Force -Path $Directory | Out-Null
  icacls.exe $Directory /grant:r ("*{0}:(OI)(CI)M" -f $UserSid) "*S-1-5-32-544:(OI)(CI)F" /c | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not grant the signed-in Windows user access to $Directory." }
}

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run Setup as Administrator."
}

$InstallDirectory = [System.IO.Path]::GetFullPath($InstallDirectory)
$packageMetadata = Get-Content -LiteralPath (Join-Path $InstallDirectory "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$serviceVersion = [string]$packageMetadata.version
$configPath = Join-Path $InstallDirectory "config.json"
$existingConfig = $null
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
  try { $existingConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json } catch { $existingConfig = $null }
}

if ($ServerUrl) {
  $ServerUrl = Normalize-ServerUrl $ServerUrl
} elseif ($existingConfig.serverUrl) {
  $ServerUrl = Normalize-ServerUrl $existingConfig.serverUrl
} else {
  $ServerUrl = Normalize-ServerUrl (Read-RequiredValue "Production API URL" $ServerUrl)
}

$PairingCode = if ($PairingCode) { $PairingCode.Trim() } else { "" }
$canReusePairing = $existingConfig -and $existingConfig.agentToken -and $existingConfig.agentId -and -not $PairingCode
if ($canReusePairing) {
  $newPairingCode = (Read-Host "Existing Agent config found. Press Enter to reuse it, or enter a new pairing code")
  if ($newPairingCode.Trim()) {
    $PairingCode = $newPairingCode.Trim()
    $canReusePairing = $false
  }
}
if (-not $PairingCode -and -not $canReusePairing) {
  $PairingCode = Read-RequiredValue "Print Agent pairing code" $PairingCode
}
$printerName = Select-WindowsPrinter

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw "Node.js or winget was not found. Install Node.js LTS and run Setup again." }
  Write-Host "Installing Node.js LTS..."
  winget.exe install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "Node.js installation failed (exit code $LASTEXITCODE)." }
  $env:Path = "C:\Program Files\nodejs;$env:Path"
}

$nodePath = (Get-Command node.exe).Source
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm was not found." }

try {
  $wordCheck = New-Object -ComObject Word.Application
  $wordCheck.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($wordCheck) | Out-Null
} catch {
  throw "Microsoft Word is not installed or cannot start for the signed-in Windows user. Print Agent needs Word to print DOCX forms."
}

if ($canReusePairing) {
  Write-Host "Using the existing Agent registration so Setup can safely be retried."
  $pair = [pscustomobject]@{ token = $existingConfig.agentToken; agentId = $existingConfig.agentId }
} else {
  $pairingEndpoint = "$ServerUrl/api/v1/print-jobs/pair"
  $pairBody = @{ pairingCode = $PairingCode; machineName = $env:COMPUTERNAME; serviceVersion = $serviceVersion } | ConvertTo-Json
  Write-Host "Pairing Print Agent with server..."
  try {
    $pairResponse = Invoke-RestMethod -Uri $pairingEndpoint -Method Post -ContentType "application/json" -Body $pairBody
  } catch {
    throw "Pairing failed: $($_.Exception.Message)"
  }
  $pair = $pairResponse.data
}
if (-not $pair.token -or -not $pair.agentId) { throw "The server returned invalid pairing data." }

New-Item -ItemType Directory -Force -Path $InstallDirectory | Out-Null
$config = [ordered]@{
  serverUrl = $ServerUrl
  socketPath = "/device"
  agentToken = $pair.token
  agentId = $pair.agentId
  printerName = $printerName
  nodePath = $nodePath
  serviceVersion = $serviceVersion
  tempDirectory = "C:/ProgramData/ExamPrintAgent/tmp"
  logDirectory = "C:/ProgramData/ExamPrintAgent/logs"
}
$configJson = $config | ConvertTo-Json
$utf8NoBom = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
[System.IO.File]::WriteAllText($configPath, $configJson, $utf8NoBom)

$agentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls.exe $configPath /inheritance:r /grant:r ("*{0}:(R)" -f $agentUserSid) "*S-1-5-32-544:(F)" /c | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not secure Print Agent configuration permissions." }
Set-DirectoryPermissions $config.tempDirectory $agentUserSid
Set-DirectoryPermissions $config.logDirectory $agentUserSid

Push-Location $InstallDirectory
try {
  $dependencyMarker = Join-Path $InstallDirectory "node_modules\docxtemplater"
  if (Test-Path -LiteralPath $dependencyMarker) {
    Write-Host "Using bundled Print Agent dependencies."
  } else {
    Write-Host "Installing Print Agent dependencies..."
    npm.cmd install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed (exit code $LASTEXITCODE)." }
  }
} finally { Pop-Location }

if (-not $SkipTask) {
  $appExecutablePath = Join-Path $InstallDirectory "HPO Print Agent.exe"
  & (Join-Path $InstallDirectory "install-agent-task.ps1") -NodePath $nodePath -AgentDirectory $InstallDirectory -AppExecutablePath $appExecutablePath
  $registrationStartedAt = [DateTimeOffset]::UtcNow
  Start-ScheduledTask -TaskName "ExamPrintAgent"
  $logPath = Join-Path $config.logDirectory "agent.log"
  $deadline = (Get-Date).AddSeconds(45)
  $registered = $false
  while ((Get-Date) -lt $deadline -and -not $registered) {
    if (Test-Path -LiteralPath $logPath) {
      foreach ($line in (Get-Content -LiteralPath $logPath -Tail 100)) {
        if ($line -match '^(?<time>\S+) registered (?<payload>\{.*\})$') {
          $registeredAt = [DateTimeOffset]::MinValue
          if (-not [DateTimeOffset]::TryParse($Matches.time, [ref]$registeredAt) -or $registeredAt -lt $registrationStartedAt.AddSeconds(-1)) { continue }
          $ack = $Matches.payload | ConvertFrom-Json
          if (-not $ack.ok) { throw "Agent registration failed: $($ack.message)" }
          $registered = $true
          break
        }
      }
    }
    if (-not $registered) { Start-Sleep -Seconds 2 }
  }
  if (-not $registered) {
    $taskInfo = Get-ScheduledTaskInfo -TaskName "ExamPrintAgent" -ErrorAction SilentlyContinue
    $taskResult = if ($taskInfo) { "Last task result: $($taskInfo.LastTaskResult)." } else { "Could not read the task result." }
    $recentLog = if (Test-Path -LiteralPath $logPath) { (Get-Content -LiteralPath $logPath -Tail 8) -join "`n" } else { "No Agent log was created." }
    throw "Setup started the Agent task, but the server did not confirm registration within 45 seconds. $taskResult Log: $logPath`nRecent log:`n$recentLog"
  }
}

Write-Host "`nPrint Agent installation completed."
Write-Host "Agent: $($pair.agentId)"
Write-Host "Printer: $printerName"
Write-Host "Agent connected successfully. The HPO Print Agent dashboard is running in the system tray."
Write-Host "Keep this Windows account signed in while printing is needed."
