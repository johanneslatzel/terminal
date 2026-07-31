import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';

/**
 * Render a single cell value as text. Nested objects and arrays are
 * JSON-stringified; `null`/missing values render as empty cells.
 */
function cellText(v: unknown): string {
    if (typeof v === 'object' && v !== null) return JSON.stringify(v);
    return String(v ?? '');
}

/**
 * Built-in `table` command. Renders pipeline objects as a
 * formatted text table with aligned columns.
 */
export class TableCommand extends Command {
    constructor() {
        super(
            'table',
            'Render pipeline objects as a table',
            [],
            undefined,
            PipelineInputAcceptance.Array,
            false
        );
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const rows = await args.requirePipelineArray();
        if (rows.length === 0) return;

        const keys = new Set<string>();
        for (const row of rows) {
            for (const key of Object.keys(row)) {
                keys.add(key);
            }
        }
        const columns = Array.from(keys);
        if (columns.length === 0) return;

        const cellWidths = columns.map((key) => {
            let max = key.length;
            for (const row of rows) {
                const val = cellText(row[key]);
                if (val.length > max) max = val.length;
            }
            return max;
        });

        const renderRow = (cells: string[]): string => {
            return (
                '| ' +
                cells
                    .map((c, i) => {
                        const w = cellWidths[i]!;
                        return c + ' '.repeat(Math.max(0, w - c.length));
                    })
                    .join(' | ') +
                ' |'
            );
        };

        const separator =
            '|' + columns.map((_, i) => '-'.repeat(cellWidths[i]! + 2)).join('|') + '|';

        const lines: string[] = [];
        lines.push(renderRow(columns));
        lines.push(separator);
        for (const row of rows) {
            lines.push(renderRow(columns.map((k) => cellText(row[k]))));
        }
        ctx.stdout.write(lines.join('\n') + '\n');
    }
}
