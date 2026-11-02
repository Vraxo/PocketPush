import { $ , showToast } from '../core/dom.js';

export async function pickFolder(existingSources) {
  if (typeof window.showDirectoryPicker !== 'function') {
    showToast('Folder picking is not supported here. Open the installed app in current Chrome on Android.');
    return null;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    for (const existing of existingSources) {
      if (await existing.handle.isSameEntry(handle)) {
        showToast(`“${handle.name}” is already configured.`);
        return null;
      }
    }
    return { id: crypto.randomUUID(), label: handle.name, handle, enabled: true };
  } catch (error) {
    if (error?.name !== 'AbortError') showToast(error.message || 'Could not add that folder.');
    return null;
  }
}

export async function renderSources(sources, actions) {
  const list = $('source-list');
  list.replaceChildren();
  $('source-count').textContent = `${sources.length} ${sources.length === 1 ? 'folder' : 'folders'}`;

  if (sources.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-icon">▱</div><strong>No folders configured</strong><span>Add Camera, Screenshots, Downloads, or any other folder.</span>';
    list.append(empty);
    return;
  }

  for (const source of sources) {
    const row = document.createElement('div');
    row.className = 'source-row';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'source-check';
    enabled.checked = source.enabled !== false;
    enabled.setAttribute('aria-label', `Include ${source.label}`);
    enabled.addEventListener('change', async () => actions.onToggle(source, enabled.checked));

    const icon = document.createElement('span');
    icon.className = 'source-icon';
    icon.textContent = '▱';
    icon.setAttribute('aria-hidden', 'true');

    const info = document.createElement('div');
    info.className = 'source-info';
    const name = document.createElement('span');
    name.className = 'source-name';
    name.textContent = source.label;
    const status = document.createElement('span');
    status.className = 'source-status';

    try {
      const permission = await source.handle.queryPermission({ mode: 'read' });
      status.textContent = permission === 'granted' ? 'Access ready' : 'Permission may need renewal';
      if (permission !== 'granted') status.classList.add('needs-permission');
    } catch {
      status.textContent = 'Access unavailable · reselect folder';
      status.classList.add('needs-permission');
    }
    info.append(name, status);

    const rowActions = document.createElement('div');
    rowActions.className = 'source-actions';

    const reconnect = document.createElement('button');
    reconnect.type = 'button';
    reconnect.className = 'small-button';
    reconnect.textContent = 'Access';
    reconnect.title = 'Renew folder access';
    reconnect.addEventListener('click', async () => {
      try {
        const result = await source.handle.requestPermission({ mode: 'read' });
        if (result === 'granted') {
          showToast(`Access restored: ${source.label}`);
          await actions.onRefresh();
        } else {
          showToast('Folder permission was not granted.');
        }
      } catch (error) {
        showToast(error.message || 'Could not renew folder access.');
      }
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = '×';
    remove.title = `Remove ${source.label}`;
    remove.setAttribute('aria-label', `Remove ${source.label}`);
    remove.addEventListener('click', () => actions.onRemove(source.id));

    rowActions.append(reconnect, remove);
    row.append(enabled, icon, info, rowActions);
    list.append(row);
  }
}

async function collectFiles(source, includeSubfolders, parentPath = '') {
  const files = [];
  for await (const entry of source.handle.values()) {
    const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      files.push({ file, sourceLabel: source.label, relativePath, selected: true });
    } else if (entry.kind === 'directory' && includeSubfolders) {
      const nested = await collectFiles({ handle: entry, label: source.label }, true, relativePath);
      files.push(...nested);
    }
  }
  return files;
}

export async function scanEnabledSources(sources, includeSubfolders) {
  const enabledSources = sources.filter((source) => source.enabled !== false);
  if (enabledSources.length === 0) throw new Error('Add or enable at least one source folder first.');

  // A saved handle may need permission renewal after Chrome restarts.
  const permissions = await Promise.all(enabledSources.map((source) => source.handle.queryPermission({ mode: 'read' })));
  const denied = enabledSources.filter((source, index) => permissions[index] !== 'granted');
  if (denied.length) {
    throw new Error(`Folder access is needed for: ${denied.map((source) => source.label).join(', ')}. Tap Access beside each folder, then try again.`);
  }

  const allFiles = [];
  for (const source of enabledSources) {
    allFiles.push(...await collectFiles(source, includeSubfolders));
  }
  allFiles.sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel) || a.relativePath.localeCompare(b.relativePath));
  return allFiles;
}
