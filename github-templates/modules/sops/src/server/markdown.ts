// Tiny zero-dependency markdown renderer.
//
// Handles the SOP-shape Ed pastes: paragraphs, ATX headings (# / ## / ###),
// fenced code blocks (```), unordered lists (- / *), inline `code`,
// bold (**) + italic (*). Anything we don't recognise renders as
// escaped paragraph text. Foundation can swap in a richer renderer
// later — this exists so the plugin is tsc-clean standalone.

const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ESCAPES[c] ?? c);
}

function inline(s: string): string {
  // Order matters — code first so its contents skip bold/italic.
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, (_m, inner) => `<code>${inner}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
}

export function renderMarkdown(src: string): string {
  if (!src) return "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inList = false;
  const closeList = (): void => { if (inList) { out.push("</ul>"); inList = false; } };

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Fenced code.
    if (line.startsWith("```")) {
      closeList();
      i++;
      const buf: string[] = [];
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing fence
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // Headings.
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const lvl = h[1]!.length;
      out.push(`<h${lvl}>${inline(h[2]!.trim())}</h${lvl}>`);
      i++;
      continue;
    }

    // Lists.
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(li[1]!.trim())}</li>`);
      i++;
      continue;
    }

    // Blank line — close list, separator.
    if (!line.trim()) {
      closeList();
      i++;
      continue;
    }

    // Paragraph (collect contiguous non-empty non-special lines).
    closeList();
    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const peek = lines[i] ?? "";
      if (!peek.trim()) break;
      if (/^(#{1,3})\s+/.test(peek)) break;
      if (/^\s*[-*]\s+/.test(peek)) break;
      if (peek.startsWith("```")) break;
      buf.push(peek);
      i++;
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  closeList();
  return out.join("\n");
}
