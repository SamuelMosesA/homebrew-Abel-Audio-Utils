import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MeterPanel from './MeterPanel.svelte';
import { audioVisuals } from '../audioVisuals.svelte';

describe('MeterPanel.svelte', () => {
    beforeEach(() => {
        // Reset or set initial values for audioVisuals
        audioVisuals.currentDb.L = -100;
        audioVisuals.currentDb.R = -100;
        audioVisuals.currentMeters.L = 0;
        audioVisuals.currentMeters.R = 0;
    });

    it('should render silence initially (minus infinity)', () => {
        render(MeterPanel);
        const labels = screen.getAllByText('−∞');
        expect(labels).toHaveLength(2);
    });

    it('should update display when currentDb changes', async () => {
        render(MeterPanel);
        
        audioVisuals.currentDb.L = -12.5;
        audioVisuals.currentDb.R = -45.2;

        expect(await screen.findByText('-12.5 dB')).toBeInTheDocument();
        expect(await screen.findByText('-45.2 dB')).toBeInTheDocument();
    });

    it('should show red text when dB is near peak', async () => {
        render(MeterPanel);
        
        audioVisuals.currentDb.L = -2.5; // near peak (> -3)
        
        const label = await screen.findByText('-2.5 dB');
        expect(label).toHaveClass('text-destructive');
    });
});
