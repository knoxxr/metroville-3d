import type { CityState, DistrictSpecId, InfoViewId, ToolDef, ZoneSpec, ActiveEvent } from './types';

export const GRID = 60;
export const SECTOR = 12;
export const SECS = 5;
export const SAVE_KEY = 'metroville_3d_threejs_v7';
export const DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIRS8: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1]
];

export const inBounds = (x: number, y: number): boolean => x >= 0 && x < GRID && y >= 0 && y < GRID;
export const isRoadType = (t?: string | null): boolean =>
  t === 'road' || t === 'avenue' || t === 'highway' || t === 'roundabout';
export const sectorIdx = (x: number, y: number): number =>
  Math.floor(y / SECTOR) * SECS + Math.floor(x / SECTOR);

export const PIPE_OFFSETS: [number, number][] = [];
for (let dy = -4; dy <= 4; dy++) {
  for (let dx = -4; dx <= 4; dx++) {
    if (Math.hypot(dx, dy) <= 4.15) PIPE_OFFSETS.push([dx, dy]);
  }
}

export const INFO_VIEWS: { id: InfoViewId; icon: string; name: string }[] = [
  { id: 'none',      icon: '🏙️', name: '기본 시점' },
  { id: 'power',     icon: '⚡', name: '전력망' },
  { id: 'water',     icon: '💧', name: '지하 상하수도' },
  { id: 'traffic',   icon: '🚗', name: '교통 흐름' },
  { id: 'district',  icon: '🏘️', name: '특화 지구' },
  { id: 'fire',      icon: '🚒', name: '화재·소방' },
  { id: 'police',    icon: '🚓', name: '범죄·치안' },
  { id: 'health',    icon: '🚑', name: '보건·의료' },
  { id: 'edu',       icon: '🎓', name: '교육 수준' },
  { id: 'garbage',   icon: '🗑️', name: '쓰레기 처리' },
  { id: 'landvalue', icon: '💎', name: '지가·공해' },
];

export const CATEGORIES = [
  { id: 'road', name: '🛣️ 도로·교차로·교통' },
  { id: 'zone', name: '🏗️ 대규모 구역(RCI·O)' },
  { id: 'util', name: '⚡ 전기·지하수도관' },
  { id: 'svc',  name: '🚒 소방·치안·의료' },
  { id: 'edu',  name: '🎓 교육·공원·랜드마크' },
];

export const MILESTONES = [
  { idx: 0, pop: 0,     name: '개척 정착지', reward: 0 },
  { idx: 1, pop: 200,   name: '성장하는 신도시', reward: 9500 },
  { idx: 2, pop: 600,   name: '광역 거점 도시', reward: 19000 },
  { idx: 3, pop: 1500,  name: '대도시권(메트로)', reward: 35000 },
  { idx: 4, pop: 4000,  name: '글로벌 메가폴리스', reward: 70000 },
  { idx: 5, pop: 15000, name: '초거대 미래 수도', reward: 120000 },
];

export const POLICIES = [
  { id: 'free_transit', name: '🚇 무료 대중교통', desc: '버스·지하철 이용률 대폭 상승, 통근 차량 추가 25% 감소 (유지비 +₩65/일)', cost: 65 },
  { id: 'recycling',    name: '♻️ 재활용 의무화', desc: '전 구역 쓰레기 발생량 30% 감소, 공해 완화 (유지비 +₩50/일)', cost: 50 },
  { id: 'smoke_det',    name: '🚨 연기 감지기 배포', desc: '건물 화재 발생 확률 50% 감소 (유지비 +₩55/일)', cost: 55 },
  { id: 'hightech',     name: '🔬 첨단 기술 장려', desc: '지가(Land Value) +15 상승, 오피스·고밀도 빌딩 성장 가속 (유지비 +₩95/일)', cost: 95 },
];

export interface DistrictSpecDef {
  id: DistrictSpecId;
  name: string;
  icon: string;
  color: string;
  hex: number;
  desc: string;
  upkeep: number;
}

