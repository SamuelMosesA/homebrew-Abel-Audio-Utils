export interface Device {
    id: number;
    name: string;
    inputs: number;
}

export interface TranslationSession {
    language: string;
    listeners: number;
    subtitles: boolean;
}

export interface MeterState {
    L: number;
    R: number;
}

export interface AppStatus {
    isRunning: boolean;
    isRecording: boolean;
    deviceId: number;
    chL: number;
    chR: number;
    boost: number;
    storageLocation: string;
    cloudDriveLocation: string;
    translations: TranslationSession[];
    serverUrl: string;
    ssid: string;
    geminiMasterEnabled: boolean;
}

class AudioState {
    // Runes for reactive state
    isRunning = $state(false);
    isRecording = $state(false);
    wsConnected = $state(false);
    devices = $state<Device[]>([]);
    selectedDeviceId = $state(0);
    chL = $state(0);
    chR = $state(0);
    boost = $state(0);
    storageLocation = $state("");
    cloudDriveLocation = $state("");
    translations = $state<TranslationSession[]>([]);
    serverUrl = $state("");
    ssid = $state("");
    geminiMasterEnabled = $state(true);

    // Auth and Routing state
    isAuthenticated = $state(false);
    wasKicked = $state(false);
    currentView = $state<"landing" | "stream" | "admin">("landing");
    sessionId: string = "";
    
    // Notification state
    notification = $state<{ message: string, section: string } | null>(null);
    #notificationTimeout: any = null;

    #ws: WebSocket | null = null;
    #sse: EventSource | null = null;
    onMessage: ((dv: DataView) => void) | null = null;

    constructor() {
        this.sessionId = localStorage.getItem("session_id") || "";
        this.isAuthenticated = !!this.sessionId;
        this.fetchDevices();
        
        if (this.isAuthenticated) {
            this.setupSSE();
            this.syncConnection();
        }
    }


