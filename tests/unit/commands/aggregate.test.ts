import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { CommandArguments } from '../../../src/command-arguments.js';
import { AggregateCommand } from '../../../src/commands/aggregate.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';
describe('aggregate command', () => {
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
            ctx.output!.submit({ team: 'alpha', score: 10, status: 'ok' });
            ctx.output!.submit({ team: 'beta', score: 2, status: 'ok' });
            ctx.output!.submit({ team: 'alpha', score: 4, status: 'fail' });
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

    it('counts objects by default', async () => {
        const log = await runPipeline('producer | aggregate | consumer');
        expect(log).toEqual([[{ count: 3 }]]);
    });

    it('computes the mean via the -m and -a aliases', async () => {
        const log = await runPipeline('producer | aggregate -m mean -a score | consumer');
        expect(log).toEqual([[{ mean: (10 + 2 + 4) / 3 }]]);
    });

    it('computes the median', async () => {
        const log = await runPipeline('producer | aggregate --mode median --attribute score | consumer');
        expect(log).toEqual([[{ median: 4 }]]);
    });

    it('counts distinct attribute values', async () => {
        const log = await runPipeline('producer | aggregate -m count -a status --distinct | consumer');
        expect(log).toEqual([[{ count: 2 }]]);
    });

    it('rounds numeric results with --round', async () => {
        const log = await runPipeline('producer | aggregate -m mean -a score --round 1 | consumer');
        expect(log).toEqual([[{ mean: Math.round(((10 + 2 + 4) / 3) * 10) / 10 }]]);
    });

    it('groups rows by key with -g', async () => {
        const log = await runPipeline('producer | aggregate -m sum -a score -g team | consumer');
        expect(log).toEqual([
            [
                { team: 'alpha', sum: 14 },
                { team: 'beta', sum: 2 }
            ]
        ]);
    });

    it('prints a hint when run as a standalone command', async () => {
        await term.start();
        stdin.write('aggregate\n');
        await waitForOutput(chunks, (s) => s.includes('intermediate'));
        expect(chunks.join('')).toContain('aggregate is an intermediate pipeline command');
    });
});

