<#
.SYNOPSIS
  Capture a live sweep from a NanoVNA over USB serial and write a Touchstone file.

.DESCRIPTION
  The NanoVNA-F V2 console has no filesystem commands, so sweeps already saved on the
  device can only be retrieved in USB mass-storage (bootloader) mode. It can, however,
  dump the CURRENT sweep over serial — which is what this script does, writing a .s1p
  or .s2p file you can open straight in the viewer.

.EXAMPLE
  .\capture-nanovna.ps1
  Capture the sweep currently on the device to a timestamped .s1p in .\Samples.

.EXAMPLE
  .\capture-nanovna.ps1 -TwoPort -Out ant868.s2p
  Capture S11 and S21.

.EXAMPLE
  .\capture-nanovna.ps1 -Start 860e6 -Stop 876e6 -Points 201 -Out band868.s1p
  Retune the device to that span first, then capture. NOTE: this changes the sweep
  settings on the VNA itself.
#>
[CmdletBinding()]
param(
  [string] $Port    = 'COM4',
  [string] $Out,
  [switch] $TwoPort,
  [double] $Start,
  [double] $Stop,
  [int]    $Points,
  [int]    $Baud    = 115200
)

$ErrorActionPreference = 'Stop'
$paused = $false

# Touchstone numbers are always dot-decimal. Without this, a comma-decimal locale
# (cs-CZ, de-DE, ...) makes -f emit "0,289870" and the file is unreadable.
[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture

function Invoke-VnaCommand {
  param($sp, [string]$Cmd, [int]$QuietMs = 600, [int]$MaxMs = 20000)
  $sp.DiscardInBuffer()
  $sp.Write("$Cmd`r")
  $sb   = New-Object System.Text.StringBuilder
  $all  = [System.Diagnostics.Stopwatch]::StartNew()
  $idle = [System.Diagnostics.Stopwatch]::StartNew()
  while ($all.ElapsedMilliseconds -lt $MaxMs) {
    Start-Sleep -Milliseconds 100
    $chunk = ''
    try { $chunk = $sp.ReadExisting() } catch { }
    if ($chunk.Length -gt 0) { [void]$sb.Append($chunk); $idle.Restart() }
    elseif ($sb.Length -gt 0 -and $idle.ElapsedMilliseconds -ge $QuietMs) { break }
    elseif ($idle.ElapsedMilliseconds -ge 3000) { break }
  }
  $text = $sb.ToString()
  # Strip the echoed command and the trailing "ch>" prompt.
  $lines = $text -split "`r?`n" | ForEach-Object { $_.Trim() }
  return @($lines | Where-Object { $_ -and $_ -ne $Cmd -and $_ -notmatch '^ch>' })
}

function Get-Pairs {
  param([string[]]$Lines, [string]$What)
  $re  = '^\s*(-?[\d.]+(?:[eE][-+]?\d+)?)\s+(-?[\d.]+(?:[eE][-+]?\d+)?)\s*$'
  $out = @()
  foreach ($l in $Lines) {
    $m = [regex]::Match($l, $re)
    if ($m.Success) {
      $out += ,@([double]$m.Groups[1].Value, [double]$m.Groups[2].Value)
    }
  }
  if ($out.Count -eq 0) { throw "No numeric pairs returned for $What." }
  return $out
}

$sp = New-Object System.IO.Ports.SerialPort $Port, $Baud, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
$sp.DtrEnable    = $true
$sp.RtsEnable    = $true
$sp.ReadTimeout  = 500
$sp.WriteTimeout = 2000

try {
  $sp.Open()
} catch {
  Write-Error "Could not open $Port : $($_.Exception.Message)`nIs the VNA plugged in and not held open by NanoVNA-Saver or a terminal?"
  exit 1
}

try {
  Start-Sleep -Milliseconds 300
  [void]$sp.ReadExisting()
  $sp.Write("`r")
  Start-Sleep -Milliseconds 200
  [void]$sp.ReadExisting()

  $info = Invoke-VnaCommand -sp $sp -Cmd 'info'
  Write-Host ("Device: " + ($info -join ' | ')) -ForegroundColor Cyan

  if ($PSBoundParameters.ContainsKey('Start') -and $PSBoundParameters.ContainsKey('Stop')) {
    $pts = if ($Points) { $Points } else { 101 }
    $cmd = 'sweep {0:F0} {1:F0} {2}' -f $Start, $Stop, $pts
    Write-Host "Retuning device: $cmd" -ForegroundColor Yellow
    [void](Invoke-VnaCommand -sp $sp -Cmd $cmd)
    Start-Sleep -Milliseconds 1200
  }

  $sweep = Invoke-VnaCommand -sp $sp -Cmd 'sweep'
  Write-Host ("Sweep: " + ($sweep -join ' ')) -ForegroundColor Cyan

  # Freeze the sweep: frequencies / data 0 / data 1 are three separate reads, and a
  # running sweep would let S11 and S21 come from different passes (or tear mid-array).
  Write-Host 'Pausing sweep...'
  [void](Invoke-VnaCommand -sp $sp -Cmd 'pause')
  $paused = $true
  Start-Sleep -Milliseconds 250

  Write-Host 'Reading frequencies...'
  $freqLines = Invoke-VnaCommand -sp $sp -Cmd 'frequencies'
  $freqs = @()
  foreach ($l in $freqLines) { if ($l -match '^\s*(\d+)\s*$') { $freqs += [double]$Matches[1] } }
  if ($freqs.Count -eq 0) { throw 'No frequencies returned.' }

  Write-Host 'Reading S11 (data 0)...'
  $s11 = Get-Pairs -Lines (Invoke-VnaCommand -sp $sp -Cmd 'data 0') -What 'data 0'

  $s21 = $null
  if ($TwoPort) {
    Write-Host 'Reading S21 (data 1)...'
    $s21 = Get-Pairs -Lines (Invoke-VnaCommand -sp $sp -Cmd 'data 1') -What 'data 1'
  }

  $n = [Math]::Min($freqs.Count, $s11.Count)
  if ($s21) { $n = [Math]::Min($n, $s21.Count) }
  if ($freqs.Count -ne $s11.Count) {
    Write-Warning "frequencies=$($freqs.Count) but data 0=$($s11.Count); writing $n points."
  }

  if (-not $Out) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $ext   = if ($TwoPort) { 's2p' } else { 's1p' }
    $dir   = Join-Path $PSScriptRoot 'Samples'
    if (-not (Test-Path $dir)) { $dir = $PSScriptRoot }
    $Out   = Join-Path $dir "capture-$stamp.$ext"
  } elseif (-not [System.IO.Path]::IsPathRooted($Out)) {
    $Out = Join-Path $PSScriptRoot $Out
  }

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('!File created by NanoVNA-F V2')
  [void]$sb.AppendLine('!Captured over serial ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' from ' + $Port)
  [void]$sb.AppendLine('# Hz S RI R 50')
  for ($i = 0; $i -lt $n; $i++) {
    if ($s21) {
      [void]$sb.AppendLine(('{0,10:F0} {1,9:F6} {2,9:F6} {3,9:F6} {4,9:F6} 0 0 0 0' -f `
        $freqs[$i], $s11[$i][0], $s11[$i][1], $s21[$i][0], $s21[$i][1]))
    } else {
      [void]$sb.AppendLine(('{0,10:F0} {1,9:F6} {2,9:F6}' -f `
        $freqs[$i], $s11[$i][0], $s11[$i][1]))
    }
  }

  [System.IO.File]::WriteAllText($Out, $sb.ToString())
  Write-Host ""
  Write-Host "Wrote $Out  ($n points, $(if ($s21) {'S11 + S21'} else {'S11'}))" -ForegroundColor Green
}
finally {
  # Always hand the device back unfrozen, even if something above threw.
  if ($paused -and $sp.IsOpen) {
    try { [void](Invoke-VnaCommand -sp $sp -Cmd 'resume' -QuietMs 300 -MaxMs 3000) } catch { }
    Write-Host 'Sweep resumed.' -ForegroundColor DarkGray
  }
  if ($sp.IsOpen) { $sp.Close() }
}
