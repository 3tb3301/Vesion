/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Guild, Role } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildRoleStore, GuildStore, Menu, React, RestAPI } from "@webpack/common";

const GuildChannelStore = findStoreLazy("GuildChannelStore");

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

interface PermissionOverwrite {
    id: string;
    type: number;
    allow: string;
    deny: string;
}

interface FullChannel {
    id: string;
    name: string;
    type: number;
    parent_id: string | null;
    position: number;
    topic: string | null;
    nsfw: boolean;
    rateLimitPerUser: number;
    bitrate: number | null;
    userLimit: number | null;
    permissionOverwrites: PermissionOverwrite[];
    defaultAutoArchiveDuration?: number;
    flags?: number;
}

interface FullRole {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    position: number;
    permissions: string;
    mentionable: boolean;
    icon?: string | null;
    unicodeEmoji?: string | null;
}

let isCloning = false;
let progressBar: HTMLElement | null = null;
let notificationContainer: HTMLElement | null = null;

const settings = definePluginSettings({
    channelDelay: {
        type: OptionType.SLIDER,
        description: "Base delay between API requests (ms) - actual delay varies randomly",
        default: 800,
        markers: [500, 800, 1000, 1500, 2000],
        stickToMarkers: false
    }
});

function injectStyles() {
    if (document.getElementById("server-cloner-styles")) return;

    const style = document.createElement("style");
    style.id = "server-cloner-styles";
    style.textContent = `
        @keyframes shimmer {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-20px); }
        }
        @keyframes progressShrink {
            from { width: 100%; }
            to { width: 0%; }
        }
        
        .cloner-notification-container {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            align-items: center;
        }
        
        .cloner-notification {
            background: rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(24px) saturate(180%);
            -webkit-backdrop-filter: blur(24px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 320px;
            max-width: 500px;
            animation: fadeIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: auto;
            position: relative;
            overflow: hidden;
        }
        
        .cloner-notification.closing {
            animation: fadeOut 0.25s cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        
        .cloner-notification::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, 
                transparent,
                rgba(255, 255, 255, 0.5),
                transparent
            );
            animation: shimmer 2s infinite;
            background-size: 200% 100%;
        }
        
        .cloner-notification-icon {
            flex-shrink: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .cloner-notification-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .cloner-notification-title {
            font-weight: 600;
            font-size: 14px;
            letter-spacing: -0.01em;
        }
        
        .cloner-notification-message {
            font-size: 13px;
            opacity: 0.9;
            font-weight: 400;
        }
        
        .cloner-notification.success .cloner-notification-icon {
            color: #43b581;
        }
        
        .cloner-notification.error .cloner-notification-icon {
            color: #f04747;
        }
        
        .cloner-notification.info .cloner-notification-icon {
            color: #5865f2;
        }
        
        .cloner-notification-progress-timer {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: linear-gradient(90deg, #5865f2, #7289da);
            animation: progressShrink linear forwards;
            border-radius: 0 0 12px 12px;
        }
        
        .cloner-progress-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 99998;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        }
        
        .cloner-progress-container {
            background: rgba(30, 31, 34, 0.95);
            backdrop-filter: blur(24px) saturate(180%);
            -webkit-backdrop-filter: blur(24px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 32px;
            min-width: 400px;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: fadeIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        
        .cloner-progress-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 24px;
        }
        
        .cloner-progress-icon {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #5865f2, #7289da);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            flex-shrink: 0;
            box-shadow: 0 4px 16px rgba(88, 101, 242, 0.3);
        }
        
        .cloner-progress-title {
            font-size: 20px;
            font-weight: 700;
            color: white;
            letter-spacing: -0.02em;
        }
        
        .cloner-progress-subtitle {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.6);
            margin-top: 4px;
            font-weight: 500;
        }
        
        .cloner-progress-bar-container {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            height: 8px;
            overflow: hidden;
            margin-bottom: 12px;
            position: relative;
        }
        
        .cloner-progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #5865f2, #7289da);
            border-radius: 8px;
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            box-shadow: 0 0 12px rgba(88, 101, 242, 0.5);
        }
        
        .cloner-progress-bar-fill::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, 
                transparent,
                rgba(255, 255, 255, 0.3),
                transparent
            );
            animation: shimmer 2s infinite;
            background-size: 200% 100%;
        }
        
        .cloner-progress-text {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.8);
            text-align: center;
            font-weight: 600;
        }
        
        .cloner-cancel-button {
            margin-top: 20px;
            width: 100%;
            padding: 12px;
            background: rgba(240, 71, 71, 0.15);
            border: 1px solid rgba(240, 71, 71, 0.3);
            color: #f04747;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .cloner-cancel-button:hover {
            background: rgba(240, 71, 71, 0.25);
            border-color: rgba(240, 71, 71, 0.5);
            transform: translateY(-1px);
        }
        
        .cloner-cancel-button:active {
            transform: translateY(0);
        }
    `;
    document.head.appendChild(style);
}

