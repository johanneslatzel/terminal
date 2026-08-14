# Commands

Commands are objects in a hierarchical tree. Every node extends [`Command`](classes.md); namespace nodes extend `CommandContainer`.

## Factories

### `command(name, execute, options?)` {#command}

Returns a `Command` ready for [`terminal.register()`](#registration). The `options` argument accepts `description`, `arguments`, `aliases`, `acceptsPipelineInput`, and `providesPipelineOutput`.

```ts
command('greet', (ctx) => ctx.stdout.write('Hello!\n'), { description: 'Say hello' });
command('deploy', handler, { description: 'Deploy the app', aliases: ['d'] });
command('filter', async (_ctx, args) => {
    const items = await args.requirePipelineArray();
    // ...
}, { acceptsPipelineInput: PipelineInputAcceptance.Array });
```

### `container(name, options?)` {#container}

Returns a `CommandContainer`. The `options` object accepts `description`, `children`, and `aliases`. Children can also be added later via `.add()`.

```ts
container('config', {
    description: 'Configuration',
    children: [
        command('get', handler, { description: 'Get a value' }),
        command('set', handler, { description: 'Set a value' })
    ]
});
container('server', { description: 'Server commands', aliases: ['srv'] });
```

### `arg(name, schema, options?)` {#arg}

Shortcut for a single [`CommandArgumentDefinition`](definitions.md). See [Argument Definitions](definitions.md) for details, examples, and schema patterns.

When the `position` option is provided, the argument can be given as a bare token instead of `--name value`. When the `secret` option is `true`, missing arguments prompt with hidden input.

## Registration

Register at root with `terminal.register()`:

```ts
term.register(command('greet', handler, { description: '...' }));
```

Subcommands are added to a parent container via `.add()`:

```ts
const cfg = container('config', { description: 'Configuration' });
cfg.add(command('get', handler, { description: 'Get a value' }));
term.register(cfg);
```

## Tree structure

- Command names are single words (`greet`, `config`, `get`)
- Parent paths use dot-separated segments (`'config'`, `'config.set'`)
- Containers act as namespace nodes; `execute()` is called when no subcommand matches
- Unknown commands throw `CommandNotFoundError` with prefix-matched suggestions

## CommandContext

Every command's `execute(ctx, args)` receives a `CommandContext`:

| Property           | Description                                                          |
| ------------------ | -------------------------------------------------------------------- |
| `terminal`         | The running Terminal instance                                        |
| `stdout` / `stdin` | I/O streams                                                          |
| `state`            | Shared mutable state between commands                                |
| `logger`           | Console-compatible logger                                            |
| `exit`             | Shorthand for `terminal.stop()`                                      |
| `output`           | Pipeline output for the next `\|` segment; call `.submit()` to emit |

Pipeline data is consumed through the [`CommandArguments`](../arguments/index.md) parameter `args`, not `ctx`. Use `args.requirePipelineArray()` (Array mode) or auto-mapped `args.require()` (Single mode).

---

- [Classes](classes.md)
- [Definitions](definitions.md)
- [Arguments](../arguments/index.md)
