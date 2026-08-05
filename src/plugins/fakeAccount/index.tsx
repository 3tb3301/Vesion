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

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findStoreLazy, waitFor } from "@webpack";
import { FluxDispatcher, Menu, React, UserStore } from "@webpack/common";

const UserProfileStore = findStoreLazy("UserProfileStore");
const EmojiStore = findStoreLazy("EmojiStore");
const DS_KEY = "fakeAccount_switcher";

// ── Global State ────────────────────────────────────────────────────────────
let fakeAccounts: any[] = [];
let activeFakeId: string | null = null;
let realUserSnapshot: any = null;
let _store: any = null;
let _origGetUsers: (() => any[]) | null = null;
let _origGetValidUsers: (() => any[]) | null = null;

// ── Store Validation ────────────────────────────────────────────────────
// Critical Guard: waitFor("getUsers","getValidUsers","getHasLoggedInAccounts") can match
// several Webpack stores that share these method names. If we patch the wrong store
// (e.g., a permissions or channels store), corrupted results make all rooms disappear
// on servers with permissions.
// We verify that the matched store is indeed the MultiAccountStore by ensuring that:
// 1. getUsers() returns an array (not a Map, not an object)
// 2. getHasLoggedInAccounts() returns a boolean
// 3. Elements returned by getUsers() have the expected shape of a Discord account (id + tokenStatus)
function isMultiAccountStore(mod: any): boolean {
    try {
        if (typeof mod.getUsers !== "function") return false;
        if (typeof mod.getValidUsers !== "function" && typeof mod.getHasLoggedInAccounts !== "function") return false;

        // getUsers() doit retourner un Array (pas un objet, pas null)
        const users = mod.getUsers();
        if (!Array.isArray(users)) return false;

        // Si des users sont présents, ils doivent avoir une structure de account Discord
        // (id string + tokenStatus number) — caractéristique exclusive du MultiAccountStore
        if (users.length > 0) {
            const first = users[0];
            if (typeof first !== "object" || first === null) return false;
            // EmojiStore a aussi getUsers mais il contient des objets complexes
            // MultiAccountStore contient des objets simples avec id/username/avatar/tokenStatus
            if (typeof first.id !== "string") return false;
            // tokenStatus is exclusive to MultiAccountStore (0 = invalid, 1 = valid, 2 = fake)
            // Other stores may have objects with id but not tokenStatus
            if (!("tokenStatus" in first) && !("pushSyncToken" in first)) {
                // Tolerate empty stores (no accounts registered yet)
                // but reject if the object looks like a channel, role, or permission
                if ("type" in first || "permissions" in first || "parentId" in first) return false;
            }
        }

        // Vérification finale anti-EmojiStore : EmojiStore a souvent "getFrequentlyUsedEmojis"
        if (typeof mod.getFrequentlyUsedEmojis === "function") return false;

        return true;
    } catch {
        return false;
    }
}

// ── Store Patch ─────────────────────────────────────────────────────────
function patchStore() {
    if (!_store || _origGetUsers) return;

    _origGetUsers = _store.getUsers.bind(_store);
    _origGetValidUsers = _store.getValidUsers?.bind(_store) ?? (() => []);

    _store.getUsers = () => {
        const real: any[] = _origGetUsers?.() ?? [];
        const realIds = new Set(real.map((u: any) => u.id));
        const extras = fakeAccounts
            .filter(f => !realIds.has(f.id))
            .map(f => ({
                id: f.id,
                username: f.username,
                globalName: f.globalName ?? f.username,
                discriminator: f.discriminator ?? "0",
                avatar: f.avatar ?? null,
                tokenStatus: 2,
                pushSyncToken: null,
            }));
        return [...real, ...extras];
    };

    _store.getValidUsers = () => {
        const real: any[] = _origGetValidUsers?.() ?? [];
        const realIds = new Set(real.map((u: any) => u.id));
        const extras = fakeAccounts
            .filter(f => !realIds.has(f.id))
            .map(f => ({
                id: f.id,
                username: f.username,
                globalName: f.globalName ?? f.username,
                discriminator: f.discriminator ?? "0",
                avatar: f.avatar ?? null,
                tokenStatus: 2,
                pushSyncToken: null,
            }));
        return [...real, ...extras.filter(e => !realIds.has(e.id))];
    };

    _store.getHasLoggedInAccounts = () => true;
}

