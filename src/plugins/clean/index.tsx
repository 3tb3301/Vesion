/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, RestAPI, GuildStore, RelationshipStore, UserStore } from "@webpack/common";
import "./styles.css";

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
                        if (!confirm("WARNING\n\nThis will:\n- Delete ALL your messages\n- Leave ALL servers\n- Remove ALL friends\n\nThis CANNOT be undone!\n\nAre you absolutely sure?")) return;
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
                    Clean Account
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

let pillContainer: HTMLDivElement | null = null;
let mainPill: HTMLDivElement | null = null;
let isHiding = false;

function createPillContainer() {
    if (pillContainer) return;

    const container = document.createElement("div");
    container.className = "cloner-pill-container";
    container.id = "clean-pill-container";
    document.body.appendChild(container);
    pillContainer = container;
}

function createMainPill() {
    if (mainPill) return;

    const pill = document.createElement("div");
    pill.className = "cloner-pill";
    pill.id = "clean-main-pill";
    pill.innerHTML = `
        <div class="cloner-pill-compact">
            <div class="cloner-pill-spinner"></div>
            <span class="cloner-pill-title">Initializing...</span>
            <span class="cloner-pill-percent">0%</span>
        </div>
        <div class="cloner-pill-expanded">
            <div class="cloner-pill-expanded-inner">
                <div class="cloner-pill-body"></div>
                <div class="cloner-pill-progress-bar">
                    <div class="cloner-pill-progress-fill" style="width:0%"></div>
                </div>
                <div class="cloner-pill-actions">
                    <button class="cloner-btn danger" id="clean-stop-btn">Stop</button>
                </div>
            </div>
        </div>
    `;

    const stopBtn = pill.querySelector("#clean-stop-btn") as HTMLButtonElement;
    stopBtn.onclick = () => {
        resetState();
        hidePill();
    };

    pillContainer!.appendChild(pill);
    mainPill = pill;
}

function updateMainPill(phase: string, current: number, total: number, body?: string) {
    if (!mainPill) return;

    const title = mainPill.querySelector(".cloner-pill-title") as HTMLElement;
    const percent = mainPill.querySelector(".cloner-pill-percent") as HTMLElement;
    const fill = mainPill.querySelector(".cloner-pill-progress-fill") as HTMLElement;
    const bodyEl = mainPill.querySelector(".cloner-pill-body") as HTMLElement;

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    
    title.textContent = phase;
    percent.textContent = `${pct}%`;
    fill.style.width = `${pct}%`;
    
    if (body) {
        bodyEl.textContent = body;
    } else {
        bodyEl.textContent = `${current.toLocaleString()} / ${total.toLocaleString()} items`;
    }

    if (phase === "Completed") {
        mainPill.classList.add("success", "completed");
        mainPill.classList.remove("error");
        const spinner = mainPill.querySelector(".cloner-pill-spinner") as HTMLElement;
        if (spinner) spinner.style.animation = "none";
    } else if (phase === "Error") {
        mainPill.classList.add("error", "completed");
        mainPill.classList.remove("success");
        const spinner = mainPill.querySelector(".cloner-pill-spinner") as HTMLElement;
        if (spinner) spinner.style.animation = "none";
    } else {
        mainPill.classList.remove("success", "error", "completed");
    }
}

function addSubPill(title: string, body: string, icon: "success" | "error" | "info" = "info") {
    if (!pillContainer) return;

    const subPill = document.createElement("div");
    subPill.className = "cloner-sub-pill";
    
    const iconSymbol = icon === "success" ? "✓" : icon === "error" ? "✕" : "ℹ";
    
    subPill.innerHTML = `
        <div class="cloner-sub-pill-icon ${icon}">${iconSymbol}</div>
        <div class="cloner-sub-pill-content">
            <span class="cloner-sub-pill-title">${title}</span>
            <span class="cloner-sub-pill-body">${body}</span>
        </div>
    `;

    pillContainer.appendChild(subPill);

    setTimeout(() => {
        subPill.classList.add("hiding");
        setTimeout(() => subPill.remove(), 500);
    }, 5000);
}

