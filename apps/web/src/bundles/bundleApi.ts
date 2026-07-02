import { type MatrixClient } from "matrix-js-sdk/src/matrix";

/**
 * Thin client for the `bundle_service` Synapse module endpoints
 * (`/_synapse/bundles/*`) and the room discovery endpoint used to
 * populate the room picker (`/_synapse/room_service/discover`).
 *
 * Mirrors the calls made from the FluffyChat `BundleFormController`.
 */

export interface DiscoverRoom {
    room_id: string;
    name: string;
}

export interface BundleRoom {
    room_id: string;
    name: string;
}

export interface Bundle {
    bundle_id: string;
    bundle_name: string;
    price: number;
    rooms: BundleRoom[];
    keywords: string[];
    status: "draft" | "published";
}

export interface CreateBundleOpts {
    bundleName: string;
    /** Price in the smallest currency unit (e.g. cents). */
    price: number;
    rooms: string[];
}

export interface UpdateBundleOpts extends CreateBundleOpts {
    bundleId: string;
}

function authedHeaders(client: MatrixClient): HeadersInit {
    return {
        Authorization: `Bearer ${client.getAccessToken()}`,
        "Content-Type": "application/json",
    };
}

async function parseOrThrow(response: Response): Promise<any> {
    const text = await response.text();
    let data: any = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        // Non-JSON error body, fall through with raw text below.
    }

    if (!response.ok) {
        throw new Error(data?.error || data?.message || text || `HTTP ${response.status}`);
    }
    return data;
}

/**
 * Fetches the list of rooms available to bundle (admin-created / business rooms).
 * Backed by `/_synapse/room_service/discover`.
 */
export async function discoverRooms(client: MatrixClient): Promise<DiscoverRoom[]> {
    const response = await fetch(`${client.getHomeserverUrl()}/_synapse/room_service/discover`, {
        method: "GET",
        headers: authedHeaders(client),
    });
    const data = await parseOrThrow(response);
    return data.rooms ?? [];
}

/**
 * Lists all bundles visible to the current user (their own drafts, plus
 * all published bundles; admins see every draft too).
 */
export async function listBundles(client: MatrixClient): Promise<Bundle[]> {
    const response = await fetch(`${client.getHomeserverUrl()}/_synapse/bundles/list`, {
        method: "GET",
        headers: authedHeaders(client),
    });
    const data = await parseOrThrow(response);
    return data.bundles ?? [];
}

/**
 * Creates a new bundle. Bundles are created as "draft" and must be
 * published separately via {@link publishBundle}.
 */
export async function createBundle(client: MatrixClient, opts: CreateBundleOpts): Promise<{ bundle_id: string }> {
    const response = await fetch(`${client.getHomeserverUrl()}/_synapse/bundles/create`, {
        method: "POST",
        headers: authedHeaders(client),
        body: JSON.stringify({
            bundle_name: opts.bundleName,
            price: opts.price,
            rooms: opts.rooms,
        }),
    });
    return parseOrThrow(response);
}

/**
 * Updates an existing bundle. Only the bundle owner or an admin may do this.
 */
export async function updateBundle(client: MatrixClient, opts: UpdateBundleOpts): Promise<{ bundle_id: string }> {
    const response = await fetch(`${client.getHomeserverUrl()}/_synapse/bundles/update`, {
        method: "POST",
        headers: authedHeaders(client),
        body: JSON.stringify({
            bundle_id: opts.bundleId,
            bundle_name: opts.bundleName,
            price: opts.price,
            rooms: opts.rooms,
        }),
    });
    return parseOrThrow(response);
}

/**
 * Publishes a draft bundle, making it visible to non-owners. Admin only.
 */
export async function publishBundle(client: MatrixClient, bundleId: string): Promise<{ status: string }> {
    const response = await fetch(`${client.getHomeserverUrl()}/_synapse/bundles/publish`, {
        method: "POST",
        headers: authedHeaders(client),
        body: JSON.stringify({ bundle_id: bundleId }),
    });
    return parseOrThrow(response);
}

/**
 * Deletes a bundle. Admin only.
 */
export async function deleteBundle(client: MatrixClient, bundleId: string): Promise<{ status: string }> {
    const response = await fetch(`${client.getHomeserverUrl()}/_synapse/bundles/delete`, {
        method: "POST",
        headers: authedHeaders(client),
        body: JSON.stringify({ bundle_id: bundleId }),
    });
    return parseOrThrow(response);
}

/**
 * Joins the current user to every room in a bundle (typically called
 * after a successful purchase/entitlement check on the server side).
 */
export async function inviteBundle(client: MatrixClient, bundleId: string): Promise<string[]> {
    const response = await fetch(`${client.getHomeserverUrl()}/_synapse/bundles/invite`, {
        method: "POST",
        headers: authedHeaders(client),
        body: JSON.stringify({ bundle_id: bundleId }),
    });
    return parseOrThrow(response);
}