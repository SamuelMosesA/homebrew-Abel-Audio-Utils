package web

import (
	"behringerRecorder/lib/config"
	"behringerRecorder/lib/types"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func setupTestRouter(state *types.AppState, cfg *config.Config) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	store := cookie.NewStore([]byte("secret"))
	r.Use(sessions.Sessions("behringer_session", store))

	// Mock auth session if header is present
	r.Use(func(c *gin.Context) {
		if c.GetHeader("X-Test-Auth") == "true" {
			session := sessions.Default(c)
			session.Set("authenticated", true)
			session.Set("username", "admin")
			session.Save()
		}
		c.Next()
	})

	api := r.Group("/api")
	{
		api.POST("/auth/session", LoginHandler(cfg, state))
		RegisterAdminRoutes(api, state, cfg)
		api.GET("/recordings", GetRecordingStatus(state))
	}
	r.GET("/stream", StreamHandler(state, cfg))
	r.GET("/subtitles/:lang", SubtitlesHandler(state))
	
	return r
}



func TestLoginHandler(t *testing.T) {
	state := &types.AppState{}
	cfg := &config.Config{
		Credentials: map[string]string{"admin": "password"},
	}
	router := setupTestRouter(state, cfg)

	t.Run("Successful Login", func(t *testing.T) {
		body := map[string]string{"username": "admin", "password": "password"}
		jsonBody, _ := json.Marshal(body)
		req, _ := http.NewRequest("POST", "/api/auth/session", bytes.NewBuffer(jsonBody))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp map[string]string
		json.Unmarshal(w.Body.Bytes(), &resp)
		assert.Equal(t, "success", resp["status"])
		assert.NotEmpty(t, resp["session"])
	})

	t.Run("Failed Login", func(t *testing.T) {
		body := map[string]string{"username": "admin", "password": "wrong"}
		jsonBody, _ := json.Marshal(body)
		req, _ := http.NewRequest("POST", "/api/auth/session", bytes.NewBuffer(jsonBody))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestGetRecordingStatus(t *testing.T) {
	state := &types.AppState{
		IsRecording:  true,
		SamplesWrote: 1234,
	}
	cfg := &config.Config{}
	router := setupTestRouter(state, cfg)

	req, _ := http.NewRequest("GET", "/api/recordings", nil)
	req.Header.Set("X-Test-Auth", "true")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, true, resp["isRecording"])
	assert.Equal(t, float64(1234), resp["samples"])
}

func TestAdminRoutesProtection(t *testing.T) {
	state := &types.AppState{}
	cfg := &config.Config{}
	router := setupTestRouter(state, cfg)

	t.Run("Unauthorized Access", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/recordings/files", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}
func TestChangeLogHandler(t *testing.T) {
	state := &types.AppState{}
	cfg := &config.Config{}
	router := setupTestRouter(state, cfg)

	// Create a context that we can cancel to stop the SSE handler
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", "/api/system/changelog", nil)
	req.Header.Set("X-Test-Auth", "true")

	w := httptest.NewRecorder()

	// Use a goroutine to serve the request because ChangeLogHandler is a blocking loop
	go router.ServeHTTP(w, req)

	// Wait for the handler to register the channel
	time.Sleep(100 * time.Millisecond)

	// Trigger a state change
	state.UpdateState("test-session", "test-section", func() {})

	// Wait for the change to be broadcast
	time.Sleep(100 * time.Millisecond)
	cancel()

	// Note: In a real test we'd use a more sophisticated way to read the SSE stream
	// but for unit testing we can check if the channel was registered and cleaned up.
}

func TestStreamHandler(t *testing.T) {
	state := &types.AppState{}
	cfg := &config.Config{SampleRate: 48000}
	router := setupTestRouter(state, cfg)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", "/stream", nil)
	w := httptest.NewRecorder()

	go router.ServeHTTP(w, req)

	time.Sleep(100 * time.Millisecond)

	// Verify that a channel was registered
	found := false
	state.StreamChannels.Range(func(key, value interface{}) bool {
		found = true
		ch := key.(chan []float32)
		ch <- []float32{0.1, 0.1}

		return false
	})
	assert.True(t, found)
	time.Sleep(100 * time.Millisecond)
	cancel()
}

func TestListRecordingFiles(t *testing.T) {
	// Create a temp dir
	tmpDir, err := os.MkdirTemp("", "test_recordings_*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	// Create some dummy files
	os.WriteFile(tmpDir+"/rec1.wav", []byte("data"), 0644)
	os.WriteFile(tmpDir+"/rec2.wav", []byte("data"), 0644)

	state := &types.AppState{}
	cfg := &config.Config{StorageLocation: tmpDir}
	router := setupTestRouter(state, cfg)

	req, _ := http.NewRequest("GET", "/api/recordings/files", nil)
	req.Header.Set("X-Test-Auth", "true")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	
	type FileInfo struct {
		Name    string    `json:"name"`
		Size    int64     `json:"size"`
		ModTime time.Time `json:"modTime"`
	}

	var resp []FileInfo
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Len(t, resp, 2)
}


func TestUpdateAudioConfig(t *testing.T) {
	state := &types.AppState{}
	cfg := &config.Config{}
	router := setupTestRouter(state, cfg)

	body := map[string]interface{}{
		"chL":   1,
		"chR":   2,
		"boost": 2.5,
	}
	jsonBody, _ := json.Marshal(body)
	req, _ := http.NewRequest("PATCH", "/api/audio/config", bytes.NewBuffer(jsonBody))
	req.Header.Set("X-Test-Auth", "true")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, int32(1), state.ChLeft)
	assert.Equal(t, int32(2), state.ChRight)
	assert.Equal(t, 2.5, state.Boost)
}

func TestUpdateAIStreams(t *testing.T) {
	state := &types.AppState{
		IsRecording: true,
	}
	cfg := &config.Config{}
	
	mockTranslator := &MockTranslator{}
	state.Translator = mockTranslator

	router := setupTestRouter(state, cfg)

	body := map[string]interface{}{
		"action":  "toggle_master",
		"enabled": true,
	}
	jsonBody, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", "/api/ai/streams", bytes.NewBuffer(jsonBody))
	req.Header.Set("X-Test-Auth", "true")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestPushRecordingToCloud(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "test_push_*")
	defer os.RemoveAll(tmpDir)
	os.WriteFile(tmpDir+"/rec.wav", []byte("data"), 0644)

	state := &types.AppState{}
	cfg := &config.Config{
		StorageLocation:    tmpDir,
		CloudDriveLocation: tmpDir + "/cloud",
	}
	os.Mkdir(cfg.CloudDriveLocation, 0755)

	router := setupTestRouter(state, cfg)

	body := map[string]interface{}{
		"source": "rec.wav",
		"target": "pushed_rec.wav",
	}

	jsonBody, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", "/api/recordings/push", bytes.NewBuffer(jsonBody))
	req.Header.Set("X-Test-Auth", "true")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}


type MockTranslator struct {
	types.Translator
}

func (m *MockTranslator) SetEnabled(enabled bool) {}
func (m *MockTranslator) GetChannel(lang string) chan []float32 { return nil }
func (m *MockTranslator) ListSessions() []types.SessionInfo {
	return []types.SessionInfo{
		{Language: "English"},
		{Language: "Spanish"},
	}
}

