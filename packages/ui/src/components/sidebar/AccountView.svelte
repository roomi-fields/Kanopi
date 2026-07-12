<script lang="ts">
  import { session } from '../../stores/session.svelte';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
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

  async function doLogout() {
    await session.logout();
  }
</script>

<div class="account">
  {#if session.session === null}
    <form onsubmit={submit}>
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
