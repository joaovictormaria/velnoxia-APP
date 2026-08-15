function hashSeed(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100000;
}

/** Real stock photo by keyword, locked to a stable image per keyword (no API key required). */
export function stockImageUrl(keyword: string, width: number, height: number) {
  const tags = encodeURIComponent(keyword.trim().replace(/\s+/g, ","));
  const lock = hashSeed(keyword);
  return `https://loremflickr.com/${width}/${height}/${tags}?lock=${lock}`;
}
