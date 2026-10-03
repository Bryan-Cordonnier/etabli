<script lang="ts">
  // Paramètres (cahier des charges, section 5.10). Les plugins peuvent y ajouter leurs propres pages
  // de réglages (fournisseurs, machines…) : elles s'affichent dans le menu, sous « Plugins ».
  import type { PluginToHost } from "@etabli/sdk/protocol";
  import { api, system, type AppInfo } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import MiniAppFrame from "$lib/components/MiniAppFrame.svelte";
  import PluginProblems from "$lib/components/PluginProblems.svelte";
  import ShortcutRecorder from "$lib/components/ShortcutRecorder.svelte";
  import Switch from "$lib/components/Switch.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import { PLUGINS, getMiniAppByKey, pluginUrl } from "$lib/plugins/registry.svelte";
  import { openPluginSettings, pluginSection } from "$lib/pluginSettings";
  import { ACTIONS, actionUsing } from "$lib/shortcuts";
  import { lifecycle } from "$lib/state/lifecycle.svelte";
  import { DEFAULT_SHORTCUT, TEXT_SCALES, settings, type Shortcut } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { updates } from "$lib/state/updates.svelte";
  import { SYSTEM_THEME, THEMES, currentColors, parseTheme, themeToJson, type Theme } from "$lib/themes";
  import type { SettingsSection } from "$lib/types";

  let { section = "general", hash }: { section?: SettingsSection; hash?: string } = $props();

  type FixedSection = Exclude<SettingsSection, `plugin:${string}`>;

  // Chaque page a un titre et une phrase qui dit à quoi elle sert ; le menu est rangé par thèmes.
  const SECTION_INFO: Record<FixedSection, { label: string; title: string; lead: string }> = {
    general: {
      label: "Général",
      title: "Général",
      lead: "Comment Établi se comporte avec Windows, et vos informations pour les fiches imprimées.",
    },
    apparence: {
      label: "Apparence",
      title: "Apparence",
      lead: "Couleurs, taille du texte et animations. Les mini-apps des plugins suivent ces réglages.",
    },
    apercu: {
      label: "Aperçu rapide",
      title: "Aperçu rapide",
      lead: "La petite fenêtre qui s'ouvre par-dessus n'importe quel logiciel pour lancer un calcul sans quitter votre travail.",
    },
    raccourcis: {
      label: "Raccourcis clavier",
      title: "Raccourcis clavier",
      lead: "Aucun raccourci n'est réglé d'avance (sauf l'aperçu rapide) : choisissez ceux dont vous avez besoin.",
    },
    plugins: {
      label: "Plugins installés",
      title: "Plugins installés",
      lead: "Activez ou désactivez les plugins. Pour en ajouter ou en retirer, ouvrez le catalogue.",
    },
    "a-propos": {
      label: "Mises à jour et à propos",
      title: "Mises à jour et à propos",
      lead: "Version d'Établi, recherche de mises à jour et liens du projet.",
    },
  };

  const GROUPS: { title: string; sections: FixedSection[] }[] = [
    { title: "Application", sections: ["general", "apparence", "apercu", "raccourcis"] },
    { title: "Plugins", sections: ["plugins"] },
    { title: "Aide", sections: ["a-propos"] },
  ];

  /** Pages de réglages ajoutées par les plugins installés et activés. */
  const PAGES = $derived(
    PLUGINS.filter((p) => settings.isPluginEnabled(p.id)).flatMap((plugin) =>
      plugin.settings.map((page) => ({ section: pluginSection(plugin.id, page.id), plugin, page })),
    ),
  );
  const pluginPage = $derived(PAGES.find((p) => p.section === section));
  /** Page affichée : une section inconnue (ancienne version, plugin désinstallé) revient à Général. */
  const active = $derived<FixedSection | `plugin:${string}`>(
    pluginPage ? pluginPage.section : section in SECTION_INFO ? (section as FixedSection) : "general",
  );
  const head = $derived(
    pluginPage
      ? { title: pluginPage.page.title, lead: `Réglages ajoutés par le plugin « ${pluginPage.plugin.name} ».` }
      : SECTION_INFO[active as FixedSection],
  );

  /** Actions regroupées pour la page Raccourcis, dans l'ordre de `ACTIONS`. */
  const ACTION_GROUPS = ACTIONS.reduce<{ title: string; actions: typeof ACTIONS }[]>((groups, action) => {
    const group = groups.find((g) => g.title === action.group);
    if (group) group.actions.push(action);
    else groups.push({ title: action.group, actions: [action] });
    return groups;
  }, []);

  /** La page d'un plugin n'a pas de calcul : le moteur ne garde que ses notifications et ses demandes d'ouverture. */
  function onPluginMessage(message: PluginToHost): void {
    if (message.type === "notify") ui.notify(message.text);
    else if (message.type === "copy") {
      void navigator.clipboard.writeText(message.text).then(
        () => ui.notify(`Copié : ${message.text}`),
        () => ui.notify("Copie impossible"),
      );
    } else if (message.type === "openSettings") openPluginSettings(message.plugin, message.hash);
  }

  const noDocument = { id: null, title: "", data: null };
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

  async function changeShortcut(shortcut: Shortcut): Promise<string | null> {
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

  /** Règle le raccourci d'une action de l'application, sauf s'il sert déjà à une autre. */
  function setActionShortcut(actionId: string, shortcut: Shortcut): string | null {
    const other = actionUsing(shortcut.accelerator, actionId);
    if (other) return `Déjà utilisé par « ${other.label} ». Effacez d'abord celui-là.`;
    settings.setShortcut(actionId, shortcut);
    return null;
  }

  const shortcutCount = $derived(Object.keys(settings.shortcuts).length);

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
    // Formulaire « Bug » du dépôt (.github/ISSUE_TEMPLATE/bug.yml) : la version et les plugins sont préremplis.
    const params = new URLSearchParams({
      template: "bug.yml",
      version: info?.version ?? "",
      plugins: PLUGINS.map((p) => `${p.name} ${p.version}`).join(", "),
    });
    void system.openUrl(`${REPO}/issues/new?${params}`);
  }
