/** JSON contract shared by the server pipeline and the reader. */
export type Panel = {
  id: string;
  position: number;
  object_path: string;
  alt_text: string;
  width: number;
  height: number;
};
export type SignedPanel = Omit<Panel, 'object_path'> & { url: string };
export type PanelManifest = { panels: SignedPanel[]; expiresIn: 120; refreshAfter: string };

export function isPanelManifest(value: unknown): value is PanelManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<PanelManifest>;
  return (
    m.expiresIn === 120 &&
    typeof m.refreshAfter === 'string' &&
    Number.isFinite(Date.parse(m.refreshAfter)) &&
    Array.isArray(m.panels) &&
    m.panels.length > 0 &&
    m.panels.length <= 50 &&
    m.panels.every(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.url === 'string' &&
        /^https?:\/\//.test(p.url) &&
        typeof p.alt_text === 'string' &&
        Number.isInteger(p.position) &&
        p.position > 0 &&
        Number.isInteger(p.width) &&
        p.width > 0 &&
        Number.isInteger(p.height) &&
        p.height > 0,
    )
  );
}
