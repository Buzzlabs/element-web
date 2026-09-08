/*
Copyright 2024 New Vector Ltd.
Copyright 2019-2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type ChangeEventHandler, type JSX, type ReactNode } from "react";
import {
    GuestAccess,
    HistoryVisibility,
    JoinRule,
    type MatrixEvent,
    RoomStateEvent,
    type Room,
    EventType,
} from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import { Form, InlineSpinner, SettingsToggleInput } from "@vector-im/compound-web";
import { WarningIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { _t } from "../../../../../languageHandler";
import Modal from "../../../../../Modal";
import QuestionDialog from "../../../dialogs/QuestionDialog";
import StyledRadioGroup from "../../../elements/StyledRadioGroup";
import { SettingLevel } from "../../../../../settings/SettingLevel";
import SettingsStore from "../../../../../settings/SettingsStore";
import { UIFeature } from "../../../../../settings/UIFeature";
import AccessibleButton from "../../../elements/AccessibleButton";
import SettingsFlag from "../../../elements/SettingsFlag";
import createRoom from "../../../../../createRoom";
import CreateRoomDialog from "../../../dialogs/CreateRoomDialog";
import JoinRuleSettings from "../../JoinRuleSettings";
import ErrorDialog from "../../../dialogs/ErrorDialog";
import SettingsFieldset from "../../SettingsFieldset";
import ExternalLink from "../../../elements/ExternalLink";
import PosthogTrackers from "../../../../../PosthogTrackers";
import MatrixClientContext from "../../../../../contexts/MatrixClientContext";
import { SettingsSection } from "../../shared/SettingsSection";
import SettingsTab from "../SettingsTab";
import SdkConfig from "../../../../../SdkConfig";
import { shouldForceDisableEncryption } from "../../../../../utils/crypto/shouldForceDisableEncryption";
import { Caption } from "../../../typography/Caption";
import { MEGOLM_ENCRYPTION_ALGORITHM } from "../../../../../utils/crypto";
import { BusinessVisibilitySection } from "./BusinessVisibilitySection";
import {
    getRoomFeatures, setRoomFeature, ROOM_FEATURES,
    getRoomCalendar, setRoomCalendar,
    getStream, setStream,
} from "../../../../../utils/admin/roomFeatures";
import { getLiveWidget, startLive, stopLive } from "../../../../../utils/live/liveWidget"
import ToggleSwitch from "../../../elements/ToggleSwitch";
import defaultDispatcher from "../../../../../dispatcher/dispatcher";
import TextInputDialog from "../../../dialogs/TextInputDialog";

interface IProps {
    room: Room;
    closeSettingsFn: () => void;
}

interface IState {
    guestAccess: GuestAccess;
    history: HistoryVisibility;
    hasAliases: boolean;
    encrypted: boolean | null;
    stateEncrypted: boolean | null;
    showAdvancedSection: boolean;
    roomFeatures: Record<string, boolean>;
    featuresBusy: boolean;
    roomCalendarId: string;
    calendarInput: string;
    calendarBusy: boolean;
    streamPlaybackUrl: string;
    streamInput: string;
    streamBusy: boolean;
    isLive: boolean;
}

export default class SecurityRoomSettingsTab extends React.Component<IProps, IState> {
    public static contextType = MatrixClientContext;
    declare public context: React.ContextType<typeof MatrixClientContext>;

    public constructor(props: IProps) {
        super(props);

        const state = this.props.room.currentState;

        this.state = {
            guestAccess: this.pullContentPropertyFromEvent<GuestAccess>(
                state?.getStateEvents(EventType.RoomGuestAccess, ""),
                "guest_access",
                GuestAccess.Forbidden,
            ),
            history: this.pullContentPropertyFromEvent<HistoryVisibility>(
                state?.getStateEvents(EventType.RoomHistoryVisibility, ""),
                "history_visibility",
                HistoryVisibility.Shared,
            ),
            hasAliases: false, // async loaded in componentDidMount
            encrypted: null, // async loaded in componentDidMount
            stateEncrypted: null, // async loaded in componentDidMount
            showAdvancedSection: false,
            roomFeatures: {},
            featuresBusy: false,
            roomCalendarId: "",
            calendarInput: "",
            calendarBusy: false,
            streamPlaybackUrl: "",
            streamInput: "",
            streamBusy: false,
            isLive: false,
        };
    }

    public async componentDidMount(): Promise<void> {
        this.context.on(RoomStateEvent.Events, this.onStateEvent);
        this.loadRoomFeatures();
        this.loadRoomCalendar();
        this.loadStream();
        this.refreshLiveState();
        this.props.room.client.on(RoomStateEvent.Events, this.onRoomState);



        this.setState({
            hasAliases: await this.hasAliases(),
            encrypted: Boolean(await this.context.getCrypto()?.isEncryptionEnabledInRoom(this.props.room.roomId)),
            stateEncrypted: Boolean(
                await this.context.getCrypto()?.isStateEncryptionEnabledInRoom(this.props.room.roomId),
            ),
        });
    }

    private onRoomState = (): void => {
        this.refreshLiveState();
    };

    private refreshLiveState = (): void => {
        const widget = getLiveWidget(this.props.room.client, this.props.room.roomId);
        this.setState({ isLive: !!widget });
    };

    private onToggleLive = async (): Promise<void> => {
        // encerrar: não precisa perguntar nada
        if (this.state.isLive) {
            this.setState({ streamBusy: true });
            try {
                await stopLive(this.props.room.client, this.props.room.roomId);
                this.refreshLiveState();
            } catch (e) {
                logger.error("Falha ao encerrar transmissão:", e);
            } finally {
                this.setState({ streamBusy: false });
            }
            return;
        }

        // iniciar: pede o título antes
        if (!this.state.streamPlaybackUrl) {
            logger.error("onToggleLive: no playback_url configured");
            return;
        }

        const { finished } = Modal.createDialog(TextInputDialog, {
            title: "Iniciar transmissão",
            description: "Qual o título desta transmissão?",
            placeholder: "Ex: Live de hoje — entrevista especial",
            value: this.props.room.name || "Live",   // <-- era defaultValue, agora é value
            button: "Iniciar",
        });

        const [confirmed, value] = await finished;
        if (!confirmed) return;

        const title = (value ?? "").trim() || this.props.room.name || "Live";

        this.setState({ streamBusy: true });
        try {
            await startLive(
                this.props.room.client,
                this.props.room.roomId,
                title,
                this.state.streamPlaybackUrl,
            );
            this.refreshLiveState();
        } catch (e) {
            logger.error("Falha ao iniciar transmissão:", e);
        } finally {
            this.setState({ streamBusy: false });
        }
    };


    private loadStream = async (): Promise<void> => {
        try {
            const { playback_url } = await getStream(this.props.room.roomId);
            this.setState({
                streamPlaybackUrl: playback_url ?? "",
                streamInput: playback_url ?? "",
            });
        } catch (e) {
            logger.error("Falha ao carregar canal de transmissão:", e);
        }
    };

    private onSaveStream = async (): Promise<void> => {
        const value = this.state.streamInput.trim();
        this.setState({ streamBusy: true });
        try {
            await setStream(this.props.room.roomId, value);
            this.setState({ streamPlaybackUrl: value });
        } catch (e) {
            logger.error("Falha ao salvar canal de transmissão:", e);
        } finally {
            this.setState({ streamBusy: false });
        }
    };

    private loadRoomCalendar = async (): Promise<void> => {
        try {
            const { calendarId } = await getRoomCalendar(this.props.room.roomId);
            this.setState({ roomCalendarId: calendarId ?? "", calendarInput: calendarId ?? "" });
        } catch (e) {
            logger.error("Falha ao carregar calendar:", e);
        }
    };

    private onSaveCalendar = async (): Promise<void> => {
        const value = this.state.calendarInput.trim();
        this.setState({ calendarBusy: true });
        try {
            await setRoomCalendar(this.props.room.roomId, value);
            this.setState({ roomCalendarId: value });
        } catch (e) {
            logger.error("Falha ao salvar calendar:", e);
        } finally {
            this.setState({ calendarBusy: false });
        }
    };

    private loadRoomFeatures = async (): Promise<void> => {
        try {
            const features = await getRoomFeatures(this.props.room.roomId);
            this.setState({ roomFeatures: features });
        } catch (e) {
            logger.error("Falha ao carregar room features:", e);
        }
    };

    private onFeatureToggle = async (feature: string, enabled: boolean): Promise<void> => {
        this.setState((s) => ({ roomFeatures: { ...s.roomFeatures, [feature]: enabled }, featuresBusy: true }));
        try {
            await setRoomFeature(this.props.room.roomId, feature, enabled);
            defaultDispatcher.dispatch({
                action: "room_features_changed",
                roomId: this.props.room.roomId,
            });
        } catch (e) {
            logger.error("Falha ao alterar feature:", e);
            this.setState((s) => ({ roomFeatures: { ...s.roomFeatures, [feature]: !enabled } }));
        } finally {
            this.setState({ featuresBusy: false });
        }
    };

    private pullContentPropertyFromEvent<T>(event: MatrixEvent | null | undefined, key: string, defaultValue: T): T {
        return event?.getContent()[key] || defaultValue;
    }

    public componentWillUnmount(): void {
        this.context.removeListener(RoomStateEvent.Events, this.onStateEvent);
    }

    private onStateEvent = (e: MatrixEvent): void => {
        const refreshWhenTypes: EventType[] = [
            EventType.RoomJoinRules,
            EventType.RoomGuestAccess,
            EventType.RoomHistoryVisibility,
            EventType.RoomEncryption,
        ];
        if (refreshWhenTypes.includes(e.getType() as EventType)) this.forceUpdate();
    };

    private onEncryptionChange = async (): Promise<void> => {
        if (this.props.room.getJoinRule() === JoinRule.Public) {
            const dialog = Modal.createDialog(QuestionDialog, {
                title: _t("room_settings|security|enable_encryption_public_room_confirm_title"),
                description: (
                    <div>
                        <p>
                            {" "}
                            {_t(
                                "room_settings|security|enable_encryption_public_room_confirm_description_1",
                                undefined,
                                { b: (sub) => <strong>{sub}</strong> },
                            )}{" "}
                        </p>
                        <p>
                            {" "}
                            {_t(
                                "room_settings|security|enable_encryption_public_room_confirm_description_2",
                                undefined,
                                {
                                    a: (sub) => (
                                        <AccessibleButton
                                            element="a"
                                            kind="link_inline"
                                            onClick={() => {
                                                dialog.close();
                                                this.createNewRoom(false, true);
                                            }}
                                        >
                                            {" "}
                                            {sub}{" "}
                                        </AccessibleButton>
                                    ),
                                },
                            )}{" "}
                        </p>
                    </div>
                ),
            });

            const { finished } = dialog;
            const [confirm] = await finished;
            if (!confirm) return;
        }

        const { finished } = Modal.createDialog(QuestionDialog, {
            title: _t("room_settings|security|enable_encryption_confirm_title"),
            description: _t(
                "room_settings|security|enable_encryption_confirm_description",
                {},
                {
                    a: (sub) => <ExternalLink href={SdkConfig.get("help_encryption_url")}>{sub}</ExternalLink>,
                },
            ),
        });
        finished.then(([confirm]) => {
            if (!confirm) {
                this.setState({ encrypted: false });
                return;
            }

            const beforeEncrypted = this.state.encrypted;
            this.setState({ encrypted: true });
            this.context
                .sendStateEvent(this.props.room.roomId, EventType.RoomEncryption, {
                    algorithm: MEGOLM_ENCRYPTION_ALGORITHM,
                })
                .catch((e) => {
                    logger.error(e);
                    this.setState({ encrypted: beforeEncrypted });
                });
        });
    };

    private onGuestAccessChange: ChangeEventHandler<HTMLInputElement> = (evt): void => {
        const allowed = evt.target.checked;
        const guestAccess = allowed ? GuestAccess.CanJoin : GuestAccess.Forbidden;
        const beforeGuestAccess = this.state.guestAccess;
        if (beforeGuestAccess === guestAccess) return;

        this.setState({ guestAccess });

        this.context
            .sendStateEvent(
                this.props.room.roomId,
                EventType.RoomGuestAccess,
                {
                    guest_access: guestAccess,
                },
                "",
            )
            .catch((e) => {
                logger.error(e);
                this.setState({ guestAccess: beforeGuestAccess });
            });
    };

    private createNewRoom = async (defaultPublic: boolean, defaultEncrypted: boolean): Promise<boolean> => {
        const modal = Modal.createDialog(CreateRoomDialog, { defaultPublic, defaultEncrypted });

        PosthogTrackers.trackInteraction("WebRoomSettingsSecurityTabCreateNewRoomButton");

        const [shouldCreate, opts] = await modal.finished;
        if (shouldCreate) {
            await createRoom(this.context, opts!);
        }
        return shouldCreate ?? false;
    };

    private onHistoryRadioToggle = (history: HistoryVisibility): void => {
        const beforeHistory = this.state.history;
        if (beforeHistory === history) return;

        this.setState({ history: history });
        this.context
            .sendStateEvent(
                this.props.room.roomId,
                EventType.RoomHistoryVisibility,
                {
                    history_visibility: history,
                },
                "",
            )
            .catch((e) => {
                logger.error(e);
                this.setState({ history: beforeHistory });
            });
    };

    private updateBlacklistDevicesFlag = (checked: boolean): void => {
        this.props.room.setBlacklistUnverifiedDevices(checked);
    };

    private async hasAliases(): Promise<boolean> {
        const cli = this.context;
        const response = await cli.getLocalAliases(this.props.room.roomId);
        const localAliases = response.aliases;
        return Array.isArray(localAliases) && localAliases.length !== 0;
    }

    private renderJoinRule(): JSX.Element {
        const room = this.props.room;
        const isPublic = room.getJoinRule() === JoinRule.Public;
        const description = (
            <>
                <p>
                    {_t("room_settings|security|join_rule_description", {
                        roomName: room.name,
                    })}
                </p>
                {isPublic && this.state.history === HistoryVisibility.WorldReadable && (
                    <div className="mx_SecurityRoomSettingsTab_warning">
                        <WarningIcon width={15} height={15} />
                        <span>{_t("room_settings|security|join_rule_world_readable_description")}</span>
                    </div>
                )}
                {isPublic && !this.state.hasAliases && (
                    <div className="mx_SecurityRoomSettingsTab_warning">
                        <WarningIcon width={15} height={15} />
                        <span>{_t("room_settings|security|public_without_alias_warning")}</span>
                    </div>
                )}
            </>
        );

        let advanced: JSX.Element | undefined;
        if (room.getJoinRule() === JoinRule.Public) {
            advanced = (
                <div>
                    <AccessibleButton
                        onClick={this.toggleAdvancedSection}
                        kind="link"
                        className="mx_SettingsTab_showAdvanced"
                        aria-expanded={this.state.showAdvancedSection}
                    >
                        {this.state.showAdvancedSection ? _t("action|hide_advanced") : _t("action|show_advanced")}
                    </AccessibleButton>
                    {this.state.showAdvancedSection && this.renderAdvanced()}
                </div>
            );
        }

        return (
            <SettingsFieldset legend={_t("room_settings|access|title")} description={description}>
                <JoinRuleSettings
                    room={room}
                    beforeChange={this.onBeforeJoinRuleChange}
                    onError={this.onJoinRuleChangeError}
                    closeSettingsFn={this.props.closeSettingsFn}
                    promptUpgrade={true}
                />
                {advanced}
            </SettingsFieldset>
        );
    }

    private onJoinRuleChangeError = (error: Error): void => {
        Modal.createDialog(ErrorDialog, {
            title: _t("room_settings|security|error_join_rule_change_title"),
            description: error.message ?? _t("room_settings|security|error_join_rule_change_unknown"),
        });
    };

    private onBeforeJoinRuleChange = async (joinRule: JoinRule): Promise<boolean> => {
        if (this.state.encrypted && joinRule === JoinRule.Public) {
            const dialog = Modal.createDialog(QuestionDialog, {
                title: _t("room_settings|security|encrypted_room_public_confirm_title"),
                description: (
                    <div>
                        <p>
                            {" "}
                            {_t("room_settings|security|encrypted_room_public_confirm_description_1", undefined, {
                                b: (sub) => <strong>{sub}</strong>,
                            })}{" "}
                        </p>
                        <p>
                            {" "}
                            {_t("room_settings|security|encrypted_room_public_confirm_description_2", undefined, {
                                a: (sub) => (
                                    <AccessibleButton
                                        element="a"
                                        kind="link_inline"
                                        onClick={(): void => {
                                            dialog.close();
                                            this.createNewRoom(true, false);
                                        }}
                                    >
                                        {" "}
                                        {sub}{" "}
                                    </AccessibleButton>
                                ),
                            })}{" "}
                        </p>
                    </div>
                ),
            });

            const { finished } = dialog;
            const [confirm] = await finished;
            if (!confirm) return false;
        }

        // If the room is going from public to private AND the room is join readable, we want to encourage the user
        // to change the history visibility.
        const currentlyPublic = this.props.room.getJoinRule() === JoinRule.Public;
        if (this.state.history === HistoryVisibility.WorldReadable && currentlyPublic && joinRule !== JoinRule.Public) {
            const client = this.context;
            const canChangeHistory = this.props.room.currentState?.mayClientSendStateEvent(
                EventType.RoomHistoryVisibility,
                client,
            );

            // If we can't change the history visibility, then don't allow the join rule transition. This is a unlikely occurance
            // and if this is the case, a room administator should step in.
            if (!canChangeHistory) {
                const dialog = Modal.createDialog(ErrorDialog, {
                    title: _t(
                        "room_settings|security|cannot_change_to_private_due_to_missing_history_visiblity_permissions|title",
                    ),
                    description: (
                        <p>
                            {_t(
                                "room_settings|security|cannot_change_to_private_due_to_missing_history_visiblity_permissions|description",
                            )}
                        </p>
                    ),
                });
                await dialog.finished;
                return false;
            }

            // Adjust the history visibility first.
            try {
                await this.context.sendStateEvent(
                    this.props.room.roomId,
                    EventType.RoomHistoryVisibility,
                    {
                        history_visibility: HistoryVisibility.Shared,
                    },
                    "",
                );
                this.setState({ history: HistoryVisibility.Shared });
            } catch (ex) {
                logger.error("Failed to change history visibility", ex);
                Modal.createDialog(ErrorDialog, {
                    title: _t("common|error"),
                    description: _t("error|update_history_visibility"),
                });
                // If we fail to update the history visibility
                return false;
            }
        }

        return true;
    };

    private renderHistory(): ReactNode {
        if (!SettingsStore.getValue(UIFeature.RoomHistorySettings)) {
            return null;
        }

        const client = this.context;
        const history = this.state.history;
        const state = this.props.room.currentState;
        const canChangeHistory = state?.mayClientSendStateEvent(EventType.RoomHistoryVisibility, client);

        // Map 'joined' to 'invited' for display purposes
        const displayHistory = history === HistoryVisibility.Joined ? HistoryVisibility.Invited : history;

        const isPublicRoom = this.props.room.getJoinRule() === JoinRule.Public;
        const isEncrypted = this.state.encrypted;

        const options: Array<{ value: HistoryVisibility; label: string }> = [];

        // Show "invited" when room's join rule is NOT public OR E2EE is turned on, or if currently selected
        if (
            !isPublicRoom ||
            isEncrypted ||
            history === HistoryVisibility.Invited ||
            history === HistoryVisibility.Joined
        ) {
            options.push({
                value: HistoryVisibility.Invited,
                label: _t("room_settings|security|history_visibility_invited"),
            });
        }

        // Always show "shared" option
        options.push({
            value: HistoryVisibility.Shared,
            label: _t("room_settings|security|history_visibility_shared"),
        });

        // Show "world_readable" when (is public AND not encrypted) OR currently selected
        if ((isPublicRoom && !isEncrypted) || history === HistoryVisibility.WorldReadable) {
            options.push({
                value: HistoryVisibility.WorldReadable,
                label: _t("room_settings|security|history_visibility_world_readable"),
            });
        }

        const description = (
            <>
                {_t(
                    "room_settings|security|history_visibility_warning",
                    {},
                    {
                        a: (sub) => (
                            <ExternalLink href="https://element.io/en/help#e2ee-history-sharing">{sub}</ExternalLink>
                        ),
                    },
                )}
            </>
        );

        return (
            <SettingsFieldset legend={_t("room_settings|security|history_visibility_legend")} description={description}>
                <StyledRadioGroup
                    name="historyVis"
                    value={displayHistory}
                    onChange={this.onHistoryRadioToggle}
                    disabled={!canChangeHistory}
                    definitions={options}
                />
            </SettingsFieldset>
        );
    }

    private toggleAdvancedSection = (): void => {
        this.setState({ showAdvancedSection: !this.state.showAdvancedSection });
    };

    private renderAdvanced(): JSX.Element {
        const client = this.context;
        const guestAccess = this.state.guestAccess;
        const state = this.props.room.currentState;
        const canSetGuestAccess = state?.mayClientSendStateEvent(EventType.RoomGuestAccess, client);

        return (
            <div className="mx_SecurityRoomSettingsTab_advancedSection">
                <SettingsToggleInput
                    name="guest-access"
                    checked={guestAccess === GuestAccess.CanJoin}
                    onChange={this.onGuestAccessChange}
                    disabled={!canSetGuestAccess}
                    label={_t("room_settings|visibility|guest_access_label")}
                    helpMessage={_t("room_settings|security|guest_access_warning")}
                />
            </div>
        );
    }

    public render(): React.ReactNode {
        const client = this.context;
        const room = this.props.room;
        const isEncrypted = this.state.encrypted;
        const isStateEncrypted = this.state.stateEncrypted;
        const isEncryptionLoading = isEncrypted === null;
        const hasEncryptionPermission = room.currentState.mayClientSendStateEvent(EventType.RoomEncryption, client);
        const isEncryptionForceDisabled = shouldForceDisableEncryption(client);
        const canEnableEncryption = !isEncrypted && !isEncryptionForceDisabled && hasEncryptionPermission;
            const calendarSection = this.state.roomFeatures["events"] && (
            <SettingsFieldset
                legend={"Calendário de eventos"}
                description={"ID do Google Calendar que fornece os eventos desta sala."}
            >
                <input
                    className="mx_LiveStreamInput"
                    type="text"
                    value={this.state.calendarInput}
                    placeholder="exemplo@group.calendar.google.com"
                    onChange={(e) => this.setState({ calendarInput: e.target.value })}
                    disabled={this.state.calendarBusy}
                    style={{ width: "100%", padding: "8px", marginBottom: "8px", boxSizing: "border-box" }}
                />
                <AccessibleButton
                    kind="primary"
                    onClick={this.onSaveCalendar}
                    disabled={this.state.calendarBusy || this.state.calendarInput.trim() === this.state.roomCalendarId}
                >
                    {"Salvar"}
                </AccessibleButton>
            </SettingsFieldset>
        );
        const streamSection = this.state.roomFeatures["live"] && (
            <SettingsFieldset
                legend={"Canal de transmissão (Live)"}
                description={"URL de reprodução (HLS) do canal usado para transmitir ao vivo nesta sala."}
            >
                <input
                    type="text"
                    value={this.state.streamInput}
                    placeholder="https://exemplo.com/live/canal.m3u8"
                    onChange={(e) => this.setState({ streamInput: e.target.value })}
                    disabled={this.state.streamBusy}
                    style={{ width: "100%", padding: "8px", marginBottom: "8px", boxSizing: "border-box" }}
                />
                <AccessibleButton
                    kind="primary"
                    onClick={this.onSaveStream}
                    disabled={this.state.streamBusy || this.state.streamInput.trim() === this.state.streamPlaybackUrl}
                >
                    {"Salvar"}
                </AccessibleButton>

                {/* controle de iniciar/encerrar — só faz sentido se já tem URL salva */}
                {this.state.streamPlaybackUrl && (
                    <div style={{ marginTop: "16px" }}>
                        <AccessibleButton
                            kind={this.state.isLive ? "danger" : "primary_outline"}
                            onClick={this.onToggleLive}
                            disabled={this.state.streamBusy}
                        >
                            {this.state.streamBusy
                                ? "Aguarde…"
                                : this.state.isLive
                                  ? "Encerrar transmissão"
                                  : "Iniciar transmissão"}
                        </AccessibleButton>
                    </div>
                )}
            </SettingsFieldset>
        );
        const featuresSection = (
        <SettingsFieldset
            legend={"Funcionalidades da sala"}
            description={"Ative ou desative abas opcionais para esta sala."}
        >
            {ROOM_FEATURES.map(({ key, label }) => (
                <div
                    key={key}
                    className="mx_SettingsFlag"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}
                >
                    <span>{label}</span>
                    <ToggleSwitch
                        checked={!!this.state.roomFeatures[key]}
                        disabled={this.state.featuresBusy}
                        onChange={(checked) => this.onFeatureToggle(key, checked)}
                        aria-label={label}
                    />
                </div>
            ))}
        </SettingsFieldset>
    );

        let encryptionSettings: JSX.Element | undefined;
        if (
            isEncrypted &&
            SettingsStore.canSetValue("blacklistUnverifiedDevices", this.props.room.roomId, SettingLevel.ROOM_DEVICE)
        ) {
            encryptionSettings = (
                <SettingsFlag
                    name="blacklistUnverifiedDevices"
                    level={SettingLevel.ROOM_DEVICE}
                    onChange={this.updateBlacklistDevicesFlag}
                    roomId={this.props.room.roomId}
                />
            );
        }

        const historySection = this.renderHistory();

        return (
            <SettingsTab>
                <Form.Root
                    onSubmit={(evt) => {
                        evt.preventDefault();
                        evt.stopPropagation();
                    }}
                >
                    <SettingsSection heading={_t("room_settings|security|title")}>
                        <SettingsFieldset
                            legend={_t("settings|security|encryption_section")}
                            description={
                                isEncryptionForceDisabled && !isEncrypted
                                    ? undefined
                                    : _t("room_settings|security|encryption_permanent")
                            }
                        >
                            {isEncryptionLoading ? (
                                <InlineSpinner />
                            ) : (
                                <>
                                    <SettingsToggleInput
                                        name="enable-encryption"
                                        checked={isEncrypted}
                                        onChange={this.onEncryptionChange}
                                        label={_t("common|encrypted")}
                                        disabled={!canEnableEncryption}
                                    />
                                    {isEncryptionForceDisabled && !isEncrypted && (
                                        <Caption>{_t("room_settings|security|encryption_forced")}</Caption>
                                    )}
                                    {isStateEncrypted && (
                                        <SettingsToggleInput
                                            name="enable-state-encryption"
                                            checked={isStateEncrypted}
                                            label={_t("common|state_encryption_enabled")}
                                            disabled={true}
                                        />
                                    )}
                                    {encryptionSettings}
                                </>
                            )}
                        </SettingsFieldset>
                        {this.renderJoinRule()}
                        <BusinessVisibilitySection room={this.props.room} />
                        {featuresSection}
                        {calendarSection}
                        {streamSection}
                        {historySection}
                    </SettingsSection>
                </Form.Root>
            </SettingsTab>
        );
    }
}
