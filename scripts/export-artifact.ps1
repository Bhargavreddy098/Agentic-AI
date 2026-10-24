param([switch]$ValidateOnly)
$ErrorActionPreference='Stop'
try {
 Add-Type -Path (Join-Path $PSScriptRoot '../backend/src/platform/repository/windows-export.cs')
 $inputValue=[Console]::ReadLine() | ConvertFrom-Json
 [ASIExport]::Write([string]$inputValue.destination,[Convert]::FromBase64String([string]$inputValue.content),$ValidateOnly.IsPresent)
 [Console]::WriteLine('EXPORTED')
} catch { [Console]::Error.WriteLine('DESTINATION_NOT_ALLOWED_OR_OUTCOME_UNKNOWN'); exit 1 }
