/** Largeur en dessous de laquelle l'interface passe en mode compact (voir aussi les @media des pages). */
export const COMPACT_MAX = 760;

/** Lu dès la création de l'état : sinon la barre d'onglets de bureau serait montée puis retirée au démarrage. */
function ecranEtroit(): boolean {
  return typeof window !== "undefined" && window.matchMedia(`(max-width: ${COMPACT_MAX}px)`).matches;
}

class Ui {
  paletteOpen = $state(false);
  /** Écran étroit (téléphone) : la colonne des plugins devient un tiroir et les onglets une barre simple. */
  compact = $state(ecranEtroit());
  /** Tiroir des plugins ouvert (écran étroit seulement). */
  menuOpen = $state(false);
  /** Un nouvel onglet vient d'être ouvert : l'Accueil place le curseur dans la recherche. */
  focusSearch = false;
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

/** Suit la largeur de l'écran ; renvoie la fonction qui arrête le suivi. */
export function suivreEcran(): () => void {
  const media = window.matchMedia(`(max-width: ${COMPACT_MAX}px)`);
  const maj = () => {
    ui.compact = media.matches;
    if (!media.matches) ui.menuOpen = false;
  };
  maj();
  media.addEventListener("change", maj);
  return () => media.removeEventListener("change", maj);
}
