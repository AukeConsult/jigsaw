/** The standard shapes of a picture area to choose from (the picture area is then made a whole number of pieces wide and high, which can differ a little). Used by every form that makes a ready jigsaw. */
export const SIZE_PRESETS = [
  { key: 'standard', label: 'Standard 4:3 (800 × 600)', width: 800, height: 600 },
  { key: 'photo', label: 'Photo 3:2 (900 × 600)', width: 900, height: 600 },
  { key: 'wide', label: 'Wide 16:9 (960 × 540)', width: 960, height: 540 },
  { key: 'square', label: 'Square 1:1 (700 × 700)', width: 700, height: 700 },
  { key: 'portrait', label: 'Portrait 3:4 (600 × 800)', width: 600, height: 800 },
  { key: 'panorama', label: 'Panorama 3:1 (1200 × 400)', width: 1200, height: 400 },
  { key: 'large', label: 'Large 4:3 (1200 × 900)', width: 1200, height: 900 },
] as const;

/** The standard size nearest to a picture area (a saved one is a whole number of pieces, so it can differ a little from the size that was asked for). */
export function nearestSize(width: number, height: number): string {
  const apart = (p: { width: number; height: number }) => Math.abs(p.width - width) + Math.abs(p.height - height);
  return SIZE_PRESETS.reduce((best: (typeof SIZE_PRESETS)[number], p) => (apart(p) < apart(best) ? p : best), SIZE_PRESETS[0]).key;
}