function unpatchStore() {
    if (!_store || !_origGetUsers) return;
    _store.getUsers = _origGetUsers;
    if (_origGetValidUsers) _store.getValidUsers = _origGetValidUsers;
    _origGetUsers = null;
    _origGetValidUsers = null;
    _store.emitChange?.();
}

// ── simulateSwitch ─────────────────────────────────────────────────────────
function simulateSwitch(fake: any) {
    const me = UserStore.getCurrentUser();
    if (!me) return;

    if (!realUserSnapshot) {
        realUserSnapshot = {
            username: me.username,
            globalName: (me as any).globalName ?? me.username,
            avatar: me.avatar,
            banner: (me as any).banner ?? null,
            bio: (me as any).bio ?? "",
            accentColor: (me as any).accentColor ?? null,
            discriminator: me.discriminator ?? "0",
            publicFlags: (me as any).publicFlags ?? 0,
            flags: (me as any).flags ?? 0,
            premiumType: (me as any).premiumType ?? 0,
        };
    }

    activeFakeId = fake.id;

    FluxDispatcher.dispatch({
        type: "USER_UPDATE",
        user: {
            id: me.id,
            username: fake.username,
            global_name: fake.globalName ?? fake.username,
            avatar: fake.avatar ?? null,
            banner: fake._banner ?? null,
            bio: fake._bio ?? "",
            accent_color: fake._accentColor ?? null,
            discriminator: fake.discriminator ?? "0",
            public_flags: fake._publicFlags ?? 0,
            flags: fake._flags ?? 0,
            premium_type: fake._premiumType ?? 0,
        },
    });

    // Force the bottom-left panel (AccountPanel) to re-render
    try {
        const updated = UserStore.getCurrentUser();
        if (updated) FluxDispatcher.dispatch({ type: "CURRENT_USER_UPDATE", user: { ...updated } });
        FluxDispatcher.dispatch({ type: "IDLE" });
    } catch { }

    _store?.emitChange?.();
    showRestoreButton();
}

// ── restoreRealAccount ─────────────────────────────────────────────────────
function restoreRealAccount() {
    if (!realUserSnapshot) return;
    const me = UserStore.getCurrentUser();
    if (!me) return;

    FluxDispatcher.dispatch({
        type: "USER_UPDATE",
        user: {
            id: me.id,
            username: realUserSnapshot.username,
            global_name: realUserSnapshot.globalName,
            avatar: realUserSnapshot.avatar ?? null,
            banner: realUserSnapshot.banner ?? null,
            bio: realUserSnapshot.bio ?? "",
            accent_color: realUserSnapshot.accentColor ?? null,
            discriminator: realUserSnapshot.discriminator ?? "0",
            public_flags: realUserSnapshot.publicFlags ?? 0,
            flags: realUserSnapshot.flags ?? 0,
            premium_type: realUserSnapshot.premiumType ?? 0,
        },
    });

    activeFakeId = null;
    realUserSnapshot = null;

    // Force the bottom-left panel (AccountPanel) to re-render
    try {
        const updated = UserStore.getCurrentUser();
        if (updated) FluxDispatcher.dispatch({ type: "CURRENT_USER_UPDATE", user: { ...updated } });
        FluxDispatcher.dispatch({ type: "USER_SETTINGS_PROTO_UPDATE", settings: { type: 1, proto: {} } });
        FluxDispatcher.dispatch({ type: "IDLE" });
    } catch { }

    _store?.emitChange?.();
    removeRestoreButton();
}

