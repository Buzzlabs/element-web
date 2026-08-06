/*
Copyright 2024 New Vector Ltd.
Copyright 2022 Oliver Sand
Copyright 2022 Nordeck IT + Consulting GmbH.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import WidgetUtils from "../../../src/utils/WidgetUtils";
import SdkConfig from "../../../src/SdkConfig";
import { mockPlatformPeg } from "../../test-utils";

describe("getLocalJitsiWrapperUrl", () => {
    beforeEach(() => {
        Object.defineProperty(window, "location", {
            value: {
                origin: "https://app.element.io",
                pathname: "",
            },
        });
    });

    it("should generate jitsi URL (for defaults)", () => {
        mockPlatformPeg();

        expect(WidgetUtils.getLocalJitsiWrapperUrl()).toEqual(
            "https://app.element.io/jitsi.html" +
                "#conferenceDomain=$domain" +
                "&conferenceId=$conferenceId" +
                "&isAudioOnly=$isAudioOnly" +
                "&startWithAudioMuted=$startWithAudioMuted" +
                "&startWithVideoMuted=$startWithVideoMuted" +
                "&isVideoChannel=$isVideoChannel" +
                "&displayName=$matrix_display_name" +
                "&avatarUrl=$matrix_avatar_url" +
                "&userId=$matrix_user_id" +
                "&roomId=$matrix_room_id" +
                "&theme=$theme" +
                "&roomName=$roomName" +
                "&supportsScreensharing=true" +
                "&language=$org.matrix.msc2873.client_language",
        );
    });
});

describe("deterministicJitsiConferenceId", () => {
    it("builds <localpart>-<room-slug>", () => {
        expect(
            WidgetUtils.deterministicJitsiConferenceId("@matheus:matrix.buzzlabs.com.br", "Weekly Produto"),
        ).toEqual("matheus-weekly-produto");
    });

    it("strips accents and symbols from the room name", () => {
        expect(WidgetUtils.deterministicJitsiConferenceId("@ana:x.br", "Operação & Vendas!")).toEqual(
            "ana-operacao-vendas",
        );
    });

    it("returns null when there is no usable room name", () => {
        expect(WidgetUtils.deterministicJitsiConferenceId("@ana:x.br", undefined)).toBeNull();
        expect(WidgetUtils.deterministicJitsiConferenceId("@ana:x.br", "!!!")).toBeNull();
    });
});

describe("jitsiWidgetAuth", () => {
    afterEach(() => {
        SdkConfig.reset();
    });

    it("prefers the config override over well-known discovery", async () => {
        SdkConfig.put({ jitsi_widget: { auth: "buzzlabs-jwt" } });
        await expect(WidgetUtils.jitsiWidgetAuth()).resolves.toEqual("buzzlabs-jwt");
    });

    it("falls back to Jitsi well-known auth without config", async () => {
        await expect(WidgetUtils.jitsiWidgetAuth()).resolves.toBeUndefined();
    });
});

describe("maybeInviteScribeBot", () => {
    afterEach(() => {
        SdkConfig.reset();
    });

    const mkClient = (): { invite: jest.Mock } & Pick<MatrixClient, "getUserId"> => ({
        invite: jest.fn().mockResolvedValue({}),
        getUserId: () => "@me:matrix.buzzlabs.com.br",
    });

    it("invites the configured bot", async () => {
        SdkConfig.put({ jitsi_widget: { scribe_bot_mxid: "@scribe:matrix.buzzlabs.com.br" } });
        const client = mkClient();
        await WidgetUtils.maybeInviteScribeBot(client as unknown as MatrixClient, "!room:x");
        expect(client.invite).toHaveBeenCalledWith("!room:x", "@scribe:matrix.buzzlabs.com.br");
    });

    it("does nothing without config", async () => {
        const client = mkClient();
        await WidgetUtils.maybeInviteScribeBot(client as unknown as MatrixClient, "!room:x");
        expect(client.invite).not.toHaveBeenCalled();
    });

    it("swallows invite failures (already invited / no permission)", async () => {
        SdkConfig.put({ jitsi_widget: { scribe_bot_mxid: "@scribe:matrix.buzzlabs.com.br" } });
        const client = mkClient();
        client.invite.mockRejectedValue(new Error("403"));
        await expect(
            WidgetUtils.maybeInviteScribeBot(client as unknown as MatrixClient, "!room:x"),
        ).resolves.toBeUndefined();
    });
});
