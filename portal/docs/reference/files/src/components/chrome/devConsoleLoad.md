# `src/components/chrome/devConsoleLoad.ts`

← [File index](../../../../files-index.md) · Area: Components — src/components/

_No file-level doc-comment. Purpose inferred from its path (Components — src/components/) and its exports below._

## Exports (5)

- `type ConsoleStatus`
- `workerTotal(status: ConsoleStatus): number`
- `readableError(code: string | undefined, httpStatus: number): string`
- `interface ConsoleLoadSinks (6 members)`
- `async runDevConsoleLoad(input: { read: (part: "core" | "full") => Promise<ConsoleStatus>; sinks: ConsoleLoadSinks; token: { current: number }; }): Promise<void>`

## Depends on (1)

- [`src/lib/server/dev/devConsoleStatus.ts`](../../lib/server/dev/devConsoleStatus.md)

## Used by (1)

- [`src/components/chrome/DevConsolePanel.tsx`](./DevConsolePanel.md)

