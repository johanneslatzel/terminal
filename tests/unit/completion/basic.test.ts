import { describe, it, expect } from 'vitest';
import { Completer } from '../../../src/completion/completer.js';
import { CommandTree } from '../../../src/command-tree.js';
import { Command, CommandContainer } from '../../../src/types.js';
import { z } from 'zod';
import { HelpCommand } from '../../../src/commands/help.js';
import { ExitCommand } from '../../../src/commands/exit.js';
import { ClearCommand } from '../../../src/commands/clear.js';

describe('Completer', () => {
    it('suggests root commands by prefix', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());
        tree.add(new ExitCommand());
        tree.add(new ClearCommand());

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('h');
        expect(partial).toBe('h');
        expect(matches).toEqual(['help']);
    });

    it('suggests all commands for empty partial', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());
        tree.add(new ExitCommand());

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('');
        expect(partial).toBe('');
        expect(matches).toHaveLength(2);
        expect(matches).toContain('help');
        expect(matches).toContain('exit');
    });

    it('suggests subcommands', () => {
        const tree = new CommandTree();
        const sub = new (class extends Command {
            async execute() {}
        })('set', 'Set');
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('config', 'Config');
        parent.add(sub);
        tree.add(parent);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('config ');
        expect(partial).toBe('');
        expect(matches).toEqual(['set']);
    });

    it('returns no matches for unknown prefix', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('z');
        expect(matches).toEqual([]);
        expect(partial).toBe('z');
    });

    it('handles empty line', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const completer = new Completer(tree);
        const { matches } = completer.complete('');
        expect(matches).toContain('help');
    });

    it('returns no matches for unknown top-level prefix', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const completer = new Completer(tree);
        const { matches } = completer.complete('nonexistent ');
        expect(matches).toEqual([]);
    });

    it('completes --flags when at a leaf command', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const completer = new Completer(tree);
        const { matches } = completer.complete('help ');
        expect(matches).toEqual(['--command']);
    });

    it('completes partial --flag names', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const completer = new Completer(tree);
        const { matches } = completer.complete('help --c');
        expect(matches).toEqual(['--command']);
    });

    it('returns no matches for unrecognized flag partial', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const completer = new Completer(tree);
        const { matches } = completer.complete('help --x');
        expect(matches).toEqual([]);
    });

    it('returns empty when command in prefix has no subcommands and more tokens follow', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const completer = new Completer(tree);
        const { matches } = completer.complete('help extra');
        expect(matches).toEqual([]);
    });

    it('handles line with leading whitespace', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const completer = new Completer(tree);
        const { matches } = completer.complete('  help');
        expect(matches).toContain('help');
    });

    it('partial match at subcommand level', () => {
        const tree = new CommandTree();
        const sub = new (class extends Command {
            async execute() {}
        })('set', 'Set');
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('config', 'Config');
        parent.add(sub);
        tree.add(parent);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('config s');
        expect(partial).toBe('s');
        expect(matches).toEqual(['set']);
    });

    it('case-sensitive matching', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const completer = new Completer(tree);
        const { matches } = completer.complete('H');
        expect(matches).not.toContain('help');
    });

    it('deep nesting completion', () => {
        const tree = new CommandTree();
        const leaf = new (class extends Command {
            async execute() {}
        })('leaf');
        const mid = new (class extends CommandContainer {
            async execute() {}
        })('mid');
        mid.add(leaf);
        const root = new (class extends CommandContainer {
            async execute() {}
        })('root');
        root.add(mid);
        tree.add(root);

        const completer = new Completer(tree);
        const { matches } = completer.complete('root mid ');
        expect(matches).toEqual(['leaf']);
    });

    it('unknown intermediate token returns no matches', () => {
        const tree = new CommandTree();
        const sub = new (class extends Command {
            async execute() {}
        })('set', 'Set');
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('config', 'Config');
        parent.add(sub);
        tree.add(parent);

        const completer = new Completer(tree);
        const { matches } = completer.complete('config unknown ');
        expect(matches).toEqual([]);
    });

    it('skips --flag tokens in prefix', () => {
        const tree = new CommandTree();
        const leaf = new (class extends Command {
            async execute() {}
        })('leaf');
        const root = new (class extends CommandContainer {
            async execute() {}
        })('root');
        root.add(leaf);
        tree.add(root);

        const completer = new Completer(tree);
        const { matches } = completer.complete('root --someflag ');
        expect(matches).toEqual(['leaf']);
    });

    it('returns no flag completions for leaf without definitions', () => {
        const tree = new CommandTree();
        const leaf = new (class extends Command {
            async execute() {}
        })('leaf');
        tree.add(leaf);

        const completer = new Completer(tree);
        const { matches } = completer.complete('leaf --');
        expect(matches).toEqual([]);
    });

    it('returns no flag completions for trailing space after -- at leaf with no defs', () => {
        const tree = new CommandTree();
        const leaf = new (class extends Command {
            async execute() {}
        })('leaf');
        tree.add(leaf);

        const completer = new Completer(tree);
        const { matches } = completer.complete('leaf -- ');
        expect(matches).toEqual([]);
    });

    it('includes command aliases in root completion from empty input', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('deploy', 'Deploy', [], ['d', 'dp']);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('');
        expect(matches).toContain('deploy');
        expect(matches).toContain('d');
        expect(matches).toContain('dp');
    });

    it('completes --flag aliases for commands with aliased arg defs', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('build', 'Build', [{ name: 'output', schema: z.string(), aliases: ['outfile', 'o'] }]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('build --');
        expect(matches).toContain('--output');
        expect(matches).toContain('--outfile');
    });

    it('skips -x short flag tokens in prefix', () => {
        const tree = new CommandTree();
        const sub = new (class extends Command {
            async execute() {}
        })('sub', 'Subcommand');
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('config', 'Config');
        parent.add(sub);
        tree.add(parent);

        const completer = new Completer(tree);
        const { matches } = completer.complete('config -x sub');
        expect(matches).toEqual(['sub']);
    });

    it('includes subcommand aliases in completion', () => {
        const tree = new CommandTree();
        const sub = new (class extends Command {
            async execute() {}
        })('set', 'Set', [], ['s']);
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('config', 'Config');
        parent.add(sub);
        tree.add(parent);

        const completer = new Completer(tree);
        const { matches, partial } = completer.complete('config ');
        expect(partial).toBe('');
        expect(matches).toContain('set');
        expect(matches).toContain('s');
    });

    it('excludes already-used --flags from completion', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'username', schema: z.string() },
            { name: 'password', schema: z.string() },
            { name: 'role', schema: z.string() }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create --username foo --');
        expect(matches).toEqual(['--password', '--role']);
    });

    it('excludes already-used short aliases from completion', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('create', 'Create', [
            { name: 'username', schema: z.string(), aliases: ['u'] },
            { name: 'password', schema: z.string(), aliases: ['p'] },
            { name: 'role', schema: z.string(), aliases: ['r'] }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('create -u foo --');
        expect(matches).toEqual(['--password', '--role']);
    });

    it('excludes already-used --long-alias from completion', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('build', 'Build', [
            { name: 'output', schema: z.string(), aliases: ['outfile', 'o'] }
        ]);
        tree.add(cmd);

        const completer = new Completer(tree);
        const { matches } = completer.complete('build --outfile out.txt --');
        expect(matches).toEqual([]);
    });

});
