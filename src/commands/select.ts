import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';
import { z } from 'zod';

/**
 * Built-in `select` command. Picks specified attributes from
 * pipeline objects, passing only those attributes downstream.
 * Intended as an intermediate pipeline command.
 */
export class SelectCommand extends Command {
    constructor() {
        super(
            'select',
            'Pick attributes from pipeline objects',
            [
                {
                    name: 'attributes',
                    description: 'Attribute names to keep (comma-separated)',
                    position: 0,
                    schema: z.array(z.string())
                }
            ],
            undefined,
            PipelineInputAcceptance.Array,
            true
        );
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        if (!ctx.output) {
            ctx.stdout.write(
                'select is an intermediate pipeline command. Use it like: cmd | select attr1,attr2 | next_cmd\n'
            );
            return;
        }

        const items = await args.requirePipelineArray();
        if (items.length === 0) return;

        const attrs: string[] = args.has('attributes')
            ? await args.require<string[]>('attributes')
            : [];

        if (attrs.length === 0) {
            ctx.output.submit(items);
            return;
        }

        for (const item of items) {
            const picked: Record<string, unknown> = {};
            for (const key of attrs) {
                if (Object.hasOwn(item, key)) {
                    picked[key] = item[key];
                }
            }
            ctx.output.submit(picked);
        }
    }
}