export const DISTRICT_SPECS: DistrictSpecDef[] = [
  { id: 'general',    name: '일반 지구',      icon: '🏙️', color: '#94a3b8', hex: 0x94a3b8, desc: '표준 세율 및 균형 잡힌 도시 개발 지구', upkeep: 0 },
  { id: 'it_hub',     name: 'IT·핀테크 특구', icon: '💻', color: '#06b6d4', hex: 0x06b6d4, desc: '오피스 세수 +32%, 지가 +12, 교육 효율 극대화 (유지비 ₩40/일)', upkeep: 40 },
  { id: 'eco_garden', name: '에코 가든 주거', icon: '🌿', color: '#22c55e', hex: 0x22c55e, desc: '주거 행복도 +12, 쓰레기 -28%, 공해 정화 (유지비 ₩35/일)', upkeep: 35 },
  { id: 'tourism',    name: '관광·레저 특구', icon: '🎡', color: '#ec4899', hex: 0xec4899, desc: '상업·랜드마크 세수 +32%, 야경 활력 증가 (유지비 ₩45/일)', upkeep: 45 },
  { id: 'smart_port', name: '스마트 물류항만', icon: '⚓', color: '#f59e0b', hex: 0xf59e0b, desc: '산업 생산·세수 +30%, 공장 공해 -25% 절감 (유지비 ₩35/일)', upkeep: 35 },
];

export const DISTRICT_SPEC_MAP: Record<DistrictSpecId, DistrictSpecDef> = Object.fromEntries(
  DISTRICT_SPECS.map(d => [d.id, d])
) as Record<DistrictSpecId, DistrictSpecDef>;