function removeStyles() {
    const style = document.getElementById("server-cloner-styles");
    if (style) style.remove();
}

function createNotificationContainer() {
    if (!notificationContainer) {
        notificationContainer = document.createElement("div");
        notificationContainer.className = "cloner-notification-container";
        document.body.appendChild(notificationContainer);
    }
    return notificationContainer;
}

function notify(title: string, message: string, type: "success" | "error" | "info" = "info", duration: number = 3000) {
    const container = createNotificationContainer();

    const notification = document.createElement("div");
    notification.className = `cloner-notification ${type}`;

    const iconMap = {
        success: "✓",
        error: "✕",
        info: "ℹ"
    };

    notification.innerHTML = `
        <div class="cloner-notification-icon">${iconMap[type]}</div>
        <div class="cloner-notification-content">
            <div class="cloner-notification-title">${title}</div>
            <div class="cloner-notification-message">${message}</div>
        </div>
        ${duration > 0 ? `<div class="cloner-notification-progress-timer" style="animation-duration: ${duration}ms;"></div>` : ''}
    `;

    container.appendChild(notification);

    if (duration > 0) {
        setTimeout(() => {
            notification.classList.add("closing");
            setTimeout(() => {
                notification.remove();
                if (container.children.length === 0) {
                    container.remove();
                    notificationContainer = null;
                }
            }, 250);
        }, duration);
    }

    return notification;
}

let persistentNotifications: Map<string, HTMLElement> = new Map();

function createPersistentNotification(id: string, title: string, message: string): string {
    const container = createNotificationContainer();

    const notification = document.createElement("div");
    notification.className = "cloner-notification info";
    notification.innerHTML = `
        <div class="cloner-notification-icon">⟳</div>
        <div class="cloner-notification-content">
            <div class="cloner-notification-title">${title}</div>
            <div class="cloner-notification-message">${message}</div>
        </div>
    `;

    container.appendChild(notification);
    persistentNotifications.set(id, notification);

    return id;
}

function updateNotification(id: string, message: string) {
    const notification = persistentNotifications.get(id);
    if (notification) {
        const messageEl = notification.querySelector(".cloner-notification-message");
        if (messageEl) messageEl.textContent = message;
    }
}

function closeNotification(id: string) {
    const notification = persistentNotifications.get(id);
    if (notification) {
        notification.classList.add("closing");
        setTimeout(() => {
            notification.remove();
            persistentNotifications.delete(id);
            if (notificationContainer && notificationContainer.children.length === 0) {
                notificationContainer.remove();
                notificationContainer = null;
            }
        }, 250);
    }
}

function createProgressBar() {
    removeProgressBar();

    const overlay = document.createElement("div");
    overlay.className = "cloner-progress-overlay";

    const container = document.createElement("div");
    container.className = "cloner-progress-container";

    container.innerHTML = `
        <div class="cloner-progress-header">
            <div class="cloner-progress-icon">⚡</div>
            <div>
                <div class="cloner-progress-title">Cloning Server</div>
                <div class="cloner-progress-subtitle">This may take a few minutes...</div>
            </div>
        </div>
        <div class="cloner-progress-bar-container">
            <div class="cloner-progress-bar-fill" style="width: 0%"></div>
        </div>
        <div class="cloner-progress-text">Initializing...</div>
        <button class="cloner-cancel-button">Cancel Clone</button>
    `;

    const cancelButton = container.querySelector(".cloner-cancel-button");
    if (cancelButton) {
        cancelButton.addEventListener("click", () => {
            isCloning = false;
            notify("Clone Cancelled", "The cloning process was stopped", "info", 3000);
            removeProgressBar();
        });
    }

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    progressBar = overlay;
}

