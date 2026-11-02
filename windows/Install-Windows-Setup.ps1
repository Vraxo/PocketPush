$ErrorActionPreference = 'Stop'
$Port = 8765
$RuleName = 'PocketPush Receiver (TCP 8765)'
$LegacyRuleName = 'PhonePush Receiver (TCP 8765)'
$CaSubject = 'CN=PocketPush Local CA'
$ServerSubject = "CN=$env:COMPUTERNAME"
$AppId = '{78E6F2D1-9D14-4B20-90AB-7F2A9A3F6C51}'
$CaExportPath = Join-Path $PSScriptRoot 'PocketPush-Local-CA.cer'

$principal = [System.Security.Principal.WindowsPrincipal]::new([System.Security.Principal.WindowsIdentity]::GetCurrent())
$isAdministrator = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdministrator) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments
    exit
}

function Invoke-Netsh {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    & netsh.exe @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "netsh failed: $($Arguments -join ' ')" }
}

function Get-NetworkIPv4Addresses {
    $addresses = [System.Collections.Generic.List[string]]::new()
    foreach ($adapter in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($adapter.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up) { continue }
        if ($adapter.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback) { continue }
        if ($adapter.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Tunnel) { continue }
        foreach ($unicast in $adapter.GetIPProperties().UnicastAddresses) {
            $ip = $unicast.Address
            if ($ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { continue }
            if ($ip.ToString().StartsWith('169.254.')) { continue }
            if (-not $addresses.Contains($ip.ToString())) { $addresses.Add($ip.ToString()) }
        }
    }
    return @($addresses)
}

Write-Host 'Configuring PocketPush HTTPS for this Windows PC...' -ForegroundColor Cyan

# Create or reuse a private local CA. Its private key stays in the Windows
# LocalMachine certificate store; only the public .cer is copied to Android.
$caCert = Get-ChildItem -Path 'Cert:\LocalMachine\My' | Where-Object {
    $_.Subject -eq $CaSubject -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date)
} | Sort-Object NotAfter -Descending | Select-Object -First 1

if (-not $caCert) {
    Write-Host 'Creating the PocketPush local certificate authority...' -ForegroundColor Yellow
    $caCert = New-SelfSignedCertificate `
        -Type Custom `
        -Subject $CaSubject `
        -CertStoreLocation 'Cert:\LocalMachine\My' `
        -KeyAlgorithm RSA `
        -KeyLength 3072 `
        -HashAlgorithm SHA256 `
        -KeyExportPolicy NonExportable `
        -KeyUsage CertSign, CRLSign, DigitalSignature `
        -TextExtension @('2.5.29.19={critical}{text}ca=1&pathlength=0', '2.5.29.37={text}1.3.6.1.5.5.7.3.1') `
        -NotAfter (Get-Date).AddYears(10)
}

$trustedCa = Get-ChildItem -Path 'Cert:\LocalMachine\Root' | Where-Object { $_.Thumbprint -eq $caCert.Thumbprint } | Select-Object -First 1
if (-not $trustedCa) {
    $caTempPath = Join-Path $env:TEMP ('PocketPush-CA-' + [guid]::NewGuid().ToString('N') + '.cer')
    try {
        Export-Certificate -Cert $caCert -FilePath $caTempPath -Type CERT -Force | Out-Null
        Import-Certificate -FilePath $caTempPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
    }
    finally {
        Remove-Item -LiteralPath $caTempPath -Force -ErrorAction SilentlyContinue
    }
}

$addresses = @(Get-NetworkIPv4Addresses)
$sanParts = [System.Collections.Generic.List[string]]::new()
$sanParts.Add("DNS=$env:COMPUTERNAME")
$sanParts.Add('IPAddress=127.0.0.1')
foreach ($address in $addresses) { $sanParts.Add("IPAddress=$address") }
$sanExtension = '2.5.29.17={text}' + ($sanParts -join '&')

