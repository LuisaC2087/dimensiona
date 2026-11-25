/** Markdown mínimo (títulos, párrafos, listas, **negrita**) a bloques para React Native. Lógica pura. */
export interface MdInline { text: string; bold: boolean }
export type MdBlock =
  | { type: 'h'; level: number; parts: MdInline[] }
  | { type: 'p'; parts: MdInline[] }
  | { type: 'li'; ordered: boolean; n: number; parts: MdInline[] };

export function parseInline(s: string): MdInline[] {
  const out: MdInline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false });
  return out;
}

export function parseMarkdown(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(t))) blocks.push({ type: 'h', level: m[1].length, parts: parseInline(m[2]) });
    else if ((m = /^-\s+(.*)$/.exec(t))) blocks.push({ type: 'li', ordered: false, n: 0, parts: parseInline(m[1]) });
    else if ((m = /^(\d+)\.\s+(.*)$/.exec(t))) blocks.push({ type: 'li', ordered: true, n: Number(m[1]), parts: parseInline(m[2]) });
    else blocks.push({ type: 'p', parts: parseInline(t) });
  }
  return blocks;
}
