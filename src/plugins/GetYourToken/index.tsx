import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

let currentToken = "Loading...";

function getToken() {
    try {
        let token = null;

        try {
            const localToken = window.localStorage.getItem("token");
            if (localToken) {
                token = localToken.replace(/"/g, "");
            }
        } catch (e) {
            console.error("Failed to get token from localStorage:", e);
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
                console.error("Failed iframe method:", e);
            }
        }

        if (token) {
            currentToken = token;
        } else {
            currentToken = "Failed to get token";
        }

    } catch (error: any) {
        console.error("Error:", error);
        currentToken = `Error: ${error.message}`;
    }
}

const settings = definePluginSettings({
    yourToken: {
        type: OptionType.COMPONENT,
        description: "Your Discord Token - Select and copy it",
        component: () => {
            return (
                <div style={{ 
                    padding: "10px", 
                    background: "#2f3136", 
                    borderRadius: "5px",
                    marginTop: "10px",
                    wordBreak: "break-all",
                    userSelect: "text",
                    cursor: "text"
                }}>
                    {currentToken}
                </div>
            );
        }
    }
});

export default definePlugin({
    name: "GetYourToken",
    description: "Get your Discord account token from settings",
    authors: [Devs["3Tb"]],
    settings,

    start() {
        console.log("[GetYourToken] Plugin started");
        getToken();
    },

    stop() {
        console.log("[GetYourToken] Plugin stopped");
    }
});
