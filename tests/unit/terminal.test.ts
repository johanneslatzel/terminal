import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/input/parser.js';
import { CommandTree } from '../../src/command-tree.js';
import { globalHelp, commandHelp, scopedHelp, resolveCommand } from '../../src/commands/help.js';
import { Completer } from '../../src/completion/completer.js';
import { CommandNotFoundError, InvalidArgumentsError } from '../../src/errors.js';
import { Command, CommandContainer } from '../../src/types.js';
import { CommandArguments } from '../../src/command-arguments.js';
import { z } from 'zod';
import { HelpCommand } from '../../src/commands/help.js';
import { ExitCommand } from '../../src/commands/exit.js';
import { ClearCommand } from '../../src/commands/clear.js';

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe('tokenize', () => {
    it('splits on whitespace', () => {
        expect(tokenize('config set theme dark')).toEqual(['config', 'set', 'theme', 'dark']);
    });

    it('trims leading/trailing whitespace', () => {
        expect(tokenize('  hello world  ')).toEqual(['hello', 'world']);
    });

    it('returns empty array for empty input', () => {
        expect(tokenize('')).toEqual([]);
    });

    it('returns empty array for whitespace-only input', () => {
        expect(tokenize('   ')).toEqual([]);
    });

    it('handles single token', () => {
        expect(tokenize('help')).toEqual(['help']);
    });
});

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

describe('CommandNotFoundError', () => {
    it('sets message and name', () => {
        const err = new CommandNotFoundError('not found', ['foo', 'bar']);
        expect(err.message).toBe('not found');
        expect(err.name).toBe('CommandNotFoundError');
        expect(err.suggestions).toEqual(['foo', 'bar']);
        expect(err).toBeInstanceOf(Error);
    });

    it('defaults suggestions to empty array', () => {
        const err = new CommandNotFoundError('nope');
        expect(err.suggestions).toEqual([]);
    });
});

describe('InvalidArgumentsError', () => {
    it('sets message and name', () => {
        const err = new InvalidArgumentsError('bad args');
        expect(err.message).toBe('bad args');
        expect(err.name).toBe('InvalidArgumentsError');
        expect(err).toBeInstanceOf(Error);
    });
});

// ---------------------------------------------------------------------------
// CommandTree
// ---------------------------------------------------------------------------

