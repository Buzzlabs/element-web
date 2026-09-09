import React, { type JSX } from "react";

interface VodsDrawerBannerProps {
    /** Called when the user clicks the banner/button to open the drawer. */
    onOpen: () => void;
}

/**
 * Pinned-message-style banner shown at the top of the room body,
 * inviting the user to open the VODs drawer.
 * Mirrors the FluffyChat `PinnedMessageWidget`.
 */
export function VodsDrawerBanner({ onOpen }: VodsDrawerBannerProps): JSX.Element {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onOpen();
            }}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "10px 16px",
                cursor: "pointer",
                background: "#ffffff",
                color: "var(--cpd-color-text-primary, #1b1d22)",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                // borderRadius: "0 0 12px 12px",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                <span aria-hidden style={{ fontSize: "18px" }}>
                    📌
                </span>
                <span
                    style={{
                        fontSize: "15px",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    Assista às lives anteriores e veja a programação
                </span>
            </div>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                }}
                style={{
                    flexShrink: 0,
                    border: "none",
                    borderRadius: "8px",
                    padding: "6px 16px",
                    fontSize: "15px",
                    fontWeight: 500,
                    cursor: "pointer",
                    background: "#4b8b79",
                    color: "var(--cpd-color-text-on-solid-primary, #fff)",
                }}
            >
                Assistir 🎬
            </button>
        </div>
    );
}