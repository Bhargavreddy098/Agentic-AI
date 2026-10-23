param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][ValidateSet('database-backup', 'artifact-store')][string]$Purpose
)
$ErrorActionPreference = 'Stop'
[Reflection.Assembly]::LoadWithPartialName('System.Security') | Out-Null
$entropy = [Text.Encoding]::UTF8.GetBytes('ASI key v1:' + $Purpose)
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
if (Test-Path -LiteralPath $Path) {
    $entry = Get-Item -LiteralPath $Path
    if ($entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Key file must be a regular protected file.' }
    $protected = [IO.File]::ReadAllBytes($entry.FullName)
    $key = [Security.Cryptography.ProtectedData]::Unprotect($protected, $entropy, $scope)
} else {
    $key = [byte[]]::new(32)
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($key) } finally { $random.Dispose() }
    $protected = [Security.Cryptography.ProtectedData]::Protect($key, $entropy, $scope)
    $file = [IO.FileStream]::new($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $file.Write($protected, 0, $protected.Length); $file.Flush($true) } finally { $file.Dispose() }
}
if ($key.Length -ne 32) { throw 'Invalid stored key length.' }
# Captured only by the trusted parent process pipe; callers must never log this output.
[Console]::Out.Write([Convert]::ToBase64String($key))
