param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
$directory = Get-Item -LiteralPath $Path
if (-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Launcher path must be a real directory, not a junction or symbolic link.'
}
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true, $false)
$inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
$propagate = [Security.AccessControl.PropagationFlags]::None
$allow = [Security.AccessControl.AccessControlType]::Allow
foreach ($identity in @($sid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', $inherit, $propagate, $allow))
}
$directory.SetAccessControl($acl)
$effective = $directory.GetAccessControl()
if (-not $effective.AreAccessRulesProtected) { throw 'Launcher directory inheritance was not disabled.' }