function updateProgress(percentage: number) {
    if (!progressBar) return;

    const fill = progressBar.querySelector(".cloner-progress-bar-fill") as HTMLElement;
    const text = progressBar.querySelector(".cloner-progress-text") as HTMLElement;

    if (fill) fill.style.width = `${percentage}%`;
    if (text) text.textContent = `${Math.round(percentage)}% Complete`;
}

function removeProgressBar() {
    if (progressBar) {
        progressBar.remove();
        progressBar = null;
    }
}

function safeGet<T>(obj: any, key: string, defaultValue: T): T {
    return obj?.[key] !== undefined ? obj[key] : defaultValue;
}

function extractChannels(guildId: string, detailed: boolean = false): FullChannel[] {
    try {
        const channels = ChannelStore.getMutableGuildChannelsForGuild(guildId);
        if (!channels) return [];

        return Object.values(channels)
            .filter((ch: any) => ch.guild_id === guildId)
            .map((ch: any) => {
                const base: any = {
                    id: ch.id,
                    name: ch.name,
                    type: ch.type,
                    parent_id: ch.parent_id || null,
                    position: ch.position,
                    topic: ch.topic || null,
                    nsfw: ch.nsfw || false,
                    rateLimitPerUser: ch.rateLimitPerUser || 0,
                    bitrate: ch.bitrate || null,
                    userLimit: ch.userLimit || null,
                };
                if (detailed) {
                    base.permissionOverwrites = ch.permissionOverwrites || [];
                    base.defaultAutoArchiveDuration = ch.defaultAutoArchiveDuration;
                    base.flags = ch.flags;
                }
                return base;
            });
    } catch (e) {
        return [];
    }
}

function extractRoles(guildId: string): FullRole[] {
    try {
        const rolesMap = GuildRoleStore.getRoles(guildId);
        if (!rolesMap) return [];

        return Object.values(rolesMap).map((role: Role) => ({
            id: role.id,
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            position: role.position,
            permissions: role.permissions.toString(),
            mentionable: role.mentionable,
            icon: role.icon || null,
            unicodeEmoji: role.unicodeEmoji || null
        }));
    } catch (e) {
        return [];
    }
}

async function imageToBase64(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        return null;
    }
}

class RateLimiter {
    private queue: Array<() => Promise<any>> = [];
    private processing = false;
    private baseDelay: number;

    constructor(baseDelay: number) {
        this.baseDelay = baseDelay;
    }

    async execute<T>(fn: () => Promise<T>, onWait?: (msg: string) => void): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await fn();
                    const delay = randomDelay(this.baseDelay, this.baseDelay + 300);
                    if (onWait) onWait(`Waiting ${Math.round(delay / 1000)}s...`);
                    await sleep(delay);
                    resolve(result);
                } catch (error: any) {
                    if (error?.status === 429) {
                        const retryAfter = error.body?.retry_after || 5;
                        if (onWait) onWait(`Rate limited. Retrying in ${retryAfter}s...`);
                        await sleep(retryAfter * 1000);
                        try {
                            const result = await fn();
                            resolve(result);
                        } catch (retryError) {
                            reject(retryError);
                        }
                    } else {
                        reject(error);
                    }
                }
            });

            if (!this.processing) {
                this.processQueue();
            }
        });
    }

    private async processQueue() {
        this.processing = true;
        while (this.queue.length > 0) {
            const fn = this.queue.shift();
            if (fn) await fn();
        }
        this.processing = false;
    }
}

