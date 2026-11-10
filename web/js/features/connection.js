import { SETTINGS_KEY } from '../core/config.js';
import { $, setConnectionState, setMessage, showToast } from '../core/dom.js';

export function formatAddressForInput(serverUrl) {
  try {
    const parsed = new URL(serverUrl);
    return parsed.port && parsed.port !== '8765' ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return serverUrl || '';
  }
}

export function normalizeServerAddress(value) {
  const rawAddress = value.trim().replace(/\/+$/, '');
  if (!rawAddress) throw new Error('Enter the PC address.');

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(rawAddress) ? rawAddress : `https://${rawAddress}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Invalid PC address.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Enter a PC address or HTTPS URL.');
  }

  // PocketPush requires HTTPS for the local transfer channel.
  parsed.protocol = 'https:';
  if (!parsed.port) parsed.port = '8765';
  return parsed.origin;
}

export function readConnectionSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    $('server-url').value = formatAddressForInput(settings.serverUrl);
    $('receiver-token').value = settings.token || '';

    if (settings.serverUrl && settings.token) {
      setConnectionState('Saved', 'unknown');
      setMessage($('connection-message'), 'Saved.');
      $('connection-panel').open = false;
    }
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
  }
}

export function getConnectionSettings() {
  const serverUrl = normalizeServerAddress($('server-url').value);
  const token = $('receiver-token').value.trim();
  if (!token) throw new Error('Enter the pairing key.');

  const settings = { serverUrl, token };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  $('server-url').value = formatAddressForInput(serverUrl);
  return settings;
}

function localFetch(url, options) {
  // Chrome Local Network Access requires a secure top-level origin and explicit local address space.
  return fetch(url, { ...options, mode: 'cors', targetAddressSpace: 'local' });
}

export async function testConnection(showToastOnSuccess = true) {
  const message = $('connection-message');
  setConnectionState('Testing…', 'unknown');
  setMessage(message, 'Connecting…');

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
    setMessage(message, data.computer ? `Connected · ${data.computer}` : 'Connected.', 'success');
    $('connection-panel').open = false;
    if (showToastOnSuccess) showToast('Connected.');
    return settings;
  } catch (error) {
    setConnectionState('Not connected', 'offline');
    setMessage(message, describeNetworkError(error), 'error');
    throw error;
  }
}

export function describeNetworkError(error) {
  const detail = error?.message || String(error);
  if (detail.includes('Failed to fetch') || detail.includes('NetworkError') || detail.includes('Load failed')) {
    return 'Connection failed. Check Wi-Fi, Chrome local-network access, and the PocketPush CA certificate.';
  }
  return detail;
}
