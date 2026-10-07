// Sonde de l'hébergement des plugins (docs/19, §4) : un cadre à origine opaque ne charge ses modules, ses styles et ses
// polices que si l'hébergement envoie « Access-Control-Allow-Origin » sous plugins/. Si oui, la version web isole les
// mini-apps (sandbox sans allow-same-origin) ; sinon (hébergement sans en-têtes, hors
// ligne) elle retombe sur la même origine, seule façon de les faire fonctionner : limite connue, plugins officiels seuls.
// La sonde est faite par un cadre opaque dont le code vient de l'hôte, jamais d'un plugin : un plugin ne peut pas
// forcer le repli.

/** Le message du cadre de sonde. */
const MARQUE = "etabli:sonde-cors";

/** Texte JavaScript sûr dans un `<script>` : « < » devient \u003c, pour qu'aucune balise ne puisse refermer le script. */
const litteral = (texte: string): string => JSON.stringify(texte).replace(/</g, "\\u003c");

/** Page du cadre de sonde : un `fetch` en mode CORS, depuis une origine opaque, vers un fichier de plugins. */
export function pageSonde(adresse: string): string {
  return (
    `<!doctype html><meta charset="utf-8"><script>` +
    `fetch(${litteral(adresse)},{mode:"cors",credentials:"omit"})` +
    `.then(function(r){return r.ok},function(){return false})` +
    `.then(function(ok){parent.postMessage({marque:${litteral(MARQUE)},ok:ok},"*")});` +
    `</script>`
  );
}

/** Vrai si le message vient du cadre de sonde et dit que le CORS passe. */
export function lireReponse(data: unknown): boolean | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const d = data as { marque?: unknown; ok?: unknown };
  return d.marque === MARQUE && typeof d.ok === "boolean" ? d.ok : undefined;
}

export interface OptionsSonde {
  document?: Document;
  /** Au-delà, on considère que le CORS n'est pas là. */
  delaiMs?: number;
}

/** Les plugins de `base` (adresse absolue ou relative à la page) peuvent-ils être servis à un cadre opaque ? */
export function pluginsAccessiblesEnOpaque(base: string, options: OptionsSonde = {}): Promise<boolean> {
  const doc = options.document ?? (typeof document === "undefined" ? undefined : document);
  if (!doc) return Promise.resolve(false);
  const adresse = new URL(`${base.replace(/\/$/, "")}/index.json`, doc.baseURI).href;
  return new Promise((resolve) => {
    const cadre = doc.createElement("iframe");
    const fin = (ok: boolean): void => {
      clearTimeout(minuteur);
      window.removeEventListener("message", ecouteur);
      cadre.remove();
      resolve(ok);
    };
    const ecouteur = (event: MessageEvent): void => {
      if (event.source !== cadre.contentWindow) return;
      const ok = lireReponse(event.data);
      if (ok !== undefined) fin(ok);
    };
    const minuteur = setTimeout(() => fin(false), options.delaiMs ?? 4000);
    window.addEventListener("message", ecouteur);
    cadre.setAttribute("sandbox", "allow-scripts");
    cadre.setAttribute("aria-hidden", "true");
    cadre.tabIndex = -1;
    cadre.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    cadre.srcdoc = pageSonde(adresse);
    doc.body.appendChild(cadre);
  });
}
