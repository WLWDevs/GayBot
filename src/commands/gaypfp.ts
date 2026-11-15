/*
 * src/commands/gaypfp.ts
 * Copyright (c) 2026 Aria Rees & Clove Nytrix Doughmination Twilight
 * Licensed under the MIT Licence.
 * See LICENCE in the project root for full licence information.
 */

import {
    ApplicationCommandOptionType,
    AttachmentBuilder,
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    EmbedBuilder,
    GuildMember,
    MessageFlags,
} from "discord.js";
import { loadImage } from "@napi-rs/canvas";
import flagConfig from "../configs/gaypfp/flags.json";
import {
    renderPride,
    type Cutout,
    type Rendered,
} from "../utils/prideRenderer";

// /gaypfp — ported from the Sandrone bot's /pride. Flags live in configs/gaypfp/flags.json.

interface FlagEntry {
    label: string;
    aliases: string[];
    colours: string[];
}

const flags: Record<string, FlagEntry> = flagConfig;

const botIcon =
    "https://cdn.discordapp.com/avatars/1475380726643032064/c86c2351bcea2dabfca02272b0ee2354.png";

const avatarSize = 512;

const defaultUploadLimit = 10 * 1024 * 1024;

const uploadOverhead = 64 * 1024;

const fetchTimeoutMs = 10_000;

// Rendering is CPU-heavy, so each user gets 2 renders per 30 seconds
const cooldownUses = 2;

const cooldownMs = 30_000;

const recentUses = new Map<string, number[]>();

// Returns seconds left on the cooldown, or 0 when the user may run it
function cooldownRemaining(userId: string): number {
    const now = Date.now();
    const recent = (recentUses.get(userId) ?? []).filter(
        (usedAt) => now - usedAt < cooldownMs,
    );

    if (recent.length >= cooldownUses) {
        recentUses.set(userId, recent);
        return Math.ceil((cooldownMs - (now - recent[0])) / 1000);
    }

    recent.push(now);
    recentUses.set(userId, recent);
    return 0;
}

function resolveFlag(name: string): string | null {
    const key = name.trim().toLowerCase();

    if (key in flags) return key;

    for (const [slug, entry] of Object.entries(flags)) {
        if (entry.label.toLowerCase() === key) return slug;
    }

    for (const [slug, entry] of Object.entries(flags)) {
        if (entry.aliases.includes(key)) return slug;
    }

    return null;
}

function uploadBudget(interaction: ChatInputCommandInteraction): number {
    const limit = interaction.attachmentSizeLimit || defaultUploadLimit;
    return Math.max(limit - uploadOverhead, uploadOverhead);
}

function footerText(result: Rendered): string {
    const parts = [`${result.size}px`];

    if (result.frames > 1) parts.push(`${result.frames} frames`);

    parts.push(`${(result.data.length / 1024).toFixed(0)} KiB`);
    parts.push("GayBot v2");

    return parts.join(" · ");
}

async function replyError(
    interaction: ChatInputCommandInteraction,
    message: string,
): Promise<void> {
    const embed = new EmbedBuilder()
        .setDescription(`❌ ${message}`)
        .setColor(0xe74c3c);

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
    });
}

const flagOption = {
    type: ApplicationCommandOptionType.String,
    autocomplete: true,
    required: false,
};

