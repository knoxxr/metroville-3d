# 🏙️ 메트로빌 3D (Metroville 3D — Cities: Skylines Three.js Edition)

**Three.js (WebGL2) + TypeScript + Vite + Tailwind CSS v4** 기반의 3D 도시 건설 시뮬레이션 게임입니다.  
PC와 모바일(세로·가로 멀티터치) 모두에서 바로 플레이할 수 있습니다.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fknoxxr%2Fmetroville-3d)

## ✨ 주요 특징
- **Three.js WebGL2 PBR + UnrealBloomPass**: 낮·노을·야경 3종 PMREM 환경 반사(IBL), 2048×2048 소프트 그림자, 연속 수면 셰이더, 8종 PBR 건축 외장, 자연 지형·강변 바위·외곽 침엽수림, 3D 구름·화물선·페리·헬리콥터.
- **시티즈: 스카이라인 스타일 UI & 조작**: 클릭-클릭 연속 도로/수도관/송전선 시공, 3D 90° 정렬 가이드라인, 직선·직각·곡선·도로 업그레이드 서브모드, 자석 스냅, 지하 3D 수도관 블루프린트, 현수선 고압 송전선, `Ctrl+Z` 15단계 실행취소.
- **깊이 있는 도시 시뮬레이션**: `60×60` 25개 광역 부지 확장, 특화 지구(IT·에코·관광·스마트 항만), 회전교차로·교통 흐름, 시장 미션, 동적 도시 이벤트, 재정·성장 통계 멀티라인 차트.
- **모바일 최적화**: 두 손가락 핀치 줌·팬·회전, 한손 조작 모드(`🏗️ 건설 / ✋ 이동 / 🔄 회전`), 노치·안전영역 대응 반응형 HUD.

## 🚀 로컬 실행 및 빌드
```bash
npm install
npm run dev      # 로컬 개발 서버
npm run build    # TypeScript 검사 + Vite 프로덕션 빌드 (dist/)
```
