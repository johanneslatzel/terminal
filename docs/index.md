# Overview

Tree-structured TypeScript terminal shell with automatic help, tab completion, `--flag` parsing, and lifecycle hooks.

```ts
import { Terminal } from '@johannes.latzel/terminal';
const term = new Terminal();
term.start();
```

- **[Quick Start](quickstart.md)** — install, first command, flags, hooks
- **[Terminal](terminal/index.md)** — class reference, options, lifecycle
- **[Commands](commands/index.md)** — factories, classes, argument definitions
- **[Arguments](arguments/index.md)** — typed accessors, prompting, zod schemas
- **[Hooks](hooks/index.md)** — lifecycle events, error handling
- **[Architecture](architecture.md)** — execution flow, input routing, pipe operator, tokenizer, resolution
- **[Builtins](builtins.md)** — help, exit, clear, select, json, table, sort, clip, filter, aggregate

## License

MIT
