<script lang="ts">
  // Paramètres (cahier des charges, section 5.10).
  import { system, type AppInfo } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import ShortcutRecorder from "$lib/components/ShortcutRecorder.svelte";
  import Switch from "$lib/components/Switch.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import { PLUGINS, getMiniAppByKey } from "$lib/plugins/registry";
  import {
    DEFAULT_SHORTCUT,
    TEXT_SCALES,
    settings,
    type IconStyle,
    type QuickShortcut,
  } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { SYSTEM_THEME, THEMES, currentColors, parseTheme, themeToJson, type Theme } from "$lib/themes";
  import type { SettingsSection } from "$lib/types";

  let { section = "general" }: { section?: SettingsSection } = $props();

  const SECTIONS: { id: SettingsSection; label: string }[] = [
    { id: "general", label: "Général" },
    { id: "apparence", label: "Apparence" },
    { id: "plugins", label: "Plugins" },
    { id: "apercu", label: "Aperçu rapide" },
    { id: "raccourcis", label: "Raccourcis clavier" },
    { id: "a-propos", label: "Mises à jour et à propos" },
  ];

  const ICON_STYLES: { id: IconStyle; label: string }[] = [
    { id: "couleur", label: "Icônes colorées" },
    { id: "emoji", label: "Émojis" },
  ];

  const SHORTCUTS: [string, string][] = [
    ["Ctrl + K", "Palette de commandes : ouvrir n'importe quelle mini-app"],
    ["Ctrl + T", "Nouvel onglet"],
    ["Ctrl + W", "Fermer l'onglet"],
    ["Ctrl + Maj + T", "Rouvrir le dernier onglet fermé"],
    ["Ctrl + Tab", "Onglet suivant (avec Maj : précédent)"],
    ["Ctrl + 1 à 9", "Aller à l'onglet n (9 : le dernier)"],
    ["Ctrl + B", "Replier ou déplier la colonne des plugins"],
    ["Alt + ←", "Page précédente dans l'onglet"],
    ["Clic molette", "Fermer un onglet, ou ouvrir dans un nouvel onglet"],
    ["Ctrl + clic", "Ouvrir dans un nouvel onglet"],
  ];

  const REPO = "https://github.com/Bryan-Cordonnier/etabli";

  let info = $state<AppInfo | null>(null);
  let autostart = $state(false);
  let shortcutError = $state<string | null>(null);
  let themeFile = $state<HTMLInputElement>();

  $effect(() => {
    void system.appInfo().then((value) => (info = value));
    void system.autostartEnabled().then((value) => (autostart = value));
    void system.shortcutStatus().then((status) => (shortcutError = status.erreur));
  });

  const goto = (id: SettingsSection) => tabs.navigate({ kind: "settings", section: id });

  async function setAutostart(active: boolean): Promise<void> {
    try {
      await system.setAutostart(active);
      autostart = active;
    } catch (err) {
      ui.notify(`Réglage impossible : ${err}`);
    }
  }

  function setCloseToTray(active: boolean): void {
    settings.set("closeToTray", active);
    void system.setCloseToTray(active);
  }

  async function changeShortcut(shortcut: QuickShortcut): Promise<string | null> {
    try {
      await system.setShortcut(shortcut.accelerator);
      settings.set("quickShortcut", shortcut);
      shortcutError = null;
      ui.notify(`Aperçu rapide : ${shortcut.label}`);
      return null;
    } catch (err) {
      return String(err);
    }
  }

  async function importTheme(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const theme = parseTheme(await file.text());
      settings.addTheme(theme);
      ui.notify(`Thème « ${theme.name} » importé`);
    } catch (err) {
      ui.notify(err instanceof Error ? err.message : String(err));
    }
  }

  async function copyTheme(): Promise<void> {
    const all = [...THEMES, ...settings.customThemes];
    const theme: Theme = all.find((t) => t.id === settings.theme) ?? {
      id: "mon-theme",
      name: "Mon thème",
      author: "",
      base: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      colors: currentColors(),
    };
    try {
      await navigator.clipboard.writeText(themeToJson({ ...theme, name: `${theme.name} (copie)` }));
      ui.notify("Thème copié : collez-le dans un fichier .json, modifiez les couleurs, puis importez-le.");
    } catch {
      ui.notify("Copie impossible");
    }
  }

  function reportProblem(): void {
    const body = [
      `**Version** : ${info?.version ?? "?"}`,
      `**Système** : ${navigator.userAgent}`,
      `**Plugins** : ${PLUGINS.map((p) => `${p.id} ${p.version}`).join(", ")}`,
      "",
      "**Ce qui s'est passé** :",
      "",
      "**Ce qui était attendu** :",
      "",
    ].join("\n");
    void system.openUrl(`${REPO}/issues/new?body=${encodeURIComponent(body)}`);
  }
