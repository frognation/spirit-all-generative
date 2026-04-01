# Spirit Generative Tool — Project Notes

Last Updated: 2026-04-01

---

## Overview | 개요

SVG 임포트 또는 텍스트 타이핑 입력에 제너러티브 알고리즘 효과를 적용하고,
PNG / SVG / MP4 형식으로 애니메이션 및 정적 이미지를 출력하는 통합 웹 툴.

An integrated web-based tool that applies generative algorithm effects to
SVG imports or typed text input, and exports the result as PNG, SVG, or MP4.

---

## Layout Architecture | 레이아웃 구조

```
┌──────────────┬──────────────────────────┬──────────────┐
│  LEFT PANEL  │   EFFECT TAB BAR (top)   │ RIGHT PANEL  │
│  (256px)     ├──────────────────────────┤  (256px)     │
│              │                          │              │
│  Input:      │   Canvas / Viewport      │  Effect      │
│  - Type tab  │                          │  Parameters  │
│  - SVG tab   │                          │  (per-effect │
│              │                          │   controls)  │
│  Transform:  │                          │              │
│  - Scale     │                          │              │
│  - Rotate    │                          │              │
│  - Blur      │                          │              │
│  - Tracking  │                          │              │
│  - Offset    ├──────────────────────────┤              │
│              │   HUD (bottom center)    │              │
│  Canvas:     │   Undo Redo Reset Play   │              │
│  - Size      │   Speed PNG SVG MP4      │              │
│  - BG Color  │                          │              │
└──────────────┴──────────────────────────┴──────────────┘
```

---

## Effect Tabs | 이펙트 탭 (중앙 상단)

총 6개. 버튼 형태 (나중에 효과가 많아지면 드롭다운 전환 예정).
6 effects as buttons (may become dropdown when more effects are added).

| Tab Label | Source | Description (EN) | 설명 (KR) |
|---|---|---|---|
| Reaction Diffusion | 자체 구현 (WebGL) | Gray-Scott reaction-diffusion simulation | 회색-스콧 반응 확산 시뮬레이션 |
| Cellular Automata | `code-base/cellular-automata-` | Rule-based cell grid evolution | 규칙 기반 셀 그리드 진화 |
| Differential Growth | `code-base/differential-growth` | Organic growth along input boundary | 입력 경계를 따라 유기적 성장 |
| Limited Aggregation | `code-base/limited-aggregation` | Diffusion-limited aggregation (DLA) | 확산 제한 집적 (DLA) |
| Space Colonization | `code-base/space-colonization` | Branch-growing toward attractor points | 어트랙터 포인트를 향해 뻗는 브랜치 |
| Voronoi | `code-base/voronoi` | Voronoi tessellation with Lloyd relaxation | 로이드 이완을 적용한 보로노이 분할 |
| Obstacle Vein | `code-base/vein-obstacle` (from-images) | Vein growth from image boundaries | 이미지 경계에서 혈관/잎맥 성장 |
| Painting Veins | `code-base/vein-obstacle` (painting) | Mouse-driven vein painting | 마우스로 혈관/잎맥 페인팅 |
| Neuron Growth | 자체 구현 | Dendritic neuron branching from input | 뉴런 수상돌기 가지 성장 |

---

## Right Sidebar Controls Per Effect | 이펙트별 우측 사이드바 파라미터

각 이펙트 탭 선택 시 우측 사이드바 패널이 해당 이펙트의 컨트롤로 교체됨.
Right sidebar switches to the selected effect's parameter panel.

### Reaction Diffusion
- Seed, Feed Rate, Kill Rate, Diffuse A/B, Iter/Frame, Brush Size
- Color: Color A, Color B, Blend Mode

### Cellular Automata
- Seed, Rule (0–255), Density, Cell Size, Gen/Frame, Neighborhood (Moore/Von Neumann)
- Color: Alive color, Dead color, Fade Mode

### Differential Growth
- Seed, Max Force, Max Speed, Sep Radius, Cohesion, Max Nodes, Insert Distance
- Style: Line Width, Opacity, Color

### Limited Aggregation
- Seed, Particle Count, Stickiness, Radius, Walk Speed, Batch Size
- Color: Mode (Mono/Gradient/Heat), Color

### Space Colonization
- Seed, Attractors, Segment Length, Influence Radius, Kill Radius, Max/Min Thickness
- Style: Branch color, Leaf color, Shape (Open/Filled/Radial)

