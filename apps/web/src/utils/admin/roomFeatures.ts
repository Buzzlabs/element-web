import { MatrixClientPeg } from "../../MatrixClientPeg";

/**
 * Client for the `room_features` Synapse module.
 * Mirrors the style of roomBusiness.ts.
 *
 * Features toggle optional per-room tabs (VODs, events, ...). The tab only
 * shows when its feature is enabled for that room. Writing requires a global
 * Synapse admin (the module returns 403 otherwise).
 */

/** Feature keys the UI knows about, with a human label. Add new features here. */
export const ROOM_FEATURES: ReadonlyArray<{ key: string; label: string }> = [
    { key: "vods", label: "Aba de VODs" },
    { key: "events", label: "Calendário de eventos" },
];

export type RoomFeaturesMap = Record<string, boolean>;

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

/**
 * Returns every feature flag for a room as a map { feature: enabled }.
 * Missing features are absent from the map (treated as disabled).
 */
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

/**
 * Enables/disables a single feature for a room. Admin only.
 */
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