/**
 * Types + fetchers for the VODs drawer.
 * Mirrors the FluffyChat `lives_data.dart` / `VodsWidget` / `EventsTable`.
 *
 * VODs now come from the `vod_service` Synapse module
 * (/_synapse/vod_service/list), which reads the `streams` table and builds
 * Oracle Object Storage playback URLs. VODs belong to a room, so every fetch
 * is scoped by roomId.
 *
 * TODO: replace the events mock with the real backend call
 * (BACKEND_GET_EVENTS_URL) once available.
 */
import { MatrixClientPeg } from "../MatrixClientPeg";

/** Homeserver base URL, resolved from the logged-in client (same as bundleApi/room_service). */
function getBaseUrl(): string {
    const client = MatrixClientPeg.get();
    if (!client) throw new Error("Matrix client não disponível");
    return client.getHomeserverUrl();
}

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
    roomId: string;
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
 * VOD list for a room, paginated, from the `vod_service` Synapse module.
 */
export async function fetchVods(
    roomId: string,
    page = 1,
): Promise<{ lives: LiveShow[]; lastPage: number }> {
    if (!roomId) {
        throw new Error("fetchVods: roomId é obrigatório");
    }

    const url =
        `${getBaseUrl()}/_synapse/vod_service/list` +
        `?room_id=${encodeURIComponent(roomId)}&page=${page}&limit=${PAGE_SIZE}`;

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

export async function fetchEvents(roomId: string): Promise<EventItem[]> {
    const res = await fetch(`${getBaseUrl()}/_synapse/schedule_service/list_events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, limit: 6 }),
    });
    if (!res.ok) throw new Error(`schedule_service respondeu ${res.status}`);
    const json = await res.json();
    return json.items.map((e) => ({
        summary: e.summary ?? "Evento",
        start: new Date(e.start.dateTime ?? e.start.date),
    }));
}