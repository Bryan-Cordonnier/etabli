// Stockage provisoire dans le navigateur intégré (WebView2).
// Il sera remplacé par des fichiers dans %APPDATA%\Etabli (cahier des charges, section 7.3).
const PREFIX = "etabli.";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Stockage indisponible : l'application continue sans mémoriser.
  }
}
