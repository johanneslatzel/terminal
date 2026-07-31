import type { CommandArgumentDefinition } from '../command-arguments.js';

/**
 * Build a map from alias → canonical argument name from arg definitions.
 */
export function buildAliasMap(argDefs?: CommandArgumentDefinition[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const def of argDefs ?? []) {
        for (const alias of def.aliases ?? []) {
            map.set(alias, def.name);
        }
    }
    return map;
}
