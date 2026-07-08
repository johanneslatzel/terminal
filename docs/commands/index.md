# Commands

Commands are objects in a hierarchical tree. Every node extends [`Command`](classes.md); namespace nodes extend `CommandContainer`.

## Factories

### `command(name, description, argDefs, execute, aliases?)` {#command}

Returns a `Command` ready for [`terminal.register()`](../terminal/index.md#register). Optional `aliases` provide alternate names.

```ts
command('greet', 'Say hello', [], (ctx) => ctx.stdout.write('Hello!\n'));
command('deploy', 'Deploy the app', [], handler, ['d']); // alias: deploy via "d"
```

### `container(name, description?, children?, aliases?)` {#container}

Returns a `CommandContainer`. Children can also be added later via `.add()`.

```ts
container('config', 'Configuration', [
    command('get', 'Get a value', [], handler),
    command('set', 'Set a value', [], handler)
]);
container('server', 'Server commands', [], ['srv']); // alias: server via "srv"
```

### `arg(name, description?, schema, position?, aliases?, secret?)` {#arg}

Shortcut for a single [`CommandArgumentDefinition`](definitions.md). Optional `aliases` provide alternate flag names — single-char aliases use `-x`, multi-char use `--name`. When `secret` is `true`, missing arguments prompt with hidden input.

```ts
arg('name', 'Who to greet', z.string().min(1));
// → { name: 'name', description: 'Who to greet', schema: z.string().min(1) }

arg('name', 'Your name', z.string(), undefined, ['n']);
// → { name: 'name', description: 'Your name', schema: z.string(), aliases: ['n'] }
//   Accepts --name or -n on the command line
```

When `position` is provided, the argument can be given as a bare token instead of `--name value`:

```ts
arg('query', 'Search query', z.string(), 0);
// → { name: 'query', description: 'Search query', schema: z.string(), position: 0 }

arg('password', 'API token', z.string().min(8), undefined, undefined, true);
// → { name: 'password', description: 'API token', ..., secret: true }
//   Prompts with hidden input when missing on the command line
```

See [Argument Definitions](definitions.md) for details.

## Registration

Register at root with `terminal.register()`:

```ts
term.register(command('greet', '...', [], handler));
```

Subcommands are added to a parent container via `.add()`:

```ts
const cfg = container('config', 'Configuration');
cfg.add(command('get', 'Get a value', [], handler));
term.register(cfg);
```

## Tree structure

- Command names are single words (`greet`, `config`, `get`)
- Parent paths use dot-separated segments (`'config'`, `'config.set'`)
- Containers act as namespace nodes; `execute()` is called when no subcommand matches
- Unknown commands throw [`CommandNotFoundError`](../terminal/index.md#exports) with prefix-matched suggestions

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
