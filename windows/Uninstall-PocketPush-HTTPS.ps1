$ErrorActionPreference = 'Stop'
$Port = 8765
$CaSubject = 'CN=PocketPush Local CA'
$ServerSubject = "CN=$env:COMPUTERNAME"
$RuleName = 'PocketPush Receiver (TCP 8765)'
$LegacyRuleName = 'PhonePush Receiver (TCP 8765)'
$CaExportPath = Join-Path $PSScriptRoot 'PocketPush-Local-CA.cer'

$principal = [System.Security.Principal.WindowsPrincipal]::new([System.Security.Principal.WindowsIdentity]::GetCurrent())
$isAdministrator = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdministrator) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments
    exit
}

Write-Host 'Removing PocketPush HTTPS configuration...' -ForegroundColor Cyan
& netsh.exe http delete sslcert "ipport=0.0.0.0:$Port" 2>$null | Out-Null
& netsh.exe http delete urlacl "url=https://+:$Port/" 2>$null | Out-Null
& netsh.exe http delete urlacl "url=http://+:$Port/" 2>$null | Out-Null
Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName $LegacyRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

$caCertificates = @(Get-ChildItem -Path 'Cert:\LocalMachine\My' | Where-Object { $_.Subject -eq $CaSubject })
$caThumbprints = @($caCertificates | ForEach-Object { $_.Thumbprint })
Get-ChildItem -Path 'Cert:\LocalMachine\My' | Where-Object {
    ($_.Subject -eq $ServerSubject -and $_.Issuer -eq $CaSubject) -or ($caThumbprints -contains $_.Thumbprint)
} | Remove-Item -ErrorAction SilentlyContinue
Get-ChildItem -Path 'Cert:\LocalMachine\Root' | Where-Object { $caThumbprints -contains $_.Thumbprint } | Remove-Item -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $CaExportPath -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'PocketPush HTTPS certificates, URL reservation and firewall rule were removed.' -ForegroundColor Green
Write-Host 'Your destination folder and windows/settings.json were left untouched.' -ForegroundColor Gray
Write-Host 'On Android, also remove PocketPush Local CA from the User certificates / Trusted credentials list.' -ForegroundColor Yellow
Read-Host 'Press Enter to close' | Out-Null
