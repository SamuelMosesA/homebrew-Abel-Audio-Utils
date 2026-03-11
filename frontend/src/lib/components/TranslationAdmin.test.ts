import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TranslationAdmin from './TranslationAdmin.svelte';
import { audioState } from '$lib/audioState.svelte';
import { audioConfig } from '$lib/audioConfig.svelte';

// Mock audioConfig actions
vi.mock('$lib/audioConfig.svelte', () => ({
    audioConfig: {
        setGeminiMaster: vi.fn(),
        stopTranslation: vi.fn(),
    }
}));

// Mock audioState (it's a partial mock since we use the runes)
// Note: Svelte 5 runes might need special handling in tests, but let's try standard approach first.

describe('TranslationAdmin.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset audioState
        audioState.geminiMasterEnabled = true;
        audioState.translations = [];
    });

    it('should show "No active translation sessions" when translations list is empty', () => {
        render(TranslationAdmin);
        expect(screen.getByText(/No active translation sessions/i)).toBeInTheDocument();
    });

    it('should render active translation sessions', () => {
        audioState.translations = [
            { language: 'tamil', listeners: 1, subtitles: true }
        ];
        render(TranslationAdmin);
        expect(screen.getByText(/tamil/i)).toBeInTheDocument();
        expect(screen.getByText(/Subtitles ON/i)).toBeInTheDocument();
    });

    it('should call toggleMaster when Disable Gemini button is clicked', async () => {
        audioState.geminiMasterEnabled = true;
        render(TranslationAdmin);
        
        const button = screen.getByText(/Disable Gemini/i);
        await fireEvent.click(button);
        
        expect(audioConfig.setGeminiMaster).toHaveBeenCalledWith(false);
    });

    it('should show "Kill" button on hover (simulated by rendering)', () => {
        audioState.translations = [
            { language: 'tamil', listeners: 1, subtitles: true }
        ];
        render(TranslationAdmin);
        
        const killButton = screen.getByText(/Kill/i);
        expect(killButton).toBeInTheDocument();
    });
});
