# Spirit Generative Tool — Project Notes

Last Updated: 2026-03-26

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
| Reaction Diffusion | (신규 구현 예정) | Gray-Scott reaction-diffusion simulation | 회색-스콧 반응 확산 시뮬레이션 |
| Cellular Automata | `code-base/cellular-automata-` | Rule-based cell grid evolution | 규칙 기반 셀 그리드 진화 |
| Differential Growth | `code-base/differential-growth` | Organic growth along input boundary | 입력 경계를 따라 유기적 성장 |
| Limited Aggregation | `code-base/limited-aggregation` | Diffusion-limited aggregation (DLA) | 확산 제한 집적 (DLA) |
| Space Colonization | `code-base/space-colonization` | Branch-growing toward attractor points | 어트랙터 포인트를 향해 뻗는 브랜치 |
| Voronoi | `code-base/voronoi` | Voronoi tessellation with Lloyd relaxation | 로이드 이완을 적용한 보로노이 분할 |

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
- **MP4 Export**: 애니메이션 효과의 경우 MP4 영상 출력 / Export animated effects as MP4

---

## File Structure | 파일 구조

```
spirit-all-generative/
├── 00_Project Note.md            ← This file
├── 01_Parallel Work Guide.md     ← 병렬 작업 가이드 (다른 세션용)
├── code-base/                    ← Source generative algorithm projects
│   ├── cellular-automata-/
│   ├── differential-growth/
│   ├── limited-aggregation/
│   ├── space-colonization/
│   └── voronoi/
├── generative-tool/              ← 통합 툴
│   ├── index.html                  ⛔ 공유 — 병렬 세션에서 수정 금지
│   ├── style.css                   ⛔ 공유
│   ├── script.js                   ⛔ 공유 (UI 로직)
│   └── effects/                    ✅ 이펙트별 독립 모듈
│       ├── effect-base.js            ⛔ 공유 (베이스 클래스)
│       ├── reaction-diffusion.js     ✅ 세션 1
│       ├── cellular-automata.js      ✅ 세션 2
│       ├── differential-growth.js    ✅ 세션 3
│       ├── limited-aggregation.js    ✅ 세션 4
│       ├── space-colonization.js     ✅ 세션 5
│       └── voronoi.js                ✅ 세션 6
└── ui-design-base/               ← UI 디자인 레퍼런스 베이스
    ├── index.html
    ├── style.css
    └── script.js
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

### Phase 2 — Canvas & Input Rendering | 캔버스 & 입력 렌더링
- [ ] Text rendering to canvas (font, weight, color, transform)
- [ ] SVG import and render to canvas
- [ ] Input → mask/path extraction for effect seeding

### Phase 3 — Effect Implementation | 이펙트 구현
- [ ] Reaction Diffusion (Gray-Scott, WebGL or Canvas2D)
- [ ] Cellular Automata (port from `code-base/cellular-automata-`)
- [ ] Differential Growth (port from `code-base/differential-growth`)
- [ ] Limited Aggregation (port from `code-base/limited-aggregation`)
- [ ] Space Colonization (port from `code-base/space-colonization`)
- [ ] Voronoi (port from `code-base/voronoi`)

### Phase 4 — Animation & Export | 애니메이션 & 출력
- [ ] Animation loop with play/pause/speed
- [ ] PNG export (canvas.toDataURL)
- [ ] SVG export (SVG-capable effects)
- [ ] MP4 export (MediaRecorder API or ffmpeg.wasm)
- [ ] Undo/Redo history stack

### Phase 5 — Polish | 폴리시
- [ ] Effect tab → dropdown when more than 6 effects
- [ ] Preset save/load (JSON)
- [ ] Keyboard shortcuts
- [ ] Performance optimization (WebWorker / WebGL)