Write-Host 'Creating a server certificate for the current PC addresses...' -ForegroundColor Yellow
$serverCert = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $ServerSubject `
    -Signer $caCert `
    -CertStoreLocation 'Cert:\LocalMachine\My' `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy NonExportable `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -TextExtension @($sanExtension, '2.5.29.37={text}1.3.6.1.5.5.7.3.1') `
    -NotAfter (Get-Date).AddYears(2)

# Export only the public CA certificate. Never export the CA private key.
Export-Certificate -Cert $caCert -FilePath $CaExportPath -Type CERT -Force | Out-Null
$caHash = (Get-FileHash -LiteralPath $CaExportPath -Algorithm SHA256).Hash

# Configure HTTP.sys for HTTPS and reserve the URL for the current account.
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$oldHttpAcl = & netsh.exe http show urlacl "url=http://+:$Port/" 2>&1 | Out-String
if ($oldHttpAcl -match [regex]::Escape("http://+:$Port/")) {
    & netsh.exe http delete urlacl "url=http://+:$Port/" | Out-Null
}

$httpsAcl = & netsh.exe http show urlacl "url=https://+:$Port/" 2>&1 | Out-String
if ($httpsAcl -notmatch [regex]::Escape($identity)) {
    if ($httpsAcl -match [regex]::Escape("https://+:$Port/")) {
        & netsh.exe http delete urlacl "url=https://+:$Port/" | Out-Null
    }
    Invoke-Netsh -Arguments @('http', 'add', 'urlacl', "url=https://+:$Port/", "user=$identity")
}

# Replace the HTTP.sys TLS binding with the newly issued certificate.
& netsh.exe http delete sslcert "ipport=0.0.0.0:$Port" 2>$null | Out-Null
Invoke-Netsh -Arguments @(
    'http', 'add', 'sslcert',
    "ipport=0.0.0.0:$Port",
    "certhash=$($serverCert.Thumbprint)",
    "appid=$AppId",
    'certstorename=MY'
)

# Limit inbound access to devices on the local subnet and Private networks.
Get-NetFirewallRule -DisplayName $LegacyRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet | Out-Null

# Remove older PocketPush server leaf certificates after the new binding is in place.
Get-ChildItem -Path 'Cert:\LocalMachine\My' | Where-Object {
    $_.Subject -eq $ServerSubject -and $_.Thumbprint -ne $serverCert.Thumbprint -and $_.Issuer -eq $caCert.Subject
} | Remove-Item -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'PocketPush HTTPS setup is complete.' -ForegroundColor Green
Write-Host "HTTPS port:  $Port" -ForegroundColor Gray
Write-Host "CA file:     $CaExportPath" -ForegroundColor Gray
Write-Host "CA SHA-256:  $caHash" -ForegroundColor Gray
Write-Host ''
Write-Host 'ONE-TIME ANDROID STEP:' -ForegroundColor Cyan
Write-Host '1. Copy PocketPush-Local-CA.cer to your Android phone (USB cable is recommended).' -ForegroundColor White
Write-Host '2. On Android, install it as a CA certificate under Security > Encryption & credentials.' -ForegroundColor White
Write-Host '3. Restart Chrome. The PocketPush PWA can then trust this PC certificate.' -ForegroundColor White
Write-Host ''
if ($addresses.Count -eq 0) {
    Write-Host 'No active IPv4 address was found. Connect this PC to your Wi-Fi/LAN.' -ForegroundColor Yellow
}
else {
    Write-Host 'Current addresses (enter the IP only in PocketPush):' -ForegroundColor Cyan
    foreach ($address in $addresses) { Write-Host "  $address" -ForegroundColor White }
}
Write-Host ''
$profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' -or $_.IPv6Connectivity -ne 'Disconnected' })
foreach ($profile in $profiles) {
    Write-Host ("Network: {0} - {1}" -f $profile.Name, $profile.NetworkCategory)
    if ($profile.NetworkCategory -ne 'Private') {
        Write-Host '  Set this trusted home network to Private in Windows Settings > Network & Internet.' -ForegroundColor Yellow
    }
}
Write-Host ''
Write-Host 'The installer preserves windows/settings.json and does not change your destination or pairing key.' -ForegroundColor Gray
Write-Host 'Run Rotate-Pairing-Key.cmd once to replace the key previously shared in chat.' -ForegroundColor Yellow
Write-Host 'Then start Start-PocketPush.cmd normally.' -ForegroundColor Green
Read-Host 'Press Enter to close' | Out-Null
