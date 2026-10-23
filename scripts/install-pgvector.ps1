param(
    [string]$PostgresRoot = 'C:\Program Files\PostgreSQL\17',
    [string]$SourceRoot = (Join-Path $PSScriptRoot '..\data\tools\pgvector-0.8.7')
)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from PowerShell as Administrator. It installs pgvector extension files only.'
}
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$target = (Resolve-Path -LiteralPath $PostgresRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $target 'bin\postgres.exe'))) {
    throw 'PostgresRoot must identify the PostgreSQL installation.'
}
$sourceCommit = (& git -C $source rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -ne 'f37c13f68b57d2c3472b2214fbcff699d6d34876') {
    throw 'Expected official pgvector v0.8.7 source commit.'
}
foreach ($required in @('vector.dll', 'vector.control', 'sql\vector--0.8.7.sql')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $required))) { throw "Missing build artifact: $required" }
}
Copy-Item -LiteralPath (Join-Path $source 'vector.dll') -Destination (Join-Path $target 'lib\vector.dll')
Copy-Item -LiteralPath (Join-Path $source 'vector.control') -Destination (Join-Path $target 'share\extension\vector.control')
Get-ChildItem -LiteralPath (Join-Path $source 'sql') -Filter 'vector--*.sql' |
    Copy-Item -Destination (Join-Path $target 'share\extension')
Write-Output 'pgvector 0.8.7 installed. No existing database was modified. Run npm run test:postgres next.'
