import { describe, it, expect } from 'vitest';
import { Command, CommandContainer } from '../../src/types.js';
import { CommandTree } from '../../src/command-tree.js';

function makeCommand(name: string, aliases?: string[]): Command {
    return new (class extends Command {
        execute(): void {}
    })(name, undefined, undefined, aliases);
}

describe('CommandContainer.remove', () => {
    it('removes a child command by name and returns true', () => {
        const container = new CommandContainer('parent');
        const child = makeCommand('child');
        container.add(child);

        expect(container.remove('child')).toBe(true);
        expect(container.commands()).not.toContain(child);
    });

    it('returns false when no command with that name exists', () => {
        const container = new CommandContainer('parent');
        container.add(makeCommand('child'));

        expect(container.remove('nope')).toBe(false);
        expect(container.commands()).toHaveLength(1);
    });

    it('returns false when removing the same name twice', () => {
        const container = new CommandContainer('parent');
        container.add(makeCommand('child'));

        expect(container.remove('child')).toBe(true);
        expect(container.remove('child')).toBe(false);
    });

    it('matches command names only — not aliases', () => {
        const container = new CommandContainer('parent');
        const child = makeCommand('status', ['st']);
        container.add(child);

        expect(container.remove('st')).toBe(false);
        expect(container.remove('status')).toBe(true);
        expect(container.commands()).toHaveLength(0);
    });

    it('allows re-adding a removed command', () => {
        const container = new CommandContainer('parent');
        const child = makeCommand('child');
        container.add(child);
        container.remove('child');

        container.add(child);
        expect(container.commands()).toContain(child);
    });

    it('returns false on an empty container', () => {
        const container = new CommandContainer('parent');
        expect(container.remove('anything')).toBe(false);
    });
});

describe('CommandTree.remove', () => {
    it('delegates to CommandContainer.remove at the root level', () => {
        const tree = new CommandTree();
        tree.add(makeCommand('mycmd'));

        expect(tree.remove('mycmd')).toBe(true);
        expect(tree.find(['mycmd'])).toBeNull();
        expect(tree.remove('mycmd')).toBe(false);
    });
});
