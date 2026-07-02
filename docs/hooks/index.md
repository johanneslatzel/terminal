# Hooks

Lifecycle hooks let you intercept and transform input, cancel execution, handle errors, and clean up on exit.

## Usage

```ts
const h = term
    .hook()
    .beforeParse()
    .do((input: string) => (input === 'h' ? 'help' : input));

h.dispose(); // unregister (idempotent)
```

## Events

| Selector           | Callback                                | Purpose                                        |
| ------------------ | --------------------------------------- | ---------------------------------------------- |
| `.beforeParse()`   | `(input: string) => string`             | Transform raw input before tokenizing          |
| `.afterParse()`    | `(tokens: string[]) => string[]`        | Rewrite token list after parsing               |
| `.beforeExecute()` | `(command, ctx, args) => void \| false` | Cancel execution — return `false` to skip      |
| `.afterExecute()`  | `(result: unknown) => void`             | Post-process after command returns             |
| `.beforeExit()`    | `() => void \| Promise<void>`           | Cleanup before terminal stops                  |
| `.onError()`       | `(error: Error) => void \| boolean`     | Return `true` to suppress default error output |

Hooks execute in registration order.

## Error handling

Errors from any hook propagate to `handleError` (see [Architecture](../architecture.md#error-model)). `onError` hooks run first — the first returning `true` suppresses the error. If an `onError` callback itself throws, it's caught individually and remaining hooks still run. The terminal loop never crashes.

## `dispose()` {#dispose}

Every `.do()` returns a `Hook`. Call `.dispose()` to unregister. Safe to call multiple times.

---

[**Terminal**](../terminal/index.md) — class reference, register, start/stop  
[**Commands**](../commands/index.md) — defining commands  
[**Arguments**](../arguments/index.md) — typed accessors
