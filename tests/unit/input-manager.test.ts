import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { InputManager, InputMode } from '../../src/input-manager.js';
import { InterruptedError } from '../../src/errors.js';

function makeTtyStreams(): { stdin: any; stdout: any; stdoutChunks: string[] } {
    const stdin = Object.assign(new PassThrough(), {
        isTTY: true,
        isRaw: false,
        setRawMode: function (this: any, mode: boolean) {
            this.isRaw = mode;
        }
    });
    const stdoutChunks: string[] = [];
    const stdout = new PassThrough();
    stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk.toString()));
    return { stdin, stdout, stdoutChunks };
}

function makeNonTtyStreams(): { stdin: any; stdout: any; stdoutChunks: string[] } {
    const stdin = Object.assign(new PassThrough(), { isTTY: false });
    const stdoutChunks: string[] = [];
    const stdout = new PassThrough();
    stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk.toString()));
    return { stdin, stdout, stdoutChunks };
}

function makeMockRl(): any {
    const rl: any = new EventEmitter();
    rl.prompt = () => {};
    rl.setPrompt = () => {};
    rl.close = () => {};
    rl.pause = () => {};
    rl.resume = () => {};
    return rl;
}

function makeManager(
    onCommand?: (line: string) => void,
    onClose?: () => void,
    tty = true,
    silentSigint = false
) {
    const { stdin, stdout, stdoutChunks } = tty ? makeTtyStreams() : makeNonTtyStreams();
    const commandCb = onCommand ?? (() => {});
    const im = new InputManager(stdin, stdout, commandCb, onClose, silentSigint);
    const rl = makeMockRl();
    return { im, stdin, stdout, stdoutChunks, rl, commandCb };
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('InputManager', () => {
    describe('constructor', () => {
        it('creates an instance with no errors', () => {
            const { im } = makeManager();
            expect(im).toBeInstanceOf(InputManager);
        });

        it('getReadline returns null before start', () => {
            const { im } = makeManager();
            expect(im.getReadline()).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // start / stop
    // -----------------------------------------------------------------------

    describe('start', () => {
        it('attaches readline and returns it via getReadline', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            expect(im.getReadline()).toBe(rl);
        });

        it('routes lines to onCommand in command mode', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            rl.emit('line', 'hello');
            rl.emit('line', 'world');
            expect(received).toEqual(['hello', 'world']);
        });

        it('writes ^C and re-prompts on SIGINT', () => {
            const { im, rl, stdoutChunks } = makeManager();
            let prompted = false;
            rl.prompt = () => { prompted = true; };
            im.start(rl);
            rl.emit('SIGINT');
            expect(stdoutChunks.join('')).toContain('^C');
            expect(prompted).toBe(true);
        });

        it('does not write ^C on SIGINT when silentSigint is true', () => {
            const { im, rl, stdoutChunks } = makeManager(undefined, undefined, true, true);
            let prompted = false;
            rl.prompt = () => { prompted = true; };
            im.start(rl);
            rl.emit('SIGINT');
            expect(stdoutChunks.join('')).not.toContain('^C');
            expect(prompted).toBe(true);
        });

        it('still clears the line on SIGINT when silentSigint is true', () => {
            const { im, rl, stdoutChunks } = makeManager(undefined, undefined, true, true);
            rl.prompt = () => {};
            im.start(rl);
            rl.emit('SIGINT');
            const output = stdoutChunks.join('');
            // Line clear + cursor reset write ANSI escape sequences (ESC prefix)
            const ESC = String.fromCharCode(0x1b);
            expect(output.startsWith(ESC)).toBe(true);
            expect(output).not.toContain('^C');
        });

        it('clears the current line before writing ^C on SIGINT', () => {
            const { im, rl, stdoutChunks } = makeManager();
            im.start(rl);
            rl.emit('SIGINT');
            const output = stdoutChunks.join('');
            expect(output).toContain('^C');
            // readline.clearLine(stream, -1) and readline.cursorTo(stream, 0)
            // write ANSI escape sequences for line clear and cursor positioning.
            // Check that output starts with ESC (0x1B) — the escape sequences
            // precede the ^C text.
            const ESC = String.fromCharCode(0x1b);
            expect(output.startsWith(ESC)).toBe(true);
        });

        it('writes newline and calls onClose on close', () => {
            let closed = false;
            const { im, rl, stdoutChunks } = makeManager(undefined, () => { closed = true; });
            im.start(rl);
            rl.emit('close');
            expect(stdoutChunks.join('')).toContain('\n');
            expect(closed).toBe(true);
        });

        it('writes error message on readline error', () => {
            const { im, rl, stdoutChunks } = makeManager();
            im.start(rl);
            rl.emit('error', new Error('bad input'));
            expect(stdoutChunks.join('')).toContain('Readline error: bad input');
        });
    });

    describe('stop', () => {
        it('closes rl and pauses stdin', () => {
            let closed = false;
            let paused = false;
            const { im, rl, stdin } = makeManager();
            rl.close = () => { closed = true; };
            stdin.pause = () => { paused = true; };
            im.start(rl);
            im.stop();
            expect(closed).toBe(true);
            expect(paused).toBe(true);
            expect(im.getReadline()).toBeNull();
        });

        it('is safe to call when not started', () => {
            const { im } = makeManager();
            // should not throw
            im.stop();
            expect(im.getReadline()).toBeNull();
        });

        it('is safe to call twice', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            im.stop();
            im.stop(); // second call should be a no-op
            expect(im.getReadline()).toBeNull();
        });

        it('resets mode to command', () => {
            const received: string[] = [];
            const { stdin, stdout } = makeTtyStreams();
            const im = new InputManager(stdin, stdout, (line) => received.push(line));
            const rl1 = makeMockRl();
            im.start(rl1);
            im.drop();
            im.stop();
            // After stop, mode is reset to command — use a fresh rl
            const rl2 = makeMockRl();
            im.start(rl2);
            rl2.emit('line', 'test');
            expect(received).toEqual(['test']);
        });
    });

    // -----------------------------------------------------------------------
    // prompt / setPrompt
    // -----------------------------------------------------------------------

    describe('prompt', () => {
        it('delegates to rl.prompt()', () => {
            let called = false;
            const { im, rl } = makeManager();
            rl.prompt = () => { called = true; };
            im.start(rl);
            im.prompt();
            expect(called).toBe(true);
        });

        it('is a no-op when rl is null', () => {
            const { im } = makeManager();
            // should not throw
            im.prompt();
        });
    });

    describe('setPrompt', () => {
        it('delegates to rl.setPrompt()', () => {
            let received: string | undefined;
            const { im, rl } = makeManager();
            rl.setPrompt = (p: string) => { received = p; };
            im.start(rl);
            im.setPrompt('new> ');
            expect(received).toBe('new> ');
        });

        it('is a no-op when rl is null', () => {
            const { im } = makeManager();
            // should not throw
            im.setPrompt('new> ');
        });
    });

    // -----------------------------------------------------------------------
    // drop
    // -----------------------------------------------------------------------

    describe('drop', () => {
        it('sets mode to drop — lines are not forwarded', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            im.drop();
            rl.emit('line', 'dropped');
            expect(received).toEqual([]);
        });

        it('clears pendingResolve', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('prompt: ');
            // deliver a line to resolve acceptInput
            rl.emit('line', 'answer');
            await promise;
            // drop should clear any pending — no error after stop/drop
            im.drop();
        });

        it('is a no-op when rl is null (before start)', () => {
            const { im } = makeManager();
            // should not throw, just sets mode
            im.drop();
        });

        it('sets raw mode and pauses stdin on TTY', () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.drop();
            expect(stdin.isRaw).toBe(true);
        });

        it('defaults savedRawMode to false when isRaw is undefined', () => {
            const stdin: any = Object.assign(new PassThrough(), {
                isTTY: true,
                setRawMode: function (this: any, mode: boolean) {
                    this.isRaw = mode;
                }
            });
            const stdoutChunks: string[] = [];
            const stdout: any = new PassThrough();
            stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk.toString()));
            const im = new InputManager(stdin, stdout, () => {});
            const rl = makeMockRl();
            im.start(rl);
            im.drop();
            expect(stdin.isRaw).toBe(true);
        });

        it('does not pause rl on non-TTY — onLine discards lines in drop mode', () => {
            let paused = false;
            const { im, rl } = makeManager(undefined, undefined, false);
            rl.pause = () => { paused = true; };
            im.start(rl);
            im.drop();
            expect(paused).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // acceptInput
    // -----------------------------------------------------------------------

    describe('acceptInput', () => {
        it('throws when not started', () => {
            const { im } = makeManager();
            expect(() => im.acceptInput('p: ')).toThrow('InputManager not started');
        });

        it('writes the prompt to stdout', () => {
            const { im, rl, stdoutChunks } = makeManager();
            im.start(rl);
            im.acceptInput('Enter value: ');
            expect(stdoutChunks.join('')).toContain('Enter value: ');
        });

        it('resolves with the next line', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('name: ');
            rl.emit('line', 'alice');
            expect(await promise).toBe('alice');
        });

        it('resumes rl before waiting', async () => {
            let resumed = false;
            const { im, rl } = makeManager();
            rl.resume = () => { resumed = true; };
            im.start(rl);
            im.acceptInput('p: ');
            expect(resumed).toBe(true);
        });

        it('restores previous mode to command after resolve', async () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            const promise = im.acceptInput('p: ');
            rl.emit('line', 'answer');
            await promise;
            // now in command mode again
            rl.emit('line', 'next-command');
            expect(received).toEqual(['next-command']);
        });

        it('restores to drop mode if called while in drop', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.drop();
            const promise = im.acceptInput('p: ');
            // acceptInput resumes stdin on TTY
            rl.emit('line', 'answer');
            await promise;
            // should be back in drop mode — raw mode on
            expect(stdin.isRaw).toBe(true);
        });

        it('rejects on stdin end', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('p: ');
            stdin.emit('end');
            await expect(promise).rejects.toThrow('stdin closed');
        });

        it('removes stdin end listener after line resolves', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('p: ');
            rl.emit('line', 'ok');
            await promise;
            expect(stdin.listenerCount('end')).toBe(0);
        });

        it('sets raw mode true when echo is false on TTY', () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.acceptInput('p: ', false);
            expect(stdin.isRaw).toBe(true); // !echo => true
        });

        it('sets raw mode false when echo is true on TTY', () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.acceptInput('p: ', true);
            expect(stdin.isRaw).toBe(false); // !echo => false
        });

        it('resumes stdin on TTY', () => {
            let resumed = false;
            const { im, rl, stdin } = makeManager();
            stdin.resume = () => { resumed = true; };
            im.start(rl);
            im.acceptInput('p: ');
            expect(resumed).toBe(true);
        });

        it('rejects with InterruptedError on SIGINT', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('p: ');
            rl.emit('SIGINT');
            await expect(promise).rejects.toBeInstanceOf(InterruptedError);
        });

        it('restores previous mode to command on SIGINT', async () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            const promise = im.acceptInput('p: ');
            rl.emit('SIGINT');
            await expect(promise).rejects.toBeInstanceOf(InterruptedError);
            // mode should be restored to command
            rl.emit('line', 'next-command');
            expect(received).toEqual(['next-command']);
        });

        it('does not call rl.prompt on SIGINT during accept', async () => {
            let prompted = false;
            const { im, rl } = makeManager();
            rl.prompt = () => { prompted = true; };
            im.start(rl);
            const promise = im.acceptInput('p: ');
            rl.emit('SIGINT');
            await expect(promise).rejects.toBeInstanceOf(InterruptedError);
            expect(prompted).toBe(false);
        });

        it('accepts new input after SIGINT cancels previous prompt', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const p1 = im.acceptInput('1: ');
            rl.emit('SIGINT');
            await expect(p1).rejects.toBeInstanceOf(InterruptedError);
            // new acceptInput should work normally
            const p2 = im.acceptInput('2: ');
            rl.emit('line', 'second');
            expect(await p2).toBe('second');
        });

        it('removes stdin end listener after SIGINT', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('p: ');
            expect(stdin.listenerCount('end')).toBe(1);
            rl.emit('SIGINT');
            await expect(promise).rejects.toBeInstanceOf(InterruptedError);
            expect(stdin.listenerCount('end')).toBe(0);
        });

        it('rejects with InterruptedError on SIGINT with echo=false', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('p: ', false);
            rl.emit('SIGINT');
            await expect(promise).rejects.toBeInstanceOf(InterruptedError);
        });

        it('restores to drop mode on SIGINT when acceptInput was called from drop', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.drop();
            const promise = im.acceptInput('p: ');
            rl.emit('SIGINT');
            await expect(promise).rejects.toBeInstanceOf(InterruptedError);
            // should be back in drop mode — raw mode on
            expect(stdin.isRaw).toBe(true);
        });

        it('does not write ^C on SIGINT during accept when silentSigint is true', async () => {
            const { im, rl, stdoutChunks } = makeManager(undefined, undefined, true, true);
            im.start(rl);
            const promise = im.acceptInput('p: ');
            rl.emit('SIGINT');
            await expect(promise).rejects.toBeInstanceOf(InterruptedError);
            expect(stdoutChunks.join('')).not.toContain('^C');
        });
    });

    // -----------------------------------------------------------------------
    // acceptSecret
    // -----------------------------------------------------------------------

    describe('acceptSecret', () => {
        it('falls back to acceptInput on non-TTY', async () => {
            const { im, rl } = makeManager(undefined, undefined, false);
            im.start(rl);
            const promise = im.acceptSecret('password: ');
            rl.emit('line', 'secret123');
            expect(await promise).toBe('secret123');
        });

        it('throws when not started on TTY', async () => {
            const { im } = makeManager();
            await expect(im.acceptSecret('p: ')).rejects.toThrow('InputManager not started');
        });

        it('removes data listeners and restores them after resolve', async () => {
            const { im, rl, stdin } = makeManager();
            const dataListener = () => {};
            stdin.on('data', dataListener);
            const originalCount = stdin.listenerCount('data');

            im.start(rl);
            // acceptSecret on TTY uses readRawTerminal which reads raw
            // We can test the listener preservation by checking the count after
            const promise = im.acceptSecret('p: ');
            // Simulate the secret input by writing a line
            stdin.write('secret\n');
            await promise;

            // data listeners should be restored
            expect(stdin.listenerCount('data')).toBe(originalCount);
        });

        it('restores previous mode after resolve', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.drop(); // start in drop mode
            const promise = im.acceptSecret('p: ');
            stdin.write('secret\n');
            await promise;
            // should be back in drop mode
            expect(stdin.isRaw).toBe(true);
        });

        it('falls back to acceptInput with echo=false for non-TTY acceptSecret', async () => {
            const { im, rl } = makeManager(undefined, undefined, false);
            im.start(rl);
            const promise = im.acceptSecret('p: ');
            rl.emit('line', 'data');
            expect(await promise).toBe('data');
        });

        it('returns empty string on SIGINT in non-TTY mode', async () => {
            const { im, rl } = makeManager(undefined, undefined, false);
            im.start(rl);
            const promise = im.acceptSecret('p: ');
            rl.emit('SIGINT');
            expect(await promise).toBe('');
        });

        it('propagates non-InterruptedError from acceptInput on non-TTY', async () => {
            const { im, rl, stdin } = makeManager(undefined, undefined, false);
            im.start(rl);
            const promise = im.acceptSecret('p: ');
            stdin.emit('end');
            await expect(promise).rejects.toThrow('stdin closed');
        });
    });

    // -----------------------------------------------------------------------
    // setEcho
    // -----------------------------------------------------------------------

    describe('setEcho', () => {
        it('sets raw mode when echo is toggled off on TTY', () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.setEcho(false);
            expect(stdin.isRaw).toBe(true);
        });

        it('clears raw mode when echo is toggled on on TTY', () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.setEcho(false);
            im.setEcho(true);
            expect(stdin.isRaw).toBe(false);
        });

        it('is a no-op when rl is null', () => {
            const { im } = makeManager();
            im.setEcho(false);
            // no error
        });

        it('is a no-op on non-TTY', () => {
            const { im, rl } = makeManager(undefined, undefined, false);
            im.start(rl);
            im.setEcho(false);
            // no raw mode on non-TTY, just a no-op
        });
    });

    // -----------------------------------------------------------------------
    // onLine routing (direct)
    // -----------------------------------------------------------------------

    describe('onLine routing', () => {
        it('command mode: forwards to onCommand', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            rl.emit('line', 'a');
            rl.emit('line', 'b');
            expect(received).toEqual(['a', 'b']);
        });

        it('drop mode: silently discards', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            im.drop();
            rl.emit('line', 'x');
            rl.emit('line', 'y');
            expect(received).toEqual([]);
        });

        it('accept mode: resolves pending promise', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const p1 = im.acceptInput('1: ');
            rl.emit('line', 'first');
            expect(await p1).toBe('first');
            const p2 = im.acceptInput('2: ');
            rl.emit('line', 'second');
            expect(await p2).toBe('second');
        });

        it('accept mode with no pendingResolve: no-op', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            // switch to accept but don't call acceptInput
            (im as any).mode = InputMode.Accept;
            // should not throw
            rl.emit('line', 'orphan');
        });

        it('transitions: command -> accept -> command', async () => {
            const commands: string[] = [];
            const { im, rl } = makeManager((line) => commands.push(line));
            im.start(rl);
            rl.emit('line', 'cmd1');
            const p = im.acceptInput('value: ');
            rl.emit('line', 'val');
            await p;
            rl.emit('line', 'cmd2');
            expect(commands).toEqual(['cmd1', 'cmd2']);
        });

        it('transitions: command -> drop -> accept -> drop', async () => {
            const commands: string[] = [];
            const { im, rl } = makeManager((line) => commands.push(line));
            im.start(rl);
            im.drop();
            const p = im.acceptInput('value: ');
            rl.emit('line', 'val');
            await p;
            // should be back in drop
            rl.emit('line', 'dropped');
            expect(commands).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // restoreMode
    // -----------------------------------------------------------------------

    describe('restoreMode', () => {
        it('restores to command: resumes rl', () => {
            let resumed = false;
            const { im, rl } = makeManager();
            rl.resume = () => { resumed = true; };
            im.start(rl);
            im.drop();
            im.acceptInput('p: ');
            rl.emit('line', 'x');
            // acceptInput cleanup calls restoreMode('command')
            expect(resumed).toBe(true);
        });

        it('restores to drop on TTY: sets raw mode and resumes stdin', () => {
            let stdinResumed = false;
            const { im, rl, stdin } = makeManager();
            stdin.resume = () => { stdinResumed = true; };
            im.start(rl);
            // Call acceptInput while in drop mode
            im.drop();
            im.acceptInput('p: ');
            rl.emit('line', 'x');
            // After resolve, mode is restored to drop
            expect(stdin.isRaw).toBe(true);
            expect(stdinResumed).toBe(true);
        });

        it('restores to drop on non-TTY without pausing rl', () => {
            let paused = false;
            const { im, rl } = makeManager(undefined, undefined, false);
            rl.pause = () => { paused = true; };
            im.start(rl);
            im.drop();
            im.acceptInput('p: ');
            rl.emit('line', 'x');
            expect(paused).toBe(false);
        });

        it('restoreMode skips when rl is null on non-TTY drop', async () => {
            const { im, rl, stdin } = makeManager(undefined, undefined, false);
            im.start(rl);
            im.drop();
            const promise = im.acceptInput('p: ');
            im.stop();
            stdin.emit('end');
            await expect(promise).rejects.toThrow('stdin closed');
        });

        it('restoreMode is no-op for unknown mode', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            (im as any).restoreMode(InputMode.Accept);
        });
    });

    // -----------------------------------------------------------------------
    // restoreCommandMode
    // -----------------------------------------------------------------------

    describe('restoreCommandMode', () => {
        it('is a no-op when rl is null', () => {
            const { im } = makeManager();
            // should not throw
            im.restoreCommandMode();
        });

        it('resumes rl and stdin on TTY', () => {
            let rlResumed = false;
            let stdinResumed = false;
            const { im, rl, stdin } = makeManager();
            rl.resume = () => { rlResumed = true; };
            stdin.resume = () => { stdinResumed = true; };
            im.start(rl);
            im.restoreCommandMode();
            expect(rlResumed).toBe(true);
            expect(stdinResumed).toBe(true);
        });

        it('resumes rl but not stdin on non-TTY', () => {
            let rlResumed = false;
            let stdinResumed = false;
            const { im, rl, stdin } = makeManager(undefined, undefined, false);
            rl.resume = () => { rlResumed = true; };
            stdin.resume = () => { stdinResumed = true; };
            im.start(rl);
            im.restoreCommandMode();
            expect(rlResumed).toBe(true);
            expect(stdinResumed).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // getReadline
    // -----------------------------------------------------------------------

    describe('getReadline', () => {
        it('returns null before start', () => {
            const { im } = makeManager();
            expect(im.getReadline()).toBeNull();
        });

        it('returns rl after start', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            expect(im.getReadline()).toBe(rl);
        });

        it('returns null after stop', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            im.stop();
            expect(im.getReadline()).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // start/stop lifecycle
    // -----------------------------------------------------------------------

    describe('lifecycle', () => {
        it('start after stop re-attaches cleanly', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            im.stop();
            const rl2 = makeMockRl();
            im.start(rl2);
            rl2.emit('line', 'restarted');
            expect(received).toEqual(['restarted']);
            expect(im.getReadline()).toBe(rl2);
        });

        it('stop resets pending acceptInput', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('p: ');
            im.stop();
            // stdin end triggers reject since pendingResolve is cleared
            stdin.emit('end');
            await expect(promise).rejects.toThrow('stdin closed');
        });
    });
});
