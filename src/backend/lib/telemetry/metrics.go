package telemetry

import (
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
)

var (
	meter = otel.Meter("abel")

	// Histograms
	RecordingLatency    metric.Float64Histogram
	AudioLoopLatency    metric.Float64Histogram

	// Counters
	DroppedConnections  metric.Int64Counter
	AITokensConsumed    metric.Int64Counter
)

// InitMetrics registers standard application metrics.
func InitMetrics() error {
	var err error

	RecordingLatency, err = meter.Float64Histogram("recording_latency_seconds",
		metric.WithDescription("Duration of audio file writes in seconds"),
		metric.WithUnit("s"),
	)
	if err != nil {
		return err
	}

	AudioLoopLatency, err = meter.Float64Histogram("audio_loop_latency_seconds",
		metric.WithDescription("Duration of the audio processing loop iteration in seconds"),
		metric.WithUnit("s"),
	)
	if err != nil {
		return err
	}

	DroppedConnections, err = meter.Int64Counter("dropped_connections_total",
		metric.WithDescription("Total number of dropped client connections (e.g. websocket failures)"),
		metric.WithUnit("{connections}"),
	)
	if err != nil {
		return err
	}

	AITokensConsumed, err = meter.Int64Counter("ai_tokens_consumed_total",
		metric.WithDescription("Total number of AI tokens consumed by the translator and transcriber sessions"),
		metric.WithUnit("{tokens}"),
	)
	if err != nil {
		return err
	}

	return nil
}
