// ===================================================================
// StreamConfigDialog — popup com 2 abas: "Canal próprio" e "YouTube"
// Arquivo: components/views/dialogs/StreamConfigDialog.tsx (novo)
//
// Segue o mesmo padrão do DesktopCapturerSourcePicker: BaseDialog +
// TabbedView (nativo do Element) + DialogButtons.
//
// Ao abrir, busca a config atual da sala (getStream) e já deixa a aba
// certa selecionada com os dados preenchidos. Ao salvar, chama setStream
// com o provider da aba ativa.
// ===================================================================

import React, { useEffect, useState } from "react";

import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import Field from "../elements/Field";
import TabbedView, { Tab, TabLocation } from "../../structures/TabbedView";
import { type NonEmptyArray } from "../../../@types/common";
import { getStream, setStream } from "../../../utils/admin/roomFeatures";

enum StreamProviderTab {
    Fixed = "fixed",
    Youtube = "youtube",
}

interface IProps {
    roomId: string;
    onFinished(this: void, changed?: boolean): void;
}

const StreamConfigDialog: React.FC<IProps> = ({ roomId, onFinished }) => {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [activeTab, setActiveTab] = useState<StreamProviderTab>(StreamProviderTab.Fixed);
    const [playbackUrl, setPlaybackUrl] = useState("");
    const [error, setError] = useState<string | null>(null);

    // carrega a config atual da sala ao abrir, e já seleciona a aba certa
    useEffect(() => {
        getStream(roomId)
            .then((info) => {
                setActiveTab(info.provider === "youtube" ? StreamProviderTab.Youtube : StreamProviderTab.Fixed);
                setPlaybackUrl(info.playback_url ?? "");
            })
            .catch(() => {
                // sala ainda não configurada: fica no default (Fixed, vazio)
            })
            .finally(() => setLoading(false));
    }, [roomId]);

    const onSave = async (): Promise<void> => {
        setError(null);

        if (activeTab === StreamProviderTab.Fixed && !playbackUrl.trim()) {
            setError("Informe a URL de reprodução (HLS).");
            return;
        }

        setBusy(true);
        try {
            await setStream(roomId, activeTab === StreamProviderTab.Fixed ? playbackUrl.trim() : "", activeTab);
            onFinished(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Não foi possível salvar a configuração.");
        } finally {
            setBusy(false);
        }
    };

    const fixedTabContent = (
        <div className="mx_StreamConfigDialog_tabContent">
            <p>URL de reprodução (HLS) do canal usado para transmitir ao vivo nesta sala.</p>
            <Field
                label="URL de reprodução"
                placeholder="https://exemplo.com/live/canal.m3u8"
                value={playbackUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPlaybackUrl(e.target.value)}
                disabled={busy}
                autoComplete="off"
            />
        </div>
    );

    const youtubeTabContent = (
        <div className="mx_StreamConfigDialog_tabContent">
            <p>
                As transmissões desta sala serão criadas automaticamente no canal do YouTube da Radio Hemp. Ao
                iniciar, você receberá a chave para configurar no OBS — nenhuma configuração adicional é necessária
                aqui.
            </p>
        </div>
    );

    const tabs: NonEmptyArray<Tab<StreamProviderTab>> = [
        new Tab(StreamProviderTab.Fixed, "Canal próprio" as any, null, fixedTabContent),
        new Tab(StreamProviderTab.Youtube, "YouTube" as any, null, youtubeTabContent),
    ];

    return (
        <BaseDialog
            className="mx_StreamConfigDialog"
            onFinished={() => onFinished(false)}
            title="Configurar transmissão"
        >
            {loading ? (
                <p>Carregando…</p>
            ) : (
                <>
                    <TabbedView
                        tabs={tabs}
                        tabLocation={TabLocation.TOP}
                        activeTabId={activeTab}
                        onChange={(tabId) => setActiveTab(tabId as StreamProviderTab)}
                    />

                    {error && (
                        <div
                            role="alert"
                            style={{
                                color: "var(--cpd-color-text-critical-primary, #d00)",
                                fontSize: "14px",
                                marginTop: "8px",
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <DialogButtons
                        primaryButton={busy ? "Salvando…" : "Salvar"}
                        primaryDisabled={busy}
                        hasCancel={true}
                        onCancel={() => onFinished(false)}
                        onPrimaryButtonClick={onSave}
                    />
                </>
            )}
        </BaseDialog>
    );
};

export default StreamConfigDialog;