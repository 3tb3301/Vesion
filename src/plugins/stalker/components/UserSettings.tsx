/* eslint-disable simple-header/header */
/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { classNameFactory } from "@api/Styles";
import { Button } from "@components/Button";
import { FormSwitchCompat } from "@components/FormSwitch";
import { ModalCloseButton, ModalContent, ModalHeader, type ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Forms, GuildStore, ScrollerThin, Text, useState } from "@webpack/common";

import { getUserConfig, persistUserConfig } from "../store";
import { UserStalkerConfig } from "../types";
import { BellIcon } from "./Icons";

const cl = classNameFactory("stalker-modal-");

function SettingRowWithNotification({
    label,
    note,
    logValue,
    notifyValue,
    onLogChange,
    onNotifyChange
}: {
    label: string;
    note: string;
    logValue: boolean;
    notifyValue: boolean;
    onLogChange: (value: boolean) => void;
    onNotifyChange: (value: boolean) => void;
}) {
    return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <div style={{ flex: 1 }}>
                <FormSwitchCompat
                    value={logValue}
                    onChange={onLogChange}
                    note={note}
                >
                    {label}
                </FormSwitchCompat>
            </div>
            <BellIcon enabled={notifyValue} onClick={() => onNotifyChange(!notifyValue)} />
        </div>
    );
}

