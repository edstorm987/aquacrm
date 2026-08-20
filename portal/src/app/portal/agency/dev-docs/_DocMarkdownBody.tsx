"use client";
// The actual markdown rendering for Dev Docs. Split out of `_DocMarkdown` so
// react-markdown + remark-gfm live in their OWN chunk instead of the initial JS
// of every docs route — markdown only renders once a user opens a doc, so the
// parser has no business shipping with the index. `_DocMarkdown` loads this via
// `next/dynamic`; nothing else should import it directly.
//
// react-markdown + remark-gfm (GFM tables / task-lists / strikethrough the dev
// docs lean on). Raw HTML is NOT rendered — react-markdown escapes it by
// default, which is the safe posture the plan asked for (no `rehype-raw`, no
// `dangerouslySetInnerHTML`). Styled via the components map so it needs no
// typography plugin and touches no shared CSS.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => <h1 className="mt-6 mb-3 text-xl font-semibold tracking-tight text-black/90 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-6 mb-2 border-b border-black/10 pb-1 text-lg font-semibold text-black/85 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-2 text-base font-semibold text-black/80 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-1 text-sm font-semibold uppercase tracking-wide text-black/60 first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-3 text-sm leading-relaxed text-black/75">{children}</p>,
  ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1 text-sm text-black/75 marker:text-black/30">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1 text-sm text-black/75 marker:text-black/40">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-black/90">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-black/15 pl-3 text-sm italic text-black/60">{children}</blockquote>
  ),
  hr: () => <hr className="my-5 border-black/10" />,
  a: ({ href, children }) => {
    const external = /^https?:\/\//i.test(href ?? "");
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-700 underline underline-offset-2 hover:text-sky-900"
        >
          {children}
        </a>
      );
    }
    // Relative doc links (e.g. ../todo.md) don't map to app routes — render as
    // non-navigating text so a click can't 404. (In-app doc-to-doc nav is a
    // later polish.) This is also what keeps `javascript:` and other non-http
    // schemes inert: only https?: hrefs ever reach an <a href>.
    return <span className="text-black/70 underline decoration-dotted underline-offset-2">{children}</span>;
  },
  code: ({ className, children }) => {
    const isBlock = /\blanguage-/.test(className ?? "");
    if (isBlock) return <code className={className}>{children}</code>;
    return <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[0.85em] text-black/80">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md border border-black/10 bg-black/[0.03] p-3 text-xs leading-relaxed text-black/80">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-black/15 text-left">{children}</thead>,
  th: ({ children }) => <th className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-black/60">{children}</th>,
  td: ({ children }) => <td className="border-b border-black/[0.06] px-2 py-1.5 align-top text-black/75">{children}</td>,
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="my-3 max-w-full rounded" />
  ),
};

export function DocMarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
