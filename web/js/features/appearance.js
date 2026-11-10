const APPEARANCE_KEY = 'pocketpush.appearance.v1';
const DEFAULT_APPEARANCE = Object.freeze({ palette: 'monokai', style: 'pocketpush' });
const VALID_PALETTES = new Set(['monokai', 'material']);
const VALID_STYLES = new Set(['pocketpush', 'material3']);

let appearance = { ...DEFAULT_APPEARANCE };
let lightSchemeQuery = null;

function readAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY) || '{}');
    return {
      palette: VALID_PALETTES.has(saved.palette) ? saved.palette : DEFAULT_APPEARANCE.palette,
      style: VALID_STYLES.has(saved.style) ? saved.style : DEFAULT_APPEARANCE.style
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

function persistAppearance() {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
  } catch {
    // Appearance still applies for this session if storage is unavailable.
  }
}

function applyAppearance() {
  const root = document.documentElement;
  const isMaterial = appearance.palette === 'material';
  const isLight = isMaterial && lightSchemeQuery?.matches === true;
  const scheme = isLight ? 'light' : 'dark';

  root.dataset.palette = appearance.palette;
  root.dataset.uiStyle = appearance.style;
  root.style.colorScheme = scheme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = isLight ? '#F7F2FA' : (isMaterial ? '#141218' : '#2D2A2E');

  const hint = document.getElementById('palette-hint');
  if (hint) hint.hidden = !isMaterial;
}

export function initializeAppearance() {
  appearance = readAppearance();
  lightSchemeQuery = window.matchMedia?.('(prefers-color-scheme: light)') || null;

  const paletteSelect = document.getElementById('palette-select');
  const styleSelect = document.getElementById('ui-style-select');
  if (!paletteSelect || !styleSelect) return;

  paletteSelect.value = appearance.palette;
  styleSelect.value = appearance.style;
  applyAppearance();

  paletteSelect.addEventListener('change', () => {
    appearance.palette = VALID_PALETTES.has(paletteSelect.value)
      ? paletteSelect.value
      : DEFAULT_APPEARANCE.palette;
    persistAppearance();
    applyAppearance();
  });

  styleSelect.addEventListener('change', () => {
    appearance.style = VALID_STYLES.has(styleSelect.value)
      ? styleSelect.value
      : DEFAULT_APPEARANCE.style;
    persistAppearance();
    applyAppearance();
  });

  lightSchemeQuery?.addEventListener?.('change', () => {
    if (appearance.palette === 'material') applyAppearance();
  });
}
