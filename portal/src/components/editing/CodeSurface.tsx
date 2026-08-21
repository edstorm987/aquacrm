"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";

// ─── DEV EDITOR — the code surface ───────────────────────────────────────────
//
// A real editor engine, not an approximation.
//
// The first pass here was a hand-rolled regex tokenizer, justified by "this is
// a viewer, not an IDE". Ed corrected that: it IS effectively an IDE, and an
// IDE deserves real infrastructure. So this is CodeMirror 6 with the VS Code
// Dark+ theme — actual VS Code colours, actual language grammars, plus the
// editing behaviour a regex can never give you: bracket matching, multi-cursor,
// selection, undo history, search, and correct handling of block comments and
// template literals that span lines.
//
// CodeMirror rather than Monaco on purpose: Monaco's default loader pulls from
// a CDN, and this app enforces a Content-Security-Policy that would block it.
// CodeMirror is npm-only with no CDN and no worker plumbing, so it works inside
// the CSP as-is.
//
// Loaded dynamically with ssr:false — it touches the DOM on construction.

const CodeMirror = dynamic(() => import("@uiw/react-codemirror").then(m => m.default), {
  ssr: false,
  loading: () => <p className="px-3 py-2 font-mono text-[11px] text-white/35">Opening…</p>,
});

/** The language grammar for a path, or none when we do not know it. */
function extensionsFor(path: string) {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop()! : name;
  if (["ts", "mts", "cts"].includes(ext)) return [javascript({ typescript: true })];
  if (ext === "tsx") return [javascript({ typescript: true, jsx: true })];
  if (["js", "mjs", "cjs"].includes(ext)) return [javascript()];
  if (ext === "jsx") return [javascript({ jsx: true })];
  if (["json", "json5"].includes(ext)) return [json()];
  if (["css", "scss", "sass", "less"].includes(ext)) return [css()];
  if (["html", "htm", "svg", "xml", "vue", "svelte"].includes(ext)) return [html()];
  if (["md", "mdx"].includes(ext)) return [markdown()];
  // Unknown grammar still gets the theme, the gutter and the editing behaviour
  // — just no token colours. Never the WRONG colours.
  return [];
}

export function CodeSurface({
  path,
  value,
  editable,
  onChange,
  onSave,
}: {
  path: string;
  value: string;
  editable: boolean;
  onChange: (next: string) => void;
  /** ⌘S / Ctrl+S. */
  onSave: () => void;
}) {
  const extensions = useMemo(() => extensionsFor(path), [path]);

  return (
    <div
      className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:bg-transparent [&_.cm-gutters]:border-r [&_.cm-gutters]:border-white/5 [&_.cm-gutters]:bg-transparent [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[11px] [&_.cm-scroller]:leading-5"
      onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          onSave();
        }
      }}
    >
      <CodeMirror
        value={value}
        theme={vscodeDark}
        extensions={extensions}
        editable={editable}
        readOnly={!editable}
        onChange={onChange}
        height="100%"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: editable,
          highlightActiveLineGutter: editable,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: editable,
          autocompletion: false,
          highlightSelectionMatches: true,
          searchKeymap: true,
        }}
      />
    </div>
  );
}
