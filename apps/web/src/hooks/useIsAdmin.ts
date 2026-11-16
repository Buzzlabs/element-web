// hooks/useIsGlobalAdmin.ts

import { useEffect, useState } from "react";

import { isGlobalAdmin } from "../utils/admin/isGlobalAdmin";

export function useIsAdmin(): boolean {
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        isGlobalAdmin().then(setIsAdmin);
    }, []);

    return isAdmin;
}