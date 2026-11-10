const APPEARANCE_KEY = 'pocketpush.appearance.v1';
const DEFAULT_APPEARANCE = Object.freeze({ palette: 'monokai', style: 'pocketpush' });
const VALID_PALETTES = new Set(['monokai', 'material', 'system']);
const VALID_STYLES = new Set(['pocketpush', 'material3']);

const DYNAMIC_PROPERTIES = [
  '--color-background', '--color-surface', '--color-surface-container',
  '--color-surface-container-high', '--color-surface-input', '--color-surface-subtle',
  '--color-outline', '--color-outline-variant', '--color-on-surface',
  '--color-on-surface-variant', '--color-on-surface-subtle', '--color-primary',
  '--color-on-primary', '--color-primary-container', '--color-on-primary-container',
  '--color-secondary', '--color-tertiary', '--color-error', '--color-warning',
  '--color-success', '--color-primary-outline', '--color-secondary-outline',
  '--color-on-primary-outline', '--color-on-primary-soft', '--color-divider',
  '--state-hover', '--state-focus', '--state-pressed',
  '--mp-bg', '--mp-bg-deep', '--mp-surface', '--mp-surface-raised',
  '--mp-surface-hover', '--mp-border', '--mp-muted', '--mp-dim', '--mp-white',
  '--mp-red', '--mp-orange', '--mp-yellow', '--mp-green', '--mp-cyan', '--mp-purple'
];

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseCssRgb(value) {
  const match = /^rgba?\((.+)\)$/i.exec(value.trim());
  if (!match) return null;

  const source = match[1].replace(/\s*\/\s*/g, ' ').trim();
  const channels = source.includes(',')
    ? source.split(',').slice(0, 3)
    : source.split(/\s+/).slice(0, 3);

  if (channels.length !== 3) return null;

  const rgb = channels.map((channel) => {
    const isPercent = channel.endsWith('%');
    const parsed = Number.parseFloat(channel);
    if (!Number.isFinite(parsed)) return null;
    return clamp(isPercent ? parsed * 2.55 : parsed, 0, 255);
  });

  return rgb.some((channel) => channel === null) ? null : rgb;
}

function rgbToHsl([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    switch (max) {
      case r: hue = ((g - b) / delta) % 6; break;
      case g: hue = (b - r) / delta + 2; break;
      default: hue = (r - g) / delta + 4; break;
    }
    hue *= 60;
  }

  return {
    h: (hue + 360) % 360,
    s: saturation * 100,
    l: lightness * 100
  };
}

function hslToHex(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - chroma / 2;
  let rgb;

  if (h < 60) rgb = [chroma, x, 0];
  else if (h < 120) rgb = [x, chroma, 0];
  else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma];
  else if (h < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  return `#${rgb.map((channel) =>
    Math.round((channel + m) * 255).toString(16).padStart(2, '0')
  ).join('')}`;
}

function readSystemAccent() {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  const userAgent = navigator.userAgent || '';
  const isWindows = /windows|win32|win64/i.test(platform);
  const isFirefox = /Firefox\/\d+/i.test(userAgent);
  const isInstalled = window.matchMedia?.('(display-mode: standalone)').matches === true;
  const supportsDynamicContext = isInstalled || isFirefox;

  if (!isWindows || !supportsDynamicContext || !window.CSS?.supports ||
      !CSS.supports('color', 'AccentColor') ||
      !CSS.supports('color', 'AccentColorText')) {
    return null;
  }

  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;contain:strict;';
  probe.style.color = 'AccentColor';
  document.body.append(probe);
  const accent = getComputedStyle(probe).color;
  probe.style.color = 'AccentColorText';
  const accentText = getComputedStyle(probe).color;
  probe.remove();

  const rgb = parseCssRgb(accent);
  const textRgb = parseCssRgb(accentText);
  if (!rgb || !textRgb) return null;

  return { color: accent, textColor: accentText, rgb, source: isFirefox ? 'firefox' : 'chromium-pwa' };
}