describe('CommandTree', () => {
    it('finds a root command', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());

        const result = tree.find(['help']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('help');
        expect(result!.args).toEqual([]);
    });

    it('returns null for unknown command', () => {
        const tree = new CommandTree();
        const result = tree.find(['nonexistent']);
        expect(result).toBeNull();
    });

    it('returns null for empty tokens', () => {
        const tree = new CommandTree();
        expect(tree.find([])).toBeNull();
    });

    it('traverses subcommands', () => {
        const tree = new CommandTree();
        const sub = new (class extends Command {
            async execute() {}
        })('set', 'Set a value');
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('config', 'Configure');
        parent.add(sub);
        tree.add(parent);

        const result = tree.find(['config', 'set', 'theme', 'dark']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('set');
        expect(result!.args).toEqual(['theme', 'dark']);
    });

    it('passes remaining args to matched command', () => {
        const tree = new CommandTree();
        const cmd = new (class extends Command {
            async execute() {}
        })('echo', 'Echo args');
        tree.add(cmd);

        const result = tree.find(['echo', 'hello', 'world']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('echo');
        expect(result!.args).toEqual(['hello', 'world']);
    });

    it('finds suggestions by prefix', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());
        tree.add(new ExitCommand());
        tree.add(new ClearCommand());

        const suggestions = tree.findSuggestions('h');
        expect(suggestions).toContain('help');
        expect(suggestions).not.toContain('exit');
    });

    it('roots include all top-level commands', () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());
        tree.add(new ExitCommand());
        tree.add(new ClearCommand());

        const roots = tree.getRoots();
        expect(roots).toHaveLength(3);
        expect(roots.map((c) => c.name()).sort()).toEqual(['clear', 'exit', 'help']);
    });

    it('find returns match for empty container', () => {
        const tree = new CommandTree();
        const ns = new (class extends CommandContainer {
            async execute() {}
        })('ns');
        tree.add(ns);
        const result = tree.find(['ns']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('ns');
        expect(result!.args).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// help functions (globalHelp, commandHelp, scopedHelp)
// ---------------------------------------------------------------------------

describe('help functions', () => {
    it('formats global help', () => {
        const output = globalHelp([new HelpCommand(), new ExitCommand()]);
        expect(output).toContain('Commands:');
        expect(output).toContain('help');
        expect(output).toContain('exit');
        expect(output).toContain('Show help');
        expect(output).toContain('Exit the terminal');
    });

    it('CommandTree.execute shows global help', async () => {
        const tree = new CommandTree();
        tree.add(new HelpCommand());
        let written = '';
        const ctx = {
            stdout: {
                write: (s: string) => {
                    written += s;
                }
            }
        } as unknown as import('../../src/types.js').CommandContext;
        await tree.execute(ctx, new CommandArguments({}, null));
        expect(written).toContain('Commands:');
        expect(written).toContain('help');
    });

    it('globalHelp handles commands without description', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('bare');
        const output = globalHelp([cmd]);
        expect(output).toContain('bare');
        expect(output).not.toContain('undefined');
    });

    it('formats command help', () => {
        const output = commandHelp(new HelpCommand());
        expect(output).toContain('help');
        expect(output).toContain('Show help');
    });

    it('commandHelp shows required flag and missing description in args', () => {
        class TestCmd extends Command {
            constructor() {
                super('test', 'A test command', [
                    {
                        name: 'input',
                        description: 'Input file',
                        required: true,
                        schema: z.string()
                    },
                    { name: 'output', required: false, schema: z.string() }
                ]);
            }
            async execute() {}
        }
        const output = commandHelp(new TestCmd());
        expect(output).toContain('--input');
        expect(output).toContain('(required)');
        expect(output).toContain('Input file');
        expect(output).toContain('--output');
        expect(output).toMatch(/--output\s*$/m);
    });

    it('commandHelp handles empty container (no subcommands)', () => {
        const ns = new (class extends CommandContainer {
            async execute() {}
        })('ns');
        const output = commandHelp(ns);
        expect(output).toBe('ns');
    });

    it('commandHelp handles missing description', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('foo');
        const output = commandHelp(cmd);
        expect(output).toBe('foo');
    });

    it('formats scoped help with subcommands', () => {
        const sub = new (class extends Command {
            async execute() {}
        })('set', 'Set a value');
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('config', 'Configure');
        parent.add(sub);

        const output = commandHelp(parent);
        expect(output).toContain('config');
        expect(output).toContain('Configure');
        expect(output).toContain('Subcommands:');
        expect(output).toContain('set');
    });

    it('commandHelp handles subcommands without description', () => {
        const sub = new (class extends Command {
            async execute() {}
        })('bare');
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('parent');
        parent.add(sub);
        const output = commandHelp(parent);
        expect(output).toContain('Subcommands:');
        expect(output).toContain('bare');
        expect(output).not.toContain('undefined');
    });

    it('scopedHelp returns error for unknown path', () => {
        const output = scopedHelp([], ['unknown']);
        expect(output).toContain('Unknown command');
    });

    it('scopedHelp resolves path to empty container', () => {
        const ns = new (class extends CommandContainer {
            async execute() {}
        })('ns');
        const output = scopedHelp([ns], ['ns']);
        expect(output).toBe('ns');
    });

    it('scopedHelp resolves valid path', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('ping', 'Pong');
        const output = scopedHelp([cmd], ['ping']);
        expect(output).toContain('ping');
        expect(output).toContain('Pong');
    });

    it('scopedHelp returns unknown for intermediate node with extra tokens', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('ping', 'Pong');
        const output = scopedHelp([cmd], ['ping', 'extra']);
        expect(output).toContain('Unknown command');
    });

    it('scopedHelp resolves nested subcommand path', () => {
        const sub = new (class extends Command {
            async execute() {}
        })('set', 'Set value');
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('config', 'Config');
        parent.add(sub);
        const output = scopedHelp([parent], ['config', 'set']);
        expect(output).toContain('set');
        expect(output).toContain('Set value');
    });

    it('globalHelp handles empty commands array', () => {
        const output = globalHelp([]);
        expect(output).toContain('Commands:');
    });

    it('resolveCommand returns undefined for empty tokens', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('test');
        expect(resolveCommand([cmd], [])).toBeUndefined();
    });

    it('scopedHelp with empty path returns unknown command', () => {
        const output = scopedHelp([], []);
        expect(output).toContain('Unknown command');
    });

    it('commandHelp with argument missing description renders cleanly', () => {
        class Cmd extends Command {
            constructor() {
                super('argcmd', undefined, [{ name: 'x', schema: z.string() }]);
            }
            async execute() {}
        }
        const output = commandHelp(new Cmd());
        expect(output).toContain('--x');
        expect(output).not.toContain('undefined');
    });
});

// ---------------------------------------------------------------------------
// Completer
// ---------------------------------------------------------------------------

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
});
