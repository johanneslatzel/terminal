# Architecture

## Execution flow

```
input → tokenize → resolve → parse flags → execute → output → loop
```

1. **Input**: read from stdin via readline
2. **Tokenize**: split into tokens (quoted strings, escapes)
3. **Resolve**: walk command tree matching tokens to node names
4. **Parse flags**: remaining tokens → `--name value` pairs
5. **Execute**: matched command receives [`CommandArguments`](arguments/index.md) with typed accessors
6. **Output**: command writes to `ctx.stdout`
7. **Loop**: prompt again

## Input management

On TTY, a byte-level `Transform` filter sits between stdin and readline. It remaps the Ctrl+Backspace byte (`0x08`, which many terminals emit) to Ctrl+W (`0x17`), so readline performs word-level deletion instead of single-character delete. The filter is created when `Terminal` starts and torn down on `stop()`.

An internal input manager sits between readline and the rest of the system. It routes lines based on the current mode:

| Mode      | What happens                                        |
| --------- | --------------------------------------------------- |
| `command` | Lines forwarded to the REPL command handler         |
| `drop`    | Lines silently discarded, echo suppressed on TTY    |
| `accept`  | Line resolved into a one-shot promise (visible or hidden input) |

Ctrl+C during `accept` mode rejects the pending prompt with `InterruptedError` and restores the previous mode. The command is cancelled silently.

