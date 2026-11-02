# PocketPush Windows receiver - Windows PowerShell 5.1 or newer.
# Receives individual files over the local network and never deletes phone originals.

$ErrorActionPreference = 'Stop'
$Port = 8765
$SettingsPath = Join-Path $PSScriptRoot 'settings.json'

function New-RandomToken {
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Save-Settings {
    param([Parameter(Mandatory = $true)]$Settings)
    $json = $Settings | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($SettingsPath, $json, [System.Text.UTF8Encoding]::new($false))
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

function Send-JsonResponse {
    param(
        [Parameter(Mandatory = $true)]$Context,
        [Parameter(Mandatory = $true)][int]$StatusCode,
        [Parameter(Mandatory = $true)]$Body
    )
    $response = $Context.Response
    $response.StatusCode = $StatusCode
    $response.ContentType = 'application/json; charset=utf-8'
    $response.ContentEncoding = [System.Text.Encoding]::UTF8
    $response.Headers['Access-Control-Allow-Origin'] = '*'
    $response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-PhonePush-Token'
    $response.Headers['Access-Control-Max-Age'] = '600'
    $response.Headers['Cache-Control'] = 'no-store'
    $response.KeepAlive = $false
    $json = $Body | ConvertTo-Json -Depth 5 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
}

function Get-SafeFileName {
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { $Name = 'upload.bin' }
    $Name = [System.IO.Path]::GetFileName($Name)
    $invalid = [System.IO.Path]::GetInvalidFileNameChars()
    foreach ($character in $invalid) { $Name = $Name.Replace([string]$character, '_') }
    $Name = $Name.Trim().TrimEnd('.')
    if ([string]::IsNullOrWhiteSpace($Name)) { $Name = 'upload.bin' }
    if ($Name.Length -gt 180) {
        $extension = [System.IO.Path]::GetExtension($Name)
        $base = [System.IO.Path]::GetFileNameWithoutExtension($Name)
        $keep = [Math]::Max(1, 180 - $extension.Length)
        $Name = $base.Substring(0, [Math]::Min($base.Length, $keep)) + $extension
    }
    $stem = [System.IO.Path]::GetFileNameWithoutExtension($Name)
    if ($stem -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') { $Name = "_$Name" }
    return $Name
}

function Move-ToUniquePath {
    param(
        [Parameter(Mandatory = $true)][string]$TemporaryPath,
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string]$FileName
    )
    $extension = [System.IO.Path]::GetExtension($FileName)
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
    for ($index = 0; $index -lt 10000; $index++) {
        if ($index -eq 0) { $candidateName = $FileName }
        else { $candidateName = '{0} ({1}){2}' -f $baseName, $index, $extension }
        $candidatePath = Join-Path $Directory $candidateName
        try {
            # File.Move without overwrite is intentional: existing files are never replaced.
            [System.IO.File]::Move($TemporaryPath, $candidatePath)
            return $candidatePath
        }
        catch [System.IO.IOException] {
            if (Test-Path -LiteralPath $candidatePath) { continue }
            throw
        }
    }
    throw 'Could not find an unused filename after 10,000 attempts.'
}

function Test-Token {
    param([string]$Provided, [string]$Expected)
    if ([string]::IsNullOrEmpty($Provided) -or [string]::IsNullOrEmpty($Expected)) { return $false }
    if ($Provided.Length -ne $Expected.Length) { return $false }
    $difference = 0
    for ($i = 0; $i -lt $Expected.Length; $i++) {
        $difference = $difference -bor ([int][char]$Provided[$i] -bxor [int][char]$Expected[$i])
    }
    return ($difference -eq 0)
}

Write-Host ''
Write-Host '  PocketPush' -ForegroundColor Green
Write-Host '  Local file receiver' -ForegroundColor DarkGray
Write-Host ''

if (-not (Test-Path -LiteralPath $SettingsPath)) {
    $defaultDestination = Join-Path $PSScriptRoot 'Incoming'
    Write-Host 'First-run setup' -ForegroundColor Cyan
    Write-Host 'Enter the folder where received files should be saved.'
    Write-Host 'You can use your existing LocalSend folder, or press Enter for:'
    Write-Host "  $defaultDestination" -ForegroundColor DarkGray
    $chosenDestination = Read-Host 'Destination folder'
    if ([string]::IsNullOrWhiteSpace($chosenDestination)) { $chosenDestination = $defaultDestination }
    $chosenDestination = [Environment]::ExpandEnvironmentVariables($chosenDestination.Trim().Trim('"'))
    if (-not [System.IO.Path]::IsPathRooted($chosenDestination)) { $chosenDestination = Join-Path $PSScriptRoot $chosenDestination }
    $settings = [ordered]@{
        destinationDirectory = [System.IO.Path]::GetFullPath($chosenDestination)
        token = (New-RandomToken)
    }
    Save-Settings $settings
}
else {
    try { $settings = Get-Content -LiteralPath $SettingsPath -Raw | ConvertFrom-Json }
    catch { throw "Could not read settings.json: $($_.Exception.Message)" }
}

if ([string]::IsNullOrWhiteSpace([string]$settings.destinationDirectory)) { throw 'settings.json has no destinationDirectory.' }
if ([string]::IsNullOrWhiteSpace([string]$settings.token)) {
    $settings | Add-Member -NotePropertyName token -NotePropertyValue (New-RandomToken) -Force
    Save-Settings $settings
}
$destinationDirectory = [Environment]::ExpandEnvironmentVariables([string]$settings.destinationDirectory)
if (-not [System.IO.Path]::IsPathRooted($destinationDirectory)) { $destinationDirectory = Join-Path $PSScriptRoot $destinationDirectory }
$destinationDirectory = [System.IO.Path]::GetFullPath($destinationDirectory)
[System.IO.Directory]::CreateDirectory($destinationDirectory) | Out-Null
Get-ChildItem -LiteralPath $destinationDirectory -Filter '.phonepush-*.tmp' -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")
try {
    $listener.Start()
}
catch {
    Write-Host 'Could not start the receiver.' -ForegroundColor Red
    Write-Host 'Run Install-PocketPush.cmd once (it requests administrator permission), then try again.' -ForegroundColor Yellow
    Write-Host "Details: $($_.Exception.Message)" -ForegroundColor DarkGray
    Read-Host 'Press Enter to close' | Out-Null
    exit 1
}

$addresses = Get-NetworkIPv4Addresses
Write-Host 'Receiver is running.' -ForegroundColor Green
Write-Host "Destination: $destinationDirectory" -ForegroundColor Gray
Write-Host "Port:        $Port" -ForegroundColor Gray
Write-Host ''
if ($addresses.Count -eq 0) {
    Write-Host 'No active IPv4 address was found. Connect this PC to your Wi-Fi/LAN.' -ForegroundColor Yellow
}
else {
    Write-Host 'Enter one of these addresses in the PocketPush app:' -ForegroundColor Cyan
    foreach ($address in $addresses) { Write-Host "  http://${address}:$Port" -ForegroundColor White }
}
Write-Host ''
Write-Host 'Pairing key (enter this once in the phone app):' -ForegroundColor Cyan
Write-Host "  $($settings.token)" -ForegroundColor Yellow
Write-Host ''
Write-Host 'Keep this window open while transferring. Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $request = $context.Request
            $path = $request.Url.AbsolutePath.TrimEnd('/').ToLowerInvariant()
            if ([string]::IsNullOrEmpty($path)) { $path = '/' }

            if ($request.HttpMethod -eq 'OPTIONS') {
                $context.Response.StatusCode = 204
                $context.Response.Headers['Access-Control-Allow-Origin'] = '*'
                $context.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
                $context.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-PhonePush-Token'
                $context.Response.Headers['Access-Control-Max-Age'] = '600'
                $context.Response.ContentLength64 = 0
                $context.Response.Close()
                continue
            }

            $providedToken = $request.Headers['X-PhonePush-Token']
            if (-not (Test-Token -Provided $providedToken -Expected ([string]$settings.token))) {
                Send-JsonResponse -Context $context -StatusCode 401 -Body @{ ok = $false; error = 'Pairing key is incorrect.' }
                continue
            }

            if ($request.HttpMethod -eq 'GET' -and $path -eq '/health') {
                Send-JsonResponse -Context $context -StatusCode 200 -Body @{
                    ok = $true
                    computer = $env:COMPUTERNAME
                    destination = [System.IO.Path]::GetFileName($destinationDirectory.TrimEnd('\'))
                    version = '1.1.2'
                }
                continue
            }

            if ($request.HttpMethod -eq 'POST' -and $path -eq '/upload') {
                $requestedName = Get-SafeFileName -Name ([string]$request.QueryString['name'])
                $sourceName = [string]$request.QueryString['source']
                $temporaryPath = Join-Path $destinationDirectory ('.phonepush-' + [guid]::NewGuid().ToString('N') + '.tmp')
                $receivedBytes = [int64]0
                try {
                    $stream = [System.IO.FileStream]::new($temporaryPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
                    try {
                        $request.InputStream.CopyTo($stream)
                        $stream.Flush()
                        $receivedBytes = $stream.Length
                    }
                    finally { $stream.Dispose() }

                    if ($request.ContentLength64 -ge 0 -and $receivedBytes -ne $request.ContentLength64) {
                        throw "Incomplete upload: received $receivedBytes of $($request.ContentLength64) bytes."
                    }
                    $savedPath = Move-ToUniquePath -TemporaryPath $temporaryPath -Directory $destinationDirectory -FileName $requestedName
                    $savedName = [System.IO.Path]::GetFileName($savedPath)
                    Write-Host ('[{0}] {1} ({2}) from {3}' -f (Get-Date -Format 'HH:mm:ss'), $savedName, $receivedBytes, $sourceName) -ForegroundColor Green
                    Send-JsonResponse -Context $context -StatusCode 200 -Body @{ ok = $true; fileName = $savedName; bytes = $receivedBytes }
                }
                catch {
                    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue }
                    throw
                }
                continue
            }

            Send-JsonResponse -Context $context -StatusCode 404 -Body @{ ok = $false; error = 'Unknown endpoint.' }
        }
        catch {
            Write-Host "Request error: $($_.Exception.Message)" -ForegroundColor Red
            try {
                if ($context.Response.OutputStream.CanWrite) {
                    Send-JsonResponse -Context $context -StatusCode 500 -Body @{ ok = $false; error = 'The receiver could not save this file.' }
                }
            }
            catch { try { $context.Response.Close() } catch { } }
        }
    }
}
finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
}
