import { describe, it, expect } from 'vitest';
import * as readline from 'node:readline';
import { PassThrough } from 'node:stream';
import { z } from 'zod';
import { CommandArguments } from '../../src/command-arguments.js';

import { InvalidArgumentsError } from '../../src/errors.js';
import type { CommandArgumentDefinition } from '../../src/command-arguments.js';

const basicDefs: CommandArgumentDefinition[] = [
    { name: 'name', schema: z.string() },
    { name: 'count', schema: z.coerce.number() },
    { name: 'rate', schema: z.coerce.number() },
    { name: 'flag', schema: z.boolean() },
    { name: 'size', schema: z.enum(['small', 'medium', 'large']) }
];

function makeArgs(record: Record<string, string>): CommandArguments {
    return new CommandArguments(record, null, basicDefs);
}

function makeMockRl(): readline.Interface {
    return {
        question: (query: string, cb: (answer: string) => void) => {
            cb('mock-answer');
        }
    } as unknown as readline.Interface;
}

describe('CommandArguments', () => {
    describe('has', () => {
        it('returns true for existing key', () => {
            expect(makeArgs({ foo: 'bar' }).has('foo')).toBe(true);
        });

        it('returns false for missing key', () => {
            expect(makeArgs({ foo: 'bar' }).has('baz')).toBe(false);
        });
    });

    describe('raw', () => {
        it('returns value for existing key', () => {
            expect(makeArgs({ foo: 'bar' }).raw('foo')).toBe('bar');
        });

        it('returns undefined for missing key', () => {
            expect(makeArgs({ foo: 'bar' }).raw('baz')).toBeUndefined();
        });
    });

    describe('no definition', () => {
        it('require throws when no definition exists', async () => {
            const args = new CommandArguments({ name: 'alice' }, null);
            await expect(args.require('name')).rejects.toThrow(InvalidArgumentsError);
        });

        it('flag() throws when no definition exists', async () => {
            const args = new CommandArguments({ flag: 'true' }, null);
            await expect(args.flag('flag')).rejects.toThrow(InvalidArgumentsError);
        });
    });

    describe('require (string)', () => {
        it('returns value when key exists', async () => {
            expect(await makeArgs({ name: 'alice' }).require<string>('name')).toBe('alice');
        });

        it('throws when key missing and no readline', async () => {
            await expect(makeArgs({}).require<string>('name')).rejects.toThrow(
                InvalidArgumentsError
            );
        });
    });

    describe('require with string schema', () => {
        const argDefs: CommandArgumentDefinition[] = [
            { name: 'email', schema: z.email() },
            { name: 'min3', schema: z.string().min(3) }
        ];
        const args = (record: Record<string, string>) =>
            new CommandArguments(record, null, argDefs);

        it('passes valid value through schema', async () => {
            await expect(args({ email: 'a@b.com' }).require<string>('email')).resolves.toBe(
                'a@b.com'
            );
        });

        it('rejects value failing schema', async () => {
            await expect(args({ email: 'not-an-email' }).require<string>('email')).rejects.toThrow(
                InvalidArgumentsError
            );
        });

        it('uses schema error message', async () => {
            await expect(args({ min3: 'ab' }).require<string>('min3')).rejects.toThrow(
                'Argument "min3": Too small: expected string to have >=3 characters'
            );
        });
    });

    describe('require (number)', () => {
        it('returns number for valid numeric string', async () => {
            expect(await makeArgs({ count: '42' }).require<number>('count')).toBe(42);
        });

        it('returns number for decimal string', async () => {
            expect(await makeArgs({ rate: '3.14' }).require<number>('rate')).toBeCloseTo(3.14);
        });

        it('throws for non-numeric string', async () => {
            await expect(makeArgs({ count: 'abc' }).require<number>('count')).rejects.toThrow(
                InvalidArgumentsError
            );
        });

        it('throws for missing key', async () => {
            await expect(makeArgs({}).require<number>('count')).rejects.toThrow(
                InvalidArgumentsError
            );
        });
    });

    describe('require with number schema', () => {
        const argDefs: CommandArgumentDefinition[] = [
            { name: 'age', schema: z.coerce.number().positive().int() },
            { name: 'rate', schema: z.coerce.number().min(0).max(1) }
        ];
        const args = (record: Record<string, string>) =>
            new CommandArguments(record, null, argDefs);

        it('coerces and validates through schema', async () => {
            await expect(args({ age: '25' }).require<number>('age')).resolves.toBe(25);
        });

        it('rejects value failing schema constraints', async () => {
            await expect(args({ age: '-1' }).require<number>('age')).rejects.toThrow(
                InvalidArgumentsError
            );
        });

        it('rejects non-numeric string against schema', async () => {
            await expect(args({ age: 'abc' }).require<number>('age')).rejects.toThrow(
                InvalidArgumentsError
            );
        });
    });

    describe('require with array schema', () => {
        const argDefs: CommandArgumentDefinition[] = [
            { name: 'fields', schema: z.array(z.string()) },
            { name: 'nums', schema: z.array(z.coerce.number()) }
        ];
        const args = (record: Record<string, string>) =>
            new CommandArguments(record, null, argDefs);

        it('splits comma-separated value into array of strings', async () => {
            await expect(args({ fields: 'id, name, email' }).require<string[]>('fields')).resolves.toEqual(['id', 'name', 'email']);
        });

        it('handles single value without commas', async () => {
            await expect(args({ fields: 'id' }).require<string[]>('fields')).resolves.toEqual(['id']);
        });

        it('handles empty string', async () => {
            await expect(args({ fields: '' }).require<string[]>('fields')).resolves.toEqual([]);
        });

        it('trims whitespace around commas', async () => {
            await expect(args({ fields: '  a  , b ,c  ,  d' }).require<string[]>('fields')).resolves.toEqual(['a', 'b', 'c', 'd']);
        });

        it('coerces comma-separated numbers', async () => {
            await expect(args({ nums: '1, 2, 3' }).require<number[]>('nums')).resolves.toEqual([1, 2, 3]);
        });

        it('rejects array schema validation errors', async () => {
            await expect(args({ nums: '1, abc, 3' }).require<number[]>('nums')).rejects.toThrow(InvalidArgumentsError);
        });
    });

    describe('flag', () => {
        it('returns true for "true"', async () => {
            expect(await makeArgs({ flag: 'true' }).flag('flag')).toBe(true);
        });

        it('returns false for "false"', async () => {
            expect(await makeArgs({ flag: 'false' }).flag('flag')).toBe(false);
        });

        it('is case-insensitive for true/false', async () => {
            expect(await makeArgs({ flag: 'True' }).flag('flag')).toBe(true);
            expect(await makeArgs({ flag: 'FALSE' }).flag('flag')).toBe(false);
        });

        it('accepts "1" as true', async () => {
            expect(await makeArgs({ flag: '1' }).flag('flag')).toBe(true);
        });

        it('accepts "0" as false', async () => {
            expect(await makeArgs({ flag: '0' }).flag('flag')).toBe(false);
        });

        it('rejects "yes"', async () => {
            await expect(makeArgs({ flag: 'yes' }).flag('flag')).rejects.toThrow(
                InvalidArgumentsError
            );
        });

        it('rejects "no"', async () => {
            await expect(makeArgs({ flag: 'no' }).flag('flag')).rejects.toThrow(
                InvalidArgumentsError
            );
        });

        it('rejects invalid boolean string', async () => {
            await expect(makeArgs({ flag: 'maybe' }).flag('flag')).rejects.toThrow(
                InvalidArgumentsError
            );
        });

        it('returns false for missing key (flag default)', async () => {
            expect(await makeArgs({}).flag('flag')).toBe(false);
        });
    });

    describe('flag with schema', () => {
        const argDefs: CommandArgumentDefinition[] = [{ name: 'flag', schema: z.boolean() }];
        const args = (record: Record<string, string>) =>
            new CommandArguments(record, null, argDefs);

        it('passes valid boolean through schema', async () => {
            await expect(args({ flag: 'true' }).flag('flag')).resolves.toBe(true);
        });

        it('passes false through schema', async () => {
            await expect(args({ flag: 'false' }).flag('flag')).resolves.toBe(false);
        });

        it('rejects when schema constrains the boolean value', async () => {
            const constrained: CommandArgumentDefinition[] = [
                { name: 'flag', schema: z.literal(true) }
            ];
            const constrainedArgs = (record: Record<string, string>) =>
                new CommandArguments(record, null, constrained);
            await expect(constrainedArgs({ flag: 'false' }).flag('flag')).rejects.toThrow(
                InvalidArgumentsError
            );
        });
    });

    describe('require (enum)', () => {
        it('returns value when in allowed list', async () => {
            expect(await makeArgs({ size: 'medium' }).require<string>('size')).toBe('medium');
        });

        it('throws when value not in allowed list', async () => {
            await expect(makeArgs({ size: 'xlarge' }).require<string>('size')).rejects.toThrow(
                InvalidArgumentsError
            );
        });

        it('is case-sensitive', async () => {
            await expect(makeArgs({ size: 'Medium' }).require<string>('size')).rejects.toThrow(
                InvalidArgumentsError
            );
        });

        it('throws for missing key', async () => {
            await expect(makeArgs({}).require<string>('size')).rejects.toThrow(
                InvalidArgumentsError
            );
        });
    });

    describe('require with boolean schema', () => {
        const defs: CommandArgumentDefinition[] = [{ name: 'flag', schema: z.boolean() }];

        it('rejects string "true" through require (no coercion — use flag() instead)', async () => {
            const args = new CommandArguments({ flag: 'true' }, null, defs);
            await expect(args.require<boolean>('flag')).rejects.toThrow(InvalidArgumentsError);
        });

        it('rejects "yes" through require', async () => {
            const args = new CommandArguments({ flag: 'yes' }, null, defs);
            await expect(args.require<boolean>('flag')).rejects.toThrow(InvalidArgumentsError);
        });

        it('flag() coerces string "true" to boolean (unlike require)', async () => {
            const args = new CommandArguments({ flag: 'true' }, null, defs);
            await expect(args.flag('flag')).resolves.toBe(true);
        });
    });

    describe('require with enum schema', () => {
        const argDefs: CommandArgumentDefinition[] = [
            { name: 'size', schema: z.enum(['small', 'medium', 'large']) }
        ];
        const args = (record: Record<string, string>) =>
            new CommandArguments(record, null, argDefs);

        it('validates through enum schema', async () => {
            await expect(args({ size: 'medium' }).require<string>('size')).resolves.toBe('medium');
        });

        it('rejects value not in schema enum', async () => {
            await expect(args({ size: 'xlarge' }).require<string>('size')).rejects.toThrow(
                InvalidArgumentsError
            );
        });
    });

    describe('prompting (with rl)', () => {
        const promptDefs: CommandArgumentDefinition[] = [
            { name: 'name', schema: z.string() },
            { name: 'count', schema: z.coerce.number() },
            { name: 'flag', schema: z.boolean() },
            { name: 'size', schema: z.enum(['small', 'large']) },
            { name: 'email', schema: z.email() }
        ];

        it('prompts for missing string and returns answer', async () => {
            const args = new CommandArguments({}, makeMockRl(), promptDefs);
            expect(await args.require<string>('name')).toBe('mock-answer');
        });

        it('prompts for missing number and returns parsed answer', async () => {
            const rl = {
                question: (_query: string, cb: (a: string) => void) => cb('42')
            } as unknown as readline.Interface;
            const args = new CommandArguments({}, rl, promptDefs);
            expect(await args.require<number>('count')).toBe(42);
        });

        it('returns false for missing boolean even with rl (flag default)', async () => {
            const rl = {
                question: (_query: string, cb: (a: string) => void) => cb('should-not-be-called')
            } as unknown as readline.Interface;
            const args = new CommandArguments({}, rl, promptDefs);
            expect(await args.flag('flag')).toBe(false);
        });

        it('prompts for missing enum and returns parsed answer', async () => {
            const rl = {
                question: (_query: string, cb: (a: string) => void) => cb('large')
            } as unknown as readline.Interface;
            const args = new CommandArguments({}, rl, promptDefs);
            expect(await args.require<string>('size')).toBe('large');
        });

        it('throws when prompt returns value that fails schema', async () => {
            const rl = {
                question: (_query: string, cb: (a: string) => void) => cb('not-an-email')
            } as unknown as readline.Interface;
            const args = new CommandArguments({}, rl, promptDefs);
            await expect(args.require<string>('email')).rejects.toThrow(InvalidArgumentsError);
        });

        it('calls question for each missing argument in sequence', async () => {
            const calls: string[] = [];
            const rl = {
                question: (query: string, cb: (a: string) => void) => {
                    calls.push(query);
                    cb('answer-' + calls.length);
                }
            } as unknown as readline.Interface;
            const args = new CommandArguments({}, rl, promptDefs);
            const a = await args.require<string>('name');
            const b = await args.require<string>('name');
            expect(calls).toHaveLength(2);
            expect(a).toBe('answer-1');
            expect(b).toBe('answer-2');
        });
    });

    describe('requireSecret', () => {
        function makeTtyRl(): { rl: readline.Interface; input: PassThrough; output: PassThrough } {
            const ttyInput = Object.assign(new PassThrough(), {
                isTTY: true,
                isRaw: false,
                setRawMode: () => {}
            });
            // Simulate readline's internal data listener
            ttyInput.on('data', () => {});
            const ttyOutput = new PassThrough();
            return {
                rl: {
                    input: ttyInput,
                    output: ttyOutput,
                    pause: () => {},
                    resume: () => {},
                    prompt: () => {},
                    question: (_q: string, cb: (a: string) => void) => cb('visible-fallback')
                } as unknown as readline.Interface,
                input: ttyInput,
                output: ttyOutput
            };
        }

        const secretDefs: CommandArgumentDefinition[] = [
            { name: 'password', schema: z.string(), secret: true }
        ];

        it('returns value when argument is provided on command line', async () => {
            const args = new CommandArguments({ password: 'hunter2' }, null, secretDefs);
            expect(await args.requireSecret('password')).toBe('hunter2');
        });

        it('require() uses hidden prompt when secret:true and arg missing', async () => {
            const { rl, input } = makeTtyRl();
            const args = new CommandArguments({}, rl, secretDefs);
            const promise = args.require<string>('password');
            input.write('s3cret\n');
            const result = await promise;
            expect(result).toBe('s3cret');
        });

        it('requireSecret prompts with hidden input', async () => {
            const { rl, input } = makeTtyRl();
            const args = new CommandArguments({}, rl, secretDefs);
            const promise = args.requireSecret('password');
            input.write('hunter2\n');
            const result = await promise;
            expect(result).toBe('hunter2');
        });

        it('requireSecret falls back to visible prompt when stdin not a TTY', async () => {
            const rl = {
                input: Object.assign(new PassThrough(), {
                    isTTY: false,
                    isRaw: false,
                    setRawMode: () => {}
                }),
                output: new PassThrough(),
                pause: () => {},
                resume: () => {},
                prompt: () => {},
                question: (_q: string, cb: (a: string) => void) => cb('visible-answer')
            } as unknown as readline.Interface;
            const args = new CommandArguments({}, rl, secretDefs);
            const result = await args.requireSecret('password');
            expect(result).toBe('visible-answer');
        });

        it('throws when definition not found', async () => {
            const args = new CommandArguments({}, null, []);
            await expect(args.requireSecret('password')).rejects.toThrow(InvalidArgumentsError);
        });

        it('throws when schema validation fails', async () => {
            const strictDefs: CommandArgumentDefinition[] = [
                { name: 'pw', schema: z.string().min(10), secret: true }
            ];
            const args = new CommandArguments({ pw: 'short' }, null, strictDefs);
            await expect(args.requireSecret('pw')).rejects.toThrow(InvalidArgumentsError);
        });

        it('throws when missing and no readline', async () => {
            const args = new CommandArguments({}, null, secretDefs);
            await expect(args.requireSecret('password')).rejects.toThrow(
                'Argument "password" is required but not provided'
            );
        });
    });

    describe('has and raw with no definitions', () => {
        it('has returns true for present key without definitions', () => {
            const args = new CommandArguments({ foo: 'bar' }, null);
            expect(args.has('foo')).toBe(true);
            expect(args.has('baz')).toBe(false);
        });

        it('raw returns value for present key without definitions', () => {
            const args = new CommandArguments({ foo: 'bar' }, null);
            expect(args.raw('foo')).toBe('bar');
            expect(args.raw('baz')).toBeUndefined();
        });
    });
});