In both modes, the current input line is cleared and the cursor reset. When the [`silentSigint`](terminal/index.md#options) option is `true`, the `^C` indicator is suppressed.

### Mode transitions

When a command finishes executing, the input manager returns to whatever mode was active before the command started. If a command calls [`args.require()`](arguments/index.md#require) or [`args.requireSecret()`](arguments/index.md#requiresecret), the manager switches to `accept` mode for the duration of the prompt, then restores the previous mode (typically `drop` during execution, or `command` outside it).

### Echo control

On TTY, the input manager controls character echoing via raw mode:

- **Visible input** (`accept` + `acceptInput`): raw mode off, characters echoed normally
- **Hidden input** (`accept` + `acceptSecret`): raw mode on, readline paused, input read character-by-character via [`readRawTerminal()`](https://github.com/johanneslatzel/terminal/blob/main/src/hidden-input.ts)
- **Drop**: raw mode on, no echo; incoming lines are discarded

On non-TTY, raw mode is unavailable. [`acceptSecret()`](arguments/index.md#requiresecret) falls back to visible input with echo disabled. Drop mode discards incoming lines instead of toggling raw mode.

## Command tree

Commands form a hierarchy. Each node extends [`Command`](commands/classes.md); namespace nodes extend `CommandContainer`.

### Resolution

Given `["config", "set", "--theme", "dark"]`:

1. `"config"` → found, has subcommands → descend
2. `"set"` → found, leaf → stop, execute with `--theme = "dark"`

- Unknown command → [`CommandNotFoundError`](commands/index.md) with prefix-matched suggestions
- Commands with subcommands call `execute()` only when no subcommand matches
- Remaining tokens are parsed via [`parseFlags()`](https://github.com/johanneslatzel/terminal/blob/main/src/input/args-parser.ts)

## Tokenizer

[`tokenize()`](https://github.com/johanneslatzel/terminal/blob/main/src/input/parser.ts) splits a raw line into tokens:

- **Whitespace**: tokens separated by 1+ spaces/tabs/newlines; leading/trailing ignored
- **Pipe**: `|` is not special during tokenization; it becomes a pipeline separator only as a standalone (whitespace-delimited) token. See [Pipe operator](#pipe-operator)
- **Quotes**: `"` and `'` produce a single token (quotes stripped). One type can appear inside the other: `"it's fine"` → `["it's fine"]`
- **Escapes**: inside quotes, `\"` → `"`, `\\` → `\`
- **Adjacent chars**: `foo"bar"` → `ParseError: Unexpected characters before quote: "foo"`
- **Empty quotes**: `""` → `[""]`
- **Unclosed quotes**: `"hello` → `ParseError: Unclosed " quote`

## Argument parsing

[`parseFlags()`](https://github.com/johanneslatzel/terminal/blob/main/src/input/args-parser.ts) converts unmatched tokens to `Record<string, string>`:

```
--theme dark   → { theme: "dark" }
--verbose      → { verbose: "true" }
--fields id, name → { fields: "id, name" }
```

Duplicate flags (`--name foo --name bar`) throw `InvalidArgumentsError`. Both `--long` and `-x` short forms are checked.

Bare tokens that don't match a positional definition are grouped onto the most recently written argument with a space separator. This lets `--fields id, name` produce the value `"id, name"` without quoting. Tokens with no prior argument and no positional definition still throw.

A following short `-x` flag is treated as a boundary rather than consumed as a value, so `--distinct -m count` yields `{ distinct: "true", mode: "count" }`. When argument definitions are provided, an unknown `--name` throws `InvalidArgumentsError`.

Wrapped in [`CommandArguments`](arguments/index.md) with typed accessors.

## Pipe operator (`|`)

When the `|` character appears between command tokens, the input line is treated as a pipeline. Segments are split at `|`, resolved independently, and executed left-to-right. Each segment's structured output becomes the next segment's input.

`|` only counts as a separator when it is its own token, i.e. separated from surrounding text by whitespace. A `|` glued to other characters is literal text inside that token:

- `a | b`: pipeline, `a` then `b`
- `a|b`: single token `a|b` (literal `|`)
- `"a | b"`: single token `a | b`; quotes group whitespace but do not change `|` handling

So a regex containing `|` needs no quoting: `filter name=~bot|b` passes `bot|b` to the regex engine. Conversely, a bare standalone `|` can never be passed as a literal argument value, even quoted.

### Declaring pipeline participation

Commands opt in via two constructor arguments (or the corresponding overloads of the [`command()`](commands/index.md#command) factory):

```ts
class MyProducer extends Command {
    constructor() {
        super('produce', 'Produces items', [], undefined,
            PipelineInputAcceptance.None,    // does not accept pipe input
            true                             // provides pipe output
        );
    }
    async execute(ctx) {
        ctx.output.submit({ id: 1, name: 'Alice' });
        ctx.output.submit({ id: 2, name: 'Bob' });
    }
}

class MyConsumer extends Command {
    constructor() {
        super('consume', 'Consumes items', [], undefined,
            PipelineInputAcceptance.Array,   // receives all items at once
            false                             // does not provide output
        );
    }
    async execute(_ctx, args) {
        const items = await args.requirePipelineArray();
        for (const item of items) { /* ... */ }
    }
}
```

Using the factory:

```ts
const producer = command('produce', async (ctx) => {
    ctx.output.submit({ id: 1 });
}, { description: 'Produces items', providesPipelineOutput: true });

const consumer = command('consume', async (_ctx, args) => {
    const items = await args.requirePipelineArray();
    // ...
}, { description: 'Consumes items', acceptsPipelineInput: PipelineInputAcceptance.Array });
```

### Pipeline context

In a pipeline, `ctx.output` is set on the execution context for commands on the producing end:

| Context field     | Set when...                                                    | API                              |
|-------------------|----------------------------------------------------------------|----------------------------------|
| `ctx.output`      | Command is on the producing end (left of `\|`)                  | `.submit(object)` / `.submit(objects)` |

A command can check `ctx.output !== undefined` to determine if it can produce pipeline output.

Pipeline data is consumed through [`CommandArguments`](arguments/index.md); there is no `ctx.input`. Use `args.requirePipelineArray()` (Array mode) or auto-mapped `args.require()` (Single mode).

### PipelineInputAcceptance

| Value               | Behaviour                                                   |
| ------------------- | ----------------------------------------------------------- |
| `None`              | Does not accept piped input (cannot be on right side of `|`) |
| `Single`            | Invoked once per output item, sequentially. Pipeline object fields are auto-mapped to command arguments via `args.require()`. CLI `--name` values take precedence over pipeline fields. |
| `Array`             | Receives **all** previous output as a single `Record<string, unknown>[]` via `args.requirePipelineArray()` |

### Output capture

Commands emit structured output by calling `ctx.output.submit(object)` or `ctx.output.submit(objects)`. The terminal collects emitted objects after execution and routes them to the next segment. Only commands with `providesPipelineOutput: true` receive `ctx.output`.

Input to `submit()` is always `Record<string, unknown>` (single object) or `Record<string, unknown>[]` (array of objects).

### Validation

- Every segment except the last must have `providesPipelineOutput: true`
- Every segment after the first must have `acceptsPipelineInput !== None`
- Empty segments (`| cmd`, `cmd |`, `cmd | | cmd`) throw `InvalidArgumentsError`

### Example

```bash
# List tasks, filter by status, format as table
> task list | task filter --status done | task format --style table

# Each command declares its pipeline role:
#   task list     → providesPipelineOutput: true
#   task filter   → acceptsPipelineInput: Array, providesPipelineOutput: true
#   task format   → acceptsPipelineInput: Single
```

```ts
// Producer: emits objects via ctx.output.submit()
class TaskListCommand extends Command {
    constructor() {
        super('list', 'List tasks', [], undefined,
            PipelineInputAcceptance.None, true);
    }
    async execute(ctx: CommandContext) {
        for (const task of fetchTasks()) {
            ctx.output.submit({ id: task.id, title: task.title, status: task.status });
        }
    }
}

// Array consumer: receives all objects at once
class TaskFilterCommand extends Command {
    constructor() {
        super('filter', 'Filter tasks', [
            { name: 'status', schema: z.string() }
        ], undefined, PipelineInputAcceptance.Array, true);
    }
    async execute(ctx: CommandContext, args: CommandArguments) {
        const items = await args.requirePipelineArray();
        const status = await args.require<string>('status');
        for (const item of items) {
            if (item.status === status) ctx.output.submit(item);
        }
    }
}

// Single consumer: pipeline fields auto-mapped to declared args
class TaskFormatCommand extends Command {
    constructor() {
        super('format', 'Format tasks', [
            { name: 'title', schema: z.string() },
            { name: 'style', schema: z.enum(['table', 'json']) }
        ], undefined, PipelineInputAcceptance.Single, false);
    }
    async execute(ctx: CommandContext, args: CommandArguments) {
        const title = await args.require<string>('title');
        const style = await args.require<string>('style');
        ctx.stdout.write(formatLine(title, style));
    }
}
```

### Chaining

Three (or more) segment pipelines work as expected. Each intermediate command must both accept input and provide output. The terminal captures and forwards output at each step.

## Tab completion

The [`Completer`](https://github.com/johanneslatzel/terminal/blob/main/src/completion/completer.ts) walks the command tree for matching names. At leaf commands, completes `--flag` names and `-x` short aliases from `definitions()`.

Already-used flags are excluded from completions; if `--username` has been provided, it won't appear again in suggestions.

When a definition's schema is a Zod enum (`z.enum([...])`), the flag name completes as usual and the values complete after it: `--role ` + Tab → `admin`, `user`, `guest`; partial input is filtered (`--role a` → `admin`). Enum values are read from Zod's `_zod.values` internal property, which propagates through `.optional()`, `.default()`, etc. Short aliases work the same way (`-r a` → `admin`).

A positional (bare-token) argument with an enum schema completes its values directly: `create a` + Tab → `admin`, and partial input is filtered the same way (`create ad` → `admin`).

## Error model

Errors propagate to `handleError`. Registered [`onError`](hooks/index.md#error-handling) hooks run first; any returning `true` suppresses the error. Hook throw errors are caught individually; remaining hooks still run. Unconsumed errors print `Error: <message>` to stdout. The terminal loop never crashes.

[`InterruptedError`](https://github.com/johanneslatzel/terminal/blob/main/src/errors.ts) is thrown when the user presses Ctrl+C during an interactive prompt. It is silently handled; no error output, no `onError` hooks fire.

[`ParseError`](https://github.com/johanneslatzel/terminal/blob/main/src/input/parser.ts) is thrown during tokenization for malformed input (unclosed quotes, adjacent chars).

---

- [Commands](commands/index.md)
- [Arguments](arguments/index.md)
- [Hooks](hooks/index.md)
- [Pipe operator](architecture.md#pipe-operator)
