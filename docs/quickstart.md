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

Type `help` to list builtins, `exit` to quit.

## Add a command

[`command()`](commands/index.md#command) creates a leaf command for `terminal.register()`:

```ts
import { Terminal, command } from '@johannes.latzel/terminal';

const term = new Terminal();
term.register(
    command(
        'greet',
        (ctx) => {
            ctx.stdout.write('Hello, World!\n');
        },
        { description: 'Say hello' }
    )
);
term.start();
```

## Add arguments

Declare arguments with [`arg()`](commands/definitions.md#arg) and zod schemas; read them with [`require<T>()`](arguments/index.md#require) (values) or [`flag()`](arguments/index.md#flag) (booleans):

```ts
import { z } from 'zod';
import { Terminal, command, arg } from '@johannes.latzel/terminal';

const term = new Terminal();
term.register(
    command(
        'greet',
        async (ctx, args) => {
            const name = await args.require<string>('name');
            const count = args.has('count') ? await args.require<number>('count') : 1;
            if (await args.flag('verbose'))
                ctx.stdout.write(`Greeting ${name} ${count} time(s)...\n`);
            for (let i = 0; i < count; i++) ctx.stdout.write(`Hello, ${name}!\n`);
        },
        {
            description: 'Say hello',
            arguments: [
                arg('name', z.string().min(1), { description: 'Who to greet' }),
                arg('count', z.coerce.number().int().positive(), { description: 'Times to greet' }),
                arg('verbose', z.boolean(), { description: 'Show details' })
            ]
        }
    )
);
term.start();
```

Tab completion suggests `--name`, `--count`, `--verbose`.

### Interactive prompting

A missing required argument prompts when a readline is available:

```
> greet --count 2
argument [name]: Alice
```

Without a readline, [`InvalidArgumentsError`](arguments/index.md#errors) is thrown.

Define boolean schemas as `z.boolean()`; `z.coerce.boolean()` parses `"false"` as `true`.

### Array arguments

Array schemas (`z.array(...)`) auto-split on commas; unquoted bare tokens after `--flag` group onto the flag:

```ts
const fields = await args.require<string[]>('fields');
// --fields id, name → ['id', 'name']
// --fields one two   → ['one two']   (single array element, no comma)
```

## Build a command tree

[`container()`](commands/index.md#container) groups commands under a namespace:

```ts
import { Terminal, command, container } from '@johannes.latzel/terminal';

const term = new Terminal();
term.register(
    container('config', {
        description: 'Configuration',
        children: [
            command('get', (ctx) => ctx.stdout.write('value\n'), { description: 'Get a value' }),
            command('set', (ctx) => ctx.stdout.write('ok\n'), { description: 'Set a value' })
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

See [Hooks](hooks/index.md).

```ts
term.hook()
    .beforeParse()
    .do((input) => (input.startsWith('!') ? input.slice(1) : input));
term.hook()
    .onError()
    .do((error) => true); // suppress default error output
```

`.dispose()` unregisters a hook.

---

- [Commands](commands/index.md)
- [API Reference](terminal/index.md)
