<script lang="ts">
  // Paramètres (section 5.10) : apparence, plugins, aperçu rapide, mises à jour.
  import { getVersion } from "@tauri-apps/api/app";
  import { isTauri } from "@tauri-apps/api/core";
  import Tile from "$lib/components/Tile.svelte";
  import { PLUGINS } from "$lib/plugins/registry";
  import { settings, type IconStyle } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { SYSTEM_THEME, THEMES, type Theme } from "$lib/themes";
  import type { SettingsSection } from "$lib/types";

  let { section = "apparence" }: { section?: SettingsSection } = $props();

  const SECTIONS: { id: SettingsSection; label: string }[] = [
    { id: "apparence", label: "Apparence" },
    { id: "plugins", label: "Plugins" },
    { id: "apercu", label: "Aperçu rapide" },
    { id: "mises-a-jour", label: "Mises à jour" },
  ];

  const ICON_STYLES: { id: IconStyle; label: string }[] = [
    { id: "couleur", label: "Icônes colorées" },
    { id: "emoji", label: "Émojis" },
  ];

  let version = $state("…");
  $effect(() => {
    if (isTauri()) getVersion().then((v) => (version = v));
    else version = "0.1.0 (aperçu navigateur)";
  });
</script>

{#snippet themeCard(id: string, theme: Theme | undefined)}
  <button class="theme" class:on={settings.theme === id} onclick={() => settings.setTheme(id)} aria-pressed={settings.theme === id}>
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
{/snippet}

<div class="page">
  <h1>Paramètres</h1>
  <div class="layout">
    <nav class="sections" aria-label="Sections">
      {#each SECTIONS as s (s.id)}
        <button class:on={section === s.id} onclick={() => tabs.navigate({ kind: "settings", section: s.id })}>
          {s.label}
        </button>
      {/each}
    </nav>

    <div class="body">
      {#if section === "apparence"}
        <div class="box">
          <h3>Thème</h3>
          <div class="themes">
            {@render themeCard(SYSTEM_THEME, undefined)}
            {#each THEMES as theme (theme.id)}
              {@render themeCard(theme.id, theme)}
            {/each}
          </div>
          <div class="row">
            <button class="btn" disabled title="Arrive avec le système de plugins">Importer un thème…</button>
            <button class="btn" disabled title="Arrive avec le système de plugins">Créer à partir du thème actuel</button>
          </div>
          <p class="hint">Un thème est un fichier JSON de couleurs, documenté pour que chacun puisse créer le sien.</p>
        </div>

        <div class="box">
          <h3>Icônes des plugins</h3>
          <div class="segmented" role="radiogroup" aria-label="Style des icônes">
            {#each ICON_STYLES as style (style.id)}
              <button
                class:on={settings.iconStyle === style.id}
                role="radio"
                aria-checked={settings.iconStyle === style.id}
                onclick={() => settings.setIconStyle(style.id)}
              >
                {style.label}
              </button>
            {/each}
          </div>
          <p class="hint">Chaque plugin choisit sa couleur et son émoji dans son manifeste.</p>
        </div>
      {:else if section === "plugins"}
        <div class="box">
          <h3>Plugins installés</h3>
          <div class="plugins">
            {#each PLUGINS as plugin (plugin.id)}
              {@const on = settings.isPluginEnabled(plugin.id)}
              <div class="plugin">
                <Tile color={plugin.color} icon={plugin.icon} emoji={plugin.emoji} />
                <div class="grow">
                  <div><b>{plugin.name}</b> {#if plugin.official}<span class="pill">officiel</span>{/if}</div>
                  <small>{plugin.description} · v{plugin.version}</small>
                </div>
                <button
                  class="switch"
                  class:on
                  role="switch"
                  aria-checked={on}
                  aria-label="Activer {plugin.name}"
                  onclick={() => settings.togglePlugin(plugin.id)}
                ></button>
              </div>
            {/each}
          </div>
          <p class="hint">Le catalogue et l'installation de nouveaux plugins arrivent au jalon 6.</p>
        </div>
      {:else if section === "apercu"}
        <div class="box">
          <h3>Aperçu rapide</h3>
          <div class="field">
            <span>Raccourci global</span>
            <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Espace</kbd>
          </div>
          <p class="hint">
            L'aperçu rapide affichera vos mini-apps favorites par-dessus n'importe quel logiciel. Il arrive au jalon 3.
          </p>
        </div>
      {:else}
        <div class="box">
          <h3>Mises à jour</h3>
          <p>Version installée : <b>{version}</b></p>
          <p class="hint">Les mises à jour automatiques depuis GitHub arrivent au jalon 4.</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 180px 1fr;
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
    border-radius: 8px;
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
    max-width: 720px;
    min-width: 0;
  }
  .body p {
    margin: 0;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  .theme {
    padding: 0;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: none;
    overflow: hidden;
    text-align: left;
    display: flex;
    flex-direction: column;
  }
  .theme.on {
    border-color: var(--accent);
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
    border-radius: 4px;
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

  .segmented {
    display: inline-flex;
    align-self: flex-start;
    background: var(--field);
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }
  .segmented button {
    height: 32px;
    padding: 0 14px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font-weight: 500;
  }
  .segmented button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }

  .plugins {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .plugin {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-radius: 10px;
  }
  .plugin:hover {
    background: var(--surface-2);
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .grow small {
    color: var(--muted);
  }
  .switch {
    position: relative;
    width: 38px;
    height: 22px;
    border: 0;
    border-radius: 99px;
    background: var(--border);
    flex: none;
    transition: background 0.15s;
  }
  .switch::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  .switch.on {
    background: var(--ok);
  }
  .switch.on::after {
    transform: translateX(16px);
  }

  .field {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }
  .field span {
    margin-right: 8px;
  }
  kbd {
    font: 12px var(--mono);
    background: var(--field);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 2px 6px;
    color: var(--text);
  }
</style>
