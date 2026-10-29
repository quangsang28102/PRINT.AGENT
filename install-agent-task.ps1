param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$AgentDirectory,
  [Parameter(Mandatory = $true)][string]$AppExecutablePath
)

$ErrorActionPreference = "Stop"
$taskName = "ExamPrintAgent"
$serviceName = "ExamPrintAgent"
$agentDirectory = [System.IO.Path]::GetFullPath($AgentDirectory)
$configPath = Join-Path $agentDirectory "config.json"

foreach ($requiredPath in @($NodePath, $AppExecutablePath, $configPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required Print Agent file was not found: $requiredPath"
  }
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$userName = $identity.Name

# Word automation needs the logged-in user's desktop session; a LocalSystem service runs in session 0.
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$preserveTaskDisabled = $existingTask -and ($existingTask.Settings.Enabled -eq $false)
if ($existingTask) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}

$existingUi = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'HPO Print Agent.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and [System.IO.Path]::GetFullPath($_.ExecutablePath).Equals($AppExecutablePath, [System.StringComparison]::OrdinalIgnoreCase) }
foreach ($uiProcess in @($existingUi)) {
  Stop-Process -Id $uiProcess.ProcessId -Force -ErrorAction SilentlyContinue
}

$agentEntryPath = Join-Path $agentDirectory "index.js"
$agentProcesses = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($agentEntryPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 })
foreach ($agentProcess in $agentProcesses) {
  & taskkill.exe /PID $agentProcess.ProcessId /T /F | Out-Null
}

$legacyService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($legacyService) {
  if ($legacyService.Status -ne "Stopped") {
    Stop-Service -Name $serviceName -Force -ErrorAction Stop
  }
  & sc.exe delete $serviceName | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not remove the old $serviceName Windows service (exit code $LASTEXITCODE)."
  }
  Start-Sleep -Seconds 1
}

$action = New-ScheduledTaskAction -Execute $AppExecutablePath -WorkingDirectory $agentDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
$principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Runs the HPO Print Agent dashboard and printer connection in the signed-in user's Windows session." `
  -Force | Out-Null

if ($preserveTaskDisabled) {
  Disable-ScheduledTask -TaskName $taskName | Out-Null
}

Write-Output "Registered $taskName to run for $userName at sign-in."
