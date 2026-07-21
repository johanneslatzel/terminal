/**
 * Named constants for control-character byte codes used throughout the
 * terminal input pipeline.  Centralising them here avoids magic numbers
 * scattered across the codebase and makes the intent of each byte value
 * immediately clear.
 */

/** Ctrl+C (0x03) – interrupt / abort current input. */
export const CTRL_C = '\x03';

/**
 * Ctrl+W (0x17) – delete word backward (readline `unix-word-rubout`).
 *
 * Many terminals send 0x08 (Ctrl+H) for Ctrl+Backspace, but readline
 * maps that to `deleteCharBackword` (single character).  The input
 * filter in {@link Terminal} remaps 0x08 → CTRL_W so that
 * Ctrl+Backspace performs word deletion instead.
 */
export const CTRL_W = '\x17';

/**
 * 0x08 – Ctrl+H / Backspace byte emitted by many terminals for
 * Ctrl+Backspace.  Readline treats it as a single-char delete; we
 * remap it to {@link CTRL_W} in the input filter.
 */
export const CTRL_BACKSPACE = 0x08;

/** 0x7F (DEL) – Backspace key on most modern terminals. */
export const KEY_DEL = '\x7f';

/** 0x08 (BS) – Backspace key on some terminals. */
export const KEY_BS = '\b';
