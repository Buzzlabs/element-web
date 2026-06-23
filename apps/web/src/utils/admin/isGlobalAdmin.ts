// utils/admin/isGlobalAdmin.ts

import SdkConfig from "../../SdkConfig";
import { MatrixClientPeg } from "../../MatrixClientPeg";

export async function isGlobalAdmin(): Promise<boolean> {
    try {
        const baseUrl =
            SdkConfig.get().default_server_config?.["m.homeserver"]?.base_url ??
            window.location.origin;

   
            const accessToken = MatrixClientPeg.safeGet().getAccessToken();

        const response = await fetch(
            `${baseUrl}/_synapse/room_service/is_admin`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        );

        if (!response.ok) {
            return false;
        }

        const data = await response.json();

        return data.is_admin === true;
    } catch (err) {
        console.error("Failed to check admin status", err);
        return false;
    }
}