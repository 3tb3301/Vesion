import { React } from "@webpack/common";
import { PLUGIN_VERSION } from "../constants";

export const VersionDisplay = () => {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px",
            background: "var(--background-secondary)",
            borderRadius: "8px",
            marginBottom: "16px"
        }}>
            <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--header-primary)" }}>
                    Server Cloner
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Version: <span style={{ color: "#5865f2", fontWeight: 600 }}>v{PLUGIN_VERSION}</span>
                </div>
            </div>
        </div>
    );
};
