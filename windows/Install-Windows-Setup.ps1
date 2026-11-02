$ErrorActionPreference = 'Stop'
$Port = 8765
$RuleName = 'PocketPush Receiver (TCP 8765)'
$LegacyRuleName = 'PhonePush Receiver (TCP 8765)'

$principal = [System.Security.Principal.WindowsPrincipal]::new([System.Security.Principal.WindowsIdentity]::GetCurrent())
$isAdministrator = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdministrator) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments
    exit
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Host 'Configuring PocketPush for the current Windows account...' -ForegroundColor Cyan

# HttpListener uses HTTP.sys. Reserve the URL prefix for the account that will run the receiver.
$existing = & netsh.exe http show urlacl "url=http://+:$Port/" 2>&1 | Out-String
if ($existing -match [regex]::Escape($identity)) {
    Write-Host 'HTTP URL reservation already belongs to this account.' -ForegroundColor Green
}
else {
    if ($existing -match [regex]::Escape("http://+:$Port/")) {
        Write-Host 'An existing reservation was found for this port. Replacing it for the current account...' -ForegroundColor Yellow
        & netsh.exe http delete urlacl "url=http://+:$Port/" | Out-Null
    }
    & netsh.exe http add urlacl "url=http://+:$Port/" "user=$identity" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not reserve the HTTP listener URL. Check whether another application owns port 8765.' }
}

# Limit the inbound rule to the Private profile and the local subnet.
Get-NetFirewallRule -DisplayName $LegacyRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet | Out-Null

Write-Host ''
Write-Host 'Windows setup is complete.' -ForegroundColor Green
Write-Host 'The firewall rule only allows connections from the local subnet while Windows is using the Private network profile.'
$profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' -or $_.IPv6Connectivity -ne 'Disconnected' })
foreach ($profile in $profiles) {
    Write-Host ("Network: {0} - {1}" -f $profile.Name, $profile.NetworkCategory)
    if ($profile.NetworkCategory -ne 'Private') {
        Write-Host '  Set this trusted home network to Private in Windows Settings > Network & Internet.' -ForegroundColor Yellow
    }
}
Write-Host ''
Write-Host 'You can now close this window and start Start-PocketPush.cmd normally.' -ForegroundColor Green
Read-Host 'Press Enter to close' | Out-Null
