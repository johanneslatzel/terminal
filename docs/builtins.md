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

## `json` — Format as JSON

[`JsonCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/json.ts). Pretty-prints pipeline objects as a JSON array.

```
> ls | json
[
  {
    "name": "file1.txt",
    "size": 1024
  },
  {
    "name": "file2.txt",
    "size": 2048
  }
]
```

Standalone usage writes an empty array:

```
> json
[]
```

## `table` — Render as table

[`TableCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/table.ts). Formats pipeline objects as an aligned text table. Column widths are computed from the data.

```
> ls | table
| name        | size |
|-------------|------|
| file1.txt   | 1024 |
| file2.txt   | 2048 |
```

Objects with missing keys produce empty cells:

```
> cmd | table
| name   | age |
|--------|-----|
| Alice  | 30  |
| Bob    |     |
```

Nested object and array cell values are rendered as compact JSON, e.g. `{"x":1}` or `["a","b"]`, instead of `[object Object]`.

## `select` — Pick attributes

[`SelectCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/select.ts). An intermediate pipeline command that keeps only the specified attributes from each object.

```
> cmd | select name,age | next_cmd
```

Pass the attribute names as a positional comma-separated argument. Missing attributes are silently ignored, and only the objects' own (non-inherited) keys are picked. Whitespace around commas is tolerated: `select name, age` works.

Without arguments all attributes pass through unchanged:

```
> cmd | select | next_cmd
```

When used as a terminal command (no `|` downstream), it prints a help message.

## `sort` — Sort objects

[`SortCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/sort.ts). An intermediate pipeline command that sorts objects by the specified attribute.

```
> cmd | sort --attribute name | next_cmd
> cmd | sort -a name          | next_cmd   # short alias
```

Defaults to the first key of the first object:

```
> cmd | sort | next_cmd
```

Numeric values are compared numerically; everything else is compared as strings. `null` values sort to the end. If the sort key is empty (`--attribute ""` or objects with no keys) or missing from every object, the objects pass through in their original order.

When used as a terminal command, it prints a help message.

## `clip` — Copy to clipboard

[`ClipCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/clip.ts). Copies pipeline objects to the system clipboard as a JSON string.

```
> cmd | clip
Copied 3 object(s) to clipboard.
```

Tries `pbcopy`, `xclip`, `xsel`, and `clip` in order. If no tool is available an error is printed.

Without pipeline input:

```
> clip
No pipeline input to copy to clipboard.
```

## `filter` — Filter objects

[`FilterCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/filter.ts). An intermediate pipeline command that keeps only objects matching comma-separated conditions.

```
> cmd | filter role=admin | next_cmd
> cmd | filter role=admin,state=running | next_cmd
```

Conditions are `key<operator>value`, matched against each object. Nested paths are supported with dot notation (`user.name=Alice`). The operators are:

| Operator | Meaning |
|---|---|
| `key=value` | Equal (numbers, booleans and strings; numeric strings coerce to numbers) |
| `key!=value` | Not equal |
| `key>value`, `key>=value`, `key<value`, `key<=value` | Relational comparison |
| `key~value` | Contains substring |
| `key^value` | Starts with |
| `key$value` | Ends with |
| `key=~regex` | Regular expression match |
| `key` | Key exists (non-null) |

Regex values may contain the alternation `|` without quoting — the whole condition is a single token:

```
> cmd | filter name=~^bot|^host | next_cmd
```

Only a whitespace-delimited `|` starts a new pipeline stage.

A leading `!` negates a single condition (`!role=admin`), and `!!` cancels out. `null`/missing values fail equality and relational conditions, pass `!=`, and are treated as empty strings for string operators.

Conditions combine with AND by default. Use `--any` for OR, `--not` to invert the whole predicate, and `--icase` for case-insensitive string comparison:

```
> cmd | filter role=admin --any
> cmd | filter role=admin --not
> cmd | filter name=alice --icase
```

When used as a terminal command (no `|` downstream), it prints a help message.

## `aggregate` — Aggregate objects

[`AggregateCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/aggregate.ts). An intermediate pipeline command that reduces pipeline objects to a single value or grouped rows.

```
> cmd | aggregate | next_cmd                          # count
> cmd | aggregate -m mean -a score | next_cmd         # 5.333333333333333
> cmd | aggregate --mode median --attribute score | next_cmd
```

Modes (`-m` / `--mode`): `count`, `min`, `max`, `sum`, `mean`, `median`. Without a mode the command counts objects. `min`, `max`, `sum`, `mean` and `median` require an attribute (`-a` / `--attribute`), which is looked up per object (dot notation works) and coerced from numeric strings where needed. `null`/missing attribute values are excluded, so `-m count -a <attr>` counts only objects with a non-null attribute value. Over an empty value list, `sum` is `0` while `min`, `max`, `mean` and `median` are `null`.

`--distinct` counts distinct attribute values, and `--round <n>` rounds `sum`, `mean` and `median` results:

```
> cmd | aggregate -m count -a status --distinct | next_cmd
> cmd | aggregate -m mean -a score --round 2 | next_cmd
```

The result is emitted as a single object: `{ "mean": 5.33 }`.

Group by a key with `-g` / `--groupBy`; one row per group, sorted by key, emitted as an array:

```
> cmd | aggregate -m sum -a score -g team | next_cmd
[
  { "team": "alpha", "sum": 14 },
  { "team": "beta",  "sum": 2 }
]
```

Missing and `null` group keys collapse into a single `null` group. When used as a terminal command (no `|` downstream), it prints a help message.

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
