import { InvalidArgumentsError } from './errors.js';
import type { CommandArgumentDefinition } from './command-arguments.js';

export enum OwnerType {
    Command = 'command',
    Argument = 'argument'
}

/**
 * Validate a single alias string. Throws on empty, whitespace, or if the alias
 * already exists in the given set. On success the alias is added to the set.
 *
 * @param alias    - The alias string to validate.
 * @param ownerType - Owner kind used for error message labels.
 * @param ownerRef - Context string identifying the owner (e.g. `command "help"`).
 * @param seen     - Set of already-registered names to check against for duplicates.
 */
function checkAlias(
    alias: string,
    ownerType: OwnerType,
    ownerRef: string,
    seen: Set<string>
): void {
    if (alias.length === 0) {
        throw new InvalidArgumentsError(`${ownerType} alias cannot be empty`);
    }
    if (/\s/.test(alias)) {
        throw new InvalidArgumentsError(
            `${ownerType} alias "${alias}" must not contain whitespace`
        );
    }
    if (seen.has(alias)) {
        throw new InvalidArgumentsError(`Duplicate alias "${alias}" in ${ownerRef}`);
    }
    seen.add(alias);
}

/**
 * Validate aliases for a single command or argument definition.
 * Checks: non-empty, no whitespace, no duplicates, no self-redundancy.
 *
 * When a `reserved` set is provided it is used to pre-seed the seen names,
 * so aliases colliding with reserved names are caught as duplicates.
 * The self-redundancy check is skipped in this mode (used for cross-definition
 * arg alias validation where `ownerName` refers to the command, not the arg).
 */
export function validateAliases(
    aliases: string[] | undefined,
    ownerType: OwnerType,
    ownerName: string,
    reserved?: Set<string>
): void {
    if (!aliases) return;
    const seen = new Set(reserved);
    for (const alias of aliases) {
        checkAlias(alias, ownerType, `${ownerType} "${ownerName}"`, seen);
    }
    if (!reserved && aliases.includes(ownerName)) {
        throw new InvalidArgumentsError(
            `Alias "${ownerName}" in ${ownerType} "${ownerName}" is redundant (matches the ${ownerType} name)`
        );
    }
}

/**
 * Validate argument definition aliases across all definitions in a command.
 * Flattens all aliases and delegates to {@link validateAliases} with the
 * canonical argument names as reserved identifiers.
 */
export function validateArgDefAliases(
    defs: CommandArgumentDefinition[],
    commandName: string
): void {
    const reserved = new Set(defs.map((d) => d.name));
    const allAliases: string[] = [];
    for (const def of defs) {
        for (const alias of def.aliases ?? []) {
            allAliases.push(alias);
        }
    }
    validateAliases(allAliases, OwnerType.Argument, commandName, reserved);
}
