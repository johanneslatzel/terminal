import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';

/**
 * Parse a JSON document into pipeline records. Accepts either an array of
 * objects or a single object; any other top-level type is rejected.
 *
 * @param text - The JSON document text.
 * @param source - File name used in error messages.
 * @returns The parsed records.
 * @throws {Error} When the document is malformed or not an array/object.
 */
export function parseJson(text: string, source: string): Record<string, unknown>[] {
    // Some editors prepend a UTF-8 byte order mark (U+FEFF) to JSON files.
    // JSON.parse does not accept a leading BOM, so strip it before parsing.
    const clean = text.replace(/^\uFEFF/, '');
    let parsed: unknown;
    try {
        parsed = JSON.parse(clean);
    } catch (error) {
        throw new Error(`Failed to parse JSON in ${source}: ${(error as Error).message}`, {
            cause: error
        });
    }
    if (Array.isArray(parsed)) {
        return parsed.map((item) => {
            if (typeof item !== 'object' || item === null || Array.isArray(item)) {
                throw new Error(`JSON array in ${source} must contain only objects`);
            }
            return item as Record<string, unknown>;
        });
    }
    if (typeof parsed === 'object' && parsed !== null) {
        return [parsed as Record<string, unknown>];
    }
    throw new Error(`JSON document in ${source} must be an array or object`);
}

/**
 * Serialize pipeline records as a JSON array document.
 *
 * @param rows - The records to serialize.
 * @returns A pretty-printed JSON array string.
 */
export function serializeJson(rows: Record<string, unknown>[]): string {
    return JSON.stringify(rows, null, 2);
}

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
        ctx.stdout.write(serializeJson(input) + '\n');
    }
}
