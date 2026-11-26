# 메트로빌 3D — Unity 6 URP 설치형 네이티브 에디션 (Windows + macOS)

*Cities: Skylines*의 핵심 구조(연속 3차 베지어 곡선 도로, Unity 네이티브 Terrain, URP 6 4-Cascade CSM 그림자, 인테리어 매핑 초고층 유리 셰이더, 심도 굴절 강물 셰이더, **무료 CC0 Poly Haven 사진 PBR + glTFast `.glb`/`.fbx` 자동 연동 파이프라인**, **UI Toolkit 기반 본격 시티즈 스카이라인 HUD**)를 **Unity 6 (`6000.0.x`) URP** 네이티브 설치형 프로젝트로 구축했습니다.

---

## 1. 빠른 시작 (3분 실행)

1. **Unity Hub**에서 **Unity 6 (`6000.0.28f1` 이상)** 설치
   - Windows/macOS 설치형 빌드를 원하면 `Windows Build Support (IL2CPP)` 및 `Mac Build Support (IL2CPP)` 체크
2. Unity Hub → **Add → Add project from disk** → 저장소의 **`unity/`** 폴더 열기 (`com.unity.cloud.gltfast` 및 URP 17 자동 설치)
3. 상단 메뉴 **`Metroville → 1. Setup URP Photorealistic Scene & Assets`** 클릭
   - URP 6 파이프라인(4-Cascade CSM, MSAA 4x, Depth/Opaque Texture), 포스트프로세싱 Volume(ACES·Bloom·틸트-시프트 DOF), 커스텀 HLSL 셰이더 머티리얼, **UI Toolkit `SkylinesHUD`**, `MainCity.unity` 씬이 원클릭으로 생성됩니다.
4. 상단 메뉴 **`Metroville → 2. Download & Link Poly Haven PBR Textures (CC0)`** 클릭
   - Poly Haven 공식 API에서 **무료 CC0 사진 스캔 PBR 텍스처 6종**(초원 잔디·고지대·절벽 화강암·해변 모래·아스팔트·콘크리트 보도)을 자동 다운로드해 `TerrainLayer`와 도로 머티리얼에 즉시 적용합니다!
5. 상단 **▶ Play** 클릭!

---

## 2. 무료 CC0 3D 실사 건물 · 자동차 · 침엽수 모델 (`.glb` / `.fbx`) 자동 연동

1. 상단 메뉴 **`Metroville → 4. Open CC0 Asset Hub Window`** 열기
2. 허브 창의 원클릭 링크에서 무료 CC0 3D 팩(Kenney City Kit Commercial/Suburban, Kenney Car Kit, Quaternius Ultimate Nature Pack 등)을 받아 `unity/Assets/ExternalAssets/Models/` 하위 폴더(`Buildings/Office`, `Buildings/ResidentialHigh`, `Trees`, `Vehicles` 등)에 복사
3. **`Metroville → 3. Auto-Bind .glb/.fbx Models to CityAssetRegistry`** 클릭
   - `glTFast`로 임포트된 `.glb`/`.fbx` 모델의 바운딩 박스를 자동 측정해 **실제 미터 스케일 & 지면 피벗(`Y=0`) 정규화 프리팹**으로 변환한 뒤 **`Assets/Settings/CityAssetRegistry.asset`**에 자동 연결합니다!

---

## 3. UI Toolkit 본격 *Cities: Skylines* HUD 기능

- **좌상단 `i` InfoViews 드로어**: 기본 / 교통 흐름 / 전력망 / 상수도 / 지가 / 소음 공해 / 교육 / 공공서비스 전환
- **상단 중앙 Chirper 실시간 뉴스 피드**: 교통 정체·물류 부족·인구 성장에 실시간 반응
- **재정 · 공급망 · 4단계 교육 대시보드** (`📊 재정 · 공급망`): 주거·상업·산업 세율 슬라이더(5%~15%), 일일 세수/유지비, 산업→상업 물류 충족률 및 고속도로 수출입, 4단계 시민 교육 분포 막대
- **3D 건물 인스펙터**: 탐색 모드에서 건물 클릭 시 `Lv.1~5` 별점·거주민/일자리·전력/수도/물류 배지·**역사 건물 잠금(Historical Lock)**·개별 철거 지원
- **하단 커맨드 덱**: 배속(`❚❚`/`1x`/`2x`/`3x`), 주간·석양·야경·자동 순환, 실시간 RCI 수요 막대, 카테고리별 확장 서브툴 트레이(직선/곡선 베지어 도로, 인프라, 공공서비스, 공원·랜드마크, 철거)

---

## 4. Windows / macOS 설치형 실행 파일 빌드

- **Windows x64 (`.exe`)**: `Metroville → 2. Build Windows Native (x64 .exe)` → `unity/Builds/Windows/Metroville3D.exe`
- **macOS Universal (`.app`)**: `Metroville → 3. Build macOS Native (Universal .app)` → `unity/Builds/macOS/Metroville3D.app`

---

## 5. C# 9.0 시뮬레이션 코어 자동 검증 (.NET 8)

```bash
dotnet run --project unity/Tests.DotNet/Metroville.Core.Tests.csproj
```