// ── Switch action subscriptions ──────────────────────────────────
function onSwitchFailure(action: any) {
    const userId = action.userId ?? action.user_id ?? action.id;
    const fake = fakeAccounts.find(f => f.id === userId);
    if (!fake) return;
    simulateSwitch(fake);
}

function onSwitchAttempt(action: any) {
    const userId = action.userId ?? action.user_id ?? action.id;
    const fake = fakeAccounts.find(f => f.id === userId);
    if (!fake) return;
    simulateSwitch(fake);
}

// ── DISCONNECT Handler (removal) of a fake account ──────────────────
function onRemoveAccount(action: any) {
    const userId = action.userId ?? action.user_id ?? action.id;
    if (!userId) return;

    const idx = fakeAccounts.findIndex(f => f.id === userId);
    if (idx === -1) return; // Not a fake account, ignore

    // If it's the currently active fake, restore real profile
    if (activeFakeId === userId) {
        restoreRealAccount();
    }

    // Remove from array and persist
    fakeAccounts.splice(idx, 1);
    DataStore.set(DS_KEY, fakeAccounts.map(f => f.id));

    // Force re-render of switcher
    _store?.emitChange?.();
}

function addToSwitcher(userId: string) {
    if (fakeAccounts.find(f => f.id === userId)) return;

    const user = UserStore.getUser(userId);
    const profile = UserProfileStore.getUserProfile?.(userId) ?? {};
    const username = user?.username ?? `User_${userId.slice(-4)}`;
    const bot = user?.bot ?? false;

    fakeAccounts.push({
        id: userId,
        username,
        globalName: (user as any)?.globalName ?? username,
        discriminator: user?.discriminator ?? "0",
        avatar: user?.avatar ?? null,
        bot,
        _bio: profile.bio ?? "",
        _banner: profile.banner ?? null,
        _accentColor: profile.accentColor ?? null,
        _publicFlags: (user as any)?.publicFlags ?? 0,
        _flags: (user as any)?.flags ?? 0,
        _premiumType: (user as any)?.premiumType ?? 0,
    });

    DataStore.set(DS_KEY, fakeAccounts.map(f => f.id));
    patchStore();
    _store?.emitChange?.();
}

function removeFromSwitcher(userId: string) {
    const idx = fakeAccounts.findIndex(f => f.id === userId);
    if (idx === -1) return;

    if (activeFakeId === userId) {
        restoreRealAccount();
    }

    fakeAccounts.splice(idx, 1);
    DataStore.set(DS_KEY, fakeAccounts.map(f => f.id));
    _store?.emitChange?.();
}

// ── UI: Restore Button (injected directly into the DOM, no HeaderBar API needed) ──
let restoreBtnEl: HTMLDivElement | null = null;
let restoreObserver: MutationObserver | null = null;

function createRestoreButtonEl(): HTMLDivElement {
    const btn = document.createElement("div");
    btn.id = "fakeswitcher-restore-btn";
    btn.title = "Fake account active — click to restore your real account";
    btn.style.position = "fixed";
    btn.style.bottom = "16px";
    btn.style.right = "16px";
    btn.style.zIndex = "9999";
    btn.style.width = "40px";
    btn.style.height = "40px";
    btn.style.borderRadius = "50%";
    btn.style.background = "var(--brand-500, #5865f2)";
    btn.style.color = "#fff";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.4)";
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;
    btn.onclick = () => {
        restoreRealAccount();
        removeRestoreButton();
    };
    return btn;
}

function showRestoreButton() {
    if (restoreBtnEl) return;
    restoreBtnEl = createRestoreButtonEl();
    document.body.appendChild(restoreBtnEl);
}

function removeRestoreButton() {
    if (!restoreBtnEl) return;
    restoreBtnEl.remove();
    restoreBtnEl = null;
}

function startRestoreButtonWatcher() {
    stopRestoreButtonWatcher();
    restoreObserver = new MutationObserver(() => {
        if (activeFakeId && !restoreBtnEl) showRestoreButton();
        if (!activeFakeId && restoreBtnEl) removeRestoreButton();
    });
    restoreObserver.observe(document.body, { childList: true, subtree: false });
    if (activeFakeId) showRestoreButton();
}

