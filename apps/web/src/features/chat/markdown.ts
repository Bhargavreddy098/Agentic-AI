import { marked, type MarkedOptions, type RendererObject } from "marked";
import DOMPurify from "isomorphic-dompurify";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, String.fromCharCode(34))
    .replace(/'/g, "&#039;");
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

interface InlineToken {
  type?: string;
  text?: string;
  href?: string;
  title?: string;
  tokens?: unknown;
}

const renderer = {
  heading({ tokens, depth }: { tokens: unknown; depth: number }) {
    return `<h${depth}>${parseInline(tokens)}</h${depth}>`;
  },
  paragraph({ tokens }: { tokens: unknown }) {
    return `<p>${parseInline(tokens)}</p>`;
  },
  strong({ tokens }: { tokens: unknown }) {
    return `<strong>${parseInline(tokens)}</strong>`;
  },
  em({ tokens }: { tokens: unknown }) {
    return `<em>${parseInline(tokens)}</em>`;
  },
  codespan({ text }: { text: string }) {
    return `<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">${escapeHtml(text)}</code>`;
  },
  code({ text, lang }: { text: string; lang?: string }) {
    const language = lang ? ` language-${lang}` : "";
    return `<pre class="bg-muted p-4 rounded overflow-x-auto"><code class="font-mono text-sm${language}">${escapeHtml(text)}</code></pre>`;
  },
  link({ href, title, tokens }: { href: string; title?: string | null; tokens: unknown }) {
    const safeHref = isSafeUrl(href) ? href : "#";
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:no-underline"${titleAttr}>${parseInline(tokens)}</a>`;
  },
  image({ href, title, alt }: { href: string; title?: string | null; alt?: string | null }) {
    const safeHref = isSafeUrl(href) ? href : "";
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : "";
    return safeHref ? `<img src="${safeHref}"${altAttr}${titleAttr} class="max-w-full h-auto rounded" />` : "";
  },
  blockquote({ tokens }: { tokens: unknown }) {
    return `<blockquote class="border-l-4 border-primary pl-4 italic text-muted-foreground">${parseInline(tokens)}</blockquote>`;
  },
  list({ tokens, ordered, start }: { tokens: unknown; ordered: boolean; start?: number }) {
    const tag = ordered ? "ol" : "ul";
    const startAttr = ordered && start && start !== 1 ? ` start="${start}"` : "";
    return `<${tag}${startAttr} class="space-y-1 pl-6">${parseInline(tokens)}</${tag}>`;
  },
  listitem({ tokens, task, checked }: { tokens: unknown; task: boolean; checked?: boolean }) {
    if (task) {
      return `<li class="flex items-start gap-2"><input type="checkbox" ${checked ? "checked" : ""} disabled class="mt-0.5" />${parseInline(tokens)}</li>`;
    }
    return `<li class="marker:disc marker:text-primary">${parseInline(tokens)}</li>`;
  },
  table({ header, rows }: { header: string; rows: string }) {
    return `<div class="overflow-x-auto"><table class="w-full border-collapse"><thead class="border-b border-border">${header}</thead><tbody class="divide-y divide-border">${rows}</tbody></table></div>`;
  },
  tablerow({ tokens }: { tokens: string }) {
    return `<tr>${tokens}</tr>`;
  },
  tablecell({ tokens, header, align }: { tokens: string; header: boolean; align?: "center" | "left" | "right" }) {
    const tag = header ? "th" : "td";
    const alignClass = align ? ` text-${align}` : "";
    return `<${tag} class="px-3 py-2 border border-border${alignClass} ${header ? "font-semibold bg-muted" : ""}">${tokens}</${tag}>`;
  },
  hr() {
    return '<hr class="border-border my-4" />';
  },
  br() {
    return "<br />";
  }
};

function parseInline(tokens: unknown): string {
  if (!tokens) return "";
  if (typeof tokens === "string") return escapeHtml(tokens);
  if (Array.isArray(tokens)) {
    return tokens.map(t => parseInline(t)).join("");
  }
  if (typeof tokens === "object") {
    const token = tokens as InlineToken;
    if (token.type === "text") return escapeHtml(token.text ?? "");
    if (token.type === "codespan") return `<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">${escapeHtml(token.text ?? "")}</code>`;
    if (token.type === "strong") return `<strong>${parseInline(token.tokens)}</strong>`;
    if (token.type === "em") return `<em>${parseInline(token.tokens)}</em>`;
    if (token.type === "link") {
      const href = token.href ?? "";
      const safeHref = isSafeUrl(href) ? href : "#";
      const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:no-underline"${titleAttr}>${parseInline(token.tokens)}</a>`;
    }
    if (token.type === "image") return "";
    if (token.tokens) return parseInline(token.tokens);
  }
  return "";
}

marked.use({ renderer: renderer as unknown as RendererObject, async: false });

export function renderMarkdown(markdown: string): string {
  if (!markdown || !markdown.trim()) return "";
  const html = marked.parse(markdown) as string;
  return sanitizeHtml(html);
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "hr",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "strong", "em", "u", "s", "sub", "sup",
      "code", "pre",
      "blockquote",
      "ul", "ol", "li",
      "a",
      "img",
      "table", "thead", "tbody", "tr", "th", "td",
      "div", "span"
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "title", "alt",
      "class", "id",
      "start"
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "style"]
  });
}

export function stripMarkdown(markdown: string): string {
  const textRenderer: RendererObject = {
    text: ({ text }) => text ?? "",
  };
  const options: MarkedOptions = {
    renderer: textRenderer as unknown as NonNullable<MarkedOptions["renderer"]>,
  };
  return marked.parse(markdown, options) as string;
}