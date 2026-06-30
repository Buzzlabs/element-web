import React, { useState } from "react";

import { _t } from "../../../../../languageHandler";
import AccessibleButton from "../../../elements/AccessibleButton";
import { SettingsSubsection } from "../../shared/SettingsSubsection";
import { useIsAdmin } from "../../../../../hooks/useIsAdmin";
import { deleteRoom } from "../../../../../utils/admin/deleteRoom";

interface IProps {
    roomId: string;
    onFinished?: () => void;
}

export const DeleteRoomSection: React.FC<IProps> = ({ roomId, onFinished }) => {
    const isAdmin = useIsAdmin();
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // não-admins não veem a seção
    if (!isAdmin) return null;

    const onDelete = async (): Promise<void> => {
        setDeleting(true);
        try {
            await deleteRoom(roomId);
            onFinished?.();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Falha ao deletar a sala", e);
        } finally {
            setDeleting(false);
            setConfirming(false);
        }
    };

    return (
        <SettingsSubsection heading="Deletar sala">
            <AccessibleButton kind="danger" disabled={deleting} onClick={() => setConfirming(true)}>
                {deleting ? "Deletando..." : "Deletar sala"}
            </AccessibleButton>

            {confirming && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 5000,
                    }}
                    onClick={() => !deleting && setConfirming(false)}
                >
                    <div
                        style={{
                            background: "var(--cpd-color-bg-canvas-default, #fff)",
                            color: "var(--cpd-color-text-primary, #000)",
                            padding: "24px",
                            borderRadius: "8px",
                            minWidth: "300px",
                            maxWidth: "90vw",
                            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ marginTop: 0 }}>Deletar esta sala?</h3>
                        <p>
                            Esta ação é permanente. Todos os membros serão removidos e a sala não
                            poderá ser recuperada.
                        </p>
                        <div
                            style={{
                                display: "flex",
                                gap: "8px",
                                justifyContent: "flex-end",
                                marginTop: "16px",
                            }}
                        >
                            <AccessibleButton
                                kind="secondary"
                                disabled={deleting}
                                onClick={() => setConfirming(false)}
                            >
                                Cancelar
                            </AccessibleButton>
                            <AccessibleButton kind="danger" disabled={deleting} onClick={onDelete}>
                                {deleting ? "Deletando..." : "Deletar"}
                            </AccessibleButton>
                        </div>
                    </div>
                </div>
            )}
        </SettingsSubsection>
    );
};