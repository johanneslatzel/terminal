import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { InputManager } from '../../src/input-manager.js';

export function makeTtyStreams(): { stdin: any; stdout: any; stdoutChunks: string[] } {
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

export function makeNonTtyStreams(): { stdin: any; stdout: any; stdoutChunks: string[] } {
    const stdin = Object.assign(new PassThrough(), { isTTY: false });
    const stdoutChunks: string[] = [];
    const stdout = new PassThrough();
    stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk.toString()));
    return { stdin, stdout, stdoutChunks };
}

export function makeMockRl(): any {
    const rl: any = new EventEmitter();
    rl.prompt = () => {};
    rl.setPrompt = () => {};
    rl.close = () => {};
    rl.pause = () => {};
    rl.resume = () => {};
    return rl;
}

export function makeManager(
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
