import { state } from '../core/state.js';
import { $, formatBytes, setMessage, showToast } from '../core/dom.js';
import { describeNetworkError, getConnectionSettings, testConnection } from './connection.js';
import { scanEnabledSources } from './folders.js';
import { clearPreview, renderReview, selectedFileCount, updateReviewCount } from './review.js';

export function setBusy(busy) {
  state.sending = busy;
  $('send-all').disabled = busy || (state.pendingFiles !== null && selectedFileCount(state) === 0);
  $('add-folder').disabled = busy;
  $('test-connection').disabled = busy;
  $('retry-failed').disabled = busy;
  $('send-label').textContent = busy
    ? 'SENDING…'
    : (state.pendingFiles ? `SEND SELECTED (${selectedFileCount(state)})` : 'SEND ALL');
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.ceil(seconds % 60);
  if (minutes < 60) return `${minutes}m ${remaining}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function addResult(success, message) {
  const row = document.createElement('div');
  row.className = `result-row ${success ? 'ok' : 'fail'}`;
  row.textContent = message;
  $('transfer-results').prepend(row);
}

function updateTransferMetrics(uploadedBytes, totalBytes, startedAt) {
  const elapsed = Math.max((performance.now() - startedAt) / 1000, 0.25);
  const speed = uploadedBytes / elapsed;
  const remaining = totalBytes > uploadedBytes && speed > 0 ? (totalBytes - uploadedBytes) / speed : 0;

  $('transfer-bytes').textContent = `${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)}`;
  $('transfer-speed').textContent = speed > 0 ? `${formatBytes(speed)}/s` : '—';
  $('transfer-eta').textContent = uploadedBytes >= totalBytes
    ? 'Finishing…'
    : (speed > 0 ? `${formatDuration(remaining)} remaining` : 'Calculating…');

  const percent = totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0;
  $('progress-fill').style.width = `${percent}%`;
}

function uploadFileWithProgress(url, file, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.timeout = 30 * 60 * 1000;
    xhr.withCredentials = false;

    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.addEventListener('progress', (event) => {
      onProgress(event.loaded, event.lengthComputable ? event.total : file.size);
    });
    xhr.addEventListener('load', () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* The HTTP status below is more useful. */ }

      if (xhr.status >= 200 && xhr.status < 300 && data.ok === true) {
        resolve(data);
      } else {
        reject(new Error(data.error || `Receiver returned HTTP ${xhr.status || 'unknown'}.`));
      }
    });
    xhr.addEventListener('error', () => reject(new TypeError('Network request failed.')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload timed out.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled.')));
    xhr.send(file);
  });
}

export async function uploadFiles(files, settings) {
  const transferPanel = $('transfer-panel');
  transferPanel.classList.remove('hidden');
  $('transfer-results').replaceChildren();
  state.retryFiles = [];
  state.retrySettings = null;
  $('retry-failed').classList.add('hidden');
  $('transfer-heading').textContent = 'Sending';
  $('progress-fill').style.width = '0%';

  const totalBytes = files.reduce((total, item) => total + item.file.size, 0);
  const startedAt = performance.now();
  let acknowledgedBytes = 0;
  let succeeded = 0;
  let failed = 0;
  const failedFiles = [];

  $('transfer-counter').textContent = `0 / ${files.length}`;
  $('transfer-bytes').textContent = `${formatBytes(0)} / ${formatBytes(totalBytes)}`;
  $('transfer-speed').textContent = 'Calculating…';
  $('transfer-eta').textContent = 'Calculating…';

  for (let index = 0; index < files.length; index += 1) {
    const item = files[index];
    $('transfer-current').textContent = `Sending ${index + 1} of ${files.length}: ${item.file.name}`;
    $('transfer-counter').textContent = `${index} / ${files.length}`;

    try {
      const query = new URLSearchParams({ name: item.file.name, source: item.sourceLabel });
      const data = await uploadFileWithProgress(
        `${settings.serverUrl}/upload?${query.toString()}`,
        item.file,
        {
          'Content-Type': 'application/octet-stream',
          'X-PhonePush-Token': settings.token
        },
        (loaded) => updateTransferMetrics(acknowledgedBytes + loaded, totalBytes, startedAt)
      );

      succeeded += 1;
      acknowledgedBytes += Number(data.bytes) || item.file.size;
      updateTransferMetrics(acknowledgedBytes, totalBytes, startedAt);
      addResult(true, `${item.file.name} → ${data.fileName || item.file.name}`);
    } catch (error) {
      failed += 1;
      failedFiles.push(item);
      addResult(false, `${item.file.name}: ${describeNetworkError(error)}`);
      updateTransferMetrics(acknowledgedBytes, totalBytes, startedAt);
    }

    $('transfer-counter').textContent = `${index + 1} / ${files.length}`;
  }

  $('progress-fill').style.width = totalBytes > 0
    ? `${Math.round((acknowledgedBytes / totalBytes) * 100)}%`
    : '100%';
  $('transfer-heading').textContent = failed === 0 ? 'Transfer complete' : 'Transfer finished with errors';
  $('transfer-current').textContent = `${succeeded} sent · ${failed} failed · ${formatBytes(acknowledgedBytes)}`;
  $('transfer-eta').textContent = failed === 0 ? 'Complete' : `${failed} file${failed === 1 ? '' : 's'} need attention`;

  state.retryFiles = failedFiles;
  state.retrySettings = settings;
  $('retry-failed').classList.toggle('hidden', failedFiles.length === 0);
  setMessage(
    $('connection-message'),
    failed === 0
      ? `${succeeded} sent.`
      : `${succeeded} sent · ${failed} failed.`,
    failed === 0 ? 'success' : 'error'
  );
  showToast(failed === 0 ? `Sent ${succeeded} ${succeeded === 1 ? 'file' : 'files'}.` : `${succeeded} sent, ${failed} failed.`);
}

export async function retryFailedFiles() {
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

export async function handleSend() {
  if (state.sending) return;
  setBusy(true);

  try {
    const settings = getConnectionSettings();
    let files;

    if (state.pendingFiles && $('review-before-send').checked) {
      files = state.pendingFiles.filter((item) => item.selected);
    } else {
      setMessage($('connection-message'), 'Scanning folders…');
      const connection = await testConnection(false);
      files = await scanEnabledSources(state.sources, $('include-subfolders').checked);

      if (files.length === 0) {
        showToast('No files found.');
        setMessage($('connection-message'), 'No files found.', 'success');
        return;
      }

      if ($('review-before-send').checked) {
        state.pendingFiles = files;
        renderReview(state);
        showToast(`${files.length} files found.`);
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
    clearPreview(state);
  } catch (error) {
    setMessage($('connection-message'), describeNetworkError(error), 'error');
    showToast(error?.message || 'Transfer could not start.');
  } finally {
    setBusy(false);
    if (state.pendingFiles && $('review-before-send').checked) updateReviewCount(state);
  }
}
