import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';

/**
 * Built-in `json` command. Formats pipeline objects as
 * pretty-printed JSON output.
 */
export class JsonCommand extends Command {
    constructor() {
        super(
            'json',
            'Format pipeline objects as JSON',
            [],
            undefined,
            PipelineInputAcceptance.Array,
            false
        );
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const input = await args.requirePipelineArray();
        ctx.stdout.write(JSON.stringify(input, null, 2) + '\n');
    }
}
