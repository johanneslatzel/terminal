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
--theme dark → { theme: "dark" }
--verbose    → { verbose: "true" }
```

Wrapped in [`CommandArguments`](arguments/index.md) with typed accessors.

## Tab completion

The [`Completer`](https://github.com/johanneslatzel/terminal/blob/main/src/completer.ts) walks the command tree for matching names. At leaf commands, completes `--flag` names from `definitions()`.

## Error model

Errors propagate to `handleError`. Registered [`onError`](hooks/index.md#error-handling) hooks run first — any returning `true` suppresses the error. Hook throw errors are caught individually; remaining hooks still run. Unconsumed errors print `Error: <message>` to stdout. The terminal loop never crashes.

[`ParseError`](https://github.com/johanneslatzel/terminal/blob/main/src/input/parser.ts) is thrown during tokenization for malformed input (unclosed quotes, adjacent chars).

---

[**Commands**](commands/index.md) — defining commands and arguments  
[**Arguments**](arguments/index.md) — typed accessors and prompting  
[**Hooks**](hooks/index.md) — lifecycle event reference
