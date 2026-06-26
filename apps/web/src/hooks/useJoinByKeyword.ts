import { useCallback, useState } from "react";

import { MatrixClientPeg } from "../MatrixClientPeg";

export const useJoinByKeyword = (): {
    loading: boolean;
    error: Error | true | undefined;
    joinByKeyword(this: void, keyword: string): Promise<void>;
} => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | true | undefined>();

    const joinByKeyword = useCallback(async (keyword: string): Promise<void> => {
        setLoading(true);
        setError(undefined);
        try {
            const cli = MatrixClientPeg.safeGet();
            const baseUrl = cli.getHomeserverUrl();
            const userId = cli.getUserId();
            const accessToken = cli.getAccessToken();

            const res = await fetch(`${baseUrl}/_synapse/room_service/invite`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ user_id: userId, keyword }),
            });

            if (!res.ok) {
                throw new Error(`invite failed with status ${res.status}`);
            }
        } catch (e) {
            setError(e instanceof Error ? e : true);
            // eslint-disable-next-line no-console
            console.error("Could not join room by keyword", e);
            throw e;
        } finally {
            setLoading(false);
        }
    }, []);

    return { loading, error, joinByKeyword } as const;
};