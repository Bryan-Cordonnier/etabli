<script lang="ts">
  // Le tableau de widgets de l'accueil (docs/28, section 4) : une grille de cases qui s'allonge autant qu'on veut, des widgets de plugins
  // (cadres isolés comme une mini-app) et le widget du moteur « Favoris ». Le mode « Modifier » marche comme l'écran d'accueil d'un téléphone :
  // on sélectionne un widget en cliquant dessus, on l'attrape pour le déplacer (il suit la souris, les autres se serrent), on tire ses bords
  // pour le redimensionner, on le retire avec sa croix. Un même widget peut être posé plusieurs fois.
  import type { DocumentSnapshot, PluginToHost } from "@etabli/sdk/protocol";
  import { ajouterWidget, baseDe, colonnesPour, dimensions, exemplaireDe, FAVORIS, largeurEffective, plusProcheTaille, redimensionner, retirerWidget, TAILLES_FAVORIS } from "$lib/board";
  import { openPluginSettings } from "$lib/pluginSettings";
  import { allWidgets, getPage, getPageByKey, getWidgetByKey, pageKey, pluginUrl, widgetKey, type PageRef } from "$lib/plugins/registry.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { BoardEntry, WidgetSize } from "$lib/types";
  import AppCard from "./AppCard.svelte";
  import Icon from "./Icon.svelte";
  import MiniAppFrame from "./MiniAppFrame.svelte";
  import Tile from "./Tile.svelte";

  /** Hauteur d'une case (px) ; un widget de n cases de haut fait n cases plus les espaces entre elles. */
  const CASE = 128;
  const ESPACE = 12;
  const initial: DocumentSnapshot = { id: null, title: "", data: null };

  let largeur = $state(1000);
  let edition = $state(false);
  let galerie = $state(false);
  let selection = $state<string | null>(null);
  let grille: HTMLElement;

  const colonnes = $derived(colonnesPour(largeur));
  const entrees = $derived(settings.widgets);
  const disponibles = $derived(allWidgets().filter((w) => settings.isPluginEnabled(w.plugin.id)));
  const favoris = $derived(
    settings.favorites.map(getPageByKey).filter((r): r is PageRef => !!r && settings.isPluginEnabled(r.plugin.id)),
  );

  const nombrePose = (base: string): number => entrees.filter((e) => baseDe(e.key) === base).length;
  const modifier = (suivant: BoardEntry[], enregistrer = true): void => settings.setBoard(suivant, enregistrer);

  function tailles(e: BoardEntry): readonly WidgetSize[] {
    return baseDe(e.key) === FAVORIS ? TAILLES_FAVORIS : (getWidgetByKey(e.key)?.widget.sizes ?? [e.size]);
  }

  function ouvrir(ref: PageRef, event: MouseEvent): void {
    tabs.navigate({ kind: "page", pluginId: ref.plugin.id, pageId: ref.page.id }, { newTab: event.ctrlKey || event.button === 1 });
  }

  /** Messages d'un widget : une notification, les réglages de son plugin, ou l'ouverture d'une de ses pages (en grand). */
  function messageDe(pluginId: string) {
    return (message: PluginToHost): void => {
      if (message.type === "notify") ui.notify(message.text);
      else if (message.type === "openSettings") openPluginSettings(message.plugin, message.hash);
      else if (message.type === "openPage" && getPage(pluginId, message.page)) tabs.navigate({ kind: "page", pluginId, pageId: message.page });
    };
  }

  /** Place d'un widget dans la grille : sa largeur (réduite au nombre de colonnes) et sa hauteur en cases. */
  const placeDe = (e: BoardEntry): string => {
    const { h } = dimensions(e.size);
    return `grid-column: span ${largeurEffective(e.size, colonnes)}; height: ${h * CASE + (h - 1) * ESPACE}px;`;
  };

  /** Le défilement de l'accueil : le parent qui défile, pour suivre la souris quand on approche d'un bord. */
  function defilant(): HTMLElement | null {
    for (let n: HTMLElement | null = grille.parentElement; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
    }
    return null;
  }

  // —— Déplacer : on attrape un widget, il suit la souris, les autres se serrent pour lui faire de la place. ——
  interface Prise {
    cle: string;
    /** Position de la souris au départ. */
    x0: number;
    y0: number;
    /** Position et taille du widget au départ (en fenêtre). */
    gauche: number;
    haut: number;
    l: number;
    h: number;
    bouge: boolean;
    dx: number;
    dy: number;
  }
  let prise = $state<Prise | null>(null);
  let defilement = 0;
  let boucle = 0;

  function debutDeplacement(event: PointerEvent, cle: string): void {
    if (event.button !== 0) return;
    selection = cle;
    const r = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-cle]")!.getBoundingClientRect();
    prise = { cle, x0: event.clientX, y0: event.clientY, gauche: r.left, haut: r.top, l: r.width, h: r.height, bouge: false, dx: 0, dy: 0 };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function pendantDeplacement(event: PointerEvent): void {
    const p = prise;
    if (!p) return;
    p.dx = event.clientX - p.x0;
    p.dy = event.clientY - p.y0;
    if (!p.bouge && Math.hypot(p.dx, p.dy) < 6) return;
    p.bouge = true;
    // Défilement automatique près du haut ou du bas de la zone visible.
    const zone = defilant();
    const r = zone?.getBoundingClientRect();
    defilement = !zone || !r ? 0 : event.clientY < r.top + 70 ? -14 : event.clientY > r.bottom - 70 ? 14 : 0;
    if (defilement !== 0 && !boucle) boucle = requestAnimationFrame(suivre);
    // La souris est au-dessus du centre d'une autre case : le widget prend sa place.
    const cellules = [...grille.querySelectorAll<HTMLElement>("[data-cle]")];
    const sous = cellules.find((el) => {
      if (el.dataset.cle === p.cle) return false;
      const c = el.getBoundingClientRect();
      const mx = c.width * 0.2;
      const my = c.height * 0.2;
      return event.clientX >= c.left + mx && event.clientX <= c.right - mx && event.clientY >= c.top + my && event.clientY <= c.bottom - my;
    });
    if (!sous?.dataset.cle) return;
    const liste = [...entrees];
    const de = liste.findIndex((e) => e.key === p.cle);
    const vers = liste.findIndex((e) => e.key === sous.dataset.cle);
    if (de < 0 || vers < 0 || de === vers) return;
    liste.splice(vers, 0, ...liste.splice(de, 1));
    modifier(liste, false);
  }

  function suivre(): void {
    boucle = 0;
    if (!prise?.bouge || defilement === 0) return;
    defilant()?.scrollBy({ top: defilement });
    boucle = requestAnimationFrame(suivre);
  }

  function finDeplacement(): void {
    if (prise?.bouge) modifier([...entrees]);
    prise = null;
    defilement = 0;
  }

  /** Le style du widget attrapé : détaché de la grille, à la position de la souris (sa place reste réservée dans la grille). */
  const styleCase = (e: BoardEntry): string =>
    prise?.bouge && prise.cle === e.key ? `position: fixed; left: ${prise.gauche + prise.dx}px; top: ${prise.haut + prise.dy}px; width: ${prise.l}px; height: ${prise.h}px;` : "";

  // —— Redimensionner : on tire un bord ou le coin, la taille s'accroche à la plus proche de celles que le widget accepte. ——
  let etirement = $state<{ cle: string; mode: "l" | "h" | "lh"; x: number; y: number; l0: number; h0: number } | null>(null);

  function debutEtirement(event: PointerEvent, e: BoardEntry, mode: "l" | "h" | "lh"): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    const r = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-cle]")!.getBoundingClientRect();
    etirement = { cle: e.key, mode, x: event.clientX, y: event.clientY, l0: r.width, h0: r.height };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function pendantEtirement(event: PointerEvent): void {
    const s = etirement;
    if (!s) return;
    const e = entrees.find((x) => x.key === s.cle);
    if (!e) return;
    const caseL = (grille.clientWidth - (colonnes - 1) * ESPACE) / colonnes;
    const courant = dimensions(e.size);
    const l = s.mode === "h" ? courant.l : Math.max(1, Math.round((s.l0 + event.clientX - s.x + ESPACE) / (caseL + ESPACE)));
    const h = s.mode === "l" ? courant.h : Math.max(1, Math.round((s.h0 + event.clientY - s.y + ESPACE) / (CASE + ESPACE)));
    const taille = plusProcheTaille(tailles(e), l, h);
    if (taille !== e.size) modifier(redimensionner(entrees, e.key, taille), false);
  }

  function finEtirement(): void {
    if (etirement) modifier([...entrees]);
    etirement = null;
  }

  function terminer(): void {
    edition = false;
    galerie = false;
    selection = null;
  }

  function poser(base: string, taille: WidgetSize): void {
    const avant = entrees.length;
    modifier(ajouterWidget(entrees, base, taille));
    const apres = settings.widgets;
    if (apres.length > avant) {
      selection = apres[apres.length - 1]!.key;
      // Le nouveau widget est tout en bas de l'accueil : on y descend.
      requestAnimationFrame(() => grille.querySelector(`[data-cle="${CSS.escape(selection ?? "")}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
  }

  function clavier(event: KeyboardEvent): void {
    if (edition && event.key === "Escape") selection ? (selection = null) : terminer();
  }
</script>

<svelte:window onkeydown={clavier} />

<section class="board" bind:clientWidth={largeur} aria-label="Tableau de l'accueil">
  <div class="barre">
    <h2>Mon tableau</h2>
    <div class="outils">
      {#if edition}
        <button class="btn" onclick={() => (galerie = !galerie)} aria-expanded={galerie}><Icon name="plus" size={15} /> Ajouter un widget</button>
      {/if}
      <button class="btn" class:primary={edition} onclick={() => (edition ? terminer() : (edition = true))}>
        {edition ? "Terminé" : "Modifier"}
      </button>
    </div>
  </div>

  {#if edition && galerie}
    <div class="galerie" role="group" aria-label="Widgets disponibles">
      {#each [{ key: FAVORIS, titre: "Favoris", de: "Moteur", taille: "4x2" as WidgetSize, une: true }, ...disponibles.map((w) => ({ key: widgetKey(w.plugin.id, w.widget.id), titre: w.widget.title, de: w.plugin.name, taille: w.widget.default, une: false }))] as w (w.key)}
        {@const n = nombrePose(w.key)}
        <button class="choix" disabled={w.une && n > 0} onclick={() => poser(w.key, w.taille)}>
          <b>{w.titre}</b>
          <span>{w.de}{n > 0 ? ` · ${n} posé${n > 1 ? "s" : ""}` : ""}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if edition}<p class="aide">Cliquez sur un widget pour le sélectionner, attrapez-le pour le déplacer, tirez ses bords pour changer sa taille. Ajoutez-en autant que vous voulez : l'accueil s'allonge.</p>{/if}

  {#if entrees.length === 0 && !edition}
    <p class="vide">Le tableau est vide. Cliquez sur « Modifier » pour ajouter des widgets.</p>
  {/if}

  <div bind:this={grille} class="grille" style:grid-template-columns={`repeat(${colonnes}, minmax(0, 1fr))`} style:gap="{ESPACE}px">
    {#each entrees as e (e.key)}
      {@const w = getWidgetByKey(e.key)}
      {#if baseDe(e.key) === FAVORIS || w}
        {@const attrape = prise?.bouge && prise.cle === e.key}
        <div class="cellule" data-cle={e.key} style={placeDe(e)}>
          <div class="case" class:edition class:choisi={edition && selection === e.key} class:attrape style={styleCase(e)}>
            {#if baseDe(e.key) === FAVORIS}
              <div class="favoris">
                <h3>Favoris</h3>
                {#if favoris.length}
                  <div class="cartes">
                    {#each favoris as ref, k (pageKey(ref.plugin.id, ref.page.id))}
                      <AppCard plugin={ref.plugin} page={ref.page} index={k} showPlugin onopen={(ev) => ouvrir(ref, ev)} />
                    {/each}
                  </div>
                {:else}
                  <p class="vide">Aucun favori. Ajoutez-en avec l'étoile d'une page.</p>
                {/if}
              </div>
            {:else if w}
              <MiniAppFrame
                fill
                src={`${pluginUrl(w.plugin.id, w.app.entry)}#widget=${w.widget.id}&i=${exemplaireDe(e.key)}`}
                title={w.widget.title}
                pluginId={w.plugin.id}
                appId={w.app.id}
                {initial}
                forward={false}
                onmessage={messageDe(w.plugin.id)}
              />
              <!-- D'où vient ce widget : l'icône et la couleur de son plugin. -->
              <span class="origine" title={w.plugin.name}><Tile color={w.plugin.color} icon={w.widget.icon} size={22} /></span>
            {/if}
            {#if edition}
              <!-- Couvre le widget (le cadre avale la souris) : un appui le sélectionne, un glissement le déplace. -->
              <div
                class="prise"
                role="button"
                tabindex="0"
                aria-label={`Sélectionner ${w?.widget.title ?? "Favoris"}`}
                onpointerdown={(ev) => debutDeplacement(ev, e.key)}
                onpointermove={pendantDeplacement}
                onpointerup={finDeplacement}
                onpointercancel={finDeplacement}
                onkeydown={(ev) => (ev.key === "Enter" || ev.key === " ") && (selection = e.key)}
              ></div>
              {#if selection === e.key}
                <button class="retirer" onclick={() => ((selection = null), modifier(retirerWidget(entrees, e.key)))} aria-label="Retirer le widget" title="Retirer">
                  <Icon name="x" size={14} strokeWidth={2.6} />
                </button>
                {#if tailles(e).length > 1}
                  <div class="bord droit" onpointerdown={(ev) => debutEtirement(ev, e, "l")} onpointermove={pendantEtirement} onpointerup={finEtirement} onpointercancel={finEtirement} role="slider" aria-label="Largeur" aria-valuenow={dimensions(e.size).l} tabindex="-1"></div>
                  <div class="bord bas" onpointerdown={(ev) => debutEtirement(ev, e, "h")} onpointermove={pendantEtirement} onpointerup={finEtirement} onpointercancel={finEtirement} role="slider" aria-label="Hauteur" aria-valuenow={dimensions(e.size).h} tabindex="-1"></div>
                  <div class="bord coin" onpointerdown={(ev) => debutEtirement(ev, e, "lh")} onpointermove={pendantEtirement} onpointerup={finEtirement} onpointercancel={finEtirement} role="slider" aria-label="Taille" aria-valuenow={dimensions(e.size).l} tabindex="-1"></div>
                {/if}
              {/if}
            {/if}
          </div>
        </div>
      {:else if edition}
        <!-- Widget d'un plugin désinstallé ou désactivé : on peut le retirer, il reste sinon pour son retour. -->
        <div class="cellule" data-cle={e.key} style={placeDe(e)}>
          <div class="case absent">
            <p>Widget introuvable ({e.key})</p>
            <button class="btn" onclick={() => modifier(retirerWidget(entrees, e.key))}>Retirer</button>
          </div>
        </div>
      {/if}
    {/each}
    {#if edition}
      <!-- Au bout de la grille : de la place pour en ajouter encore, sans fin. -->
      <button class="ajouter" style="grid-column: span 1; height: {CASE}px" onclick={() => (galerie = true)} aria-label="Ajouter un widget">
        <Icon name="plus" size={26} strokeWidth={2.4} />
        <span>Ajouter un widget</span>
      </button>
    {/if}
  </div>
</section>

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .barre {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .barre h2 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .outils {
    display: flex;
    gap: 8px;
  }
  .aide {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .galerie {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }
  .choix {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
  }
  .choix span {
    font-size: 12px;
    color: var(--muted);
  }
  .choix:disabled {
    opacity: 0.55;
  }
  .grille {
    display: grid;
    grid-auto-flow: row dense;
    padding-bottom: 24px;
  }
  /* La cellule garde sa place dans la grille, même quand le widget est attrapé et suit la souris. */
  .cellule {
    position: relative;
    min-width: 0;
  }
  .case {
    position: absolute;
    inset: 0;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    overflow: hidden;
    min-width: 0;
  }
  /* Les poignées dépassent un peu du cadre : on libère le débordement en édition. */
  .case.edition {
    overflow: visible;
    outline: 2px dashed color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: -2px;
  }
  .case.choisi {
    outline: 2px solid var(--accent);
    z-index: 2;
  }
  .case.attrape {
    inset: auto;
    z-index: 60;
    opacity: 0.92;
    box-shadow: 0 14px 34px rgb(0 0 0 / 0.35);
    cursor: grabbing;
  }
  .cellule:has(.attrape)::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: var(--r-md);
    border: 2px dashed var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .case.absent {
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--muted);
  }
  .origine {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 1;
    pointer-events: none;
    opacity: 0.95;
  }
  .favoris {
    height: 100%;
    overflow: auto;
    padding: 12px;
  }
  .favoris h3 {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--muted);
  }
  .cartes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .vide {
    margin: 0;
    color: var(--faint);
  }
  .prise {
    position: absolute;
    inset: 0;
    z-index: 3;
    cursor: grab;
    border-radius: var(--r-md);
    touch-action: none;
  }
  .ajouter {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 6px;
    border: 2px dashed var(--border);
    border-radius: var(--r-md);
    background: none;
    color: var(--muted);
    font-size: 13px;
  }
  .ajouter:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .retirer {
    position: absolute;
    top: -10px;
    right: -10px;
    z-index: 5;
    width: 26px;
    height: 26px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--err, #d64545);
    color: #fff;
    display: grid;
    place-items: center;
    padding: 0;
  }
  /* Bords et coin à tirer : de petites poignées arrondies, assez grandes pour être attrapées à la souris. */
  .bord {
    position: absolute;
    z-index: 4;
    background: var(--accent);
    border: 2px solid var(--surface);
    touch-action: none;
  }
  .bord.droit {
    top: 50%;
    right: -9px;
    width: 14px;
    height: 44px;
    margin-top: -22px;
    border-radius: 7px;
    cursor: ew-resize;
  }
  .bord.bas {
    left: 50%;
    bottom: -9px;
    width: 44px;
    height: 14px;
    margin-left: -22px;
    border-radius: 7px;
    cursor: ns-resize;
  }
  .bord.coin {
    right: -10px;
    bottom: -10px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    cursor: nwse-resize;
  }
</style>
