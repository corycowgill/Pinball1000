/**
 * Full-screen UI overlays for game flow states (attract, bonus count,
 * game over). Each is created on demand and removed on transition out.
 */

function makeOverlay(id: string): HTMLElement {
  const old = document.getElementById(id);
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = id;
  Object.assign(el.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(11, 22, 42, 0.7)',
    zIndex: '15',
    color: 'var(--halo)',
    fontFamily: 'inherit',
    pointerEvents: 'none',
    transition: 'opacity 350ms ease-out',
  } as Partial<CSSStyleDeclaration>);
  document.getElementById('app')?.appendChild(el);
  return el;
}

export function showAttract(highScore: number): { dismiss: () => void } {
  const el = makeOverlay('attract-overlay');
  el.innerHTML = `
    <div style="font-size:84px;letter-spacing:0.18em;-webkit-text-stroke:5px var(--ink);text-shadow:8px 8px 0 var(--ink);color:var(--bears-orange);">CHICAGO</div>
    <div style="font-size:36px;color:var(--paper);text-shadow:3px 3px 0 var(--ink);margin-top:-8px;">PINBALL</div>
    <div style="font-size:24px;color:var(--halo);margin-top:48px;animation:pulse 1200ms ease-in-out infinite;">PRESS ENTER TO PLAY</div>
    <div style="font-size:14px;color:var(--paper);opacity:0.6;margin-top:32px;">SHIFT = FLIPPERS &middot; SPACE = PLUNGER &middot; ARROWS = NUDGE &middot; D = DEBUG</div>
    ${highScore > 0 ? `<div style="font-size:18px;color:var(--paper);margin-top:24px;">HIGH SCORE: ${highScore.toLocaleString('en-US')}</div>` : ''}
  `;
  return {
    dismiss: () => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    },
  };
}

export function showBallReady(ballNum: number, maxBalls: number): { dismiss: () => void } {
  const el = makeOverlay('ballready-overlay');
  el.style.background = 'transparent';
  el.innerHTML = `
    <div style="font-size:48px;color:var(--bears-orange);text-shadow:5px 5px 0 var(--ink);animation:pulse 800ms ease-in-out infinite;">BALL ${ballNum} / ${maxBalls}</div>
    <div style="font-size:20px;color:var(--paper);margin-top:8px;">PRESS SPACE TO LAUNCH</div>
  `;
  return {
    dismiss: () => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    },
  };
}

export function showBonusCount(bonusPoints: number, onComplete: () => void): void {
  const el = makeOverlay('bonus-overlay');
  el.innerHTML = `
    <div style="font-size:36px;color:var(--paper);">END OF BALL</div>
    <div style="font-size:22px;color:var(--halo);margin-top:12px;">BONUS</div>
    <div id="bonus-count" style="font-size:72px;color:var(--bears-orange);text-shadow:6px 6px 0 var(--ink);margin-top:8px;">0</div>
  `;
  const countEl = el.querySelector('#bonus-count') as HTMLElement;
  let displayed = 0;
  const startedAt = performance.now();
  const duration = 1400;
  const tick = (): void => {
    const elapsed = performance.now() - startedAt;
    const t = Math.min(1, elapsed / duration);
    displayed = Math.round(bonusPoints * easeOutCubic(t));
    countEl.textContent = displayed.toLocaleString('en-US');
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => {
          el.remove();
          onComplete();
        }, 350);
      }, 700);
    }
  };
  requestAnimationFrame(tick);
}

export function showGameOver(finalScore: number, isHighScore: boolean): { dismiss: () => void } {
  const el = makeOverlay('gameover-overlay');
  el.innerHTML = `
    <div style="font-size:84px;color:var(--bulls-red);-webkit-text-stroke:4px var(--ink);text-shadow:6px 6px 0 var(--ink);letter-spacing:0.16em;">GAME OVER</div>
    <div style="font-size:24px;color:var(--paper);margin-top:32px;">FINAL SCORE</div>
    <div style="font-size:64px;color:var(--bears-orange);text-shadow:5px 5px 0 var(--ink);margin-top:4px;">${finalScore.toLocaleString('en-US')}</div>
    ${isHighScore ? `<div style="font-size:28px;color:var(--halo);margin-top:24px;animation:pulse 800ms ease-in-out infinite;">NEW HIGH SCORE!</div>` : ''}
    <div style="font-size:18px;color:var(--paper);opacity:0.8;margin-top:48px;animation:pulse 1200ms ease-in-out infinite;">PRESS ENTER FOR ANOTHER GAME</div>
  `;
  return {
    dismiss: () => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    },
  };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const HIGH_SCORE_KEY = 'chicago-pinball:high-score';

export function loadHighScore(): number {
  try {
    const raw = window.localStorage.getItem(HIGH_SCORE_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score: number): boolean {
  try {
    const prev = loadHighScore();
    if (score > prev) {
      window.localStorage.setItem(HIGH_SCORE_KEY, String(score));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
