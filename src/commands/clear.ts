import { Command, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';

/**
 * Built-in `clear` command. Clears the terminal screen.
 */
export class ClearCommand extends Command {
    constructor() {
        super('clear', 'Clear terminal');
    }

    execute(ctx: CommandContext, _args: CommandArguments): void {
        ctx.stdout.write('\x1Bc');
    }
}
