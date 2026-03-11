import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginView from './LoginView.svelte';
import { audioState } from '$lib/audioState.svelte';

// Mock navigation
vi.mock('$app/navigation', () => ({
    goto: vi.fn(),
}));

import { goto } from '$app/navigation';

describe('LoginView.svelte', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        audioState.isAuthenticated = false;
    });

    it('should render login form', () => {
        render(LoginView);
        expect(screen.getByText(/Administrator Access/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Access Key/i)).toBeInTheDocument();
    });

    it('should handle successful login', async () => {
        vi.spyOn(audioState, 'login').mockResolvedValue(true);
        render(LoginView);
        
        const usernameInput = screen.getByLabelText(/Username/i);
        const passwordInput = screen.getByLabelText(/Access Key/i);
        const loginButton = screen.getByText(/Unlock Audio Console/i);

        await fireEvent.input(usernameInput, { target: { value: 'admin' } });
        await fireEvent.input(passwordInput, { target: { value: 'password' } });
        await fireEvent.click(loginButton);

        expect(audioState.login).toHaveBeenCalledWith('admin', 'password');
        expect(goto).toHaveBeenCalledWith('/admin');
    });

    it('should show error on failed login', async () => {
        vi.spyOn(audioState, 'login').mockResolvedValue(false);
        render(LoginView);
        
        const loginButton = screen.getByText(/Unlock Audio Console/i);

        await fireEvent.input(screen.getByLabelText(/Username/i), { target: { value: 'admin' } });
        await fireEvent.input(screen.getByLabelText(/Access Key/i), { target: { value: 'wrong' } });
        await fireEvent.click(loginButton);

        expect(screen.getByText(/Invalid administrator credentials/i)).toBeInTheDocument();
    });
});
