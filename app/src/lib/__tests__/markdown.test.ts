import { parseInline, parseMarkdown } from '../markdown';

describe('markdown legal', () => {
  it('negritas', () => {
    expect(parseInline('a **b** c')).toEqual([{ text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false }]);
    expect(parseInline('sin formato')).toEqual([{ text: 'sin formato', bold: false }]);
  });
  it('bloques', () => {
    const b = parseMarkdown('# Título\n\nPárrafo **x**.\n\n## 1. Sección\n- uno\n- dos\n1. primero\n2. segundo');
    expect(b.map((x) => x.type)).toEqual(['h', 'p', 'h', 'li', 'li', 'li', 'li']);
    expect(b[0]).toMatchObject({ type: 'h', level: 1 });
    expect(b[2]).toMatchObject({ type: 'h', level: 2 });
    expect(b[5]).toMatchObject({ type: 'li', ordered: true, n: 1 });
  });
});
