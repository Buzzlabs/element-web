/**
 * Decides whether the VODs drawer (banner + bottom sheet) is shown for a room.
 *
 * For now this is a simple hardcoded flag, as agreed. Later this will be
 * driven by the `room_features` table (feature = 'vods') via the vod_service /
 * room_service module, so keep every caller going through this function — only
 * the body below changes when the backend lookup lands.
 */

/**
 * While testing, list the rooms that should show the tab here. Leave empty to
 * enable it for every room.
 *
 * TODO: replace this whole function with a per-room lookup of
 * room_features(room_id, 'vods').
 */
const ENABLED_ROOMS: ReadonlySet<string> = new Set<string>([
    "!uLRDsaGOYkMZMgVhGu:localhost",
]);

export function isVodsDrawerEnabled(roomId: string | undefined): boolean {
    if (!roomId) return false;

    // Empty allowlist = enabled everywhere (current behaviour).
    if (ENABLED_ROOMS.size === 0) return true;

    return ENABLED_ROOMS.has(roomId);
}