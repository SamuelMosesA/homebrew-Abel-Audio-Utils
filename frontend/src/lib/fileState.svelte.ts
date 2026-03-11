export interface RecordedFile {
    name: string;
    size: number;
    modTime: string;
}

class FileState {
    recordedFiles = $state<RecordedFile[]>([]);
    storageLocation = $state("");
    cloudDriveLocation = $state("");

    constructor() {
        this.fetchFiles();
        this.startLoopSync();
    }

    #loopInterval: any = null;
    startLoopSync() {
        if (this.#loopInterval) clearInterval(this.#loopInterval);
        this.#loopInterval = setInterval(() => {
            this.fetchFiles();
        }, 10000); // 10s is plenty for file list refresh
    }

    async fetchFiles() {
        try {
            const res = await fetch("/api/recordings/files", { credentials: "include" });
            if (res.ok) {
                this.recordedFiles = await res.json();
                // Sort by modTime descending (newest first)
                this.recordedFiles.sort((a, b) => new Date(b.modTime).getTime() - new Date(a.modTime).getTime());
            }
        } catch (e) {
            console.error("Error fetching files", e);
        }
    }

    async pushToCloud(source: string, target: string) {
        try {
            const res = await fetch("/api/recordings/push", {
                method: "POST",
                body: JSON.stringify({ source, target }),
                credentials: "include"
            });
            if (res.ok) {
                return { success: true };
            } else {
                const err = await res.text();
                return { success: false, error: err };
            }
        } catch (e) {
            console.error("Error pushing to cloud", e);
            return { success: false, error: String(e) };
        }
    }
}

export const fileState = new FileState();
