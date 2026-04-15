<script lang="ts">
  import { workspace } from '../../stores/workspace.svelte';
  import FileTree from './FileTree.svelte';
</script>

<div class="files-view">
  <FileTree nodes={workspace.tree} />
</div>

<style>
  .files-view { padding: 6px 4px; }
</style>
