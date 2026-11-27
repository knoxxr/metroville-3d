<#
.SYNOPSIS
    1-Click Windows x64 Installer Builder for Metroville 3D (Unity 6 URP).
    Auto-detects Unity 6 Editor across Unity Hub config & C:/D: drives (or via -UnityPath),
    builds Metroville3D.exe headlessly, and packages Metroville3D-Setup-Windows-x64.exe via Inno Setup 6.
#>
param(
    [string]$UnityPath = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$UnityProjectDir = Split-Path -Parent $ScriptDir
$BuildExePath = Join-Path $UnityProjectDir "Builds\Windows\Metroville3D.exe"
$LogPath = Join-Path $UnityProjectDir "Builds\unity-build.log"
$IssPath = Join-Path $ScriptDir "MetrovilleSetup.iss"
$InstallerOut = Join-Path $UnityProjectDir "Builds\Installer\Metroville3D-Setup-Windows-x64.exe"

Write-Host "=== Metroville 3D — Windows x64 설치 파일 자동 빌더 ===" -ForegroundColor Cyan

# 1. Locate installed Unity Editor (supports -UnityPath, Unity Hub JSON config, and C:/D: default paths)
$FoundEditors = New-Object System.Collections.Generic.List[string]

if ($UnityPath -and (Test-Path $UnityPath)) {
    $FoundEditors.Add($UnityPath)
}

# Check Unity Hub editors-v2.json (detects custom install drives automatically)
$HubEditorsJson = Join-Path $env:APPDATA "UnityHub\editors-v2.json"
if (Test-Path $HubEditorsJson) {
    try {
        $json = Get-Content $HubEditorsJson -Raw | ConvertFrom-Json
        foreach ($item in $json.data) {
            foreach ($loc in $item.location) {
                if ($loc -and (Test-Path $loc)) {
                    $FoundEditors.Add($loc)
                }
            }
        }
    } catch { }
}

# Check standard C: and D: Unity Hub Editor paths (any 6000.* or 2022/2023 version)
$SearchGlobs = @(
    "C:\Program Files\Unity\Hub\Editor\*\Editor\Unity.exe",
    "D:\Program Files\Unity\Hub\Editor\*\Editor\Unity.exe",
    "D:\Unity\Hub\Editor\*\Editor\Unity.exe",
    "C:\Unity\Hub\Editor\*\Editor\Unity.exe"
)
foreach ($glob in $SearchGlobs) {
    Get-ChildItem $glob -ErrorAction SilentlyContinue | ForEach-Object {
        if (!$FoundEditors.Contains($_.FullName)) {
            $FoundEditors.Add($_.FullName)
        }
    }
}

# Prefer Unity 6 (6000.*) first, otherwise latest detected Unity editor
$Unity6 = $FoundEditors | Where-Object { $_ -match "6000\." } | Sort-Object -Descending | Select-Object -First 1
$UnityExe = if ($Unity6) { $Unity6 } else { $FoundEditors | Sort-Object -Descending | Select-Object -First 1 }

if (!$UnityExe) {
    Write-Host ""
    Write-Host "[!] PC에 설치된 Unity 에디터를 찾지 못했습니다." -ForegroundColor Red
    Write-Host "    1) Unity Hub가 아직 없다면 아래 명령으로 설치하세요:" -ForegroundColor Yellow
    Write-Host "       winget install Unity.UnityHub" -ForegroundColor White
    Write-Host "    2) Unity Hub 실행 -> 로그인(무료 Personal) -> Installs -> Unity 6 (6000.0.x LTS) 설치" -ForegroundColor Yellow
    Write-Host "    3) 다른 폴더에 이미 Unity가 설치되어 있다면 직접 경로를 지정해 실행하세요:" -ForegroundColor Yellow
    Write-Host "       powershell -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -UnityPath `"D:\경로\Unity.exe`"" -ForegroundColor White
    exit 1
}

Write-Host "[1/3] Unity 에디터 감지됨: $UnityExe" -ForegroundColor Green

# 2. Run headless Unity build (URP setup + Poly Haven PBR + StandaloneWindows64)
New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null
Write-Host "[2/3] Unity 헤드리스 Windows x64 빌드 실행 중 (최초 실행 시 패키지 임포트로 3~8분 소요, 로그: $LogPath)..." -ForegroundColor Yellow

$proc = Start-Process -FilePath $UnityExe -ArgumentList @(
    "-batchmode",
    "-nographics",
    "-projectPath", "`"$UnityProjectDir`"",
    "-executeMethod", "Metroville.Editor.MetrovilleBuildScript.BuildWindowsCLI",
    "-logFile", "`"$LogPath`"",
    "-quit"
) -Wait -PassThru

if ($proc.ExitCode -ne 0 -or !(Test-Path $BuildExePath)) {
    Write-Error "Unity 빌드에 실패했습니다 (ExitCode=$($proc.ExitCode)). 로그 끝부분을 확인하세요: $LogPath"
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
