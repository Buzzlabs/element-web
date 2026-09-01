import { MatrixClientPeg } from "../../MatrixClientPeg";

function baseUrl(): string {
    return MatrixClientPeg.safeGet().getHomeserverUrl();
}

function authHeaders(): Record<string, string> {
    const accessToken = MatrixClientPeg.safeGet().getAccessToken();
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
    };
}

async function readError(res: Response): Promise<string | undefined> {
    try {
        const body = await res.clone().json();
        const err = body?.error ?? body?.message;
        return typeof err === "string" && err.length ? err : undefined;
    } catch {
        return undefined;
    }
}

export async function setUserAdmin(userId: string, admin: boolean): Promise<void> {
    const res = await fetch(
        `${baseUrl()}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`,
        {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ admin }),
        },
    );
    if (!res.ok) {
        // 403 = quem chamou não é admin; 400/404 = user inválido; etc.
        throw new Error((await readError(res)) ?? `Falha ao atualizar admin (status ${res.status})`);
    }
}