</script>

{#snippet row(title: string, detail: string)}
  <div class="text">
    <b>{title}</b>
    <small>{detail}</small>
  </div>
{/snippet}

{#snippet themeCard(theme: Theme | undefined, removable: boolean)}
  {@const id = theme?.id ?? SYSTEM_THEME}
  <div class="theme" class:on={settings.theme === id}>
    <button class="pick" onclick={() => settings.set("theme", id)} aria-pressed={settings.theme === id}>
      {#if theme}
        {@const c = theme.colors}
        <span class="preview" style:background={c.surface}>
          <i style:background={c["surface-2"]} style:border-right="1px solid {c.border}"></i>
          <span class="lines">
            <b style:width="60%" style:background={c.text}></b>
            <b style:width="85%" style:background={c.field}></b>
            <b style:width="40%" style:background={c.accent}></b>
          </span>
        </span>
      {:else}
        <span class="preview system"></span>
      {/if}
      <span class="theme-label">
        {theme?.name ?? "Comme Windows"}
        <small>{theme?.author ?? "Clair ou sombre automatiquement"}</small>
      </span>
    </button>
    {#if removable && theme}
      <button class="remove" onclick={() => settings.removeTheme(theme.id)} aria-label="Supprimer le thème {theme.name}" title="Supprimer ce thème">
        <Icon name="x" size={14} />
      </button>
    {/if}
  </div>
{/snippet}

<div class="page">
  <h1>Paramètres</h1>
  <div class="layout">
    <nav class="sections" aria-label="Sections">
      {#each SECTIONS as s (s.id)}
        <button class:on={section === s.id} onclick={() => goto(s.id)}>{s.label}</button>
      {/each}
    </nav>

    <div class="body">
      {#if section === "general"}
        <div class="box">
          <h3>Fenêtre</h3>
          <div class="setting">
            {@render row(
              "Garder Établi dans la zone de notification",
              "Fermer la fenêtre la réduit près de l'horloge : l'aperçu rapide reste disponible au raccourci.",
            )}
            <Switch checked={settings.closeToTray} label="Garder dans la zone de notification" onchange={setCloseToTray} />
          </div>
          <div class="setting">
            {@render row(
              "Lancer au démarrage de Windows",
              "Établi démarre discrètement dans la zone de notification, prêt pour l'aperçu rapide.",
            )}
            <Switch checked={autostart} label="Lancer au démarrage de Windows" onchange={setAutostart} />
          </div>
        </div>

        <div class="box">
          <h3>Dossier de travail</h3>
          <p class="hint">Tous vos calculs y sont enregistrés, un sous-dossier par plugin.</p>
          <div class="path">
            <code>{info?.documents ?? "…"}</code>
            <button class="btn" onclick={() => info && void system.reveal(info.documents)}>Afficher dans l'Explorateur</button>
          </div>
        </div>
      {:else if section === "apparence"}
        <div class="box">
          <h3>Thème</h3>
          <div class="themes">
            {@render themeCard(undefined, false)}
            {#each THEMES as theme (theme.id)}
              {@render themeCard(theme, false)}
            {/each}
            {#each settings.customThemes as theme (theme.id)}
              {@render themeCard(theme, true)}
            {/each}
          </div>
          <div class="buttons">
            <button class="btn" onclick={() => themeFile?.click()}>Importer un thème…</button>
            <button class="btn" onclick={copyTheme}>Copier le thème actuel</button>
            <input bind:this={themeFile} type="file" accept=".json,application/json" hidden onchange={importTheme} />
          </div>
          <p class="hint">
            Un thème est un petit fichier JSON : un nom, une base claire ou sombre, et les couleurs à changer.
            Copiez le thème actuel pour partir d'un exemple.
          </p>
        </div>

        <div class="box">
          <h3>Affichage</h3>
          <div class="setting">
            {@render row("Icônes des plugins", "Chaque plugin choisit sa couleur et son émoji.")}
            <div class="segmented" role="radiogroup" aria-label="Style des icônes">
              {#each ICON_STYLES as style (style.id)}
                <button
                  class:on={settings.iconStyle === style.id}
                  role="radio"
                  aria-checked={settings.iconStyle === style.id}
                  onclick={() => settings.set("iconStyle", style.id)}
                >
                  {style.label}
                </button>
              {/each}
            </div>
          </div>
          <div class="setting">
            {@render row("Taille du texte", "Agrandit toute l'interface, mini-apps comprises.")}
            <div class="segmented" role="radiogroup" aria-label="Taille du texte">
              {#each TEXT_SCALES as scale (scale)}
                <button
                  class:on={settings.textScale === scale}
                  role="radio"
                  aria-checked={settings.textScale === scale}
                  onclick={() => settings.set("textScale", scale)}
                >
                  {Math.round(scale * 100)} %
                </button>
              {/each}
            </div>
          </div>
          <div class="setting">
            {@render row("Réduire les animations", "Supprime les fondus et glissements (activé d'office si Windows le demande).")}
            <Switch checked={settings.reduceMotion} label="Réduire les animations" onchange={(v) => settings.set("reduceMotion", v)} />
          </div>
        </div>
      {:else if section === "plugins"}
        <div class="box">
          <div class="box-head">
            <h3>Plugins installés</h3>
            <button class="btn" disabled title="Le catalogue en ligne arrive au jalon 6"><Icon name="puzzle" size={16} /> Parcourir le catalogue</button>
          </div>
          <div class="plugins">
            {#each PLUGINS as plugin (plugin.id)}
              {@const on = settings.isPluginEnabled(plugin.id)}
              <div class="setting">
                <Tile color={plugin.color} icon={plugin.icon} emoji={plugin.emoji} />
                <div class="text">
                  <b>{plugin.name} {#if plugin.official}<span class="pill">officiel</span>{/if}</b>
                  <small>{plugin.description} · v{plugin.version} · {plugin.miniApps.length} mini-app(s)</small>
                </div>
                <Switch checked={on} label="Activer {plugin.name}" onchange={() => settings.togglePlugin(plugin.id)} />
              </div>
            {/each}
          </div>
          <p class="hint">Pour changer l'ordre des plugins, faites-les glisser dans la colonne de gauche.</p>
        </div>
      {:else if section === "apercu"}
        <div class="box">
          <h3>Raccourci global</h3>
          <p class="hint">Ouvre l'aperçu rapide par-dessus n'importe quel logiciel, SolidWorks compris.</p>
          <ShortcutRecorder value={settings.quickShortcut} onchange={changeShortcut} />
          {#if shortcutError}
            <p class="error">{shortcutError}</p>
          {/if}
          <div class="buttons">
            <button class="btn" onclick={() => changeShortcut(DEFAULT_SHORTCUT)}>Rétablir {DEFAULT_SHORTCUT.label}</button>
            <button class="btn" onclick={() => void system.toggleQuick()}><Icon name="zap" size={16} /> Essayer l'aperçu</button>
          </div>
        </div>

        <div class="box">
          <h3>Favoris affichés dans l'aperçu</h3>
          {#if settings.favorites.length}
            <ol class="favorites">
              {#each settings.favorites as key, i (key)}
                {@const ref = getMiniAppByKey(key)}
                <li>
                  <span class="num">{i + 1}</span>
                  {#if ref}
                    <Tile color={ref.plugin.color} icon={ref.app.icon} emoji={ref.app.emoji} variant="soft" size={28} />
                    <span class="text"><b>{ref.app.name}</b><small>{ref.plugin.name}</small></span>
                  {:else}
                    <span class="text"><b>{key}</b><small>Plugin absent ou désactivé</small></span>
                  {/if}
                  <button class="mini" onclick={() => settings.moveFavorite(key, -1)} disabled={i === 0} aria-label="Monter">↑</button>
                  <button class="mini" onclick={() => settings.moveFavorite(key, 1)} disabled={i === settings.favorites.length - 1} aria-label="Descendre">↓</button>
                  <button class="mini" onclick={() => settings.toggleFavorite(key)} aria-label="Retirer des favoris"><Icon name="x" size={14} /></button>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="hint">Aucun favori.</p>
          {/if}
          <p class="hint">Ajoutez une mini-app avec l'étoile de sa tuile. Les 9 premières ont un accès direct par les touches 1 à 9.</p>
        </div>
      {:else if section === "raccourcis"}
        <div class="box">
          <h3>Dans la fenêtre principale</h3>
          <table class="keys">
            <tbody>
              <tr><td><kbd>{settings.quickShortcut.label}</kbd></td><td>Aperçu rapide, depuis n'importe quel logiciel</td></tr>
              {#each SHORTCUTS as [keys, action] (keys)}
                <tr><td><kbd>{keys}</kbd></td><td>{action}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="box">
          <h3>Dans l'aperçu rapide</h3>
          <table class="keys">
            <tbody>
              <tr><td><kbd>← ↑ → ↓</kbd></td><td>Choisir une mini-app</td></tr>
              <tr><td><kbd>Entrée</kbd></td><td>Ouvrir la mini-app choisie</td></tr>
              <tr><td><kbd>1 à 9</kbd></td><td>Ouvrir directement le favori n</td></tr>
              <tr><td><kbd>Échap</kbd></td><td>Revenir aux favoris, puis fermer</td></tr>
            </tbody>
          </table>
        </div>
      {:else}
        <div class="box">
          <h3>Version</h3>
          <p>Établi <b>{info?.version ?? "…"}</b></p>
          <p class="hint">Les mises à jour automatiques depuis GitHub arrivent au jalon 4.</p>
        </div>
        <div class="box">
          <h3>Projet</h3>
          <div class="buttons">
            <button class="btn" onclick={() => void system.openUrl(REPO)}>Code source sur GitHub</button>
            <button class="btn" onclick={reportProblem}>Signaler un problème</button>
          </div>
          <p class="hint">
            « Signaler un problème » ouvre un ticket GitHub prérempli avec la version et la liste des plugins,
            sans aucune donnée personnelle.
          </p>
          <p class="hint">Réglages : <code>{info?.config ?? "…"}</code></p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 28px;
    align-items: start;
  }
  .sections {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sections button {
    height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    text-align: left;
    color: var(--muted);
    font-weight: 500;
  }
  .sections button:hover {
    background: var(--field);
    color: var(--text);
  }
  .sections button.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 760px;
    min-width: 0;
  }
  .body p {
    margin: 0;
  }
  .box-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .setting {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 6px 0;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .text b {
    font-weight: 600;
  }
  .text small {
    color: var(--muted);
    font-size: 12.5px;
  }
  .error {
    color: var(--err);
    font-size: 13px;
  }
  .path {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  code {
    font: 12.5px var(--mono);
    background: var(--field);
    padding: 6px 10px;
    border-radius: var(--r-xs);
    user-select: text;
    overflow-wrap: anywhere;
  }

  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  .theme {
    position: relative;
    border: 2px solid var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
  }
  .theme.on {
    border-color: var(--accent);
  }
  .pick {
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    display: flex;
    flex-direction: column;
  }
  .preview {
    height: 78px;
    display: grid;
    grid-template-columns: 28% 1fr;
  }
  .preview.system {
    background: linear-gradient(135deg, #ffffff 50%, #161c24 50%);
  }
  .preview i {
    display: block;
  }
  .lines {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lines b {
    display: block;
    height: 8px;
    border-radius: var(--r-xs);
  }
  .theme-label {
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 600;
    display: flex;
    flex-direction: column;
    background: var(--surface);
  }
  .theme-label small {
    font-weight: 400;
    color: var(--faint);
    font-size: 11.5px;
  }
  .remove {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--r-xs);
    background: var(--surface);
    color: var(--muted);
    display: grid;
    place-items: center;
  }
  .remove:hover {
    color: var(--err);
  }

  .segmented {
    display: inline-flex;
    background: var(--field);
    border-radius: var(--r-md);
    padding: 3px;
    gap: 2px;
    flex: none;
  }
  .segmented button {
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--muted);
    font-weight: 500;
    white-space: nowrap;
  }
  .segmented button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }

  .plugins {
    display: flex;
    flex-direction: column;
  }

  .favorites {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .favorites li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: var(--r-md);
  }
  .favorites li:hover {
    background: var(--surface-2);
  }
  .num {
    width: 20px;
    text-align: center;
    font: 600 12px var(--mono);
    color: var(--faint);
  }
  .mini {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--r-xs);
    background: none;
    color: var(--muted);
    display: grid;
    place-items: center;
  }
  .mini:hover:not(:disabled) {
    background: var(--field);
    color: var(--text);
  }
  .mini:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .keys {
    border-collapse: collapse;
    width: 100%;
  }
  .keys td {
    padding: 7px 0;
    border-top: 1px solid var(--border);
    vertical-align: middle;
  }
  .keys tr:first-child td {
    border-top: 0;
  }
  .keys td:first-child {
    width: 190px;
    padding-right: 16px;
  }
  kbd {
    font: 600 12px var(--mono);
    background: var(--field);
    border: 1px solid var(--border);
    border-radius: var(--r-xs);
    padding: 2px 8px;
    white-space: nowrap;
  }
</style>
