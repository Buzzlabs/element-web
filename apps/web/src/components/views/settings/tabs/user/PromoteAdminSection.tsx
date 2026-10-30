import React, { useState } from "react";

import Modal from "../../../../../Modal";
import QuestionDialog from "../../../dialogs/QuestionDialog";
import Field from "../../../elements/Field";
import AccessibleButton from "../../../elements/AccessibleButton";
import { setUserAdmin } from "../../../../../utils/admin/users";
import { useIsAdmin } from "../../../../../hooks/useIsAdmin";
import { SettingsSubsection } from "../../shared/SettingsSubsection";
import { SettingsSection } from "../../shared/SettingsSection";
import ErrorDialog from "../../../dialogs/ErrorDialog";
import { _t } from "../../../../../languageHandler";


export const PromoteAdminSection: React.FC = () => {
    const isAdmin = useIsAdmin();

    const [userId, setUserId] = useState("");
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

    // só admin vê a seção; o backend também recheca
    if (!isAdmin) return null;

    const onPromoteClick = (): void => {
    const target = userId.trim();
    if (!target) {
        setFeedback({ ok: false, msg: _t("buzzlabs|promote_admin_missing_id") });
        return;
    }

        const { finished } = Modal.createDialog(QuestionDialog, {
            title: "Promover a administrador global?",
            description: `Tem certeza que deseja tornar ${target} um administrador global?`,
            button: "Promover",
        });

        finished.then(async ([confirmed]) => {
            if (!confirmed) return;
            setBusy(true);
            setFeedback(null);
            try {
                await setUserAdmin(target, true);
                setUserId("");
                Modal.createDialog(ErrorDialog, {
                    title: _t("buzzlabs|promote_admin_success_title"),
                    description: _t("buzzlabs|promote_admin_done", { target }),
                });
            } catch (e) {
                setFeedback({ ok: false, msg: e instanceof Error ? e.message : _t("buzzlabs|promote_admin_failed") });
            } finally {
                setBusy(false);
            }
        });
    };

    return (
        <SettingsSection heading={_t("buzzlabs|promote_admin_heading")}>
            <SettingsSubsection
                heading={_t("buzzlabs|promote_admin_subheading")}
                description={_t("buzzlabs|promote_admin_description")}
            >
                <Field
                    label={_t("buzzlabs|promote_admin_user_id_label")}
                    placeholder={_t("buzzlabs|promote_admin_user_id_placeholder")}
                    value={userId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserId(e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                />

                {feedback && (
                    <div role="alert" style={{ marginTop: "8px", fontSize: "14px",
                        color: feedback.ok
                            ? "var(--cpd-color-text-success-primary, #0a0)"
                            : "var(--cpd-color-text-critical-primary, #d00)" }}>
                        {feedback.msg}
                    </div>
                )}

                <div style={{ marginTop: "12px" }}>
                    <AccessibleButton kind="primary" disabled={busy} onClick={onPromoteClick}>
                        {busy ? "Promovendo…" : "Promover a admin"}
                    </AccessibleButton>
                </div>
            </SettingsSubsection>
        </SettingsSection>
    );
};