import { Command, CommandContainer, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';
import { z } from 'zod';
import { InvalidArgumentsError } from '../errors.js';
import type { Terminal } from '../terminal.js';

/**
 * Leaf command representing a single registered shortcut in the
 * command tree. Exists so shortcuts appear in tab completion and
 * help output; expansion itself happens before tokenization.
 */
export class ShortcutEntryCommand extends Command {
    /**
     * @param name          - Shortcut name used as the command name.
     * @param commandString - Stored command string shown in help/output.
     */
    constructor(
        name: string,
        private readonly commandString: string
    ) {
        super(name, `Shortcut: ${commandString}`);
    }

    execute(ctx: CommandContext, _args: CommandArguments): void {
        ctx.stdout.write(`Shortcut: ${this.commandString}\n`);
    }
}

/** Base for `shortcut` subcommands that operate on a specific name. */
abstract class NamedShortcutCommand extends Command {
    constructor(name: string, description: string) {
        super(name, description, [
            {
                name: 'name',
                description: 'Shortcut name',
                position: 0,
                schema: z.string().min(1)
            }
        ]);
    }
}

/**
 * `shortcut add <name> <command>` — creates or updates a shortcut and
 * registers it in the command tree. The name must not contain whitespace
 * and must not shadow a registered command (updating an existing
 * shortcut under its own name is allowed).
 */
class AddShortcutCommand extends Command {
    constructor(private readonly term: Terminal) {
        super('add', 'Create or update a shortcut', [
            {
                name: 'name',
                description: 'Shortcut name',
                position: 0,
                schema: z.string().min(1)
            },
            {
                name: 'command',
                description: 'Command string to store (quote if it contains flags)',
                position: 1,
                schema: z.string().min(1)
            }
        ]);
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const name = await args.require<string>('name');
        if (/\s/.test(name)) {
            throw new InvalidArgumentsError(`Shortcut name "${name}" must not contain whitespace`);
        }
        const shadowed = this.term.getRootCommands().find((c) => c.matches(name));
        if (shadowed && !this.term.shortcutStore.has(name)) {
            throw new InvalidArgumentsError(`"${name}" is a reserved command name`);
        }
        const commandString = await args.require<string>('command');

        this.term.shortcutStore.add(name, commandString);
        await this.term.registerShortcutCommand(name, commandString);
        ctx.stdout.write(`Saved shortcut "${name}".\n`);
    }
}

/**
 * `shortcut save <name>` — saves the most recently executed command
 * (last history entry) as a named shortcut.
 */
class SaveShortcutCommand extends NamedShortcutCommand {
    constructor(private readonly term: Terminal) {
        super('save', 'Save the last executed command as a shortcut');
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const name = await args.require<string>('name');
        const last = ctx.terminal.historyEntries.at(-1);
        if (last === undefined) {
            throw new InvalidArgumentsError('No commands in history to save');
        }

        this.term.shortcutStore.add(name, last);
        await this.term.registerShortcutCommand(name, last);
        ctx.stdout.write(`Saved shortcut "${name}".\n`);
    }
}

/**
 * `shortcut remove <name>` — deletes a shortcut from the store and
 * the command tree.
 */
class RemoveShortcutCommand extends NamedShortcutCommand {
    constructor(private readonly term: Terminal) {
        super('remove', 'Remove a shortcut');
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const name = await args.require<string>('name');
        if (!this.term.shortcutStore.remove(name)) {
            throw new InvalidArgumentsError(`Unknown shortcut: ${name}`);
        }
        await this.term.unregisterShortcutCommand(name);
        ctx.stdout.write(`Removed shortcut "${name}".\n`);
    }
}

/**
 * `shortcut list` — prints all shortcuts as `name → command` lines.
 */
class ListShortcutCommand extends Command {
    constructor(private readonly term: Terminal) {
        super('list', 'List all shortcuts');
    }

    async execute(ctx: CommandContext, _args: CommandArguments): Promise<void> {
        const all = this.term.shortcutStore.all();
        if (all.size === 0) {
            ctx.stdout.write('No shortcuts defined.\n');
            return;
        }
        for (const [name, commandString] of all) {
            ctx.stdout.write(`${name} → ${commandString}\n`);
        }
    }
}

/**
 * `shortcut show <name>` — prints the command string for a shortcut.
 */
class ShowShortcutCommand extends NamedShortcutCommand {
    constructor(private readonly term: Terminal) {
        super('show', 'Show the command string of a shortcut');
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const name = await args.require<string>('name');
        const commandString = this.term.shortcutStore.get(name);
        if (commandString === undefined) {
            throw new InvalidArgumentsError(`Unknown shortcut: ${name}`);
        }
        ctx.stdout.write(`${commandString}\n`);
    }
}

/**
 * Built-in `shortcut` command container. Subcommands: `add`, `save`,
 * `remove`, `list`, `show`. This is the user-facing interface for
 * managing persistent command shortcuts.
 */
export class ShortcutCommand extends CommandContainer {
    /**
     * @param term - The owning terminal (provides store/tree/history access).
     */
    constructor(term: Terminal) {
        super('shortcut', 'Manage persistent command shortcuts');
        this.add(new AddShortcutCommand(term));
        this.add(new SaveShortcutCommand(term));
        this.add(new RemoveShortcutCommand(term));
        this.add(new ListShortcutCommand(term));
        this.add(new ShowShortcutCommand(term));
    }
}
