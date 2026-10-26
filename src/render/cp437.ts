// The 256 glyphs of Code Page 437, as Unicode characters (Section 4).
// Index = CP437 code. Code 0 and code 255 show as a space.
export const CP437 =
  ' ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼' +
  ' !"#$%&\'()*+,-./0123456789:;<=>?' +
  '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_' +
  '`abcdefghijklmnopqrstuvwxyz{|}~⌂' +
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒ' +
  'áíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐' +
  '└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
  'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

const CP437_SET = new Set(Array.from(CP437));

export function isCp437(text: string): boolean {
  for (const ch of text) if (!CP437_SET.has(ch)) return false;
  return true;
}

/** Characters in `text` that are not in Code Page 437. */
export function nonCp437(text: string): string[] {
  return [...new Set(Array.from(text).filter((ch) => !CP437_SET.has(ch)))];
}
