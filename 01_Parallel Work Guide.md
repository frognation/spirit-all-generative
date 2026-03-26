# Parallel Work Guide — Multi-Session Development

Last Updated: 2026-03-26

---

## Overview | 개요

이 프로젝트는 6개 이펙트를 **각각 독립된 Claude Code 세션**에서 병렬로 개발할 수 있도록 구조화되어 있습니다.
This project is structured so that 6 effects can be developed in parallel across separate Claude Code sessions.

---

## File Structure — What You Can Touch | 파일별 수정 범위

```
generative-tool/
├── index.html                ← ⛔ DO NOT EDIT (공통 UI, 다른 세션과 충돌)
├── style.css                 ← ⛔ DO NOT EDIT (공통 스타일)
├── script.js                 ← ⛔ DO NOT EDIT (공통 UI 로직)
└── effects/
    ├── effect-base.js        ← ⛔ DO NOT EDIT (공통 베이스 클래스)
    ├── reaction-diffusion.js ← ✅ 세션 1 전용
    ├── cellular-automata.js  ← ✅ 세션 2 전용
    ├── differential-growth.js← ✅ 세션 3 전용
    ├── limited-aggregation.js← ✅ 세션 4 전용
    ├── space-colonization.js ← ✅ 세션 5 전용
    └── voronoi.js            ← ✅ 세션 6 전용
```

### Rule | 핵심 규칙

> **자기 이펙트 JS 파일만 수정하세요.**
> Only edit YOUR effect's JS file. Never touch other files.

---

## How to Start a Session | 세션 시작 방법

각 세션에서 아래와 같이 지시하세요:
Instruct each session like this:

```
이 프로젝트의 병렬 작업 가이드를 먼저 읽어:
01_Parallel Work Guide.md, 00_Project Note.md

그리고 effects/[이펙트이름].js 파일과 effects/effect-base.js 를 읽은 뒤,
code-base/[소스폴더]/ 의 기존 코드를 분석해서
[이펙트이름] 이펙트를 구현해줘.
```

### Per-Effect Commands | 이펙트별 명령어 예시

**세션 1 — Reaction Diffusion:**
```
01_Parallel Work Guide.md, 00_Project Note.md 를 먼저 읽어.
effects/effect-base.js 를 읽고, effects/reaction-diffusion.js 에
Gray-Scott reaction-diffusion 알고리즘을 구현해줘.
Canvas2D 또는 WebGL 사용 가능. 다른 파일은 절대 수정하지 마.
```

**세션 2 — Cellular Automata:**
```
01_Parallel Work Guide.md, 00_Project Note.md 를 먼저 읽어.
effects/effect-base.js 를 읽고, code-base/cellular-automata-/ 의 코드를 분석한 뒤
effects/cellular-automata.js 에 해당 이펙트를 구현해줘. 다른 파일은 절대 수정하지 마.
```

**세션 3 — Differential Growth:**
```
01_Parallel Work Guide.md, 00_Project Note.md 를 먼저 읽어.
effects/effect-base.js 를 읽고, code-base/differential-growth/ 의 코드를 분석한 뒤
effects/differential-growth.js 에 해당 이펙트를 구현해줘. 다른 파일은 절대 수정하지 마.
```

**세션 4 — Limited Aggregation:**
```
01_Parallel Work Guide.md, 00_Project Note.md 를 먼저 읽어.
effects/effect-base.js 를 읽고, code-base/limited-aggregation/ 의 코드를 분석한 뒤
effects/limited-aggregation.js 에 해당 이펙트를 구현해줘. 다른 파일은 절대 수정하지 마.
```

**세션 5 — Space Colonization:**
```
01_Parallel Work Guide.md, 00_Project Note.md 를 먼저 읽어.
effects/effect-base.js 를 읽고, code-base/space-colonization/ 의 코드를 분석한 뒤
effects/space-colonization.js 에 해당 이펙트를 구현해줘. 다른 파일은 절대 수정하지 마.
```

**세션 6 — Voronoi:**
```
01_Parallel Work Guide.md, 00_Project Note.md 를 먼저 읽어.
effects/effect-base.js 를 읽고, code-base/voronoi/ 의 코드를 분석한 뒤
effects/voronoi.js 에 해당 이펙트를 구현해줘. 다른 파일은 절대 수정하지 마.
```

---

## Effect Module Interface | 이펙트 모듈 인터페이스

각 이펙트는 `EffectBase` 클래스를 상속하고 아래 메서드를 오버라이드합니다:
Each effect extends `EffectBase` and overrides these methods:

```javascript
class MyEffect extends EffectBase {
  constructor() {
    super("my-effect-id", "My Effect Name");
  }

  setup() {
    // 버퍼 할당, 초기 상태 생성
    // Allocate buffers, create initial state
    // this.readParams() 로 DOM 슬라이더 값을 this.params에 읽어옴
    // this._inputMask 에 텍스트/SVG 렌더링 ImageData가 전달됨 (나중에)
  }

  render() {
    // 매 프레임 호출 — 시뮬레이션 스텝 + 캔버스 그리기
    // Called every frame — simulation step + canvas draw
  }

  reset() {
    // 초기 상태로 복귀
    // Reset to initial state
    this.stop();
    this.setup();
    this.render();
  }
}

// 반드시 이 줄로 등록:
window.SpiritEffects["my-effect-id"] = MyEffect;
```

