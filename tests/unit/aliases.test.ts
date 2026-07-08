import { describe, it, expect, vi } from 'vitest';
import { command, container, arg } from '../../src/command-factory.js';
import { Command } from '../../src/types.js';
import { CommandTree } from '../../src/command-tree.js';
import { parseFlags } from '../../src/input/args-parser.js';
import { globalHelp, commandHelp, resolveCommand } from '../../src/commands/help.js';
import { InvalidArgumentsError } from '../../src/errors.js';
import { validateAliases, validateArgDefAliases, OwnerType } from '../../src/validate-aliases.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Command aliases
// ---------------------------------------------------------------------------

describe('command aliases', () => {
    it('creates a command with aliases via factory', () => {
        const cmd = command('help', 'Show help', [], vi.fn(), ['h', '?']);
        expect(cmd.name()).toBe('help');
        expect(cmd.aliases()).toEqual(['h', '?']);
    });

    it('creates a command without aliases', () => {
        const cmd = command('greet', '', [], vi.fn());
        expect(cmd.aliases()).toEqual([]);
    });

    it('creates a command with aliases via subclass', () => {
        class MyCmd extends Command {
            constructor() {
                super('deploy', 'Deploy the app', [], ['d']);
            }
            async execute() {}
        }
        const cmd = new MyCmd();
        expect(cmd.name()).toBe('deploy');
        expect(cmd.aliases()).toEqual(['d']);
    });

    it('rejects empty alias', () => {
        expect(() => command('x', '', [], vi.fn(), [''])).toThrow(InvalidArgumentsError);
        expect(() => command('x', '', [], vi.fn(), [''])).toThrow('alias cannot be empty');
    });

    it('rejects alias with whitespace', () => {
        expect(() => command('x', '', [], vi.fn(), ['bad alias'])).toThrow(InvalidArgumentsError);
        expect(() => command('x', '', [], vi.fn(), ['bad alias'])).toThrow('whitespace');
    });

    it('matches on canonical name', () => {
        const cmd = command('help', '', [], vi.fn(), ['h']);
        expect(cmd.matches('help')).toBe(true);
        expect(cmd.matches('h')).toBe(true);
        expect(cmd.matches('other')).toBe(false);
    });

    it('creates container with aliases', () => {
        const ns = container('config', 'Config', [], ['cfg']);
        expect(ns.name()).toBe('config');
        expect(ns.aliases()).toEqual(['cfg']);
        expect(ns.matches('config')).toBe(true);
        expect(ns.matches('cfg')).toBe(true);
    });

    it('accepts valid aliases', () => {
        expect(() => command('valid', '', [], vi.fn(), ['v', 'V'])).not.toThrow();
    });

    it('rejects duplicate alias in same command', () => {
        expect(() => command('x', '', [], vi.fn(), ['a', 'a'])).toThrow(InvalidArgumentsError);
        expect(() => command('x', '', [], vi.fn(), ['a', 'a'])).toThrow('Duplicate alias');
    });

    it('rejects alias matching own name', () => {
        expect(() => command('help', '', [], vi.fn(), ['help'])).toThrow(InvalidArgumentsError);
        expect(() => command('help', '', [], vi.fn(), ['help'])).toThrow('redundant');
    });
});

