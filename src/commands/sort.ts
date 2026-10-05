import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';
import { z } from 'zod';

/**
 * Compare two values for sorting. Numbers compare numerically,
 * everything else as strings; `null`/`undefined` sort last.
 */
function compareValues(a: unknown, b: unknown): number {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
}

/**
 * Built-in `sort` command. Sorts pipeline objects by one or more
 * comma-separated attribute names; later names act as tie-breakers.
 * Defaults to the first attribute when no names are given.
 * Intended as an intermediate pipeline command.
 *
 * @example
 * ```
 * task list | sort milestone, status, title | table
 * cmd | sort rank | next_cmd
 * cmd | sort | next_cmd
 * ```
 */
export class SortCommand extends Command {
    constructor() {
        super(
            'sort',
            'Sort pipeline objects by attribute(s)',
            [
                {
                    name: 'attributes',
                    description:
                        'Attributes to sort by, later ones as tie-breakers (default: first attribute)',
                    position: 0,
                    schema: z.array(z.string())
                },
                {
                    name: 'descending',
                    description: 'Reverse the sort order',
                    aliases: ['d'],
                    schema: z.boolean()
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
                'sort is an intermediate pipeline command. Use it like: cmd | sort [attr1, attr2] | next_cmd\n'
            );
            return;
        }

        const attributes: string[] = args.has('attributes')
            ? await args.require<string[]>('attributes')
            : (() => {
                  const first = Object.keys(items[0]!)[0];
                  return first ? [first] : [];
              })();

        if (attributes.length === 0) {
            ctx.output.submit(items);
            return;
        }

        const descending = await args.flag('descending');

        const sorted = [...items].sort((a, b) => {
            for (const key of attributes) {
                const cmp = compareValues(a[key], b[key]);
                if (cmp !== 0) return descending ? -cmp : cmp;
            }
            return 0;
        });

        ctx.output.submit(sorted);
    }
}
