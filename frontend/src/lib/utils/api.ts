import { audioState } from "../audioState.svelte";

/**
 * Utility to perform an API call and immediately sync the application state.
 */
export async function fetchWithSync(url: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers || {});
    
    const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include"
    });
    
    if (response.ok) {
        // Only sync if it's NOT a get request (to avoid infinite loops or redundant fetches)
        // Actually fetchWithSync is usually called on POST/PUT
        if (options.method && options.method !== "GET") {
            await audioState.syncStatus();
        }
    } else if (response.status === 401) {
        console.warn("Unauthorized API call, logging out...");
        audioState.logout();
    }
    
    return response;
}
