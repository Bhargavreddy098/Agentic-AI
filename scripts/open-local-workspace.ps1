param([Parameter(Mandatory=$true)][string]$Url)
$ErrorActionPreference = 'Stop'
$gatewayUri = [Uri]$Url
if ($gatewayUri.Scheme -ne 'http' -or $gatewayUri.Host -notin @('127.0.0.1', 'localhost', '[::1]', '::1') -or $gatewayUri.AbsolutePath -notmatch '^/handoff/[A-Za-z0-9_-]{43}$' -or $gatewayUri.Query -or $gatewayUri.Fragment) {
    throw 'Only the trusted loopback gateway handoff can be opened.'
}
Start-Process -FilePath $Url -WindowStyle Hidden
