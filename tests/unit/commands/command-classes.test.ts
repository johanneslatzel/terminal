import { describe, it, expect, vi } from 'vitest';
describe('direct unit tests for command classes', () => {
    it('SelectCommand executes without output pipeline', async () => {
        const { SelectCommand } = await import('../../../src/commands/select.js');
        const { CommandArguments } = await import('../../../src/command-arguments.js');

        const cmd = new SelectCommand();
        const ctx: any = {
            output: null,
            logger: { debug: () => {} },
            stdin: { on: () => {}, removeListener: () => {} },
            stdout: { write: vi.fn() },
            state: {}
        };
        const args = new CommandArguments({}, null, cmd.definitions());
        await cmd.execute(ctx, args);
        expect(ctx.stdout.write).toHaveBeenCalledWith(
            expect.stringContaining('intermediate')
        );
    });

    it('SortCommand returns without submitting when no output pipeline', async () => {
        const { SortCommand } = await import('../../../src/commands/sort.js');
        const { CommandArguments } = await import('../../../src/command-arguments.js');

        const cmd = new SortCommand();
        const ctx: any = {
            output: null,
            logger: { debug: () => {} },
            stdin: { on: () => {}, removeListener: () => {} },
            stdout: { write: vi.fn() },
            state: {}
        };
        const args = new CommandArguments({}, null, cmd.definitions(), [{ x: 1 }]);
        await cmd.execute(ctx, args);
        expect(ctx.stdout.write).toHaveBeenCalledWith(
            expect.stringContaining('intermediate')
        );
    });

    it('TableCommand outputs nothing for empty pipeline', async () => {
        const { TableCommand } = await import('../../../src/commands/table.js');
        const { CommandArguments } = await import('../../../src/command-arguments.js');

        const cmd = new TableCommand();
        const stdout = { write: vi.fn() };
        const ctx: any = {
            output: { submit: vi.fn() },
            logger: { debug: () => {} },
            stdin: { on: () => {}, removeListener: () => {} },
            stdout,
            state: {}
        };
        const args = new CommandArguments({}, null, cmd.definitions(), []);
        await cmd.execute(ctx, args);
        expect(stdout.write).not.toHaveBeenCalled();
    });
});

