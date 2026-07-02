import { Command, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';

/**
 * Built-in `exit` command. Stops the terminal loop.
 */
export class ExitCommand extends Command {
    constructor() {
        super('exit', 'Exit the terminal');
    }

    execute(ctx: CommandContext, _args: CommandArguments): void {
        ctx.exit();
    }
}
