// Impression d'une fiche d'atelier (cahier des charges, section 3.2) : le moteur met les pages du
// plugin en forme (en-tête, cartouche, pied de page numéroté) dans un cadre caché, puis ouvre la
// fenêtre d'impression de Windows. « Enregistrer au format PDF » y donne le fichier PDF.
import type { FichePrint } from "@etabli/sdk/protocol";
import FICHE_CSS from "./fiche.css?raw";

const LOGO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M4 18h16M6 18V9l6-4 6 4v9"/></svg>';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Texte placé dans une chaîne CSS (`content: "…"`) : ni guillemet ni retour à la ligne. */
const cssString = (text: string) => `"${text.replace(/["\\\n\r]/g, " ")}"`;

export interface PrintContext {
  author: string;
  date: Date;
}

/** Document HTML complet de la fiche (sans aucun script). */
export function ficheHtml(fiche: FichePrint, context: PrintContext): string {
  const ident: [string, string][] = [
    ...fiche.ident,
    ["Date", context.date.toLocaleDateString("fr-FR")],
    ...(context.author.trim() ? ([["Préparé", context.author.trim()]] as [string, string][]) : []),
  ];
  const head = `
    <header class="head">
      <div>
        <div class="brand"><i>${LOGO}</i>Établi · ${escapeHtml(fiche.kind)}</div>
        <h1>${escapeHtml(fiche.title)}</h1>
        ${fiche.subtitle ? `<div class="subtitle">${escapeHtml(fiche.subtitle)}</div>` : ""}
      </div>
      <div class="ident">${ident.map(([k, v]) => `<div><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("")}</div>
    </header>`;
  const pages = (fiche.pages.length ? fiche.pages : [""]).map(
    (body, i) => `<section class="page">${i === 0 ? head : ""}${body}</section>`,
  );
  // Pied de page dans la marge de chaque feuille imprimée, avec le numéro de page.
  const footer = `Établi — ${fiche.kind} · ${fiche.title}`;
  const page = `
    @page {
      size: A4;
      margin: 12mm 12mm 14mm;
      @bottom-left { content: ${cssString(footer)}; font: 9px Arial, sans-serif; color: #7c8591; }
      @bottom-right { content: counter(page) " / " counter(pages); font: 9px Consolas, monospace; color: #7c8591; }
    }`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`${fiche.kind} - ${fiche.title}`)}</title>
<style>${FICHE_CSS}${page}</style>
${fiche.css ? `<style>${fiche.css.replace(/<\/style/gi, "")}</style>` : ""}
</head>
<body>${pages.join("\n")}</body>
</html>`;
}

let current: HTMLIFrameElement | null = null;

/**
 * Ouvre la fenêtre d'impression pour la fiche. Le cadre est isolé et sans script : le HTML vient
 * du plugin, il ne peut rien exécuter. Il garde l'origine de l'application pour pouvoir être imprimé.
 */
export function printFiche(fiche: FichePrint, context: PrintContext): void {
  current?.remove();
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  frame.srcdoc = ficheHtml(fiche, context);
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    win.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 0), { once: true });
    win.focus();
    win.print();
  };
  current = frame;
  document.body.append(frame);
}
