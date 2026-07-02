# Commands

Commands are objects in a hierarchical tree. Every node extends [`Command`](classes.md); namespace nodes extend `CommandContainer`.

## Factories

### `command(name, description, argDefs, execute)` {#command}

Returns a `Command` ready for [`terminal.register()`](../terminal/index.md#register).

```ts
command('greet', 'Say hello', [], (ctx) => ctx.stdout.write('Hello!\n'));
```

### `container(name, description?, children?)` {#container}

Returns a `CommandContainer`. Children can also be added later via `.add()`.

```ts
container('config', 'Configuration', [
    command('get', 'Get a value', [], handler),
    command('set', 'Set a value', [], handler)
]);
```

### `arg(name, description?, schema, position?)` {#arg}

Shortcut for a single [`CommandArgumentDefinition`](definitions.md).

```ts
arg('name', 'Who to greet', z.string().min(1));
// → { name: 'name', description: 'Who to greet', schema: z.string().min(1) }
```

When `position` is provided, the argument can be given as a bare token instead of `--name value`:

```ts
arg('query', 'Search query', z.string(), 0);
// → { name: 'query', description: 'Search query', schema: z.string(), position: 0 }
```

See [Argument Definitions](definitions.md) for details.

## Registration

Register at root or under a dot-separated parent path:

```ts
term.register(command('greet', '...', [], handler)); // root
term.register(command('sub', '...', [], handler), 'config'); // under config
```

## Tree structure

- Command names are single words (`greet`, `config`, `get`)
- Parent paths use dot-separated segments (`'config'`, `'config.set'`)
- Containers act as namespace nodes; `execute()` is called when no subcommand matches
- Unknown commands throw [`CommandNotFoundError`](../terminal/index.md#exports) with prefix-matched suggestions

---

[**Classes**](classes.md) — explicit Command / CommandContainer subclasses  
[**Definitions**](definitions.md) — argument definitions, positional args, schemas  
[**Arguments**](../arguments/index.md) — typed accessors and prompting