describe('CommandTree with aliases', () => {
    it('finds command by alias', () => {
        const tree = new CommandTree();
        tree.add(command('help', '', [], vi.fn(), ['h', '?']));
        const result = tree.find(['h']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('help');
    });

    it('finds nested command by alias', () => {
        const tree = new CommandTree();
        const sub = command('start', '', [], vi.fn(), ['s']);
        const ns = container('server', '', [sub], ['srv']);
        tree.add(ns);
        const result = tree.find(['srv', 's']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('start');
    });

    it('returns null for unknown alias', () => {
        const tree = new CommandTree();
        tree.add(command('help', '', [], vi.fn(), ['h']));
        expect(tree.find(['unknown'])).toBeNull();
    });

    it('suggests aliases in findSuggestions', () => {
        const tree = new CommandTree();
        tree.add(command('help', '', [], vi.fn(), ['h', '?']));
        tree.add(command('history', '', [], vi.fn(), ['hist']));
        const suggestions = tree.findSuggestions('h');
        expect(suggestions).toContain('h');
        expect(suggestions).toContain('hist');
        expect(suggestions).not.toContain('?');
    });

    it('rejects duplicate alias across sibling commands', () => {
        const tree = new CommandTree();
        tree.add(command('help', '', [], vi.fn(), ['h']));
        expect(() => tree.add(command('history', '', [], vi.fn(), ['h']))).toThrow(
            InvalidArgumentsError
        );
        expect(() => tree.add(command('history', '', [], vi.fn(), ['h']))).toThrow('conflicts');
    });

    it('rejects alias colliding with sibling canonical name', () => {
        const tree = new CommandTree();
        tree.add(command('greet', '', [], vi.fn()));
        expect(() => tree.add(command('sayhi', '', [], vi.fn(), ['greet']))).toThrow(
            InvalidArgumentsError
        );
        expect(() => tree.add(command('sayhi', '', [], vi.fn(), ['greet']))).toThrow('conflicts');
    });
});

// ---------------------------------------------------------------------------
// Argument aliases
// ---------------------------------------------------------------------------

describe('argument aliases', () => {
    it('creates arg def with aliases via factory', () => {
        const def = arg('name', 'Your name', z.string(), undefined, ['n']);
        expect(def.name).toBe('name');
        expect(def.aliases).toEqual(['n']);
    });

    it('arg factory omits aliases when not provided', () => {
        const def = arg('name', '', z.string());
        expect(def.aliases).toBeUndefined();
    });

    it('rejects empty arg alias', () => {
        expect(() => arg('x', '', z.string(), undefined, [''])).toThrow(InvalidArgumentsError);
        expect(() => arg('x', '', z.string(), undefined, [''])).toThrow('alias cannot be empty');
    });

    it('rejects arg alias with whitespace', () => {
        expect(() => arg('x', '', z.string(), undefined, ['bad alias'])).toThrow(
            InvalidArgumentsError
        );
        expect(() => arg('x', '', z.string(), undefined, ['bad alias'])).toThrow('whitespace');
    });

    it('rejects duplicate arg alias in same definition', () => {
        expect(() => arg('x', '', z.string(), undefined, ['a', 'a'])).toThrow(
            InvalidArgumentsError
        );
        expect(() => arg('x', '', z.string(), undefined, ['a', 'a'])).toThrow('Duplicate');
    });

    it('rejects arg alias matching own name', () => {
        expect(() => arg('name', '', z.string(), undefined, ['name'])).toThrow(
            InvalidArgumentsError
        );
        expect(() => arg('name', '', z.string(), undefined, ['name'])).toThrow('redundant');
    });

    it('rejects arg alias colliding with another arg canonical name', () => {
        expect(
            () =>
                new (class extends Command {
                    constructor() {
                        super('test', '', [
                            arg('name', '', z.string(), undefined, ['n']),
                            arg('n', '', z.string())
                        ]);
                    }
                    async execute() {}
                })()
        ).toThrow(InvalidArgumentsError);
        expect(
            () =>
                new (class extends Command {
                    constructor() {
                        super('test', '', [
                            arg('name', '', z.string(), undefined, ['n']),
                            arg('n', '', z.string())
                        ]);
                    }
                    async execute() {}
                })()
        ).toThrow('Duplicate alias');
    });

    it('rejects duplicate alias across different arg definitions', () => {
        expect(
            () =>
                new (class extends Command {
                    constructor() {
                        super('test', '', [
                            arg('a', '', z.string(), undefined, ['x']),
                            arg('b', '', z.string(), undefined, ['x'])
                        ]);
                    }
                    async execute() {}
                })()
        ).toThrow(InvalidArgumentsError);
    });
});

// ---------------------------------------------------------------------------
// validateAliases edge cases (direct unit tests)
// ---------------------------------------------------------------------------

describe('validateAliases edge cases', () => {
    it('handles undefined aliases', () => {
        expect(() => validateAliases(undefined, OwnerType.Command, 'test')).not.toThrow();
    });

    it('handles empty array', () => {
        expect(() => validateAliases([], OwnerType.Command, 'test')).not.toThrow();
    });

    it('rejects tab character in alias', () => {
        expect(() => validateAliases(['bad\talias'], OwnerType.Command, 'test')).toThrow('whitespace');
    });

    it('rejects newline in alias', () => {
        expect(() => validateAliases(['bad\nalias'], OwnerType.Command, 'test')).toThrow('whitespace');
    });

    it('rejects whitespace-only alias', () => {
        expect(() => validateAliases(['   '], OwnerType.Command, 'test')).toThrow('whitespace');
    });

    it('throws first error when multiple aliases are invalid', () => {
        expect(() => validateAliases(['', 'bad alias'], OwnerType.Command, 'test')).toThrow('cannot be empty');
        expect(() => validateAliases(['bad alias', 'a', 'a'], OwnerType.Command, 'test')).toThrow('whitespace');
    });

    it('accepts aliases with special characters', () => {
        expect(() => validateAliases(['my-alias', 'my_alias', 'my.alias'], OwnerType.Command, 'test')).not.toThrow();
    });

    it('rejects alias colliding with reserved name', () => {
        const reserved = new Set(['existing']);
        expect(() => validateAliases(['existing'], OwnerType.Argument, 'cmd', reserved)).toThrow('Duplicate alias');
    });

    it('accepts valid aliases with reserved names present', () => {
        const reserved = new Set(['a', 'b']);
        expect(() => validateAliases(['c', 'd'], OwnerType.Argument, 'cmd', reserved)).not.toThrow();
    });

    it('skips self-redundancy check when reserved is provided', () => {
        const reserved = new Set(['a']);
        expect(() => validateAliases(['x'], OwnerType.Argument, 'cmd', reserved)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// validateArgDefAliases edge cases (direct unit tests)
// ---------------------------------------------------------------------------

describe('validateArgDefAliases edge cases', () => {
    it('handles empty defs list', () => {
        expect(() => validateArgDefAliases([], 'cmd')).not.toThrow();
    });

    it('handles defs with no aliases', () => {
        expect(() => validateArgDefAliases([
            { name: 'a', schema: z.string() },
            { name: 'b', schema: z.string() }
        ], 'cmd')).not.toThrow();
    });

    it('rejects three-way duplicate alias', () => {
        expect(() => validateArgDefAliases([
            arg('x', '', z.string(), undefined, ['dup']),
            arg('y', '', z.string(), undefined, ['dup']),
            arg('z', '', z.string(), undefined, ['dup'])
        ], 'cmd')).toThrow('Duplicate alias');
    });

    it('rejects alias colliding with positional arg canonical name', () => {
        expect(() => validateArgDefAliases([
            arg('name', '', z.string(), 0, ['n']),
            arg('n', '', z.string(), 1)
        ], 'cmd')).toThrow('Duplicate alias');
    });

    it('rejects when alias matches reserved name across multiple defs', () => {
        expect(() => validateArgDefAliases([
            arg('x', '', z.string(), undefined, ['a']),
            arg('a', '', z.string(), undefined, ['x']),
            arg('b', '', z.string(), undefined, ['x'])
        ], 'cmd')).toThrow('Duplicate alias');
    });

    it('accepts defs where alias happens to match command name', () => {
        expect(() => validateArgDefAliases([
            arg('config', '', z.string(), undefined, ['cfg'])
        ], 'cfg')).not.toThrow();
    });
});

describe('parseFlags with arg aliases', () => {
    const defs = [
        arg('name', 'Your name', z.string(), undefined, ['n']),
        arg('verbose', 'Verbose output', z.boolean(), undefined, ['v']),
        arg('output', 'Output file', z.string(), undefined, ['outfile', 'o'])
    ];

    it('resolves --alias to canonical name', () => {
        expect(parseFlags(['--n', 'Alice'], defs)).toEqual({ name: 'Alice' });
    });

    it('resolves -x short flag to canonical name', () => {
        expect(parseFlags(['-n', 'Bob'], defs)).toEqual({ name: 'Bob' });
    });

    it('resolves multi-char --alias to canonical name', () => {
        expect(parseFlags(['--outfile', 'result.txt'], defs)).toEqual({ output: 'result.txt' });
    });

    it('treats bare -x as boolean true', () => {
        expect(parseFlags(['-v'], defs)).toEqual({ verbose: 'true' });
    });

    it('resolves -o with value', () => {
        expect(parseFlags(['-o', 'log.txt'], defs)).toEqual({ output: 'log.txt' });
    });

    it('keeps canonical --name working', () => {
        expect(parseFlags(['--name', 'Charlie'], defs)).toEqual({ name: 'Charlie' });
    });

    it('handles mixed aliases and canonical names', () => {
        expect(parseFlags(['-n', 'Alice', '--verbose'], defs)).toEqual({
            name: 'Alice',
            verbose: 'true'
        });
    });

    it('does not treat -digit as short flag', () => {
        const posDefs = [arg('count', '', z.number(), 0)];
        expect(parseFlags(['-1'], posDefs)).toEqual({ count: '-1' });
    });

    it('throws for unknown short flag', () => {
        expect(() => parseFlags(['-x'], defs)).toThrow(InvalidArgumentsError);
    });

    it('resolves alias when no argDefs provided (stores literal)', () => {
        expect(parseFlags(['--n', 'value'], undefined)).toEqual({ n: 'value' });
    });

    it('works alongside positional args', () => {
        const mixedDefs = [
            arg('query', '', z.string(), 0),
            arg('limit', '', z.number(), undefined, ['l'])
        ];
        expect(parseFlags(['hello', '-l', '10'], mixedDefs)).toEqual({
            query: 'hello',
            limit: '10'
        });
    });
});

// ---------------------------------------------------------------------------
// Help output
// ---------------------------------------------------------------------------

describe('help output with aliases', () => {
    it('shows command aliases in global help', () => {
        const cmds = [
            command('help', 'Show help', [], vi.fn(), ['h', '?']),
            command('exit', 'Exit the shell', [], vi.fn(), ['quit', 'q'])
        ];
        const output = globalHelp(cmds);
        expect(output).toContain('help (h, ?)');
        expect(output).toContain('exit (quit, q)');
    });

    it('shows command aliases in command help', () => {
        const cmd = command('deploy', 'Deploy the app', [], vi.fn(), ['d']);
        const output = commandHelp(cmd);
        expect(output).toContain('deploy (d)');
    });

    it('shows arg aliases in command help', () => {
        const cmd = command(
            'greet',
            'Greets',
            [
                arg('name', 'Your name', z.string(), undefined, ['n']),
                arg('verbose', 'Verbose', z.boolean(), undefined, ['v'])
            ],
            vi.fn()
        );
        const output = commandHelp(cmd);
        expect(output).toContain('(-n)');
        expect(output).toContain('(-v)');
    });

    it('shows multi-char arg alias with -- prefix', () => {
        const cmd = command(
            'build',
            'Build',
            [arg('output', 'Output', z.string(), undefined, ['outfile'])],
            vi.fn()
        );
        const output = commandHelp(cmd);
        expect(output).toContain('--output (--outfile)');
    });

    it('shows subcommand aliases in container help', () => {
        const sub = command('start', 'Start the server', [], vi.fn(), ['s']);
        const ns = container('server', 'Server commands', [sub]);
        const output = commandHelp(ns);
        expect(output).toContain('start (s)');
    });

    it('resolves command by alias in scoped help', () => {
        const cmds = [command('help', 'Show help', [], vi.fn(), ['h'])];
        const resolved = resolveCommand(cmds, ['h']);
        expect(resolved).not.toBeUndefined();
        expect(resolved!.name()).toBe('help');
    });

    it('returns undefined for unknown alias in scoped help', () => {
        const cmds = [command('help', '', [], vi.fn(), ['h'])];
        expect(resolveCommand(cmds, ['x'])).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Integration test: full pipeline
// ---------------------------------------------------------------------------

describe('integration', () => {
    it('creates a command tree and resolves command + arg aliases end-to-end', () => {
        const tree = new CommandTree();
        const deployCmd = command(
            'deploy',
            'Deploy the app',
            [
                arg('environment', 'Target environment', z.string(), undefined, ['e']),
                arg('version', 'Release version', z.string(), undefined, ['v'])
            ],
            vi.fn(),
            ['d']
        );

        tree.add(deployCmd);

        const resolved = tree.find(['d', '-e', 'staging', '--version', '1.2.3']);
        expect(resolved).not.toBeNull();
        expect(resolved!.command.name()).toBe('deploy');
        expect(resolved!.args).toEqual(['-e', 'staging', '--version', '1.2.3']);

        const record = parseFlags(resolved!.args, resolved!.command.definitions());
        expect(record).toEqual({
            environment: 'staging',
            version: '1.2.3'
        });
    });
});
