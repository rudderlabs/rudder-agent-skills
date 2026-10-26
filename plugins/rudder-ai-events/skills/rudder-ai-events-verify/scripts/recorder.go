// Stub RudderStack client for ai-sdk-go: appends every message to a JSONL file, with its type.
// Copy into the package of the harness or test that drives the app and change the package clause.
//
//	rec, err := NewRecorder("events.jsonl")
//	rudderstackai.Configure(rudderstackai.WithAnalytics(rec)) // or the MCP wrapper's Analytics option
//	defer rec.Close()
package recorder

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"

	analytics "github.com/rudderlabs/analytics-go/v4"
)

// Recorder implements analytics.Client.
type Recorder struct {
	mu sync.Mutex
	f  *os.File
}

func NewRecorder(path string) (*Recorder, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	return &Recorder{f: f}, nil
}

func (r *Recorder) Enqueue(m analytics.Message) error {
	var line any
	switch msg := m.(type) {
	case analytics.Track:
		msg.Type = "track" // analytics-go sets it only when sending
		line = msg
	case analytics.Identify:
		msg.Type = "identify"
		line = msg
	default:
		line = map[string]string{"type": fmt.Sprintf("%T", m)}
	}
	b, err := json.Marshal(line)
	if err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	_, err = r.f.Write(append(b, '\n'))
	return err
}

// Flush makes rudderstackai.Flush treat the recorder as a current client; writes are unbuffered.
func (r *Recorder) Flush(context.Context) error { return nil }

func (r *Recorder) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.f.Close()
}
