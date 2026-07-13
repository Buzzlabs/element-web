
/**
 * Types + mocked fetchers for the VODs drawer.
 * Mirrors the FluffyChat `lives_data.dart` / `VodsWidget` / `EventsTable` mocks.
 *
 * TODO: replace the mocks with the real backend calls
 * (BACKEND_GET_VODS_URL / BACKEND_GET_EVENTS_URL) once available.
 */

export interface LiveShow {
    id: string;
    title: string;
    category: string;
    date: string;
    startedAt: string;
    thumbnailUrl: string;
    avatarUrl: string;
    videoUrl: string;
    isLive: boolean;
}

export interface EventItem {
    summary: string;
    start: Date;
}

const MOCK_DELAY_MS = 300;
const MOCK_TOTAL_PAGES = 3;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Formats "Main Channel" titles into "Live dd/mm/yy", same rule as the Flutter code. */
function normalizeTitle(title: string, startedAtRaw: string | undefined): string {
    if (title !== "Main Channel" || !startedAtRaw) return title;
    const startedAt = new Date(startedAtRaw);
    if (Number.isNaN(startedAt.getTime())) return title;
    const dd = String(startedAt.getDate()).padStart(2, "0");
    const mm = String(startedAt.getMonth() + 1).padStart(2, "0");
    const yy = String(startedAt.getFullYear()).slice(2);
    return `Live ${dd}/${mm}/${yy}`;
}

/**
 * Mocked VOD list, paginated. Mirrors the mock in the Flutter `VodsWidget`.
 */
export async function fetchVods(page = 1): Promise<{ lives: LiveShow[]; lastPage: number }> {
    await delay(MOCK_DELAY_MS);

    const lives: LiveShow[] = Array.from({ length: 10 }, (_, index) => {
        const idNumber = (page - 1) * 10 + index + 1;
        const rawTitle = idNumber % 2 === 0 ? "Main Channel" : `Podcast #${idNumber}`;
        const startedAt = `2026-02-${String((idNumber % 28) + 1).padStart(2, "0")}T20:00:00`;
        const isLive = idNumber % 3 === 0;

        return {
            id: String(idNumber),
            title: normalizeTitle(rawTitle, startedAt),
            category: isLive ? "Ao vivo" : "Gravação",
            date: `há ${idNumber} dias`,
            startedAt,
            thumbnailUrl: "https://via.placeholder.com/300",
            avatarUrl: "",
            videoUrl: `https://test-stream-${idNumber}.m3u8`,
            isLive,
        };
    });

    return { lives, lastPage: MOCK_TOTAL_PAGES };
}

/**
 * Mocked upcoming events. Mirrors the mock in the Flutter `EventsTable`.
 */
export async function fetchEvents(): Promise<EventItem[]> {
    await delay(MOCK_DELAY_MS);

    const raw = [
        { summary: "Live Especial", dateTime: "2026-02-15T20:00:00" },
        { summary: "Podcast Semanal", dateTime: "2026-02-16T18:00:00" },
        { summary: "Evento Presencial", dateTime: "2026-02-20T19:30:00" },
    ];

    return raw.map((item) => ({
        summary: item.summary,
        start: new Date(item.dateTime),
    }));
}