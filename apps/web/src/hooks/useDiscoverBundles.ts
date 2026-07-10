import { useCallback, useEffect, useState } from "react";

import { MatrixClientPeg } from "../MatrixClientPeg";
import { listBundles, type Bundle } from "../bundles/bundleApi";

/**
 * Discovers bundles available for purchase (published only).
 *
 * Mirrors `useDiscoverRooms`, but built on top of `listBundles()` instead of
 * a dedicated public endpoint: the backend's `list_bundles` already hides
 * drafts from anyone but their owner/admin, but if the current user *is*
 * the owner/admin we still filter to `status === "published"` here so
 * their own drafts never show up in this discovery/purchase surface.
 */
export const useDiscoverBundles = (): {
    loading: boolean;
    error: Error | true | undefined;
    bundles: Bundle[];
    refresh(this: void): void;
} => {
    const [bundles, setBundles] = useState<Bundle[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | true | undefined>();

    const fetchBundles = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(undefined);
        try {
            const all = await listBundles(MatrixClientPeg.safeGet());
            setBundles(all.filter((b) => b.status === "published"));
        } catch (e) {
            setError(e instanceof Error ? e : true);
            // eslint-disable-next-line no-console
            console.error("Could not fetch discover bundles", e);
            setBundles([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBundles();
    }, [fetchBundles]);

    return { loading, error, bundles, refresh: fetchBundles } as const;
};