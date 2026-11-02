'use strict';

const APP_VERSION = '1.1.2';
const DB_NAME = 'phonepush-local';
const DB_VERSION = 1;
const STORE_NAME = 'sources';
const SETTINGS_KEY = 'phonepush.connection.v1';

const state = {
  db: null,
  sources: [],
  pendingFiles: null,
  retryFiles: [],
  retrySettings: null,
  sending: false,
  toastTimer: null
};

const $ = (id) => document.getElementById(id);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local folder storage.'));
  });
}

function dbRequest(mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error('Local folder storage failed.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Local folder storage failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Local folder storage transaction was aborted.'));
  });
}

async function loadSources() {
  state.sources = (await dbRequest('readonly', (store) => store.getAll())) || [];
  state.sources.sort((a, b) => a.label.localeCompare(b.label));
  await renderSources();
}

async function saveSource(source) {
  await dbRequest('readwrite', (store) => store.put(source));
}

async function removeSource(id) {
  await dbRequest('readwrite', (store) => store.delete(id));
  state.sources = state.sources.filter((source) => source.id !== id);
  clearPreview();
  await renderSources();
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function setMessage(element, message, kind = '') {
  element.textContent = message;
  element.classList.remove('error', 'success');
  if (kind) element.classList.add(kind);
}

function setConnectionState(label, kind) {
  const badge = $('connection-state');
  badge.textContent = label;
  badge.className = `state-badge state-${kind}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function setBusy(busy) {
  state.sending = busy;
  $('send-all').disabled = busy;
  $('add-folder').disabled = busy;
  $('test-connection').disabled = busy;
  $('retry-failed').disabled = busy;
  $('send-label').textContent = busy ? 'SENDING…' : (state.pendingFiles ? `SEND SELECTED (${selectedFileCount()})` : 'SEND ALL');
}

function clearPreview() {
  state.pendingFiles = null;
  $('review-panel').classList.add('hidden');
  $('send-label').textContent = 'SEND ALL';
  $('send-hint').textContent = 'Current folder contents';
}

async function renderSources() {
  const list = $('source-list');
  list.replaceChildren();
  $('source-count').textContent = `${state.sources.length} ${state.sources.length === 1 ? 'folder' : 'folders'}`;

  if (state.sources.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-icon">▱</div><strong>No folders configured</strong><span>Add Camera, Screenshots, Downloads, or any other folder.</span>';
    list.append(empty);
    return;
  }

  for (const source of state.sources) {
    const row = document.createElement('div');
    row.className = 'source-row';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'source-check';
    enabled.checked = source.enabled !== false;
    enabled.setAttribute('aria-label', `Include ${source.label}`);
    enabled.addEventListener('change', async () => {
      source.enabled = enabled.checked;
      await saveSource(source);
      clearPreview();
    });

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

    const actions = document.createElement('div');
    actions.className = 'source-actions';
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
          await renderSources();
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
    remove.addEventListener('click', () => removeSource(source.id));
    actions.append(reconnect, remove);

    row.append(enabled, icon, info, actions);
    list.append(row);
  }
}

async function addFolder() {
  if (typeof window.showDirectoryPicker !== 'function') {
    showToast('Folder picking is not supported here. Open the installed app in current Chrome on Android.');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    for (const existing of state.sources) {
      if (await existing.handle.isSameEntry(handle)) {
        showToast(`“${handle.name}” is already configured.`);
        return;
      }
    }
    const source = { id: crypto.randomUUID(), label: handle.name, handle, enabled: true };
    await saveSource(source);
    state.sources.push(source);
    state.sources.sort((a, b) => a.label.localeCompare(b.label));
    clearPreview();
    await renderSources();
    showToast(`Added ${handle.name}`);
  } catch (error) {
    if (error?.name !== 'AbortError') showToast(error.message || 'Could not add that folder.');
  }
}

function formatAddressForInput(serverUrl) {
  try {
    const parsed = new URL(serverUrl);
    return parsed.port && parsed.port !== '8765' ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return serverUrl || '';
  }
}

function normalizeServerAddress(value) {
  const rawAddress = value.trim().replace(/\/+$/, '');
  if (!rawAddress) throw new Error('Enter the PC IP address shown in the Windows receiver.');

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(rawAddress) ? rawAddress : `http://${rawAddress}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Enter a valid PC address, such as 192.168.1.104.');
  }

  if (parsed.protocol !== 'http:' || !parsed.hostname || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Enter the PC IP address only, or paste its full http:// address from Windows.');
  }

  if (!parsed.port) parsed.port = '8765';
  return parsed.origin;
}

function readConnectionSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    $('server-url').value = formatAddressForInput(settings.serverUrl);
    $('receiver-token').value = settings.token || '';
    if (settings.serverUrl && settings.token) {
      setConnectionState('Saved', 'unknown');
      setMessage($('connection-message'), 'Connection details are saved on this device. Open this panel to change them.');
      $('connection-panel').open = false;
    }
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
  }
}

function getConnectionSettings() {
  const serverUrl = normalizeServerAddress($('server-url').value);
  const token = $('receiver-token').value.trim();
  if (!token) throw new Error('Enter the pairing key shown in the Windows receiver.');

  const settings = { serverUrl, token };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  $('server-url').value = formatAddressForInput(serverUrl);
  return settings;
}

function localFetch(url, options) {
  // Chrome's Local Network Access requires a secure top-level origin and an explicit target address space.
  return fetch(url, { ...options, mode: 'cors', targetAddressSpace: 'local' });
}

async function testConnection(showToastOnSuccess = true) {
  const message = $('connection-message');
  setConnectionState('Testing…', 'unknown');
  setMessage(message, 'Contacting your PC over the local network…');
  try {
    const settings = getConnectionSettings();
    const response = await localFetch(`${settings.serverUrl}/health`, {
      method: 'GET',
      headers: { 'X-PhonePush-Token': settings.token },
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) throw new Error(data.error || `Receiver returned HTTP ${response.status}.`);
    setConnectionState('Connected', 'online');
    setMessage(message, `Connected to ${data.computer || 'your PC'}. Saving to ${data.destination || 'the configured folder'}.`, 'success');
    $('connection-panel').open = false;
    if (showToastOnSuccess) showToast('PC receiver is reachable.');
    return settings;
  } catch (error) {
    setConnectionState('Not connected', 'offline');
    setMessage(message, describeNetworkError(error), 'error');
    throw error;
  }
}

function describeNetworkError(error) {
  const detail = error?.message || String(error);
  if (detail.includes('Failed to fetch') || detail.includes('NetworkError') || detail.includes('Load failed')) {
    return 'Could not reach the receiver. Check that the Windows receiver is running, both devices are on the same Wi-Fi, the PC address is current, and Chrome has allowed local-network access for this app.';
  }
  return detail;
}

async function collectFiles(source, includeSubfolders, parentPath = '') {
  const files = [];
  for await (const entry of source.handle.values()) {
    const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      files.push({ file, sourceLabel: source.label, relativePath, selected: true });
    } else if (entry.kind === 'directory' && includeSubfolders) {
      const nestedSource = { handle: entry, label: source.label };
      const nested = await collectFiles(nestedSource, true, relativePath);
      files.push(...nested);
    }
  }
  return files;
}

async function scanEnabledSources() {
  const sources = state.sources.filter((source) => source.enabled !== false);
  if (sources.length === 0) throw new Error('Add or enable at least one source folder first.');

  // Folder picker grants read access initially. After a browser restart, permission may
  // need renewal; the per-folder Access button requests it directly from its own user gesture.
  const permissions = await Promise.all(sources.map((source) => source.handle.queryPermission({ mode: 'read' })));
  const denied = sources.filter((source, index) => permissions[index] !== 'granted');
  if (denied.length) throw new Error(`Folder access is needed for: ${denied.map((source) => source.label).join(', ')}. Tap Access beside each folder, then try again.`);

  const allFiles = [];
  const includeSubfolders = $('include-subfolders').checked;
  for (const source of sources) {
    const files = await collectFiles(source, includeSubfolders);
    allFiles.push(...files);
  }
  allFiles.sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel) || a.relativePath.localeCompare(b.relativePath));
  return allFiles;
}

