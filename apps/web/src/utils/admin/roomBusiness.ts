import { MatrixClientPeg } from "../../MatrixClientPeg";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

export interface SpaceChildRoom {
    roomId: string;
    name?: string;
    topic?: string;
    numJoinedMembers?: number;
    roomType?: string;
}

export interface RoomVisibilityInfo {
    room_id: string;
    visible: boolean;
    price: number; 
    access_type: string; // "public" | "private"
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

export async function getRoomVisibility(roomId: string): Promise<RoomVisibilityInfo> {
    const res = await fetch(`${baseUrl()}/_synapse/room_service/getvisibility`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `getvisibility failed with status ${res.status}`);
    }
    return res.json();
}

export async function changeVisibility(roomId: string, visible: boolean, priceCents: number): Promise<void> {
    const res = await fetch(`${baseUrl()}/_synapse/room_service/changevisibility`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId, visible, price: priceCents }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `changevisibility failed with status ${res.status}`);
    }
}

export async function changePrice(roomId: string, priceCents: number): Promise<void> {
    const res = await fetch(`${baseUrl()}/_synapse/room_service/changeprice`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId, price: priceCents }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `changeprice failed with status ${res.status}`);
    }
}

export async function changeAccessType(roomId: string, accessType: "public" | "private"): Promise<number | null> {
    const res = await fetch(`${baseUrl()}/_synapse/room_service/changeaccesstype`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ room_id: roomId, access_type: accessType }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `changeaccesstype failed with status ${res.status}`);
    }
    const body = await res.json();
    return typeof body?.price === "number" ? body.price : null;
}

export async function inviteSpace(spaceId: string): Promise<string[]> {
    const res = await fetch(`${baseUrl()}/_synapse/room_service/invite_space`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ space_id: spaceId }),
    });
    if (!res.ok) {
        throw new Error((await readError(res)) ?? `invite_space failed with status ${res.status}`);
    }
    return res.json();
}

export async function getSpaceChildRooms(
    client: MatrixClient,
    spaceId: string,
): Promise<SpaceChildRoom[]> {
    try {
        // getRoomHierarchy(roomId, limit, maxDepth). maxDepth=1 = só os filhos
        // diretos (não desce em sub-spaces). Ajuste se quiser aninhados.
        const res = await client.getRoomHierarchy(spaceId, 50, 1);
 
        const rooms = res.rooms ?? [];
        return rooms
            // remove o próprio space da lista (ele vem como primeiro item)
            .filter((r) => r.room_id !== spaceId)
            .map((r) => ({
                roomId: r.room_id,
                name: r.name,
                topic: r.topic,
                numJoinedMembers: r.num_joined_members,
                roomType: r.room_type,
            }));
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error("getSpaceChildRooms: failed for space", spaceId, e);
        return [];
    }
}