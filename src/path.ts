/**
 * Resolve a dot-notation path (e.g. `user.name`) against a record.
 *
 * Traversal stops at `null`, `undefined`, non-object values and arrays,
 * returning `undefined` for the remainder of the path. This keeps arrays
 * from being indexed via dot notation.
 *
 * @param item - The record to resolve the path against.
 * @param path - Dot-separated property path.
 * @returns The value at the path, or `undefined` when any segment is missing
 *   or traversal hits a non-object.
 */
export function getPath(item: Record<string, unknown>, path: string): unknown {
    let value: unknown = item;
    for (const part of path.split('.')) {
        if (
            value === null ||
            value === undefined ||
            typeof value !== 'object' ||
            Array.isArray(value)
        ) {
            return undefined;
        }
        value = (value as Record<string, unknown>)[part];
    }
    return value;
}
