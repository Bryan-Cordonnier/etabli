// Mini-apps hors ligne en mode serveur : une page cachée de l'origine dédiée aux plugins y enregistre un service worker
// et garde d'avance les fichiers de chaque plugin (docs/17). Le navigateur isole cette origine de l'application : ce
// qui s'y exécute ne voit ni le jeton ni les calculs.
import type { Fond, PluginInfo } from "../fond/types";

let lance = false;

/** Fichiers à garder, en chemins absolus sur l'origine des plugins. */
export function cheminsAGarder(plugins: PluginInfo[]): string[] {
  const chemins: string[] = [];
  for (const plugin of plugins) {
    const id = (plugin.manifest as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !Array.isArray(plugin.fichiers)) continue;
    for (const fichier of plugin.fichiers) {
      if (typeof fichier === "string" && !fichier.split("/").some((m) => m === ".." || m === "")) {
        chemins.push(`/plugins/${encodeURIComponent(id)}/${fichier.split("/").map(encodeURIComponent).join("/")}`);
      }
    }
  }
  return chemins;
}

/** Prépare le hors ligne des mini-apps, une fois par ouverture ; sans effet si le serveur n'a pas d'origine dédiée. */
export function preparerPluginsHorsLigne(fond: Fond, documentHote: Document = document): void {
  const origine = fond.originePlugins;
  if (!origine || lance || typeof navigator === "undefined" || navigator.onLine === false) return;
  lance = true;
  const cadre = documentHote.createElement("iframe");
  cadre.src = `${origine}/enregistrer.html`;
  cadre.setAttribute("sandbox", "allow-scripts allow-same-origin");
  cadre.setAttribute("aria-hidden", "true");
  cadre.tabIndex = -1;
  cadre.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";

  const ecouteur = (event: MessageEvent): void => {
    if (event.origin !== origine || event.source !== cadre.contentWindow) return;
    if (event.data?.type === "etabli:plugins-prets") {
      void fond.pluginsList().then((plugins) => {
        cadre.contentWindow?.postMessage({ type: "etabli:garder", chemins: cheminsAGarder(plugins) }, origine);
      });
    }
    if (event.data?.type === "etabli:gardes" || event.data?.type === "etabli:plugins-indisponibles") {
      window.removeEventListener("message", ecouteur);
    }
  };
  window.addEventListener("message", ecouteur);
  documentHote.body.appendChild(cadre);
}
