export function deriveNameFromLink(link: string): string {
  const hashIndex = link.indexOf('#');
  if (hashIndex >= 0 && hashIndex < link.length - 1) {
    try {
      return decodeURIComponent(link.slice(hashIndex + 1));
    } catch {
      return link.slice(hashIndex + 1);
    }
  }
  try {
    const url = new URL(link);
    return url.hostname;
  } catch {
    return link.slice(0, 32);
  }
}

export function createInClause(ids: string[]): { clause: string; bindings: string[] } {
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length)));
  if (unique.length === 0) {
    return { clause: '(NULL)', bindings: [] };
  }
  const placeholders = unique.map(() => '?').join(', ');
  return { clause: `(${placeholders})`, bindings: unique };
}