export const TOOLS: ToolDef[] = [
  { id: 'inspect', name: '조회', icon: '🔍', cost: 0, cat: 'all', ms: 0, key: 'V', desc: '타일·건물 상세 조회 및 도로 즉시 업그레이드' },
  // Roads, Roundabout, Mass-Block Planner & Transit
  { id: 'road',       name: '2차선 도로',     icon: '🛣️', cost: 70,  bridgeCost: 220, cat: 'road', ms: 0, upkeep: 1.5, cap: 18, spd: 1.0, desc: '스냅·직각 자동 정렬! 기존 도로 위 드래그로 즉시 변경' },
  { id: 'avenue',     name: '4차선 대로',     icon: '🛤️', cost: 200, bridgeCost: 450, cat: 'road', ms: 2, upkeep: 4, cap: 42, spd: 1.4, noise: 7, desc: '가로수 중앙분리대 간선 대로 (2차선 위 드래그 시 자동 확장!)' },
  { id: 'roundabout', name: '회전교차로',     icon: '🔄', cost: 340, bridgeCost: 520, cat: 'road', ms: 1, upkeep: 5, cap: 72, spd: 1.5, desc: '정체 교차로 위에 클릭해 분수 로터리로 업그레이드! (용량 4배)' },
  { id: 'highway',    name: '고속도로',       icon: '🛣️', cost: 320, bridgeCost: 620, cat: 'road', ms: 4, upkeep: 6, cap: 82, spd: 1.95, noise: 15, desc: '광역 지구 간 초고속 간선도로 (교차로·교량 자동 연결)' },
  { id: 'city_block', name: '블록 단지 조성', icon: '📐', cost: 85,  cat: 'road', ms: 0, desc: '사각형 드래그 한 번에 5×5 격자 도로망 + 지하 수도관 일괄 시공!' },
  { id: 'bus_stop',   name: '버스 터미널',    icon: '🚌', cost: 1100, cat: 'road', ms: 2, powerUse: 2, upkeep: 22, radius: 7, desc: '주변 광역 블록 승용차 통행량 30% 감소' },
  { id: 'metro',      name: '지하철역',       icon: '🚇', cost: 3200, cat: 'road', ms: 3, powerUse: 6, upkeep: 45, radius: 8, desc: '2곳 이상 건설 시 광역 지하철망 연결·통근 차량 55% 감소' },
  // Zoning
  { id: 'zone_res_low',  name: '저밀 주거', icon: '🏡', cost: 8,  cat: 'zone', ms: 0, zCol: '#4ade80', desc: '도로변 자동 조닝 격자 표시! 단독주택 단지 지정' },
  { id: 'zone_res_high', name: '고밀 주거', icon: '🏢', cost: 16, cat: 'zone', ms: 3, zCol: '#16a34a', desc: '고층 아파트 대단지 일괄 지정' },
  { id: 'zone_com_low',  name: '저밀 상업', icon: '🏪', cost: 8,  cat: 'zone', ms: 0, zCol: '#60a5fa', desc: '근린 상업지구 지정 (파랑 C 수요)' },
  { id: 'zone_com_high', name: '고밀 상업', icon: '🏬', cost: 16, cat: 'zone', ms: 3, zCol: '#2563eb', desc: '유리 마천루 중심상업지구(CBD) 지정' },
  { id: 'zone_ind',      name: '산업 단지', icon: '🏭', cost: 8,  cat: 'zone', ms: 0, zCol: '#f59e0b', desc: '제조·항만 물류 산업단지 지정 (공해 주의)' },
  { id: 'zone_office',   name: '오피스 구역', icon: '💼', cost: 16, cat: 'zone', ms: 3, zCol: '#06b6d4', desc: '무공해 첨단 IT·금융 테크밸리 지정 (교육 필수)' },
  { id: 'zone_clear',    name: '구역 해제', icon: '🧹', cost: 0,  cat: 'zone', ms: 0, desc: '사각형 드래그로 지정 구역 일괄 해제' },
  // Utilities
  { id: 'water_pipe', name: '지하 수도관', icon: '🔧', cost: 12,   cat: 'util', ms: 0, upkeep: 0.25, desc: '취수장·하수구·기존 관에 자동 스냅! 반경 4타일 급수망 실시간 표시' },
  { id: 'water_pump', name: '대형 취수장', icon: '🚰', cost: 950,  cat: 'util', ms: 0, waterGen: 620, powerUse: 5, upkeep: 22, coastOnly: true, desc: '강 상류(북쪽)에 설치해 깨끗한 물 +620m³ 공급 (파이프 자동 연결)' },
  { id: 'sewage',     name: '하수 처리장', icon: '🌊', cost: 850,  cat: 'util', ms: 0, sewageGen: 620, powerUse: 4, upkeep: 20, coastOnly: true, desc: '남부 하류·항만에 설치해 하수 배출 (+620m³, 하류 오염 주의)' },
  { id: 'power_line', name: '고압 송전선', icon: '🗼', cost: 30,   cat: 'util', ms: 0, upkeep: 0.6, desc: '현수선 3D 케이블 자동 연결! 대각선·강 건너 전력망 브릿지 구축' },
  { id: 'wind',       name: '풍력 발전기', icon: '🌬️', cost: 1100, cat: 'util', ms: 0, powerGen: 75,  upkeep: 14, desc: '무공해 청정 풍력 발전 +75MW (회전 날개 3D 애니메이션)' },
  { id: 'coal',       name: '화력 발전소', icon: '⚡', cost: 1900, cat: 'util', ms: 0, powerGen: 340, upkeep: 48, pollution: 28, desc: '대용량 전력 +340MW (주변 대기·토양 공해)' },
  { id: 'solar',      name: '태양광 단지', icon: '☀️', cost: 3500, cat: 'util', ms: 4, powerGen: 480, upkeep: 38, desc: '대규모 청정 태양광 발전 +480MW' },
  // Services
  { id: 'fire_station',   name: '소방서',     icon: '🚒', cost: 1600, cat: 'svc', ms: 1, powerUse: 3, waterUse: 2, upkeep: 28, svc: 'fire', radius: 13, desc: '화재 예방 및 광역 소방차 긴급 출동' },
  { id: 'police_station', name: '경찰서',     icon: '🚓', cost: 1600, cat: 'svc', ms: 1, powerUse: 3, waterUse: 2, upkeep: 28, svc: 'police', radius: 13, desc: '순찰차 출동으로 광역 치안 유지·지가 상승' },
  { id: 'hospital',       name: '종합병원',   icon: '🚑', cost: 2200, cat: 'svc', ms: 1, powerUse: 4, waterUse: 3, upkeep: 36, svc: 'health', radius: 15, desc: '구급차 출동 및 시민 보건·의료 커버리지 제공' },
  { id: 'landfill',       name: '매립지',     icon: '🗑️', cost: 1000, cat: 'svc', ms: 0, powerUse: 1, upkeep: 18, garbageCap: 280, pollution: 18, svc: 'garbage', radius: 15, desc: '광역 쓰레기 수거 (+280t)' },
  { id: 'incinerator',    name: '소각 발전소', icon: '🔥', cost: 2800, cat: 'svc', ms: 3, powerGen: 95, upkeep: 42, garbageCap: 540, pollution: 12, svc: 'garbage', radius: 17, desc: '대용량 쓰레기 소각(+540t) 및 열병합 발전 +95MW' },
  // Education, Parks & Landmarks
  { id: 'school',     name: '각급 학교',   icon: '🏫', cost: 1500, cat: 'edu', ms: 2, powerUse: 3, waterUse: 2, upkeep: 26, svc: 'edu', eduBoost: 65, radius: 13, desc: '기초·중등 교육 제공 (고레벨·오피스 성장 조건)' },
  { id: 'university', name: '국립 대학교', icon: '🎓', cost: 4200, cat: 'edu', ms: 4, powerUse: 6, waterUse: 4, upkeep: 55, svc: 'edu', eduBoost: 100, radius: 19, desc: '최고 수준 대학교육! 오피스·마천루 진화 극대화' },
  { id: 'park',       name: '중앙 공원',   icon: '🌳', cost: 450,  cat: 'edu', ms: 2, upkeep: 8, happyAura: 24, lvAura: 24, radius: 4, desc: '분수 광장·산책로, 주변 지가 상승 및 공해 정화' },
  { id: 'landmark',   name: '스카이 타워', icon: '🗽', cost: 9500, cat: 'edu', ms: 4, powerUse: 10, waterUse: 6, upkeep: 70, taxBase: 520, happyAura: 36, lvAura: 42, radius: 9, desc: '메가폴리스 상징 전망 타워! 막대한 관광 수입과 지가 상승' },
  { id: 'bulldoze',   name: '철거',       icon: '🚜', cost: 20,   cat: 'all', ms: 0, key: 'B', desc: '건물·도로·지하 수도관 철거 ([⬛ 범위] 대량 철거 지원)' },
];

