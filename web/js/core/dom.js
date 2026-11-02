export const $ = (id) => document.getElementById(id);

let toastTimer = null;

export function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

export function setMessage(element, message, kind = '') {
  element.textContent = message;
  element.classList.remove('error', 'success');
  if (kind) element.classList.add(kind);
}

export function setConnectionState(label, kind) {
  const badge = $('connection-state');
  badge.textContent = label;
  badge.className = `state-badge state-${kind}`;
}

export function formatBytes(bytes) {
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
