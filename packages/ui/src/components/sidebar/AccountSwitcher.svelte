<script lang="ts">
  import { tick } from 'svelte';
  import { account } from '../../stores/account.svelte';

  // KAN-UX5 — compte minimal : le nom affiché est cliquable ; taper un nom
  // inconnu dans le champ (datalist des comptes existants) crée le compte.
  let editing = $state(false);
  let name = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  function startEdit() {
    account.refresh();
    editing = true;
    name = account.current;
    tick().then(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function cancel() {
    editing = false;
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return; // keep editing — an account needs a name
    account.switchTo(trimmed); // false = same account → nothing to do
    editing = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }
</script>

<div class="account">
  <span class="acct-label">personal space</span>
  {#if editing}
    <input
      bind:this={inputEl}
      bind:value={name}
      onkeydown={onKey}
      onblur={cancel}
      list="kanopi-accounts"
      type="text"
      placeholder="account name…"
      spellcheck="false"
      autocomplete="off"
    />
    <datalist id="kanopi-accounts">
      {#each account.known as n (n)}
        <option value={n}></option>
      {/each}
    </datalist>
  {:else}
    <button
      type="button"
      class="acct-name"
      title="Switch account — type a new name to create it"
      onclick={startEdit}
    >
      {account.current}
    </button>
  {/if}
</div>

<style>
  .account {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 6px 8px;
    border-bottom: 1px solid var(--border-dim);
    margin-bottom: 6px;
  }
  .acct-label {
    flex-shrink: 0;
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .acct-name {
    flex: 1;
    min-width: 0;
    padding: 2px 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--amber);
    font-family: var(--font-mono);
    font-size: 11px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .acct-name:hover {
    border-color: var(--border-dim);
  }
  .account input {
    flex: 1;
    min-width: 0;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--amber);
    border-radius: 2px;
    padding: 2px 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    outline: none;
  }
</style>
