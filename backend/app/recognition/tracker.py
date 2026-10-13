"""
Lightweight IoU-based tracker with temporal label smoothing and NMS.

Purpose: recognition (embedding + similarity search) is only run every
Nth frame; on the frames in between, tracked boxes are carried forward
by matching detections (cheap, run every frame) to existing tracks by
IoU. Labels are smoothed with a majority-vote window so identity does
not flicker frame-to-frame.

NMS is applied to raw detections before tracking to collapse overlapping
boxes from the same face into a single detection, preventing the double-
bounding-box artefact seen when two slightly different detections of the
same face arrive in the same frame.
"""
import itertools
from collections import deque
from dataclasses import dataclass, field
from typing import Optional


def iou(box_a: tuple, box_b: tuple) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    inter_x1, inter_y1 = max(ax1, bx1), max(ay1, by1)
    inter_x2, inter_y2 = min(ax2, bx2), min(ay2, by2)
    inter_area = max(0, inter_x2 - inter_x1) * max(0, inter_y2 - inter_y1)
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - inter_area
    return inter_area / union if union > 0 else 0.0


@dataclass
class Track:
    track_id: int
    bbox: tuple
    person_id: Optional[int] = None
    person_name: Optional[str] = None
    similarity: float = 0.0
    label_history: deque = field(default_factory=lambda: deque(maxlen=7))
    missed_frames: int = 0

    def stable_label(self):
        """Majority vote over the recent label history to prevent flicker."""
        if not self.label_history:
            return self.person_id, self.person_name, self.similarity
        counts = {}
        for pid, name, sim in self.label_history:
            counts.setdefault(pid, [0, name, []])
            counts[pid][0] += 1
            counts[pid][2].append(sim)
        best_pid = max(counts.items(), key=lambda kv: kv[1][0])[0]
        count, name, sims = counts[best_pid]
        avg_sim = sum(sims) / len(sims)
        return best_pid, name, avg_sim


# ── Utility: Non-Maximum Suppression ─────────────────────────────────────────

def nms(detections: list[tuple], iou_threshold: float = 0.25) -> list[tuple]:
    """
    Greedy NMS over a list of bbox tuples (x1, y1, x2, y2).
    Uses 0.25 IoU threshold (not 0.45) because SCRFD produces nested/multi-scale
    boxes where a large head box and a smaller face box overlap with low IoU
    (e.g. 0.20-0.30). A threshold of 0.45 would miss these.
    Boxes are processed largest-area-first as a proxy for confidence.
    Returns the filtered list of bboxes.
    """
    if len(detections) <= 1:
        return detections

    # Sort by box area descending (largest = most likely the primary detection)
    sorted_dets = sorted(
        detections,
        key=lambda b: (b[2] - b[0]) * (b[3] - b[1]),
        reverse=True,
    )

    kept: list[tuple] = []
    for candidate in sorted_dets:
        if all(iou(candidate, k) < iou_threshold for k in kept):
            kept.append(candidate)
    return kept


class FaceTracker:
    IOU_MATCH_THRESHOLD = 0.4  # raised from 0.3 — reduces spurious duplicate tracks
    MAX_MISSED_FRAMES = 2      # lowered from 8 — ghost tracks die in 2 frames, not 8

    def __init__(self):
        self._tracks: list[Track] = []
        self._id_counter = itertools.count(1)

    def update(self, detections: list[tuple]) -> list[Track]:
        """
        detections: list of bbox tuples for this frame (cheap detection only).
        NMS is applied first to collapse overlapping boxes for the same face.
        Returns the current list of active tracks, matched to detections.
        """
        detections = nms(detections)
        unmatched_dets = list(range(len(detections)))
        matched_tracks = set()

        for track in self._tracks:
            best_iou, best_det_idx = 0.0, None
            for idx in unmatched_dets:
                score = iou(track.bbox, detections[idx])
                if score > best_iou:
                    best_iou, best_det_idx = score, idx
            if best_iou >= self.IOU_MATCH_THRESHOLD:
                track.bbox = detections[best_det_idx]
                track.missed_frames = 0
                unmatched_dets.remove(best_det_idx)
                matched_tracks.add(id(track))
            else:
                track.missed_frames += 1

        for idx in unmatched_dets:
            self._tracks.append(Track(track_id=next(self._id_counter), bbox=detections[idx]))

        self._tracks = [t for t in self._tracks if t.missed_frames <= self.MAX_MISSED_FRAMES]
        return self._tracks

    def apply_recognition(self, track_id: int, person_id: Optional[int], person_name: Optional[str], similarity: float):
        for track in self._tracks:
            if track.track_id == track_id:
                track.label_history.append((person_id, person_name, similarity))
                pid, name, sim = track.stable_label()
                track.person_id, track.person_name, track.similarity = pid, name, sim
                return

    def find_nearest_track(self, bbox: tuple) -> Optional[Track]:
        best_track, best_iou = None, 0.0
        for track in self._tracks:
            score = iou(track.bbox, bbox)
            if score > best_iou:
                best_iou, best_track = score, track
        return best_track if best_iou >= self.IOU_MATCH_THRESHOLD else None
