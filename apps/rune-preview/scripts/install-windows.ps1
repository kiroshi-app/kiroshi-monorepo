param(
	[Parameter(Mandatory)][string]$Installer,
	[Parameter(Mandatory)][string]$LogDirectory
)

$ErrorActionPreference = 'Stop'
$LaunchSeconds = 20
$InstallDirectory = Join-Path $env:LOCALAPPDATA 'Programs\Kiroshi'
$Executable = Join-Path $InstallDirectory 'kiroshi-rune-preview.exe'

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
$InstallLog = Join-Path $LogDirectory 'install.log'

function Write-Log([string]$Line) {
	$Line | Tee-Object -FilePath $InstallLog -Append
}

Write-Log "installing $Installer silently"
$install = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru
Write-Log "the installer exited $($install.ExitCode)"
if ($install.ExitCode -ne 0) {
	throw "the installer exited $($install.ExitCode), see $InstallLog"
}
if (-not (Test-Path $Executable)) {
	throw "the installer left no $Executable, see $InstallLog"
}
Get-ChildItem -Recurse -File $InstallDirectory | ForEach-Object { Write-Log "installed $($_.FullName)" }

Write-Log "launching $Executable for $LaunchSeconds s"
$launch = Start-Process -FilePath $Executable -PassThru `
	-RedirectStandardOutput (Join-Path $LogDirectory 'launch-stdout.log') `
	-RedirectStandardError (Join-Path $LogDirectory 'launch-stderr.log')
Start-Sleep -Seconds $LaunchSeconds
if ($launch.HasExited) {
	Write-Log "the installed app exited $($launch.ExitCode) before $LaunchSeconds s"
	throw "the installed app exited $($launch.ExitCode) before $LaunchSeconds s, see $LogDirectory"
}
Stop-Process -Id $launch.Id -Force
Write-Log "the installed app ran $LaunchSeconds s and was stopped"
