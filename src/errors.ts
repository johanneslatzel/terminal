/** Thrown when no command matches the input tokens. */
export class CommandNotFoundError extends Error {
    /**
     * @param message - Human-readable error description.
     * @param suggestions - Prefix-matched command names to suggest.
     */
    constructor(
        message: string,
        public readonly suggestions: string[] = []
    ) {
        super(message);
        this.name = 'CommandNotFoundError';
    }
}

/** Thrown when a command receives invalid arguments. */
export class InvalidArgumentsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidArgumentsError';
    }
}

/** Thrown when input cannot be tokenized (e.g. unclosed quotes). */
export class ParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ParseError';
    }
}
