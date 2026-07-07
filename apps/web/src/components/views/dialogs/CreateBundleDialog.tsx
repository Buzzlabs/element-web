import React from "react";
import { Form, IconButton, Text } from "@vector-im/compound-web";
import CloseIcon from "@vector-im/compound-design-tokens/assets/web/icons/close";

import Field from "../elements/Field";
import DialogButtons from "../elements/DialogButtons";
import BaseDialog from "../dialogs/BaseDialog";
import Spinner from "../elements/Spinner";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import {
    createBundle,
    updateBundle,
    discoverRooms,
    type BundleRoom,
    type DiscoverRoom,
} from "../../../bundles/bundleApi";

interface IProps {
    /** When set, the dialog edits this bundle instead of creating a new one. */
    bundleId?: string;
    defaultName?: string;
    defaultPrice?: number;
    defaultRooms?: BundleRoom[];
    onFinished(proceed?: boolean): void;
}

type View = "form" | "rooms";

interface IState {
    view: View;
    name: string;
    price: string;
    rooms: BundleRoom[];
    loading: boolean;
    error: string | null;
    nameError: string | null;
    priceError: string | null;
    roomsLoading: boolean;
    roomsError: string | null;
    discovered: DiscoverRoom[];
    tempSelected: Map<string, BundleRoom>;
}

/**
 * Dialog to create or edit a bundle exposed by the `bundle_service`
 * Synapse module. Mirrors {@link ../rooms/CreateRoomDialog} but targets
 * `/_synapse/bundles/create` (or `/update` when editing) instead of the
 * room creation API.
 *
 * The room picker is rendered as an internal "view" of this same dialog
 * (rather than a second, nested Modal) so selecting rooms never loses
 * the rest of the form state.
 */
export default class CreateBundleDialog extends React.Component<IProps, IState> {
    private readonly isEdit: boolean;

    public constructor(props: IProps) {
        super(props);
        this.isEdit = Boolean(props.bundleId);
        this.state = {
            view: "form",
            name: props.defaultName ?? "",
            // price is stored/edited in whole currency units in the UI; the API wants cents.
            price: props.defaultPrice != null ? (props.defaultPrice / 100).toString() : "",
            rooms: props.defaultRooms ?? [],
            loading: false,
            error: null,
            nameError: null,
            priceError: null,
            roomsLoading: false,
            roomsError: null,
            discovered: [],
            tempSelected: new Map(),
        };
    }

    private onNameChange = (ev: React.ChangeEvent<HTMLInputElement>): void => {
        this.setState({ name: ev.target.value, nameError: null });
    };

    private onPriceChange = (ev: React.ChangeEvent<HTMLInputElement>): void => {
        this.setState({ price: ev.target.value, priceError: null });
    };

    private removeRoom = (roomId: string): void => {
        this.setState((state) => ({ rooms: state.rooms.filter((r) => r.room_id !== roomId) }));
    };

    private openRoomPicker = (): void => {
        this.setState({
            view: "rooms",
            tempSelected: new Map(this.state.rooms.map((r) => [r.room_id, r])),
            roomsLoading: true,
            roomsError: null,
        });

        discoverRooms(MatrixClientPeg.safeGet())
            .then((discovered) => {
                this.setState({ discovered, roomsLoading: false });
            })
            .catch((e: Error) => {
                this.setState({ roomsError: e.message, roomsLoading: false });
            });
    };

    private toggleRoom = (room: BundleRoom): void => {
        this.setState((state) => {
            const next = new Map(state.tempSelected);
            if (next.has(room.room_id)) {
                next.delete(room.room_id);
            } else {
                next.set(room.room_id, room);
            }
            return { tempSelected: next };
        });
    };

    private removeHiddenSelected = (roomId: string): void => {
        this.setState((state) => {
            const next = new Map(state.tempSelected);
            next.delete(roomId);
            return { tempSelected: next };
        });
    };

    private confirmRoomPicker = (): void => {
        this.setState((state) => ({
            rooms: Array.from(state.tempSelected.values()),
            view: "form",
        }));
    };

    private cancelRoomPicker = (): void => {
        this.setState({ view: "form" });
    };

    private validate(): boolean {
        let valid = true;
        const name = this.state.name.trim();
        if (!name) {
            this.setState({ nameError: "Nome do bundle é obrigatório" });
            valid = false;
        }

        const priceValue = Number(this.state.price);
        if (this.state.price.trim() === "" || Number.isNaN(priceValue) || priceValue < 0) {
            this.setState({ priceError: "Preço inválido" });
            valid = false;
        }

        return valid;
    }

