import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Owns the command history: loads/saves from disk and records lines
 * in memory with most-recent-first deduplication, trimmed to a fixed size.
 *
 * @internal
 */
export class HistoryStore {
    private items: string[] = [];

    /**
     * @param size - Maximum number of entries to keep.
     */
    constructor(private readonly size: number) {}

    /** Snapshot of the current history entries (oldest-first). */
    get entries(): string[] {
        return [...this.items];
    }

    /**
     * Read the history file (JSON array of strings), deduplicate (keep the
     * most recent occurrence of each entry), trim to `size`, and store the
     * result internally. Returns the parsed (deduplicated, trimmed) array.
     *
     * @param path - Location of the history file. `undefined` clears history.
     * @returns The deduplicated, trimmed entries (oldest-first).
     */
    async load(path?: string): Promise<string[]> {
        if (!path) {
            this.items = [];
            return [];
        }
        try {
            const raw = await readFile(path, 'utf-8');
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                this.items = [];
                return [];
            }

            // Deduplicate: iterate newest-first, keep first occurrence
            const seen = new Set<string>();
            const deduped: string[] = [];
            for (let i = parsed.length - 1; i >= 0; i--) {
                const item = String(parsed[i]);
                if (!seen.has(item)) {
                    seen.add(item);
                    deduped.push(item);
                }
            }
            deduped.reverse(); // back to oldest-first order

            const trimmed = deduped.slice(-this.size);
            this.items = trimmed;
            return trimmed;
        } catch {
            this.items = [];
            return [];
        }
    }

    /**
     * Write the current history to the file as a JSON array, trimmed to
     * `size`. No-op if empty.
     *
     * @param path - Location of the history file. `undefined` is a no-op.
     */
    async save(path?: string): Promise<void> {
        if (!path) return;
        if (this.items.length === 0) return;
        const trimmed = this.items.slice(-this.size);
        try {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, JSON.stringify(trimmed, null, 2) + '\n', 'utf-8');
        } catch {
            // Silently ignore — file-write errors should not crash the terminal.
        }
    }

    /**
     * Record a line of input: skips empty lines and consecutive duplicates,
     * removes earlier occurrences (MRU ordering), and trims to `size`.
     *
     * @param input - The line to record.
     */
    record(input: string): void {
        if (input.length > 0 && input !== this.items.at(-1)) {
            const idx = this.items.indexOf(input);
            if (idx !== -1) this.items.splice(idx, 1);
            this.items.push(input);
            if (this.items.length > this.size) {
                this.items = this.items.slice(-this.size);
            }
        }
    }
}
