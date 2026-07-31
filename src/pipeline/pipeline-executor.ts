import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import { CommandPipeline } from '../command-pipeline.js';
import { parseFlags } from '../input/args-parser.js';
import { CommandArguments } from '../command-arguments.js';
import { InputManager } from '../input-manager.js';
import { InvalidArgumentsError } from '../errors.js';

/**
 * Executes `|`-separated command pipelines.
 *
 * Each segment receives `ctx.output` for writing results (except the last
 * segment, which is the terminal drain). Pipeline input is dispatched
 * according to the receiving command's {@link PipelineInputAcceptance}:
 *
 * - `Array` → {@link CommandArguments.requirePipelineArray} provides all items at once
 * - `Single` → one call per item, serially; pipeline fields auto-mapped to args
 *
 * @internal
 */
export class PipelineExecutor {
    /**
     * @param ctx              - Base execution context for pipeline segments.
     * @param inputManager     - Terminal input manager used to build arguments.
     * @param resolveCommand   - Resolves a segment's tokens to a command + args.
     * @param executeWithHooks - Executes a command through the hook pipeline.
     */
    constructor(
        private readonly ctx: CommandContext,
        private readonly inputManager: InputManager,
        private readonly resolveCommand: (tokens: string[]) => {
            command: Command;
            args: string[];
        },
        private readonly executeWithHooks: (
            command: Command,
            args: CommandArguments,
            ctx?: CommandContext
        ) => Promise<void>
    ) {}

    /**
     * Execute a pipeline: split tokens at `|`, resolve each segment,
     * validate pipeline rules, then execute left-to-right passing output
     * as input.
     *
     * @param tokens - The full tokenized input line containing `|` separators.
     * @throws {InvalidArgumentsError} If pipeline rules are violated.
     */
    async execute(tokens: string[]): Promise<void> {
        const segments = this.splitPipeline(tokens);
        const resolved = segments.map((seg) => this.resolveCommand(seg));

        for (let i = 0; i < resolved.length; i++) {
            const cmd = resolved[i]!.command;
            if (i < resolved.length - 1 && !cmd.providesPipelineOutput()) {
                throw new InvalidArgumentsError(
                    `Command "${cmd.name()}" does not provide pipeline output`
                );
            }
            if (i > 0 && cmd.acceptsPipelineInput() === PipelineInputAcceptance.None) {
                throw new InvalidArgumentsError(
                    `Command "${cmd.name()}" does not accept pipeline input`
                );
            }
        }

        let inputData: Record<string, unknown>[] | null = null;

        for (let i = 0; i < resolved.length; i++) {
            const { command, args: cmdArgs } = resolved[i]!;
            const record = parseFlags(cmdArgs, command.definitions());
            const isLast = i === resolved.length - 1;
            const isFirst = i === 0;

            const outputPipeline = isLast ? undefined : new CommandPipeline();

            if (isFirst) {
                const args = new CommandArguments(record, this.inputManager, command.definitions());
                const pipeCtx: CommandContext = {
                    ...this.ctx,
                    output: outputPipeline
                } as CommandContext;
                await this.executeWithHooks(command, args, pipeCtx);
                inputData = outputPipeline!.collect();
            } else {
                const acceptance = command.acceptsPipelineInput();

                if (acceptance === PipelineInputAcceptance.Array) {
                    const pipeCtx: CommandContext = {
                        ...this.ctx,
                        ...(outputPipeline ? { output: outputPipeline } : {})
                    } as CommandContext;
                    const arrayArgs = new CommandArguments(
                        record,
                        this.inputManager,
                        command.definitions(),
                        inputData!
                    );
                    await this.executeWithHooks(command, arrayArgs, pipeCtx);
                } else {
                    for (const item of inputData!) {
                        const pipeCtx: CommandContext = {
                            ...this.ctx,
                            ...(outputPipeline ? { output: outputPipeline } : {})
                        } as CommandContext;
                        const merged: Record<string, string> = {
                            ...Object.fromEntries(
                                Object.entries(item).map(([k, v]) => [k, String(v)])
                            ),
                            ...record
                        };
                        const itemArgs = new CommandArguments(
                            merged,
                            this.inputManager,
                            command.definitions()
                        );
                        await this.executeWithHooks(command, itemArgs, pipeCtx);
                    }
                }

                if (!isLast && outputPipeline) {
                    inputData = outputPipeline.collect();
                }
            }
        }
    }

    /**
     * Split a token array at `|` boundaries into pipeline segments.
     *
     * @param tokens - The full tokenized input line containing `|` separators.
     * @throws {InvalidArgumentsError} If a segment is empty (leading `|`,
     *   consecutive `| |`, or trailing `|`).
     */
    private splitPipeline(tokens: string[]): string[][] {
        const segments: string[][] = [];
        let current: string[] = [];
        for (const token of tokens) {
            if (token === '|') {
                if (current.length === 0) {
                    throw new InvalidArgumentsError('Empty pipeline segment');
                }
                segments.push(current);
                current = [];
            } else {
                current.push(token);
            }
        }
        if (current.length === 0) {
            throw new InvalidArgumentsError('Pipeline cannot end with |');
        }
        segments.push(current);
        return segments;
    }
}
