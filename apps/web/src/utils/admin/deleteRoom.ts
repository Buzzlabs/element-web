import SdkConfig from "../../SdkConfig";
import { MatrixClientPeg } from "../../MatrixClientPeg";

export async function deleteRoom(roomId: string): Promise<void> {
    const baseUrl =
        SdkConfig.get().default_server_config?.["m.homeserver"]?.base_url ?? window.location.origin;
    const accessToken = MatrixClientPeg.safeGet().getAccessToken();

    const response = await fetch(`${baseUrl}/_synapse/room_service/deleteroom`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        // ajuste o nome do campo conforme seu DeleteRoomResource espera
        body: JSON.stringify({ room_id: roomId }),
    });

    if (!response.ok) {
        throw new Error(`deleteroom failed with status ${response.status}`);
    }
}