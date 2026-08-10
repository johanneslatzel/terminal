import { describe, it, expect } from 'vitest';
import { InterruptedError } from '../../../src/errors.js';
import { makeManager } from '../../helpers/make-input-manager.js';

describe('InputManager', () => {
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

        it('swaps readline prompt to the accept prompt while prompting', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            im.acceptInput('Enter value: ');
            expect(rl.getPrompt()).toBe('Enter value: ');
        });

        it('restores the previous readline prompt after resolve', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('Enter value: ');
            rl.emit('line', 'ok');
            await promise;
            expect(rl.getPrompt()).toBe('> ');
        });

        it('restores the previous readline prompt on SIGINT', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('Enter value: ');
            rl.emit('SIGINT');
            await expect(promise).rejects.toBeInstanceOf(InterruptedError);
            expect(rl.getPrompt()).toBe('> ');
        });

        it('restores the previous readline prompt when stdin closes', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('Enter value: ');
            stdin.emit('end');
            await expect(promise).rejects.toThrow('stdin closed');
            expect(rl.getPrompt()).toBe('> ');
        });

        it('restores a custom prompt set before acceptInput', async () => {
            const { im, rl } = makeManager();
            rl.setPrompt('λ ');
            im.start(rl);
            const promise = im.acceptInput('Enter value: ');
            rl.emit('line', 'ok');
            await promise;
            expect(rl.getPrompt()).toBe('λ ');
        });

        it('clears the readline line buffer on SIGINT during accept', async () => {
            let cleared = false;
            const { im, rl } = makeManager();
            rl.clearLine = () => { cleared = true; };
            im.start(rl);
            const promise = im.acceptInput('p: ');
            rl.emit('SIGINT');
            await expect(promise).rejects.toBeInstanceOf(InterruptedError);
            expect(cleared).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // acceptSecret
    // -----------------------------------------------------------------------

});