function selectedFileCount() {
  return state.pendingFiles ? state.pendingFiles.filter((item) => item.selected).length : 0;
}

function renderReview() {
  const list = $('file-list');
  list.replaceChildren();
  const files = state.pendingFiles || [];
  for (const item of files) {
    const row = document.createElement('label');
    row.className = 'file-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.selected;
    checkbox.addEventListener('change', () => {
      item.selected = checkbox.checked;
      updateReviewCount();
    });
    const info = document.createElement('span');
    info.className = 'file-info';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = item.file.name;
    const path = document.createElement('span');
    path.className = 'file-path';
    path.textContent = `${item.sourceLabel} / ${item.relativePath}`;
    info.append(name, path);
    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = formatBytes(item.file.size);
    row.append(checkbox, info, size);
    list.append(row);
  }
  $('review-panel').classList.remove('hidden');
  updateReviewCount();
}

function updateReviewCount() {
  $('review-count').textContent = `${selectedFileCount()} / ${(state.pendingFiles || []).length} selected`;
  $('send-label').textContent = `SEND SELECTED (${selectedFileCount()})`;
  $('send-hint').textContent = 'Only checked files will be copied in this run. Nothing is remembered after the run.';
  $('send-all').disabled = state.sending || selectedFileCount() === 0;
}

