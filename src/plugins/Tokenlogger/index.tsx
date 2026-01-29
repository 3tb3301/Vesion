import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

const settings = definePluginSettings({
    token: {
        type: OptionType.STRING,
        default: "",
        description: "Enter your Discord token and press Enter to login",
        placeholder: "Paste token here and press Enter...",
        onChange: (value: string) => {
            if (value && value.trim() !== "") {
                loginWithToken(value.trim());
            }
        }
    }
});

function loginWithToken(token: string) {
    try {
        if (!token || token.trim() === "") {
            showToast("Please enter a valid token", Toasts.Type.FAILURE);
            return;
        }

        // Save token to localStorage using multiple methods
        try {
            window.localStorage.setItem("token", `"${token}"`);
        } catch (e) {
            console.error("Failed to set localStorage directly:", e);
        }

        // Method 2: iframe injection
        try {
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            document.body.appendChild(iframe);
            
            if (iframe.contentWindow) {
                iframe.contentWindow.localStorage.setItem("token", `"${token}"`);
            }
            
            iframe.remove();
        } catch (e) {
            console.error("Failed iframe method:", e);
        }

        // Method 3: Multiple iframe attempts
        const injectToken = () => {
            try {
                const iframe = document.createElement("iframe");
                document.body.appendChild(iframe);
                
                if (iframe.contentWindow) {
                    iframe.contentWindow.localStorage.setItem("token", `"${token}"`);
                }
                
                iframe.remove();
            } catch (err) {
                console.error("Token injection error:", err);
            }
        };

        // Inject multiple times to ensure it sticks
        for (let i = 0; i < 5; i++) {
            setTimeout(injectToken, i * 100);
        }

        // Show success message
        showToast("Token saved! Reloading Discord...", Toasts.Type.SUCCESS);

        // Reload after a short delay
        setTimeout(() => {
            location.reload();
        }, 1500);

    } catch (error: any) {
        console.error("Login error:", error);
        showToast(`Error: ${error.message}`, Toasts.Type.FAILURE);
    }
}

export default definePlugin({
    name: "TokenLogin",
    description: "Switch Discord accounts using tokens - Enter token in settings and press Enter",
    authors: [Devs["3Tb"]],
    settings,

    start() {
        console.log("[TokenLogin] Plugin started");
        console.log("[TokenLogin] Enter your token in plugin settings and press Enter to login");
    },

    stop() {
        console.log("[TokenLogin] Plugin stopped");
    }
});
