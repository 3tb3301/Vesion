/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findStoreLazy } from "@webpack";
import { GuildChannelStore, Menu, RestAPI, UserStore } from "@webpack/common";

interface VoiceState {
    userId: string;
    channelId?: string;
}

interface VoiceStateStore {
    getAllVoiceStates(): { [guildId: string]: { [userId: string]: VoiceState } };
}

const VoiceStateStore: VoiceStateStore = findStoreLazy("VoiceStateStore");

const settings = definePluginSettings({});

function getUserVoiceState(userId: string): { guildId: string; channelId: string } | null {
    try {
        const allStates = VoiceStateStore.getAllVoiceStates();
        for (const [guildId, users] of Object.entries(allStates)) {
            if (users[userId]?.channelId) {
                return { guildId, channelId: users[userId].channelId! };
            }
        }
    } catch {}
    return null;
}

function getRandomVoiceChannels(guildId: string, excludeChannelId: string, count: number): string[] {
    try {
        const channels = GuildChannelStore.getChannels(guildId);
        const voiceChannels: string[] = [];

        for (const group of Object.values(channels) as any[]) {
            if (!Array.isArray(group)) continue;
            for (const entry of group) {
                const ch = entry?.channel ?? entry;
                if (ch?.type === 2 && ch.id !== excludeChannelId) {
                    voiceChannels.push(ch.id);
                }
            }
        }

        return voiceChannels.sort(() => Math.random() - 0.5).slice(0, count);
    } catch {}
    return [];
}

function moveUser(guildId: string, userId: string, channelId: string): Promise<void> {
    return RestAPI.patch({
        url: `/guilds/${guildId}/members/${userId}`,
        body: { channel_id: channelId }
    }).catch(() => {});
}

async function bounceUser(guildId: string, userId: string, originChannelId: string, myChannelId: string) {
    const randomChannels = getRandomVoiceChannels(guildId, originChannelId, 3);
    if (randomChannels.length === 0) return;

    for (const channelId of randomChannels) {
        await moveUser(guildId, userId, channelId);
        await new Promise(res => setTimeout(res, 1000));
    }

    await moveUser(guildId, userId, myChannelId);
}

const UserContext: NavContextMenuPatchCallback = (children, { user }) => {
    if (!user || user.id === UserStore.getCurrentUser().id) return;
    if (user.bot) return;

    children.splice(-1, 0, (
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="bounce-user"
                label="خذ لفه وتعال"
                action={() => {
                    const target = getUserVoiceState(user.id);
                    const me = getUserVoiceState(UserStore.getCurrentUser().id);
                    if (!target || !me) return;
                    bounceUser(target.guildId, user.id, target.channelId, me.channelId);
                }}
            />
        </Menu.MenuGroup>
    ));
};

export default definePlugin({
    name: "BounceUser",
    description: "خذ لفه وتعال",
    authors: [Devs["3Tb"]],
    settings,

    contextMenus: {
        "user-context": UserContext
    }
});
