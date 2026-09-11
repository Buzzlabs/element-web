import { MatrixClientPeg } from "../../MatrixClientPeg";

export const ROOM_FEATURES: ReadonlyArray<{ key: string; label: string }> = [
    { key: "vods", label: "Aba de VODs" },
    { key: "events", label: "Calendário de eventos" },
    { key: "live", label: "Transmissão ao vivo" },
];

export type RoomFeaturesMap = Record<string, boolean>;


export interface StreamInfo {
    room_id: string;
    playback_url: string | null;
}

function baseUrl(): string {
    return MatrixClientPeg.safeGet().getHomeserverUrl();
}

function authHeaders(): Record<string, string> {
    const accessToken = MatrixClientPeg.safeGet().getAccessToken();
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
    };
}

async function readError(res: Response): Promise<string | undefined> {
    try {
        const body = await res.clone().json();
        const err = body?.error ?? body?.message;
        return typeof err === "string" && err.length ? err : undefined;
    } catch {
        return undefined;
    }
}

export async function getRoomFeatures(roomId: string): Promise<RoomFeaturesMap> {
    const res = await fetch(`${baseUrl()}/_synapse/room_features/list`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `room_features/list failed with status ${res.status}`);
    }
    const body = await res.json();
    return (body?.features ?? {}) as RoomFeaturesMap;
}

export async function setRoomFeature(roomId: string, feature: string, enabled: boolean): Promise<void> {
    const res = await fetch(`${baseUrl()}/_synapse/room_features/set`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId, feature, enabled }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `room_features/set failed with status ${res.status}`);
    }
}

export async function getRoomCalendar(roomId: string): Promise<{ calendarId: string | null }> {
    const res = await fetch(`${baseUrl()}/_synapse/schedule_service/get_calendar`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `schedule_service/get_calendar failed with status ${res.status}`);
    }
    const body = await res.json();
    return { calendarId: body?.calendarId ?? null };
}


export async function setRoomCalendar(roomId: string, calendarId: string): Promise<void> {
    const res = await fetch(`${baseUrl()}/_synapse/schedule_service/set_calendar`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId, calendar_id: calendarId }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `schedule_service/set_calendar failed with status ${res.status}`);
    }
}


export async function getStream(roomId: string): Promise<StreamInfo> {
    const res = await fetch(`${baseUrl()}/_synapse/room_streams_service/get_stream`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `get_stream failed with status ${res.status}`);
    }
    return res.json();
}

export async function setStream(roomId: string, playbackUrl: string): Promise<StreamInfo> {
    const res = await fetch(`${baseUrl()}/_synapse/room_streams_service/set_stream`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId, playback_url: playbackUrl }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `set_stream failed with status ${res.status}`);
    }
    return res.json();
}