### Key Properties (from EffectBase) | 주요 속성

| Property | Type | Description |
|---|---|---|
| `this.canvas` | HTMLCanvasElement | 메인 캔버스 (640×640 기본) |
| `this.ctx` | CanvasRenderingContext2D | 2D 렌더링 컨텍스트 |
| `this.params` | Object | DOM에서 읽은 파라미터 `{feed_rate: 0.055, ...}` |
| `this.params.seed` | Number | 현재 시드 값 |
| `this.running` | Boolean | 애니메이션 실행 중 여부 |
| `this.speed` | Number | 재생 속도 배율 (0.2–3.0) |
| `this._inputMask` | ImageData\|null | 텍스트/SVG 입력 마스크 (Phase 2에서 구현) |
| `this.isLight` | Boolean (getter) | 현재 라이트 테마 여부 |

### Utility Methods | 유틸리티

| Method | Description |
|---|---|
| `this.readParams()` | DOM 슬라이더에서 파라미터 읽기 |
| `this.drawPlaceholder()` | 구현 전 플레이스홀더 그리기 |
| `EffectBase.prng(seed)` | 시드 기반 난수 생성기 (mulberry32) 반환 |

---

## Important Warnings | 주의사항

### 1. Never Edit Shared Files | 공유 파일 수정 금지

```
❌ index.html — 수정하면 다른 세션의 작업과 충돌
❌ style.css  — 수정하면 레이아웃 깨짐
❌ script.js  — 수정하면 모든 UI 로직에 영향
❌ effect-base.js — 수정하면 모든 이펙트에 영향
```

만약 공유 파일 수정이 꼭 필요하면, **이 세션을 종료하고 메인 세션에서 수정**하세요.
If shared files need changes, stop and make changes in the main session only.

### 2. DOM Selectors | DOM 셀렉터

우측 사이드바의 슬라이더 값은 `this.readParams()` 로 읽으세요.
패널 ID는 `effect-{이펙트-id}` 형식입니다.

```javascript
// 자기 패널에서만 읽기
const panel = document.getElementById(`effect-${this.id}`);
```

### 3. Canvas Size | 캔버스 크기

캔버스는 현재 `640×640` 고정이지만, 추후 동적으로 변경될 수 있습니다.
항상 `this.canvas.width` / `this.canvas.height` 를 사용하세요.

```javascript
// ✅ Good
const w = this.canvas.width;
// ❌ Bad
const w = 640;
```

### 4. Animation Loop | 애니메이션 루프

`EffectBase._loop()` 이 자동으로 `requestAnimationFrame`을 호출합니다.
`this.render()` 만 구현하면 됩니다. 직접 `requestAnimationFrame`을 호출하지 마세요.

### 5. External Libraries | 외부 라이브러리

외부 라이브러리가 필요한 경우:
- CDN `<script>` 태그는 `index.html`에 추가해야 하므로 → **메인 세션에서 처리**
- 또는 해당 이펙트 JS 파일 내에서 동적으로 로드:

```javascript
// 이펙트 파일 내에서 동적 로드 예시
async _loadLib() {
  if (window.d3) return;
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/d3-delaunay@6';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}
```

### 6. Reference Code | 참조 코드

각 이펙트에 대응하는 기존 코드는 `code-base/` 폴더에 있습니다:

| Effect | Source Folder |
|---|---|
| Reaction Diffusion | (신규 — 참조 코드 없음) |
| Cellular Automata | `code-base/cellular-automata-/` |
| Differential Growth | `code-base/differential-growth/` |
| Limited Aggregation | `code-base/limited-aggregation/` |
| Space Colonization | `code-base/space-colonization/` |
| Voronoi | `code-base/voronoi/` |

기존 코드에서 **핵심 알고리즘만 추출**하여 `EffectBase` 인터페이스에 맞게 포팅하세요.
Extract only the core algorithm and port it to the `EffectBase` interface.

---

## Testing | 테스트 방법

개발 서버 실행:
```bash
cd /Users/basedesign/Documents/GitHub/Projects/spirit-all-generative
npx serve generative-tool
```

브라우저에서 해당 이펙트 탭을 클릭하면 `setup()` → `render()` 가 호출됩니다.
Click the effect tab in the browser to trigger `setup()` → `render()`.

---

## After Completion | 완료 후

모든 세션이 끝나면 메인 세션에서 통합 테스트를 진행합니다:
After all sessions complete, the main session will run integration tests:

1. 모든 이펙트 탭 전환 테스트
2. Play/Pause/Reset 동작 확인
3. 파라미터 슬라이더 반응 확인
4. 테마 전환 (Dark/Light) 확인