export default {
    data: {
        name: "gaypfp",
        description: "Put a pride flag around someone's profile picture! 🏳️‍🌈",
        options: [
            {
                type: ApplicationCommandOptionType.User,
                name: "target",
                description: "Whose profile picture to use (defaults to you)",
                required: false,
            },
            {
                ...flagOption,
                name: "flag",
                description:
                    "The flag to use (defaults to the rainbow pride flag)",
            },
            {
                ...flagOption,
                name: "flag2",
                description: "A second flag, drawn beside the first",
            },
            {
                type: ApplicationCommandOptionType.String,
                name: "style",
                description: "Ring the picture, or paint the flag over it",
                required: false,
                choices: [
                    {
                        name: "Circle",
                        value: "circle",
                    },
                    {
                        name: "Square",
                        value: "square",
                    },
                    {
                        name: "Overlay",
                        value: "overlay",
                    },
                ],
            },
            {
                type: ApplicationCommandOptionType.Integer,
                name: "size",
                description:
                    "How much of the picture stays visible, as a percent",
                required: false,
                min_value: 10,
                max_value: 100,
            },
            {
                type: ApplicationCommandOptionType.Integer,
                name: "opacity",
                description: "How solid the flag is, as a percent",
                required: false,
                min_value: 0,
                max_value: 100,
            },
            {
                type: ApplicationCommandOptionType.Integer,
                name: "rotation",
                description: "Turn the flag by this many degrees",
                required: false,
                min_value: 0,
                max_value: 360,
            },
            {
                type: ApplicationCommandOptionType.Boolean,
                name: "gradient",
                description: "Blend the stripes instead of hard edges",
                required: false,
            },
            {
                type: ApplicationCommandOptionType.Boolean,
                name: "animated",
                description: "Spin the flag, as a GIF",
                required: false,
            },
        ],
    },

    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const query = interaction.options.getFocused().trim().toLowerCase();

        const choices = Object.entries(flags)
            .filter(
                ([slug, entry]) =>
                    entry.label.toLowerCase().includes(query) ||
                    slug.includes(query) ||
                    entry.aliases.some((alias) => alias.includes(query)),
            )
            .slice(0, 25)
            .map(([slug, entry]) => ({
                name: entry.label,
                value: slug,
            }));

        await interaction.respond(choices);
    },

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.isChatInputCommand()) return;

        const requested = [
            interaction.options.getString("flag") ?? "pride",
            interaction.options.getString("flag2"),
        ].filter((name): name is string => Boolean(name));

        const chosen = requested.map(resolveFlag);
        const unknown = requested.filter((_, index) => chosen[index] === null);

        if (unknown.length > 0) {
            await replyError(
                interaction,
                `I have no flag called \`${unknown.join("`, `")}\` — pick one from the suggestions.`,
            );
            return;
        }

        const waitSeconds = cooldownRemaining(interaction.user.id);

        if (waitSeconds > 0) {
            await replyError(
                interaction,
                `Slow down! Try again in ${waitSeconds}s.`,
            );
            return;
        }

        const slugs = chosen as string[];
        const cutout = (interaction.options.getString("style") ??
            "circle") as Cutout;

        // A fully solid overlay hides the picture, so overlay defaults to half
        const defaultOpacity = cutout === "overlay" ? 50 : 100;

        const options = {
            columns: slugs.map((slug) => flags[slug].colours),
            cutout,
            cutoutSize: interaction.options.getInteger("size") ?? 90,
            opacity:
                interaction.options.getInteger("opacity") ?? defaultOpacity,
            rotation: interaction.options.getInteger("rotation") ?? 0,
            isGradient: interaction.options.getBoolean("gradient") ?? false,
        };
        const animated = interaction.options.getBoolean("animated") ?? false;

        await interaction.deferReply();

        // Prefer the server-specific avatar when the target is a cached member
        const targetUser =
            interaction.options.getUser("target") ?? interaction.user;
        const targetMember = interaction.options.getUser("target")
            ? interaction.options.getMember("target")
            : interaction.member;
        const source =
            targetMember instanceof GuildMember ? targetMember : targetUser;

        const avatarUrl = source.displayAvatarURL({
            extension: "png",
            size: avatarSize,
            forceStatic: true,
        });

        let avatar;

        try {
            const response = await fetch(avatarUrl, {
                signal: AbortSignal.timeout(fetchTimeoutMs),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            avatar = await loadImage(Buffer.from(await response.arrayBuffer()));
        } catch {
            await replyError(
                interaction,
                "Couldn't download that profile picture.",
            );
            return;
        }

        const result = await renderPride(
            avatar,
            options,
            animated,
            uploadBudget(interaction),
        );

        const filename = `gaypfp.${result.extension}`;
        const fellBackToStill = animated && result.extension === "png";
        const note = fellBackToStill
            ? "\n\nThe animation wouldn't fit under the upload limit here, so here's a still instead."
            : "";

        const embed = new EmbedBuilder()
            .setTitle(slugs.map((slug) => flags[slug].label).join(" + "))
            .setDescription(`-# ${source.displayName}${note}`)
            .setImage(`attachment://${filename}`)
            .setColor(0x8e44ad)
            .setFooter({
                text: footerText(result),
                iconURL: botIcon,
            });

        await interaction.editReply({
            embeds: [embed],
            files: [
                new AttachmentBuilder(result.data, {
                    name: filename,
                }),
            ],
        });
    },
};