function hidePill() {
    if (!mainPill || isHiding) return;
    isHiding = true;
    mainPill.classList.add("hiding");
    
    setTimeout(() => {
        if (mainPill) {
            mainPill.remove();
            mainPill = null;
        }
        isHiding = false;
        if (pillContainer) {
            pillContainer.querySelectorAll(".cloner-sub-pill").forEach(el => el.remove());
            if (pillContainer.children.length === 0) {
                pillContainer.remove();
                pillContainer = null;
            }
        }
    }, 800);
}

function initPillUI(phase: string, total: number, body?: string) {
    createPillContainer();
    createMainPill();
    state.current = 0;
    state.total = total;
    state.phase = phase;
    updateMainPill(phase, 0, total, body);
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
            updateMainPill(state.phase, state.current, state.total);
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
            updateMainPill(state.phase, state.current, state.total);
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
    state.phase = "Initializing";
    abortController = new AbortController();

    initPillUI("Initializing", 0, "Preparing to delete messages...");

    const currentUserId = UserStore.getCurrentUser().id;

    try {
        const dmRes = await RestAPI.post({
            url: "/users/@me/channels",
            body: { recipient_id: userId },
        });
        const dmChannel = dmRes.body;

        if (dmChannel?.id) {
            state.phase = "Deleting Messages";
            state.total = 0;
            updateMainPill(state.phase, 0, 0, "Searching for messages...");
            await deleteMessagesInChannel(dmChannel.id, currentUserId);
        }

        const elapsed = Math.round((Date.now() - (state.startTime?.getTime() ?? Date.now())) / 1000);
        state.phase = "Completed";
        updateMainPill(state.phase, state.current, state.total, `Deleted ${state.current} messages in ${elapsed}s`);
        addSubPill("Messages Deleted", `Deleted ${state.current} messages with user in ${elapsed}s`, "success");
        
        setTimeout(() => hidePill(), 3000);
    } catch (err: any) {
        if (err?.message !== "aborted") {
            state.phase = "Error";
            updateMainPill(state.phase, state.current, state.total, `Error: ${err}`);
            addSubPill("Error", `Failed to delete messages: ${err}`, "error");
        }
    } finally {
        if (state.running) {
            state.running = false;
            resetState();
        }
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

    initPillUI(state.phase, state.total, `Leaving ${guilds.length} servers...`);

    try {
        let failed = 0;
        for (const guildId of guilds) {
            if (!state.running) break;
            try {
                await RestAPI.del({ url: `/users/@me/guilds/${guildId}` });
            } catch {
                failed++;
            }
            state.current++;
            updateMainPill(state.phase, state.current, state.total);
            await wait(500);
        }

        const elapsed = Math.round((Date.now() - (state.startTime?.getTime() ?? Date.now())) / 1000);
        state.phase = "Completed";
        updateMainPill(state.phase, state.current, state.total, `Left ${state.current - failed}/${state.total} servers in ${elapsed}s`);
        
        if (failed > 0) {
            addSubPill("Partial Success", `Left ${state.current - failed}/${state.total} servers (${failed} failed)`, "info");
        } else {
            addSubPill("Servers Left", `Successfully left ${state.current} servers in ${elapsed}s`, "success");
        }
        
        setTimeout(() => hidePill(), 3000);
    } catch (err: any) {
        if (err?.message !== "aborted") {
            state.phase = "Error";
            updateMainPill(state.phase, state.current, state.total, `Error: ${err}`);
            addSubPill("Error", `Failed to leave servers: ${err}`, "error");
        }
    } finally {
        if (state.running) {
            state.running = false;
            resetState();
        }
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

    initPillUI(state.phase, state.total, `Removing ${friends.length} friends...`);

    try {
        let failed = 0;
        for (const userId of friends) {
            if (!state.running) break;
            try {
                await RestAPI.del({ url: `/users/@me/relationships/${userId}` });
            } catch {
                failed++;
            }
            state.current++;
            updateMainPill(state.phase, state.current, state.total);
            await wait(300);
        }

        const elapsed = Math.round((Date.now() - (state.startTime?.getTime() ?? Date.now())) / 1000);
        state.phase = "Completed";
        updateMainPill(state.phase, state.current, state.total, `Removed ${state.current - failed}/${state.total} friends in ${elapsed}s`);
        
        if (failed > 0) {
            addSubPill("Partial Success", `Removed ${state.current - failed}/${state.total} friends (${failed} failed)`, "info");
        } else {
            addSubPill("Friends Removed", `Successfully removed ${state.current} friends in ${elapsed}s`, "success");
        }
        
        setTimeout(() => hidePill(), 3000);
    } catch (err: any) {
        if (err?.message !== "aborted") {
            state.phase = "Error";
            updateMainPill(state.phase, state.current, state.total, `Error: ${err}`);
            addSubPill("Error", `Failed to remove friends: ${err}`, "error");
        }
    } finally {
        if (state.running) {
            state.running = false;
            resetState();
        }
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

    initPillUI("Cleaning Account", 0, "Starting full account cleanup...");

    try {
        const userId = UserStore.getCurrentUser().id;

        state.phase = "Deleting DM Messages";
        state.current = 0;
        state.total = 0;
        updateMainPill(state.phase, 0, 0, "Fetching DM channels...");

        const dmChannels = await RestAPI.get({ url: "/users/@me/channels" });
        const channels: any[] = dmChannels.body || [];
        let totalDMs = channels.length;
        let currentDM = 0;

        for (const ch of channels) {
            if (!state.running) break;
            currentDM++;
            updateMainPill(state.phase, currentDM, totalDMs, `Processing DM ${currentDM}/${totalDMs}...`);
            await deleteMessagesInChannel(ch.id, userId);
        }

        addSubPill("DM Messages Deleted", `Cleaned all DM messages`, "success");

        if (state.running) {
            const friends = RelationshipStore.getFriendIDs();
            state.phase = "Cleaning Friends";
            state.current = 0;
            state.total = friends.length;
            updateMainPill(state.phase, 0, state.total, `Cleaning ${friends.length} friends...`);

            let friendsCleaned = 0;
            for (const friendId of friends) {
                if (!state.running) break;

                try {
                    const dmRes = await RestAPI.post({
                        url: "/users/@me/channels",
                        body: { recipient_id: friendId },
                    });
                    const dmChannel = dmRes.body;

                    if (dmChannel?.id) {
                        await deleteMessagesInChannel(dmChannel.id, userId);
                    }

                    await RestAPI.del({ url: `/users/@me/relationships/${friendId}` });
                    friendsCleaned++;
                } catch {}

                state.current++;
                updateMainPill(state.phase, state.current, state.total);
                await wait(300);
            }

            addSubPill("Friends Cleaned", `Cleaned ${friendsCleaned}/${friends.length} friends`, "success");
        }

        if (state.running) {
            state.phase = "Leaving Servers";
            state.current = 0;
            const guilds = Object.keys(GuildStore.getGuilds());
            state.total = guilds.length;
            updateMainPill(state.phase, 0, state.total, `Leaving ${guilds.length} servers...`);

            let serversLeft = 0;
            for (const guildId of guilds) {
                if (!state.running) break;
                try {
                    await RestAPI.del({ url: `/users/@me/guilds/${guildId}` });
                    serversLeft++;
                } catch {}
                state.current++;
                updateMainPill(state.phase, state.current, state.total);
                await wait(500);
            }

            addSubPill("Servers Left", `Left ${serversLeft}/${guilds.length} servers`, "success");
        }

        const elapsed = Math.round((Date.now() - (state.startTime?.getTime() ?? Date.now())) / 1000);
        state.phase = "Completed";
        updateMainPill(state.phase, state.current, state.total, `Account cleaned in ${elapsed}s`);
        addSubPill("Clean Complete", `Account fully cleaned in ${elapsed}s`, "success");
        
        setTimeout(() => hidePill(), 3000);
    } catch (err: any) {
        if (err?.message !== "aborted") {
            state.phase = "Error";
            updateMainPill(state.phase, state.current, state.total, `Error: ${err}`);
            addSubPill("Error", `Failed to clean account: ${err}`, "error");
        }
    } finally {
        if (state.running) {
            state.running = false;
            resetState();
        }
    }
}

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