import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { CommandArguments } from '../../../src/command-arguments.js';
import { FilterCommand } from '../../../src/commands/filter.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';
describe('filter command', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    async function runPipeline(line: string): Promise<unknown[]> {
        const log: unknown[] = [];
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ role: 'admin', state: 'running', age: 25, name: 'Alice', user: { team: 'alpha' } });
            ctx.output!.submit({ role: 'admin', state: 'stopped', age: 30, name: 'Bob', user: { team: 'beta' } });
            ctx.output!.submit({ role: 'user', state: 'running', age: 18, name: 'Carol', user: null });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });
        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write(line + '\n');
        await new Promise((r) => setTimeout(r, 100));
        return log;
    }

    it('keeps only objects matching an equality condition', async () => {
        const log = await runPipeline('producer | filter role=admin | consumer');
        expect(log).toEqual([
            [
                { role: 'admin', state: 'running', age: 25, name: 'Alice', user: { team: 'alpha' } },
                { role: 'admin', state: 'stopped', age: 30, name: 'Bob', user: { team: 'beta' } }
            ]
        ]);
    });

    it('combines conditions with AND by default', async () => {
        const log = await runPipeline('producer | filter role=admin,state=running | consumer');
        expect(log).toEqual([[{ role: 'admin', state: 'running', age: 25, name: 'Alice', user: { team: 'alpha' } }]]);
    });

    it('matches any condition with --any', async () => {
        const log = await runPipeline('producer | filter role=user,state=stopped --any | consumer');
        expect(log).toEqual([
            [
                { role: 'admin', state: 'stopped', age: 30, name: 'Bob', user: { team: 'beta' } },
                { role: 'user', state: 'running', age: 18, name: 'Carol', user: null }
            ]
        ]);
    });

    it('inverts the whole predicate with --not', async () => {
        const log = await runPipeline('producer | filter role=admin --not | consumer');
        expect(log).toEqual([[{ role: 'user', state: 'running', age: 18, name: 'Carol', user: null }]]);
    });

    it('compares case-insensitively with --icase', async () => {
        const log = await runPipeline('producer | filter name=alice --icase | consumer');
        expect(log).toEqual([[{ role: 'admin', state: 'running', age: 25, name: 'Alice', user: { team: 'alpha' } }]]);
    });

    it('supports numeric comparison operators', async () => {
        const log = await runPipeline('producer | filter age>=18 | consumer');
        expect(log).toEqual([
            [
                { role: 'admin', state: 'running', age: 25, name: 'Alice', user: { team: 'alpha' } },
                { role: 'admin', state: 'stopped', age: 30, name: 'Bob', user: { team: 'beta' } },
                { role: 'user', state: 'running', age: 18, name: 'Carol', user: null }
            ]
        ]);
    });

    it('supports string operators ~, ^, $ and =~', async () => {
        const log = await runPipeline('producer | filter name=~^A,state$ing | consumer');
        expect(log).toEqual([[{ role: 'admin', state: 'running', age: 25, name: 'Alice', user: { team: 'alpha' } }]]);
    });

    it('supports != and bare-key existence', async () => {
        const log = await runPipeline('producer | filter state!=stopped,user | consumer');
        expect(log).toEqual([
            [{ role: 'admin', state: 'running', age: 25, name: 'Alice', user: { team: 'alpha' } }]
        ]);
    });

    it('matches nested attribute paths', async () => {
        const log = await runPipeline('producer | filter user.team=alpha | consumer');
        expect(log).toEqual([[{ role: 'admin', state: 'running', age: 25, name: 'Alice', user: { team: 'alpha' } }]]);
    });

    it('passes through all objects when no conditions are given', async () => {
        const log = await runPipeline('producer | filter | consumer');
        expect(log).toHaveLength(1);
        expect((log[0] as unknown[])).toHaveLength(3);
    });

    it('prints a hint when run as a standalone command', async () => {
        await term.start();
        stdin.write('filter\n');
        await waitForOutput(chunks, (s) => s.includes('intermediate'));
        expect(chunks.join('')).toContain('filter is an intermediate pipeline command');
    });
});

