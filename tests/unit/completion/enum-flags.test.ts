import { describe, it, expect } from 'vitest';
import { Completer } from '../../../src/completion/completer.js';
import { CommandTree } from '../../../src/command-tree.js';
import { Command } from '../../../src/types.js';
import { z } from 'zod';

describe('Completer', () => {
    it('completes an enum flag to the bare flag name without the value hint', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user', 'guest']) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('completes a partial enum flag name to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user', 'guest']) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --ro');
        expect(matches).toEqual(['--role']);
    });

    it('does not show enum hints for non-enum schemas', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'username', schema: z.string() }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--username']);
    });

    it('completes an enum short alias to the bare alias', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']), aliases: ['r'] }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create -');
        expect(matches).toContain('-r');
    });

    it('completes a wrapped enum flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']).optional() }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('completes a nullable enum flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']).nullable() }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('completes a default enum flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']).default('user') }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('completes a catch enum flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']).catch('user') }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('completes a piped enum flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']).pipe(z.string() as any) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('completes a branded enum flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']).brand('Role') }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('completes a nativeEnum string flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'color', schema: z.enum({ Red: 'red', Green: 'green', Blue: 'blue' } as Record<string, string>) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--color']);
    });

    it('does not show enum hints for nativeEnum with number values', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'level', schema: z.enum({ Low: 0, Medium: 1, High: 2 } as Record<string, number>) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--level']);
    });

    it('completes a literal string flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'mode', schema: z.literal('strict') }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--mode']);
    });

    it('does not show enum hints for literal number schema', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'code', schema: z.literal(42) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--code']);
    });

    it('completes a prefault enum flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']).prefault('user') }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('completes a chained wrapped enum flag to the bare flag name', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']).optional().nullable().default('user') }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('completes multiple enum args to bare flag names', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']) },
            { name: 'color', schema: z.enum(['red', 'blue']) },
            { name: 'username', schema: z.string() }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toContain('--role');
        expect(matches).toContain('--color');
        expect(matches).toContain('--username');
    });

    it('does not show enum hints for empty enum', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum([] as unknown as [string, ...string[]]) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --');
        expect(matches).toEqual(['--role']);
    });

    it('does not suggest values for nativeEnum with number values after the flag', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'level', schema: z.enum({ Low: 0, Medium: 1, High: 2 } as Record<string, number>) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --level ');
        expect(matches).toEqual([]);
    });

    it('completes enum values after --flag with trailing space', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user', 'guest']) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('create --role ');
        expect(partial).toBe('');
        expect(matches).toEqual(['admin', 'user', 'guest']);
    });

    it('completes partial enum values after --flag', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user', 'guest']) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('create --role a');
        expect(partial).toBe('a');
        expect(matches).toEqual(['admin']);
    });

    it('completes enum values after short alias with trailing space', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']), aliases: ['r'] }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('create -r ');
        expect(partial).toBe('');
        expect(matches).toEqual(['admin', 'user']);
    });

    it('completes partial enum values after short alias', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.enum(['admin', 'user']), aliases: ['r'] }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('create -r a');
        expect(partial).toBe('a');
        expect(matches).toEqual(['admin']);
    });

    it('completes a non-enum flag with trailing space', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'username', schema: z.string() },
            { name: 'role', schema: z.enum(['admin', 'user']) }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --username ');
        expect(matches).toEqual(['--role']);
    });

    it('excludes flag used via long alias from prefix', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.string(), aliases: ['r'] }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --r admin --');
        expect(matches).toEqual([]);
    });

    it('excludes flag used via short alias from prefix', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'role', schema: z.string(), aliases: ['r'] }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create -r admin --');
        expect(matches).toEqual([]);
    });

    it('skips value token after recognized flag in prefix', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'username', schema: z.string() },
            { name: 'password', schema: z.string() }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --username Alice --password secret --');
        expect(matches).toEqual([]);
    });

    it('skips unknown --flag in prefix when collecting used flags', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'username', schema: z.string() }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --unknown foo --');
        expect(matches).toEqual(['--username']);
    });

    it('skips unknown -x in prefix when collecting used flags', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'username', schema: z.string() }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create -z foo --');
        expect(matches).toEqual(['--username']);
    });

    it('does not skip next token when flag is last in prefix', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'username', schema: z.string() },
            { name: 'role', schema: z.string() }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --username --');
        expect(matches).toEqual(['--role']);
    });

    // -------------------------------------------------------------------
    // enum flag completion
});
