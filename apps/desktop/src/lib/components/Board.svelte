<script lang="ts">
  // Le tableau de widgets de l'accueil (docs/28, section 4) : une grille de cases, des widgets de plugins (cadres isolés comme une
  // mini-app) et le widget du moteur « Favoris ». Le mode « Modifier » marche comme l'écran d'accueil d'un téléphone : on sélectionne un
  // widget en cliquant dessus, on le déplace à la souris, on le redimensionne en tirant ses bords, on le retire avec sa croix.
  import type { DocumentSnapshot, PluginToHost } from "@etabli/sdk/protocol";
  import { ajouterWidget, colonnesPour, dimensions, FAVORIS, largeurEffective, plusProcheTaille, redimensionner, retirerWidget, TAILLES_FAVORIS } from "$lib/board";
  import { openPluginSettings } from "$lib/pluginSettings";
  import { allWidgets, getPage, getPageByKey, getWidgetByKey, pageKey, pluginUrl, widgetKey, type PageRef } from "$lib/plugins/registry.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { BoardEntry, WidgetSize } from "$lib/types";
  import AppCard from "./AppCard.svelte";
  import Icon from "./Icon.svelte";
  import MiniAppFrame from "./MiniAppFrame.svelte";

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

  const pose = (cle: string): boolean => entrees.some((e) => e.key === cle);
  const modifier = (suivant: BoardEntry[], enregistrer = true): void => settings.setBoard(suivant, enregistrer);

  function tailles(e: BoardEntry): readonly WidgetSize[] {
    return e.key === FAVORIS ? TAILLES_FAVORIS : (getWidgetByKey(e.key)?.widget.sizes ?? [e.size]);
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

  const style = (e: BoardEntry): string => {
    const { h } = dimensions(e.size);
    return `grid-column: span ${largeurEffective(e.size, colonnes)}; height: ${h * CASE + (h - 1) * ESPACE}px;`;
  };

  // —— Déplacer : on attrape un widget et on le lâche sur un autre, les autres se serrent (comme sur un téléphone). ——
  let deplacement = $state<{ cle: string; x: number; y: number; bouge: boolean } | null>(null);

  function debutDeplacement(event: PointerEvent, cle: string): void {
    if (event.button !== 0) return;
    selection = cle;
    deplacement = { cle, x: event.clientX, y: event.clientY, bouge: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function pendantDeplacement(event: PointerEvent): void {
    const d = deplacement;
    if (!d) return;
    if (!d.bouge && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 6) return;
    d.bouge = true;
    const cibles = [...grille.querySelectorAll<HTMLElement>("[data-cle]")];
    const sous = cibles.find((el) => {
      if (el.dataset.cle === d.cle) return false;
      const r = el.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    });
    if (!sous?.dataset.cle) return;
    const liste = [...entrees];
    const de = liste.findIndex((e) => e.key === d.cle);
    const vers = liste.findIndex((e) => e.key === sous.dataset.cle);
    if (de < 0 || vers < 0 || de === vers) return;
    liste.splice(vers, 0, ...liste.splice(de, 1));
    modifier(liste, false);
  }

  function finDeplacement(): void {
    if (deplacement?.bouge) modifier([...entrees]);
    deplacement = null;
  }

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
      {#each [{ key: FAVORIS, titre: "Favoris", de: "Moteur", taille: "4x2" as WidgetSize }, ...disponibles.map((w) => ({ key: widgetKey(w.plugin.id, w.widget.id), titre: w.widget.title, de: w.plugin.name, taille: w.widget.default }))] as w (w.key)}
        <button class="choix" disabled={pose(w.key)} onclick={() => ((selection = w.key), modifier(ajouterWidget(entrees, w.key, w.taille)))}>
          <b>{w.titre}</b>
          <span>{w.de}{pose(w.key) ? " · déjà posé" : ""}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if edition}<p class="aide">Cliquez sur un widget pour le sélectionner, glissez-le pour le déplacer, tirez ses bords pour changer sa taille.</p>{/if}

  {#if entrees.length === 0}
    <p class="vide">Le tableau est vide. {edition ? "Ajoutez un widget." : "Cliquez sur « Modifier » pour en ajouter."}</p>
  {/if}

  <div bind:this={grille} class="grille" style:grid-template-columns={`repeat(${colonnes}, minmax(0, 1fr))`} style:gap="{ESPACE}px">
    {#each entrees as e (e.key)}
      {@const w = getWidgetByKey(e.key)}
      {#if e.key === FAVORIS || w}
        <div class="case" class:edition class:choisi={edition && selection === e.key} class:deplace={deplacement?.bouge && deplacement.cle === e.key} data-cle={e.key} style={style(e)}>
          {#if e.key === FAVORIS}
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
            <MiniAppFrame fill src={`${pluginUrl(w.plugin.id, w.app.entry)}#widget`} title={w.widget.title} pluginId={w.plugin.id} appId={w.app.id} {initial} forward={false} onmessage={messageDe(w.plugin.id)} />
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
      {:else if edition}
        <!-- Widget d'un plugin désinstallé ou désactivé : on peut le retirer, il reste sinon pour son retour. -->
        <div class="case absent" data-cle={e.key} style={style(e)}>
          <p>Widget introuvable ({e.key})</p>
          <button class="btn" onclick={() => modifier(retirerWidget(entrees, e.key))}>Retirer</button>
        </div>
      {/if}
    {/each}
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
  }
  .case {
    position: relative;
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
  .case.deplace {
    opacity: 0.7;
    box-shadow: var(--shadow);
  }
  .case.absent {
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--muted);
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
    z-index: 1;
    cursor: grab;
    border-radius: var(--r-md);
    touch-action: none;
  }
  .prise:active {
    cursor: grabbing;
  }
  .retirer {
    position: absolute;
    top: -10px;
    right: -10px;
    z-index: 4;
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
  /* Bords et coin à tirer : de petites poignées arrondies, posées sur le cadre du widget choisi. */
  .bord {
    position: absolute;
    z-index: 3;
    background: var(--accent);
    border: 2px solid var(--surface);
    touch-action: none;
  }
  .bord.droit {
    top: 50%;
    right: -7px;
    width: 12px;
    height: 36px;
    margin-top: -18px;
    border-radius: 6px;
    cursor: ew-resize;
  }
  .bord.bas {
    left: 50%;
    bottom: -7px;
    width: 36px;
    height: 12px;
    margin-left: -18px;
    border-radius: 6px;
    cursor: ns-resize;
  }
  .bord.coin {
    right: -8px;
    bottom: -8px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    cursor: nwse-resize;
  }
</style>
