import React, { useEffect, useState, type JSX } from "react";

import { fetchEvents, type EventItem } from "../../../vods/vodsData";

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(eventDate: Date): string {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (isSameDay(eventDate, today)) return "Hoje";
    if (isSameDay(eventDate, tomorrow)) return "Amanhã";
    return `${eventDate.getDate()}/${eventDate.getMonth() + 1}`;
}

function formatTime(eventDate: Date): string {
    return `${String(eventDate.getHours()).padStart(2, "0")}h`;
}

/**
 * Upcoming events table for the VODs drawer.
 * Mirrors the FluffyChat `EventsTable` widget (mocked data for now).
 */
export function EventsTable(): JSX.Element {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchEvents()
            .then((fetched) => {
                if (!cancelled) setEvents(fetched);
            })
            .catch((e) => {
                // eslint-disable-next-line no-console
                console.error("Erro ao buscar eventos (mock):", e);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) {
        return <div style={{ textAlign: "center", padding: "24px" }}>Carregando…</div>;
    }

    if (events.length === 0) {
        return <div style={{ textAlign: "center", padding: "24px" }}>Nenhum evento próximo.</div>;
    }

    return (
        <div
            style={{
                background: "var(--cpd-color-bg-subtle-secondary, #f4f6fa)",
                borderRadius: "20px",
                padding: "16px",
                overflowY: "auto",
                height: "100%",
            }}
        >
            {events.map((event) => {
                const isToday = isSameDay(event.start, new Date());
                const accent = isToday
                    ? "var(--cpd-color-text-action-accent, #0dbd8b)"
                    : "var(--cpd-color-text-secondary, #6f7882)";

                return (
                    <div
                        key={`${event.summary}-${event.start.toISOString()}`}
                        style={{ display: "flex", marginBottom: "12px", minHeight: "56px" }}
                    >
                        <div
                            style={{
                                width: "12px",
                                background: accent,
                                borderRadius: "25px 0 0 25px",
                                flexShrink: 0,
                            }}
                        />
                        <div
                            style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "10px 12px",
                                background: "color-mix(in srgb, currentColor 0%, transparent)",
                                borderRadius: "0 12px 12px 0",
                                border: `1px solid ${accent}`,
                                borderLeft: "none",
                            }}
                        >
                            <span
                                style={{
                                    color: accent,
                                    fontWeight: 700,
                                    fontSize: "13px",
                                    whiteSpace: "pre-line",
                                    flexShrink: 0,
                                }}
                            >
                                {formatDate(event.start)}
                                {"\n"}
                                {formatTime(event.start)}
                            </span>
                            <span
                                style={{
                                    fontSize: "16px",
                                    fontWeight: 500,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    color: "var(--cpd-color-text-primary, #1b1d22)",
                                }}
                            >
                                {event.summary}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}