async function uploadFiles(files, settings) {
  const transferPanel = $('transfer-panel');
  transferPanel.classList.remove('hidden');
  $('transfer-results').replaceChildren();
  state.retryFiles = [];
  state.retrySettings = null;
  $('retry-failed').classList.add('hidden');
  $('transfer-heading').textContent = 'Sending files';
  $('progress-fill').style.width = '0%';
  $('transfer-counter').textContent = `0 / ${files.length}`;
  let succeeded = 0;
  let failed = 0;
  let transferredBytes = 0;
  const failedFiles = [];

  for (let index = 0; index < files.length; index += 1) {
    const item = files[index];
    $('transfer-current').textContent = `Sending ${index + 1} of ${files.length}: ${item.file.name} (${formatBytes(item.file.size)})`;
    $('transfer-counter').textContent = `${index} / ${files.length}`;
    try {
      const query = new URLSearchParams({ name: item.file.name, source: item.sourceLabel });
      const response = await localFetch(`${settings.serverUrl}/upload?${query.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-PhonePush-Token': settings.token
        },
        body: item.file,
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) throw new Error(data.error || `Receiver returned HTTP ${response.status}.`);
      succeeded += 1;
      transferredBytes += Number(data.bytes) || item.file.size;
      addResult(true, `${item.file.name} → ${data.fileName || item.file.name}`);
    } catch (error) {
      failed += 1;
      failedFiles.push(item);
      addResult(false, `${item.file.name}: ${describeNetworkError(error)}`);
    }
    const done = index + 1;
    $('transfer-counter').textContent = `${done} / ${files.length}`;
    $('progress-fill').style.width = `${Math.round((done / files.length) * 100)}%`;
  }

  $('transfer-heading').textContent = failed === 0 ? 'Transfer complete' : 'Transfer finished with errors';
  $('transfer-current').textContent = `${succeeded} sent · ${failed} failed · ${formatBytes(transferredBytes)} transferred. Phone originals were left untouched.`;
  state.retryFiles = failedFiles;
  state.retrySettings = settings;
  $('retry-failed').classList.toggle('hidden', failedFiles.length === 0);
  setMessage($('connection-message'), failed === 0 ? `Last run: ${succeeded} files sent successfully.` : `Last run: ${succeeded} sent, ${failed} failed. You can retry only the failed files now.`, failed === 0 ? 'success' : 'error');
  showToast(failed === 0 ? `Sent ${succeeded} ${succeeded === 1 ? 'file' : 'files'}.` : `${succeeded} sent, ${failed} failed.`);
}

async function retryFailedFiles() {
  if (state.sending || state.retryFiles.length === 0 || !state.retrySettings) return;
  const files = state.retryFiles;
  const settings = state.retrySettings;
  setBusy(true);
  try {
    await uploadFiles(files, settings);
  } finally {
    setBusy(false);
  }
}

function addResult(success, message) {
  const row = document.createElement('div');
  row.className = `result-row ${success ? 'ok' : 'fail'}`;
  row.textContent = message;
  $('transfer-results').prepend(row);
}

async function handleSend() {
  if (state.sending) return;
  setBusy(true);
  try {
    const settings = getConnectionSettings();
    let files;
    if (state.pendingFiles && $('review-before-send').checked) {
      files = state.pendingFiles.filter((item) => item.selected);
    } else {
      setMessage($('connection-message'), 'Checking the PC and reading your selected folders…');
      const connection = await testConnection(false);
      files = await scanEnabledSources();
      if (files.length === 0) {
        showToast('No files found in the enabled folders.');
        setMessage($('connection-message'), 'No files found in the enabled folders.', 'success');
        return;
      }
      if ($('review-before-send').checked) {
        state.pendingFiles = files;
        renderReview();
        showToast(`Found ${files.length} files. Untick any exceptions.`);
        return;
      }
      await uploadFiles(files, connection);
      return;
    }

    if (!files || files.length === 0) {
      showToast('No files selected.');
      return;
    }
    await uploadFiles(files, settings);
    clearPreview();
  } catch (error) {
    setMessage($('connection-message'), describeNetworkError(error), 'error');
    showToast(error?.message || 'Transfer could not start.');
  } finally {
    setBusy(false);
    if (state.pendingFiles && $('review-before-send').checked) updateReviewCount();
  }
}

function installEvents() {
  $('add-folder').addEventListener('click', addFolder);
  $('test-connection').addEventListener('click', async () => {
    $('test-connection').disabled = true;
    try { await testConnection(true); } catch { /* Message is shown beside the connection fields. */ }
    $('test-connection').disabled = false;
  });
  $('send-all').addEventListener('click', handleSend);
  $('retry-failed').addEventListener('click', retryFailedFiles);
  $('review-before-send').addEventListener('change', clearPreview);
  $('include-subfolders').addEventListener('change', clearPreview);
  $('select-all').addEventListener('click', () => {
    for (const item of state.pendingFiles || []) item.selected = true;
    renderReview();
  });
  $('select-none').addEventListener('click', () => {
    for (const item of state.pendingFiles || []) item.selected = false;
    renderReview();
  });
  $('toggle-token').addEventListener('click', () => {
    const input = $('receiver-token');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    $('toggle-token').setAttribute('aria-label', showing ? 'Show pairing key' : 'Hide pairing key');
  });
  for (const id of ['server-url', 'receiver-token']) {
    $(id).addEventListener('change', () => {
      try { getConnectionSettings(); } catch { /* Incomplete settings are fine until the user tests or sends. */ }
      setConnectionState('Not tested', 'unknown');
      $('connection-panel').open = true;
    });
  }
}

async function initialize() {
  $('app-version').textContent = `v${APP_VERSION}`;
  readConnectionSettings();
  installEvents();

  if (!window.isSecureContext) {
    setMessage($('connection-message'), 'This app needs to be opened from its HTTPS installation address. A file:// copy cannot access phone folders or the local receiver.', 'error');
  }
  if (!('showDirectoryPicker' in window)) {
    $('add-folder').disabled = true;
    setMessage($('connection-message'), 'This browser does not support persistent folder selection. Use current Chrome on Android.', 'error');
  }

  try {
    state.db = await openDatabase();
    await loadSources();
  } catch (error) {
    setMessage($('connection-message'), `Could not initialize local folder storage: ${error.message}`, 'error');
  }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker registration failed:', error));
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

document.addEventListener('DOMContentLoaded', initialize);
