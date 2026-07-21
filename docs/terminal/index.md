# Terminal

The `Terminal` class creates an interactive shell — it manages the readline loop, command dispatch, lifecycle hooks, and history persistence.

[**History**](history.md) — command history persistence  
[**Commands**](../commands/index.md) — defining commands  
[**Arguments**](../arguments/index.md) — typed accessors and prompting  
[**Hooks**](../hooks/index.md) — lifecycle event reference

## Options

| Option        | Default          | Description                                                    |
| ------------- | ---------------- | -------------------------------------------------------------- |
| `prompt`      | `"> "`           | Prompt string                                                  |
| `stdin`       | `process.stdin`  | Input stream                                                   |
| `stdout`      | `process.stdout` | Output stream                                                  |
| `historySize` | `100`            | Readline history size                                          |
| `historyPath` | —                | Path for [persisting command history](history.md) (JSON array) |
| `dropInflightKeystrokes` | `false` | When `true`, suppresses echo and discards input that arrives while a command is executing (TTY only). When `false` (default), input is queued and processed after the command finishes. |

## Lifecycle

`start()` initializes the readline interface, fires `onStart` hooks, and begins accepting input. On TTY, a byte-level Transform filter is installed between stdin and readline to remap Ctrl+Backspace to Ctrl+W for word deletion. `stop()` terminates the loop, unpipes and destroys the input filter, runs `beforeExit` / `onStop` hooks, and cleans up. `setPrompt()` changes the prompt string at runtime.

## Concurrency

Commands never execute concurrently. How mid-execution input is handled depends on
[`dropInflightKeystrokes`](#options):

- **Default** (`false`): input is queued by an internal mutex and processed in
  order after the current command finishes. Prompts never appear mid-output.
- **When `true`** (TTY only): the input manager switches to **drop mode** during command execution — stdin enters raw mode and pauses, so keystrokes are neither echoed nor queued. When the command finishes, the previous input mode is restored. See [Architecture — Input management](../architecture.md#input-management) for details.