    private onOk = async (): Promise<void> => {
        if (!this.validate()) return;

        this.setState({ loading: true, error: null });

        const client = MatrixClientPeg.safeGet();
        const opts = {
            bundleName: this.state.name.trim(),
            price: Math.round(Number(this.state.price) * 100),
            rooms: this.state.rooms.map((r) => r.room_id),
        };

        try {
            if (this.isEdit && this.props.bundleId) {
                await updateBundle(client, { ...opts, bundleId: this.props.bundleId });
            } else {
                await createBundle(client, opts);
            }
            this.props.onFinished(true);
        } catch (e) {
            this.setState({ error: (e as Error).message, loading: false });
        }
    };

    private onCancel = (): void => {
        this.props.onFinished(false);
    };

    private renderForm(): React.ReactNode {
        return (
            <>
                <div className="mx_Dialog_content">
                    <Form.Root onSubmit={(e) => e.preventDefault()}>
                        <Field label="Nome do bundle" value={this.state.name} onChange={this.onNameChange} />
                        {this.state.nameError && <div className="mx_Field_error">{this.state.nameError}</div>}

                        <Field
                            label="Preço"
                            value={this.state.price}
                            onChange={this.onPriceChange}
                            className={this.state.priceError ? "mx_Field_invalid" : undefined}
                        />
                        {this.state.priceError && <div className="mx_Field_error">{this.state.priceError}</div>}

                        <div className="mx_CreateBundleDialog_rooms">
                            <p>
                                <strong>Salas incluídas (opcional)</strong>
                            </p>
                            {this.state.rooms.map((room) => (
                                <div
                                    key={room.room_id}
                                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                                >
                                    <span style={{ flex: 1 }}>{room.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => this.removeRoom(room.room_id)}
                                        aria-label="Remover sala"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            <button type="button" onClick={this.openRoomPicker}>
                                {this.state.rooms.length > 0
                                    ? `${this.state.rooms.length} sala(s) selecionada(s) — editar`
                                    : "+ Adicionar salas"}
                            </button>
                        </div>

                        {this.state.error && <div className="mx_Field_error">{this.state.error}</div>}
                    </Form.Root>
                </div>
                <DialogButtons
                    primaryButton={this.isEdit ? "Salvar alterações" : "Criar bundle"}
                    primaryDisabled={this.state.loading}
                    onPrimaryButtonClick={this.onOk}
                    onCancel={this.onCancel}
                />
            </>
        );
    }

    private renderRoomPicker(): React.ReactNode {
        const { discovered, tempSelected, roomsLoading, roomsError, rooms } = this.state;
        const discoveredIds = new Set(discovered.map((r) => r.room_id));
        const hiddenSelected = rooms.filter((r) => !discoveredIds.has(r.room_id) && tempSelected.has(r.room_id));

        return (
            <>
                <div className="mx_Dialog_content">
                    {roomsLoading && <Spinner />}
                    {roomsError && <Text as="p">{roomsError}</Text>}
                    {!roomsLoading && !roomsError && (
                        <div style={{ maxHeight: 400, overflowY: "auto" }}>
                            {hiddenSelected.map((room) => (
                                <div
                                    key={room.room_id}
                                    style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}
                                >
                                    <Text as="span" style={{ flex: 1 }}>
                                        {room.name} (indisponível)
                                    </Text>
                                    <IconButton size="24px" onClick={() => this.removeHiddenSelected(room.room_id)}>
                                        <CloseIcon />
                                    </IconButton>
                                </div>
                            ))}
                            {discovered.map((room) => (
                                <label
                                    key={room.room_id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        padding: "4px 0",
                                        cursor: "pointer",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={tempSelected.has(room.room_id)}
                                        onChange={() => this.toggleRoom(room)}
                                    />
                                    <span>{room.name}</span>
                                </label>
                            ))}
                            {discovered.length === 0 && (
                                <Text as="p">Nenhuma sala disponível para incluir no bundle.</Text>
                            )}
                        </div>
                    )}
                </div>
                <DialogButtons
                    primaryButton="Confirmar"
                    onPrimaryButtonClick={this.confirmRoomPicker}
                    onCancel={this.cancelRoomPicker}
                    cancelButton="Voltar"
                />
            </>
        );
    }

    public render(): React.ReactNode {
        const isRoomsView = this.state.view === "rooms";
        return (
            <BaseDialog
                className="mx_CreateBundleDialog"
                onFinished={this.props.onFinished}
                title={isRoomsView ? "Selecionar salas" : this.isEdit ? "Editar bundle" : "Criar bundle"}
            >
                {isRoomsView ? this.renderRoomPicker() : this.renderForm()}
            </BaseDialog>
        );
    }
}