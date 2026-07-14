import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

const logger = new Logger("SpotifyPauseBlocker", "#1DB954");

const settings = definePluginSettings({
    showToasts: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when the blocker starts",
        default: true,
    },
});

let _realFetch: typeof fetch | null = null;
let _realXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
let _hidePopupInterval: ReturnType<typeof setInterval> | null = null;

function enableBlocker() {
    if (!_realFetch) {
        _realFetch = window.fetch;
        window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            if (url === "https://api.spotify.com/v1/me/player/pause") {
                logger.info("Blocked Spotify pause via fetch");
                return Promise.resolve(new Response(null, { status: 204 }));
            }
            return _realFetch!.apply(this, [input, init]);
        };
    }

    if (!_realXHROpen) {
        _realXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async = true, user?: string | null, password?: string | null) {
            const urlStr = url.toString();
            const patched = urlStr === "https://api.spotify.com/v1/me/player/pause"
                ? "https://api.spotify.com/v1/me/player/play"
                : urlStr;
            return _realXHROpen!.call(this, method, patched, async, user, password);
        };
    }

    _hidePopupInterval = setInterval(() => {
        const popup = document.querySelector<HTMLElement>(".popup-container.popup-show");
        if (popup) popup.style.display = "none";
    }, 500);

    logger.info("Spotify Pause Blocker enabled");
    if (settings.store.showToasts) {
        showToast("SpotifyPauseBlocker: enabled", Toasts.Type.SUCCESS);
    }
}

function disableBlocker() {
    if (_realFetch) {
        window.fetch = _realFetch;
        _realFetch = null;
    }
    if (_realXHROpen) {
        XMLHttpRequest.prototype.open = _realXHROpen;
        _realXHROpen = null;
    }
    if (_hidePopupInterval) {
        clearInterval(_hidePopupInterval);
        _hidePopupInterval = null;
    }
    logger.info("Spotify Pause Blocker disabled");
}

export default definePlugin({
    name: "SpotifyPauseBlocker",
    description: "Stops Discord from pausing Spotify",
    authors: [Devs["3Tb"]],
    tags: ["Utility"],
    settings,

    start() {
        enableBlocker();
    },

    stop() {
        disableBlocker();
    },
});
