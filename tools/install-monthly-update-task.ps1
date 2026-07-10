$ErrorActionPreference = "Stop"

$taskName = "Context Monthly Update Watch"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$watcherPath = (Resolve-Path (Join-Path $PSScriptRoot "update-watcher.mjs")).Path

$scheduler = New-Object -ComObject "Schedule.Service"
$scheduler.Connect()
$folder = $scheduler.GetFolder("\")
$definition = $scheduler.NewTask(0)
$definition.RegistrationInfo.Description = "Checks user-confirmed public Context sources when their 28-day interval is due."
$definition.Settings.Enabled = $true
$definition.Settings.StartWhenAvailable = $true
$definition.Settings.DisallowStartIfOnBatteries = $false
$definition.Settings.StopIfGoingOnBatteries = $false
$definition.Settings.ExecutionTimeLimit = "PT30M"

$start = Get-Date -Day 1 -Hour 9 -Minute 0 -Second 0
if ($start -le (Get-Date)) { $start = $start.AddMonths(1) }
$trigger = $definition.Triggers.Create(4)
$trigger.StartBoundary = $start.ToString("s")
$trigger.DaysOfMonth = 1
$trigger.MonthsOfYear = 4095
$trigger.Enabled = $true

$action = $definition.Actions.Create(0)
$action.Path = $nodePath
$action.Arguments = "`"$watcherPath`" check"
$action.WorkingDirectory = (Split-Path $watcherPath -Parent)

$folder.RegisterTaskDefinition($taskName, $definition, 6, $null, $null, 3, $null) | Out-Null

Write-Host "Registered '$taskName' for 9:00 AM on the first day of every month."
Write-Host "If the PC is off then, Windows starts the missed check when the PC is next available."
Write-Host "The task checks only sources you explicitly confirm in Context."
