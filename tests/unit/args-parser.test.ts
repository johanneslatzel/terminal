import { describe, it, expect } from 'vitest';
import { parseFlags } from '../../src/input/args-parser.js';
import { InvalidArgumentsError } from '../../src/errors.js';
import { Command } from '../../src/types.js';
import { z } from 'zod';
import type { CommandArgumentDefinition } from '../../src/command-arguments.js';

describe('parseFlags', () => {
    it('returns empty record for empty input', () => {
        expect(parseFlags([])).toEqual({});
    });

    it('parses --name value pairs', () => {
        expect(parseFlags(['--theme', 'dark', '--timeout', '30'])).toEqual({
            theme: 'dark',
            timeout: '30'
        });
    });

    it('treats valueless --flag as true', () => {
        expect(parseFlags(['--verbose'])).toEqual({ verbose: 'true' });
    });

    it('treats --flag before another --flag as true', () => {
        expect(parseFlags(['--verbose', '--debug'])).toEqual({
            verbose: 'true',
            debug: 'true'
        });
    });

    it('handles mixed valueless and valued flags', () => {
        expect(parseFlags(['--verbose', '--name', 'alice', '--debug'])).toEqual({
            verbose: 'true',
            name: 'alice',
            debug: 'true'
        });
    });

    it('throws for duplicate flag names', () => {
        expect(() => parseFlags(['--name', 'foo', '--name', 'bar'])).toThrow(InvalidArgumentsError);
        expect(() => parseFlags(['--name', 'foo', '--name', 'bar'])).toThrow(
            'Duplicate argument "--name"'
        );
    });

    it('throws for token not starting with --', () => {
        expect(() => parseFlags(['help'])).toThrow(InvalidArgumentsError);
        expect(() => parseFlags(['help'])).toThrow('Unexpected token "help", expected --argument');
    });

    it('throws for empty --', () => {
        expect(() => parseFlags(['--'])).toThrow(InvalidArgumentsError);
        expect(() => parseFlags(['--'])).toThrow('Empty argument name');
    });

    it('throws for mixed positional and flags', () => {
        expect(() => parseFlags(['foo', '--bar'])).toThrow(InvalidArgumentsError);
    });

    it('handles --flag with empty string value', () => {
        expect(parseFlags(['--name', ''])).toEqual({ name: '' });
    });

    it('consumes next token as value even if it looks like a number', () => {
        expect(parseFlags(['--count', '42', '--rate', '3.14'])).toEqual({
            count: '42',
            rate: '3.14'
        });
    });

    it('accepts positional arg matching a positional definition', () => {
        const defs: CommandArgumentDefinition[] = [
            {
                name: 'query',
                position: 0,
                schema: { safeParse: () => ({ success: true, data: '' }) } as any
            }
        ];
        expect(parseFlags(['backend'], defs)).toEqual({ query: 'backend' });
    });

    it('mixes positional and --flag args', () => {
        const defs: CommandArgumentDefinition[] = [
            {
                name: 'query',
                position: 0,
                schema: { safeParse: () => ({ success: true, data: '' }) } as any
            },
            { name: 'verbose', schema: { safeParse: () => ({ success: true, data: true }) } as any }
        ];
        expect(parseFlags(['hello', '--verbose'], defs)).toEqual({
            query: 'hello',
            verbose: 'true'
        });
    });

    it('throws for positional when no positional defs exist', () => {
        expect(() => parseFlags(['foo'], [])).toThrow(InvalidArgumentsError);
        expect(() => parseFlags(['foo'], [])).toThrow('Unexpected token "foo"');
    });

    it('consumes multiple positionals in order by index', () => {
        const defs: CommandArgumentDefinition[] = [
            {
                name: 'src',
                position: 0,
                schema: { safeParse: () => ({ success: true, data: '' }) } as any
            },
            {
                name: 'dest',
                position: 1,
                schema: { safeParse: () => ({ success: true, data: '' }) } as any
            }
        ];
        expect(parseFlags(['a.txt', 'b.txt'], defs)).toEqual({
            src: 'a.txt',
            dest: 'b.txt'
        });
    });

    it('uses position index (not declaration order) for matching', () => {
        const defs: CommandArgumentDefinition[] = [
            {
                name: 'dest',
                position: 1,
                schema: { safeParse: () => ({ success: true, data: '' }) } as any
            },
            {
                name: 'src',
                position: 0,
                schema: { safeParse: () => ({ success: true, data: '' }) } as any
            }
        ];
        expect(parseFlags(['a.txt', 'b.txt'], defs)).toEqual({
            src: 'a.txt',
            dest: 'b.txt'
        });
    });

    it('existing --flag tests still pass unchanged', () => {
        expect(parseFlags(['--theme', 'dark'], undefined)).toEqual({ theme: 'dark' });
        expect(parseFlags(['--verbose'])).toEqual({ verbose: 'true' });
        expect(() => parseFlags(['help'], undefined)).toThrow('Unexpected token "help"');
    });

    it('groups bare tokens after --flag onto the flag value', () => {
        expect(parseFlags(['--fields', 'id,', 'name'])).toEqual({ fields: 'id, name' });
    });

    it('groups multiple bare tokens after --flag', () => {
        expect(parseFlags(['--fields', 'id', 'name', 'email'])).toEqual({
            fields: 'id name email'
        });
    });

    it('groups bare tokens after a positional arg by appending to the last positional', () => {
        const defs: CommandArgumentDefinition[] = [
            { name: 'query', position: 0, schema: { safeParse: () => ({ success: true, data: '' }) } as any }
        ];
        expect(parseFlags(['hello', 'world', 'foo'], defs)).toEqual({ query: 'hello world foo' });
    });

    it('positional defs take priority over bare token grouping', () => {
        const defs: CommandArgumentDefinition[] = [
            { name: 'query', position: 0, schema: { safeParse: () => ({ success: true, data: '' }) } as any }
        ];
        expect(parseFlags(['--fields', 'id', 'name', 'hello'], defs)).toEqual({
            fields: 'id',
            query: 'name hello'
        });
    });

    it('groups bare tokens after --flag when no positional defs exist', () => {
        const defs: CommandArgumentDefinition[] = [
            { name: 'fields', schema: { safeParse: () => ({ success: true, data: '' }) } as any }
        ];
        expect(parseFlags(['--fields', 'id,', 'name'], defs)).toEqual({ fields: 'id, name' });
    });

    it('throws for bare token with no prior flag and no positional defs', () => {
        const defs: CommandArgumentDefinition[] = [
            { name: 'fields', schema: { safeParse: () => ({ success: true, data: '' }) } as any }
        ];
        expect(() => parseFlags(['foo'], defs)).toThrow('Unexpected token "foo"');
    });

    it('groups bare tokens after boolean --flag', () => {
        const defs: CommandArgumentDefinition[] = [
            { name: 'verbose', schema: { safeParse: () => ({ success: true, data: false }) } as any }
        ];
        expect(parseFlags(['--verbose', 'true'], defs)).toEqual({ verbose: 'true' });
    });

    it('throws for duplicate arg aliases across different definitions', () => {
        expect(
            () =>
                new (class extends Command {
                    constructor() {
                        super('test', '', [
                            { name: 'name', schema: z.string(), aliases: ['n'] },
                            { name: 'other', schema: z.string(), aliases: ['n'] }
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
                            { name: 'name', schema: z.string(), aliases: ['n'] },
                            { name: 'other', schema: z.string(), aliases: ['n'] }
                        ]);
                    }
                    async execute() {}
                })()
        ).toThrow('Duplicate alias');
    });
});
