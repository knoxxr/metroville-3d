<#
.SYNOPSIS
    1-Click Windows x64 Installer Builder for Metroville 3D (Unity 6 URP).
    Auto-detects Unity 6 Editor, builds Metroville3D.exe headlessly, and packages
    a single-file Windows installer (Metroville3D-Setup-Windows-x64.exe) using Inno Setup 6.
#>
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$UnityProjectDir = Split-Path -Parent $ScriptDir
$BuildExePath = Join-Path $UnityProjectDir "Builds\Windows\Metroville3D.exe"
$LogPath = Join-Path $UnityProjectDir "Builds\unity-build.log"
$IssPath = Join-Path $ScriptDir "MetrovilleSetup.iss"
$InstallerOut = Join-Path $UnityProjectDir "Builds\Installer\Metroville3D-Setup-Windows-x64.exe"

Write-Host "=== Metroville 3D — Windows x64 설치 파일 자동 빌더 ===" -ForegroundColor Cyan

# 1. Locate installed Unity 6 Editor (6000.0.x)
$UnityCandidates = @(
    Get-ChildItem "C:\Program Files\Unity\Hub\Editor\6000.*\Editor\Unity.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending
)
if ($UnityCandidates.Count -eq 0) {
    Write-Error "Unity 6 (6000.0.x) 에디터를 찾을 수 없습니다. Unity Hub에서 Unity 6를 먼저 설치해주세요."
    exit 1
}
$UnityExe = $UnityCandidates[0].FullName
Write-Host "[1/3] Unity 6 감지됨: $UnityExe" -ForegroundColor Green

# 2. Run headless Unity 6 build (URP setup + Poly Haven PBR + StandaloneWindows64)
New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null
Write-Host "[2/3] Unity 6 헤드리스 Windows x64 빌드 실행 중 (로그: $LogPath)..." -ForegroundColor Yellow

$proc = Start-Process -FilePath $UnityExe -ArgumentList @(
    "-batchmode",
    "-nographics",
    "-projectPath", "`"$UnityProjectDir`"",
    "-executeMethod", "Metroville.Editor.MetrovilleBuildScript.BuildWindowsCLI",
    "-logFile", "`"$LogPath`"",
    "-quit"
) -Wait -PassThru

if ($proc.ExitCode -ne 0 -or !(Test-Path $BuildExePath)) {
    Write-Error "Unity 빌드에 실패했습니다 (ExitCode=$($proc.ExitCode)). 로그를 확인하세요: $LogPath"
    exit 1
}
Write-Host "      -> Unity 실행 파일 생성 완료: $BuildExePath" -ForegroundColor Green

# 3. Locate or install Inno Setup 6 (ISCC.exe) to compile single-file Windows Installer
$IsccCandidates = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ }

if ($IsccCandidates.Count -eq 0) {
    Write-Host "[3/3] Inno Setup 6 미설치 감지 -> winget으로 자동 설치 시도..." -ForegroundColor Yellow
    winget install --id JRSoftware.InnoSetup --silent --accept-package-agreements --accept-source-agreements
    $IsccCandidates = @(
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        "C:\Program Files\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ }
}

if ($IsccCandidates.Count -eq 0) {
    Write-Warning "Inno Setup 6를 찾을 수 없어 단독 실행 폴더만 생성되었습니다: $(Split-Path $BuildExePath)"
    exit 0
}

$IsccExe = $IsccCandidates[0]
Write-Host "[3/3] Inno Setup 6로 단일 설치 파일(.exe) 패키징 중..." -ForegroundColor Yellow
& $IsccExe $IssPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "Inno Setup 패키징 실패 (ExitCode=$LASTEXITCODE)"
    exit 1
}

Write-Host ""
Write-Host "=== 완료! Windows 설치 파일이 생성되었습니다 ===" -ForegroundColor Green
Write-Host "    $InstallerOut" -ForegroundColor White
Start-Process explorer.exe "/select,`"$InstallerOut`""
