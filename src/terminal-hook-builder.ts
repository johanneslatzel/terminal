import { Hook } from './hook.js';
import type { Command, CommandContext } from './types.js';
import type { CommandArguments } from './command-arguments.js';

type HookRegistrations = {
    beforeParse: (fn: (input: string) => string | Promise<string>) => Hook;
    afterParse: (fn: (tokens: string[]) => string[] | Promise<string[]>) => Hook;
    beforeExecute: (
        fn: (
            command: Command,
            ctx: CommandContext,
            args: CommandArguments
        ) => void | false | Promise<void | false>
    ) => Hook;
    afterExecute: (fn: (result: unknown) => void | Promise<void>) => Hook;
    beforeExit: (fn: () => void | Promise<void>) => Hook;
    onError: (fn: (error: Error) => void | boolean | Promise<void | boolean>) => Hook;
};

class HookBuilder<T extends (...args: any[]) => any> {
    constructor(private _reg: (fn: T) => Hook) {}
    do(callback: T): Hook {
        return this._reg(callback);
    }
}

/**
 * Entry point for registering terminal lifecycle hooks.
 *
 * Created by calling {@link Terminal.hook}. Select an event with one of the
 * selector methods, then call {@link do} to register the callback.
 *
 * @example
 * ```ts
 * const h = term.hook()
 *     .beforeExecute()
 *     .do((command) => console.log(command.name()));
 * // later: h.dispose();
 * ```
 */
export class TerminalHookBuilder {
    constructor(private _regs: HookRegistrations) {}

    beforeParse(): HookBuilder<(input: string) => string | Promise<string>> {
        return new HookBuilder(this._regs.beforeParse);
    }

    afterParse(): HookBuilder<(tokens: string[]) => string[] | Promise<string[]>> {
        return new HookBuilder(this._regs.afterParse);
    }

    beforeExecute(): HookBuilder<
        (
            command: Command,
            ctx: CommandContext,
            args: CommandArguments
        ) => void | false | Promise<void | false>
    > {
        return new HookBuilder(this._regs.beforeExecute);
    }

    afterExecute(): HookBuilder<(result: unknown) => void | Promise<void>> {
        return new HookBuilder(this._regs.afterExecute);
    }

    beforeExit(): HookBuilder<() => void | Promise<void>> {
        return new HookBuilder(this._regs.beforeExit);
    }

    onError(): HookBuilder<(error: Error) => void | boolean | Promise<void | boolean>> {
        return new HookBuilder(this._regs.onError);
    }
}