export const TOOL_MAP: Record<string, ToolDef> = Object.fromEntries(TOOLS.map(t => [t.id, t]));

export const ZONE_SPECS: Record<string, ZoneSpec> = {
  res_low:  { group: 'R', name: '저밀도 주거', power: 2, water: 2, garbage: 2, pop: 15, tax: 34, traffic: 1.0, density: 1 },
  res_high: { group: 'R', name: '고밀도 주거', power: 4, water: 4, garbage: 4, pop: 38, tax: 78, traffic: 2.0, density: 2 },
  com_low:  { group: 'C', name: '저밀도 상업', power: 3, water: 2, garbage: 3, jobs: 12, tax: 58, traffic: 1.2, density: 1 },
  com_high: { group: 'C', name: '고밀도 상업', power: 6, water: 4, garbage: 5, jobs: 30, tax: 132, traffic: 2.2, noise: 8, density: 2 },
  ind:      { group: 'I', name: '산업 단지',   power: 5, water: 4, garbage: 6, jobs: 24, tax: 96, traffic: 2.0, pollution: 22, density: 1 },
  office:   { group: 'I', name: '오피스 구역', power: 4, water: 3, garbage: 2, jobs: 28, tax: 128, traffic: 1.0, needEdu: 35, density: 2 },
};

export interface QuestDef {
  id: string;
  title: string;
  desc: string;
  reward: number;
  check: (s: CityState) => { done: boolean; progress: number; label: string };
}