function checkGuildExistence(sourceGuildId: string, newGuildId: string) {
    const sourceGuild = GuildStore.getGuild(sourceGuildId);
    const newGuild = GuildStore.getGuild(newGuildId);

    if (!sourceGuild) {
        isCloning = false;
        notify("Clone Stopped", "Source server no longer exists", "error");
        removeProgressBar();
        throw new Error("Source server deleted");
    }

    if (!newGuild) {
        isCloning = false;
        notify("Clone Stopped", "New server was deleted", "error");
        removeProgressBar();
        throw new Error("New server deleted");
    }
}

async function cloneServer(guild: Guild) {
    if (isCloning) {
        notify("Already Cloning", "Please wait for the current clone to finish", "info");
        return;
    }

    isCloning = true;
    createProgressBar();

    const channelRateLimiter = new RateLimiter(settings.store.channelDelay);

    try {
        updateProgress(5);

        const fullChannels = extractChannels(guild.id, true);
        const fullRoles = extractRoles(guild.id);

        let fullGuildData: any = null;
        try {
            const response = await RestAPI.get({ url: `/guilds/${guild.id}` });
            fullGuildData = response.body;
        } catch (e) {
            console.warn("[ServerCloner] Could not fetch full guild data:", e);
        }

        const isCommunity = guild.features?.has?.("COMMUNITY") || false;

        let iconBase64: string | null = null;
        if (guild.icon) {
            const iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=512`;
            iconBase64 = await imageToBase64(iconUrl);
        }

        let bannerBase64: string | null = null;
        if (fullGuildData?.banner) {
            const bannerUrl = `https://cdn.discordapp.com/banners/${guild.id}/${fullGuildData.banner}.png?size=1024`;
            bannerBase64 = await imageToBase64(bannerUrl);
        }

        let splashBase64: string | null = null;
        if (fullGuildData?.splash) {
            const splashUrl = `https://cdn.discordapp.com/splashes/${guild.id}/${fullGuildData.splash}.png?size=1024`;
            splashBase64 = await imageToBase64(splashUrl);
        }

        updateProgress(10);

        const createPayload: any = {
            name: guild.name,
            icon: iconBase64,
            channels: [],
            roles: [],
            system_channel_id: null
        };

        const createResponse = await RestAPI.post({
            url: "/guilds",
            body: createPayload
        });

        if (!createResponse?.body?.id) {
            throw new Error("Failed to create server");
        }

        const newGuildId = createResponse.body.id;
        await sleep(1000);

        checkGuildExistence(guild.id, newGuildId);

        updateProgress(15);

        notify("Server Created", `Created "${guild.name}"`, "success", 2000);

        const newGuild = GuildStore.getGuild(newGuildId);
        if (!newGuild) throw new Error("Could not find newly created guild");

        await sleep(1500);

        const roleNotifId = createPersistentNotification("roles", "Cloning Roles", "Starting role creation...");

        const sortedRoles = fullRoles
            .filter(r => r.name !== "@everyone")
            .sort((a, b) => a.position - b.position);

        const roleIdMap: Record<string, string> = {};
        let rolesFailed = 0;
        let rolesStored = 0;

        for (const role of sortedRoles) {
            checkGuildExistence(guild.id, newGuildId);
            if (!isCloning) break;

            rolesStored++;
            const totalProgress = 15 + ((rolesStored / sortedRoles.length) * 25);
            updateProgress(totalProgress);
            updateNotification(roleNotifId, `Cloning role ${rolesStored}/${sortedRoles.length}: ${role.name}`);

            try {
                const rolePayload: any = {
                    name: role.name,
                    permissions: role.permissions,
                    color: role.color,
                    hoist: role.hoist,
                    mentionable: role.mentionable
                };

                if (role.icon) rolePayload.icon = role.icon;
                if (role.unicodeEmoji) rolePayload.unicode_emoji = role.unicodeEmoji;

                const response = await channelRateLimiter.execute(async () => {
                    return await RestAPI.post({
                        url: `/guilds/${newGuildId}/roles`,
                        body: rolePayload
                    });
                }, (msg) => updateNotification(roleNotifId, `${msg} (Role ${rolesStored}/${sortedRoles.length})`));

                if (response?.body?.id) {
                    roleIdMap[role.id] = response.body.id;
                }
            } catch (e) {
                rolesFailed++;
            }
        }

        closeNotification(roleNotifId);
        notify("Roles Complete", `Created ${sortedRoles.length - rolesFailed} roles`, "success", 2000);

        updateProgress(45);

        const channelNotifId = createPersistentNotification("channels", "Cloning Channels", "Starting channel creation...");

        const categories = fullChannels.filter(c => c.type === 4);
        const otherChannels = fullChannels.filter(c => c.type !== 4);
        const channelIdMap: Record<string, string> = {};
        let channelsFailed = 0;

        const sortedCategories = categories.sort((a, b) => a.position - b.position);
        let catStored = 0;

        for (const cat of sortedCategories) {
            checkGuildExistence(guild.id, newGuildId);
            if (!isCloning) break;
            catStored++;

            try {
                const catPayload: any = {
                    name: cat.name,
                    type: cat.type,
                    position: cat.position
                };

                if (cat.permissionOverwrites.length > 0) {
                    const mappedOverwrites = cat.permissionOverwrites
                        .filter(ow => ow.type === 0 && roleIdMap[ow.id])
                        .map(ow => ({
                            id: roleIdMap[ow.id],
                            type: ow.type,
                            allow: ow.allow,
                            deny: ow.deny
                        }));
                    if (mappedOverwrites.length > 0) {
                        catPayload.permission_overwrites = mappedOverwrites;
                    }
                }

                const response = await channelRateLimiter.execute(async () => {
                    return await RestAPI.post({
                        url: `/guilds/${newGuildId}/channels`,
                        body: catPayload
                    });
                }, (msg) => updateNotification(channelNotifId, `${msg} (Cat ${catStored}/${sortedCategories.length})`));

                if (response?.body?.id) {
                    channelIdMap[cat.id] = response.body.id;
                }
            } catch (e) {
                channelsFailed++;
            }
        }

        const sortedOtherChannels = otherChannels.sort((a, b) => a.position - b.position);
        let chStored = 0;

        for (const ch of sortedOtherChannels) {
            checkGuildExistence(guild.id, newGuildId);
            if (!isCloning) break;
            chStored++;

            const chPayload: any = {
                name: ch.name,
                type: ch.type,
                parent_id: ch.parent_id ? (channelIdMap[ch.parent_id] || null) : null,
                position: ch.position,
            };

            if (ch.topic) chPayload.topic = ch.topic;
            if (ch.nsfw) chPayload.nsfw = ch.nsfw;
            if (ch.rateLimitPerUser) chPayload.rate_limit_per_user = ch.rateLimitPerUser;
            if (ch.defaultAutoArchiveDuration) chPayload.default_auto_archive_duration = ch.defaultAutoArchiveDuration;

            if (ch.type === 2 || ch.type === 13) {
                if (ch.bitrate) chPayload.bitrate = ch.bitrate;
                if (ch.userLimit) chPayload.user_limit = ch.userLimit;
            }

            if (ch.permissionOverwrites.length > 0) {
                const mappedOverwrites = ch.permissionOverwrites
                    .filter(ow => ow.type === 0 && roleIdMap[ow.id])
                    .map(ow => ({
                        id: roleIdMap[ow.id],
                        type: ow.type,
                        allow: ow.allow,
                        deny: ow.deny
                    }));
                if (mappedOverwrites.length > 0) {
                    chPayload.permission_overwrites = mappedOverwrites;
                }
            }

            try {
                const totalProgress = 70 + ((chStored / sortedOtherChannels.length) * 25);
                updateProgress(totalProgress);
                updateNotification(channelNotifId, `Cloning channel ${chStored}/${sortedOtherChannels.length}: ${ch.name}`);

                await channelRateLimiter.execute(async () => {
                    await RestAPI.post({ url: `/guilds/${newGuildId}/channels`, body: chPayload });
                }, (msg) => updateNotification(channelNotifId, `${msg} (Ch ${chStored}/${sortedOtherChannels.length})`));
            } catch (e) {
                channelsFailed++;
            }
        }

        closeNotification(channelNotifId);

        notify("Channels Complete", `Created ${categories.length + otherChannels.length - channelsFailed} channels`, "success", 2000);

        if (isCommunity) {
            try {
                const newChannelsRaw = extractChannels(newGuildId, false);
                const rulesChannel = newChannelsRaw.find((c: any) => c.name?.toLowerCase().includes("rule") || c.name?.toLowerCase().includes("rules"));
                const updatesChannel = newChannelsRaw.find((c: any) =>
                    c.name?.toLowerCase().includes("update") ||
                    c.name?.toLowerCase().includes("news") ||
                    c.name?.toLowerCase().includes("announcement")
                );

                const firstTextChannel = newChannelsRaw.find((c: any) => c.type === 0);

                const communityPayload: any = {
                    features: ["COMMUNITY"],
                    verification_level: Math.max(safeGet(guild, "verificationLevel", 1), 1),
                    explicit_content_filter: 2,
                    rules_channel_id: rulesChannel?.id || firstTextChannel?.id || null,
                    public_updates_channel_id: updatesChannel?.id || firstTextChannel?.id || null
                };

                if (fullGuildData?.description) {
                    communityPayload.description = fullGuildData.description;
                }

                await channelRateLimiter.execute(async () => {
                    await RestAPI.patch({
                        url: `/guilds/${newGuildId}`,
                        body: communityPayload
                    });
                });
            } catch (e) {
                console.warn("[ServerCloner] Failed to enable community features:", e);
            }
        }

        if (bannerBase64 || splashBase64 || fullGuildData?.description) {
            try {
                const updatePayload: any = {};
                if (bannerBase64) updatePayload.banner = bannerBase64;
                if (splashBase64) updatePayload.splash = splashBase64;
                if (fullGuildData?.description) updatePayload.description = fullGuildData.description;

                await channelRateLimiter.execute(async () => {
                    await RestAPI.patch({
                        url: `/guilds/${newGuildId}`,
                        body: updatePayload
                    });
                });
            } catch (e) {
                console.warn("[ServerCloner] Failed to update guild assets:", e);
            }
        }

        updateProgress(100);

        const totalFailed = rolesFailed + channelsFailed;
        if (totalFailed > 0) {
            notify("Clone Complete", `Cloned with ${totalFailed} errors`, "success", 5000);
        } else {
            notify("Clone Complete!", `Successfully cloned "${guild.name}"!`, "success", 5000);
        }

    } catch (e: any) {
        notify("Clone Failed", e.message || "An error occurred while cloning", "error");
    } finally {
        isCloning = false;
        removeProgressBar();
    }
}

const CloneIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
);

const guildContextMenuPatch: NavContextMenuPatchCallback = (children: any[], props: { guild?: Guild; }) => {
    if (!props?.guild) return;

    const group = findGroupChildrenByChildId("privacy", children);
    const menuItem = (
        <Menu.MenuItem
            id="clone-server-pro"
            label="Clone Server"
            action={() => cloneServer(props.guild!)}
            icon={CloneIcon}
        />
    );

    if (group) {
        group.push(menuItem);
    } else {
        children.push(<Menu.MenuGroup>{menuItem}</Menu.MenuGroup>);
    }
};

export default definePlugin({
    name: "ServerCloner",
    description: "Clone servers with channels, roles, permissions and community features",
    authors: [Devs["3Tb"]],
    settings,

    start() {
        injectStyles();
    },

    stop() {
        removeStyles();
    },

    patches: [
        {
            find: '"GuildChannelStore"',
            replacement: [
                {
                    match: /isChannelGated\(.+?\)(?=&&)/,
                    replace: (m: string) => `${m}&&false`
                },
                {
                    match: /(?<=getChannels\(\i)(\){.*?)return (.+?)}/,
                    replace: (_: string, rest: string, channels: string) => `,shouldIncludeHidden${rest}return shouldIncludeHidden?${channels}:${channels};}`
                },
            ]
        }
    ],

    contextMenus: {
        "guild-context": guildContextMenuPatch,
        "guild-header-popout": guildContextMenuPatch
    }
});
