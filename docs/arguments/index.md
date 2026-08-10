# Arguments

Wrapper for parsed `--name value` pairs with typed accessors, schema validation, interactive prompting, and pipeline input access.

Methods: `has()`, `require<T>()`, `requireSecret()`, `flag()`, `requirePipelineArray()`.

The value accessors (`require`, `requireSecret`, `flag`) require a matching [`CommandArgumentDefinition`](../commands/definitions.md); missing definitions throw `InvalidArgumentsError`. `has()` works without one.

## `has(name)`

Check whether an argument was provided on the command line.

## `require<T>(name)` {#require}

Validates the raw value against the argument's Zod schema and returns the parsed result:

```ts
const name = await args.require<string>('name'); // z.string()
const count = await args.require<number>('count'); // z.coerce.number()
const size = await args.require<string>('size'); // z.enum(['small', 'medium', 'large'])
```

When the argument's Zod schema is an **array type** (`z.array(...)`), the raw value is auto-split on commas before validation:

```ts
// z.array(z.string()) — input: "--fields id, name, email"
const fields = await args.require<string[]>('fields');
// → ['id', 'name', 'email']

// z.array(z.coerce.number()) — input: "--nums 1, 2, 3"
const nums = await args.require<number[]>('nums');
// → [1, 2, 3]
```

Whitespace around commas is trimmed. Empty strings between commas are dropped.

Missing required arguments prompt interactively (when a readline is available). Without a readline, throws `InvalidArgumentsError`.

Pressing **Ctrl+C** during an interactive prompt cancels the command. The `require()` call throws an `InterruptedError`, which is silently handled by the terminal — no error message is printed, just `^C`.

## `requireSecret(name)` {#requiresecret}

Like [`require`](#require), but **always prompts with hidden input** when the argument is missing, regardless of the definition's `secret` flag:

```ts
const password = await args.requireSecret('password');
```

Keystrokes echo as `*`. **Ctrl+W** / **Ctrl+Backspace** deletes the previous word (skipping trailing whitespace). Pass empty string on Ctrl+C. Falls back to a visible prompt when stdin is not a TTY.

## `flag(name)` {#flag}

CLI flag semantics — absent → `false`, `--flag` → `true`, `--flag false` → `false`:

```ts
const verbose = await args.flag('verbose');
```

Define with `z.boolean()`. **Don't use `z.coerce.boolean()`** — Zod 4's `Boolean()` turns `"false"` into `true`. The string-to-boolean coercion is handled internally.

## `requirePipelineArray()` {#requirepipelinearray}

Return all pipeline input items as an array. Only available when the command's `acceptsPipelineInput` is `Array`:

```ts
const items = await args.requirePipelineArray();
for (const item of items) {
    ctx.stdout.write(item.name + '\n');
}
```

An Array-accepting command run standalone (without a pipeline) receives `[]` from the terminal. `InvalidArgumentsError` is only thrown when no pipeline array input is available — i.e. outside Array mode (`None` or `Single`), such as when constructing `CommandArguments` directly.

## Single mode auto-mapping

When a command declares `PipelineInputAcceptance.Single`, pipeline object fields are automatically mapped to [`CommandArgumentDefinition`](../commands/definitions.md) values. CLI `--name` arguments take precedence over pipeline fields:

```ts
// Pipeline item: { name: 'Alice', role: 'admin' }
// CLI: --role user
const name = await args.require<string>('name');  // 'Alice' (from pipeline)
const role = await args.require<string>('role');   // 'user'  (CLI wins)
```

## Prompting

When a required argument is missing and a readline is available, `require<T>(name)` prompts:

```
> greet --count 2
argument [name]: Alice
```

If the argument definition has `secret: true`, the prompt uses hidden input — keystrokes echo as `*` instead of the typed character. This also applies when using [`require`](#require) on an argument defined with `secret: true`. Use [`requireSecret`](#requiresecret) to force hidden prompting regardless of the definition.

`flag()` never prompts — missing flags default to `false`.

## Errors

| Error                | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `InvalidArgumentsError` | Missing required arg (no readline), unknown arg, duplicate flag, schema validation failure, calling `requirePipelineArray()` outside Array mode |
| `InterruptedError`   | User pressed Ctrl+C during an interactive prompt — command is cancelled    |

---

- [Definitions](../commands/definitions.md)
- [Commands](../commands/index.md)
- [Hooks](../hooks/index.md)
