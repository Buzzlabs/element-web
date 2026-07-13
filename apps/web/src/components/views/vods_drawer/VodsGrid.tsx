import React, { useCallback, useEffect, useState, type JSX } from "react";

import { fetchVods, type LiveShow } from "../../../vods/vodsData";

interface VodsGridProps {
    /** Section title, e.g. "Destaques", "Música". Empty string hides the header. */
    sectionTag: string;
    /** Lowercase text filter applied to titles (client-side, same as Flutter). */
    filter?: string;
    /** How many cards are visible initially. */
    initialVisibleCount: number;
    /** How many more cards each "Mostrar mais" click reveals. */
    loadMoreCount: number;
    /** Called when a VOD card is clicked. Falls back to opening the URL if omitted. */
    onSelectVod?: (live: LiveShow) => void;
}

/**
 * Grid of VOD cards with a "Mostrar mais" affordance.
 * Mirrors the FluffyChat `VodsWidget` + `LiveCard` (mocked data for now).
 */
export function VodsGrid({
    sectionTag,
    filter = "",
    initialVisibleCount,
    loadMoreCount,
    onSelectVod,
}: VodsGridProps): JSX.Element {
    const [allLives, setAllLives] = useState<LiveShow[]>([]);
    const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);

    const loadPage = useCallback(async (pageToLoad: number, append: boolean): Promise<void> => {
        setLoading(true);
        try {
            const { lives, lastPage: fetchedLastPage } = await fetchVods(pageToLoad);
            setLastPage(fetchedLastPage);
            setAllLives((current) => (append ? [...current, ...lives] : lives));
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Erro ao buscar vods (mock):", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPage(1, false);
    }, [loadPage]);

    const filteredLives = allLives.filter((live) => live.title.toLowerCase().includes(filter.toLowerCase()));
    const visibleLives = filteredLives.slice(0, visibleCount);
    const hasMore = filteredLives.length > visibleCount || page < lastPage;

    const showMore = (): void => {
        const remaining = filteredLives.length - visibleCount;
        if (remaining >= loadMoreCount) {
            setVisibleCount((count) => count + loadMoreCount);
        } else if (page < lastPage) {
            const nextPage = page + 1;
            setPage(nextPage);
            loadPage(nextPage, true).then(() => {
                setVisibleCount((count) => count + loadMoreCount);
            });
        } else {
            setVisibleCount(filteredLives.length);
        }
    };

    const openVod = (live: LiveShow): void => {
        if (onSelectVod) {
            onSelectVod(live);
        } else {
            window.open(live.videoUrl, "_blank", "noopener");
        }
    };

    return (
        <div>
            {sectionTag && (
                <div
                    style={{
                        fontSize: "20px",
                        fontWeight: 300,
                        margin: "0 0 12px 8px",
                        color: "var(--cpd-color-text-secondary, #6f7882)",
                    }}
                >
                    {sectionTag}
                </div>
            )}

            {allLives.length === 0 && !loading && (
                <div style={{ textAlign: "center", padding: "16px" }}>Nenhum vod encontrado</div>
            )}

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: "16px",
                }}
            >
                {visibleLives.map((live) => (
                    <div
                        key={live.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openVod(live)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") openVod(live);
                        }}
                        style={{
                            borderRadius: "8px",
                            overflow: "hidden",
                            cursor: "pointer",
                            background: "var(--cpd-color-bg-subtle-secondary, #f4f6fa)",
                        }}
                    >
                        <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#000" }}>
                            <img
                                src={live.thumbnailUrl}
                                alt=""
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.visibility = "hidden";
                                }}
                            />
                            {live.isLive && (
                                <span
                                    style={{
                                        position: "absolute",
                                        top: "8px",
                                        right: "8px",
                                        background: "#e53935",
                                        color: "#fff",
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        padding: "2px 8px",
                                        borderRadius: "6px",
                                    }}
                                >
                                    AO VIVO
                                </span>
                            )}
                        </div>
                        <div style={{ padding: "10px" }}>
                            <div
                                style={{
                                    fontSize: "15px",
                                    fontWeight: 500,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    marginBottom: "8px",
                                    color: "var(--cpd-color-text-primary, #1b1d22)",
                                }}
                                title={live.title}
                            >
                                {live.title}
                            </div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                <span
                                    style={{
                                        fontSize: "11px",
                                        padding: "2px 6px",
                                        borderRadius: "8px",
                                        background: "var(--cpd-color-bg-subtle-primary, #e1e6ec)",
                                        color: "var(--cpd-color-text-secondary, #6f7882)",
                                    }}
                                >
                                    {live.date}
                                </span>
                                <span
                                    style={{
                                        fontSize: "11px",
                                        padding: "2px 6px",
                                        borderRadius: "8px",
                                        background: "var(--cpd-color-bg-subtle-primary, #e1e6ec)",
                                        color: "var(--cpd-color-text-secondary, #6f7882)",
                                    }}
                                >
                                    {live.category}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {loading && <div style={{ textAlign: "center", padding: "12px" }}>Carregando…</div>}

            {hasMore && !loading && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                    <div
                        style={{
                            flex: 1,
                            height: "1px",
                            background: "var(--cpd-color-border-interactive-secondary, #ccc)",
                        }}
                    />
                    <button
                        type="button"
                        onClick={showMore}
                        style={{
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: 500,
                            color: "var(--cpd-color-text-action-accent, #0dbd8b)",
                        }}
                    >
                        Mostrar mais &gt;
                    </button>
                    <div
                        style={{
                            flex: 1,
                            height: "1px",
                            background: "var(--cpd-color-border-interactive-secondary, #ccc)",
                        }}
                    />
                </div>
            )}
        </div>
    );
}