package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/tencentyun/cos-go-sdk-v5"
)

// Config represents Tencent Cloud COS config loaded from config.json
type Config struct {
	SecretID   string `json:"tencent_cos_secret_id"`
	SecretKey  string `json:"tencent_cos_secret_key"`
	BucketName string `json:"tencent_cos_bucket"`
	Region     string `json:"tencent_cos_region"`
	Port       string `json:"port"`
}

// SynthesisRecord represents an uploaded screenshot record
type SynthesisRecord struct {
	ID        int64            `json:"id"`
	Timestamp string           `json:"timestamp"`
	ImageURL  string           `json:"image_url"`
	Status    string           `json:"status"` // "pending" or "recognized"
	Result    *SynthesisResult `json:"result,omitempty"`
}

// SynthesisResult represents the structured outcome of a recipe list
type SynthesisResult struct {
	Recipes []RecipeEntry `json:"recipes"`
}

// RecipeEntry represents a single identified recipe in the screenshot.
// Slots 3–5 are optional (omitempty) for backward compatibility with 2-slot recipes.
type RecipeEntry struct {
	TargetName    string `json:"target_name"`
	TargetLevel   int    `json:"target_level"`
	Slot1Name     string `json:"slot1_name"`
	Slot1Level    int    `json:"slot1_level"`
	Slot1Material string `json:"slot1_material,omitempty"`
	Slot2Name     string `json:"slot2_name"`
	Slot2Level    int    `json:"slot2_level"`
	Slot2Material string `json:"slot2_material,omitempty"`
	Slot3Name     string `json:"slot3_name,omitempty"`
	Slot3Level    int    `json:"slot3_level,omitempty"`
	Slot3Material string `json:"slot3_material,omitempty"`
	Slot4Name     string `json:"slot4_name,omitempty"`
	Slot4Level    int    `json:"slot4_level,omitempty"`
	Slot4Material string `json:"slot4_material,omitempty"`
	Slot5Name     string `json:"slot5_name,omitempty"`
	Slot5Level    int    `json:"slot5_level,omitempty"`
	Slot5Material string `json:"slot5_material,omitempty"`
	Book          int    `json:"book"`
}

var (
	config      Config
	mutex       sync.Mutex
	recordsFile = "uploads.json"
)

func init() {
	// Load config.json
	cfgPath := "config.json"
	file, err := os.Open(cfgPath)
	if err != nil {
		log.Printf("Warning: config.json not found, using empty config placeholders. Error: %v", err)
		config = Config{
			SecretID:   "YOUR_SECRET_ID",
			SecretKey:  "YOUR_SECRET_KEY",
			BucketName: "YOUR_BUCKET_NAME-APPID",
			Region:     "ap-guangzhou",
			Port:       ":8080",
		}
		return
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	err = decoder.Decode(&config)
	if err != nil {
		log.Fatalf("Fatal: failed to parse config.json: %v", err)
	}

	if config.Port == "" {
		config.Port = ":8080"
	} else if config.Port[0] != ':' {
		config.Port = ":" + config.Port
	}
}

// Helper to set CORS headers
func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

// Handles direct image upload from frontend and pushes to Tencent COS
func handleUpload(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		return
	}

	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Only POST method is allowed"})
		return
	}

	// Parse multipart form (10MB max size)
	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("failed to parse multipart form: %v", err)})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "file parameter is required"})
		return
	}
	defer file.Close()

	// 1. Generate unique object key on COS
	fileExt := filepath.Ext(header.Filename)
	baseName := header.Filename[:len(header.Filename)-len(fileExt)]
	objectKey := fmt.Sprintf("images/%d_%s%s", time.Now().UnixNano()/1e6, baseName, fileExt)

	// 2. Check if credentials are still placeholder
	if config.SecretID == "YOUR_SECRET_ID" || config.SecretKey == "YOUR_SECRET_KEY" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Tencent Cloud COS credentials are not configured in config.json"})
		return
	}

	// 3. Init COS client
	rawURL := fmt.Sprintf("https://%s.cos.%s.myqcloud.com", config.BucketName, config.Region)
	u, err := url.Parse(rawURL)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("invalid bucket URL: %v", err)})
		return
	}

	c := cos.NewClient(&cos.BaseURL{BucketURL: u}, &http.Client{
		Transport: &cos.AuthorizationTransport{
			SecretID:  config.SecretID,
			SecretKey: config.SecretKey,
		},
	})

	// 4. Upload file reader directly to COS with public-read permissions
	opt := &cos.ObjectPutOptions{
		ACLHeaderOptions: &cos.ACLHeaderOptions{
			XCosACL: "public-read",
		},
	}
	_, err = c.Object.Put(context.Background(), objectKey, file, opt)
	if err != nil {
		log.Printf("Tencent COS Upload Error: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("failed to upload to COS: %v", err)})
		return
	}

	finalDownloadURL := fmt.Sprintf("%s/%s", rawURL, objectKey)

	// 5. Thread-safe write to local uploads.json
	mutex.Lock()
	defer mutex.Unlock()

	var records []SynthesisRecord

	if _, err := os.Stat(recordsFile); err == nil {
		fileBytes, readErr := os.ReadFile(recordsFile)
		if readErr == nil && len(fileBytes) > 0 {
			_ = json.Unmarshal(fileBytes, &records)
		}
	}

	var maxID int64 = 0
	for _, rec := range records {
		if rec.ID > maxID {
			maxID = rec.ID
		}
	}

	newRecord := SynthesisRecord{
		ID:        maxID + 1,
		Timestamp: time.Now().Format(time.RFC3339),
		ImageURL:  finalDownloadURL,
		Status:    "pending",
		Result:    nil,
	}

	records = append([]SynthesisRecord{newRecord}, records...)

	writeBytes, err := json.MarshalIndent(records, "", "  ")
	if err == nil {
		_ = os.WriteFile(recordsFile, writeBytes, 0644)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"record": newRecord,
	})
}

// Retrieves records list
func handleGetRecords(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		return
	}

	mutex.Lock()
	defer mutex.Unlock()

	var records []SynthesisRecord = []SynthesisRecord{}

	if _, err := os.Stat(recordsFile); err == nil {
		fileBytes, readErr := os.ReadFile(recordsFile)
		if readErr == nil && len(fileBytes) > 0 {
			_ = json.Unmarshal(fileBytes, &records)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	json.NewEncoder(w).Encode(records)
}

func main() {
	// API routes
	http.HandleFunc("/api/upload", handleUpload)
	http.HandleFunc("/api/upload/records", handleGetRecords)

	// Serve the entire project workspace statically from the parent directory
	// This lets user load html pages directly via http://localhost:8080/
	fs := http.FileServer(http.Dir("../"))
	http.Handle("/", fs)

	log.Printf("Uploader Server starting on http://localhost%s ...", config.Port)
	log.Printf("Access upload portal directly at: http://localhost%s/upload.html", config.Port)

	if config.SecretID == "YOUR_SECRET_ID" {
		log.Println("WARNING: Tencent COS credentials are still placeholders in config.json.")
	}

	err := http.ListenAndServe(config.Port, nil)
	if err != nil {
		log.Fatalf("Fatal: failed to start server: %v", err)
	}
}
