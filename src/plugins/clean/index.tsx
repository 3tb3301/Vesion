/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, RestAPI, GuildStore, RelationshipStore, UserStore, ChannelStore } from "@webpack/common";

interface CleanState {
    running: boolean;
    startTime: Date | null;
    current: number;
    total: number;
    phase: string;
}

const settings = definePluginSettings({
    searchDelay: {
        type: OptionType.NUMBER,
        description: "Search delay in milliseconds",
        default: 150,
    },
    deleteDelay: {
        type: OptionType.NUMBER,
        description: "Delete delay in milliseconds",
        default: 120,
    },
    removeFriends: {
        type: OptionType.COMPONENT,
        description: "Remove all friends from your account",
        component: () => {
            return (
                <button
                    onClick={async () => {
                        if (!confirm("Are you sure you want to remove ALL friends? This cannot be undone!")) return;
                        await runRemoveFriends();
                    }}
                    style={{
                        background: "#ed4245",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontWeight: "500",
                    }}
                >
                    Remove All Friends
                </button>
            );
        },
    },
    cleanAccount: {
        type: OptionType.COMPONENT,
        description: "Full account wipe: delete messages, leave servers, remove friends",
        component: () => {
            return (
                <button
                    onClick={async () => {
                        if (!confirm("⚠️ WARNING ⚠️\n\nThis will:\n- Delete ALL your messages\n- Leave ALL servers\n- Remove ALL friends\n\nThis CANNOT be undone!\n\nAre you absolutely sure?")) return;
                        await runCleanAccount();
                    }}
                    style={{
                        background: "#ed4245",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontWeight: "500",
                    }}
                >
                    ⚠️ Clean Account ⚠️
                </button>
            );
        },
    },
});

let state: CleanState = {
    running: false,
    startTime: null,
    current: 0,
    total: 0,
    phase: "",
};

function resetState() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    state = {
        running: false,
        startTime: null,
        current: 0,
        total: 0,
        phase: "",
    };
}

let abortController: AbortController | null = null;

function wait(ms: number) {
    return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);
        if (abortController) {
            abortController.signal.addEventListener("abort", () => {
                clearTimeout(timeout);
                reject(new Error("aborted"));
            });
        }
    });
}

let progressBarEl: HTMLDivElement | null = null;

function createProgressBar() {
    if (progressBarEl) return;

    const container = document.createElement("div");
    container.id = "clean-progress-bar";
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        z-index: 99999;
        background: #1e1f22;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;

    const top = document.createElement("div");
    top.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;

    const label = document.createElement("div");
    label.id = "clean-progress-label";
    label.style.cssText = `
        color: #fff;
        font-size: 12px;
        font-family: monospace;
    `;

    const stopBtn = document.createElement("button");
    stopBtn.textContent = "Stop";
    stopBtn.style.cssText = `
        background: #ed4245;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 2px 10px;
        font-size: 12px;
        font-family: monospace;
        cursor: pointer;
    `;
    stopBtn.onclick = () => {
        resetState();
        removeProgressBar();
    };

    const barBg = document.createElement("div");
    barBg.style.cssText = `
        width: 100%;
        height: 6px;
        background: #313338;
        border-radius: 4px;
        overflow: hidden;
    `;

    const barFill = document.createElement("div");
    barFill.id = "clean-progress-fill";
    barFill.style.cssText = `
        height: 100%;
        width: 0%;
        background: #5865f2;
        border-radius: 4px;
        transition: width 0.2s ease;
    `;

    barBg.appendChild(barFill);
    top.appendChild(label);
    top.appendChild(stopBtn);
    container.appendChild(top);
    container.appendChild(barBg);
    document.body.appendChild(container);
    progressBarEl = container;
}

function updateProgressBar(phase: string, current: number, total: number) {
    const label = document.getElementById("clean-progress-label");
    const fill = document.getElementById("clean-progress-fill");
    if (!label || !fill) return;

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    label.textContent = `[${phase}] ${current}/${total} (${pct}%)`;
    fill.style.width = `${pct}%`;
}

function removeProgressBar() {
    const el = document.getElementById("clean-progress-bar");
    if (el) el.remove();
    progressBarEl = null;
}

