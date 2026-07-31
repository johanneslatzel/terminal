import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';
import { z } from 'zod';

/**
 * Built-in `sort` command. Sorts pipeline objects by a
 * specified attribute (or the first attribute by default).
 * Intended as an intermediate pipeline command.
 */
export class SortCommand extends Command {
    constructor() {
        super(
            'sort',
            'Sort pipeline objects by attribute',
            [
                {
                    name: 'attribute',
                    description: 'Attribute to sort by (default: first attribute)',
                    aliases: ['a'],
                    schema: z.string()
                }
            ],
            undefined,
            PipelineInputAcceptance.Array,
            true
        );
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const items = await args.requirePipelineArray();
        if (items.length === 0) return;

        if (!ctx.output) {
            ctx.stdout.write(
                'sort is an intermediate pipeline command. Use it like: cmd | sort [--attribute attr] | next_cmd\n'
            );
            return;
        }

        const sortKey: string = args.has('attribute')
            ? await args.require<string>('attribute')
            : (Object.keys(items[0]!)[0] ?? '');

        if (!sortKey) {
            ctx.output.submit(items);
            return;
        }

        const sorted = [...items].sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') return av - bv;
            return String(av).localeCompare(String(bv));
        });

        ctx.output.submit(sorted);
    }
}
