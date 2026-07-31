/**
 * Poll `chunks` until `predicate` returns true or the timeout elapses.
 * Throws with the accumulated output on timeout.
 */
export async function waitForOutput(
    chunks: string[],
    predicate: (s: string) => boolean,
    timeout = 2000
): Promise<void> {
    const start = Date.now();
    while (!predicate(chunks.join(''))) {
        if (Date.now() - start > timeout) {
            throw new Error(`Timeout waiting for output. Got: "${chunks.join('')}"`);
        }
        await new Promise((r) => setTimeout(r, 10));
    }
}
