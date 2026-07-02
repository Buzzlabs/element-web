import React, { useEffect, useState } from "react";
import { IconButton, Text } from "@vector-im/compound-web";
import CloseIcon from "@vector-im/compound-design-tokens/assets/web/icons/close";

import BaseDialog from "../dialogs/BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import Spinner from "../elements/Spinner";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { discoverRooms, type DiscoverRoom, type BundleRoom } from "../../../bundles/bundleApi";

interface IProps {
    /** Rooms already attached to the bundle (may include rooms no longer discoverable). */
    initialSelectedRooms: BundleRoom[];
    onFinished(rooms?: BundleRoom[]): void;
}

/**
 * Lets the user pick which rooms belong to a bundle. Rooms previously
 * selected but no longer returned by the discover endpoint are shown
 * as "unavailable" so they aren't silently dropped, same behaviour as
 * the FluffyChat picker.
 */
export default function BundleRoomPickerDialog({ initialSelectedRooms, onFinished }: IProps): React.JSX.Element {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rooms, setRooms] = useState<DiscoverRoom[]>([]);
    const [selected, setSelected] = useState<Map<string, BundleRoom>>(
        new Map(initialSelectedRooms.map((r) => [r.room_id, r])),
    );

    useEffect(() => {
        let cancelled = false;
        (async (): Promise<void> => {
            try {
                const discovered = await discoverRooms(MatrixClientPeg.safeGet());
                if (!cancelled) setRooms(discovered);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const discoveredIds = new Set(rooms.map((r) => r.room_id));
    const hiddenRooms = initialSelectedRooms.filter((r) => !discoveredIds.has(r.room_id));

    const toggle = (room: BundleRoom): void => {
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(room.room_id)) {
                next.delete(room.room_id);
            } else {
                next.set(room.room_id, room);
            }
            return next;
        });
    };

    const removeHidden = (roomId: string): void => {
        setSelected((prev) => {
            const next = new Map(prev);
            next.delete(roomId);
            return next;
        });
    };

    return (
        <BaseDialog title="Selecionar salas" onFinished={() => onFinished()}>
            <div className="mx_Dialog_content">
                {loading && <Spinner />}
                {error && <Text as="p">{error}</Text>}
                {!loading && !error && (
                    <div style={{ maxHeight: 400, overflowY: "auto" }}>
                        {hiddenRooms
                            .filter((r) => selected.has(r.room_id))
                            .map((room) => (
                                <div
                                    key={room.room_id}
                                    style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}
                                >
                                    <Text as="span" style={{ flex: 1 }}>
                                        {room.name} (indisponível)
                                    </Text>
                                    <IconButton size="24px" onClick={() => removeHidden(room.room_id)}>
                                        <CloseIcon />
                                    </IconButton>
                                </div>
                            ))}
                        {rooms.map((room) => (
                            <label
                                key={room.room_id}
                                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", cursor: "pointer" }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(room.room_id)}
                                    onChange={() => toggle(room)}
                                />
                                <span>{room.name}</span>
                            </label>
                        ))}
                        {rooms.length === 0 && <Text as="p">Nenhuma sala disponível para incluir no bundle.</Text>}
                    </div>
                )}
            </div>
            <DialogButtons
                primaryButton="Confirmar"
                onPrimaryButtonClick={() => onFinished(Array.from(selected.values()))}
                onCancel={() => onFinished()}
            />
        </BaseDialog>
    );
}