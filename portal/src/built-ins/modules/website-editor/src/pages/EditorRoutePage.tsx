// Server-side plugin entry. The foundation supplies its storage and service
// adapters here; the visual editor itself works through scoped HTTP APIs and
// must not receive those function-bearing adapters across the client boundary.

import type { PluginPageProps } from "@/built-ins/runtime/_types";
import VisualEditorPage from "./EditorPage";

export default function EditorRoutePage(_props: PluginPageProps) {
  return <VisualEditorPage />;
}
