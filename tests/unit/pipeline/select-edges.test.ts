import { describe, it, expect } from 'vitest';
describe('SelectCommand edge branches', () => {
    it('returns without submitting when pipeline is empty', async () => {
        const { SelectCommand } = await import('../../../src/commands/select.js');
        const { CommandPipeline } = await import('../../../src/command-pipeline.js');
        const { CommandArguments } = await import('../../../src/command-arguments.js');

        const cmd = new SelectCommand();
        const outputPipeline = new CommandPipeline();
        const ctx: any = {
            output: outputPipeline,
            logger: { debug: () => {} },
            stdin: { on: () => {}, removeListener: () => {} },
            stdout: { write: () => {} },
            state: {}
        };
        const args = new CommandArguments({}, null, cmd.definitions(), []);
        await cmd.execute(ctx, args);
        expect(outputPipeline.collect()).toEqual([]);
    });
});