export const QUESTS: QuestDef[] = [
  {
    id: 'q_infra',
    title: '도시 생명선 완비',
    desc: '전력·상하수도 공급량이 수요를 모두 충족하도록 연결하세요',
    reward: 8000,
    check: (s) => {
      const pOk = s.stats.powerGen > 0 && s.stats.powerGen >= s.stats.powerUse;
      const wOk = s.stats.waterGen > 0 && s.stats.waterGen >= s.stats.waterUse && s.stats.sewageGen >= s.stats.sewageUse;
      const pct = (pOk ? 50 : 0) + (wOk ? 50 : 0);
      return { done: pOk && wOk, progress: pct, label: `${pOk ? '⚡OK' : '⚡부족'} · ${wOk ? '💧OK' : '💧부족'}` };
    }
  },
  {
    id: 'q_roundabout',
    title: '스마트 교통: 회전교차로 도입',
    desc: '주요 교차로에 🔄 회전교차로를 2곳 이상 설치하고 교통 흐름 82% 이상 유지',
    reward: 12000,
    check: (s) => {
      let cnt = 0;
      for (const row of s.grid) for (const t of row) if (t.building?.type === 'roundabout') cnt++;
      const flowOk = s.stats.trafficFlow >= 82;
      const pct = Math.min(100, Math.round((Math.min(cnt, 2) / 2) * 60 + (flowOk ? 40 : (s.stats.trafficFlow / 82) * 40)));
      return { done: cnt >= 2 && flowOk, progress: pct, label: `로터리 ${cnt}/2 · 흐름 ${s.stats.trafficFlow}%` };
    }
  },
  {
    id: 'q_district',
    title: '특화 지구 육성 전략',
    desc: '부지 관리에서 2개 이상의 구역에 특화 지구(IT·에코·관광·항만)를 지정하세요',
    reward: 15000,
    check: (s) => {
      const cnt = s.sectorSpecs.filter((sp, i) => s.unlockedSectors[i] && sp !== 'general').length;
      return { done: cnt >= 2, progress: Math.min(100, Math.round((cnt / 2) * 100)), label: `특화 지구 ${cnt}/2` };
    }
  },
  {
    id: 'q_green',
    title: '그린 시티 에너지 전환',
    desc: '친환경 발전(풍력·태양광) 비중을 전체 전력의 55% 이상 달성하세요',
    reward: 20000,
    check: (s) => {
      const pct = s.stats.greenPowerPct;
      return { done: pct >= 55 && s.stats.powerGen >= 300, progress: Math.min(100, Math.round((pct / 55) * 100)), label: `친환경 ${pct}% / 55%` };
    }
  },
  {
    id: 'q_edu',
    title: '첨단 교육 메트로폴리스',
    desc: '시민 평균 교육 수준 55% 이상 & 시민 행복도 82% 이상 달성',
    reward: 25000,
    check: (s) => {
      const p1 = Math.min(1, s.stats.education / 55);
      const p2 = Math.min(1, s.stats.happiness / 82);
      return {
        done: s.stats.education >= 55 && s.stats.happiness >= 82,
        progress: Math.round((p1 * 0.5 + p2 * 0.5) * 100),
        label: `교육 ${s.stats.education}% · 행복 ${s.stats.happiness}%`
      };
    }
  },
  {
    id: 'q_mega',
    title: '초거대 메가폴리스 완성',
    desc: '도시 인구 15,000명 돌파 및 흑자 재정 유지',
    reward: 50000,
    check: (s) => {
      const pct = Math.min(100, Math.round((s.stats.population / 15000) * 100));
      return {
        done: s.stats.population >= 15000 && s.stats.netIncome > 0,
        progress: pct,
        label: `${s.stats.population.toLocaleString()} / 15,000명`
      };
    }
  }
];

