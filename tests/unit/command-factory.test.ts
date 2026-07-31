import { describe, it, expect, vi } from 'vitest';
import { command, container, arg } from '../../src/command-factory.js';
import type { CommandArgumentDefinition } from '../../src/command-arguments.js';
import type { CommandContext } from '../../src/types.js';
import type { CommandArguments } from '../../src/command-arguments.js';
import { InvalidArgumentsError } from '../../src/errors.js';
import { Command } from '../../src/types.js';
import { z } from 'zod';

describe('command', () => {
    it('creates a Command-like object with name and description', () => {
        const fn = vi.fn();
        const cmd = command('hello', fn, { description: 'Says hello' });
        expect(cmd.name()).toBe('hello');
        expect(cmd.description()).toBe('Says hello');
        expect(cmd.definitions()).toEqual([]);
    });

    it('calls the handler on execute', async () => {
        const fn = vi.fn();
        const cmd = command('test', fn);
        await cmd.execute({} as unknown as CommandContext, {} as unknown as CommandArguments);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('forwards arg defs to the command', () => {
        const defs: CommandArgumentDefinition[] = [
            { name: 'name', schema: z.string(), description: 'Who' }
        ];
        const cmd = command('greet', vi.fn(), { arguments: defs });
        expect(cmd.definitions()).toHaveLength(1);
        expect(cmd.definitions()[0]!.name).toBe('name');
    });

    it('returns a fresh copy from definitions()', () => {
        const cmd = command('greet', vi.fn());
        const first = cmd.definitions();
        first.push({ name: 'name', schema: z.string(), description: 'Who' });
        expect(cmd.definitions()).toEqual([]);
        expect(cmd.definitions()).not.toBe(first);
    });

    it('supports async handlers', async () => {
        const fn = vi.fn().mockResolvedValue(undefined);
        const cmd = command('async', fn);
        await cmd.execute({} as unknown as CommandContext, {} as unknown as CommandArguments);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('works without argDefs', () => {
        const fn = vi.fn();
        const cmd = command('noargs', fn, { description: 'No arguments' });
        expect(cmd.name()).toBe('noargs');
        expect(cmd.definitions()).toEqual([]);
    });

    it('works without argDefs and with aliases', () => {
        const fn = vi.fn();
        const cmd = command('noargs', fn, { description: 'No arguments', aliases: ['n'] });
        expect(cmd.name()).toBe('noargs');
        expect(cmd.aliases()).toEqual(['n']);
        expect(cmd.definitions()).toEqual([]);
    });
});

describe('container', () => {
    it('creates a CommandContainer with name and description', () => {
        const ns = container('cfg', { description: 'Config commands' });
        expect(ns.name()).toBe('cfg');
        expect(ns.description()).toBe('Config commands');
        expect(ns.commands()).toEqual([]);
    });

    it('adds children when provided', () => {
        const child = command('child', vi.fn());
        const ns = container('parent', { children: [child] });
        expect(ns.commands()).toHaveLength(1);
        expect(ns.commands()[0]!.name()).toBe('child');
    });
});

describe('arg', () => {
    it('creates a CommandArgumentDefinition', () => {
        const schema = z.string();
        const def = arg('name', schema, { description: 'Your name' });
        expect(def.name).toBe('name');
        expect(def.description).toBe('Your name');
        expect(def.schema).toBe(schema);
    });

    it('works without description', () => {
        const def = arg('count', z.number());
        expect(def.name).toBe('count');
        expect(def.description).toBeUndefined();
    });

    it('accepts optional position parameter', () => {
        const def = arg('query', z.string(), { description: 'Search query', position: 0 });
        expect(def.name).toBe('query');
        expect(def.position).toBe(0);
    });

    it('accepts optional secret flag', () => {
        const def = arg('password', z.string(), { description: 'Your password', secret: true });
        expect(def.name).toBe('password');
        expect(def.secret).toBe(true);
    });

    it('accepts required option', () => {
        const def = arg('mode', z.string(), { required: true });
        expect(def.name).toBe('mode');
        expect(def.required).toBe(true);
    });
});

describe('position validation', () => {
    it('accepts valid dense positions starting at 0', () => {
        const defs = [arg('a', z.string(), { position: 0 }), arg('b', z.string(), { position: 1 })];
        expect(() => command('valid', vi.fn(), { arguments: defs })).not.toThrow();
    });

    it('accepts a single position 0', () => {
        const defs = [arg('query', z.string(), { position: 0 })];
        expect(() => command('single', vi.fn(), { arguments: defs })).not.toThrow();
    });

    it('rejects duplicate positions', () => {
        const defs = [arg('a', z.string(), { position: 0 }), arg('b', z.string(), { position: 0 })];
        expect(() => command('dup', vi.fn(), { arguments: defs })).toThrow(InvalidArgumentsError);
        expect(() => command('dup', vi.fn(), { arguments: defs })).toThrow('Duplicate position index 0');
    });

    it('rejects non-dense positions with a gap', () => {
        const defs = [arg('a', z.string(), { position: 0 }), arg('c', z.string(), { position: 2 })];
        expect(() => command('gap', vi.fn(), { arguments: defs })).toThrow(InvalidArgumentsError);
        expect(() => command('gap', vi.fn(), { arguments: defs })).toThrow('Expected position 1, got 2');
    });

    it('rejects positions not starting at 0', () => {
        const defs = [arg('a', z.string(), { position: 1 })];
        expect(() => command('nozero', vi.fn(), { arguments: defs })).toThrow(InvalidArgumentsError);
        expect(() => command('nozero', vi.fn(), { arguments: defs })).toThrow('Expected position 0, got 1');
    });

    it('accepts commands with no positional args', () => {
        expect(() => command('none', vi.fn())).not.toThrow();
        expect(() => command('none', vi.fn(), { arguments: [arg('a', z.string())] })).not.toThrow();
    });
});

describe('command name validation', () => {
    it('rejects empty command name', () => {
        expect(() => command('', vi.fn(), { description: 'desc' })).toThrow(InvalidArgumentsError);
        expect(() => command('', vi.fn(), { description: 'desc' })).toThrow('Command name cannot be empty');
    });

    it('rejects command name with spaces', () => {
        expect(() => command('two words', vi.fn(), { description: 'desc' })).toThrow(InvalidArgumentsError);
        expect(() => command('two words', vi.fn(), { description: 'desc' })).toThrow('whitespace');
    });

    it('rejects command name with tabs', () => {
        expect(() => command('tab\tname', vi.fn(), { description: 'desc' })).toThrow(InvalidArgumentsError);
    });

    it('rejects empty name via Command subclass', () => {
        expect(
            () =>
                new (class extends Command {
                    async execute() {}
                })('')
        ).toThrow(InvalidArgumentsError);
    });

    it('rejects whitespace name via Command subclass', () => {
        expect(
            () =>
                new (class extends Command {
                    async execute() {}
                })('bad name')
        ).toThrow(InvalidArgumentsError);
    });

    it('rejects whitespace name via container', () => {
        expect(() => container('bad name', {})).toThrow(InvalidArgumentsError);
    });

    it('accepts valid command name', () => {
        expect(() => command('valid', vi.fn(), { description: 'desc' })).not.toThrow();
    });
});
