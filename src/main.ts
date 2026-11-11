import { Game } from "./game";
import { Input } from "./input";
import { HEIGHT, WIDTH } from "./entities";
import { unlockAudio } from "./sfx";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Canvas element #game not found");
}
canvas.width = WIDTH;
canvas.height = HEIGHT;

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2D canvas context is not available");
}

// Browsers require a user gesture before playing sound
window.addEventListener("keydown", unlockAudio);
window.addEventListener("pointerdown", unlockAudio);

const input = new Input();
const game = new Game(input);

let last = performance.now();

function frame(now: number): void {
  // Clamp dt so a tab switch doesn't teleport everything
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  game.update(dt);
  game.render(ctx!);
  input.endFrame();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
