# Terminal

The `Terminal` class creates an interactive shell; it manages the readline loop, command dispatch, lifecycle hooks, and history persistence.

- [History](history.md)
- [Shortcuts](shortcuts.md)
- [Commands](../commands/index.md)
- [Arguments](../arguments/index.md)
- [Hooks](../hooks/index.md)

## Options

| Option        | Default          | Description                                                    |
| ------------- | ---------------- | -------------------------------------------------------------- |
| `prompt`      | `"> "`           | Prompt string                                                  |
| `stdin`       | `process.stdin`  | Input stream                                                   |
| `stdout`      | `process.stdout` | Output stream                                                  |
| `historySize` | `100`            | Readline history size                                          |
| `historyPath` | `none` | Path for [persisting command history](history.md) (JSON array) |
| `shortcutPath` | `./shortcuts.json` | Path for [persisting command shortcuts](shortcuts.md) (JSON object) |
| `dropInflightKeystrokes` | `false` | When `true`, suppresses echo and discards input that arrives while a command is executing (TTY only). When `false` (default), input is queued and processed after the command finishes. |
| `silentSigint` | `false` | When `true`, suppresses the `^C` echo normally written to stdout on Ctrl+C. The current input line is still cleared and the prompt is re-displayed. |

## Lifecycle

`start()` initializes the readline interface, fires `onStart` hooks, and begins accepting input. On TTY, a byte-level Transform filter is installed between stdin and readline to remap Ctrl+Backspace to Ctrl+W for word deletion. `stop()` terminates the loop, unpipes and destroys the input filter, runs `beforeExit` / `onStop` hooks, and cleans up. `setPrompt()` changes the prompt string at runtime.

Pressing **Ctrl+C** at the command prompt clears the current input line and re-prompts. When `silentSigint` is `true`, the `^C` indicator is suppressed. During an interactive argument prompt (e.g., `args.require()`), Ctrl+C cancels the command silently.

## Concurrency

Commands never execute concurrently. How mid-execution input is handled depends on
[`dropInflightKeystrokes`](#options):

- **Default** (`false`): input is queued by an internal mutex and processed in
  order after the current command finishes. Prompts never appear mid-output.
- **When `true`** (TTY only): the input manager switches to **drop mode** during command execution, so keystrokes are neither echoed nor queued. When the command finishes, the previous input mode is restored. See [Architecture - Input management](../architecture.md#input-management) for details.
