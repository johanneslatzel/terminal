# Built-in Commands

Registered in every `Terminal` by [`registerBuiltins()`](https://github.com/johanneslatzel/terminal/blob/main/src/terminal.ts). Cannot be removed or shadowed.

`select`, `sort`, `filter`, and `aggregate` print their help when run without a `|` downstream.

## `help` - Show help

[`HelpCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/help.ts). Renders usage from the command tree at runtime.

```
> help
Commands:
  help    Show help
  exit    Exit the terminal
  clear   Clear terminal
```

Scope to a command with `--command <name>` or a positional path:

```
> help --command help
help - Show help
Arguments:
  --command   Show help for a specific command

> help help
help - Show help
Arguments:
  --command   Show help for a specific command
```

Subcommands resolve by walking the tree; nested paths and quoted paths work the same way:

```
> help --command config
config - Configuration commands
Arguments:
  --file   Config file
Subcommands:
  get   Get a config value
  set   Set a config value

> help config get
get - Get a config value
Arguments:
  --key   Config key

> help --command "game list verify"
verify - Verify a listing
```

Unknown command:

```
> help nonexistent
Unknown command: nonexistent
```

## `exit` - Exit

[`ExitCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/exit.ts). Calls `ctx.exit()`, which calls `ctx.terminal.stop()`.

```
> exit
```

## `clear` - Clear screen

[`ClearCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/clear.ts). Writes `\x1Bc` (ANSI form-feed) to stdout.

```
> clear
```

## `json` - Format as JSON

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

Standalone it writes an empty array:

```
> json
[]
```

## `table` - Render as table

[`TableCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/table.ts). Formats pipeline objects as an aligned text table; column widths are computed from the data.

```
> ls | table
| name        | size |
|-------------|------|
| file1.txt   | 1024 |
| file2.txt   | 2048 |
```

Objects with missing keys produce empty cells. Nested objects and arrays render as compact JSON (`{"x":1}`, `["a","b"]`), not `[object Object]`.

## `csv` - Format as CSV

[`CsvCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/csv.ts). Formats pipeline objects as a CSV document. The header row is the union of all keys in first-seen order; cells containing commas, quotes, or newlines are quoted. Empty input writes nothing.

```
> ls | csv
name,size
file1.txt,1024
file2.txt,2048
```

Nested objects and arrays are JSON-stringified in the cell (`{"x":1}`, `"[1,2]"`); `null`/missing values render as empty cells.

## `select` - Pick, rename and set attributes

[`SelectCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/select.ts). Projects each object to the listed attributes, optionally renaming them or filling in empty values. Names are a positional comma-separated argument; whitespace around commas is tolerated (`select name, age`). Bare names keep the object's own (non-inherited) top-level key; a missing kept attribute is silently ignored. Without arguments all attributes pass through.

Each comma-separated item is one projection:

| Form | Meaning |
|---|---|
| `key` | Keep the object's own `key` as-is |
| `new=old` | Rename: resolve source `old` (dot-notation supported) into output `new` |
| `new=` | Emit `new` as an empty string |

Rename pairs apply against the original object (no chaining), so `a=b, b=a` swaps both values; a missing source path is silently ignored. The last projection wins when two target the same output key. An empty output key (`=x`) throws an error.

```
> cmd | select name,age | next_cmd
> cmd | select id=taskId | next_cmd
> cmd | select owner=user.name, author= | next_cmd
```

## `sort` - Sort objects

[`SortCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/sort.ts). Sorts objects by one or more comma-separated attributes (a positional argument); later attributes break ties. Defaults to the first key of the first object.

`sort` is an intermediate pipeline command.

```
> cmd | sort name | next_cmd
> cmd | sort milestone, status, title | next_cmd   # later names are tie-breakers
> cmd | sort | next_cmd
```

Use `-d` / `--descending` to reverse the sort order:

```
> cmd | sort name -d | next_cmd                    # Z → A
> cmd | sort milestone, status -d | next_cmd       # entire tie-breaker order reversed
```

Numbers compare numerically, everything else as strings; `null` sorts last. Empty or universally missing sort keys leave objects in their original order. Ties are resolved by the next listed attribute; all attributes tied means the original order is kept.

## `clip` - Copy to clipboard

[`ClipCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/clip.ts). Copies pipeline objects to the clipboard as a JSON string.

```
> cmd | clip
Copied 3 object(s) to clipboard.
```

Tries `pbcopy`, `xclip`, `xsel`, `clip` in order; errors if none is available.

```
> clip
No pipeline input to copy to clipboard.
```

## `filter` - Filter objects

[`FilterCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/filter.ts). Keeps objects matching comma-separated conditions. Conditions are `key<operator>value`; nested paths use dot notation (`user.name=Alice`).

```
> cmd | filter role=admin | next_cmd
> cmd | filter role=admin,state=running | next_cmd
```

| Operator | Meaning |
|---|---|
| `key=value` | Equal (numbers, booleans, strings; numeric strings coerce) |
| `key!=value` | Not equal |
| `key>value`, `key>=value`, `key<value`, `key<=value` | Relational |
| `key~value` | Contains substring |
| `key^value` | Starts with |
| `key$value` | Ends with |
| `key=~regex` | Regular expression match |
| `key` | Key exists (non-null) |

`|` inside a regex needs no quoting; only a whitespace-delimited `|` starts a new pipeline stage:

```
> cmd | filter name=~^bot|^host | next_cmd
```

A leading `!` negates a condition; `!!` cancels out. `null`/missing values fail equality and relational conditions, pass `!=`, and act as empty strings for string operators. Conditions combine with AND; `--any` switches to OR, `--not` inverts the predicate, `--icase` compares case-insensitively:

```
> cmd | filter role=admin --any
> cmd | filter role=admin --not
> cmd | filter name=alice --icase
```

`-h`/`--head N` keeps the first N matching items and `-t`/`--tail N` keeps the last N; with both the result is the head slice followed by the tail slice (the whole input passes through when the slices overlap or sum to the count). The positional slice is applied on top of the filtered result and is independent of `--any`/`--not`. Omitting both flags performs no slicing.

```
> cmd | filter role=admin --head 5 | next_cmd
> cmd | filter role=admin -h 2 -t 2 | next_cmd
> cmd | filter --tail 3 | next_cmd
```

## `aggregate` - Aggregate objects

[`AggregateCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/aggregate.ts). Reduces pipeline objects to a single value or grouped rows.

```
> cmd | aggregate | next_cmd                          # count
> cmd | aggregate -m mean -a score | next_cmd         # 5.333333333333333
> cmd | aggregate --mode median --attribute score | next_cmd
```

Modes (`-m` / `--mode`): `count`, `min`, `max`, `sum`, `mean`, `median`. Without a mode it counts objects. `min`, `max`, `sum`, `mean`, `median` need an attribute (`-a` / `--attribute`), looked up per object (dot notation works) and coerced from numeric strings. `null`/missing attribute values are excluded, so `-m count -a <attr>` counts only objects with a non-null value. Over an empty value list `sum` is `0`; `min`, `max`, `mean`, `median` are `null`.

`--distinct` counts distinct values; `--round <n>` rounds `sum`, `mean`, `median`:

```
> cmd | aggregate -m count -a status --distinct | next_cmd
> cmd | aggregate -m mean -a score --round 2 | next_cmd
```

Without grouping, a single object is emitted: `{ "mean": 5.33 }`. `-g` / `--groupBy` emits one row per group, sorted by key, as an array; missing and `null` group keys collapse into one `null` group:

```
> cmd | aggregate -m sum -a score -g team | next_cmd
[
  { "team": "alpha", "sum": 14 },
  { "team": "beta",  "sum": 2 }
]
```

## `from` / `to` - File I/O for JSON/CSV

[`FromCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/from.ts) reads a JSON or CSV file (format inferred from the file extension) and submits each record as a pipeline object. [`ToCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/to.ts) writes pipeline objects back out as JSON or CSV.

```
> from data.csv | sort name | table
> from data.csv --delimiter ',' | table
> from out.json | filter role=admin
> cmd | select name,age | to out.csv --delimiter ','
```

| Format | Extension | Read | Write |
|---|---|---|---|
| JSON | `.json` | Array of objects or single object | Pretty-printed JSON array |
| CSV | `.csv` | Header row + rows | Header row (union of keys) + rows |

CSV cells are strings; cells containing the delimiter, quotes, or newlines are quoted. CSV files use the terminal's configured default delimiter (`;` by default, configurable via the `defaultDelimiter` terminal option); pass `--delimiter` with a single character (e.g. `','`) to override for a single command. A leading UTF-8 BOM is ignored for both JSON and CSV; malformed CSV (an unterminated or misquoted field) and malformed JSON throw a clear error. Unknown file extensions throw an error.

## `shortcut` - Manage persistent command shortcuts

[`ShortcutCommand`](https://github.com/johanneslatzel/terminal/blob/main/src/commands/shortcut.ts). Binds names to full command strings; typing the name alone runs the stored command. Shortcuts persist to `shortcutPath` (default `./shortcuts.json`) and load automatically on [`start()`](terminal/index.md). See [Shortcuts](terminal/shortcuts.md) for details.

| Subcommand | Description |
|---|---|
| `shortcut add <name> <command>` | Create or update a shortcut; quote commands containing flags (`shortcut add ll 'ls -la /tmp'`) |
| `shortcut save <name>` | Save the most recently executed command as a shortcut |
| `shortcut remove <name>` | Delete a shortcut from store and tree |
| `shortcut list` | Print all shortcuts as `name → command` lines |
| `shortcut show <name>` | Print the stored command string |

```
> shortcut add gs git status
Saved shortcut "gs".
> shortcut list
gs → git status
> gs
On branch main
nothing to commit, working tree clean
```

Names must not contain whitespace or shadow registered commands; re-adding an existing shortcut name updates it.

## Shadowing

Builtins cannot be removed or shadowed. Registering a command whose name or alias collides with an existing command throws `InvalidArgumentsError`:

```ts
import { Terminal, Command } from '@johannes.latzel/terminal';

class SafeExit extends Command {
    constructor() {
        super('exit', 'Exit with confirmation');
    }
    async execute(ctx, _args) {
        ctx.stdout.write('Are you sure? (y/N) ');
        // read ctx.stdin, then ctx.exit()
    }
}

const term = new Terminal();
term.register(new SafeExit()); // throws InvalidArgumentsError: "exit" conflicts with the builtin
```

---

- [Commands](commands/index.md)
