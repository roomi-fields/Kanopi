<script lang="ts">
  import { session } from '../../stores/session.svelte';

  let mode = $state<'login' | 'signup'>('login');
  let email = $state('');
  let password = $state('');
  let passwordConfirm = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  function switchMode(next: 'login' | 'signup') {
    mode = next;
    error = null;
    password = '';
    passwordConfirm = '';
  }

  async function submitLogin(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await session.login(email, password);
      password = '';
    } catch {
      error = "Échec de connexion — vérifie l'email et le mot de passe.";
    } finally {
      busy = false;
    }
  }

  async function submitSignup(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== passwordConfirm) {
      error = 'Les mots de passe ne correspondent pas.';
      return;
    }
    busy = true;
    error = null;
    try {
      await session.register(email, password);
      password = '';
      passwordConfirm = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Échec de la création du compte — réessaie.';
    } finally {
      busy = false;
    }
  }

  async function doLogout() {
    await session.logout();
  }
</script>

<div class="account">
  {#if session.session === null}
    {#if mode === 'login'}
      <form onsubmit={submitLogin}>
        <label>
          <span class="label">Email</span>
          <input type="email" bind:value={email} autocomplete="username" required />
        </label>
        <label>
          <span class="label">Mot de passe</span>
          <input type="password" bind:value={password} autocomplete="current-password" required />
        </label>
        {#if error}
          <p class="error">{error}</p>
        {/if}
        <button class="submit" type="submit" disabled={busy}>
          {busy ? '…' : 'Log in'}
        </button>
      </form>
      <button class="switch-mode" type="button" onclick={() => switchMode('signup')}>
        Pas de compte ? Créer un compte
      </button>
    {:else}
      <form onsubmit={submitSignup}>
        <label>
          <span class="label">Email</span>
          <input type="email" bind:value={email} autocomplete="username" required />
        </label>
        <label>
          <span class="label">Mot de passe</span>
          <input
            type="password"
            bind:value={password}
            autocomplete="new-password"
            minlength={8}
            required
          />
          <span class="hint">8 caractères minimum</span>
        </label>
        <label>
          <span class="label">Confirmer le mot de passe</span>
          <input
            type="password"
            bind:value={passwordConfirm}
            autocomplete="new-password"
            required
          />
        </label>
        {#if error}
          <p class="error">{error}</p>
        {/if}
        <button class="submit" type="submit" disabled={busy}>
          {busy ? '…' : 'Créer un compte'}
        </button>
      </form>
      <button class="switch-mode" type="button" onclick={() => switchMode('login')}>
        Déjà un compte ? Se connecter
      </button>
    {/if}
  {:else}
    <p class="connected">Connecté : {session.session.email}</p>
    <button class="submit" type="button" onclick={doLogout}>Log out</button>
  {/if}
</div>

<style>
  .account {
    padding: 12px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .label {
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-muted);
    font-weight: 500;
  }
  input {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    color: var(--text);
    font-size: 11px;
    font-family: var(--font-mono);
  }
  input:focus {
    border-color: var(--amber);
    outline: none;
  }
  .submit {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--amber);
    background: rgba(232, 156, 62, 0.06);
    font-size: 11px;
    letter-spacing: 0.08em;
    transition: all 0.15s;
  }
  .submit:hover {
    border-color: var(--amber-dim);
    background: rgba(232, 156, 62, 0.12);
  }
  .submit:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  .switch-mode {
    width: 100%;
    margin-top: 8px;
    padding: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 10px;
    text-align: center;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .switch-mode:hover {
    color: var(--text);
  }
  .hint {
    font-size: 9px;
    color: var(--text-muted);
    opacity: 0.8;
  }
  .error {
    color: var(--red, #c84040);
    font-size: 10px;
    margin: 0;
  }
  .connected {
    color: var(--text);
    font-size: 11px;
    font-family: var(--font-mono);
    margin: 0 0 10px;
  }
</style>
