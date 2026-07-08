# Argument Definitions

## CommandArgumentDefinition

| Field         | Description                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `name`        | Argument name (without `--` prefix)                                                                 |
| `aliases`     | Alternate flag names. Single-char aliases use `-x`, multi-char use `--name`.                        |
| `schema`      | Zod schema for validation and coercion                                                              |
| `description` | Shown in `help` output                                                                              |
| `required`    | If `true` and missing, prompts interactively (when a readline is available)                         |
| `secret`      | When `true`, missing arguments prompt with hidden input (keystrokes echo as `*`)                    |
| `position`    | 0-based index for bare-token (positional) arguments. Must form a contiguous sequence starting at 0. |

See [`src/command-arguments.ts`](https://github.com/johanneslatzel/terminal/blob/main/src/command-arguments.ts) for the `CommandArgumentDefinition` interface.

## `arg()` factory {#arg}

```ts
arg('name', 'Who to greet', z.string().min(1));
// → { name: 'name', description: 'Who to greet', schema: z.string().min(1) }

arg('name', 'Your name', z.string(), undefined, ['n']);
// → { name: 'name', description: 'Your name', schema: z.string(), aliases: ['n'] }

arg('query', 'Search query', z.string(), 0);
// → { name: 'query', description: 'Search query', schema: z.string(), position: 0 }

arg('password', 'API token', z.string().min(8), undefined, undefined, true);
// → { name: 'password', description: 'API token', ..., secret: true }
//   Prompts with hidden input when missing on the command line
```

## Positional arguments

When `position` is set, the argument can be supplied as a bare token:

```
> greet Alice
```

Positions are consumed in index order. Duplicate or non-contiguous positions throw `InvalidArgumentsError` at definition time.

## Schema patterns

- **Strings** — `z.string()`. Use `.min(1)`, `.email()`, etc.
- **Numbers** — `z.coerce.number()` (coerces from string input)
- **Booleans** — `z.boolean()` (read with [`flag()`](../arguments/index.md#flag) — don't use `z.coerce.boolean()`)
- **Enums** — `z.enum(['a', 'b', 'c'])`
- **Arrays** — `z.array(z.string())`, `z.array(z.coerce.number())`. Raw input is auto-split on commas before validation (see [`require<T>()`](../arguments/index.md#require)).

See [Arguments](../arguments/index.md) for runtime reading.

---

[**Commands**](index.md) — factory functions and registration  
[**Classes**](classes.md) — explicit command subclasses  
[**Arguments**](../arguments/index.md) — `require<T>()`, `flag()`, prompting
