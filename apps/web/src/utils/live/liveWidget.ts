import { type MatrixClient } from "matrix-js-sdk/src/matrix";

const LIVE_WIDGET_TYPE = "im.vector.modular.widgets";
const LIVE_WIDGET_STATE_KEY = "live_widget";

export async function startLive(
    client: MatrixClient,
    roomId: string,
    title: string,
    playbackUrl: string,
): Promise<void> {
    const userId = client.getUserId();
    if (!userId) {
        throw new Error("startLive: no logged-in user");
    }

    await client.sendStateEvent(
        roomId,
        LIVE_WIDGET_TYPE,
        {
            type: "live_stream",
            title,
            url: playbackUrl,
            creatorUserId: userId,
        } as any,
        LIVE_WIDGET_STATE_KEY,
    );
}

export async function stopLive(client: MatrixClient, roomId: string): Promise<void> {
    await client.sendStateEvent(roomId, LIVE_WIDGET_TYPE, {}, LIVE_WIDGET_STATE_KEY);
}

export function getLiveWidget(
    client: MatrixClient,
    roomId: string,
): { title: string; url: string } | null {
    const room = client.getRoom(roomId);
    if (!room) return null;

    const ev = room.currentState.getStateEvents(LIVE_WIDGET_TYPE, LIVE_WIDGET_STATE_KEY);
    if (!ev) return null;

    const content = ev.getContent();
    if (!content?.url) return null; // widget "vazio" = live encerrada

    return { title: content.title ?? "Live", url: content.url };
}