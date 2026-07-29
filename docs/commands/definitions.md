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

## Enum completion hints

When an argument's schema is a Zod enum (`z.enum([...])`), tab-completion automatically
appends `[val1|val2|val3]` to the flag suggestion:

```
> create --role [admin|user|guest]
```

This works with enums wrapped in `.optional()`, `.default()`, `.pipe()`, etc.

After typing `--flag ` (with trailing space), the completer switches to completing
individual enum values instead of flag names. Partial input is filtered:

```
> create --role    # Tab → admin  user  guest
> create --role a  # Tab → admin
```

This also works with short aliases (`-r a` → `admin`).

```ts
arg('role', 'User role', z.enum(['admin', 'user', 'guest']));
// --role    → admin | user | guest
// --role a  → admin
// --        → --role [admin|user|guest]
```

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

arg('role', 'User role', z.enum(['admin', 'user', 'guest']));
// → { name: 'role', description: 'User role', schema: z.enum(['admin', 'user', 'guest']) }
// --role [admin|user|guest]  (flag hint)
// --role admin               (value completion)
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
- **Booleans** — `z.boolean()` (read with [`flag()`](../arguments/index.md#flag))
- **Enums** — `z.enum(['a', 'b', 'c'])`
- **Arrays** — `z.array(z.string())`, `z.array(z.coerce.number())`. Raw input is auto-split on commas before validation (see [`require<T>()`](../arguments/index.md#require)).

---

[**Commands**](index.md) — factory functions and registration  
[**Classes**](classes.md) — explicit command subclasses  
[**Arguments**](../arguments/index.md) — `require<T>()`, `flag()`, prompting
