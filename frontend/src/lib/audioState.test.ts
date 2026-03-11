import { describe, it, expect, vi, beforeEach } from 'vitest';
import { audioState } from './audioState.svelte';

// Mock Global dependencies
global.fetch = vi.fn();
global.EventSource = vi.fn().mockImplementation(function() {
    return {
        close: vi.fn(),
        onmessage: null,
        onerror: null,
    };
}) as any;
(global.EventSource as any).CONNECTING = 0;
(global.EventSource as any).OPEN = 1;
(global.EventSource as any).CLOSED = 2;

global.WebSocket = vi.fn().mockImplementation(function() {
    return {
        readyState: 0,
        close: vi.fn(),
        send: vi.fn(),
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
    };
}) as any;
(global.WebSocket as any).CONNECTING = 0;
(global.WebSocket as any).OPEN = 1;
(global.WebSocket as any).CLOSING = 2;
(global.WebSocket as any).CLOSED = 3;




describe('AudioState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // Reset singleton state manually since it's a singleton
        audioState.isAuthenticated = false;
        audioState.sessionId = '';
        audioState.isRunning = false;
        audioState.isRecording = false;
        audioState.translations = [];
    });

    it('should initialize with default values', () => {
        expect(audioState.isAuthenticated).toBe(false);
        expect(audioState.wsConnected).toBe(false);
    });

    it('should handle login successfully', async () => {
        const mockResponse = { session: 'test-session' };
        (fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await audioState.login('admin', 'password');

        expect(result).toBe(true);
        expect(audioState.isAuthenticated).toBe(true);
        expect(audioState.sessionId).toBe('test-session');
    });

    it('should handle failed login', async () => {
        (fetch as any).mockResolvedValue({
            ok: false,
            status: 401,
        });

        const result = await audioState.login('admin', 'wrong');

        expect(result).toBe(false);
        expect(audioState.isAuthenticated).toBe(false);
    });

    it('should sync settings correctly', async () => {
        const mockSettings = {
            isRunning: true,
            isRecording: false,
            chL: 1,
            chR: 2,
            boost: 1.5,
            deviceID: 0,
            storageLocation: '/tmp',
            cloudDriveLocation: '/cloud'
        };
        (fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockSettings,
        });

        await audioState.syncSettings();

        expect(audioState.isRunning).toBe(true);
        expect(audioState.chL).toBe(1);
    });

    it('should logout correctly', () => {
        localStorage.setItem('session_id', 'test-session');
        audioState.isAuthenticated = true;
        audioState.sessionId = 'test-session';

        audioState.logout();

        expect(audioState.isAuthenticated).toBe(false);
        expect(audioState.sessionId).toBe('');
    });

    it('should handle SSE messages correctly', async () => {
        audioState.sessionId = 'test-session';
        
        // Trigger setupSSE
        audioState.setupSSE();
        
        const instances = (global.EventSource as any).mock.instances;
        const sseInstance = instances[instances.length - 1];
        
        const mockSyncSettings = vi.spyOn(audioState, 'syncSettings').mockResolvedValue(undefined);
        
        // Simulate a message from a different session
        const eventData = JSON.stringify({ sessionId: 'other-session', section: 'interface' });
        sseInstance.onmessage({ data: eventData });

        expect(mockSyncSettings).toHaveBeenCalled();
        expect(audioState.notification).not.toBeNull();
        expect(audioState.notification?.section).toBe('interface');
    });

    it('should handle WebSocket connection', () => {
        localStorage.setItem("admin_password", "secret");
        audioState.sessionId = "test-session";
        
        audioState.connectWebSocket();
        
        const instances = (global.WebSocket as any).mock.instances;
        const wsInstance = instances[instances.length - 1];
        wsInstance.onopen();
        
        expect(audioState.wsConnected).toBe(true);

        wsInstance.onclose({ code: 1000, reason: "normal" } as any);
        expect(audioState.wsConnected).toBe(false);
    });

    it('should sync Gemini status correctly', async () => {
        const mockGemini = {
            masterEnabled: true,
            sessions: [{ language: 'Tamil', listeners: 5, subtitles: true }]
        };
        (fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockGemini,
        });

        await audioState.syncGemini();

        expect(audioState.geminiMasterEnabled).toBe(true);
        expect(audioState.translations).toHaveLength(1);
        expect(audioState.translations[0].language).toBe('Tamil');
    });

    it('should sync connection info correctly', async () => {
        const mockConn = {
            serverUrl: 'http://192.168.1.10:8080',
            ssid: 'MyWiFi'
        };
        (fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockConn,
        });

        await audioState.syncConnection();

        expect(audioState.serverUrl).toBe('http://192.168.1.10:8080');
        expect(audioState.ssid).toBe('MyWiFi');
    });

    it('should fetch devices correctly', async () => {
        const mockDevices = [
            { id: 0, name: 'Built-in Mic', inputs: 2 }
        ];
        (fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockDevices,
        });

        await audioState.fetchDevices();

        expect(audioState.devices).toHaveLength(1);
        expect(audioState.devices[0].name).toBe('Built-in Mic');
    });
});


