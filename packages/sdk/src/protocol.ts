// Messages échangés entre le moteur et une mini-app (cahier des charges, section 8.5).
// La mini-app tourne dans un cadre isolé ; le moteur lui transmet un MessagePort privé,
// et tout passe ensuite par ce port.

/** Incrémenté à chaque changement incompatible du protocole. */
export const PROTOCOL_VERSION = 1;

/** Premier message, envoyé par le moteur avec le port de communication. */
export const CONNECT = "etabli:connect";

/** Variables de couleur du thème (mêmes noms que les variables CSS : `--surface`, `--accent`…). */
export type ThemeTokens = Record<string, string>;

export type ColorScheme = "light" | "dark";

export interface DocumentSnapshot<T = unknown> {
  /** `null` tant que le document n'a pas été enregistré (aucune modification encore). */
  id: string | null;
  title: string;
  data: T | null;
}

export type HostToPlugin =
  | {
      type: "init";
      protocol: number;
      pluginId: string;
      appId: string;
      document: DocumentSnapshot;
      theme: ThemeTokens;
      colorScheme: ColorScheme;
    }
  | { type: "theme"; theme: ThemeTokens; colorScheme: ColorScheme };

export type PluginToHost =
  | { type: "update"; data: unknown }
  | { type: "title"; title: string }
  | { type: "summary"; summary: string }
  | { type: "notify"; text: string }
  | { type: "copy"; text: string }
  | { type: "height"; value: number }
  | { type: "shortcut"; key: string; ctrl: boolean; shift: boolean; alt: boolean };

/** Raccourcis gérés par le moteur même quand le clavier est dans une mini-app. */
export function isHostShortcut(e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  const key = e.key.toLowerCase();
  if (e.altKey && e.key === "ArrowLeft") return true;
  if (!e.ctrlKey) return false;
  return ["t", "w", "k", "b", "tab"].includes(key) || /^[1-9]$/.test(key);
}
