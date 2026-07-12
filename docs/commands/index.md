# Commands

Commands are objects in a hierarchical tree. Every node extends [`Command`](classes.md); namespace nodes extend `CommandContainer`.

## Factories

### `command(name, description, execute, aliases?)` / `command(name, description, argDefs, execute, aliases?)` {#command}

Returns a `Command` ready for [`terminal.register()`](../terminal/index.md#register). When the command takes no arguments, omit `argDefs` and pass the handler directly. Optional `aliases` provide alternate names.

```ts
command('greet', 'Say hello', (ctx) => ctx.stdout.write('Hello!\n'));
command('deploy', 'Deploy the app', handler, ['d']); // alias: deploy via "d"
```

### `container(name, description?, children?, aliases?)` {#container}

Returns a `CommandContainer`. Children can also be added later via `.add()`.

```ts
container('config', 'Configuration', [
    command('get', 'Get a value', handler),
    command('set', 'Set a value', handler)
]);
container('server', 'Server commands', [], ['srv']); // alias: server via "srv"
```

### `arg(name, description?, schema, position?, aliases?, secret?)` {#arg}

Shortcut for a single [`CommandArgumentDefinition`](definitions.md). See [Argument Definitions](definitions.md) for details, examples, and schema patterns.

When `position` is provided, the argument can be given as a bare token instead of `--name value`. When `secret` is `true`, missing arguments prompt with hidden input.

## Registration

Register at root with `terminal.register()`:

```ts
term.register(command('greet', '...', handler));
```

Subcommands are added to a parent container via `.add()`:

```ts
const cfg = container('config', 'Configuration');
cfg.add(command('get', 'Get a value', handler));
term.register(cfg);
```

## Tree structure

- Command names are single words (`greet`, `config`, `get`)
- Parent paths use dot-separated segments (`'config'`, `'config.set'`)
- Containers act as namespace nodes; `execute()` is called when no subcommand matches
- Unknown commands throw `CommandNotFoundError` with prefix-matched suggestions

## CommandContext

Every command's `execute(ctx, args)` receives a `CommandContext`:

| Property           | Description                           |
| ------------------ | ------------------------------------- |
| `terminal`         | The running Terminal instance         |
| `stdout` / `stdin` | I/O streams                           |
| `state`            | Shared mutable state between commands |
| `logger`           | Console-compatible logger             |
| `exit`             | Shorthand for `terminal.stop()`       |

---

[**Classes**](classes.md) — explicit Command / CommandContainer subclasses  
[**Definitions**](definitions.md) — argument definitions, positional args, schemas  
[**Arguments**](../arguments/index.md) — typed accessors and prompting