### Voronoi
- Seed, Point Count, Relaxation Steps, Line Weight, Point Size
- Color: Fill Mode (Flat/Gradient/Random/None), Fill color, Stroke color

---

## Left Sidebar | 좌측 사이드바

### Input Tabs | 입력 탭
- **Type**: 텍스트 직접 입력 + Font / Weight / Fill Color 설정
  Text area with font family, weight pills, fill color picker
- **SVG**: SVG 파일 드래그&드롭 또는 클릭하여 업로드
  SVG file drag-and-drop upload zone

이펙트 탭을 전환해도 좌측 입력 상태는 그대로 유지됨.
Left sidebar state persists when switching effect tabs.

### Transform Controls (공통 / Common)
- Scale, Rotate, Blur
- Tracking (자간, 텍스트 모드에서만 표시 / text mode only)
- Offset X / Y

### Canvas Settings
- Size: 1:1 (1080×1080), 16:9 (1920×1080), 9:16 (1080×1920), 4K (3840×2160)
- Background Color

---

## Bottom HUD | 하단 HUD

```
[ ↺ Undo ] [ ↻ Redo ] | [ ⟳ Reset ] [ ⏸ Play ] [ Speed Slider 1.0× ] | [ PNG ] [ SVG ] [ MP4 ]
```

- **Play/Pause**: 애니메이션 재생 토글 / Toggle animation playback
- **Speed**: 0.2×–3.0× 재생 속도 / Playback speed multiplier
- **Reset**: 파라미터를 기본값으로 초기화 / Reset parameters to default
- **Undo / Redo**: 파라미터 변경 이력 관리 / Parameter change history
- **PNG Export**: 현재 캔버스 스냅샷을 PNG로 저장 / Save canvas snapshot as PNG
- **SVG Export**: 가능한 경우 벡터 SVG로 출력 / Export as vector SVG when possible
- **MP4 Export**: WebCodecs + mp4-muxer 기반 진짜 MP4 출력 (H.264) / Real MP4 export via WebCodecs + mp4-muxer (H.264), progress overlay with cancel

---

## File Structure | 파일 구조

```
spirit-all-generative/
├── 00_Project Note.md            ← This file (프로젝트 전체 현황)
├── 01_Parallel Work Guide.md     ← 병렬 작업 가이드 (다른 세션용)
├── code-base/                    ← Source generative algorithm projects
│   ├── cellular-automata-/
│   ├── differential-growth/
│   ├── limited-aggregation/
│   ├── space-colonization/
│   ├── vein-obstacle/              ← Obstacle Vein + Painting Veins 원본
│   └── voronoi/
├── generative-tool/              ← 통합 툴 (메인 앱)
│   ├── index.html                  ⛔ 공유 — 병렬 세션에서 수정 금지
│   ├── style.css                   ⛔ 공유
│   ├── script.js                   ⛔ 공유 (UI 로직, 입력/출력/undo/zoom 등)
│   ├── fonts/                      ← 커스텀 폰트 폴더 (TTF/OTF/WOFF2)
│   │   ├── DearSirMadam.ttf         ← 기본 선택 폰트
│   │   └── fonts.json                ← 폰트 목록 자동 로드
│   └── effects/                    ✅ 이펙트별 독립 모듈
│       ├── effect-base.js            ⛔ 공유 (베이스 클래스)
│       ├── reaction-diffusion.js     ✅ WebGL 기반, 프리셋 포함
│       ├── cellular-automata.js      ✅ 해상도 조절 가능
│       ├── differential-growth.js    ✅
│       ├── limited-aggregation.js    ✅
│       ├── space-colonization.js     ✅
│       ├── voronoi.js                ✅
│       ├── vein-core.js              ⛔ 공유 (Vein 이펙트 공통 코어)
│       ├── obstacle-vein.js          ✅ 이미지 기반 Vein 성장
│       ├── painting-veins.js         ✅ 마우스 페인팅 Vein
│       └── neuron-growth.js          ✅ 뉴런 수상돌기 가지 성장
└── ui-design-base/               ← UI 디자인 레퍼런스 베이스
```

---

## Implementation Roadmap | 구현 로드맵