</script>

{#snippet row(title: string, detail: string)}
  <div class="text">
    <b>{title}</b>
    {#if detail}<small>{detail}</small>{/if}
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
      {#each GROUPS as group (group.title)}
        <p class="group">{group.title}</p>
        {#each group.sections as id (id)}
          <button class:on={active === id} onclick={() => goto(id)}>{SECTION_INFO[id].label}</button>
        {/each}
        {#if group.title === "Plugins"}
          {#each PAGES as entry (entry.section)}
            <button class:on={active === entry.section} onclick={() => goto(entry.section)}>{entry.page.title}</button>
          {/each}
        {/if}
      {/each}
    </nav>

    <div class="body" class:wide={!!pluginPage}>
      <header class="section-head">
        <h2>{head.title}</h2>
        <p>{head.lead}</p>
      </header>

      {#if pluginPage}
        <PluginProblems plugin={pluginPage.plugin} />
        <div class="plugin-frame">
          <MiniAppFrame
            src={pluginUrl(pluginPage.plugin.id, pluginPage.page.entry) + (hash ? `#${hash}` : "")}
            title={pluginPage.page.title}
            pluginId={pluginPage.plugin.id}
            appId={`reglages-${pluginPage.page.id}`}
            initial={noDocument}
            onmessage={onPluginMessage}
          />
        </div>
      {:else if active === "general"}
        <div class="box">
          <h3>Quand je ferme la fenêtre</h3>
          <div class="choices" role="radiogroup" aria-label="Quand je ferme la fenêtre">
            <button
              class="choice"
              class:on={settings.closeToTray}
              role="radio"
              aria-checked={settings.closeToTray}
              onclick={() => setCloseToTray(true)}
            >
              <b>Établi reste en arrière-plan</b>
              <small>La fenêtre se ferme mais Établi continue près de l'horloge : le raccourci de l'aperçu rapide reste disponible. Pour quitter, clic droit sur son icône → Quitter.</small>
            </button>
            <button
              class="choice"
              class:on={!settings.closeToTray}
              role="radio"
              aria-checked={!settings.closeToTray}
              onclick={() => setCloseToTray(false)}
            >
              <b>Établi se ferme complètement</b>
              <small>Fermer la fenêtre quitte l'application. L'aperçu rapide ne répond plus tant qu'Établi n'est pas relancé.</small>
            </button>
          </div>
        </div>

        <div class="box">
          <h3>Au démarrage de Windows</h3>
          <div class="setting">
            {@render row(
              "Lancer Établi quand j'ouvre ma session Windows",
              "Établi démarre réduit près de l'horloge, sans ouvrir de fenêtre, prêt pour l'aperçu rapide.",
            )}
            <Switch checked={autostart} label="Lancer Établi au démarrage de Windows" onchange={setAutostart} />
          </div>
        </div>

        <div class="box">
          <h3>Fiches d'atelier</h3>
          <div class="setting">
            {@render row("Votre nom", "Écrit dans le cartouche des fiches imprimées (« Préparé : … »). Laissez vide pour ne rien écrire.")}
            <input
              class="text-input"
              value={settings.author}
              onchange={(e) => settings.set("author", e.currentTarget.value.trim())}
              placeholder="Prénom Nom"
              aria-label="Votre nom"
              spellcheck="false"
            />
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
      {:else if active === "apparence"}
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
      {:else if active === "plugins"}
        <div class="box">
          <div class="box-head">
            <h3>Plugins installés</h3>
            <button class="btn" onclick={() => tabs.navigate({ kind: "catalogue" })}><Icon name="store" size={16} /> Parcourir le catalogue</button>
          </div>
          <div class="plugins">
            {#each PLUGINS as plugin (plugin.id)}
              {@const on = settings.isPluginEnabled(plugin.id)}
              {@const needs = Object.keys(plugin.dependencies)}
              <div class="plugin-row">
                <div class="setting">
                  <Tile color={plugin.color} icon={plugin.icon} />
                  <div class="text">
                    <b>{plugin.name} {#if plugin.official}<span class="pill">officiel</span>{/if}</b>
                    <small>
                      {plugin.description} · v{plugin.version} ·
                      {plugin.miniApps.length
                        ? `${plugin.miniApps.length} mini-app${plugin.miniApps.length > 1 ? "s" : ""}`
                        : `réglages : ${plugin.settings.map((s) => s.title).join(", ") || "aucun"}`}
                    </small>
                    {#if needs.length}
                      <small>A besoin de : {needs.map((id) => PLUGINS.find((p) => p.id === id)?.name ?? id).join(", ")}</small>
                    {/if}
                  </div>
                  <Switch checked={on} label="Activer {plugin.name}" onchange={() => lifecycle.toggle(plugin.id)} />
                </div>
                <PluginProblems {plugin} compact />
              </div>
            {/each}
            {#if !PLUGINS.length}<p class="hint">Aucun plugin installé : ouvrez le catalogue pour en ajouter.</p>{/if}
          </div>
          <p class="hint">Pour changer l'ordre des plugins, faites-les glisser dans la colonne de gauche.</p>
        </div>
      {:else if active === "apercu"}
        <div class="box">
          <h3>Raccourci global</h3>
          <p class="hint">Ouvre l'aperçu rapide par-dessus n'importe quel logiciel, SolidWorks compris.</p>
          <ShortcutRecorder value={settings.quickShortcut} scope="global" name="aperçu rapide" onchange={changeShortcut} />
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
                    <Tile color={ref.plugin.color} icon={ref.app.icon} variant="soft" size={28} />
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
      {:else if active === "raccourcis"}
        <div class="box">
          <h3>Aperçu rapide (depuis n'importe quel logiciel)</h3>
          <div class="setting">
            {@render row("Ouvrir l'aperçu rapide", "Le seul raccourci réglé d'avance. Ses réglages sont dans « Aperçu rapide ».")}
            <kbd>{settings.quickShortcut.label}</kbd>
          </div>
        </div>

        <div class="box">
          <div class="box-head">
            <h3>Dans la fenêtre d'Établi</h3>
            <button class="btn" disabled={shortcutCount === 0} onclick={() => { for (const a of ACTIONS) settings.setShortcut(a.id, null); }}>
              Tout effacer
            </button>
          </div>
          <p class="hint">
            Cliquez sur une case, puis appuyez sur la combinaison voulue : Ctrl ou Alt avec une lettre, un chiffre ou une flèche
            (les touches F1 à F12 peuvent servir seules). Les mini-apps des plugins reçoivent la même liste et la respectent.
          </p>
          {#each ACTION_GROUPS as group (group.title)}
            <h4>{group.title}</h4>
            <div class="rows">
              {#each group.actions as action (action.id)}
                <div class="setting">
                  {@render row(action.label, "")}
                  <ShortcutRecorder
                    compact
                    scope="app"
                    name={action.label}
                    value={settings.shortcuts[action.id] ?? null}
                    onchange={(shortcut) => setActionShortcut(action.id, shortcut)}
                    onclear={() => settings.setShortcut(action.id, null)}
                  />
                </div>
              {/each}
            </div>
          {/each}
        </div>

        <div class="box">
          <h3>Souris</h3>
          <table class="keys">
            <tbody>
              <tr><td><kbd>Ctrl + clic</kbd></td><td>Ouvrir un lien dans un nouvel onglet</td></tr>
              <tr><td><kbd>Clic molette</kbd></td><td>Fermer un onglet, ou ouvrir dans un nouvel onglet</td></tr>
              <tr><td><kbd>Bouton précédent</kbd></td><td>Page précédente dans l'onglet</td></tr>
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
          <h3>Mises à jour</h3>
          <p>Version installée : Établi <b>{info?.version ?? "…"}</b></p>
          {#if !api.capacites.miseAJour}
            <p class="hint">Mises à jour indisponibles dans l'aperçu navigateur.</p>
          {:else if updates.status === "available" || updates.status === "downloading" || updates.status === "installing"}
            <div class="update">
              <p><b>Établi {updates.version}</b> est disponible.</p>
              {#if updates.notes}<pre class="notes">{updates.notes}</pre>{/if}
              {#if updates.status === "available"}
                <div class="buttons">
                  <button class="btn primary" onclick={() => void updates.install()}>Installer et redémarrer</button>
                </div>
                <p class="hint">Établi se ferme, s'installe et se relance : vos calculs sont déjà enregistrés.</p>
              {:else}
                <p class="hint">
                  {updates.status === "installing"
                    ? "Installation… Établi va redémarrer."
                    : `Téléchargement${Number.isFinite(updates.progress) ? ` : ${Math.round(updates.progress * 100)} %` : "…"}`}
                </p>
              {/if}
            </div>
          {:else}
            <div class="buttons">
              <button class="btn" disabled={updates.busy} onclick={() => void updates.check()}>
                {updates.status === "checking" ? "Recherche…" : "Rechercher une mise à jour"}
              </button>
            </div>
            {#if updates.status === "uptodate"}
              <p class="hint">Établi est à jour.</p>
            {:else if updates.status === "error"}
              <p class="hint">Impossible de joindre GitHub ({updates.error}). Vérifiez la connexion à Internet.</p>
            {/if}
          {/if}
          <div class="setting">
            {@render row("Chercher au démarrage", "Quelques secondes après l'ouverture, Établi regarde sur GitHub s'il existe une nouvelle version.")}
            <Switch checked={settings.checkUpdates} label="Chercher les mises à jour au démarrage" onchange={(v) => settings.set("checkUpdates", v)} />
          </div>
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
  .sections .group {
    margin: 14px 0 4px;
    padding: 0 12px;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .sections .group:first-child {
    margin-top: 0;
  }
  .section-head h2 {
    margin: 0 0 4px;
    font-size: 20px;
  }
  .section-head p {
    color: var(--muted);
    font-size: 14px;
  }
  .body h4 {
    margin: 16px 0 2px;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--muted);
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .rows .setting {
    border-top: 1px solid var(--border);
    padding: 8px 0;
  }
  .rows .setting:first-child {
    border-top: 0;
  }
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .choice {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    text-align: left;
    border: 2px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    color: var(--text);
  }
  .choice:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  }
  .choice.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .choice small {
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.4;
  }
  @media (max-width: 900px) {
    .choices {
      grid-template-columns: 1fr;
    }
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 760px;
    min-width: 0;
  }
  .body.wide {
    max-width: 1000px;
  }
  .body p {
    margin: 0;
  }
  .text-input {
    width: 220px;
    height: 36px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
    font: 500 14px var(--font);
    color: var(--text);
    outline: none;
  }
  .text-input:focus {
    border-color: var(--accent);
    background: var(--surface);
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
  .update {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: var(--r-md);
    background: var(--accent-soft);
  }
  .update p {
    margin: 0;
  }
  /* Notes de version : le message écrit à la publication, tel quel. */
  .notes {
    margin: 0;
    max-height: 220px;
    overflow: auto;
    font: 13px/1.5 var(--font);
    white-space: pre-wrap;
    user-select: text;
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
  .plugin-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 0 6px;
  }
  .plugin-frame {
    min-width: 0;
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
