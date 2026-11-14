// obsidian:// links into the user's vault. `file` may be a vault-relative path or a bare note name.
export const obsidian = (vault: string, file: string) =>
  `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file.replace(/\.md$/, ''))}`;

// Only http(s) links from vault or calendar text become anchors.
export function safeHref(u: string | undefined): string | null {
  if (!u) return null;
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; }
}
