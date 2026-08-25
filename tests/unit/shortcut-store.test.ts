import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ShortcutStore } from '../../src/shortcut-store.js';

describe('ShortcutStore', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'repltree-shortcuts-'));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('load', () => {
        it('parses a valid JSON object into a Map', async () => {
            const filePath = join(tmpDir, 'shortcuts.json');
            writeFileSync(filePath, JSON.stringify({ gs: 'git status', ll: 'ls -la' }), 'utf-8');
            const store = new ShortcutStore();
            expect(await store.load(filePath)).toEqual(
                new Map([
                    ['gs', 'git status'],
                    ['ll', 'ls -la']
                ])
            );
        });

        it('returns an empty Map when the file does not exist', async () => {
            const store = new ShortcutStore();
            expect(await store.load(join(tmpDir, 'nope.json'))).toEqual(new Map());
        });

        it('returns an empty Map for invalid JSON', async () => {
            const filePath = join(tmpDir, 'shortcuts.json');
            writeFileSync(filePath, 'not json', 'utf-8');
            const store = new ShortcutStore();
            expect(await store.load(filePath)).toEqual(new Map());
        });

        it('returns an empty Map for a JSON array', async () => {
            const filePath = join(tmpDir, 'shortcuts.json');
            writeFileSync(filePath, JSON.stringify(['a', 'b']), 'utf-8');
            const store = new ShortcutStore();
            expect(await store.load(filePath)).toEqual(new Map());
        });

        it('returns an empty Map for JSON null', async () => {
            const filePath = join(tmpDir, 'shortcuts.json');
            writeFileSync(filePath, 'null', 'utf-8');
            const store = new ShortcutStore();
            expect(await store.load(filePath)).toEqual(new Map());
        });

        it('returns an empty Map for non-object JSON primitives', async () => {
            const filePath = join(tmpDir, 'shortcuts.json');
            writeFileSync(filePath, '42', 'utf-8');
            const store = new ShortcutStore();
            expect(await store.load(filePath)).toEqual(new Map());
        });

        it('silently skips values that are not strings', async () => {
            const filePath = join(tmpDir, 'shortcuts.json');
            writeFileSync(
                filePath,
                JSON.stringify({ ok: 'help', n: 5, obj: {}, nil: null, arr: [] }),
                'utf-8'
            );
            const store = new ShortcutStore();
            expect(await store.load(filePath)).toEqual(new Map([['ok', 'help']]));
        });
    });

    describe('save', () => {
        it('writes the Map as a JSON object with 2-space indent', async () => {
            const filePath = join(tmpDir, 'shortcuts.json');
            const store = new ShortcutStore();
            store.add('gs', 'git status');
            await store.save(filePath);
            expect(readFileSync(filePath, 'utf-8')).toBe(
                '{\n  "gs": "git status"\n}\n'
            );
        });

        it('creates parent directories', async () => {
            const nestedPath = join(tmpDir, 'a', 'b', 'c', 'shortcuts.json');
            const store = new ShortcutStore();
            store.add('ll', 'ls -la');
            await store.save(nestedPath);
            expect(JSON.parse(readFileSync(nestedPath, 'utf-8'))).toEqual({ ll: 'ls -la' });
        });

        it('persists an emptied store as {} instead of skipping the write', async () => {
            const filePath = join(tmpDir, 'shortcuts.json');
            const store = new ShortcutStore();
            await store.save(filePath);
            expect(readFileSync(filePath, 'utf-8')).toBe('{}\n');

            store.add('gs', 'git status');
            await store.save(filePath);
            store.remove('gs');
            await store.save(filePath);
            expect(JSON.parse(readFileSync(filePath, 'utf-8'))).toEqual({});
        });

        it('silently ignores write errors', async () => {
            // A file where the parent directory should be → mkdir fails
            const blocker = join(tmpDir, 'blocker');
            writeFileSync(blocker, 'not a directory', 'utf-8');
            const store = new ShortcutStore();
            await expect(store.save(join(blocker, 'shortcuts.json'))).resolves.toBeUndefined();
        });
    });

    describe('crud operations', () => {
        it('add inserts and updates', () => {
            const store = new ShortcutStore();
            store.add('gs', 'git status');
            expect(store.get('gs')).toBe('git status');
            store.add('gs', 'git status --short');
            expect(store.get('gs')).toBe('git status --short');
        });

        it('remove returns whether the entry existed', () => {
            const store = new ShortcutStore();
            store.add('gs', 'git status');
            expect(store.remove('gs')).toBe(true);
            expect(store.remove('gs')).toBe(false);
        });

        it('get returns undefined for unknown names', () => {
            const store = new ShortcutStore();
            expect(store.get('nope')).toBeUndefined();
        });

        it('has reports existence', () => {
            const store = new ShortcutStore();
            store.add('gs', 'git status');
            expect(store.has('gs')).toBe(true);
            expect(store.has('ll')).toBe(false);
        });

        it('all returns a full copy that can be mutated safely', () => {
            const store = new ShortcutStore();
            store.add('gs', 'git status');
            const snapshot = store.all();
            expect(snapshot).toEqual(new Map([['gs', 'git status']]));
            snapshot.set('hacked', 'rm -rf /');
            expect(store.has('hacked')).toBe(false);
        });

        it('names returns all shortcut names', () => {
            const store = new ShortcutStore();
            store.add('gs', 'git status');
            store.add('ll', 'ls -la');
            expect([...store.names()].sort()).toEqual(['gs', 'll']);
        });
    });

    describe('round-trip', () => {
        it('survives save → load cycles including removals', async () => {
            const filePath = join(tmpDir, 'shortcuts.json');

            const first = new ShortcutStore();
            first.add('gs', 'git status');
            first.add('ll', 'ls -la');
            first.remove('gs');
            await first.save(filePath);

            const second = new ShortcutStore();
            expect(await second.load(filePath)).toEqual(new Map([['ll', 'ls -la']]));
        });
    });
});
