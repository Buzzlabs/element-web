import React, { useCallback, useEffect, useState } from "react";
import { EventType, JoinRule, MatrixEvent, RoomStateEvent, type Room } from "matrix-js-sdk/src/matrix";
import { SettingsToggleInput } from "@vector-im/compound-web";

import Modal from "../../../../../Modal";
import ErrorDialog from "../../../dialogs/ErrorDialog";
import Field from "../../../elements/Field";
import AccessibleButton from "../../../elements/AccessibleButton";
import Spinner from "../../../elements/Spinner";
import SettingsFieldset from "../../SettingsFieldset";
import { changeAccessType, changePrice, changeVisibility, getRoomVisibility } from "../../../../../utils/admin/roomBusiness";
import { useIsAdmin } from "../../../../../hooks/useIsAdmin";

interface IProps {
    room: Room;
}

function translateError(message: string): string {
    switch (message) {
        case "Cannot set price on a non-visible room":
            return "Essa sala está invisível e não pode ter preço";
        case "Public rooms cannot have a price":
            return "Salas públicas não podem ter preço";
        case "Private visible rooms must have price > 0":
            return "Salas privadas precisam de um preço maior que zero";
        case "Missing price: private visible rooms must define a price":
            return "Preço obrigatório para chats privados visíveis";
        default:
            return message;
    }
}

export const BusinessVisibilitySection: React.FC<IProps> = ({ room }) => {
    const isAdmin = useIsAdmin();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [visible, setVisible] = useState(false);
    const [priceReais, setPriceReais] = useState("0");

    const isPublic = room.getJoinRule() === JoinRule.Public;

    const reload = useCallback(async (): Promise<void> => {
        try {
            const info = await getRoomVisibility(room.roomId);
            setVisible(info.visible);
            setPriceReais(String(info.price / 100));
        } catch (e) {
            console.error("Failed to load room visibility", e);
        } finally {
            setLoading(false);
        }
    }, [room.roomId]);

    useEffect(() => {
        reload();
    }, [reload]);

    useEffect(() => {
        let last: "public" | "private" | undefined;
        const onState = async (e: MatrixEvent): Promise<void> => {
            if (e.getRoomId() !== room.roomId || e.getType() !== EventType.RoomJoinRules) return;

            const accessType: "public" | "private" =
                room.getJoinRule() === JoinRule.Public ? "public" : "private";
            if (last === accessType) return;
            last = accessType;

            try {
                const newPrice = await changeAccessType(room.roomId, accessType);
                if (newPrice !== null) setPriceReais(String(newPrice / 100));
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error("Failed to sync access type", err);
            }
        };
        room.client.on(RoomStateEvent.Events, onState);
        return () => {
            room.client.off(RoomStateEvent.Events, onState);
        };
    }, [room]);

    if (!isAdmin) return null;
    if (loading) return <Spinner />;

    const showError = (message: string): void => {
        Modal.createDialog(ErrorDialog, {
            title: "Erro",
            description: translateError(message),
        });
    };

    const onToggleVisible = async (next: boolean): Promise<void> => {
        let priceCents: number;

        if (!next) {
            priceCents = 0;
        } else if (isPublic) {
            // pública visível: preço sempre 0
            priceCents = 0;
        } else {
            // privada visível: preço obrigatório > 0
            const parsed = parseInt(priceReais.trim(), 10);
            if (isNaN(parsed) || parsed <= 0) {
                showError("Missing price: private visible rooms must define a price");
                return;
            }
            priceCents = parsed * 100;
        }

        setSaving(true);
        try {
            await changeVisibility(room.roomId, next, priceCents);
            setVisible(next);
            if (!next) setPriceReais("0");
        } catch (e) {
            showError(e instanceof Error ? e.message : "Não foi possível alterar a visibilidade");
        } finally {
            setSaving(false);
        }
    };

    const onSavePrice = async (): Promise<void> => {
        const parsed = parseInt(priceReais.trim(), 10);
        if (isNaN(parsed) || parsed < 0) {
            showError("Preço inválido");
            return;
        }
        setSaving(true);
        try {
            await changePrice(room.roomId, parsed * 100);
        } catch (e) {
            showError(e instanceof Error ? e.message : "Não foi possível alterar o preço");
        } finally {
            setSaving(false);
        }
    };

    const priceEditable = !isPublic;
    const canSavePrice = visible && !isPublic;

    let helperText: string;
    if (!visible) {
        helperText = "Preço será usado quando o chat ficar visível";
    } else if (isPublic) {
        helperText = "Salas públicas sempre custam 0";
    } else {
        helperText = "Preço obrigatório para chats privados visíveis";
    }

    const domain = room.client.getDomain();

    return (
        <SettingsFieldset legend="Visibilidade e preço">
            <SettingsToggleInput
                name="business-visibility"
                checked={visible}
                disabled={saving}
                onChange={(e) => onToggleVisible(e.target.checked)}
                label={`Chat pode ser descoberto na busca em ${domain ?? "este servidor"}`}
            />

            <Field
                type="number"
                label="Preço do chat (R$)"
                value={priceReais}
                disabled={!priceEditable || saving}
                onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setPriceReais(e.target.value)}
                min={0}
            />
            <div className="mx_SettingsTab_subsectionText">{helperText}</div>

            {canSavePrice && (
                <AccessibleButton kind="primary" disabled={saving} onClick={onSavePrice}>
                    {saving ? "Salvando..." : "Salvar preço"}
                </AccessibleButton>
            )}
        </SettingsFieldset>
    );
};