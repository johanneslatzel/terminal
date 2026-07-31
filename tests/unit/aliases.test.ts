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
        const cmd = command('help', vi.fn(), { description: 'Show help', aliases: ['h', '?'] });
        expect(cmd.name()).toBe('help');
        expect(cmd.aliases()).toEqual(['h', '?']);
    });

    it('creates a command without aliases', () => {
        const cmd = command('greet', vi.fn());
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
        expect(() => command('x', vi.fn(), { aliases: [''] })).toThrow(InvalidArgumentsError);
        expect(() => command('x', vi.fn(), { aliases: [''] })).toThrow('alias cannot be empty');
    });

    it('rejects alias with whitespace', () => {
        expect(() => command('x', vi.fn(), { aliases: ['bad alias'] })).toThrow(InvalidArgumentsError);
        expect(() => command('x', vi.fn(), { aliases: ['bad alias'] })).toThrow('whitespace');
    });

    it('matches on canonical name', () => {
        const cmd = command('help', vi.fn(), { aliases: ['h'] });
        expect(cmd.matches('help')).toBe(true);
        expect(cmd.matches('h')).toBe(true);
        expect(cmd.matches('other')).toBe(false);
    });

    it('creates container with aliases', () => {
        const ns = container('config', { description: 'Config', aliases: ['cfg'] });
        expect(ns.name()).toBe('config');
        expect(ns.aliases()).toEqual(['cfg']);
        expect(ns.matches('config')).toBe(true);
        expect(ns.matches('cfg')).toBe(true);
    });

    it('accepts valid aliases', () => {
        expect(() => command('valid', vi.fn(), { aliases: ['v', 'V'] })).not.toThrow();
    });

    it('rejects duplicate alias in same command', () => {
        expect(() => command('x', vi.fn(), { aliases: ['a', 'a'] })).toThrow(InvalidArgumentsError);
        expect(() => command('x', vi.fn(), { aliases: ['a', 'a'] })).toThrow('Duplicate alias');
    });

    it('rejects alias matching own name', () => {
        expect(() => command('help', vi.fn(), { aliases: ['help'] })).toThrow(InvalidArgumentsError);
        expect(() => command('help', vi.fn(), { aliases: ['help'] })).toThrow('redundant');
    });
});

