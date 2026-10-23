param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $Path
if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Expected a regular local configuration file.' }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [Security.AccessControl.FileSecurity]::new()
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true, $false)
foreach ($identity in @($sid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow'))
}
$file.SetAccessControl($acl)
if (-not $file.GetAccessControl().AreAccessRulesProtected) { throw 'Configuration file ACL was not protected.' }
