import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

let currentToken = "Loading...";

function getToken() {
    try {
        let token = null;

        try {
            (window as any).webpackChunkdiscord_app.push([
                [Symbol()],
                {},
                (o: any) => {
                    for (let e of Object.values(o.c)) {
                        try {
                            if (!(e as any).exports || (e as any).exports === window) continue;
                            
                            if ((e as any).exports?.getToken) {
                                token = (e as any).exports.getToken();
                            }
                            
                            for (let prop in (e as any).exports) {
                                if ((e as any).exports?.[prop]?.getToken && 
                                    "IntlMessagesProxy" !== (e as any).exports[prop][Symbol.toStringTag]) {
                                    token = (e as any).exports[prop].getToken();
                                }
                            }
                            
                            if (token) break;
                        } catch {}
                    }
                }
            ]);
            (window as any).webpackChunkdiscord_app.pop();
        } catch (e) {
            console.error("Webpack method failed:", e);
        }

        if (!token) {
            try {
                const localToken = window.localStorage.getItem("token");
                if (localToken) {
                    token = localToken.replace(/"/g, "");
                }
            } catch (e) {
                console.error("localStorage method failed:", e);
            }
        }

        if (!token) {
            try {
                const iframe = document.createElement("iframe");
                iframe.style.display = "none";
                document.body.appendChild(iframe);
                
                if (iframe.contentWindow) {
                    const iframeToken = iframe.contentWindow.localStorage.getItem("token");
                    if (iframeToken) {
                        token = iframeToken.replace(/"/g, "");
                    }
                }
                
                iframe.remove();
            } catch (e) {
                console.error("iframe method failed:", e);
            }
        }

        if (token) {
            currentToken = token;
        } else {
            currentToken = "Failed to get token";
        }

    } catch (error: any) {
        console.error("Error getting token:", error);
        currentToken = `Error: ${error.message}`;
    }
}

const settings = definePluginSettings({
    yourToken: {
        type: OptionType.COMPONENT,
        description: "Your Discord Token",
        component: () => {
            return (
                <div>
                    <div style={{ 
                        padding: "10px", 
                        background: "#2f3136", 
                        borderRadius: "5px",
                        marginTop: "10px",
                        wordBreak: "break-all",
                        userSelect: "text",
                        cursor: "text",
                        fontFamily: "monospace",
                        fontSize: "13px"
                    }}>
                        {currentToken}
                    </div>
                    <button 
                        onClick={() => {
                            getToken();
                            setTimeout(() => window.location.hash = window.location.hash, 100);
                        }}
                        style={{
                            marginTop: "10px",
                            padding: "8px 16px",
                            background: "#5865f2",
                            color: "#fff",
                            border: "none",
                            borderRadius: "5px",
                            cursor: "pointer"
                        }}
                    >
                        Refresh Token
                    </button>
                </div>
            );
        }
    }
});

export default definePlugin({
    name: "GetYourToken",
    description: "Get your Discord account token",
    authors: [Devs["3Tb"]],
    settings,

    start() {
        setTimeout(() => {
            getToken();
        }, 1000);
    },

    stop() {
        currentToken = "Plugin stopped";
    }
});