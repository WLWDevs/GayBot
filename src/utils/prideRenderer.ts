/*
 * src/utils/prideRenderer.ts
 * Copyright (c) 2026 Aria Rees & Clove Nytrix Doughmination Twilight
 * Licensed under the MIT Licence.
 * See LICENCE in the project root for full licence information.
 */

import { createCanvas, type Canvas, type Image } from "@napi-rs/canvas";
import { GIFEncoder, applyPalette, quantize } from "gifenc";

// Ported from the Sandrone bot's utils/pride.py.

type DrawContext = ReturnType<Canvas["getContext"]>;

export type Cutout = "circle" | "square" | "overlay";

export interface PrideOptions {
    columns: string[][];
    cutout: Cutout;
    cutoutSize: number;
    opacity: number;
    rotation: number;
    isGradient: boolean;
}

export interface Rendered {
    data: Buffer;
    extension: "png" | "gif";
    size: number;
    frames: number;
}

// Tried largest first; the first GIF that fits the upload limit wins
const animationSteps = [
    {
        size: 256,
        frames: 36,
    },
    {
        size: 224,
        frames: 30,
    },
    {
        size: 192,
        frames: 24,
    },
    {
        size: 160,
        frames: 20,
    },
    {
        size: 128,
        frames: 16,
    },
];

const rotationSeconds = 3;

const stillSize = 512;

function gradientFill(
    context: DrawContext,
    colours: string[],
    offset: number,
    size: number,
) {
    if (colours.length === 1) return colours[0];

    // Colours past either end of the gradient hold the end colour
    const gradient = context.createLinearGradient(0, offset, 0, offset + size);
    const lastIndex = colours.length - 1;

    colours.forEach((colour, index) => {
        gradient.addColorStop(index / lastIndex, colour);
    });

    return gradient;
}

// Paints the flag at double size so it still covers the frame when rotated
function paintFlag(size: number, options: PrideOptions): Canvas {
    const offset = Math.floor(size / 2);
    const span = size * 2;
    const canvas = createCanvas(span, span);
    const context = canvas.getContext("2d");
    const columnCount = options.columns.length;

    options.columns.forEach((colours, column) => {
        const left =
            column === 0
                ? 0
                : offset + Math.floor((size * column) / columnCount);
        const right =
            column === columnCount - 1
                ? span
                : offset + Math.floor((size * (column + 1)) / columnCount);

        if (options.isGradient) {
            context.fillStyle = gradientFill(context, colours, offset, size);
            context.fillRect(left, 0, right - left, span);
            return;
        }

        colours.forEach((colour, stripe) => {
            const top =
                stripe === 0
                    ? 0
                    : offset + Math.floor((size * stripe) / colours.length);
            const bottom =
                stripe === colours.length - 1
                    ? span
                    : offset +
                      Math.floor((size * (stripe + 1)) / colours.length);

            context.fillStyle = colour;
            context.fillRect(left, top, right - left, bottom - top);
        });
    });

    return canvas;
}

function drawFlag(
    context: DrawContext,
    flat: Canvas,
    size: number,
    options: PrideOptions,
    angle: number,
): void {
    context.save();
    context.globalAlpha = options.opacity / 100;
    context.translate(size / 2, size / 2);
    context.rotate((angle * Math.PI) / 180);
    context.drawImage(flat, -size, -size);
    context.restore();
}

function drawFrame(
    avatar: Image,
    flat: Canvas,
    size: number,
    options: PrideOptions,
    angle: number,
): Canvas {
    const canvas = createCanvas(size, size);
    const context = canvas.getContext("2d");

    if (options.cutout === "overlay") {
        context.drawImage(avatar, 0, 0, size, size);
        drawFlag(context, flat, size, options, angle);
        return canvas;
    }

    drawFlag(context, flat, size, options, angle);

    // The avatar shrinks inwards so the flag shows as a ring around it
    const inner = Math.max(1, Math.round((size * options.cutoutSize) / 100));
    const inset = Math.floor((size - inner) / 2);

    context.save();
    context.beginPath();

    if (options.cutout === "square") {
        context.rect(inset, inset, inner, inner);
    } else {
        context.arc(size / 2, size / 2, inner / 2, 0, Math.PI * 2);
    }

    context.clip();
    context.drawImage(avatar, inset, inset, inner, inner);
    context.restore();

    return canvas;
}

function encodeGif(
    avatar: Image,
    options: PrideOptions,
    size: number,
    frameCount: number,
): Buffer {
    const flat = paintFlag(size, options);
    const gif = GIFEncoder();
    const delay = Math.max(
        20,
        Math.round((rotationSeconds * 1000) / frameCount),
    );

    for (let step = 0; step < frameCount; step++) {
        const angle = options.rotation + (step * 360) / frameCount;
        const frame = drawFrame(avatar, flat, size, options, angle);
        const pixels = frame
            .getContext("2d")
            .getImageData(0, 0, size, size).data;

        const palette = quantize(pixels, 256, {
            format: "rgba4444",
            oneBitAlpha: true,
        });
        const indexed = applyPalette(pixels, palette, "rgba4444");
        const transparentIndex = palette.findIndex((colour) => colour[3] === 0);

        gif.writeFrame(indexed, size, size, {
            palette,
            delay,
            transparent: transparentIndex >= 0,
            transparentIndex: Math.max(0, transparentIndex),
            dispose: 2,
        });
    }

    gif.finish();
    return Buffer.from(gif.bytes());
}

async function renderStill(
    avatar: Image,
    options: PrideOptions,
): Promise<Rendered> {
    const flat = paintFlag(stillSize, options);
    const frame = drawFrame(avatar, flat, stillSize, options, options.rotation);

    return {
        data: await frame.encode("png"),
        extension: "png",
        size: stillSize,
        frames: 1,
    };
}

// Falls back to a still PNG when no GIF size fits under the budget
export async function renderPride(
    avatar: Image,
    options: PrideOptions,
    animated: boolean,
    budget: number,
): Promise<Rendered> {
    if (!animated) return renderStill(avatar, options);

    for (const step of animationSteps) {
        const data = encodeGif(avatar, options, step.size, step.frames);

        if (data.length <= budget) {
            return {
                data,
                extension: "gif",
                size: step.size,
                frames: step.frames,
            };
        }
    }

    return renderStill(avatar, options);
}
