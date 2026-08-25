import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Owns the persistent command shortcuts: loads/saves a JSON object file
 * mapping shortcut names to command strings, and provides simple
 * in-memory CRUD operations on that mapping.
 *
 * The file format is a plain JSON object:
 * `{ "name": "command string", ... }`
 *
 * @internal
 */
export class ShortcutStore {
    private map = new Map<string, string>();

    /**
     * Read the shortcuts file (JSON object of name → command string) and
     * return it as a Map. Values that are not strings are silently skipped.
     * Any read or parse error results in an empty Map.
     *
     * @param path - Location of the shortcuts file.
     * @returns The parsed shortcuts.
     */
    async load(path: string): Promise<Map<string, string>> {
        try {
            const raw = await readFile(path, 'utf-8');
            const parsed: unknown = JSON.parse(raw);
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                this.map = new Map();
                return this.map;
            }
            this.map = new Map();
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === 'string') {
                    this.map.set(key, value);
                }
            }
            return this.map;
        } catch {
            this.map = new Map();
            return this.map;
        }
    }

    /**
     * Write the current shortcuts to the file as a JSON object with
     * 2-space indentation. Creates parent directories as needed. An
     * emptied store is persisted as `{}` — the write is never skipped,
     * so removing the last shortcut survives reloads. Write errors are
     * silently ignored so they cannot crash the terminal.
     *
     * @param path - Location of the shortcuts file.
     */
    async save(path: string): Promise<void> {
        const object: Record<string, string> = {};
        for (const [key, value] of this.map) {
            object[key] = value;
        }
        try {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, JSON.stringify(object, null, 2) + '\n', 'utf-8');
        } catch {
            // Silently ignore — file-write errors should not crash the terminal.
        }
    }

    /** Insert or update a shortcut. */
    add(name: string, command: string): void {
        this.map.set(name, command);
    }

    /**
     * Delete a shortcut.
     * @returns `true` when an entry existed and was removed.
     */
    remove(name: string): boolean {
        return this.map.delete(name);
    }

    /** Returns the command string for a shortcut, or `undefined`. */
    get(name: string): string | undefined {
        return this.map.get(name);
    }

    /** Check whether a shortcut exists. */
    has(name: string): boolean {
        return this.map.has(name);
    }

    /** Snapshot of all shortcuts (a copy — safe to mutate). */
    all(): Map<string, string> {
        return new Map(this.map);
    }

    /** All shortcut names. */
    names(): string[] {
        return [...this.map.keys()];
    }
}