function stopRestoreButtonWatcher() {
    if (restoreObserver) {
        restoreObserver.disconnect();
        restoreObserver = null;
    }
    removeRestoreButton();
}

function FakeAccountIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
        </svg>
    );
}

function FakeAccountRemoveIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            <path d="M4 4L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

const ctxPatch: NavContextMenuPatchCallback = (children, { user }) => {
    if (!children || !Array.isArray(children)) return;
    try {
        if (!user || user.id === UserStore.getCurrentUser()?.id) return;

        const isInSwitcher = fakeAccounts.some(f => f.id === user.id);

        children.push(
            isInSwitcher ? (
                <Menu.MenuItem
                    id="fake-account-remove"
                    label="Remove from Switcher (Fake)"
                    icon={FakeAccountRemoveIcon}
                    action={() => removeFromSwitcher(user.id)}
                />
            ) : (
                <Menu.MenuItem
                    id="fake-account-add"
                    label="Add to Switcher (Fake)"
                    icon={FakeAccountIcon}
                    action={() => addToSwitcher(user.id)}
                />
            )
        );
    } catch (e) {
        console.error("[FakeAccount] Context menu patch error:", e);
    }
};

// ── Plugin ─────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "FakeAccount",
    enabledByDefault: true,
    description: "Right-click → add a user to the switcher. Click in the switcher → your profile takes their appearance locally.",
    authors: [Devs["3Tb"]],

    async start() {
        FluxDispatcher.subscribe("MULTI_ACCOUNT_SWITCH_FAILURE", onSwitchFailure);
        FluxDispatcher.subscribe("MULTI_ACCOUNT_SWITCH_ATTEMPT", onSwitchAttempt);
        FluxDispatcher.subscribe("MULTI_ACCOUNT_REMOVE_ACCOUNT", onRemoveAccount);

        addContextMenuPatch("user-context", ctxPatch);
        addContextMenuPatch("user-profile-actions", ctxPatch);
        startRestoreButtonWatcher();

        waitFor(["getUsers", "getValidUsers", "getHasLoggedInAccounts"], async (mod: any) => {
            if (!isMultiAccountStore(mod)) return;

            _store = mod;

            const savedIds: string[] = (await DataStore.get(DS_KEY)) ?? [];
            for (const id of savedIds) {
                if (fakeAccounts.find(f => f.id === id)) continue;
                const user = UserStore.getUser(id);
                if (!user) continue;
                const profile = UserProfileStore.getUserProfile?.(id) ?? {};
                const bot = user.bot ?? false;
                fakeAccounts.push({
                    id: user.id,
                    username: user.username,
                    globalName: (user as any).globalName ?? user.username,
                    discriminator: user.discriminator ?? "0",
                    avatar: user.avatar ?? null,
                    bot,
                    _bio: profile.bio ?? "",
                    _banner: profile.banner ?? null,
                    _accentColor: profile.accentColor ?? null,
                    _publicFlags: (user as any).publicFlags ?? 0,
                    _flags: (user as any).flags ?? 0,
                    _premiumType: (user as any).premiumType ?? 0,
                });
            }

            patchStore();
            setTimeout(() => mod.emitChange?.(), 500);
        });
    },

    stop() {
        FluxDispatcher.unsubscribe("MULTI_ACCOUNT_SWITCH_FAILURE", onSwitchFailure);
        FluxDispatcher.unsubscribe("MULTI_ACCOUNT_SWITCH_ATTEMPT", onSwitchAttempt);
        FluxDispatcher.unsubscribe("MULTI_ACCOUNT_REMOVE_ACCOUNT", onRemoveAccount);
        removeContextMenuPatch("user-context", ctxPatch);
        removeContextMenuPatch("user-profile-actions", ctxPatch);
        stopRestoreButtonWatcher();
        if (activeFakeId) restoreRealAccount();
        fakeAccounts = [];
        unpatchStore();
        _store = null;
    },
});
