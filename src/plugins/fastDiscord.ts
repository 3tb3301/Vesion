import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";

const MessageCache = findByPropsLazy("clearCache", "cache");

export default definePlugin({
    name: "FastDiscord",
    description: "Makes Discord lighter and faster",
    authors: [Devs["3Tb"]],

    start() {
        const style = document.createElement("style");
        style.id = "fast-discord-style";
        style.textContent = `
            *, *::before, *::after {
                animation-duration: 0s !important;
                animation-delay: 0s !important;
                transition-duration: 0s !important;
                transition-delay: 0s !important;
            }
            
            img[src*=".gif"], video {
                pointer-events: auto !important;
            }
            
            .theme-dark, .theme-light, * {
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                filter: none !important;
            }
            
            .cozy-3hKWhq .contents-2MsGLg {
                padding: 2px 0 !important;
            }
            
            video[class*="video"] {
                display: none !important;
            }
            
            [class*="decorations"], 
            [class*="profileEffect"] {
                display: none !important;
            }
            
            * {
                box-shadow: none !important;
                text-shadow: none !important;
            }
            
            [class*="activityImage"],
            [class*="applicationStreamingPreview"] {
                display: none !important;
            }
            
            [class*="autocomplete"] img {
                display: none !important;
            }
            
            [class*="stickerNode"] {
                opacity: 0.5 !important;
            }
        `;
        document.head.appendChild(style);

        this.observeImages();
        
        this.cacheInterval = setInterval(() => {
            try {
                if (MessageCache?.clearCache) {
                    MessageCache.clearCache();
                }
            } catch (e) {}
        }, 300000);
        
        this.disableTypingIndicators();
        this.optimizeReactRendering();
    },

    observeImages() {
        const observer = new MutationObserver(() => {
            document.querySelectorAll('img[src*="cdn.discordapp.com"], img[src*="media.discordapp.net"]').forEach((img: any) => {
                if (!img.dataset.lightweight) {
                    img.dataset.lightweight = "true";
                    img.loading = "lazy";
                    
                    if (img.src && !img.src.includes("size=") && !img.closest('[class*="banner"]')) {
                        img.src = img.src + (img.src.includes("?") ? "&" : "?") + "size=128";
                    }
                }
            });
            
            document.querySelectorAll('video').forEach((video: any) => {
                video.pause();
                video.preload = "none";
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.imageObserver = observer;
    },

    disableTypingIndicators() {
        const hideTyping = setInterval(() => {
            const typingElements = document.querySelectorAll('[class*="typing"]');
            typingElements.forEach(el => {
                (el as HTMLElement).style.display = "none";
            });
        }, 1000);
        
        this.typingInterval = hideTyping;
    },

    optimizeReactRendering() {
        document.documentElement.style.scrollBehavior = "auto";
        
        const containers = document.querySelectorAll('[class*="scroller"]');
        containers.forEach((container: any) => {
            container.style.willChange = "auto";
            container.style.transform = "translateZ(0)";
        });
    },

    stop() {
        const style = document.getElementById("fast-discord-style");
        if (style) style.remove();
        
        if (this.imageObserver) {
            this.imageObserver.disconnect();
        }
        
        if (this.cacheInterval) {
            clearInterval(this.cacheInterval);
        }
        
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
        }
    }
});