/*
 * src/commands/8ball.ts
 * Copyright (c) 2026 Aria Rees & Clove Nytrix Doughmination Twilight
 * Licensed under the MIT Licence.
 * See LICENCE in the project root for full licence information.
 */

import {
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    EmbedBuilder,
} from "discord.js";
import responses from "../configs/8ball.json" with {type: "json"};

// /8ball — ported from the Sandrone bot. Answers live in configs/8ball.json.

const botIcon =
    "https://cdn.discordapp.com/avatars/1475380726643032064/c86c2351bcea2dabfca02272b0ee2354.png";

// Where draws outside a server (DMs, user installs) keep their bag
const noGuildKey = "dm";

// Each server gets every answer once, in random order, before any repeat
const bags = new Map<string, string[]>();

const lastDrawn = new Map<string, string>();

function shuffled(items: string[]): string[] {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index--) {
        const swapWith = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
    }

    return copy;
}

function drawAnswer(guildId: string | null): string {
    const key = guildId ?? noGuildKey;
    let remaining = bags.get(key) ?? [];

    if (remaining.length === 0) {
        remaining = shuffled(responses);

        // Don't repeat the last answer straight across a refill
        const lastIndex = remaining.length - 1;

        if (lastIndex > 0 && remaining[lastIndex] === lastDrawn.get(key)) {
            [remaining[0], remaining[lastIndex]] = [
                remaining[lastIndex],
                remaining[0],
            ];
        }
    }

    const answer = remaining.pop()!;

    bags.set(key, remaining);
    lastDrawn.set(key, answer);

    return answer;
}

export default {
    data: {
        name: "8ball",
        description: "Ask the magic 8-ball a question! 🎱",
        options: [
            {
                type: ApplicationCommandOptionType.String,
                name: "question",
                description: "The question you want answered",
                required: true,
                max_length: 256,
            },
        ],
    },

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.isChatInputCommand()) return;

        const question = interaction.options.getString("question", true);

        const embed = new EmbedBuilder()
            .setTitle("🎱 Magic 8-Ball")
            .addFields(
                {
                    name: "You asked",
                    value: question,
                },
                {
                    name: "The 8-ball says",
                    value: drawAnswer(interaction.guildId),
                },
            )
            .setColor(0x8e44ad)
            .setFooter({
                text: "GayBot v2",
                iconURL: botIcon,
            });

        await interaction.reply({
            embeds: [embed],
            allowedMentions: {
                parse: [],
            },
        });
    },
};
