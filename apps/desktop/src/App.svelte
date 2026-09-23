<script lang="ts">
  // Écran provisoire du jalon 0 : vérifie que Tauri, Svelte et le thème fonctionnent.
  // Le moteur (colonne des plugins, onglets, Accueil) arrive au jalon 1.
  const version = "0.1.0";
</script>

<div class="shell">
  <aside class="side">
    <div class="brand">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M4 18h16M6 18V9l6-4 6 4v9" />
        </svg>
      </span>
      Établi
    </div>
  </aside>
  <main class="main">
    <h1>Le moteur démarre.</h1>
    <p>Tauri 2, Svelte 5 et le thème fonctionnent. Prochaine étape : colonne des plugins, onglets et Accueil.</p>
    <p class="version">Version {version}</p>
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 232px 1fr;
    height: 100%;
  }
  .side {
    background: var(--surface-2);
    border-right: 1px solid var(--border);
  }
  .brand {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    font-weight: 700;
    font-size: 15px;
  }
  .logo {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-text);
    display: grid;
    place-items: center;
  }
  .logo svg {
    width: 16px;
    height: 16px;
  }
  .main {
    padding: 32px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 22px;
  }
  p {
    margin: 0 0 6px;
    color: var(--muted);
  }
  .version {
    font: 12px var(--mono);
    color: var(--faint);
  }
</style>
