# Argument Definitions

## CommandArgumentDefinition

| Field         | Description                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `name`        | Argument name (without `--` prefix)                                                                 |
| `schema`      | Zod schema for validation and coercion                                                              |
| `description` | Shown in `help` output                                                                              |
| `required`    | If `true` and missing, prompts interactively (when a readline is available)                         |
| `position`    | 0-based index for bare-token (positional) arguments. Must form a contiguous sequence starting at 0. |

See [`src/command-arguments.ts`](https://github.com/johanneslatzel/terminal/blob/main/src/command-arguments.ts) for the `CommandArgumentDefinition` interface.

## `arg()` factory {#arg}

```ts
arg('name', 'Who to greet', z.string().min(1));
// → { name: 'name', description: 'Who to greet', schema: z.string().min(1) }

arg('query', 'Search query', z.string(), 0);
// → { name: 'query', description: 'Search query', schema: z.string(), position: 0 }
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

See [Arguments](../arguments/index.md) for runtime reading.

---

[**Commands**](index.md) — factory functions and registration  
[**Classes**](classes.md) — explicit command subclasses  
[**Arguments**](../arguments/index.md) — `require<T>()`, `flag()`, prompting
