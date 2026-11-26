# 메트로빌 3D — Unity 6 URP 설치형 네이티브 에디션 (Windows + macOS)

*Cities: Skylines*의 핵심 구조(연속 3차 베지어 곡선 도로, Unity 네이티브 Terrain, URP 6 4-Cascade CSM 그림자, 인테리어 매핑 초고층 유리 셰이더, 심도 굴절 강물 셰이더, 5단계 건물 성장·공급망·4단계 교육 시뮬레이션)를 **Unity 6 (`6000.0.x`) URP** 네이티브 설치형 프로젝트로 구축했습니다.

---

## 1. 빠른 시작 (3분 실행)

1. **Unity Hub**에서 **Unity 6 (`6000.0.28f1` 이상, URP 지원)** 설치
   - Windows/macOS 크로스 빌드를 원하면 설치 모듈에서 `Windows Build Support (IL2CPP)` 및 `Mac Build Support (IL2CPP)` 체크
2. Unity Hub → **Add → Add project from disk** → 이 저장소의 `unity/` 폴더 선택 후 열기
3. 에디터 상단 메뉴에서 **`Metroville → 1. Setup URP Photorealistic Scene & Assets`** 클릭
   - URP 6 렌더 파이프라인(4-Cascade 4096 CSM 그림자, MSAA 4x, Depth/Opaque Texture), 포스트프로세싱 Volume(ACES 톤매핑·틸트-시프트 DOF·Bloom), 커스텀 HLSL 셰이더 머티리얼, `MainCity.unity` 씬이 자동 생성됩니다.
4. 상단 **▶ Play** 버튼 클릭!

### 기본 조작법 (*Cities: Skylines* 동일)
- `W A S D` / 방향키: 지도 이동 · `Q / E`: 카메라 회전
- `우클릭 드래그`: 카메라 회전 & 각도(Pitch) 조절 · `휠 클릭 드래그`: 패닝
- `마우스 휠`: 줌 인/아웃
- `Space`: 일시정지 · `1 / 2 / 3`: 시뮬레이션 배속
- 하단 툴바 **`〰 곡선 도로`**: 시작점 클릭 → 곡률 중간점 클릭 → 도착점 클릭으로 부드러운 베지어 곡선 도로 및 자동 현수교 건설 (`ESC` / 우클릭 취소)

---

## 2. 실사 3D 건물·나무·차량 에셋 1클릭 교체 방법

코드 수정 없이 **Unity Asset Store / Sketchfab / Poly Pizza / Quixel**의 실사 `.fbx` 또는 `.glb` 에셋을 즉시 도시에 적용할 수 있습니다.

1. 다운로드한 3D 건물·나무·차량 에셋을 `unity/Assets/Prefabs/`에 임포트
2. 프로젝트 창에서 **`Assets/Settings/CityAssetRegistry.asset`** 선택
3. Inspector의 `Building Prefabs`, `Tree Prefabs`, `Vehicle Prefabs` 목록에 원하는 실사 프리팹을 드래그 앤 드롭
4. `CityTerrainBuilder`의 4개 `TerrainLayer`(잔디·고지대·절벽 바위·해변 모래)에 **Poly Haven / AmbientCG** 사진 PBR 텍스처를 연결하면 지형까지 100% 실사화됩니다.

---

## 3. Windows / macOS 설치형 실행 파일 빌드

Unity 에디터 상단 메뉴에서 원클릭으로 배포용 실행 파일을 뽑을 수 있습니다.
- **Windows x64 (`.exe`)**: `Metroville → 2. Build Windows Native (x64 .exe)` → `unity/Builds/Windows/Metroville3D.exe`
- **macOS Universal (`.app`, Apple Silicon + Intel)**: `Metroville → 3. Build macOS Native (Universal .app)` → `unity/Builds/macOS/Metroville3D.app`

---

## 4. C# 시뮬레이션 코어 자동 검증 (.NET 8)

`Assets/Scripts/Core/`는 Unity 의존성이 없는 순수 C# 9.0 코어로 분리되어 있어 Unity를 열지 않고도 터미널에서 즉시 컴파일 및 단위 테스트가 가능합니다.

```bash
dotnet run --project unity/Tests.DotNet/Metroville.Core.Tests.csproj
```
