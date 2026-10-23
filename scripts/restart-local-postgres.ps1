# Explicit administrative maintenance helper. Never invoked by application startup.
$ErrorActionPreference = 'Stop'
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator rights are required.'
    }
    $service = Get-Service -Name 'postgresql-x64-17'
    if ($service.Status -ne 'Running') { throw 'Expected the existing PostgreSQL 17 service to be running.' }
    Restart-Service -Name 'postgresql-x64-17'
    $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(30))
    exit 0
} catch {
    [Console]::Error.WriteLine('POSTGRESQL_SERVICE_RESTART_FAILED: inspect the PostgreSQL 17 service locally.')
    exit 1
}
