param(
  [string]$IsccPath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$installerScript = Join-Path $PSScriptRoot "ExamPrintAgent.iss"
$bundleDirectory = Join-Path $PSScriptRoot "bundle"
$electronDirectory = Join-Path $projectRoot "node_modules\electron\dist"
$bundleFullPath = [System.IO.Path]::GetFullPath($bundleDirectory)
$installerFullPath = [System.IO.Path]::GetFullPath($PSScriptRoot)
if (-not $bundleFullPath.StartsWith($installerFullPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to build outside the installer staging directory: $bundleFullPath"
}

if (-not (Test-Path -LiteralPath (Join-Path $electronDirectory "electron.exe") -PathType Leaf)) {
  throw "Electron runtime is missing. Run npm ci before building the installer."
}

$existingBundle = Get-Item -LiteralPath $bundleDirectory -ErrorAction SilentlyContinue
if ($existingBundle) {
  if (-not $existingBundle.FullName.Equals($bundleFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove an unexpected staging directory: $($existingBundle.FullName)"
  }
  Remove-Item -LiteralPath $bundleFullPath -Recurse -Force
}
New-Item -ItemType Directory -Path $bundleDirectory | Out-Null

$iconBuilder = Join-Path $projectRoot "desktop\build-icon.mjs"
& node.exe $iconBuilder (Join-Path $bundleDirectory "app.ico")
if ($LASTEXITCODE -ne 0) { throw "Could not create the Print Agent icon (exit code $LASTEXITCODE)." }

$agentFiles = @("index.js", "wordPrintRenderer.js", "runtime-constants.js", "print-docx.ps1", "package.json", "package-lock.json", "config.example.json", "setup.ps1", "install-agent-task.ps1", "uninstall-agent.ps1")
foreach ($file in $agentFiles) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $bundleDirectory }
foreach ($templateType in @("theory", "simulation")) {
  $templateName = if ($templateType -eq "theory") { "theory-result.docx" } else { "simulation-result.docx" }
  $templateSource = Join-Path $projectRoot "templates\$templateType\$templateName"
  if (Test-Path -LiteralPath $templateSource -PathType Leaf) {
    $templateTargetDirectory = Join-Path $bundleDirectory "templates\$templateType"
    New-Item -ItemType Directory -Path $templateTargetDirectory -Force | Out-Null
    Copy-Item -LiteralPath $templateSource -Destination $templateTargetDirectory
  }
}
Copy-Item -Path (Join-Path $electronDirectory "*") -Destination $bundleDirectory -Recurse -Force
Move-Item -LiteralPath (Join-Path $bundleDirectory "electron.exe") -Destination (Join-Path $bundleDirectory "HPO Print Agent.exe")

$desktopTarget = Join-Path $bundleDirectory "resources\app\desktop"
New-Item -ItemType Directory -Path $desktopTarget -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot "desktop\*") -Destination $desktopTarget -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "desktop\package.json") -Destination (Join-Path $bundleDirectory "resources\app\package.json") -Force

Push-Location $bundleDirectory
try {
  & npm.cmd ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "Could not stage Print Agent production dependencies (exit code $LASTEXITCODE)." }
} finally { Pop-Location }

$candidates = @(
  $IsccPath,
  (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source,
  "C:\Users\$env:USERNAME\AppData\Local\Programs\Inno Setup 6\ISCC.exe",
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if (-not $candidates) { throw "ISCC.exe not found. Install Inno Setup 6, then run this script again." }
& $candidates $installerScript
if ($LASTEXITCODE -ne 0) { throw "Inno Setup build failed (exit code $LASTEXITCODE)." }
Remove-Item -LiteralPath $bundleFullPath -Recurse -Force
Write-Host "Created $PSScriptRoot\output\ExamPrintAgentSetup.exe"
