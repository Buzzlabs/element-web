import React from "react";
import { IconButton, Text } from "@vector-im/compound-web";
import CloseIcon from "@vector-im/compound-design-tokens/assets/web/icons/close";

import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import Spinner from "../elements/Spinner";
import Modal from "../../../Modal";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { listBundles, publishBundle, deleteBundle, type Bundle } from "../../../bundles/bundleApi";
import CreateBundleDialog from "./CreateBundleDialog";

interface IProps {
    onFinished(): void;
}

interface IState {
    bundles: Bundle[];
    loading: boolean;
    error: string | null;
    /** bundle_id currently running a publish/delete action, to show a per-row spinner and block double clicks. */
    busyBundleId: string | null;
}

function formatPrice(cents: number): string {
    return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

/**
 * Lets an admin see every bundle (drafts and published), create new ones,
 * edit, publish or delete existing ones. Backed by `bundleApi.ts`
 * (`/_synapse/bundles/list|publish|delete`).
 */
export default class ManageBundlesDialog extends React.Component<IProps, IState> {
    public constructor(props: IProps) {
        super(props);
        this.state = {
            bundles: [],
            loading: true,
            error: null,
            busyBundleId: null,
        };
    }

    public componentDidMount(): void {
        this.loadBundles();
    }

    private loadBundles = (): void => {
        this.setState({ loading: true, error: null });
        listBundles(MatrixClientPeg.safeGet())
            .then((bundles) => this.setState({ bundles, loading: false }))
            .catch((e: Error) => this.setState({ error: e.message, loading: false }));
    };

    private openCreate = (): void => {
        Modal.createDialog(CreateBundleDialog, {}).finished.then(() => this.loadBundles());
    };

    private openEdit = (bundle: Bundle): void => {
        Modal.createDialog(CreateBundleDialog, {
            bundleId: bundle.bundle_id,
            defaultName: bundle.bundle_name,
            defaultPrice: bundle.price,
            defaultRooms: bundle.rooms,
        }).finished.then(() => this.loadBundles());
    };

    private onPublish = (bundle: Bundle): void => {
        this.setState({ busyBundleId: bundle.bundle_id });
        publishBundle(MatrixClientPeg.safeGet(), bundle.bundle_id)
            .then(() => this.loadBundles())
            .catch((e: Error) => this.setState({ error: e.message }))
            .finally(() => this.setState({ busyBundleId: null }));
    };

    private onDelete = (bundle: Bundle): void => {
        // TODO: swap for Element's own confirmation dialog (e.g. QuestionDialog) if available in this fork.
        if (!window.confirm(`Apagar o bundle "${bundle.bundle_name}"? Essa ação não pode ser desfeita.`)) return;

        this.setState({ busyBundleId: bundle.bundle_id });
        deleteBundle(MatrixClientPeg.safeGet(), bundle.bundle_id)
            .then(() => this.loadBundles())
            .catch((e: Error) => this.setState({ error: e.message }))
            .finally(() => this.setState({ busyBundleId: null }));
    };

    public render(): React.ReactNode {
        const { bundles, loading, error, busyBundleId } = this.state;

        return (
            <BaseDialog
                className="mx_ManageBundlesDialog"
                onFinished={this.props.onFinished}
                title="Gerenciar bundles"
            >
                <div className="mx_Dialog_content">
                    <button type="button" onClick={this.openCreate}>
                        + Novo bundle
                    </button>

                    {loading && <Spinner />}
                    {error && <Text as="p">{error}</Text>}

                    {!loading && !error && bundles.length === 0 && (
                        <Text as="p">Nenhum bundle criado ainda.</Text>
                    )}

                    {!loading && !error && bundles.length > 0 && (
                        <div style={{ maxHeight: 420, overflowY: "auto" }}>
                            {bundles.map((bundle) => {
                                const isBusy = busyBundleId === bundle.bundle_id;
                                return (
                                    <div
                                        key={bundle.bundle_id}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "12px",
                                            padding: "8px 0",
                                            borderBottom: "1px solid var(--cpd-color-border-interactive-secondary)",
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div>
                                                <strong>{bundle.bundle_name}</strong>{" "}
                                                <span
                                                    style={{
                                                        fontSize: "12px",
                                                        color:
                                                            bundle.status === "published"
                                                                ? "var(--cpd-color-text-success-primary)"
                                                                : "var(--cpd-color-text-secondary)",
                                                    }}
                                                >
                                                    {bundle.status === "published" ? "publicado" : "rascunho"}
                                                </span>
                                            </div>
                                            <Text as="span" size="sm">
                                                {formatPrice(bundle.price)} · {bundle.rooms.length} sala(s)
                                            </Text>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => this.openEdit(bundle)}
                                        >
                                            Editar
                                        </button>

                                        {bundle.status === "draft" && (
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => this.onPublish(bundle)}
                                            >
                                                Publicar
                                            </button>
                                        )}

                                        <IconButton
                                            size="24px"
                                            disabled={isBusy}
                                            aria-label="Apagar bundle"
                                            onClick={() => this.onDelete(bundle)}
                                        >
                                            <CloseIcon />
                                        </IconButton>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <DialogButtons primaryButton="Fechar" onPrimaryButtonClick={this.props.onFinished} hasCancel={false} />
            </BaseDialog>
        );
    }
}