function makeDynamicPalette(systemAccent, isLight) {
  const seed = rgbToHsl(systemAccent.rgb);
  const hue = seed.h;
  const saturation = clamp(seed.s, 42, 76);
  const secondaryHue = (hue + 26) % 360;
  const tertiaryHue = (hue + 76) % 360;
  const neutralSaturation = clamp(seed.s * 0.12, 5, 10);
  const tone = (targetHue, targetSaturation, targetLightness) =>
    hslToHex(targetHue, targetSaturation, targetLightness);

  const colors = {
    '--color-background': tone(hue, neutralSaturation, isLight ? 98 : 7),
    '--color-surface': tone(hue, neutralSaturation, isLight ? 100 : 11),
    '--color-surface-container': tone(hue, neutralSaturation, isLight ? 95 : 16),
    '--color-surface-container-high': tone(hue, neutralSaturation, isLight ? 92 : 20),
    '--color-surface-input': tone(hue, neutralSaturation, isLight ? 100 : 9),
    '--color-surface-subtle': tone(hue, neutralSaturation, isLight ? 96 : 9),
    '--color-outline': tone(hue, neutralSaturation + 2, isLight ? 48 : 64),
    '--color-outline-variant': tone(hue, neutralSaturation + 1, isLight ? 79 : 30),
    '--color-on-surface': tone(hue, neutralSaturation, isLight ? 12 : 92),
    '--color-on-surface-variant': tone(hue, neutralSaturation + 1, isLight ? 30 : 78),
    '--color-on-surface-subtle': tone(hue, neutralSaturation + 1, isLight ? 42 : 64),

    /* Keep the exact OS accent and its OS-selected contrast colour together. */
    '--color-primary': systemAccent.color,
    '--color-on-primary': systemAccent.textColor,
    '--color-primary-container': tone(hue, saturation * 0.55, isLight ? 91 : 34),
    '--color-on-primary-container': tone(hue, clamp(saturation * 0.75, 38, 70), isLight ? 22 : 92),
    '--color-secondary': tone(secondaryHue, clamp(saturation * 0.65, 30, 54), isLight ? 38 : 82),
    '--color-tertiary': tone(tertiaryHue, clamp(saturation * 0.62, 30, 54), isLight ? 39 : 82),
    '--color-error': isLight ? '#B3261E' : '#F2B8B5',
    '--color-warning': isLight ? '#8B5000' : '#F6C987',
    '--color-success': isLight ? '#386A20' : '#A8D5A2',
    '--color-primary-outline': 'color-mix(in srgb, var(--color-primary) 38%, transparent)',
    '--color-secondary-outline': 'color-mix(in srgb, var(--color-secondary) 36%, transparent)',
    '--color-on-primary-outline': 'color-mix(in srgb, var(--color-on-primary) 25%, transparent)',
    '--color-on-primary-soft': 'color-mix(in srgb, var(--color-on-primary) 8%, transparent)',
    '--color-divider': isLight ? '#00000014' : '#FFFFFF14',
    '--state-hover': isLight ? '#0000000A' : '#FFFFFF0A',
    '--state-focus': 'color-mix(in srgb, var(--color-primary) 16%, transparent)',
    '--state-pressed': isLight ? '#00000012' : '#FFFFFF14'
  };

  Object.assign(colors, {
    '--mp-bg': colors['--color-background'],
    '--mp-bg-deep': colors['--color-surface-input'],
    '--mp-surface': colors['--color-surface'],
    '--mp-surface-raised': colors['--color-surface-container'],
    '--mp-surface-hover': colors['--color-surface-container-high'],
    '--mp-border': colors['--color-outline'],
    '--mp-muted': colors['--color-on-surface-variant'],
    '--mp-dim': colors['--color-on-surface-subtle'],
    '--mp-white': colors['--color-on-surface'],
    '--mp-red': colors['--color-error'],
    '--mp-orange': colors['--color-warning'],
    '--mp-yellow': colors['--color-warning'],
    '--mp-green': colors['--color-primary'],
    '--mp-cyan': colors['--color-secondary'],
    '--mp-purple': colors['--color-tertiary']
  });

  return colors;
}

function clearDynamicPalette(root) {
  for (const property of DYNAMIC_PROPERTIES) root.style.removeProperty(property);
}

function applyAppearance() {
  const root = document.documentElement;
  const isLight = lightSchemeQuery?.matches === true;
  const systemAccent = appearance.palette === 'system' ? readSystemAccent() : null;
  const dynamicAvailable = systemAccent !== null;
  const effectivePalette = appearance.palette === 'system'
    ? (dynamicAvailable ? 'system' : 'material')
    : appearance.palette;
  const usesMaterialScheme = effectivePalette === 'material' || effectivePalette === 'system';

  clearDynamicPalette(root);
  root.dataset.palette = effectivePalette;
  root.dataset.uiStyle = appearance.style;
  root.style.colorScheme = usesMaterialScheme && isLight ? 'light' : 'dark';

  if (dynamicAvailable) {
    const colors = makeDynamicPalette(systemAccent, isLight);
    for (const [property, value] of Object.entries(colors)) {
      root.style.setProperty(property, value);
    }
  }

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = getComputedStyle(root).getPropertyValue('--color-background').trim() || '#2D2A2E';
  }

  const hint = document.getElementById('palette-hint');
  if (hint) {
    if (appearance.palette === 'material') {
      hint.textContent = 'Material 3 uses a standard palette and follows your device’s light/dark setting.';
      hint.hidden = false;
    } else if (appearance.palette === 'system' && dynamicAvailable) {
      hint.textContent = systemAccent.source === 'firefox'
        ? 'Using the Windows accent colour through Firefox. Changes are picked up when PocketPush regains focus.'
        : 'Using the Windows accent colour. Changes are picked up when PocketPush regains focus.';
      hint.hidden = false;
    } else if (appearance.palette === 'system') {
      hint.textContent = 'System dynamic uses Windows accent colours in Firefox on Windows or installed Chrome and Edge apps. Using the standard Material 3 palette here.';
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  }
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

  lightSchemeQuery?.addEventListener?.('change', applyAppearance);
  window.addEventListener('focus', () => {
    if (appearance.palette === 'system') applyAppearance();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && appearance.palette === 'system') applyAppearance();
  });
}
