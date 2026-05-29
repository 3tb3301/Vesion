/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, showToast, Toasts } from "@webpack/common";

const logger = new Logger("EnableStereo", "#ff6b6b");



const MediaEngineStore = findByPropsLazy("getEchoCancellation", "getNoiseSuppression");



const settings = definePluginSettings({
    stereoChannelOption: {
        type: OptionType.SELECT,
        description: "Stereo Channel Option — rejoin voice after changing",
        restartNeeded: false,
        options: [
            { label: "1.0 Mono",                          value: "1.0" },
            { label: "2.0 Stereo (Recommended)",          value: "2.0", default: true },
            { label: "7.1 Surround Sound",                value: "7.1" },
        ],
    },
    bitrateOption: {
        type: OptionType.SELECT,
        description: "Voice Bitrate — higher = better quality",
        restartNeeded: false,
        options: [
            { label: "64 kbps",              value: 64000 },
            { label: "96 kbps",              value: 96000 },
            { label: "128 kbps",             value: 128000 },
            { label: "256 kbps",             value: 256000 },
            { label: "384 kbps (Default)",   value: 384000, default: true },
            { label: "512 kbps (Max)",       value: 512000 },
        ],
    },
    disableFEC: {
        type: OptionType.BOOLEAN,
        description: "Disable Forward Error Correction (lower latency, better clarity)",
        default: true,
    },
    enableSpotifyPauseBlocker: {
        type: OptionType.BOOLEAN,
        description: "Spotify Pause Blocker — stops Discord from pausing Spotify",
        default: false,
    },
    enableToasts: {
        type: OptionType.BOOLEAN,
        description: "Show notifications when joining voice channels",
        default: true,
    },
});



let _realFetch: typeof fetch | null = null;
let _realXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
let _hidePopupInterval: ReturnType<typeof setInterval> | null = null;

function enableSpotifyBlocker() {
    
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
    showToast("EnableStereo: Spotify Pause Blocker ON", Toasts.Type.SUCCESS);
}

function disableSpotifyBlocker() {
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



function applyAudioPatch(obj: Record<string, any>) {
    const channel  = settings.store.stereoChannelOption ?? "2.0";
    const bitrate  = Number(settings.store.bitrateOption ?? 384000);
    const disableFEC = settings.store.disableFEC ?? true;

    if (obj.audioEncoder) {
        obj.audioEncoder.params   = { stereo: channel };
        obj.audioEncoder.channels = parseFloat(channel);
    }

    
    obj.encodingVoiceBitRate = bitrate;

    if (disableFEC) {
        obj.fec = false;
    }

    return obj;
}



export default definePlugin({
    name: "EnableStereo",
    description: "high-quality stereo/surround sound",
    authors: [Devs["3Tb"]],
    tags: ["Voice", "Utility"],
    settings,

    
    patches: [
        {
            
            find: "setTransportOptions",
            replacement: {
                match: /(?<=setTransportOptions\()(\i)\)/,
                replace: "$1=$self.patchTransportOptions($1)",
            },
            noWarn: true,
        },
        {
            
            find: "updateVideoQuality",
            replacement: {
                match: /this\.conn\.setTransportOptions\((\i)\)/,
                replace: "this.conn.setTransportOptions($self.patchTransportOptions($1))",
            },
            noWarn: true,
        },
    ],

    
    patchTransportOptions(obj: Record<string, any>) {
        try {
            applyAudioPatch(obj);
        } catch (e) {
            logger.error("Failed to patch transport options:", e);
        }
        return obj;
    },

    start() {
        
        try {
            if (
                MediaEngineStore.getEchoCancellation?.() ||
                MediaEngineStore.getNoiseSuppression?.() ||
                MediaEngineStore.getNoiseCancellation?.()
            ) {
                if (settings.store.enableToasts) {
                    showToast(
                        "EnableStereo: Disable Echo Cancellation & Noise Suppression for best quality!",
                        Toasts.Type.FAILURE
                    );
                }
            }
        } catch (e) {
            logger.warn("Could not check voice settings:", e);
        }

        
        if (settings.store.enableSpotifyPauseBlocker) {
            enableSpotifyBlocker();
        }

        
        this._voiceJoinHandler = ({ channelId }: { channelId: string | null }) => {
            if (!channelId || !settings.store.enableToasts) return;
            const ch = settings.store.stereoChannelOption ?? "2.0";
            const br = Number(settings.store.bitrateOption ?? 384000) / 1000;
            showToast(
                `EnableStereo: ${ch}ch · ${br}kbps · FEC ${settings.store.disableFEC ? "OFF" : "ON"}`,
                Toasts.Type.MESSAGE
            );
        };

        FluxDispatcher.subscribe("VOICE_CHANNEL_SELECT", this._voiceJoinHandler);

        logger.info("EnableStereo started ✓");
    },

    stop() {
        FluxDispatcher.unsubscribe("VOICE_CHANNEL_SELECT", this._voiceJoinHandler);
        disableSpotifyBlocker();
        logger.info("EnableStereo stopped");
    },
});
