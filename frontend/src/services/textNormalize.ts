/** Lowercase + no accents, to compare search text tolerantly
 * ("marché" / "marche" / "Marché" should all match). */
export function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
