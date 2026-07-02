import React from "react";
import { Form } from "@vector-im/compound-web";

import Field from "../elements/Field";
import DialogButtons from "../elements/DialogButtons";
import BaseDialog from "../dialogs/BaseDialog";
import Modal from "../../../Modal";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { createBundle, updateBundle, type BundleRoom } from "../../../bundles/bundleApi";
import BundleRoomPickerDialog from "./BundleRoomPickerDialog";

interface IProps {
    /** When set, the dialog edits this bundle instead of creating a new one. */
    bundleId?: string;
    defaultName?: string;
    defaultPrice?: number;
    defaultRooms?: BundleRoom[];
    onFinished(proceed?: boolean): void;
}

interface IState {
    name: string;
    price: string;
    rooms: BundleRoom[];
    loading: boolean;
    error: string | null;
    nameError: string | null;
    priceError: string | null;
}

/**
 * Dialog to create or edit a bundle exposed by the `bundle_service`
 * Synapse module. Mirrors {@link ../rooms/CreateRoomDialog} but targets
 * `/_synapse/bundles/create` (or `/update` when editing) instead of the
 * room creation API.
 */
export default class CreateBundleDialog extends React.Component<IProps, IState> {
    private readonly isEdit: boolean;

    public constructor(props: IProps) {
        super(props);
        this.isEdit = Boolean(props.bundleId);
        this.state = {
            name: props.defaultName ?? "",
            // price is stored/edited in whole currency units in the UI; the API wants cents.
            price: props.defaultPrice != null ? (props.defaultPrice / 100).toString() : "",
            rooms: props.defaultRooms ?? [],
            loading: false,
            error: null,
            nameError: null,
            priceError: null,
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
        Modal.createDialog(BundleRoomPickerDialog, {
            initialSelectedRooms: this.state.rooms,
        }).finished.then((args: unknown[]) => {
            const rooms = args[0] as BundleRoom[] | undefined;
            if (rooms) this.setState({ rooms });
        });
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

    public render(): React.ReactNode {
        return (
            <BaseDialog
                className="mx_CreateBundleDialog"
                onFinished={this.props.onFinished}
                title={this.isEdit ? "Editar bundle" : "Criar bundle"}
            >
                <div className="mx_Dialog_content">
                    <Form.Root onSubmit={(e) => e.preventDefault()}>
                        <Field
                            label="Nome do bundle"
                            value={this.state.name}
                            onChange={this.onNameChange}
                        />
                        {this.state.nameError && (
                            <div className="mx_Field_error">{this.state.nameError}</div>
                        )}

                        <Field
                            label="Preço"
                            value={this.state.price}
                            onChange={this.onPriceChange}
                            className={this.state.priceError ? "mx_Field_invalid" : undefined}
                        />
                        {this.state.priceError && (
                            <div className="mx_Field_error">{this.state.priceError}</div>
                        )}

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
                                + Adicionar salas
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
            </BaseDialog>
        );
    }
}