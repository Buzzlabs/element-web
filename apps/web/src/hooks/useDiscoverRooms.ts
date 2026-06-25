import { useCallback, useEffect, useState } from "react";

import { MatrixClientPeg } from "../MatrixClientPeg";

export interface DiscoverRoom {
    room_id: string;
    name: string;
    room_kind: string;
    access_type: string; // "public" | "private"
    price: number;
    member_count: number;
    keyword: string; // identificador enviado ao paywall; não renderizar nos tiles
}

export const useDiscoverRooms = (): {
    loading: boolean;
    error: Error | true | undefined;
    rooms: DiscoverRoom[];
    refresh(this: void): void;
} => {
    const [rooms, setRooms] = useState<DiscoverRoom[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | true | undefined>();

    const fetchRooms = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(undefined);
        try {
            // baseUrl do homeserver, ex: https://matrix.exemplo.com
            const baseUrl = MatrixClientPeg.safeGet().getHomeserverUrl();
            const res = await fetch(`${baseUrl}/_synapse/room_service/discover`, {
                method: "GET",
                headers: { Accept: "application/json" },
            });

            if (!res.ok) {
                throw new Error(`discover failed with status ${res.status}`);
            }

            const data = await res.json();
            setRooms(Array.isArray(data?.rooms) ? data.rooms : []);
        } catch (e) {
            setError(e instanceof Error ? e : true);
            // eslint-disable-next-line no-console
            console.error("Could not fetch discover rooms", e);
            setRooms([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRooms();
    }, [fetchRooms]);

    return { loading, error, rooms, refresh: fetchRooms } as const;
};