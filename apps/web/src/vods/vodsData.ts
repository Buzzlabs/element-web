/**
 * Types + fetchers for the VODs drawer.
 * Mirrors the FluffyChat `lives_data.dart` / `VodsWidget` / `EventsTable`.
 *
 * VODs now come from the `vod_service` Synapse module
 * (/_synapse/vod_service/list), which reads the `streams` table and builds
 * Oracle Object Storage playback URLs.
 *
 * TODO: replace the events mock with the real backend call
 * (BACKEND_GET_EVENTS_URL) once available.
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

/** Shape returned by the `vod_service` Synapse module. */
interface VodServiceItem {
    id: number;
    streamId: string | null;
    channelId: number;
    title: string | null;
    categoryId: number | null;
    recordingPath: string;
    recordingDurationMs: number | null;
    startedAt: number | null;
    endedAt: number | null;
    masterPlaylistUrl: string;
    thumbnailBaseUrl: string;
    latestThumbnail: string;
    isLive: boolean;
    isVod: boolean;
}

interface VodServiceResponse {
    data: VodServiceItem[];
    meta: {
        total: number;
        page: number;
        perPage: number;
        lastPage: number;
    };
}

const MOCK_DELAY_MS = 300;

/** Homeserver base URL. Same origin as Synapse in dev (see `vod_service` module). */
const VOD_SERVICE_BASE_URL = "http://localhost:3000";
const VOD_SERVICE_LIST_URL = `${VOD_SERVICE_BASE_URL}/_synapse/vod_service/list`;

/** Which channel the drawer lists. Mocked while the backend doesn't provide it. */
const CHANNEL_ID = 4;

/** How many VODs each page request asks for. */
const PAGE_SIZE = 10;

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

/** Turns a past timestamp into "há N dias" / "há N horas", same rule as the Flutter code. */
function relativeDate(startedAtMs: number | null): string {
    if (!startedAtMs) return "";

    const diffMs = Date.now() - startedAtMs;
    if (diffMs < 0) return "";

    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return `há ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;

    const days = Math.floor(hours / 24);
    return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** Adapts one `vod_service` item into the `LiveShow` the UI expects. */
function toLiveShow(item: VodServiceItem): LiveShow {
    const startedAt = item.startedAt ? new Date(item.startedAt).toISOString() : "";
    const rawTitle = item.title ?? "Main Channel";

    return {
        id: String(item.id),
        title: normalizeTitle(rawTitle, startedAt),
        category: item.isLive ? "Ao vivo" : "Gravação",
        date: relativeDate(item.startedAt),
        startedAt,
        thumbnailUrl: item.latestThumbnail,
        avatarUrl: "",
        videoUrl: item.masterPlaylistUrl,
        isLive: item.isLive,
    };
}

/**
 * VOD list, paginated, from the `vod_service` Synapse module.
 */
export async function fetchVods(page = 1): Promise<{ lives: LiveShow[]; lastPage: number }> {
    const url = `${VOD_SERVICE_LIST_URL}?channel_id=${CHANNEL_ID}&page=${page}&limit=${PAGE_SIZE}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`vod_service respondeu ${response.status}`);
    }

    const json = (await response.json()) as VodServiceResponse;

    return {
        lives: json.data.map(toLiveShow),
        lastPage: json.meta.lastPage,
    };
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