/*
 * src/types/gifenc.d.ts
 * Copyright (c) 2026 Aria Rees & Clove Nytrix Doughmination Twilight
 * Licensed under the MIT Licence.
 * See LICENCE in the project root for full licence information.
 */

// gifenc ships no types — this covers only the parts the pride renderer uses.
declare module "gifenc" {
    export type Palette = number[][];

    export type ColourFormat = "rgb565" | "rgb444" | "rgba4444";

    export interface QuantizeOptions {
        format?: ColourFormat;
        oneBitAlpha?: boolean | number;
        clearAlpha?: boolean;
    }

    export interface FrameOptions {
        palette?: Palette;
        delay?: number;
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
    }

    export interface Encoder {
        writeFrame(
            index: Uint8Array,
            width: number,
            height: number,
            options?: FrameOptions,
        ): void;
        finish(): void;
        bytes(): Uint8Array;
    }

    export function GIFEncoder(): Encoder;

    export function quantize(
        rgba: Uint8Array | Uint8ClampedArray,
        maxColours: number,
        options?: QuantizeOptions,
    ): Palette;

    export function applyPalette(
        rgba: Uint8Array | Uint8ClampedArray,
        palette: Palette,
        format?: ColourFormat,
    ): Uint8Array;
}
