# Built-in Commands

Registered in every `Terminal` by [`registerBuiltins()`](https://github.com/johanneslatzel/terminal/blob/main/src/terminal.ts). Cannot be removed (but can be [shadowed](#shadowing)).

## `help` — Show help

[`HelpCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/help.ts). Renders usage from the command tree at runtime.

```
> help
Commands:
  help    Show help
  exit    Exit the terminal
  clear   Clear terminal
```

Use `--command <name>` or just `<name>` to scope help:

```
> help --command help
help - Show help
Arguments:
  --command   Show help for a specific command
```

The positional shorthand works the same way:

```
> help help
help - Show help
Arguments:
  --command   Show help for a specific command
```

Subcommands are listed in a table:

```
> help --command config
config - Configuration commands
Arguments:
  --file   Config file
Subcommands:
  get   Get a config value
  set   Set a config value
```

Nested subcommands are resolved by walking the command tree:

```
> help config get
get - Get a config value
Arguments:
  --key   Config key
```

Multiple levels of nesting are supported:

```
> help game list verify
verify - Verify a listing
```

Quoted paths with `--command` work the same way:

```
> help --command "game list verify"
verify - Verify a listing
```

Unknown command:

```
> help nonexistent
Unknown command: nonexistent
```

## `exit` — Exit

[`ExitCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/exit.ts). Calls `ctx.exit()` → `ctx.terminal.stop()`.

```
> exit
```

## `clear` — Clear screen

[`ClearCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/clear.ts). Writes `\x1Bc` (ANSI form-feed) to stdout.

```
> clear
```

## Shadowing

Register a command with the same name to override a builtin:

```ts
class SafeExit extends Command {
    constructor() {
        super('exit', 'Exit with confirmation');
    }
    async execute(ctx: CommandContext, _args: CommandArguments): Promise<void> {
        ctx.stdout.write('Are you sure? (y/N) ');
        // read ctx.stdin, then ctx.exit()
    }
}
terminal.register(new SafeExit());
```

---

[**Commands**](commands/index.md) — defining commands and arguments
