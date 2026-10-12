export function normalizeKeyword(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function deduplicateKeywords(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tags) {
    const norm = normalizeKeyword(t);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

export function formatDate(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function daysUntil(isoString?: string): number | null {
  if (!isoString) return null;
  try {
    const target = new Date(isoString).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch {
    return null;
  }
}
