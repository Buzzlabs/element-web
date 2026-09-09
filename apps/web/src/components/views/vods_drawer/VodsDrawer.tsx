import React, { useEffect, useRef, useState, type JSX } from "react";

import { VodsGrid } from "./VodsGrid";
import { EventsTable } from "./EventsTable";
import { VodWatchView } from "./VodWatchView";
import { type LiveShow } from "../../../vods/vodsData";

/**
 * Height of the closed drawer "peek" strip. Exported so RoomView can add a
 * spacer of the same height below the composer, pushing it up above the peek.
 */
export const PEEK_HEIGHT = 32;

/** Below this CONTAINER width (not window width!) the drawer uses the compact, tabbed layout. */
const COMPACT_BREAKPOINT = 900;
const MAX_DESKTOP_HEIGHT = 600;
/** Pointer movements below this many px count as a click, not a drag. */
const DRAG_THRESHOLD_PX = 5;

interface VodsDrawerProps {
    /** Room whose VODs are shown. */
    roomId: string;
    showVods: boolean;
    showEvents: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function VodsDrawer({ roomId, showVods, showEvents, open, onOpenChange }: VodsDrawerProps): JSX.Element {
    const rootRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });
    const [selectedTab, setSelectedTab] = useState<"rolou" | "eventos">("rolou");
    const [watchingVod, setWatchingVod] = useState<LiveShow | null>(null);

    // Drag state: while dragging we track a temporary offset in px (0 = fully open).
    const [dragOffset, setDragOffset] = useState<number | null>(null);
    const dragStartY = useRef<number | null>(null);
    const dragStartOffset = useRef(0);
    const dragMoved = useRef(false);

    // Measure the drawer's parent (the room body), not the window.
    useEffect(() => {
        const parent = rootRef.current?.parentElement;
        if (!parent) return;

        const update = (): void => {
            setContainerSize({ width: parent.clientWidth, height: parent.clientHeight });
        };
        update();

        const observer = new ResizeObserver(update);
        observer.observe(parent);
        return () => observer.disconnect();
    }, []);

    const isCompact = containerSize.width < COMPACT_BREAKPOINT;
    const height = isCompact
        ? Math.round(containerSize.height * 0.75)
        : Math.min(MAX_DESKTOP_HEIGHT, Math.round(containerSize.height * 0.85));
    const closedOffset = Math.max(height - PEEK_HEIGHT, 0);

    // The current translateY: drag offset wins while dragging, otherwise open/closed position.
    const translateY = dragOffset ?? (open ? 0 : closedOffset);

    const onPointerDown = (e: React.PointerEvent): void => {
        dragStartY.current = e.clientY;
        dragStartOffset.current = translateY;
        dragMoved.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent): void => {
        if (dragStartY.current === null) return;
        const delta = e.clientY - dragStartY.current;
        if (Math.abs(delta) > DRAG_THRESHOLD_PX) dragMoved.current = true;
        const next = Math.min(Math.max(dragStartOffset.current + delta, 0), closedOffset);
        setDragOffset(next);
    };

    const onPointerUp = (): void => {
        if (dragStartY.current === null) return;
        dragStartY.current = null;

        const finalOffset = dragOffset ?? (open ? 0 : closedOffset);
        setDragOffset(null);

        if (dragMoved.current) {
            // Real drag: snap open if above the halfway point, closed otherwise.
            onOpenChange(finalOffset < closedOffset / 2);
        } else {
            // Tap/click on the handle: toggle.
            onOpenChange(!open);
        }
        dragMoved.current = false;
    };

    const handleBar = (
        <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
                display: "flex",
                justifyContent: "center",
                padding: "12px 0",
                cursor: "grab",
                touchAction: "none",
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    width: "40px",
                    height: "5px",
                    borderRadius: "10px",
                    background: "var(--cpd-color-icon-secondary, #8d97a5)",
                }}
            />
        </div>
    );

    const sectionTitleStyle: React.CSSProperties = {
        fontSize: "clamp(18px, 2.2vw, 25px)",
        fontWeight: 700,
        color: "var(--cpd-color-text-primary, #1b1d22)",
    };
    
    const wideBody = (
        <div
            style={{
                display: "flex",
                gap: "clamp(12px, 2vw, 24px)",
                flex: 1,
                minHeight: 0,
                padding: "0 16px 16px",
            }}
        >
            {showVods && (
                <div style={{ flex: "1 1 62%", display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ ...sectionTitleStyle, margin: "0 0 16px 8px" }}>ROLOU POR AQUI</div>
                    <div style={{ overflowY: "auto", flex: 1, minHeight: 0, paddingRight: "4px" }}>
                        <VodsGrid
                            roomId={roomId}
                            sectionTag="Destaques"
                            initialVisibleCount={6}
                            loadMoreCount={3}
                            onSelectVod={setWatchingVod}
                        />
                        <div style={{ height: "16px" }} />
                        <VodsGrid
                            roomId={roomId}
                            sectionTag="Podcast"
                            filter="Podcast"
                            initialVisibleCount={3}
                            loadMoreCount={3}
                            onSelectVod={setWatchingVod}
                        />
                    </div>
                </div>
            )}
            {showEvents && (
                <div
                    style={{
                        flex: "1 1 38%",
                        display: "flex",
                        flexDirection: "column",
                        minWidth: "240px",
                        maxWidth: "420px",
                    }}
                >
                    <div
                        style={{
                            ...sectionTitleStyle,
                            marginBottom: "16px",
                            textAlign: "center",
                            color: "var(--cpd-color-text-action-accent, #0dbd8b)",
                        }}
                    >
                        PRÓXIMOS EVENTOS
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <EventsTable roomId={roomId} />
                    </div>
                </div>
            )}
        </div>
    );

    const tabButton = (label: string, id: "rolou" | "eventos"): JSX.Element => {
        const isSelected = selectedTab === id;
        return (
            <button
                type="button"
                onClick={() => setSelectedTab(id)}
                style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: "0 clamp(10px, 3vw, 24px) 6px",
                    fontSize: "clamp(14px, 1.8vw, 18px)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    color: isSelected
                        ? "var(--cpd-color-text-action-accent, #0dbd8b)"
                        : "var(--cpd-color-text-secondary, #6f7882)",
                    borderBottom: isSelected
                        ? "3px solid var(--cpd-color-text-action-accent, #0dbd8b)"
                        : "3px solid transparent",
                }}
            >
                {label}
            </button>
        );
    };
 
    // garante que selectedTab aponta pra uma aba habilitada
    const effectiveTab = (() => {
        if (selectedTab === "rolou" && showVods) return "rolou";
        if (selectedTab === "eventos" && showEvents) return "eventos";
        // aba atual indisponível: cai na primeira habilitada
        if (showVods) return "rolou";
        if (showEvents) return "eventos";
        return selectedTab; // nenhuma habilitada (não deveria abrir o drawer)
    })();

    const compactBody = (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "0 12px 12px" }}>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "12px",
                    flexShrink: 0,
                }}
            >
                {handleBar}
                <div style={{ display: "flex" }}>
                    {showVods && tabButton("Rolou por aqui", "rolou")}
                    {showEvents && tabButton("Eventos", "eventos")}
                </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                {showVods && effectiveTab === "rolou" && (
                    <>
                        <VodsGrid
                            roomId={roomId}
                            sectionTag="Destaques"
                            initialVisibleCount={4}
                            loadMoreCount={2}
                            onSelectVod={setWatchingVod}
                        />
                        <div style={{ height: "16px" }} />
                        <VodsGrid
                            roomId={roomId}
                            sectionTag="Podcast"
                            filter="Podcast"
                            initialVisibleCount={4}
                            loadMoreCount={2}
                            onSelectVod={setWatchingVod}
                        />
                    </>
                )}
                {showEvents && effectiveTab === "eventos" && <EventsTable roomId={roomId}/>}
            </div>
        </div>
    );

    return (
        <>
            <div
                ref={rootRef}
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: `${height}px`,
                    transform: `translateY(${translateY}px)`,
                    transition: dragOffset === null ? "transform 200ms ease-out" : "none",
                    background: "var(--cpd-color-bg-canvas-default, #fff)",
                    borderRadius: isCompact ? "20px 20px 0 0" : "30px 30px 0 0",
                    boxShadow: "0 -4px 12px rgba(0, 0, 0, 0.25)",
                    display: "flex",
                    flexDirection: "column",
                    zIndex: 100,
                    overflow: "hidden",
                }}
            >
                {!isCompact && handleBar}
                {isCompact ? compactBody : wideBody}
            </div>

            {watchingVod && (
                <VodWatchView
                    roomId={roomId}
                    live={watchingVod}
                    onClose={() => setWatchingVod(null)}
                    onSelectVod={setWatchingVod}
                />
            )}
        </>
    );
}