/**
 * A small Markdown to HTML converter for the user guide: headings, paragraphs, bullet and numbered lists (nested by indenting), code (inline and in fences),
 * bold, italics, links and rules. Everything the text says is escaped first, so the result only has the tags this file makes (and a link only goes to a web
 * address, a page of the app or a place on the same page).
 */

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Bold, italics, code and links inside a line of text. */
function inline(text: string): string {
  const codes: string[] = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=$|[\s).,;:!?])/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => (/^(https?:\/\/|\/|#)/.test(href) ? `<a href="${href}">${label}</a>` : label));
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
}

/** Converts Markdown text to HTML. */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  const open: ('ul' | 'ol')[] = []; // the lists that are open, the innermost last
  const indents: number[] = [];
  let paragraph: string[] = [];
  let fence: string[] | null = null;

  const flush = (): void => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeOne = (): void => {
    html.push(`</li></${open.pop()}>`);
    indents.pop();
  };
  const closeLists = (): void => {
    while (open.length) closeOne();
  };

  for (const line of lines) {
    if (fence) {
      if (/^```/.test(line)) {
        html.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
        fence = null;
      } else fence.push(line);
      continue;
    }
    if (/^```/.test(line)) {
      flush();
      closeLists();
      fence = [];
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const item = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush();
      closeLists();
      html.push('<hr>');
    } else if (item) {
      flush();
      const indent = item[1].length;
      const kind = /\d/.test(item[2]) ? 'ol' : 'ul';
      if (!open.length || indent > indents[indents.length - 1]) {
        html.push(`<${kind}><li>`);
        open.push(kind);
        indents.push(indent);
      } else {
        while (open.length > 1 && indent < indents[indents.length - 1]) closeOne();
        html.push('</li><li>');
      }
      html.push(inline(item[3]));
    } else if (!line.trim()) {
      flush();
      closeLists();
    } else if (open.length && /^\s+\S/.test(line)) {
      html.push(' ' + inline(line.trim())); // the next line of a list item
    } else {
      closeLists();
      paragraph.push(line.trim());
    }
  }
  flush();
  closeLists();
  if (fence) html.push(`<pre><code>${escapeHtml((fence as string[]).join('\n'))}</code></pre>`);
  return html.join('');
}
