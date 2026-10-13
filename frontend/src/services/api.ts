import axios from "axios";

export const API_BASE = "http://localhost:8000";
export const WS_URL = "ws://localhost:8000/ws/recognition";

export const api = axios.create({ baseURL: API_BASE });

export interface Person {
  person_id: number;
  name: string;
  identifier: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  sample_count: number;
  embedding_count: number;
}

export interface GpuStatus {
  gpu_detected: boolean;
  gpu_name: string | null;
  cuda_available: boolean;
  execution_provider: string;
}

export interface SystemStatus {
  gpu: GpuStatus;
  database_connected: boolean;
  known_people: number;
  total_embeddings: number;
  recognition_threshold: number;
  model_name: string;
}

export interface ProcessingStatus {
  person_id: number;
  status: string;
  frames_analyzed: number;
  faces_detected: number;
  high_quality_faces: number;
  embeddings_generated: number;
  message?: string;
}

export interface MediaFaceResult {
  bbox: number[];
  person_id: number | null;
  person_name: string | null;
  similarity: number;
  is_recognized: boolean;
  detection_confidence: number;
}

export interface MediaRecognitionResult {
  media_type: "image" | "video";
  frames_analyzed: number;
  faces_detected: number;
  recognized_faces: number;
  unknown_faces: number;
  recognized_people: { name: string; appearances: number }[];
  processing_ms: number;
  duration_seconds: number | null;
  frame_results: { frame: number; time_seconds: number; faces: MediaFaceResult[] }[];
}

export const PersonsAPI = {
  list: (includeInactive = false) =>
    api.get<Person[]>("/api/persons", { params: { include_inactive: includeInactive } }).then((r) => r.data),
  create: (name: string, identifier: string, description?: string) =>
    api.post<Person>("/api/persons", { name, identifier, description }).then((r) => r.data),
  update: (id: number, payload: Partial<Pick<Person, "name" | "description" | "is_active">>) =>
    api.put<Person>(`/api/persons/${id}`, payload).then((r) => r.data),
  delete: (id: number, hardDelete = false) =>
    api.delete(`/api/persons/${id}`, { params: { hard_delete: hardDelete } }).then((r) => r.data),
};

export const DatasetAPI = {
  uploadMedia: (personId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post(`/api/persons/${personId}/media`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  process: (personId: number, mediaId: number) =>
    api.post(`/api/dataset/process/${personId}`, null, { params: { media_id: mediaId } }).then((r) => r.data),
  status: (personId: number) =>
    api.get<ProcessingStatus>(`/api/dataset/status/${personId}`).then((r) => r.data),
  deleteMedia: (mediaId: number) => api.delete(`/api/media/${mediaId}`).then((r) => r.data),
};

export const SystemAPI = {
  status: () => api.get<SystemStatus>("/api/system/status").then((r) => r.data),
  setThreshold: (threshold: number) =>
    api.put("/api/system/threshold", null, { params: { threshold } }).then((r) => r.data),
  logs: (limit = 50) => api.get(`/api/system/recognition/logs`, { params: { limit } }).then((r) => r.data),
};

export const RecognitionAPI = {
  recognizeMedia: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<MediaRecognitionResult>("/api/recognition/media", form).then((r) => r.data);
  },
};