    setupSSE() {
        if (this.#sse) this.#sse.close();
        
        console.log("[SSE] Connecting to changelog...");
        // Use credentials for cross-origin if needed, but here mostly for session cookie
        this.#sse = new EventSource("/api/system/changelog", { withCredentials: true });
        
        this.#sse.onmessage = (event) => {
            try {
                const change = JSON.parse(event.data);
                if (change.sessionId !== this.sessionId) {
                    this.handleRemoteUpdate(change);
                }
            } catch (e) {
                console.error("[SSE] Error parsing change:", e);
            }
        };

        this.#sse.onerror = (e) => {
            console.error("[SSE] Error:", e);
            setTimeout(() => this.setupSSE(), 5000);
        };
    }

    handleRemoteUpdate(change: { section: string, sessionId: string }) {
        console.log(`[SSE] Remote update from ${change.sessionId} on ${change.section}`);
        
        // Modular update logic based on section
        const sections: Record<string, () => void> = {
            "interface": () => this.syncSettings(),
            "recording": () => this.syncSettings(),
            "gemini": () => this.syncGemini(),
        };

        if (sections[change.section]) {
            sections[change.section]();
        } else {
            this.syncSettings(); // Consolidated sync
        }

        // Show banner
        this.showNotification(`Session ${change.sessionId.slice(0, 4)} updated ${change.section}`, change.section);
    }

    showNotification(message: string, section: string) {
        if (this.#notificationTimeout) clearTimeout(this.#notificationTimeout);
        this.notification = { message, section };
        this.#notificationTimeout = setTimeout(() => {
            this.notification = null;
        }, 5000);
    }

    async syncSettings() {
        try {
            const res = await fetch("/api/audio/config", { credentials: "include" });
            if (res.ok) {
                const settings = await res.json();
                this.isRunning = settings.isRunning;
                this.isRecording = settings.isRecording;
                this.chL = settings.chL;
                this.chR = settings.chR;
                this.boost = settings.boost;
                this.selectedDeviceId = settings.deviceID;
                this.storageLocation = settings.storageLocation;
                this.cloudDriveLocation = settings.cloudDriveLocation;
            }
        } catch (e) {
            console.error("Error syncing settings", e);
        }
    }

    async syncGemini() {
        try {
            const res = await fetch("/api/ai/streams", { credentials: "include" });
            if (res.ok) {
                const gemini = await res.json();
                this.geminiMasterEnabled = gemini.masterEnabled;
                this.translations = gemini.sessions || [];
            }
        } catch (e) {
            console.error("Error syncing Gemini status", e);
        }
    }

    async syncConnection() {
        try {
            const res = await fetch("/api/system/connection", { credentials: "include" });
            if (res.ok) {
                const conn = await res.json();
                this.serverUrl = conn.serverUrl;
                this.ssid = conn.ssid;
            }
        } catch (e) {
            console.error("Error syncing connection", e);
        }
    }

    getHeaders() {
        const headers: Record<string, string> = {};
        return headers;
    }

    async fetchDevices() {
        try {
            const res = await fetch("/api/audio/devices", { credentials: "include" });
            this.devices = await res.json();
        } catch (e) {
            console.error("Error loading devices", e);
        }
    }

    async syncStatus() {
        // Monolithic sync deprecated, but kept as a wrapper for now to avoid breaking calls
        await Promise.all([this.syncSettings(), this.syncGemini()]);
    }

    connectWebSocket() {
        console.log("Attempting WebSocket connection...");
        if (this.#ws && (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING)) {
            console.log("WebSocket already open or connecting, skipping.");
            return;
        }
        
        this.wasKicked = false;

        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        let url = `${protocol}${window.location.host}/ws`;
        
        const pass = localStorage.getItem("admin_password");
        if (pass) {
            url += `?pass=${pass}&session=${this.sessionId}`;
        } else {
            console.warn("WebSocket attempted aborted: no admin password in storage");
            return;
        }

        console.log("Opening new WebSocket to:", url.split('?')[0]); // Hide pass in log
        this.#ws = new WebSocket(url);
        this.#ws.binaryType = "arraybuffer";

        this.#ws.onopen = () => {
            console.log(`WebSocket connected successfully`);
            this.wsConnected = true;
        };

        this.#ws.onmessage = (event: MessageEvent) => {
            if (event.data instanceof ArrayBuffer) {
                if (this.onMessage) {
                    const dv = new DataView(event.data);
                    this.onMessage(dv);
                }
            } else {
                try {
                    const msg = JSON.parse(event.data);
                    // Legacy message handling if any
                } catch (e) {
                    // Ignore
                }
            }
        };

        this.#ws.onclose = (event) => {
            console.log(`WebSocket closed (Code: ${event.code}, Reason: ${event.reason})`);
            this.wsConnected = false;
            // Only retry if we're still in admin view and NOT kicked
            if (this.currentView === "admin" && this.isAuthenticated && !this.wasKicked) {
                console.log("Auto-reconnecting in 2s...");
                setTimeout(() => this.connectWebSocket(), 2000);
            } else {
                console.log("Not reconnecting: view=" + this.currentView + ", auth=" + this.isAuthenticated + ", kicked=" + this.wasKicked);
            }
        };

        this.#ws.onerror = (e) => {
            console.error("WebSocket error:", e);
            this.wsConnected = false;
        };
    }

    async login(username: string, pass: string) {
        try {
            const res = await fetch("/api/auth/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password: pass }),
                credentials: "include"
            });

            if (res.ok) {
                const data = await res.json();
                localStorage.setItem("admin_user", username);
                localStorage.setItem("admin_password", pass);
                if (data.session) {
                    this.sessionId = data.session;
                    localStorage.setItem("session_id", data.session);
                }
                this.isAuthenticated = true;
                this.setupSSE(); // Re-establish SSE after login
                this.syncConnection(); // Fetch connection info once
                return true;
            } else if (res.status === 403 || res.status === 401) {
                alert("Invalid username or password.");
                return false;
            }
            return false;
        } catch (e) {
            console.error("Login error:", e);
            return false;
        }
    }

    logout() {
        localStorage.removeItem("admin_user");
        localStorage.removeItem("admin_password");
        localStorage.removeItem("session_id");
        this.isAuthenticated = false;
        this.sessionId = "";
        this.currentView = "landing";
        if (this.#ws) {
            this.#ws.close();
            this.#ws = null;
        }
        if (this.#sse) {
            this.#sse.close();
            this.#sse = null;
        }
    }
}

export const audioState = new AudioState();