export const CITY_EVENTS: (ActiveEvent & {
  effectA: { buffId: string; name: string; icon: string; days: number; powerMult?: number; taxMult?: number; happyBonus?: number; trafficBonus?: number };
  effectB: { buffId: string; name: string; icon: string; days: number; powerMult?: number; taxMult?: number; happyBonus?: number; trafficBonus?: number };
})[] = [
  {
    id: 'heatwave',
    icon: '🔥',
    title: '기록적 폭염 & 전력 피크 경보',
    desc: '폭염으로 냉방 전력 수요가 급증했습니다! 비상 전력망을 가동할까요?',
    choiceA: { label: '비상 예비전력 긴급 투입 (-₩4,500)', cost: 4500, desc: '15일간 전력 출력 +20%, 시민 행복도 +6' },
    choiceB: { label: '절전 캠페인 권고 (무료)', cost: 0, desc: '12일간 전력 출력 -12%, 시민 행복도 -5' },
    effectA: { buffId: 'ev_grid', name: '비상 전력 안정화', icon: '⚡', days: 15, powerMult: 1.2, happyBonus: 6 },
    effectB: { buffId: 'ev_heat', name: '폭염 절전 피로', icon: '🥵', days: 12, powerMult: 0.88, happyBonus: -5 }
  },
  {
    id: 'tech_summit',
    icon: '🚀',
    title: '글로벌 AI·테크 서밋 유치 제안',
    desc: '다국적 IT 기업들이 메트로빌에서 연례 기술 박람회 개최를 제안했습니다!',
    choiceA: { label: '컨벤션 인프라 지원 (-₩8,000)', cost: 8000, desc: '20일간 전체 세수 +22%, 시민 행복도 +8' },
    choiceB: { label: '소규모 온라인 포럼으로 축소 (무료)', cost: 0, desc: '12일간 전체 세수 +6%' },
    effectA: { buffId: 'ev_summit', name: '글로벌 테크 서밋 호황', icon: '🚀', days: 20, taxMult: 1.22, happyBonus: 8 },
    effectB: { buffId: 'ev_forum', name: '온라인 테크 포럼', icon: '💻', days: 12, taxMult: 1.06 }
  },
  {
    id: 'festival',
    icon: '🎆',
    title: '리버사이드 야경 불꽃 축제',
    desc: '시민들이 대하천 수변 공원에서 대규모 야경 축제를 원하고 있습니다.',
    choiceA: { label: '화려한 시립 불꽃축제 개최 (-₩5,500)', cost: 5500, desc: '18일간 시민 행복도 +12, 상업 세수 호황(+14%)' },
    choiceB: { label: '예산 절감을 위해 내년으로 연기 (무료)', cost: 0, desc: '10일간 시민 행복도 -3' },
    effectA: { buffId: 'ev_fest', name: '리버사이드 축제', icon: '🎆', days: 18, taxMult: 1.14, happyBonus: 12 },
    effectB: { buffId: 'ev_cancel', name: '축제 연기 아쉬움', icon: '☁️', days: 10, happyBonus: -3 }
  },
  {
    id: 'transit_boom',
    icon: '🚄',
    title: '광역 스마트 신호체계 실증 사업',
    desc: '중앙 정부에서 AI 교통 신호 최적화 시범 도시 참여를 제안했습니다.',
    choiceA: { label: '매칭 펀드 투자 참여 (-₩6,000)', cost: 6000, desc: '25일간 도시 교통 흐름 +10%, 세수 +8%' },
    choiceB: { label: '기존 신호체계 유지 (무료)', cost: 0, desc: '변화 없음 (안정 유지)' },
    effectA: { buffId: 'ev_ai_trf', name: 'AI 스마트 신호망', icon: '🚦', days: 25, trafficBonus: 10, taxMult: 1.08 },
    effectB: { buffId: 'ev_none', name: '기존 교통 체계 유지', icon: '🛣️', days: 5 }
  }
];

// ==================== WEB AUDIO SYNTH ====================
let audioCtx: AudioContext | null = null;
export let soundEnabled = true;
export function setSoundEnabled(v: boolean) { soundEnabled = v; }

export function playSound(type: 'build' | 'zone' | 'bulldoze' | 'milestone' | 'siren' | 'snap' | 'error') {
  if (!soundEnabled) return;
  try {
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtx) audioCtx = new AudioCtor();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);

    if (type === 'build') {
      o.type = 'triangle';
      o.frequency.setValueAtTime(340, t);
      o.frequency.exponentialRampToValueAtTime(620, t + 0.08);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.start(t); o.stop(t + 0.11);
    } else if (type === 'snap') {
      o.type = 'sine';
      o.frequency.setValueAtTime(780, t);
      o.frequency.exponentialRampToValueAtTime(1040, t + 0.035);
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      o.start(t); o.stop(t + 0.05);
    } else if (type === 'zone') {
      o.type = 'sine';
      o.frequency.setValueAtTime(460, t);
      o.frequency.exponentialRampToValueAtTime(560, t + 0.04);
      g.gain.setValueAtTime(0.045, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.start(t); o.stop(t + 0.06);
    } else if (type === 'bulldoze') {
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(155, t);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.12);
      g.gain.setValueAtTime(0.075, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      o.start(t); o.stop(t + 0.14);
    } else if (type === 'milestone') {
      o.type = 'sine';
      [523, 659, 784, 1046].forEach((f, i) => o.frequency.setValueAtTime(f, t + i * 0.08));
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.start(t); o.stop(t + 0.43);
    } else if (type === 'siren') {
      o.type = 'sine';
      o.frequency.setValueAtTime(680, t);
      o.frequency.setValueAtTime(920, t + 0.1);
      g.gain.setValueAtTime(0.045, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t); o.stop(t + 0.23);
    } else if (type === 'error') {
      o.type = 'square';
      o.frequency.setValueAtTime(160, t);
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.start(t); o.stop(t + 0.13);
    }
  } catch { /* ignore audio context errors */ }
}
