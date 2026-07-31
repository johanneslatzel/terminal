import type { PipelineOutput } from './types.js';

/**
 * Concrete implementation of {@link PipelineOutput}.
 *
 * Created internally by the terminal for each pipeline segment. Collects
 * emitted output via {@link submit} for forwarding to the next segment.
 *
 * @internal
 */
export class CommandPipeline implements PipelineOutput {
    private _output: Record<string, unknown>[] = [];

    /** Emit a single structured object to the next segment. */
    submit(object: Record<string, unknown>): void;
    /** Emit multiple structured objects at once. */
    submit(objects: Record<string, unknown>[]): void;
    submit(object: Record<string, unknown> | Record<string, unknown>[]): void {
        if (Array.isArray(object)) {
            this._output.push(...object);
        } else {
            this._output.push(object);
        }
    }

    /**
     * Internal: return all output objects accumulated via {@link submit}.
     * Called by the terminal after the segment's command finishes.
     */
    collect(): Record<string, unknown>[] {
        return this._output;
    }
}