async function searchMessages(channelId: string, authorId: string, offset: number = 0) {
    const params: any = { author_id: authorId, include_nsfw: true };
    if (offset > 0) params.offset = offset;

    const qs = new URLSearchParams(params).toString();
    const endpoint = `/channels/${channelId}/messages/search?${qs}`;

    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            const res = await RestAPI.get({ url: endpoint });
            return res.body;
        } catch (err: any) {
            const status = err?.status ?? err?.response?.status;
            if (status === 429) {
                const retryAfter = err?.body?.retry_after ?? err?.response?.body?.retry_after ?? 2;
                await wait(retryAfter * 1000 + 500);
                continue;
            }
            if (attempt === 9) return null;
            await wait(500 * Math.pow(2, attempt));
        }
    }
    return null;
}

async function deleteMessage(channelId: string, messageId: string) {
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            await RestAPI.del({ url: `/channels/${channelId}/messages/${messageId}` });
            state.current++;
            updateProgressBar(state.phase, state.current, state.total);
            return true;
        } catch (err: any) {
            const status = err?.status ?? err?.response?.status;
            if (status === 429) {
                const retryAfter = err?.body?.retry_after ?? err?.response?.body?.retry_after ?? 2;
                await wait(retryAfter * 1000 + 500);
                continue;
            }
            if (status === 404) return true;
            if (attempt === 9) return false;
            await wait(300 * Math.pow(2, attempt));
        }
    }
    return false;
}

async function deleteMessagesInChannel(channelId: string, authorId: string) {
    let consecutiveEmpty = 0;
    const maxConsecutiveEmpty = 20;

    while (state.running) {
        await wait(settings.store.searchDelay);

        const result = await searchMessages(channelId, authorId, 0);

        if (!result || !result.messages) {
            consecutiveEmpty++;
            if (consecutiveEmpty >= maxConsecutiveEmpty) break;
            await wait(3000);
            continue;
        }

        const nonDeletableTypes = new Set([3, 7, 8, 9, 10, 11, 12]);
        const messages = result.messages.flat().filter((m: any) =>
            m.author?.id === authorId && !nonDeletableTypes.has(m.type)
        );

        if (messages.length === 0) {
            if ((result.total_results ?? 0) === 0) {
                consecutiveEmpty++;
                if (consecutiveEmpty >= maxConsecutiveEmpty) break;
                await wait(3000);
            } else {
                await wait(2000);
            }
            continue;
        }

        consecutiveEmpty = 0;

        if (result.total_results) {
            state.total = Math.max(state.total, state.current + result.total_results);
            updateProgressBar(state.phase, state.current, state.total);
        }

        for (const msg of messages) {
            if (!state.running) return;
            await wait(settings.store.deleteDelay);
            await deleteMessage(channelId, msg.id);
        }

        await wait(300);
    }
}

async function runDeleteMessagesWithUser(userId: string) {
    if (state.running) {
        alert("Already running.");
        return;
    }

    if (!confirm(`Delete all your messages with this user? This cannot be undone!`)) return;

    state.running = true;
    state.startTime = new Date();
    state.current = 0;
    state.total = 0;
    state.phase = "Deleting Messages";
    abortController = new AbortController();

    createProgressBar();
    updateProgressBar(state.phase, 0, 0);

    const currentUserId = UserStore.getCurrentUser().id;

    try {
        // Create or get DM channel with the user
        const dmRes = await RestAPI.post({
            url: "/users/@me/channels",
            body: { recipient_id: userId },
        });
        const dmChannel = dmRes.body;

        if (dmChannel?.id) {
            await deleteMessagesInChannel(dmChannel.id, currentUserId);
        }

        const elapsed = Math.round((Date.now() - (state.startTime?.getTime() ?? Date.now())) / 1000);
        alert(`Deleted ${state.current} messages in ${elapsed}s`);
    } catch (err: any) {
        if (err?.message !== "aborted")
            alert(`Error: ${err}`);
    } finally {
        removeProgressBar();
        resetState();
    }
}

async function runLeaveAllServers() {
    if (state.running) {
        alert("Already running.");
        return;
    }

    if (!confirm("Leave ALL servers? This cannot be undone!")) return;

    state.running = true;
    state.startTime = new Date();
    state.current = 0;
    state.phase = "Leaving Servers";
    abortController = new AbortController();

    const guilds = Object.keys(GuildStore.getGuilds());
    state.total = guilds.length;

    createProgressBar();
    updateProgressBar(state.phase, 0, state.total);

    try {
        for (const guildId of guilds) {
            if (!state.running) break;
            try {
                await RestAPI.del({ url: `/users/@me/guilds/${guildId}` });
            } catch {}
            state.current++;
            updateProgressBar(state.phase, state.current, state.total);
            await wait(500);
        }

        const elapsed = Math.round((Date.now() - (state.startTime?.getTime() ?? Date.now())) / 1000);
        alert(`Left ${state.current}/${state.total} servers in ${elapsed}s`);
    } catch (err: any) {
        if (err?.message !== "aborted")
            alert(`Error: ${err}`);
    } finally {
        removeProgressBar();
        resetState();
    }
}

