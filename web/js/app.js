import { APP_VERSION } from './core/config.js';
import { state } from './core/state.js';
import { $, setConnectionState, setMessage, showToast } from './core/dom.js';
import { openDatabase, loadSources, saveSource, deleteSource } from './data/database.js';
import { clearPreview, renderReview } from './features/review.js';
import { pickFolder, renderSources } from './features/folders.js';
import { getConnectionSettings, readConnectionSettings, testConnection } from './features/connection.js';
import { handleSend, retryFailedFiles, setBusy } from './features/transfer.js';

async function refreshSources() {
  await renderSources(state.sources, {
    onToggle: async (source, enabled) => {
      source.enabled = enabled;
      await saveSource(state.db, source);
      clearPreview(state);
    },
    onRefresh: refreshSources,
    onRemove: removeSource
  });
}

async function removeSource(id) {
  await deleteSource(state.db, id);
  state.sources = state.sources.filter((source) => source.id !== id);
  clearPreview(state);
  await refreshSources();
}

async function addFolder() {
  const source = await pickFolder(state.sources);
  if (!source) return;

  await saveSource(state.db, source);
  state.sources.push(source);
  state.sources.sort((a, b) => a.label.localeCompare(b.label));
  clearPreview(state);
  await refreshSources();
  showToast(`Added ${source.label}`);
}

function installEvents() {
  $('add-folder').addEventListener('click', addFolder);
  $('test-connection').addEventListener('click', async () => {
    $('test-connection').disabled = true;
    try {
      await testConnection(true);
    } catch {
      // The actionable error is displayed beside the connection fields.
    } finally {
      $('test-connection').disabled = state.sending;
    }
  });
  $('send-all').addEventListener('click', handleSend);
  $('retry-failed').addEventListener('click', retryFailedFiles);
  $('review-before-send').addEventListener('change', () => clearPreview(state));
  $('include-subfolders').addEventListener('change', () => clearPreview(state));

  $('select-all').addEventListener('click', () => {
    for (const item of state.pendingFiles || []) item.selected = true;
    renderReview(state);
  });
  $('select-none').addEventListener('click', () => {
    for (const item of state.pendingFiles || []) item.selected = false;
    renderReview(state);
  });

  $('toggle-token').addEventListener('click', () => {
    const input = $('receiver-token');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    $('toggle-token').setAttribute('aria-label', showing ? 'Show pairing key' : 'Hide pairing key');
  });

  for (const id of ['server-url', 'receiver-token']) {
    $(id).addEventListener('change', () => {
      try {
        getConnectionSettings();
      } catch {
        // Incomplete settings are fine until the user tests or sends.
      }
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
    setMessage($('connection-message'), 'Open PocketPush from its HTTPS installation address. The Windows receiver also uses HTTPS with your locally installed PocketPush certificate.', 'error');
  }
  if (!('showDirectoryPicker' in window)) {
    $('add-folder').disabled = true;
    setMessage($('connection-message'), 'This browser does not support persistent folder selection. Use current Chrome on Android.', 'error');
  }

  try {
    state.db = await openDatabase();
    state.sources = await loadSources(state.db);
    await refreshSources();
  } catch (error) {
    setMessage($('connection-message'), `Could not initialize local folder storage: ${error.message}`, 'error');
  }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker registration failed:', error));
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

document.addEventListener('DOMContentLoaded', initialize);
