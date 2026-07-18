# Architecture

## Pipeline

```
input → tokenize → resolve → parse flags → execute → output → loop
```

1. **Input** — read from stdin via readline
2. **Tokenize** — split into tokens (quoted strings, escapes)
3. **Resolve** — walk command tree matching tokens to node names
4. **Parse flags** — remaining tokens → `--name value` pairs
5. **Execute** — matched command receives [`CommandArguments`](arguments/index.md) with typed accessors
6. **Output** — command writes to `ctx.stdout`
7. **Loop** — prompt again

## Input management

An internal input manager sits between readline and the rest of the system. It routes lines based on the current mode:

| Mode      | What happens                                        |
| --------- | --------------------------------------------------- |
| `command` | Lines forwarded to the REPL command handler         |
| `drop`    | Lines silently discarded, echo suppressed on TTY    |
| `accept`  | Line resolved into a one-shot promise (visible or hidden input) |

Ctrl+C during `accept` mode rejects the pending prompt with `InterruptedError` and restores the previous mode. The command is cancelled silently.

### Mode transitions

When a command finishes executing, the input manager returns to whatever mode was active before the command started. If a command calls [`args.require()`](arguments/index.md#require) or [`args.requireSecret()`](arguments/index.md#requiresecret), the manager switches to `accept` mode for the duration of the prompt, then restores the previous mode (typically `drop` during execution, or `command` outside it).

### Echo control

On TTY, the input manager controls character echoing via raw mode:

- **Visible input** (`accept` + `acceptInput`) — raw mode off, characters echoed normally
- **Hidden input** (`accept` + `acceptSecret`) — raw mode on, readline paused, input read character-by-character via [`readRawTerminal()`](https://github.com/johanneslatzel/terminal/blob/main/src/hidden-input.ts)
- **Drop** — raw mode on, stdin paused, no echo at all

On non-TTY, raw mode is unavailable. [`acceptSecret()`](arguments/index.md#requiresecret) falls back to visible input with echo disabled. Drop mode pauses the readline interface instead of toggling raw mode.

## Command tree

Commands form a hierarchy. Each node extends [`Command`](commands/classes.md); namespace nodes extend `CommandContainer`.

### Resolution

Given `["config", "set", "--theme", "dark"]`:

1. `"config"` → found, has subcommands → descend
2. `"set"` → found, leaf → stop, execute with `--theme = "dark"`

- Unknown command → [`CommandNotFoundError`](commands/index.md) with prefix-matched suggestions
- Commands with subcommands call `execute()` only when no subcommand matches
- Remaining tokens are parsed via [`parseFlags()`](https://github.com/johanneslatzel/terminal/blob/main/src/input/parser.ts)

## Tokenizer

[`tokenize()`](https://github.com/johanneslatzel/terminal/blob/main/src/input/parser.ts) splits a raw line into tokens:

- **Whitespace** — tokens separated by 1+ spaces/tabs/newlines; leading/trailing ignored
- **Quotes** — `"` and `'` produce a single token (quotes stripped). One type can appear inside the other: `"it's fine"` → `["it's fine"]`
- **Escapes** — inside quotes, `\"` → `"`, `\\` → `\`
- **Adjacent chars** — `foo"bar"` → `ParseError: Unexpected characters before quote: "foo"`
- **Empty quotes** — `""` → `[""]`
- **Unclosed quotes** — `"hello` → `ParseError: Unclosed " quote`

## Argument parsing

[`parseFlags()`](https://github.com/johanneslatzel/terminal/blob/main/src/input/parser.ts) converts unmatched tokens to `Record<string, string>`:

```
--theme dark   → { theme: "dark" }
--verbose      → { verbose: "true" }
--fields id, name → { fields: "id, name" }
```

Duplicate flags (`--name foo --name bar`) throw `InvalidArgumentsError`. Both `--long` and `-x` short forms are checked.

Bare tokens that don't match a positional definition are grouped onto the most recently written argument with a space separator. This lets `--fields id, name` produce the value `"id, name"` without quoting. Tokens with no prior argument and no positional definition still throw.

Wrapped in [`CommandArguments`](arguments/index.md) with typed accessors.

## Tab completion

The [`Completer`](https://github.com/johanneslatzel/terminal/blob/main/src/completion/completer.ts) walks the command tree for matching names. At leaf commands, completes `--flag` names and `-x` short aliases from `definitions()`.

Already-used flags are excluded from completions — if `--username` has been provided, it won't appear again in suggestions.

When a definition's schema is a Zod enum (`z.enum([...])`), completions include the valid values: `--role [admin|user|guest]`. Enum values are read from Zod's `_zod.values` internal property, which propagates through `.optional()`, `.default()`, etc.

## Error model

Errors propagate to `handleError`. Registered [`onError`](hooks/index.md#error-handling) hooks run first — any returning `true` suppresses the error. Hook throw errors are caught individually; remaining hooks still run. Unconsumed errors print `Error: <message>` to stdout. The terminal loop never crashes.

[`InterruptedError`](https://github.com/johanneslatzel/terminal/blob/main/src/errors.ts) is thrown when the user presses Ctrl+C during an interactive prompt. It is silently handled — no error output, no `onError` hooks fire.

[`ParseError`](https://github.com/johanneslatzel/terminal/blob/main/src/input/parser.ts) is thrown during tokenization for malformed input (unclosed quotes, adjacent chars).

---

[**Commands**](commands/index.md) — defining commands and arguments  
[**Arguments**](arguments/index.md) — typed accessors and prompting  
[**Hooks**](hooks/index.md) — lifecycle event reference