function ServerSelectorModal({ modalProps, currentList, onUpdate }: { modalProps: ModalProps; currentList: string[]; onUpdate: (serverIds: string[]) => void; }) {
    const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set(currentList));
    const [searchQuery, setSearchQuery] = useState("");

    const allGuilds = Object.values(GuildStore.getGuilds());
    const filteredGuilds = allGuilds.filter(guild =>
        guild.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const toggleServer = (serverId: string) => {
        const newSet = new Set(selectedServers);
        if (newSet.has(serverId)) {
            newSet.delete(serverId);
        } else {
            newSet.add(serverId);
        }
        setSelectedServers(newSet);
    };

    const handleSave = () => {
        onUpdate(Array.from(selectedServers));
        modalProps.onClose();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM} className={cl("root") + " stalker-modal-root"}>
            <ModalHeader className={cl("head")}>
                <Text variant="heading-lg/semibold">Select Servers</Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className={cl("contents") + " stalker-modal-contents"} style={{ padding: "16px" }}>
                <Forms.FormText style={{ marginBottom: "8px" }}>
                    Select which servers to include. You have {selectedServers.size} server(s) selected.
                </Forms.FormText>

                <input
                    type="text"
                    placeholder="Search servers..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="stalker-server-search-input"
                />

                <ScrollerThin style={{ maxHeight: "400px", marginBottom: "16px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {filteredGuilds.length === 0 ? (
                            <Text variant="text-md/normal" color="text-muted" style={{ fontStyle: "italic", padding: "8px" }}>
                                No servers found
                            </Text>
                        ) : (
                            filteredGuilds.map(guild => {
                                const isSelected = selectedServers.has(guild.id);
                                return (
                                    <div
                                        key={guild.id}
                                        onClick={() => toggleServer(guild.id)}
                                        className={`stalker-server-item ${isSelected ? "selected" : ""}`}
                                    >
                                        <div style={{
                                            width: "20px",
                                            height: "20px",
                                            borderRadius: "4px",
                                            border: `2px solid ${isSelected ? "var(--brand-experiment)" : "var(--interactive-normal)"}`,
                                            backgroundColor: isSelected ? "var(--brand-experiment)" : "transparent",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            flexShrink: 0
                                        }}>
                                            {isSelected && (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                                </svg>
                                            )}
                                        </div>
                                        {guild.icon && (
                                            <img
                                                src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=32`}
                                                alt=""
                                                style={{ width: "32px", height: "32px", borderRadius: "50%" }}
                                            />
                                        )}
                                        <Text
                                            variant="text-md/normal"
                                            className="stalker-server-item-name"
                                            style={{ flex: 1, fontWeight: isSelected ? "600" : "normal" }}
                                        >
                                            {guild.name}
                                        </Text>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </ScrollerThin>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", borderTop: "1px solid var(--background-modifier-accent)", paddingTop: "16px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <Button size="small" variant="secondary" onClick={() => setSelectedServers(new Set(allGuilds.map(g => g.id)))}>
                            Select All
                        </Button>
                        <Button size="small" variant="secondary" onClick={() => setSelectedServers(new Set())}>
                            Clear All
                        </Button>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <Button variant="secondary" onClick={modalProps.onClose}>Cancel</Button>
                        <Button variant="primary" onClick={handleSave}>Save ({selectedServers.size})</Button>
                    </div>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

export function UserStalkerSettingsModal({ modalProps, userId, userStore }: { modalProps: ModalProps; userId: string; userStore: any; }) {
    const user = userStore.getUser(userId);
    const [config, setConfig] = useState<UserStalkerConfig>(() => getUserConfig(userId));

    const updateConfig = (key: keyof Omit<UserStalkerConfig, "userId">, value: any) => {
        const newConfig = { ...config, [key]: value };
        setConfig(newConfig);
        persistUserConfig(userId, newConfig);
    };

    const openServerSelector = () => {
        openModal(innerModalProps => (
            <ServerSelectorModal
                modalProps={innerModalProps}
                currentList={config.serverList || []}
                onUpdate={serverIds => updateConfig("serverList", serverIds)}
            />
        ));
    };

    const removeServer = (serverId: string) => {
        const currentList = config.serverList || [];
        updateConfig("serverList", currentList.filter(id => id !== serverId));
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM} className={cl("root") + " stalker-modal-root"}>
            <ModalHeader className={cl("head")}>
                <Text variant="heading-lg/semibold">
                    Stalker Settings for {user?.username ?? "User"}
                </Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className={cl("contents") + " stalker-modal-contents"} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>

                {/* Logging & Notifications */}
                <div>
                    <Forms.FormTitle tag="h3">Logging & Notifications</Forms.FormTitle>
                    <Forms.FormText style={{ marginBottom: "8px", opacity: 0.8 }}>
                        Control which events are logged and whether they trigger notifications.
                    </Forms.FormText>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                        {/* Presence */}
                        <div style={{ backgroundColor: "var(--background-secondary-alt)", borderRadius: "8px", padding: "12px", border: "1px solid var(--background-modifier-accent)" }}>
                            <SettingRowWithNotification
                                label="Log Presence Changes"
                                note="Log status changes (online, idle, dnd, offline) and activities"
                                logValue={config.logPresenceChanges}
                                notifyValue={config.notifyPresenceChanges}
                                onLogChange={value => updateConfig("logPresenceChanges", value)}
                                onNotifyChange={value => updateConfig("notifyPresenceChanges", value)}
                            />

                            {config.notifyPresenceChanges && (
                                <div style={{
                                    marginTop: "12px",
                                    marginLeft: "8px",
                                    paddingLeft: "16px",
                                    borderLeft: "3px solid var(--brand-experiment)",
                                    display: "grid",
                                    gridTemplateColumns: "repeat(2, 1fr)",
                                    gap: "6px"
                                }}>
                                    <Text variant="text-sm/semibold" style={{ gridColumn: "1 / -1", marginBottom: "4px" }}>
                                        Notify on status:
                                    </Text>
                                    {[
                                        { key: "notifyOnline", label: "Online" },
                                        { key: "notifyOffline", label: "Offline" },
                                        { key: "notifyIdle", label: "Idle" },
                                        { key: "notifyDnd", label: "Do Not Disturb" }
                                    ].map(({ key, label }) => (
                                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <input
                                                type="checkbox"
                                                checked={config[key as keyof UserStalkerConfig] !== false}
                                                onChange={e => updateConfig(key as any, e.target.checked)}
                                                style={{ cursor: "pointer" }}
                                            />
                                            <Text variant="text-sm/normal" style={{ cursor: "pointer" }}
                                                onClick={() => updateConfig(key as any, !(config[key as keyof UserStalkerConfig] !== false))}>
                                                {label}
                                            </Text>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Profile */}
                        <div style={{ backgroundColor: "var(--background-secondary-alt)", borderRadius: "8px", padding: "12px", border: "1px solid var(--background-modifier-accent)" }}>
                            <SettingRowWithNotification
                                label="Log Profile Changes"
                                note="Log profile updates (avatar, banner, bio, username, etc.)"
                                logValue={config.logProfileChanges}
                                notifyValue={config.notifyProfileChanges}
                                onLogChange={value => updateConfig("logProfileChanges", value)}
                                onNotifyChange={value => updateConfig("notifyProfileChanges", value)}
                            />

                            {config.notifyProfileChanges && (
                                <div style={{
                                    marginTop: "12px",
                                    marginLeft: "8px",
                                    paddingLeft: "16px",
                                    borderLeft: "3px solid var(--brand-experiment)",
                                    display: "grid",
                                    gridTemplateColumns: "repeat(2, 1fr)",
                                    gap: "6px"
                                }}>
                                    <Text variant="text-sm/semibold" style={{ gridColumn: "1 / -1", marginBottom: "4px" }}>
                                        Notify on changes:
                                    </Text>
                                    {[
                                        { key: "notifyUsername", label: "Username" },
                                        { key: "notifyAvatar", label: "Avatar" },
                                        { key: "notifyBanner", label: "Banner" },
                                        { key: "notifyBio", label: "Bio/About Me" },
                                        { key: "notifyPronouns", label: "Pronouns" },
                                        { key: "notifyGlobalName", label: "Display Name" }
                                    ].map(({ key, label }) => (
                                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <input
                                                type="checkbox"
                                                checked={config[key as keyof UserStalkerConfig] !== false}
                                                onChange={e => updateConfig(key as any, e.target.checked)}
                                                style={{ cursor: "pointer" }}
                                            />
                                            <Text variant="text-sm/normal" style={{ cursor: "pointer" }}
                                                onClick={() => updateConfig(key as any, !(config[key as keyof UserStalkerConfig] !== false))}>
                                                {label}
                                            </Text>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Messages */}
                        <div style={{ backgroundColor: "var(--background-secondary-alt)", borderRadius: "8px", padding: "12px", border: "1px solid var(--background-modifier-accent)" }}>
                            <SettingRowWithNotification
                                label="Log Messages"
                                note="Log when this user sends messages in other servers"
                                logValue={config.logMessages}
                                notifyValue={config.notifyMessages}
                                onLogChange={value => updateConfig("logMessages", value)}
                                onNotifyChange={value => updateConfig("notifyMessages", value)}
                            />

                            {(config.logMessages || config.notifyMessages) && (
                                <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--background-modifier-accent)" }}>
                                    <Forms.FormText style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                                        Server Filtering
                                    </Forms.FormText>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
                                        {[
                                            { value: "all", label: "All servers" },
                                            { value: "whitelist", label: "Only specific servers (whitelist)" },
                                            { value: "blacklist", label: "All except specific servers (blacklist)" }
                                        ].map(({ value, label }) => (
                                            <label key={value} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                                <input
                                                    type="radio"
                                                    checked={config.serverFilterMode === value}
                                                    onChange={() => updateConfig("serverFilterMode", value as any)}
                                                />
                                                <Text variant="text-sm/normal">{label}</Text>
                                            </label>
                                        ))}
                                    </div>

                                    {config.serverFilterMode !== "all" && (
                                        <div style={{ marginTop: "8px" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                                <Text variant="text-sm/bold">
                                                    {config.serverFilterMode === "whitelist" ? "Whitelisted Servers" : "Blacklisted Servers"}
                                                </Text>
                                                <Button size="small" onClick={openServerSelector}>
                                                    {(config.serverList || []).length === 0 ? "Add Servers" : "Manage Servers"}
                                                </Button>
                                            </div>

                                            {(config.serverList || []).length === 0 ? (
                                                <Text variant="text-sm/normal" color="text-muted" style={{ fontStyle: "italic" }}>
                                                    No servers selected yet.
                                                </Text>
                                            ) : (
                                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                                    {(config.serverList || []).map(serverId => {
                                                        const guild = GuildStore.getGuild(serverId);
                                                        return (
                                                            <div key={serverId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", backgroundColor: "var(--background-secondary)", borderRadius: "4px" }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                    {guild?.icon && (
                                                                        <img
                                                                            src={`https://cdn.discordapp.com/icons/${serverId}/${guild.icon}.png?size=32`}
                                                                            alt=""
                                                                            style={{ width: "20px", height: "20px", borderRadius: "50%" }}
                                                                        />
                                                                    )}
                                                                    <Text variant="text-sm/normal">{guild?.name ?? serverId}</Text>
                                                                </div>
                                                                <Button size="small" variant="dangerPrimary" onClick={() => removeServer(serverId)}>
                                                                    Remove
                                                                </Button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Typing Notifications */}
                <div style={{ borderTop: "1px solid var(--background-modifier-accent)", paddingTop: "12px" }}>
                    <Forms.FormTitle tag="h3">Typing Notifications</Forms.FormTitle>
                    <Forms.FormText style={{ marginBottom: "8px", opacity: 0.8 }}>
                        Get instant notifications when this user starts typing.
                    </Forms.FormText>

                    <div style={{ backgroundColor: "var(--background-secondary-alt)", borderRadius: "8px", padding: "12px", border: "1px solid var(--background-modifier-accent)" }}>
                        <FormSwitchCompat
                            value={config.notifyTyping}
                            onChange={value => updateConfig("notifyTyping", value)}
                            note="Show instant notification when user starts typing"
                        >
                            Notify on Typing
                        </FormSwitchCompat>

                        {config.notifyTyping && (
                            <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--background-modifier-accent)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                    <Forms.FormText style={{ fontSize: "12px", fontWeight: "600", margin: 0 }}>
                                        Conversation Window:
                                    </Forms.FormText>
                                    <input
                                        type="number"
                                        min="0"
                                        max="60"
                                        value={config.typingConversationWindow ?? 10}
                                        onChange={e => updateConfig("typingConversationWindow", parseInt(e.target.value) || 10)}
                                        style={{
                                            width: "60px",
                                            padding: "4px 8px",
                                            backgroundColor: "var(--background-tertiary)",
                                            border: "1px solid var(--background-modifier-accent)",
                                            borderRadius: "3px",
                                            color: "var(--header-primary)",
                                            fontSize: "13px"
                                        }}
                                    />
                                    <Forms.FormText style={{ fontSize: "12px", margin: 0 }}>
                                        minutes
                                    </Forms.FormText>
                                </div>
                                <Forms.FormText style={{ fontSize: "11px", opacity: 0.6, marginTop: "4px" }}>
                                    Skip typing notifications if you've recently messaged this user
                                </Forms.FormText>
                            </div>
                        )}
                    </div>
                </div>

                {/* Voice Channel Notifications */}
                <div style={{ borderTop: "1px solid var(--background-modifier-accent)", paddingTop: "12px" }}>
                    <Forms.FormTitle tag="h3">Voice Channel Notifications</Forms.FormTitle>
                    <Forms.FormText style={{ marginBottom: "8px", opacity: 0.8 }}>
                        Get notified when this user joins or leaves a voice channel.
                    </Forms.FormText>

                    <div style={{ backgroundColor: "var(--background-secondary-alt)", borderRadius: "8px", padding: "12px", border: "1px solid var(--background-modifier-accent)", display: "flex", flexDirection: "column", gap: "8px" }}>
                        <FormSwitchCompat
                            value={config.notifyVoiceJoin !== false}
                            onChange={value => updateConfig("notifyVoiceJoin", value)}
                            note="Notify when this user joins or moves to a voice channel"
                        >
                            Notify on Voice Join / Move
                        </FormSwitchCompat>
                        <FormSwitchCompat
                            value={config.notifyVoiceLeave !== false}
                            onChange={value => updateConfig("notifyVoiceLeave", value)}
                            note="Notify when this user leaves a voice channel"
                        >
                            Notify on Voice Leave
                        </FormSwitchCompat>
                    </div>
                </div>

                {/* Mutual Friend Notifications */}
                <div style={{ borderTop: "1px solid var(--background-modifier-accent)", paddingTop: "12px" }}>
                    <Forms.FormTitle tag="h3">Mutual Friend Notifications</Forms.FormTitle>
                    <Forms.FormText style={{ marginBottom: "8px", opacity: 0.8 }}>
                        Get notified when this user adds someone from your friends list.
                    </Forms.FormText>

                    <div style={{ backgroundColor: "var(--background-secondary-alt)", borderRadius: "8px", padding: "12px", border: "1px solid var(--background-modifier-accent)" }}>
                        <FormSwitchCompat
                            value={config.notifyMutualFriend !== false}
                            onChange={value => updateConfig("notifyMutualFriend", value)}
                            note="Notify when this user becomes friends with someone you know"
                        >
                            Notify on Mutual Friend Added
                        </FormSwitchCompat>
                    </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", borderTop: "1px solid var(--background-modifier-accent)", paddingTop: "16px" }}>
                    <Button onClick={modalProps.onClose}>Done</Button>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

export function openUserStalkerSettings(userId: string, userStore: any) {
    openModal(modalProps => (
        <UserStalkerSettingsModal modalProps={modalProps} userId={userId} userStore={userStore} />
    ));
}
