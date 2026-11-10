import { $, formatBytes } from '../core/dom.js';

export function selectedFileCount(state) {
  return state.pendingFiles ? state.pendingFiles.filter((item) => item.selected).length : 0;
}

export function clearPreview(state) {
  state.pendingFiles = null;
  $('review-panel').classList.add('hidden');
  $('send-label').textContent = 'SEND ALL';
  $('send-all').disabled = state.sending;
}

export function renderReview(state) {
  const list = $('file-list');
  list.replaceChildren();

  for (const item of state.pendingFiles || []) {
    const row = document.createElement('label');
    row.className = 'file-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.selected;
    checkbox.addEventListener('change', () => {
      item.selected = checkbox.checked;
      updateReviewCount(state);
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
  updateReviewCount(state);
}

export function updateReviewCount(state) {
  const selected = selectedFileCount(state);
  const total = (state.pendingFiles || []).length;
  $('review-count').textContent = `${selected} / ${total}`;
  $('send-label').textContent = `SEND SELECTED (${selected})`;
  $('send-all').disabled = state.sending || selected === 0;
}
