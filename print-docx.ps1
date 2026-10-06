param(
  [Parameter(Mandatory = $true)][string]$DocumentPath,
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [int]$Copies = 1
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $DocumentPath -PathType Leaf)) {
  throw "Không tìm thấy file Word: $DocumentPath"
}

$word = $null
$document = $null
try {
  try {
    $word = New-Object -ComObject Word.Application
  } catch {
    throw "Máy Windows chưa cài Microsoft Word hoặc Word không thể chạy dưới tài khoản Print Agent."
  }

  $word.Visible = $false
  $word.DisplayAlerts = 0
  $printer = Get-CimInstance Win32_Printer -Filter ("Name='{0}'" -f $PrinterName.Replace("'", "''")) -ErrorAction SilentlyContinue
  $printerCandidates = @($PrinterName)
  if ($printer -and $printer.PortName) { $printerCandidates += "$PrinterName on $($printer.PortName)" }

  $activePrinter = $false
  foreach ($candidate in $printerCandidates) {
    try {
      $word.ActivePrinter = $candidate
      $activePrinter = $true
      break
    } catch { }
  }
  if (-not $activePrinter) { throw "Microsoft Word không nhận máy in '$PrinterName'." }

  $document = $word.Documents.Open($DocumentPath, $false, $true)
  for ($copy = 0; $copy -lt [Math]::Max(1, [Math]::Min($Copies, 10)); $copy++) {
    $document.PrintOut($false)
  }
} finally {
  if ($document) { $document.Close($false) | Out-Null }
  if ($word) { $word.Quit() | Out-Null }
  if ($document) { [Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null }
  if ($word) { [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
