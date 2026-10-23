param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$reader = $null
$guard = $null
$monitor = $null
try {
    Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1')
    Add-Type -Path (Join-Path $PSScriptRoot '..\backend\src\platform\repository\windows-snapshot.cs')
    $request = [Console]::ReadLine() | ConvertFrom-Json
    $guard = [ASILockedTree]::new($Root, [string[]]@(), $false)
    $monitor = [ASIChangeMonitor]::new($Root)
    $gitBase = @('--no-lazy-fetch', '--no-optional-locks', '--no-replace-objects', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=NUL', '-c', 'core.excludesFile=NUL', '-C', $Root)
    $commit = [string](& git.exe @gitBase rev-parse --verify --quiet HEAD)
    if ($LASTEXITCODE -ne 0) { $commit = $null }
    if ($request.includeUncommitted) { $gitArgs = $gitBase + @('ls-files', '-z', '--stage', '--cached', '--others', '--exclude-standard') }
    else {
        if (-not $commit) { throw 'REPOSITORY_CHANGED' }
        $gitArgs = $gitBase + @('ls-tree', '-rz', '--full-tree', 'HEAD')
    }
    $inventory = [string](& git.exe @gitArgs 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'ROOT_NOT_AUTHORIZED' }
    $paths = [Collections.Generic.List[string]]::new()
    $modes = @{}
    $hashes = @{}
    foreach ($entry in $inventory.Split([char[]]@([char]0), [StringSplitOptions]::RemoveEmptyEntries)) {
        $name = $entry
        $mode = '100644'
        $hash = $null
        if ($request.includeUncommitted) {
            if ($entry -match '^([0-9]{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([0-3])\t(.+)$') {
                if ($Matches[3] -ne '0') { throw 'REPOSITORY_CHANGED' }
                $mode = $Matches[1]; $hash = $Matches[2]; $name = $Matches[4]
            }
        } else {
            if ($entry -notmatch '^([0-9]{6}) blob ([a-f0-9]{40}|[a-f0-9]{64})\t(.+)$') { throw 'ROOT_NOT_AUTHORIZED' }
            $mode = $Matches[1]; $hash = $Matches[2]; $name = $Matches[3]
        }
        if ($mode -notin @('100644','100755')) { throw 'ROOT_NOT_AUTHORIZED' }
        if ([IO.Path]::IsPathRooted($name) -or $name.Contains('\') -or $name.Contains(':')) { throw 'ROOT_NOT_AUTHORIZED' }
        foreach ($part in $name.Split('/')) {
            if (-not $part -or $part -in @('.','..') -or $part -match '[\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') { throw 'ROOT_NOT_AUTHORIZED' }
            $lower = $part.ToLowerInvariant()
            if ($lower -in @('.git','.git-credentials','.netrc','.pypirc','.ssh','.aws','.codex','.claude','id_rsa','id_ed25519') -or
                ($lower.StartsWith('.env') -and $lower -ne '.env.example') -or $lower -match '\.(pem|pfx|p12|key)$') { throw 'SENSITIVE_SOURCE' }
        }
        $paths.Add($name); $modes[$name]=$mode; $hashes[$name]=$hash
    }
    if ($paths.Count -gt 1000) { throw 'QUOTA_EXCEEDED' }
    if ($request.includeUncommitted) { $reader = [ASILockedTree]::new($Root, $paths.ToArray(), $true) }
    $after = [string](& git.exe @gitArgs 2>$null)
    if ($LASTEXITCODE -ne 0 -or $after -cne $inventory) { throw 'REPOSITORY_CHANGED' }
    if ($request.includeUncommitted) { $files = @($reader.ReadAll()); $removed = @($reader.MissingPaths) }
    else {
        $orderedHashes = [string[]]@($paths | ForEach-Object { $hashes[$_] })
        $files = @([ASILockedTree]::ReadCommitted($Root,$paths.ToArray(),$orderedHashes)); $removed = @()
    }
    $monitor.AssertUnchanged()
    $resultFiles = @($files | ForEach-Object { @{ path=$_.Path; content=$_.Content; digest=$_.Digest; mode=$modes[$_.Path] } })
    [Console]::Out.Write((@{ files=$resultFiles; removedPaths=$removed; commitSha=$commit } | ConvertTo-Json -Depth 6 -Compress))
} catch {
    $code = 'ROOT_NOT_AUTHORIZED'
    foreach ($known in @('REPOSITORY_CHANGED','QUOTA_EXCEEDED','SENSITIVE_SOURCE')) { if ($_.Exception.Message -match $known) { $code=$known } }
    [Console]::Error.Write($code)
    exit 1
} finally {
    if ($monitor) { $monitor.Dispose() }
    if ($reader) { $reader.Dispose() }
    if ($guard) { $guard.Dispose() }
}
