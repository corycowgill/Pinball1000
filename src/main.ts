import { Game } from './core/Game';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Canvas #game not found');

  const game = new Game(canvas);
  await game.init();

  const loader = document.getElementById('loader');
  if (loader) loader.classList.add('hidden');

  game.start();

  if (import.meta.env.DEV) {
    (window as unknown as { game: Game }).game = game;
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start Chicago Pinball:', err);
  const loader = document.getElementById('loader');
  if (loader) {
    loader.innerHTML = `<div class="loader-text">CRASH: ${String(err)}</div>`;
  }
});