describe('filter command (direct unit tests)', () => {
    function makeCtx() {
        const submit = vi.fn();
        const stdout = { write: vi.fn() };
        const ctx: any = {
            output: { submit },
            logger: { debug: () => {} },
            stdin: { on: () => {}, removeListener: () => {} },
            stdout,
            state: {}
        };
        return { ctx, submit, stdout };
    }

    async function run(
        record: Record<string, string>,
        items: Record<string, unknown>[]
    ): Promise<ReturnType<typeof vi.fn>> {
        const { ctx, submit } = makeCtx();
        const cmd = new FilterCommand();
        const args = new CommandArguments(record, null, cmd.definitions(), items);
        await cmd.execute(ctx, args);
        return submit;
    }

    async function expectThrow(record: Record<string, string>, items: Record<string, unknown>[]): Promise<void> {
        const { ctx } = makeCtx();
        const cmd = new FilterCommand();
        const args = new CommandArguments(record, null, cmd.definitions(), items);
        await expect(cmd.execute(ctx, args)).rejects.toThrow('Invalid filter condition');
    }

    it('writes the hint when no output pipeline is available', async () => {
        const { stdout } = makeCtx();
        const cmd = new FilterCommand();
        const args = new CommandArguments({}, null, cmd.definitions(), [{ x: 1 }]);
        await cmd.execute({ output: null, stdout } as any, args);
        expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('intermediate'));
    });

    it('returns without submitting for empty pipeline input', async () => {
        const submit = await run({ conditions: 'x=1' }, []);
        expect(submit).not.toHaveBeenCalled();
    });

    it('passes through items when no conditions are provided', async () => {
        const submit = await run({}, [{ x: 1 }, { x: 2 }]);
        expect(submit).toHaveBeenCalledWith([{ x: 1 }, { x: 2 }]);
    });

    it('filters with = for strings and numbers', async () => {
        const submit = await run({ conditions: 'name=Alice,age=18' }, [
            { name: 'Alice', age: 18 },
            { name: 'Alice', age: 20 }
        ]);
        expect(submit).toHaveBeenCalledWith([{ name: 'Alice', age: 18 }]);
    });

    it('coerces numeric RHS including negatives and decimals', async () => {
        const submit = await run({ conditions: 'score=-1.5' }, [{ score: -1.5 }, { score: 1 }]);
        expect(submit).toHaveBeenCalledWith([{ score: -1.5 }]);
    });

    it('does not coerce non-numeric RHS for numeric LHS', async () => {
        const submit = await run({ conditions: 'age=x' }, [{ age: 18 }]);
        expect(submit).toHaveBeenCalledWith([]);
    });

    it('matches boolean values with true, false, 1 and 0', async () => {
        const submit = await run({ conditions: 'active=true,on=1,off=false,zero=0' }, [
            { active: true, on: true, off: false, zero: false },
            { active: false, on: true, off: false, zero: false }
        ]);
        expect(submit).toHaveBeenCalledWith([{ active: true, on: true, off: false, zero: false }]);
    });

    it('does not match a boolean LHS against a non-boolean RHS', async () => {
        const submit = await run({ conditions: 'active=yes' }, [{ active: true }]);
        expect(submit).toHaveBeenCalledWith([]);
    });

    it('lowercases non-boolean RHS for boolean LHS with --icase', async () => {
        const submit = await run({ conditions: 'active=YES', icase: 'true' }, [{ active: true }]);
        expect(submit).toHaveBeenCalledWith([]);
    });

    it('compares case-insensitively when --icase is set', async () => {
        const submit = await run({ conditions: 'name=alice', icase: 'true' }, [
            { name: 'ALICE' },
            { name: 'Bob' }
        ]);
        expect(submit).toHaveBeenCalledWith([{ name: 'ALICE' }]);
    });

    it('compares case-sensitively without --icase', async () => {
        const submit = await run({ conditions: 'name=alice' }, [{ name: 'ALICE' }]);
        expect(submit).toHaveBeenCalledWith([]);
    });

    it('supports bare-key existence checks', async () => {
        const submit = await run({ conditions: 'role' }, [{ role: 'admin' }, { role: null }, {}]);
        expect(submit).toHaveBeenCalledWith([{ role: 'admin' }]);
    });

    it('inverts existence with a leading !', async () => {
        const submit = await run({ conditions: '!role' }, [{ role: 'admin' }, { role: null }]);
        expect(submit).toHaveBeenCalledWith([{ role: null }]);
    });

    it('keeps null and missing LHS for != conditions', async () => {
        const submit = await run({ conditions: 'role!=admin' }, [{ role: null }, {}, { role: 'admin' }]);
        expect(submit).toHaveBeenCalledWith([{ role: null }, {}]);
    });

    it('supports >, >=, < and <= on numbers', async () => {
        const submit = await run({ conditions: 'age>18,score<=2.5' }, [
            { age: 20, score: 2 },
            { age: 18, score: 3 }
        ]);
        expect(submit).toHaveBeenCalledWith([{ age: 20, score: 2 }]);
    });

    it('supports the < operator', async () => {
        const submit = await run({ conditions: 'age<18' }, [{ age: 10 }, { age: 20 }]);
        expect(submit).toHaveBeenCalledWith([{ age: 10 }]);
    });

    it('excludes null and missing LHS for comparison operators', async () => {
        const submit = await run({ conditions: 'age>18' }, [{ age: null }, {}]);
        expect(submit).toHaveBeenCalledWith([]);
    });

    it('falls back to string comparison when numeric LHS has a non-numeric RHS', async () => {
        const submit = await run({ conditions: 'age>z' }, [{ age: 20 }]);
        expect(submit).toHaveBeenCalledWith([]);
    });

    it('compares strings with relational operators', async () => {
        const submit = await run({ conditions: 'name>Al' }, [{ name: 'Bob' }, { name: 'Adam' }]);
        expect(submit).toHaveBeenCalledWith([{ name: 'Bob' }]);
    });

    it('compares strings case-insensitively with relational operators', async () => {
        const submit = await run({ conditions: 'name>AL', icase: 'true' }, [{ name: 'bob' }, { name: 'adam' }]);
        expect(submit).toHaveBeenCalledWith([{ name: 'bob' }]);
    });

    it('supports contains (~), startsWith (^) and endsWith ($)', async () => {
        const submit = await run({ conditions: 'name~lic,state^run' }, [
            { name: 'Alice', state: 'running' },
            { name: 'Bob', state: 'stopped' }
        ]);
        expect(submit).toHaveBeenCalledWith([{ name: 'Alice', state: 'running' }]);
    });

    it('supports contains, startsWith and endsWith with --icase', async () => {
        const submit = await run(
            { conditions: 'name~LIC,state^RUN,state$ING', icase: 'true' },
            [{ name: 'Alice', state: 'running' }]
        );
        expect(submit).toHaveBeenCalledWith([{ name: 'Alice', state: 'running' }]);
    });

    it('treats missing or null values as empty strings for string operators', async () => {
        const submit = await run(
            { conditions: 'name~x,state^y,rank$z' },
            [{ name: null, state: null, rank: null }, {}]
        );
        expect(submit).toHaveBeenCalledWith([]);
    });

    it('supports regex with =~ and case-insensitive matching', async () => {
        const submit = await run({ conditions: 'name=~^al.*ce$', icase: 'true' }, [
            { name: 'Alice' },
            { name: 'Carol' }
        ]);
        expect(submit).toHaveBeenCalledWith([{ name: 'Alice' }]);
    });

    it('negates regex matches with a leading !', async () => {
        const submit = await run({ conditions: '!name=~^X' }, [{ name: 'Alice' }]);
        expect(submit).toHaveBeenCalledWith([{ name: 'Alice' }]);
    });

    it('keeps double-negated conditions as positive', async () => {
        const submit = await run({ conditions: '!!role=admin' }, [{ role: 'admin' }]);
        expect(submit).toHaveBeenCalledWith([{ role: 'admin' }]);
    });

    it('negates a matched condition with a leading !', async () => {
        const submit = await run({ conditions: '!role=admin' }, [{ role: 'admin' }, { role: 'user' }]);
        expect(submit).toHaveBeenCalledWith([{ role: 'user' }]);
    });

    it('combines --any and --not to keep items matching no condition', async () => {
        const submit = await run(
            { conditions: 'role=admin,state=running', any: 'true', not: 'true' },
            [{ role: 'admin' }, { state: 'running' }, { role: 'user', state: 'stopped' }]
        );
        expect(submit).toHaveBeenCalledWith([{ role: 'user', state: 'stopped' }]);
    });

    it('walks nested paths and treats missing/null/non-object segments as absent', async () => {
        const submit = await run({ conditions: 'user.name=Alice' }, [
            { user: { name: 'Alice' } },
            { user: null },
            { user: 'x' },
            { user: ['x'] },
            {}
        ]);
        expect(submit).toHaveBeenCalledWith([{ user: { name: 'Alice' } }]);
    });

    it('handles whitespace around operators', async () => {
        const submit = await run({ conditions: 'age >= 18' }, [{ age: 20 }, { age: 10 }]);
        expect(submit).toHaveBeenCalledWith([{ age: 20 }]);
    });

    it('rejects a condition with only negation markers', async () => {
        await expectThrow({ conditions: '!' }, [{ x: 1 }]);
    });

    it('rejects a condition with an empty key', async () => {
        await expectThrow({ conditions: '=admin' }, [{ x: 1 }]);
    });

    it('rejects a ! operator not followed by =', async () => {
        await expectThrow({ conditions: 'role !x' }, [{ x: 1 }]);
    });

    it('rejects unknown operator characters', async () => {
        await expectThrow({ conditions: 'role?admin' }, [{ x: 1 }]);
    });

    it('rejects an empty regex value', async () => {
        await expectThrow({ conditions: 'name=~' }, [{ x: 1 }]);
    });

    it('rejects an invalid regex', async () => {
        await expectThrow({ conditions: 'name=~(' }, [{ x: 1 }]);
    });

    it('rejects == as an invalid operator', async () => {
        await expectThrow({ conditions: 'role==admin' }, [{ role: 'admin' }]);
    });

    it('rejects empty values for comparison operators', async () => {
        await expectThrow({ conditions: 'age>,name~,state^,rank$' }, [{ x: 1 }]);
    });
});

