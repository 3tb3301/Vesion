import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { ModalProps, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Devs } from "@utils/constants";
import { Guild } from "@vencord/discord-types";
import { Menu, React } from "@webpack/common";

import "./styles.css";

import { CloneModal } from "./components/CloneModal";
import { settings } from "./settings";
import { cloneServer } from "./core/clone";
import { state } from "./store";
import { cleanupContainer } from "./utils/notifications";

const guildContextMenuPatch: NavContextMenuPatchCallback = (children: any[], props: { guild?: Guild; }) => {
    if (!props?.guild) return;

    const group = findGroupChildrenByChildId("privacy", children);
    const menuItem = (
        <Menu.MenuItem
            id="clone-server-pro"
            label="Clone Server"
            action={() => {
                openModal((modalProps: ModalProps) => (
                    <CloneModal
                        props={modalProps}
                        guild={props.guild!}
                        onClone={(options) => cloneServer(props.guild!, options)}
                    />
                ));
            }}
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
    },

    stop() {
        cleanupContainer();
        if (state.abortController) {
            state.abortController.abort();
            state.abortController = null;
        }
        state.isCloning = false;
        state.mainProgressNotificationId = null;
        state.currentCloneGuildId = null;
        state.skipRolesCallback = null;
    },

    patches: [
        {
            find: '"GuildChannelStore"',
            replacement: [
                {
                    match: /isChannelGated\(.+?\)(?=&&)/,
                    replace: (m: string) => `${m}&&false`
                }
            ]
        }
    ],

    contextMenus: {
        "guild-context": guildContextMenuPatch,
        "guild-header-popout": guildContextMenuPatch
    }
});
