import { z } from 'zod';
import { InvalidArgumentsError } from './errors.js';
import { InputManager } from './input-manager.js';

/**
 * Describes a single command-line argument (`--name value`).
 */
export interface CommandArgumentDefinition {
    /** Argument name (without `--` prefix). */
    name: string;
    /** Alternate names for this argument. Single-char aliases use `-x`, multi-char use `--name`. */
    aliases?: string[];
    /** Human-readable description shown in help output. */
    description?: string;
    /** Whether the argument must always be provided. */
    required?: boolean;
    /** Zod schema describing the argument's expected type and constraints. */
    schema: z.ZodType;
    /** 0-based index for positional (bare token) arguments. */
    position?: number;
    /**
     * When `true`, {@link require} prompts with hidden input (no echo)
     * instead of the normal visible prompt.  Ignored when the argument
     * is provided on the command line.
     */
    secret?: boolean;
}

/**
 * Wraps a parsed argument record (`--name value` pairs) and provides
 * typed accessors that validate and coerce values via the argument's
 * {@link CommandArgumentDefinition} zod schema. When an argument is
 * missing and an InputManager is available, the accessor prompts
 * the user interactively.
 *
 * Every `require*` accessor requires a matching
 * {@link CommandArgumentDefinition} to exist for the requested name.
 * If no definition is found, an {@link InvalidArgumentsError} is thrown.
 *
 * ## Choosing an accessor
 *
 * | Accessor | When to use | Schema examples |
 * |---|---|---|
 * | `require<T>(name)` | Value arg that must be present (or prompted). The Zod schema handles all parsing. | `z.coerce.number()`, `z.string().min(1)`, `z.enum([...])` |
 * | `flag(name)` | CLI flag with `--flag` / `--flag false` semantics. Absent → `false`. | `z.boolean()`, `z.literal(true)` |
 *
 * Don't use `z.coerce.boolean()` or `z.boolean({ coerce: true })` in schemas —
 * Zod 4's boolean coercion uses `Boolean()` which turns `"false"` into `true`.
 * Always use `flag(name)` to read boolean arguments instead.
 */
export class CommandArguments {
    /**
     * @param record      - Parsed `--name value` pairs.
     * @param inputManager - InputManager for interactive prompting, or `null`
     *                       to disable prompting and throw on missing args.
     * @param argDefs     - Optional argument definitions used for schema-based
     *                      validation. Looked up by name per accessor call.
     */
    constructor(
        private record: Record<string, string>,
        private inputManager: InputManager | null,
        private argDefs?: CommandArgumentDefinition[]
    ) {}

    /**
     * Check whether an argument was provided on the command line.
     * @param name - Argument name (without `--` prefix).
     */
    has(name: string): boolean {
        return name in this.record;
    }

    /**
     * Return the raw string value of an argument, or `undefined` if
     * the argument was not provided.
     * @param name - Argument name (without `--` prefix).
     */
    raw(name: string): string | undefined {
        return this.record[name];
    }

