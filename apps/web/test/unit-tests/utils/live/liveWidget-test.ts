import { MatrixEvent } from "matrix-js-sdk/src/matrix";
import { getLiveWidget, startLive, stopLive } from "../../../../src/utils/live/liveWidget";
import { getMockClientWithEventEmitter, mockClientMethodsUser } from "../../../test-utils/client";
import { makeRoomWithStateEvents } from "../../../test-utils/room";

const ROOM_ID = "!room:server.org";
const WIDGET_TYPE = "im.vector.modular.widgets";
const WIDGET_STATE_KEY = "live_widget";

describe("liveWidget", () => {
    const mockClient = getMockClientWithEventEmitter({
        ...mockClientMethodsUser(),
        sendStateEvent: jest.fn(),
        getRoom: jest.fn(),
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("getLiveWidget", () => {
        it("retorna null quando não há widget de live na sala", () => {
            // arrange: sala sem nenhum evento de widget de live
            const room = makeRoomWithStateEvents([], { roomId: ROOM_ID, mockClient });

            // act
            const result = getLiveWidget(mockClient, room.roomId);

            // assert
            expect(result).toBeNull();
        });

        it("retorna title e url quando o widget existe e tem url", () => {
            const widgetEvent = new MatrixEvent({
                type: WIDGET_TYPE,
                state_key: WIDGET_STATE_KEY,
                room_id: ROOM_ID,
                sender: "@alice:server.org",
                content: {
                    type: "live_stream",
                    title: "Show de sexta",
                    url: "https://exemplo.com/live/canal.m3u8",
                    creatorUserId: "@alice:server.org",
                },
            });
            const room = makeRoomWithStateEvents([widgetEvent], { roomId: ROOM_ID, mockClient });

            const result = getLiveWidget(mockClient, room.roomId);

            expect(result).toEqual({
                title: "Show de sexta",
                url: "https://exemplo.com/live/canal.m3u8",
            });
        });

        it("retorna null quando o widget foi removido (content vazio, sem url)", () => {
            const removedWidgetEvent = new MatrixEvent({
                type: WIDGET_TYPE,
                state_key: WIDGET_STATE_KEY,
                room_id: ROOM_ID,
                sender: "@alice:server.org",
                content: {}, // é assim que stopLive "apaga" o widget
            });
            const room = makeRoomWithStateEvents([removedWidgetEvent], { roomId: ROOM_ID, mockClient });

            const result = getLiveWidget(mockClient, room.roomId);

            expect(result).toBeNull();
        });
    });

    describe("startLive", () => {
        it("chama sendStateEvent com tipo, state_key e conteúdo corretos", async () => {
            await startLive(mockClient, ROOM_ID, "Minha live", "https://exemplo.com/live.m3u8");

            expect(mockClient.sendStateEvent).toHaveBeenCalledWith(
                ROOM_ID,
                WIDGET_TYPE,
                expect.objectContaining({
                    title: "Minha live",
                    url: "https://exemplo.com/live.m3u8",
                }),
                WIDGET_STATE_KEY,
            );
        });
    });

    describe("stopLive", () => {
        it("chama sendStateEvent com conteúdo vazio para remover o widget", async () => {
            await stopLive(mockClient, ROOM_ID);

            expect(mockClient.sendStateEvent).toHaveBeenCalledWith(ROOM_ID, WIDGET_TYPE, {}, WIDGET_STATE_KEY);
        });
    });
});