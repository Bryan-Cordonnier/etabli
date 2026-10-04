// Mini-apps hors ligne en mode serveur : chaque plugin a sa propre origine (un nom d'hôte par plugin, docs/19). Une page
// cachée de cette origine y enregistre un service worker et garde d'avance les fichiers du plugin. Le navigateur isole
// ces origines de l'application et les unes des autres : ce qui s'y exécute ne voit ni le jeton, ni les calculs, ni un
// autre plugin.
import type { Fond, PluginInfo } from "../fond/types";

let lance = false;

/** Fichiers d'un plugin à garder, en chemins absolus sur SON origine (`/apps/pythagore/index.html`). */
export function cheminsAGarder(plugin: PluginInfo): string[] {
  if (!Array.isArray(plugin.fichiers)) return [];
  return plugin.fichiers
    .filter((f): f is string => typeof f === "string" && !f.split("/").some((m) => m === ".." || m === ""))
    .map((f) => `/${f.split("/").map(encodeURIComponent).join("/")}`);
}

const idDe = (plugin: PluginInfo): string | undefined => {
  const id = (plugin.manifest as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : undefined;
};

/** Au plus ce nombre de plugins sont préparés d'un coup (un cadre caché chacun). */
const PLUGINS_MAX = 100;

/** Prépare le hors ligne des mini-apps, une fois par ouverture ; sans effet si le serveur n'a pas d'origine par plugin. */
export function preparerPluginsHorsLigne(fond: Fond, documentHote: Document = document): void {
  const origineDe = fond.originePlugin;
  if (!origineDe || lance || typeof navigator === "undefined" || navigator.onLine === false) return;
  lance = true;

  void fond.pluginsList().then((plugins) => {
    const attendus = new Map<HTMLIFrameElement, { origine: string; chemins: string[] }>();
    const ecouteur = (event: MessageEvent): void => {
      for (const [cadre, { origine, chemins }] of attendus) {
        if (event.source !== cadre.contentWindow || event.origin !== origine) continue;
        if (event.data?.type === "etabli:plugins-prets") {
          cadre.contentWindow?.postMessage({ type: "etabli:garder", chemins }, origine);
        } else if (event.data?.type === "etabli:gardes" || event.data?.type === "etabli:plugins-indisponibles") {
          attendus.delete(cadre);
          cadre.remove();
        }
      }
      if (attendus.size === 0) window.removeEventListener("message", ecouteur);
    };
    window.addEventListener("message", ecouteur);

    for (const plugin of plugins.slice(0, PLUGINS_MAX)) {
      const id = idDe(plugin);
      const origine = id ? origineDe(id) : undefined;
      if (!origine) continue;
      const cadre = documentHote.createElement("iframe");
      cadre.src = `${origine}/enregistrer.html`;
      cadre.setAttribute("sandbox", "allow-scripts allow-same-origin");
      cadre.setAttribute("aria-hidden", "true");
      cadre.tabIndex = -1;
      cadre.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
      attendus.set(cadre, { origine, chemins: cheminsAGarder(plugin) });
      documentHote.body.appendChild(cadre);
    }
    if (attendus.size === 0) window.removeEventListener("message", ecouteur);
  });
}
