param(
  [string]$TaskName = "ExamPrintAgent",
  [string]$ServiceName = "ExamPrintAgent",
  [string]$AgentDirectory = $PSScriptRoot,
  [switch]$RemoveFiles,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Vui lòng chạy file này bằng Run as administrator." -ForegroundColor Red
  if (-not $NonInteractive) { Read-Host "Nhấn Enter để thoát" }
  exit 1
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Write-Host "Stopping and removing scheduled task $TaskName..."
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$agentEntryPath = Join-Path ([System.IO.Path]::GetFullPath($AgentDirectory)) "index.js"
$agentProcesses = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($agentEntryPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 })
foreach ($agentProcess in $agentProcesses) {
  & taskkill.exe /PID $agentProcess.ProcessId /T /F | Out-Null
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
  if ($service.Status -ne "Stopped") {
    Write-Host "Đang dừng service $ServiceName..."
    Stop-Service -Name $ServiceName -Force
  }

  Write-Host "Đang xóa service $ServiceName..."
  & sc.exe delete $ServiceName | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Không thể xóa service $ServiceName."
  }
  Write-Host "Đã xóa service $ServiceName." -ForegroundColor Green
} else {
  Write-Host "Không tìm thấy service $ServiceName. Tiếp tục kiểm tra file..." -ForegroundColor Yellow
}

$removeFilesWasSpecified = $PSBoundParameters.ContainsKey("RemoveFiles")
if (-not $removeFilesWasSpecified) {
  $RemoveFiles = -not $NonInteractive -and ((Read-Host "Bạn có muốn xóa thư mục agent '$AgentDirectory' cùng config, log và dependency không? (y/N)") -eq "y")
}

if ($RemoveFiles) {
  $resolvedAgentDirectory = [System.IO.Path]::GetFullPath($AgentDirectory).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $currentScriptDirectory = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)

  if (-not (Test-Path -LiteralPath $resolvedAgentDirectory -PathType Container)) {
    Write-Host "Không tìm thấy thư mục: $resolvedAgentDirectory" -ForegroundColor Yellow
  } elseif ($resolvedAgentDirectory -ne $currentScriptDirectory -and -not (Test-Path -LiteralPath (Join-Path $resolvedAgentDirectory "config.json"))) {
    throw "Từ chối xóa vì thư mục không giống thư mục agent: $resolvedAgentDirectory"
  } else {
    $parent = Get-Item -LiteralPath $resolvedAgentDirectory
    while ($parent) {
      if (Test-Path -LiteralPath (Join-Path $parent.FullName ".git")) {
        throw "Từ chối xóa thư mục nằm trong Git repository: $resolvedAgentDirectory"
      }
      $next = $parent.Parent
      if (-not $next -or $next.FullName -eq $parent.FullName) { break }
      $parent = $next
    }
    Write-Host "Sẽ xóa toàn bộ: $resolvedAgentDirectory" -ForegroundColor Yellow
    $answer = Read-Host "Xác nhận xóa thư mục này? Gõ DELETE để tiếp tục"
    if ($answer -eq "DELETE") {
      Remove-Item -LiteralPath $resolvedAgentDirectory -Recurse -Force
      Write-Host "Đã xóa thư mục agent." -ForegroundColor Green
    } else {
      Write-Host "Đã giữ nguyên thư mục agent." -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "Đã giữ nguyên source, config, log và dependency." -ForegroundColor Yellow
}

Write-Host "Gỡ Print Agent hoàn tất." -ForegroundColor Green
if (-not $NonInteractive) { Read-Host "Nhấn Enter để đóng" }
