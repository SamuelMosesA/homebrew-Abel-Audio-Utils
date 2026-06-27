package audioengine

import (
	"abel/src/backend/lib/config"
	"abel/src/backend/lib/state"
	"abel/src/backend/lib/telemetry"
	"context"
	"fmt"
	"log/slog"
	"time"

	pa "github.com/gordonklaus/portaudio"
)

func StartAudioEngine(streamer AudioStreamer, appState *state.AppState, cfg *config.Config, deviceID int, recordChan chan<- []float32, playbackChan chan<- []float32) error {
	if streamer == nil {
		streamer = &PADriver{}
	}

	if q := appState.QuitAudio; q != nil {
		close(q)
		appState.QuitAudio = nil
		time.Sleep(100 * time.Millisecond)
	}
	quit := make(chan bool)
	appState.QuitAudio = quit
	appState.Engine().SetRunning(true)

	devices := appState.Devices

	if deviceID >= len(devices) {
		return fmt.Errorf("invalid device")
	}
	dev := devices[deviceID]

	// Engine GoRoutine
	logger := slog.With("component", "audio")
	go func() {
		logger.Info("Audio engine started", slog.String("device", dev.Name))
		defer logger.Info("Audio engine stopped")
		defer func() { appState.Engine().SetRunning(false) }()
		defer func() {
			if appState.Translator != nil {
				appState.Translator.CloseAll()
			}
		}()

		in := make([]float32, cfg.BufferSize*dev.MaxInputChannels)
		logger.Info("Opening stream",
			slog.String("device", dev.Name),
			slog.Int("channels", dev.MaxInputChannels),
			slog.Int("sample_rate", cfg.SampleRate),
		)
		
		stream, err := streamer.OpenStream(pa.StreamParameters{
			Input:      pa.StreamDeviceParameters{Device: dev, Channels: dev.MaxInputChannels, Latency: dev.DefaultLowInputLatency},
			SampleRate: float64(cfg.SampleRate), FramesPerBuffer: cfg.BufferSize,
		}, in)
		
		if err != nil {
			logger.Warn("Failed to open stream, trying fallback with 2 channels",
				slog.Int("requested_channels", dev.MaxInputChannels),
				slog.Any("error", err),
			)
			
			// Fallback to 2 channels if possible
			channels := 2
			if dev.MaxInputChannels < 2 {
				channels = dev.MaxInputChannels
			}
			
			if channels > 0 {
				in = make([]float32, cfg.BufferSize*channels)
				stream, err = streamer.OpenStream(pa.StreamParameters{
					Input:      pa.StreamDeviceParameters{Device: dev, Channels: channels, Latency: dev.DefaultLowInputLatency},
					SampleRate: float64(cfg.SampleRate), FramesPerBuffer: cfg.BufferSize,
				}, in)
			}
		}

		if err != nil {
			logger.Error("Error opening stream", slog.Any("error", err))
			return
		}
		stream.Start()
		defer stream.Stop()
		defer stream.Close()

		for {
			select {
			case <-quit:
				return
			default:
			}

			startTime := time.Now()

			if err := stream.Read(); err != nil {
				continue
			}

			// Read current interface config once per loop
			conf := appState.Config()
			chL := int(conf.ChL())
			chR := int(conf.ChR())
			boost := float32(conf.Boost())

			if boost == 0 {
				boost = 1.0
			}

			stereoChunk := make([]float32, cfg.BufferSize*2)
			for i := 0; i < cfg.BufferSize; i++ {
				idxL := (i * dev.MaxInputChannels) + chL
				idxR := (i * dev.MaxInputChannels) + chR

				var sL, sR float32
				if idxL < len(in) {
					sL = in[idxL]
				}
				if idxR < len(in) {
					sR = in[idxR]
				}

				sL *= boost
				sR *= boost
				if sL > 1.0 {
					sL = 1.0
				} else if sL < -1.0 {
					sL = -1.0
				}
				if sR > 1.0 {
					sR = 1.0
				} else if sR < -1.0 {
					sR = -1.0
				}

				stereoChunk[i*2] = sL
				stereoChunk[i*2+1] = sR
			}

			// Fan-out to consumers
			select {
			case recordChan <- stereoChunk:
			default:
			}
			select {
			case playbackChan <- stereoChunk:
			default:
			}

			if telemetry.AudioLoopLatency != nil {
				telemetry.AudioLoopLatency.Record(context.Background(), time.Since(startTime).Seconds())
			}
		}
	}()

	return nil
}
