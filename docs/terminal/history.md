# History Persistence

Persist command history to a JSON file so the up/down arrow keys navigate past commands across sessions.

## Setup

Set `historyPath` in `TerminalOptions`, then call `loadHistory()` before `start()` and `saveHistory()` in a lifecycle hook:

```ts
const term = new Terminal({ historyPath: './myapp-history.json' });

term.loadHistory(); // read saved history
await term.start();

term.hook()
    .onStop()
    .do(() => term.saveHistory()); // write on shutdown
```

## Behavior

- `saveHistory()` creates parent directories automatically.
- History is deduplicated (most recent occurrence wins) and trimmed to `historySize`.
- File format is a JSON array of strings, oldest first.
- An emptied history is persisted as `[]`: saving always reflects the current state, so cleared history overrides stale file contents.
