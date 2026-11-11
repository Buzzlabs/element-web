/*
Copyright 2026 Buzzlabs

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { waitFor, renderHook } from "jest-matrix-react";
import { mocked } from "jest-mock";

import { useDiscoverRooms } from "../../../src/hooks/useDiscoverRooms";
import { MatrixClientPeg } from "../../../src/MatrixClientPeg";
import { stubClient } from "../../test-utils/test-utils";

describe("useDiscoverRooms", () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        stubClient();
        const cli = MatrixClientPeg.safeGet();
        mocked(cli.getAccessToken).mockReturnValue("token-123");
        mocked(cli.getHomeserverUrl).mockReturnValue("https://matrix.example.com");
        fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ rooms: [] }),
        } as Response);
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it("sends the access token, since the discover endpoint requires authentication", async () => {
        renderHook(() => useDiscoverRooms());

        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe("https://matrix.example.com/_synapse/room_service/discover");
        expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-123" });
    });
});
