import { describe, it, expect } from 'vitest';
import { Completer } from '../../../src/completion/completer.js';
import { CommandTree } from '../../../src/command-tree.js';
import { Command, CommandContainer } from '../../../src/types.js';
import { z } from 'zod';

describe('Completer', () => {
    it('completes enum values for a position-0 arg with trailing space', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user', 'guest']), position: 0 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('create ');
        expect(partial).toBe('');
        expect(matches).toEqual(['admin', 'user', 'guest']);
    });

    it('completes a partial enum value for a position-0 arg', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user', 'guest']), position: 0 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('create a');
        expect(partial).toBe('a');
        expect(matches).toEqual(['admin']);
    });

    it('advances to the next positional slot once one value is given', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']), position: 0 },
            { name: 'status', schema: z.enum(['active', 'done']), position: 1 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('create admin ');
        expect(partial).toBe('');
        expect(matches).toEqual(['active', 'done']);
    });

    it('completes a later positional slot after a non-enum slot', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'name', schema: z.string(), position: 0 },
            { name: 'status', schema: z.enum(['active', 'done']), position: 1 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('create foo a');
        expect(partial).toBe('a');
        expect(matches).toEqual(['active']);
    });

    it('does not count flag values as positional tokens', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'name', schema: z.string() },
            { name: 'role', schema: z.enum(['admin', 'user']), position: 0 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --name alice a');
        expect(matches).toEqual(['admin']);
    });

    it('does not count short alias flag values as positional tokens', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'name', schema: z.string(), aliases: ['n'] },
            { name: 'role', schema: z.enum(['admin', 'user']), position: 0 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create -n alice a');
        expect(matches).toEqual(['admin']);
    });

    it('skips command tokens of nested containers when counting positions', () => {
        const tree = new CommandTree();
        const dir = new (class extends Command {
            async execute() {}
        })('dir', 'Dir', [
            { name: 'mode', schema: z.enum(['read', 'write']), position: 0 }
        ]);
        const set = new (class extends CommandContainer {
            constructor() {
                super('set', 'Set');
                this.add(dir);
            }
        })();
        const skill = new (class extends CommandContainer {
            constructor() {
                super('skill', 'Skill');
                this.add(set);
            }
        })();
        tree.add(skill);

        const completer = new Completer(tree);
        const { matches } = completer.complete('skill set dir w');
        expect(matches).toEqual(['write']);
    });

    it('suggests flag names when the positional slot is a non-enum string', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('set', 'Set', [
            { name: 'value', schema: z.string(), position: 0 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('set ');
        expect(matches).toEqual(['--value']);
    });

    it('returns no matches for a non-enum positional partial', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('set', 'Set', [
            { name: 'value', schema: z.string(), position: 0 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('set x');
        expect(matches).toEqual([]);
    });

    it('completes a wrapped enum positional arg', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']).optional(), position: 0 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create a');
        expect(matches).toEqual(['admin']);
    });

    it('falls back to flag names for an empty positional enum', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum([] as unknown as [string, ...string[]]), position: 0 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create ');
        expect(matches).toEqual(['--role']);
    });

    it('still completes enum values after --flag over positional completion', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']), position: 0 }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --role ');
        expect(matches).toEqual(['admin', 'user']);
    });
});
