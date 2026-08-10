# Classes

Use these when a command needs state, helper methods, or complex logic.

## Command

The constructor accepts an optional 4th argument for aliases:
`super(name, description?, argDefs?, aliases?)`.

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

class DeployCommand extends Command {
    constructor() {
        super('deploy', 'Deploy the app', [], ['d']); // alias: "d"
    }
    async execute(ctx: CommandContext, _args: CommandArguments): Promise<void> {
        ctx.stdout.write('Deploying...\n');
    }
}
```

## CommandContainer

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

- [Commands](index.md)
- [Definitions](definitions.md)
- [Arguments](../arguments/index.md)
