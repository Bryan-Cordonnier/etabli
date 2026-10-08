<script lang="ts">
  // Le tableau de widgets de l'accueil (docs/28, section 4) : une grille de cases, des widgets de plugins (cadres isolés comme une
  // mini-app) et le widget du moteur « Favoris ». Le mode « Modifier » permet d'ajouter, retirer, déplacer et redimensionner.
  import type { DocumentSnapshot, PluginToHost } from "@etabli/sdk/protocol";
  import { ajouterWidget, colonnesPour, deplacer, dimensions, FAVORIS, largeurEffective, redimensionner, retirerWidget, TAILLES_FAVORIS } from "$lib/board";
  import { openPluginSettings } from "$lib/pluginSettings";
  import { allWidgets, getPageByKey, getWidgetByKey, pageKey, pluginUrl, widgetKey, type PageRef } from "$lib/plugins/registry.svelte";
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

  const colonnes = $derived(colonnesPour(largeur));
  const entrees = $derived(settings.widgets);
  const disponibles = $derived(allWidgets().filter((w) => settings.isPluginEnabled(w.plugin.id)));
  const favoris = $derived(
    settings.favorites.map(getPageByKey).filter((r): r is PageRef => !!r && settings.isPluginEnabled(r.plugin.id)),
  );

  const pose = (cle: string): boolean => entrees.some((e) => e.key === cle);
  const modifier = (suivant: BoardEntry[]): void => settings.setBoard(suivant);

  function tailles(e: BoardEntry): readonly WidgetSize[] {
    return e.key === FAVORIS ? TAILLES_FAVORIS : (getWidgetByKey(e.key)?.widget.sizes ?? [e.size]);
  }

  function suivante(e: BoardEntry): WidgetSize {
    const liste = tailles(e);
    return liste[(liste.indexOf(e.size) + 1) % liste.length] ?? e.size;
  }

  function ouvrir(ref: PageRef, event: MouseEvent): void {
    tabs.navigate({ kind: "page", pluginId: ref.plugin.id, pageId: ref.page.id }, { newTab: event.ctrlKey || event.button === 1 });
  }

  function onmessage(message: PluginToHost): void {
    if (message.type === "notify") ui.notify(message.text);
    else if (message.type === "openSettings") openPluginSettings(message.plugin, message.hash);
  }

  const style = (e: BoardEntry): string => {
    const { h } = dimensions(e.size);
    return `grid-column: span ${largeurEffective(e.size, colonnes)}; height: ${h * CASE + (h - 1) * ESPACE}px;`;
  };
</script>

<section class="board" bind:clientWidth={largeur} aria-label="Tableau de l'accueil">
  <div class="barre">
    <h2>Mon tableau</h2>
    <div class="outils">
      {#if edition}
        <button class="btn" onclick={() => (galerie = !galerie)} aria-expanded={galerie}><Icon name="plus" size={15} /> Ajouter un widget</button>
      {/if}
      <button class="btn" class:primary={edition} onclick={() => ((edition = !edition), (galerie = false))}>
        {edition ? "Terminé" : "Modifier"}
      </button>
    </div>
  </div>

  {#if edition && galerie}
    <div class="galerie" role="group" aria-label="Widgets disponibles">
      {#each [{ key: FAVORIS, titre: "Favoris", de: "Établi", taille: "4x2" as WidgetSize }, ...disponibles.map((w) => ({ key: widgetKey(w.plugin.id, w.widget.id), titre: w.widget.title, de: w.plugin.name, taille: w.widget.default }))] as w (w.key)}
        <button class="choix" disabled={pose(w.key)} onclick={() => modifier(ajouterWidget(entrees, w.key, w.taille))}>
          <b>{w.titre}</b>
          <span>{w.de}{pose(w.key) ? " · déjà posé" : ""}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if entrees.length === 0}
    <p class="vide">Le tableau est vide. {edition ? "Ajoutez un widget." : "Cliquez sur « Modifier » pour en ajouter."}</p>
  {/if}

  <div class="grille" style:grid-template-columns={`repeat(${colonnes}, minmax(0, 1fr))`} style:gap="{ESPACE}px">
    {#each entrees as e, i (e.key)}
      {@const w = getWidgetByKey(e.key)}
      {#if e.key === FAVORIS || w}
        <div class="case" class:edition style={style(e)}>
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
            <MiniAppFrame fill src={`${pluginUrl(w.plugin.id, w.app.entry)}#widget`} title={w.widget.title} pluginId={w.plugin.id} appId={w.app.id} {initial} forward={false} {onmessage} />
          {/if}
          {#if edition}
            <div class="poignees" role="group" aria-label={`Réglages du widget ${w?.widget.title ?? "Favoris"}`}>
              <button class="mini" onclick={() => modifier(deplacer(entrees, e.key, -1))} disabled={i === 0} aria-label="Avancer" title="Avancer">←</button>
              <button class="mini" onclick={() => modifier(deplacer(entrees, e.key, 1))} disabled={i === entrees.length - 1} aria-label="Reculer" title="Reculer">→</button>
              <button class="mini taille" onclick={() => modifier(redimensionner(entrees, e.key, suivante(e)))} disabled={tailles(e).length < 2} title="Changer la taille">{e.size}</button>
              <button class="mini" onclick={() => modifier(retirerWidget(entrees, e.key))} aria-label="Retirer" title="Retirer">✕</button>
            </div>
          {/if}
        </div>
      {:else if edition}
        <!-- Widget d'un plugin désinstallé ou désactivé : on peut le retirer, il reste sinon pour son retour. -->
        <div class="case absent" style={style(e)}>
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
  .case.edition {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
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
  .poignees {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--r-sm, 8px);
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  }
  .mini {
    min-width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--r-xs);
    background: var(--field);
    color: inherit;
  }
  .mini:disabled {
    opacity: 0.4;
  }
  .taille {
    font-size: 11px;
    padding: 0 6px;
  }
</style>
