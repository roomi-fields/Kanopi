<script lang="ts">
  import { session } from '../../stores/session.svelte';

  let mode = $state<'login' | 'signup' | 'forgot'>('login');
  let email = $state('');
  let password = $state('');
  let passwordConfirm = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let forgotSent = $state(false);

  // Display name (profile).
  let nameInput = $state('');
  let nameBusy = $state(false);
  let nameError = $state<string | null>(null);
  let nameSaved = $state(false);
  let nameSavedTimeout: ReturnType<typeof setTimeout> | undefined;

  // Keep the name field in sync with the projected session (login/logout/save round-trips) —
  // derive, don't let it drift into stale local state.
  $effect(() => {
    nameInput = session.session?.name ?? '';
  });

  // Change password (collapsible section).
  let passwordSectionOpen = $state(false);
  let currentPassword = $state('');
  let newPassword = $state('');
  let newPasswordConfirm = $state('');
  let passwordBusy = $state(false);
  let passwordError = $state<string | null>(null);
  let passwordUpdated = $state(false);
  let passwordUpdatedTimeout: ReturnType<typeof setTimeout> | undefined;

  function switchMode(next: 'login' | 'signup' | 'forgot') {
    mode = next;
    error = null;
    password = '';
    passwordConfirm = '';
    forgotSent = false;
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
      error = 'Login failed — check your email and password.';
    } finally {
      busy = false;
    }
  }

  async function submitSignup(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== passwordConfirm) {
      error = "Passwords don't match.";
      return;
    }
    busy = true;
    error = null;
    try {
      await session.register(email, password);
      password = '';
      passwordConfirm = '';
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't create the account — try again.";
    } finally {
      busy = false;
    }
  }

  async function submitForgot(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    // Anti-enumeration contract: this always resolves and always shows the same message,
    // whether the account exists or not. Actually delivering the email depends on the
    // service's SMTP configuration — out of scope for this component.
    await session.requestPasswordReset(email);
    forgotSent = true;
    busy = false;
  }

  async function doLogout() {
    await session.logout();
  }

  async function saveName(e: SubmitEvent) {
    e.preventDefault();
    if (nameBusy) return;
    nameBusy = true;
    nameError = null;
    try {
      await session.updateProfile({ name: nameInput });
      nameSaved = true;
      clearTimeout(nameSavedTimeout);
      nameSavedTimeout = setTimeout(() => (nameSaved = false), 3000);
    } catch (e) {
      nameError = e instanceof Error ? e.message : "Couldn't save — try again.";
    } finally {
      nameBusy = false;
    }
  }

  function togglePasswordSection() {
    passwordSectionOpen = !passwordSectionOpen;
    passwordError = null;
    if (!passwordSectionOpen) {
      currentPassword = '';
      newPassword = '';
      newPasswordConfirm = '';
    }
  }

  async function submitChangePassword(e: SubmitEvent) {
    e.preventDefault();
    if (passwordBusy) return;
    if (newPassword !== newPasswordConfirm) {
      passwordError = "Passwords don't match.";
      return;
    }
    passwordBusy = true;
    passwordError = null;
    try {
      await session.changePassword(currentPassword, newPassword);
      passwordSectionOpen = false;
      currentPassword = '';
      newPassword = '';
      newPasswordConfirm = '';
      passwordUpdated = true;
      clearTimeout(passwordUpdatedTimeout);
      passwordUpdatedTimeout = setTimeout(() => (passwordUpdated = false), 3000);
    } catch (e) {
      passwordError = e instanceof Error ? e.message : "Couldn't change password — try again.";
    } finally {
      passwordBusy = false;
    }
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
          <span class="label">Password</span>
          <input type="password" bind:value={password} autocomplete="current-password" required />
        </label>
        {#if error}
          <p class="error">{error}</p>
        {/if}
        <button class="submit" type="submit" disabled={busy}>
          {busy ? '…' : 'Log in'}
        </button>
      </form>
      <div class="links">
        <button class="switch-mode" type="button" onclick={() => switchMode('signup')}>
          Create account
        </button>
        <button class="switch-mode" type="button" onclick={() => switchMode('forgot')}>
          Forgot password?
        </button>
      </div>
    {:else if mode === 'signup'}
      <form onsubmit={submitSignup}>
        <label>
          <span class="label">Email</span>
          <input type="email" bind:value={email} autocomplete="username" required />
        </label>
        <label>
          <span class="label">Password</span>
          <input
            type="password"
            bind:value={password}
            autocomplete="new-password"
            minlength={8}
            required
          />
          <span class="hint">8 characters minimum</span>
        </label>
        <label>
          <span class="label">Confirm password</span>
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
          {busy ? '…' : 'Create account'}
        </button>
      </form>
      <button class="switch-mode" type="button" onclick={() => switchMode('login')}>
        Already have an account? Log in
      </button>
    {:else}
      <form onsubmit={submitForgot}>
        <label>
          <span class="label">Email</span>
          <input type="email" bind:value={email} autocomplete="username" required />
        </label>
        {#if forgotSent}
          <p class="hint">
            If an account exists for that address, we've sent a password reset link.
          </p>
        {/if}
        <button class="submit" type="submit" disabled={busy}>
          {busy ? '…' : 'Send reset link'}
        </button>
      </form>
      <button class="switch-mode" type="button" onclick={() => switchMode('login')}>
        Back to sign in
      </button>
    {/if}
  {:else}
    <p class="connected">Signed in as {session.session.name || session.session.email}</p>

    <form class="section" onsubmit={saveName}>
      <span class="label">Display name</span>
      <div class="row">
        <input type="text" bind:value={nameInput} autocomplete="name" />
        <button class="submit small" type="submit" disabled={nameBusy}>
          {nameBusy ? '…' : 'Save'}
        </button>
      </div>
      {#if nameSaved}
        <p class="saved-hint">Saved</p>
      {/if}
      {#if nameError}
        <p class="error">{nameError}</p>
      {/if}
    </form>

    <div class="section">
      <button class="section-toggle" type="button" onclick={togglePasswordSection}>
        {passwordSectionOpen ? 'Cancel' : 'Change password'}
      </button>
      {#if passwordSectionOpen}
        <form onsubmit={submitChangePassword}>
          <label>
            <span class="label">Current password</span>
            <input
              type="password"
              bind:value={currentPassword}
              autocomplete="current-password"
              required
            />
          </label>
          <label>
            <span class="label">New password</span>
            <input
              type="password"
              bind:value={newPassword}
              autocomplete="new-password"
              minlength={8}
              required
            />
            <span class="hint">8 characters minimum</span>
          </label>
          <label>
            <span class="label">Confirm new password</span>
            <input
              type="password"
              bind:value={newPasswordConfirm}
              autocomplete="new-password"
              required
            />
          </label>
          {#if passwordError}
            <p class="error">{passwordError}</p>
          {/if}
          <button class="submit" type="submit" disabled={passwordBusy}>
            {passwordBusy ? '…' : 'Update password'}
          </button>
        </form>
      {/if}
      {#if passwordUpdated}
        <p class="saved-hint">Password updated</p>
      {/if}
    </div>

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
  .submit.small {
    width: auto;
    padding: 6px 10px;
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
  .links {
    display: flex;
    justify-content: center;
    gap: 14px;
  }
  .links .switch-mode {
    width: auto;
    margin-top: 8px;
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
  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 0;
    border-top: 1px solid var(--border);
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .row input {
    flex: 1;
  }
  .section-toggle {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: transparent;
    color: var(--text);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-align: left;
  }
  .section-toggle:hover {
    border-color: var(--amber-dim);
  }
  .saved-hint {
    font-size: 9px;
    color: var(--amber);
    margin: 0;
  }
</style>
