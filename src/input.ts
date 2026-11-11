// Keyboard state: "down" for held keys, "pressed" for keys that went down this frame.

const PREVENT_DEFAULT_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    // Avoid "stuck" keys when the window loses focus
    window.addEventListener("blur", () => this.down.clear());
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Call once per frame, after the game has processed input. */
  endFrame(): void {
    this.pressed.clear();
  }
}
