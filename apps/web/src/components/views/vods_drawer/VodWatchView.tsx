import React, { useEffect, useRef, useState, type JSX } from "react";
import Hls from "hls.js"

import { fetchVods, type LiveShow } from "../../../vods/vodsData";

/** Mocked channel identity while the backend doesn't provide it. */
const CHANNEL_NAME = "Canal Principal";
const CHANNEL_DESCRIPTION =
    "Descrição do vídeo (mock). Aqui vai a descrição vinda do backend quando estiver disponível — " +
    "por enquanto é um texto fixo, igual ao restante dos dados mockados.";

interface VodWatchViewProps {
    /** Room the VOD belongs to (for fetching related VODs). */
    roomId: string;
    live: LiveShow;
    onClose: () => void;
    onSelectVod: (live: LiveShow) => void;
}

export function VodWatchView({ roomId, live, onClose, onSelectVod }: VodWatchViewProps): JSX.Element {
    const [related, setRelated] = useState<LiveShow[]>([]);
    const videoRef = useRef<HTMLVideoElement>(null);

    const hlsRef = useRef<Hls | null>(null);
    

    useEffect(() => {
        const video = videoRef.current;

        if (!video || !live.videoUrl) return;

        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        if (Hls.isSupported()) {
            const hls = new Hls();
            hlsRef.current = hls;
            hls.loadSource(live.videoUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_event, data) => {
                console.error("hls.js:", data.fatal ? "FATAL" : "warn", data.type, data.details);
            });

            return () => {
                hls.destroy();
                if (hlsRef.current === hls) hlsRef.current = null;
            };
        }

        // Fallback nativo (Safari/iOS, onde hls.js não é suportado).
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = live.videoUrl;
            return () => {
                video.removeAttribute("src");
                video.load();
            };
        }

        console.error("HLS não é suportado neste navegador.");
    }, [live.id, live.videoUrl]);

    useEffect(() => {
        let cancelled = false;
        fetchVods(roomId, 1)
            .then(({ lives }) => {
                if (!cancelled) setRelated(lives.filter((item) => item.id !== live.id));
            })
            .catch((e) => {
                console.error("Erro ao buscar vídeos relacionados:", e);
            });
        return () => {
            cancelled = true;
        };
    }, [live.id, roomId]);

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 6000,
                background: "var(--cpd-color-bg-canvas-default, #fff)",
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* Top bar */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--cpd-color-border-interactive-secondary, #e1e6ec)",
                    flexShrink: 0,
                }}
            >
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--cpd-color-text-primary, #1b1d22)",
                    }}
                >
                    ← Voltar
                </button>
            </div>

            {/* Body */}
            <div
                style={{
                    display: "flex",
                    gap: "24px",
                    flex: 1,
                    minHeight: 0,
                    padding: "16px 24px",
                    overflowY: "auto",
                    flexWrap: "wrap",
                }}
            >
                {/* Player + info */}
                <div style={{ flex: "2 1 480px", minWidth: "320px" }}>
                    <div
                        style={{
                            aspectRatio: "16 / 9",
                            background: "#000",
                            borderRadius: "12px",
                            overflow: "hidden",
                        }}
                    >
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <video
                            ref={videoRef}
                            controls
                            autoPlay
                            poster={live.thumbnailUrl}
                            style={{ width: "100%", height: "100%", display: "block" }}
                        />
                    </div>

                    <h2
                        style={{
                            margin: "16px 0 8px",
                            fontSize: "20px",
                            fontWeight: 700,
                            color: "var(--cpd-color-text-primary, #1b1d22)",
                        }}
                    >
                        {live.title}
                    </h2>

                    {/* Channel row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "8px 0 16px" }}>
                        {live.avatarUrl ? (
                            <img
                                src={live.avatarUrl}
                                alt=""
                                style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }}
                            />
                        ) : (
                            <div
                                aria-hidden
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "50%",
                                    background: "var(--cpd-color-bg-action-primary-rest, #0dbd8b)",
                                    color: "var(--cpd-color-text-on-solid-primary, #fff)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 700,
                                }}
                            >
                                {CHANNEL_NAME.charAt(0)}
                            </div>
                        )}
                        <div>
                            <div style={{ fontWeight: 600, color: "var(--cpd-color-text-primary, #1b1d22)" }}>
                                {CHANNEL_NAME}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--cpd-color-text-secondary, #6f7882)" }}>
                                {live.date} · {live.category}
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div
                        style={{
                            background: "var(--cpd-color-bg-subtle-secondary, #f4f6fa)",
                            borderRadius: "12px",
                            padding: "12px 16px",
                            fontSize: "14px",
                            lineHeight: 1.5,
                            color: "var(--cpd-color-text-primary, #1b1d22)",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {CHANNEL_DESCRIPTION}
                    </div>
                </div>

                {/* Related videos */}
                <div style={{ flex: "1 1 300px", minWidth: "280px" }}>
                    <div
                        style={{
                            fontSize: "16px",
                            fontWeight: 700,
                            marginBottom: "12px",
                            color: "var(--cpd-color-text-primary, #1b1d22)",
                        }}
                    >
                        Próximos vídeos
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {related.map((item) => (
                            <div
                                key={item.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelectVod(item)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") onSelectVod(item);
                                }}
                                style={{ display: "flex", gap: "10px", cursor: "pointer" }}
                            >
                                <div
                                    style={{
                                        position: "relative",
                                        width: "160px",
                                        aspectRatio: "16 / 9",
                                        background: "#000",
                                        borderRadius: "8px",
                                        overflow: "hidden",
                                        flexShrink: 0,
                                    }}
                                >
                                    <img
                                        src={item.thumbnailUrl}
                                        alt=""
                                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.visibility = "hidden";
                                        }}
                                    />
                                    {item.isLive && (
                                        <span
                                            style={{
                                                position: "absolute",
                                                top: "4px",
                                                right: "4px",
                                                background: "#e53935",
                                                color: "#fff",
                                                fontSize: "10px",
                                                fontWeight: 700,
                                                padding: "1px 6px",
                                                borderRadius: "5px",
                                            }}
                                        >
                                            AO VIVO
                                        </span>
                                    )}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: "14px",
                                            fontWeight: 600,
                                            color: "var(--cpd-color-text-primary, #1b1d22)",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            display: "-webkit-box",
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical",
                                        }}
                                        title={item.title}
                                    >
                                        {item.title}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "12px",
                                            color: "var(--cpd-color-text-secondary, #6f7882)",
                                            marginTop: "4px",
                                        }}
                                    >
                                        {CHANNEL_NAME}
                                        <br />
                                        {item.date}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {related.length === 0 && (
                            <div style={{ color: "var(--cpd-color-text-secondary, #6f7882)" }}>Carregando…</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}