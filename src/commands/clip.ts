import { spawn } from 'node:child_process';
import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';

/**
 * Attempt to copy text to the system clipboard, trying each
 * available clipboard tool (pbcopy, xclip, xsel, clip) in turn.
 * Falls through to the next tool on error or non-zero exit.
 */
const CLIPBOARD_TOOLS = [
    { cmd: 'pbcopy', args: [] },
    { cmd: 'xclip', args: ['-selection', 'clipboard'] },
    { cmd: 'xsel', args: ['--clipboard', '--input'] },
    { cmd: 'clip', args: [] }
];

function copyToClipboard(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        function tryTool(index: number) {
            if (index >= CLIPBOARD_TOOLS.length) {
                reject(new Error('No clipboard tool found. Install pbcopy, xclip, xsel, or clip.'));
                return;
            }
            const { cmd, args } = CLIPBOARD_TOOLS[index]!;
            const proc = spawn(cmd, args, { stdio: 'pipe' });
            proc.on('error', () => tryTool(index + 1));
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else tryTool(index + 1);
            });
            proc.stdin.write(text);
            proc.stdin.end();
        }
        tryTool(0);
    });
}

/**
 * Built-in `clip` command. Copies pipeline objects to the system
 * clipboard as JSON. Tries pbcopy, xclip, xsel, and clip in order.
 */
export class ClipCommand extends Command {
    constructor() {
        super(
            'clip',
            'Copy pipeline objects to clipboard as JSON',
            [],
            undefined,
            PipelineInputAcceptance.Array,
            false
        );
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const input = await args.requirePipelineArray();
        if (input.length === 0) {
            ctx.stdout.write('No pipeline input to copy to clipboard.\n');
            return;
        }

        const text = JSON.stringify(input);

        try {
            await copyToClipboard(text);
            ctx.stdout.write('Copied ' + String(input.length) + ' object(s) to clipboard.\n');
        } catch (err) {
            ctx.stdout.write('Clipboard error: ' + (err as Error).message + '\n');
        }
    }
}
