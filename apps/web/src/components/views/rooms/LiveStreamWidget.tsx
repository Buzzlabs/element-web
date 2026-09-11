import React, { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { type Room, RoomStateEvent } from "matrix-js-sdk/src/matrix";

import AccessibleButton from "../elements/AccessibleButton";
import Modal from "../../../Modal";
import QuestionDialog from "../dialogs/QuestionDialog";
import ErrorDialog from "../dialogs/ErrorDialog";
import { getLiveWidget, stopLive } from "../../../utils/live/liveWidget";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";

interface IProps {
    room: Room;
    canManage: boolean;
}

const ASPECT_RATIO = 16 / 9;
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 240;
const MAX_WIDTH_RATIO = 0.65; // não passa de 65% da largura da tela
const MARGIN = 16;

function useLiveWidget(room: Room): { title: string; url: string } | null {
    const cli = useMatrixClientContext();
    const [widget, setWidget] = useState<{ title: string; url: string } | null>(() =>
        getLiveWidget(cli, room.roomId),
    );

    useEffect(() => {
        const refresh = (): void => setWidget(getLiveWidget(cli, room.roomId));
        refresh();
        cli.on(RoomStateEvent.Events, refresh);
        return () => {
            cli.off(RoomStateEvent.Events, refresh);
        };
    }, [cli, room.roomId]);

    return widget;
}

const LiveStreamWidget: React.FC<IProps> = ({ room, canManage }) => {
    const cli = useMatrixClientContext();
    const live = useLiveWidget(room);

    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [busy, setBusy] = useState(false);
    const [position, setPosition] = useState({ x: MARGIN, y: MARGIN });
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const height = width / ASPECT_RATIO;

    // --------- arrastar (pelo cabeçalho do player) ---------
    const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

    const onDragStart = (e: React.PointerEvent): void => {
        dragState.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: position.x,
            origY: position.y,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onDragMove = (e: React.PointerEvent): void => {
        if (!dragState.current) return;
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;

        const maxX = window.innerWidth - width - MARGIN;
        const maxY = window.innerHeight - height - MARGIN;

        setPosition({
            x: Math.min(Math.max(dragState.current.origX + dx, MARGIN), Math.max(maxX, MARGIN)),
            y: Math.min(Math.max(dragState.current.origY + dy, MARGIN), Math.max(maxY, MARGIN)),
        });
    };

    const onDragEnd = (): void => {
        dragState.current = null;
    };

    // --------- redimensionar (puxando o canto inferior direito) ---------
    const resizeState = useRef<{ startX: number; origWidth: number } | null>(null);

    const onResizeStart = (e: React.PointerEvent): void => {
        e.stopPropagation();
        resizeState.current = { startX: e.clientX, origWidth: width };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onResizeMove = (e: React.PointerEvent): void => {
        if (!resizeState.current) return;
        const dx = e.clientX - resizeState.current.startX;
        const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;
        setWidth(Math.min(Math.max(resizeState.current.origWidth + dx, MIN_WIDTH), maxWidth));
    };

    const onResizeEnd = (): void => {
        resizeState.current = null;
    };

    // --------- player HLS ---------
    useEffect(() => {
        if (!live || !videoRef.current) return;
        const video = videoRef.current;

        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(live.url);
            hls.attachMedia(video);
            hlsRef.current = hls;
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = live.url;
        }

        return () => {
            hlsRef.current?.destroy();
            hlsRef.current = null;
        };
    }, [live?.url]);

    const onStop = useCallback((): void => {
        Modal.createDialog(QuestionDialog, {
            title: "Encerrar transmissão?",
            description: "Tem certeza que deseja encerrar a transmissão ao vivo?",
            button: "Encerrar",
        }).finished.then(async ([confirmed]) => {
            if (!confirmed) return;
            setBusy(true);
            try {
                await stopLive(cli, room.roomId);
            } catch (e) {
                Modal.createDialog(ErrorDialog, {
                    title: "Erro",
                    description: e instanceof Error ? e.message : "Não foi possível encerrar a transmissão.",
                });
            } finally {
                setBusy(false);
            }
        });
    }, [cli, room.roomId]);

    if (!live) return null;

    return (
        <div
            ref={containerRef}
            style={{
                position: "fixed",
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${width}px`,
                height: `${height}px`,
                background: "#000",
                borderRadius: "8px",
                overflow: "hidden",
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                zIndex: 4000,
                userSelect: "none",
            }}
        >
            <video ref={videoRef} autoPlay muted controls style={{ width: "100%", height: "100%", display: "block" }} />

            {/* cabeçalho arrastável, sobre o vídeo */}
            <div
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: "6px 8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0))",
                    cursor: "move",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "red" }} />
                    <span style={{ color: "#fff", fontSize: "12px", fontWeight: 600 }}>{live.title}</span>
                </div>

                {canManage && (
                    <AccessibleButton
                        kind="danger"
                        disabled={busy}
                        onClick={onStop}
                        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
                    >
                        {busy ? "…" : "Encerrar"}
                    </AccessibleButton>
                )}
            </div>

            {/* alça de redimensionar, canto inferior direito */}
            <div
                onPointerDown={onResizeStart}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeEnd}
                style={{
                    position: "absolute",
                    right: 0,
                    bottom: 0,
                    width: "18px",
                    height: "18px",
                    cursor: "nwse-resize",
                    background:
                        "linear-gradient(135deg, transparent 0 50%, rgba(255,255,255,0.5) 50% 60%, transparent 60% 100%)",
                }}
            />
        </div>
    );
};

export default LiveStreamWidget;