    /**
     * Return the validated value of an argument. The return type is
     * determined by the generic parameter `T`, which should match
     * the output type of the argument's Zod schema.
     *
     * The schema handles all type coercion (e.g. `z.coerce.number()`
     * converts string `"42"` → number `42`) and constraint validation
     * (e.g. `z.string().min(1)` rejects empty strings).
     *
     * Use this for value-type arguments that must be present or prompted.
     * For boolean flags, use {@link flag} instead.
     *
     * If the argument was not provided on the command line, prompts
     * the user interactively (when an InputManager is available).
     *
     * @example
     * ```ts
     * const name = await args.require<string>('name');
     * const count = await args.require<number>('count');
     * const size = await args.require<string>('size');
     * ```
     *
     * @param name - Argument name (without `--` prefix).
     * @throws {InvalidArgumentsError} When no definition exists for
     *   `name`, when schema validation fails, or when the argument is
     *   missing and no InputManager is available.
     */
    async require<T = unknown>(name: string): Promise<T> {
        const def = this.requireDef(name);
        const raw = await this.resolve(name, def.secret === true);
        const value: unknown =
            def.schema instanceof z.ZodArray
                ? raw
                      .split(',')
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0)
                : raw;
        const parsed = def.schema.safeParse(value);
        if (!parsed.success) {
            throw new InvalidArgumentsError(
                `Argument "${name}": ${parsed.error.issues.map((e) => e.message).join('; ')}`
            );
        }
        return parsed.data as T;
    }

    /**
     * Like {@link require}, but always prompts with hidden input when the
     * argument is not provided on the command line, regardless of the
     * definition's `secret` flag.
     *
     * @example
     * ```ts
     * const password = await args.requireSecret('password');
     * ```
     *
     * @param name - Argument name (without `--` prefix).
     * @throws {InvalidArgumentsError} When no definition exists for
     *   `name`, when schema validation fails, or when the argument is
     *   missing and no InputManager is available.
     */
    async requireSecret(name: string): Promise<string> {
        const raw = await this.resolveSecret(name);
        const def = this.requireDef(name);
        const parsed = def.schema.safeParse(raw);
        if (!parsed.success) {
            throw new InvalidArgumentsError(
                `Argument "${name}": ${parsed.error.issues.map((e) => e.message).join('; ')}`
            );
        }
        return parsed.data as string;
    }

    /**
     * Return the boolean value of a flag argument. Accepts `"true"`,
     * `"false"`, `"1"`, and `"0"` (case-insensitive for true/false).
     *
     * Unlike {@link require}, this method treats a missing argument as
     * `false` — the convention for CLI flags (`--verbose` → true,
     * absent → false).
     *
     * Don't use `z.coerce.boolean()` in your schemas — Zod 4 uses
     * `Boolean()` which turns `"false"` into `true`. Instead, define
     * the schema as `z.boolean()` and always read the value with
     * this method. The string-to-boolean coercion is handled here
     * before the schema validates the result.
     *
     * @example
     * ```ts
     * const verbose = await args.flag('verbose');
     * //   --verbose      → true
     * //   --verbose false → false
     * //   (absent)       → false
     * ```
     *
     * @param name - Argument name (without `--` prefix).
     * @throws {InvalidArgumentsError} When no definition exists for
     *   `name`, or when the value is not a valid boolean string.
     */
    async flag(name: string): Promise<boolean> {
        if (!this.has(name)) return false;
        const raw = this.record[name]!;
        const lower = raw.toLowerCase();
        const bool = lower === 'true' || lower === '1';
        if (!bool && lower !== 'false' && lower !== '0') {
            throw new InvalidArgumentsError(`Argument "${name}" must be a boolean, got "${raw}"`);
        }
        const def = this.requireDef(name);
        const validated = def.schema.safeParse(bool);
        if (!validated.success) {
            throw new InvalidArgumentsError(
                `Argument "${name}": ${validated.error.issues.map((e) => e.message).join('; ')}`
            );
        }
        return validated.data as boolean;
    }

    private async resolve(name: string, useSecret = false): Promise<string> {
        if (name in this.record) {
            return this.record[name]!;
        }
        if (this.inputManager) {
            const prompt = `argument [${name}]: `;
            return useSecret
                ? await this.inputManager.acceptSecret(prompt)
                : await this.inputManager.acceptInput(prompt);
        }
        throw new InvalidArgumentsError(`Argument "${name}" is required but not provided`);
    }

    private async resolveSecret(name: string): Promise<string> {
        return this.resolve(name, true);
    }

    private requireDef(name: string): CommandArgumentDefinition {
        const def = this.argDefs?.find((d) => d.name === name);
        if (!def) {
            throw new InvalidArgumentsError(
                `Argument "${name}" is not defined. Add it to the command's definitions() array.`
            );
        }
        return def;
    }
}
