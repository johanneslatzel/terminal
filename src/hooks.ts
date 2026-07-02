import { Hook } from './hook.js';
import type { Command, CommandContext } from './types.js';
import type { CommandArguments } from './command-arguments.js';

export class TypedHook<TArgs extends any[], TReturn> extends Hook {
    constructor(
        private readonly fn: (...args: TArgs) => TReturn,
        private readonly onDisposeCb: () => void
    ) {
        super();
    }

    exec(...args: TArgs): TReturn {
        return this.fn(...args);
    }

    protected onDispose(): void {
        this.onDisposeCb();
    }
}

export type BeforeParseHook = TypedHook<[string], string | Promise<string>>;
export type AfterParseHook = TypedHook<[string[]], string[] | Promise<string[]>>;
export type BeforeExecuteHook = TypedHook<
    [Command, CommandContext, CommandArguments],
    void | false | Promise<void | false>
>;
export type AfterExecuteHook = TypedHook<[unknown], void | Promise<void>>;
export type BeforeExitHook = TypedHook<[], void | Promise<void>>;
export type OnErrorHook = TypedHook<[Error], void | boolean | Promise<void | boolean>>;
