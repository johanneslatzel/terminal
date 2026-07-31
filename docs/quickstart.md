# Quick Start

## Install

```bash
npm install @johannes.latzel/terminal
```

## Start

```ts
import { Terminal } from '@johannes.latzel/terminal';
const term = new Terminal({ prompt: 'λ ' });
term.start();
```

Type `help` to list builtins and `exit` to quit.

## Add a command

[`command()`](commands/index.md#command) defines a leaf command and returns a `Command` for `terminal.register()`:

```ts
import { Terminal, command } from '@johannes.latzel/terminal';

const term = new Terminal();
term.register(
    command('greet', 'Say hello', (ctx) => {
        ctx.stdout.write('Hello, World!\n');
    })
);
term.start();
```

## Add arguments

Declare with [`arg()`](commands/definitions.md#arg) and zod schemas. Read with [`require<T>()`](arguments/index.md#require) (values) or [`flag()`](arguments/index.md#flag) (booleans):

```ts
import { z } from 'zod';
import { Terminal, command, arg } from '@johannes.latzel/terminal';

const term = new Terminal();
term.register(
    command(
        'greet',
        'Say hello',
        [
            arg('name', 'Who to greet', z.string().min(1)),
            arg('count', 'Times to greet', z.coerce.number().int().positive()),
            arg('verbose', 'Show details', z.boolean())
        ],
        async (ctx, args) => {
            const name = await args.require<string>('name');
            const count = args.has('count') ? await args.require<number>('count') : 1;
            if (await args.flag('verbose'))
                ctx.stdout.write(`Greeting ${name} ${count} time(s)...\n`);
            for (let i = 0; i < count; i++) ctx.stdout.write(`Hello, ${name}!\n`);
        }
    )
);
term.start();
```

Tab completion suggests `--name`, `--count`, `--verbose`.

### Interactive prompting

Missing required arguments prompt interactively when a readline is available:

```
> greet --count 2
argument [name]: Alice
```

Without a readline (piped input), [`InvalidArgumentsError`](arguments/index.md#errors) is thrown instead.

> **Note:** Use `flag()` for booleans — `--verbose` → `true`, `--verbose false` → `false`, absent → `false`. Don't use `z.coerce.boolean()` — `Boolean("false")` is `true`. Define boolean schemas as `z.boolean()`.

### Array arguments

Arguments with an array schema (`z.array(...)`) auto-split on commas. Unquoted bare tokens after `--flag` are grouped onto the flag:

```ts
const fields = await args.require<string[]>('fields');
// --fields id, name → ['id', 'name']
// --fields one two   → ['one two']   (single array element, no comma)
```

## Build a command tree

Use [`container()`](commands/index.md#container) to group commands under a namespace:

```ts
import { Terminal, command, container } from '@johannes.latzel/terminal';

const term = new Terminal();
term.register(
    container('config', {
        description: 'Configuration',
        children: [
            command('get', 'Get a value', (ctx) => ctx.stdout.write('value\n')),
            command('set', 'Set a value', (ctx) => ctx.stdout.write('ok\n'))
        ]
    })
);
term.start();
```

```
> config get
value
> config set
ok
```

## Lifecycle hooks

See [Hooks](hooks/index.md) for the full API.

```ts
term.hook()
    .beforeParse()
    .do((input) => (input.startsWith('!') ? input.slice(1) : input));
term.hook()
    .onError()
    .do((error) => true); // suppress default error output
```

Call `.dispose()` on the returned `Hook` to unregister.

---

[**Commands**](commands/index.md) — class-based commands, argument definitions, advanced patterns  
[**API Reference**](terminal/index.md)
