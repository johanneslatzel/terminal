# Terminal

## Options

| Option        | Default          | Description           |
| ------------- | ---------------- | --------------------- |
| `prompt`      | `"> "`           | Prompt string         |
| `stdin`       | `process.stdin`  | Input stream          |
| `stdout`      | `process.stdout` | Output stream         |
| `historySize` | `100`            | Readline history size |

See [`src/terminal.ts`](https://github.com/johanneslatzel/terminal/blob/main/src/terminal.ts) for the full `Terminal` class signature.

## Methods

### `register(command, parentPath?)` {#register}

Register a command at root or under a dot-separated parent path:

```ts
term.register(child, 'config'); // under root "config"
term.register(child, 'config.set'); // under config > set
```

Intermediate containers must exist. See [Commands](../commands/index.md).

### `hook()`

Returns a [`TerminalHookBuilder`](../hooks/index.md) for registering lifecycle hooks.

### `getRootCommands()`

Returns all root-level commands.

### `start()` / `stop()`

Start and stop the terminal loop. `stop()` closes the readline and resolves the `start()` promise.

---

## CommandContext

| Property           | Description                           |
| ------------------ | ------------------------------------- |
| `terminal`         | The running Terminal instance         |
| `stdout` / `stdin` | I/O streams                           |
| `state`            | Shared mutable state between commands |
| `logger`           | Console-compatible logger             |
| `exit`             | Shorthand for `terminal.stop()`       |

See [`src/types.ts`](https://github.com/johanneslatzel/terminal/blob/main/src/types.ts) for the `CommandContext` interface.

---

## Exports

### Values

| Export                  | Description                            |
| ----------------------- | -------------------------------------- |
| `Terminal`              | Terminal engine class                  |
| `CommandArguments`      | Typed argument accessor with prompting |
| `InvalidArgumentsError` | Invalid arguments                      |
| `CommandNotFoundError`  | No command matched                     |
| `ParseError`            | Input could not be tokenized           |
| `Command`               | Base class for commands                |
| `CommandContainer`      | Base class for namespace containers    |
| `Hook`                  | Base class for lifecycle hooks         |
| `TerminalHookBuilder`   | Builder returned by `terminal.hook()`  |
| `command()`             | Inline command factory                 |
| `container()`           | Inline namespace factory               |
| `arg()`                 | Argument definition factory            |

### Types

Available via `import type` from the package. See [`src/index.ts`](https://github.com/johanneslatzel/terminal/blob/main/src/index.ts) for the full export list.

---

[**Commands**](../commands/index.md) — defining commands  
[**Arguments**](../arguments/index.md) — typed accessors and prompting  
[**Hooks**](../hooks/index.md) — lifecycle event reference
