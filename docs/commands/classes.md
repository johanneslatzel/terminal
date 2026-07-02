# Classes

Use these when a command needs state, helper methods, or complex logic.

## Command

See [`src/command-tree.ts`](https://github.com/johanneslatzel/terminal/blob/main/src/command-tree.ts) for the `Command` abstract class signature.

```ts
class GreetCommand extends Command {
    constructor() {
        super('greet', 'Say hello', [
            { name: 'name', description: 'Who to greet', required: false, schema: z.string() }
        ]);
    }
    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const name = args.has('name') ? await args.require<string>('name') : 'World';
        ctx.stdout.write(`Hello, ${name}!\n`);
    }
}
```

> **Note:** Uses `args.require<string>('name')` — see [Arguments](../arguments/index.md#require) for details. The old `requireString()` accessors do not exist.

## CommandContainer

See [`src/command-tree.ts`](https://github.com/johanneslatzel/terminal/blob/main/src/command-tree.ts) for the `CommandContainer` class signature.

Default `execute` prints detailed help for the container (description, arguments, subcommands). Override it to handle container-level invocation.

```ts
class ConfigCommand extends CommandContainer {
    constructor() {
        super('config', 'Configuration commands');
        this.add(new ConfigGetCommand());
        this.add(new ConfigSetCommand());
    }
    execute(ctx: CommandContext, _args: CommandArguments): void {
        ctx.stdout.write('See "help config" for subcommands.\n');
    }
}
```

---

[**Commands**](index.md) — factory functions and registration  
[**Definitions**](definitions.md) — argument definition interface  
[**Arguments**](../arguments/index.md) — typed accessors
