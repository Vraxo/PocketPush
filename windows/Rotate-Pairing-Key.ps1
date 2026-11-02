$ErrorActionPreference = 'Stop'
$SettingsPath = Join-Path $PSScriptRoot 'settings.json'

if (-not (Test-Path -LiteralPath $SettingsPath)) {
    Write-Host 'settings.json was not found. Start PocketPush once to create its configuration first.' -ForegroundColor Red
    Read-Host 'Press Enter to close' | Out-Null
    exit 1
}

try { $settings = Get-Content -LiteralPath $SettingsPath -Raw | ConvertFrom-Json }
catch { throw "Could not read settings.json: $($_.Exception.Message)" }

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$newToken = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
$settings | Add-Member -NotePropertyName token -NotePropertyValue $newToken -Force
$json = $settings | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($SettingsPath, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host 'PocketPush pairing key rotated.' -ForegroundColor Green
Write-Host 'The previous key no longer works.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'New pairing key:' -ForegroundColor Cyan
Write-Host $newToken -ForegroundColor White
Write-Host ''
Write-Host 'Enter this key in the PocketPush app and save the connection.' -ForegroundColor Gray
Read-Host 'Press Enter to close' | Out-Null