async function runRemoveFriends() {
    if (state.running) {
        alert("Already running.");
        return;
    }

    state.running = true;
    state.startTime = new Date();
    state.current = 0;
    state.phase = "Removing Friends";
    abortController = new AbortController();

    const friends = RelationshipStore.getFriendIDs();
    state.total = friends.length;

    createProgressBar();
    updateProgressBar(state.phase, 0, state.total);

    try {
        for (const userId of friends) {
            if (!state.running) break;
            try {
                await RestAPI.del({ url: `/users/@me/relationships/${userId}` });
            } catch {}
            state.current++;
            updateProgressBar(state.phase, state.current, state.total);
            await wait(300);
        }

        const elapsed = Math.round((Date.now() - (state.startTime?.getTime() ?? Date.now())) / 1000);
        alert(`Removed ${state.current}/${state.total} friends in ${elapsed}s`);
    } catch (err: any) {
        if (err?.message !== "aborted")
            alert(`Error: ${err}`);
    } finally {
        removeProgressBar();
        resetState();
    }
}

async function runCleanAccount() {
    if (state.running) {
        alert("Already running.");
        return;
    }

    state.running = true;
    state.startTime = new Date();
    abortController = new AbortController();

    createProgressBar();

    try {
        const userId = UserStore.getCurrentUser().id;

        // Delete DM messages
        state.phase = "Deleting DM Messages";
        state.current = 0;
        state.total = 0;
        updateProgressBar(state.phase, 0, 0);

        const dmChannels = await RestAPI.get({ url: "/users/@me/channels" });
        const channels: any[] = dmChannels.body || [];

        for (const ch of channels) {
            if (!state.running) break;
            await deleteMessagesInChannel(ch.id, userId);
        }

        // Clean friends
        if (state.running) {
            const friends = RelationshipStore.getFriendIDs();
            state.phase = "Cleaning Friends";
            state.current = 0;
            state.total = friends.length;
            updateProgressBar(state.phase, 0, state.total);

            for (const friendId of friends) {
                if (!state.running) break;

                try {
                    // Delete messages with friend
                    const dmRes = await RestAPI.post({
                        url: "/users/@me/channels",
                        body: { recipient_id: friendId },
                    });
                    const dmChannel = dmRes.body;

                    if (dmChannel?.id) {
                        await deleteMessagesInChannel(dmChannel.id, userId);
                    }

                    // Remove friend
                    await RestAPI.del({ url: `/users/@me/relationships/${friendId}` });
                } catch {}

                state.current++;
                updateProgressBar(state.phase, state.current, state.total);
                await wait(300);
            }
        }

        // Leave servers
        if (state.running) {
            state.phase = "Leaving Servers";
            state.current = 0;
            const guilds = Object.keys(GuildStore.getGuilds());
            state.total = guilds.length;
            updateProgressBar(state.phase, 0, state.total);

            for (const guildId of guilds) {
                if (!state.running) break;
                try {
                    await RestAPI.del({ url: `/users/@me/guilds/${guildId}` });
                } catch {}
                state.current++;
                updateProgressBar(state.phase, state.current, state.total);
                await wait(500);
            }
        }

        const elapsed = Math.round((Date.now() - (state.startTime?.getTime() ?? Date.now())) / 1000);
        alert(`Account cleaned in ${elapsed}s`);
    } catch (err: any) {
        if (err?.message !== "aborted")
            alert(`Error: ${err}`);
    } finally {
        removeProgressBar();
        resetState();
    }
}

// Context menu for DMs (right-click on user)
const userContextMenuPatch: NavContextMenuPatchCallback = (children, { user }) => {
    if (!user) return;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="clean-delete-messages"
            label="Delete My Messages"
            action={() => runDeleteMessagesWithUser(user.id)}
            color="danger"
        />
    );
};

// Context menu for guilds (right-click on server)
const guildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }) => {
    if (!guild) return;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="clean-leave-all-servers"
            label="Leave All Servers"
            action={() => runLeaveAllServers()}
            color="danger"
        />
    );
};

export default definePlugin({
    name: "Clean",
    description: "A powerful account cleanup tool. Delete messages, leave servers, remove friends from context menus and plugin settings.",
    authors: [Devs["3Tb"]],
    settings,

    contextMenus: {
        "user-context": userContextMenuPatch,
        "guild-context": guildContextMenuPatch,
    },
});
