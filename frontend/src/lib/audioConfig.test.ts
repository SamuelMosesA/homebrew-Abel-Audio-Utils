import { describe, it, expect, vi, beforeEach } from 'vitest';
import { audioConfig } from './audioConfig.svelte';
import { audioState } from './audioState.svelte';

// Mock fetchWithSync
vi.mock('./utils/api', () => ({
    fetchWithSync: vi.fn().mockResolvedValue({ ok: true }),
}));

import { fetchWithSync } from './utils/api';

describe('AudioConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        audioState.chL = 1;
        audioState.chR = 2;
        audioState.boost = 1.0;
        audioState.isRecording = false;
    });

    it('should commit config correctly', async () => {
        await audioConfig.commitConfig(0);
        expect(fetchWithSync).toHaveBeenCalledWith('/api/audio/config', expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"chL":1')
        }));
    });

    it('should toggle recording from stop to start', async () => {
        audioState.isRecording = false;
        await audioConfig.toggleRecording();
        expect(fetchWithSync).toHaveBeenCalledWith('/api/recordings', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"action":"start"')
        }));
    });

    it('should set gemini master', async () => {
        await audioConfig.setGeminiMaster(true);
        expect(fetchWithSync).toHaveBeenCalledWith('/api/ai/streams', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"action":"toggle_master","Enabled":true')
        }));
    });
});