describe('CommandTree with aliases', () => {
    it('finds command by alias', () => {
        const tree = new CommandTree();
        tree.add(command('help', vi.fn(), { aliases: ['h', '?'] }));
        const result = tree.find(['h']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('help');
    });

    it('finds nested command by alias', () => {
        const tree = new CommandTree();
        const sub = command('start', vi.fn(), { aliases: ['s'] });
        const ns = container('server', { children: [sub], aliases: ['srv'] });
        tree.add(ns);
        const result = tree.find(['srv', 's']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('start');
    });

    it('returns null for unknown alias', () => {
        const tree = new CommandTree();
        tree.add(command('help', vi.fn(), { aliases: ['h'] }));
        expect(tree.find(['unknown'])).toBeNull();
    });

    it('suggests aliases in findSuggestions', () => {
        const tree = new CommandTree();
        tree.add(command('help', vi.fn(), { aliases: ['h', '?'] }));
        tree.add(command('history', vi.fn(), { aliases: ['hist'] }));
        const suggestions = tree.findSuggestions('h');
        expect(suggestions).toContain('h');
        expect(suggestions).toContain('hist');
        expect(suggestions).not.toContain('?');
    });

    it('rejects duplicate alias across sibling commands', () => {
        const tree = new CommandTree();
        tree.add(command('help', vi.fn(), { aliases: ['h'] }));
        expect(() => tree.add(command('history', vi.fn(), { aliases: ['h'] }))).toThrow(
            InvalidArgumentsError
        );
        expect(() => tree.add(command('history', vi.fn(), { aliases: ['h'] }))).toThrow('conflicts');
    });

    it('rejects alias colliding with sibling canonical name', () => {
        const tree = new CommandTree();
        tree.add(command('greet', vi.fn()));
        expect(() => tree.add(command('sayhi', vi.fn(), { aliases: ['greet'] }))).toThrow(
            InvalidArgumentsError
        );
        expect(() => tree.add(command('sayhi', vi.fn(), { aliases: ['greet'] }))).toThrow('conflicts');
    });
});

// ---------------------------------------------------------------------------
// Argument aliases
// ---------------------------------------------------------------------------

describe('argument aliases', () => {
    it('creates arg def with aliases via factory', () => {
        const def = arg('name', z.string(), { description: 'Your name', aliases: ['n'] });
        expect(def.name).toBe('name');
        expect(def.aliases).toEqual(['n']);
    });

    it('arg factory omits aliases when not provided', () => {
        const def = arg('name', z.string());
        expect(def.aliases).toBeUndefined();
    });

    it('rejects empty arg alias', () => {
        expect(() => arg('x', z.string(), { aliases: [''] })).toThrow(InvalidArgumentsError);
        expect(() => arg('x', z.string(), { aliases: [''] })).toThrow('alias cannot be empty');
    });

    it('rejects arg alias with whitespace', () => {
        expect(() => arg('x', z.string(), { aliases: ['bad alias'] })).toThrow(
            InvalidArgumentsError
        );
        expect(() => arg('x', z.string(), { aliases: ['bad alias'] })).toThrow('whitespace');
    });

    it('rejects duplicate arg alias in same definition', () => {
        expect(() => arg('x', z.string(), { aliases: ['a', 'a'] })).toThrow(
            InvalidArgumentsError
        );
        expect(() => arg('x', z.string(), { aliases: ['a', 'a'] })).toThrow('Duplicate');
    });

    it('rejects arg alias matching own name', () => {
        expect(() => arg('name', z.string(), { aliases: ['name'] })).toThrow(
            InvalidArgumentsError
        );
        expect(() => arg('name', z.string(), { aliases: ['name'] })).toThrow('redundant');
    });

    it('rejects arg alias colliding with another arg canonical name', () => {
        expect(
            () =>
                new (class extends Command {
                    constructor() {
                        super('test', '', [
                            arg('name', z.string(), { aliases: ['n'] }),
                            arg('n', z.string())
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
                            arg('name', z.string(), { aliases: ['n'] }),
                            arg('n', z.string())
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
                            arg('a', z.string(), { aliases: ['x'] }),
                            arg('b', z.string(), { aliases: ['x'] })
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
            arg('x', z.string(), { aliases: ['dup'] }),
            arg('y', z.string(), { aliases: ['dup'] }),
            arg('z', z.string(), { aliases: ['dup'] })
        ], 'cmd')).toThrow('Duplicate alias');
    });

    it('rejects alias colliding with positional arg canonical name', () => {
        expect(() => validateArgDefAliases([
            arg('name', z.string(), { position: 0, aliases: ['n'] }),
            arg('n', z.string(), { position: 1 })
        ], 'cmd')).toThrow('Duplicate alias');
    });

    it('rejects when alias matches reserved name across multiple defs', () => {
        expect(() => validateArgDefAliases([
            arg('x', z.string(), { aliases: ['a'] }),
            arg('a', z.string(), { aliases: ['x'] }),
            arg('b', z.string(), { aliases: ['x'] })
        ], 'cmd')).toThrow('Duplicate alias');
    });

    it('accepts defs where alias happens to match command name', () => {
        expect(() => validateArgDefAliases([
            arg('config', z.string(), { aliases: ['cfg'] })
        ], 'cfg')).not.toThrow();
    });
});

describe('parseFlags with arg aliases', () => {
    const defs = [
        arg('name', z.string(), { description: 'Your name', aliases: ['n'] }),
        arg('verbose', z.boolean(), { description: 'Verbose output', aliases: ['v'] }),
        arg('output', z.string(), { description: 'Output file', aliases: ['outfile', 'o'] })
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
        const posDefs = [arg('count', z.number(), { position: 0 })];
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
            arg('query', z.string(), { position: 0 }),
            arg('limit', z.number(), { aliases: ['l'] })
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
            command('help', vi.fn(), { description: 'Show help', aliases: ['h', '?'] }),
            command('exit', vi.fn(), { description: 'Exit the shell', aliases: ['quit', 'q'] })
        ];
        const output = globalHelp(cmds);
        expect(output).toContain('help (h, ?)');
        expect(output).toContain('exit (quit, q)');
    });

    it('shows command aliases in command help', () => {
        const cmd = command('deploy', vi.fn(), { description: 'Deploy the app', aliases: ['d'] });
        const output = commandHelp(cmd);
        expect(output).toContain('deploy (d)');
    });

    it('shows arg aliases in command help', () => {
        const cmd = command(
            'greet',
            vi.fn(),
            {
                description: 'Greets',
                arguments: [
                    arg('name', z.string(), { description: 'Your name', aliases: ['n'] }),
                    arg('verbose', z.boolean(), { description: 'Verbose', aliases: ['v'] })
                ]
            }
        );
        const output = commandHelp(cmd);
        expect(output).toContain('(-n)');
        expect(output).toContain('(-v)');
    });

    it('shows multi-char arg alias with -- prefix', () => {
        const cmd = command(
            'build',
            vi.fn(),
            {
                arguments: [arg('output', z.string(), { description: 'Output', aliases: ['outfile'] })]
            }
        );
        const output = commandHelp(cmd);
        expect(output).toContain('--output (--outfile)');
    });

    it('shows subcommand aliases in container help', () => {
        const sub = command('start', vi.fn(), { description: 'Start the server', aliases: ['s'] });
        const ns = container('server', { description: 'Server commands', children: [sub] });
        const output = commandHelp(ns);
        expect(output).toContain('start (s)');
    });

    it('resolves command by alias in scoped help', () => {
        const cmds = [command('help', vi.fn(), { description: 'Show help', aliases: ['h'] })];
        const resolved = resolveCommand(cmds, ['h']);
        expect(resolved).not.toBeUndefined();
        expect(resolved!.name()).toBe('help');
    });

    it('returns undefined for unknown alias in scoped help', () => {
        const cmds = [command('help', vi.fn(), { aliases: ['h'] })];
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
            vi.fn(),
            {
                description: 'Deploy the app',
                arguments: [
                    arg('environment', z.string(), { description: 'Target environment', aliases: ['e'] }),
                    arg('version', z.string(), { description: 'Release version', aliases: ['v'] })
                ],
                aliases: ['d']
            }
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
