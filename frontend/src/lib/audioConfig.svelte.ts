import { audioState } from "./audioState.svelte";
import { fetchWithSync } from "./utils/api";

class AudioConfig {
    async commitConfig(id: number | null) {
        const payload: any = {
            chL: parseInt(audioState.chL.toString()),
            chR: parseInt(audioState.chR.toString()),
            boost: parseFloat(audioState.boost.toString())
        };
        if (id !== null) {
            payload.deviceID = id;
        }

        await fetchWithSync("/api/audio/config", {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
    }

    async toggleRecording() {
        const action = audioState.isRecording ? "stop" : "start";
        await fetchWithSync("/api/recordings", {
            method: "POST",
            body: JSON.stringify({ action: action })
        });
    }


    async stopTranslation(language: string) {
        await fetchWithSync("/api/ai/streams", {
            method: "POST",
            body: JSON.stringify({ action: "stop_translation", language, subtitles: true })
        });
        await audioState.syncStatus();
    }

    async setGeminiMaster(enabled: boolean) {
        await fetchWithSync("/api/ai/streams", {
            method: "POST",
            body: JSON.stringify({ action: "toggle_master", Enabled: enabled })
        });
        await audioState.syncStatus();
    }
}

export const audioConfig = new AudioConfig();
