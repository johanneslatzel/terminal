# Command Shortcuts

Bind a short name to a full command string and run it by typing just the name. Shortcuts persist to a JSON file across sessions, appear in tab completion, and are listed by `help`.

## Setup

Shortcuts work without configuration: the builtin [`shortcut`](#managing-shortcuts) command and automatic loading are built in. Set `shortcutPath` to control where they persist (defaults to `shortcuts.json` in the current working directory):

```ts
const term = new Terminal({ shortcutPath: './myapp-shortcuts.json' });

await term.start(); // saved shortcuts load before the first prompt
```

There is no separate load call: `start()` loads persisted shortcuts automatically.

## Managing shortcuts

| Subcommand                 | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `shortcut add <name> <cmd>`  | Create or update a shortcut                    |
| `shortcut save <name>`       | Save the most recently executed command        |
| `shortcut remove <name>`     | Delete a shortcut                              |
| `shortcut list`              | Print all shortcuts                            |
| `shortcut show <name>`       | Print the command string behind a shortcut     |

Create one and run it:

```
> shortcut add gs git status
Saved shortcut "gs".
> gs
On branch main
nothing to commit, working tree clean
```

Command strings with flags or quotes should be quoted so they survive tokenization:

```
> shortcut add ll 'ls -la /tmp'
Saved shortcut "ll".
```

`save` captures whatever ran last (see [History](history.md)):

```
> npm run build
...
> shortcut save build
Saved shortcut "build".
```

Inspect and clean up:

```
> shortcut list
gs → git status
ll → ls -la /tmp

> shortcut show ll
ls -la /tmp

> shortcut remove ll
Removed shortcut "ll".
```

Shortcut names must not contain whitespace and must not shadow a registered command (`add` rejects those). Updating an existing shortcut under its own name is allowed.

## Expansion rules

- Typing **exactly** a shortcut name expands it to the stored command string before tokenization. Appending extra arguments (`gs extra`) does **not** expand: the name resolves as an ordinary command instead.
- Expansion happens before lifecycle hooks run, so `beforeParse` hooks observe the expanded text. History records the original input, not the expansion.
- Every mutation (`add`, `save`, `remove`) is persisted immediately.

## Persistence behavior

- File format is a JSON object mapping shortcut name to command string:

  ```json
  { "gs": "git status", "build": "npm run build" }
  ```

- Parent directories are created automatically; each save reflects the full current state (an emptied store persists as `{}`).
- A missing, unreadable, or invalid file starts the session with an empty store: the terminal never fails to start because of it.
- Loaded shortcuts whose name would shadow an existing (non-shortcut) command print a warning and are skipped for the session; they remain in the file and resurface once the conflict is resolved.
