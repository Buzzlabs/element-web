/**
 * Decides whether the VODs drawer (banner + bottom sheet) is shown for a room.
 *
 * For now this is a simple hardcoded flag, as agreed. Later this will be
 * driven by config/backend (e.g. a per-room setting from the room_service
 * module, or room state), so keep every caller going through this function.
 */
export function isVodsDrawerEnabled(roomId: string | undefined): boolean {
    if (!roomId) return false;

    // TODO: replace with real per-room config/backend lookup.
    // To restrict to specific rooms while testing, swap for something like:
    //   const ENABLED_ROOMS = new Set(["!yourRoomId:yourserver"]);
    //   return ENABLED_ROOMS.has(roomId);
    return true;
}