### Phase 1 — UI Template | UI 템플릿 ✅
- [x] 3-column layout (Left / Canvas+Tabs / Right)
- [x] Effect tab bar (6 effects)
- [x] Left sidebar: Type/SVG input tabs + Transform controls
- [x] Right sidebar: Per-effect parameter panels (placeholder controls)
- [x] Bottom HUD: Play/Pause, Speed, Undo/Redo, PNG/SVG/MP4
- [x] Dark/Light theme toggle
- [x] Canvas placeholder with grid

### Phase 1.5 — Modular Refactoring | 모듈 분리 ✅
- [x] `effects/` 폴더 생성 + `EffectBase` 베이스 클래스
- [x] 6개 이펙트를 각각 독립 JS 파일로 분리
- [x] `script.js` → 공통 UI 로직만 관리하도록 리팩터링
- [x] `01_Parallel Work Guide.md` 병렬 작업 가이드 작성
- [x] 이펙트 모듈 인터페이스: init/setup/render/reset/destroy

### Phase 2 — Canvas & Input Rendering | 캔버스 & 입력 렌더링 ✅
- [x] Text rendering to canvas (font, weight, color, transform)
- [x] SVG / PNG / JPG / WebP import + drag-drop + Cmd+V clipboard paste
- [x] Image color invert option
- [x] Font upload (TTF/OTF/WOFF2) + fonts/ 폴더 자동 로드
- [x] Default font: Dear Sir Madam
- [x] Input → mask/path extraction for effect seeding
- [x] Canvas resolution: 직접 입력 + 드래그 조절, 프리셋 (1:1, 16:9, 9:16, 4K)
- [x] Default canvas: 16:9 (1920×1080)

### Phase 3 — Effect Implementation | 이펙트 구현 ✅ (9 effects)
- [x] Reaction Diffusion (WebGL, 프리셋 포함)
- [x] Cellular Automata (해상도 조절 가능)
- [x] Differential Growth
- [x] Limited Aggregation
- [x] Space Colonization
- [x] Voronoi
- [x] Obstacle Vein (이미지 기반 vein 성장)
- [x] Painting Veins (마우스 vein 페인팅)
- [x] Neuron Growth (뉴런 수상돌기 가지 성장, SVG 벡터 출력 지원)

### Phase 4 — Animation & Export | 애니메이션 & 출력 ✅
- [x] Animation loop with play/pause/speed (0.2×–3.0×)
- [x] PNG export (canvas.toDataURL)
- [x] SVG vector export (text, voronoi 등 벡터 지원 이펙트)
- [x] MP4 export — WebCodecs + mp4-muxer (H.264), 진행률 오버레이 + 취소
- [x] Undo/Redo history stack + Cmd+Z / Cmd+Shift+Z 단축키

### Phase 4.5 — Tools & Interaction | 툴 & 인터랙션 ✅
- [x] Brush tool — 이펙트에 브러쉬로 그리기, 크기 조절
- [x] Smudge tool — 손가락 끌기 (픽셀 스머지)
- [x] Cmd+Wheel zoom in/out
- [x] Canvas toolbar (상단 중앙: 브러쉬/스머지 전환 + 크기 슬라이더)

### Phase 5 — Polish | 폴리시
- [ ] Effect tab → dropdown when more than 10 effects
- [ ] Preset save/load (JSON)
- [ ] Performance optimization (WebWorker / WebGL)
- [ ] 각 이펙트별 세부 파라미터 미세조정

---

## SVG Vector Export Capability | SVG 벡터 출력 가능 여부

| Effect | SVG Vector | Notes |
|---|---|---|
| Reaction Diffusion | ❌ | WebGL 픽셀 기반, PNG만 가능 |
| Cellular Automata | ❌ | 픽셀 그리드 기반 |
| Differential Growth | ✅ | 노드+엣지 → SVG path 변환 가능 |
| Limited Aggregation | ❌ | 픽셀 기반 파티클 |
| Space Colonization | ✅ | 브랜치 → SVG line/path |
| Voronoi | ✅ | 셀 경계 → SVG polygon/path |
| Obstacle Vein | ✅ | 노드 네트워크 → SVG path |
| Painting Veins | ✅ | 노드 네트워크 → SVG path |
| Neuron Growth | ✅ | 뉴런 가지 → SVG path |

---

## Deployment | 배포 정보

| Item | URL |
|---|---|
| GitHub | https://github.com/frognation/spirit-all-generative |
| Vercel (Live) | https://spirit-all-generative.vercel.app |
| Tool Direct | https://spirit-all-generative.vercel.app/generative-tool/ |

git push → Vercel 자동 재배포됨.