describe('aggregate command (direct unit tests)', () => {
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
        const cmd = new AggregateCommand();
        const args = new CommandArguments(record, null, cmd.definitions(), items);
        await cmd.execute(ctx, args);
        return submit;
    }

    async function expectThrow(
        record: Record<string, string>,
        items: Record<string, unknown>[],
        message: string
    ): Promise<void> {
        const { ctx } = makeCtx();
        const cmd = new AggregateCommand();
        const args = new CommandArguments(record, null, cmd.definitions(), items);
        await expect(cmd.execute(ctx, args)).rejects.toThrow(message);
    }

    it('writes the hint when no output pipeline is available', async () => {
        const { stdout } = makeCtx();
        const cmd = new AggregateCommand();
        const args = new CommandArguments({}, null, cmd.definitions(), [{ x: 1 }]);
        await cmd.execute({ output: null, stdout } as any, args);
        expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('intermediate'));
    });

    it('counts all items by default', async () => {
        const submit = await run({}, [{ x: 1 }, { x: 2 }, { x: 3 }]);
        expect(submit).toHaveBeenCalledWith([{ count: 3 }]);
    });

    it('counts attribute values when attribute is provided', async () => {
        const submit = await run({ mode: 'count', attribute: 'status' }, [
            { status: 'a' },
            { status: 'b' },
            { status: 'a' }
        ]);
        expect(submit).toHaveBeenCalledWith([{ count: 3 }]);
    });

    it('counts distinct attribute values', async () => {
        const submit = await run({ mode: 'count', attribute: 'status', distinct: 'true' }, [
            { status: 'a' },
            { status: 'b' },
            { status: 'a' }
        ]);
        expect(submit).toHaveBeenCalledWith([{ count: 2 }]);
    });

    it('computes min and max on numbers', async () => {
        const min = await run({ mode: 'min', attribute: 'score' }, [{ score: 1 }, { score: 2 }, { score: 0 }]);
        expect(min).toHaveBeenCalledWith([{ min: 0 }]);
        const max = await run({ mode: 'max', attribute: 'score' }, [{ score: 2 }, { score: 1 }, { score: 3 }]);
        expect(max).toHaveBeenCalledWith([{ max: 3 }]);
    });

    it('computes min and max on strings', async () => {
        const submit = await run({ mode: 'min', attribute: 'name' }, [{ name: 'Bob' }, { name: 'Alice' }]);
        expect(submit).toHaveBeenCalledWith([{ min: 'Alice' }]);
    });

    it('returns null for min, max, mean and median over empty lists', async () => {
        const min = await run({ mode: 'min', attribute: 'score' }, []);
        expect(min).toHaveBeenCalledWith([{ min: null }]);
        const max = await run({ mode: 'max', attribute: 'score' }, []);
        expect(max).toHaveBeenCalledWith([{ max: null }]);
        const mean = await run({ mode: 'mean', attribute: 'score' }, []);
        expect(mean).toHaveBeenCalledWith([{ mean: null }]);
        const median = await run({ mode: 'median', attribute: 'score' }, []);
        expect(median).toHaveBeenCalledWith([{ median: null }]);
    });

    it('computes the sum, ignoring non-null filters', async () => {
        const submit = await run({ mode: 'sum', attribute: 'score' }, [
            { score: 1 },
            { score: 2 },
            { score: null },
            {}
        ]);
        expect(submit).toHaveBeenCalledWith([{ sum: 3 }]);
    });

    it('coerces numeric string attribute values', async () => {
        const submit = await run({ mode: 'sum', attribute: 'score' }, [{ score: '4' }, { score: 1 }]);
        expect(submit).toHaveBeenCalledWith([{ sum: 5 }]);
    });

    it('rounds sums with --round', async () => {
        const submit = await run({ mode: 'sum', attribute: 'score', round: '2' }, [
            { score: 1.111 },
            { score: 1.111 }
        ]);
        expect(submit).toHaveBeenCalledWith([{ sum: 2.22 }]);
    });

    it('computes the mean and median over odd and even lists', async () => {
        const mean = await run({ mode: 'mean', attribute: 'score' }, [{ score: 2 }, { score: 4 }]);
        expect(mean).toHaveBeenCalledWith([{ mean: 3 }]);
        const odd = await run({ mode: 'median', attribute: 'score' }, [{ score: 3 }, { score: 1 }, { score: 2 }]);
        expect(odd).toHaveBeenCalledWith([{ median: 2 }]);
        const even = await run({ mode: 'median', attribute: 'score' }, [{ score: 1 }, { score: 4 }]);
        expect(even).toHaveBeenCalledWith([{ median: 2.5 }]);
    });

    it('rounds mean and median results', async () => {
        const mean = await run({ mode: 'mean', attribute: 'score', round: '1' }, [{ score: 1 }, { score: 2 }]);
        expect(mean).toHaveBeenCalledWith([{ mean: 1.5 }]);
        const median = await run({ mode: 'median', attribute: 'score', round: '1' }, [{ score: 1.05 }, { score: 2.05 }]);
        expect(median).toHaveBeenCalledWith([{ median: Number(((1.05 + 2.05) / 2).toFixed(1)) }]);
    });

    it('throws when a sum attribute is not numeric', async () => {
        await expectThrow({ mode: 'sum', attribute: 'score' }, [{ score: 'abc' }], 'must be numeric');
    });

    it('requires an attribute for non-count modes', async () => {
        await expectThrow({ mode: 'mean' }, [{ x: 1 }], 'Attribute is required for mode mean');
    });

    it('rejects --distinct with non-count modes', async () => {
        await expectThrow(
            { mode: 'sum', attribute: 'score', distinct: 'true' },
            [{ score: 1 }],
            '--distinct is only valid with --mode count'
        );
    });

    it('requires an attribute for --distinct', async () => {
        await expectThrow({ mode: 'count', distinct: 'true' }, [{ x: 1 }], '--attribute is required for --distinct');
    });

    it('rejects --round with non-sum/mean/median modes', async () => {
        await expectThrow({ mode: 'count', round: '2' }, [{ x: 1 }], '--round is only valid with --mode sum, mean or median');
    });

    it('groups rows by key, sorting keys ascending', async () => {
        const submit = await run({ mode: 'sum', attribute: 'score', groupBy: 'team' }, [
            { team: 'beta', score: 1 },
            { team: 'beta', score: 2 },
            { team: 'alpha', score: 10 }
        ]);
        expect(submit).toHaveBeenCalledWith([
            { team: 'alpha', sum: 10 },
            { team: 'beta', sum: 3 }
        ]);
    });

    it('handles null and missing group keys', async () => {
        const submit = await run({ mode: 'sum', attribute: 'score', groupBy: 'team' }, [
            { team: 1, score: 5 },
            { team: null, score: 1 },
            { score: 3 },
            { team: 2, score: 7 },
            { team: 'b', score: 8 },
            { team: 'a', score: 9 }
        ]);
        expect(submit).toHaveBeenCalledWith([
            { team: 1, sum: 5 },
            { team: 2, sum: 7 },
            { team: 'a', sum: 9 },
            { team: 'b', sum: 8 },
            { team: null, sum: 4 }
        ]);
    });

    it('handles nested group-by paths with null/missing intermediates', async () => {
        const submit = await run({ mode: 'sum', attribute: 'score', groupBy: 'user.team' }, [
            { user: { team: 'x' }, score: 1 },
            { user: null, score: 2 },
            { user: 'str', score: 3 },
            { user: ['arr'], score: 4 },
            { score: 5 }
        ]);
        expect(submit).toHaveBeenCalledWith([
            { 'user.team': 'x', sum: 1 },
            { 'user.team': null, sum: 14 }
        ]);
    });

    it('counts per group when no attribute is given', async () => {
        const submit = await run({ mode: 'count', groupBy: 'team' }, [{ team: 'a' }, { team: 'a' }, { team: 'b' }]);
        expect(submit).toHaveBeenCalledWith([
            { team: 'a', count: 2 },
            { team: 'b', count: 1 }
        ]);
    });

    it('returns no rows for empty grouped input', async () => {
        const submit = await run({ mode: 'sum', attribute: 'score', groupBy: 'team' }, []);
        expect(submit).toHaveBeenCalledWith([]);
    });

    it('rejects an empty group-by key', async () => {
        await expectThrow({ mode: 'count', groupBy: '' }, [{ x: 1 }], 'Invalid group-by key');
    });

    it('excludes null and missing attribute values when counting', async () => {
        const submit = await run({ mode: 'count', attribute: 'status' }, [
            { status: 'a' },
            { status: 'b' },
            { status: null },
            {}
        ]);
        expect(submit).toHaveBeenCalledWith([{ count: 2 }]);
    });

    it('returns 0 for an empty sum and counts a null-only list as 0', async () => {
        const sum = await run({ mode: 'sum', attribute: 'score' }, []);
        expect(sum).toHaveBeenCalledWith([{ sum: 0 }]);
        const count = await run({ mode: 'count', attribute: 'status' }, [{ status: null }, {}]);
        expect(count).toHaveBeenCalledWith([{ count: 0 }]);
    });

    it('excludes null attribute values within grouped counts', async () => {
        const submit = await run({ mode: 'count', attribute: 'status', groupBy: 'team' }, [
            { team: 'a', status: 'up' },
            { team: 'a', status: 'down' },
            { team: 'a', status: null },
            { team: 'b', status: 'up' },
            { team: 'b', status: null }
        ]);
        expect(submit).toHaveBeenCalledWith([
            { team: 'a', count: 2 },
            { team: 'b', count: 1 }
        ]);
    });
});
