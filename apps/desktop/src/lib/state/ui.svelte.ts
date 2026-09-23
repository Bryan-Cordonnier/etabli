class Ui {
  paletteOpen = $state(false);
  toast = $state<{ id: number; text: string } | null>(null);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #nextToast = 1;

  /** Notification brève en bas à droite (4 s, cahier des charges section 4). */
  notify(text: string): void {
    this.toast = { id: this.#nextToast++, text };
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.toast = null), 4000);
  }
}

export const ui = new Ui();
