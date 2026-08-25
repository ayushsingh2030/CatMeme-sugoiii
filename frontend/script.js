import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs";

import { extractFeatures } from "./features.js";
import { runCalibrationTake } from "./calibration.js";
import {
  saveMemeRecord,
  loadAllMemeRecords,
  saveCalibrationRecord,
  loadAllCalibrationRecords,
} from "./storage.js";
import { findBestMatch } from "./matching.js";

const webcam = document.querySelector("#webcam");
const landmarkCanvas = document.querySelector("#landmarkCanvas");
const landmarkContext = landmarkCanvas.getContext("2d");

const cameraPlaceholder = document.querySelector("#cameraPlaceholder");
const cameraMessage = document.querySelector("#cameraMessage");
const startCameraButton = document.querySelector("#startCameraButton");
const stopCameraButton = document.querySelector("#stopCameraButton");
const statusPill = document.querySelector(".status-pill");
const trackerStatus = document.querySelector("#trackerStatus");
const calibrationOverlay = document.querySelector("#calibrationOverlay");

const memeUpload = document.querySelector("#memeUpload");
const memeStrip = document.querySelector("#memeStrip");
const memeCount = document.querySelector("#memeCount");
const currentMemePlaceholder = document.querySelector("#currentMemePlaceholder");
const matchLabel = document.querySelector("#matchLabel");
const currentMatch = document.querySelector("#currentMatch");
const confidence = document.querySelector("#confidence");

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const POSE_CONNECTIONS = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso sides
  [23, 24], // hips
];

// Minimum overall similarity score (0-1) before an auto-match is trusted
// enough to swap the displayed meme. Tune this later once real usage
// data shows whether matches feel too eager or too shy.
const MATCH_CONFIDENCE_THRESHOLD = 0.55;

// Brief grace period after a manual tile click before auto-matching is
// allowed to take the display back over, so browsing the library doesn't
// get immediately overridden.
const MANUAL_SELECT_GRACE_MS = 1000;

const uploadedMemes = [];

// Calibration profiles are kept here in memory for fast access during
// matching, but every write is mirrored into IndexedDB (see storage.js)
// so memes and their calibration survive refresh, close, and reopen.
// Recalibrating a meme REPLACES its saved profile entirely.
const calibratedProfiles = {}; // { [memeId]: profile }

let mediaStream = null;
let visionFileset = null;
let handLandmarker = null;
let faceLandmarker = null;
let poseLandmarker = null;
let selectedMeme = null;
let animationFrameId = null;
let previousVideoTime = -1;
let latestFaceBlendshapes = [];
let latestPoseLandmarks = [];
let latestHandLandmarks = [];
let latestFaceLandmarks = [];
let latestFeatures = null;
let lastFeatureLogTime = 0;
let isCalibrating = false;
let currentAutoMatchId = null;
let lastManualSelectTime = 0;

async function getVisionFileset() {
  if (!visionFileset) {
    visionFileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
  }

  return visionFileset;
}

async function createHandLandmarker() {
  if (handLandmarker) {
    return handLandmarker;
  }

  const vision = await getVisionFileset();

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });

  return handLandmarker;
}

async function createFaceLandmarker() {
  if (faceLandmarker) {
    return faceLandmarker;
  }

  const vision = await getVisionFileset();

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
    outputFaceBlendshapes: true,
  });

  return faceLandmarker;
}

async function createPoseLandmarker() {
  if (poseLandmarker) {
    return poseLandmarker;
  }

  const vision = await getVisionFileset();

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });

  return poseLandmarker;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraMessage.textContent = "Your browser does not support webcam access.";
    return;
  }

  try {
    cameraMessage.textContent = "Requesting camera permission...";

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    webcam.srcObject = mediaStream;
    await webcam.play();

    cameraPlaceholder.classList.add("camera-active");
    startCameraButton.disabled = true;
    stopCameraButton.disabled = false;
    statusPill.textContent = "Loading landmark trackers...";

    const trackerNames = ["hand", "face", "pose"];
    const trackerResults = await Promise.allSettled([
      createHandLandmarker(),
      createFaceLandmarker(),
      createPoseLandmarker(),
    ]);

    const failedTrackers = trackerResults
      .map((result, index) => (result.status === "rejected" ? trackerNames[index] : null))
      .filter(Boolean);

    const activeTrackers = trackerResults.length - failedTrackers.length;

    if (activeTrackers === 0) {
      throw new Error("No landmark tracker could be loaded.");
    }

    if (failedTrackers.length > 0) {
      trackerStatus.textContent = `Partial: ${failedTrackers.join(", ")} unavailable`;
      trackerStatus.style.color = "#ffb84c";
    } else {
      trackerStatus.textContent = "All trackers ready";
      trackerStatus.style.color = "";
    }

    statusPill.textContent = "Camera on • face + hands + pose tracking";
    startLandmarkLoop();
  } catch (error) {
    console.error("Camera or tracker error:", error);
    cameraMessage.textContent =
      "Camera started, but a tracker could not load. Check the browser console.";
    statusPill.textContent = "Tracker unavailable";
    startCameraButton.disabled = false;
    stopCameraButton.disabled = true;
  }
}

function stopCamera() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }

  mediaStream = null;
  webcam.srcObject = null;
  previousVideoTime = -1;
  latestFaceBlendshapes = [];
  latestPoseLandmarks = [];
  latestHandLandmarks = [];
  latestFaceLandmarks = [];
  latestFeatures = null;
  currentAutoMatchId = null;

  landmarkContext.clearRect(
    0,
    0,
    landmarkCanvas.width,
    landmarkCanvas.height
  );

  cameraPlaceholder.classList.remove("camera-active");
  cameraMessage.textContent = "Camera preview will appear here";
  statusPill.textContent = "Camera off";
  trackerStatus.textContent = "Landmarks ready";
  trackerStatus.style.color = "";
  startCameraButton.disabled = false;
  stopCameraButton.disabled = true;
}

function runAutoMatch(timestamp) {
  const hasProfiles = Object.keys(calibratedProfiles).length > 0;
  const withinManualGrace =
    timestamp - lastManualSelectTime < MANUAL_SELECT_GRACE_MS;

  if (isCalibrating || !hasProfiles || withinManualGrace || !latestFeatures) {
    return;
  }

  const bestMatch = findBestMatch(latestFeatures, calibratedProfiles);
  if (!bestMatch) {
    return;
  }

  const scorePercent = Math.round(bestMatch.overallScore * 100);
  const matchedMeme = uploadedMemes.find((m) => m.id === bestMatch.memeId);
  if (!matchedMeme) {
    return;
  }

  if (bestMatch.overallScore >= MATCH_CONFIDENCE_THRESHOLD) {
    if (currentAutoMatchId !== matchedMeme.id) {
      displayMeme(matchedMeme, {
        label: "Live match",
        confidenceText: `Confidence: ${scorePercent}%`,
      });
      currentAutoMatchId = matchedMeme.id;
    } else {
      confidence.textContent = `Confidence: ${scorePercent}%`;
    }
  } else if (currentAutoMatchId !== null) {
    matchLabel.textContent = "Live match";
    currentMatch.textContent = "Uncertain";
    confidence.textContent = `Confidence: ${scorePercent}% (below threshold)`;
    currentAutoMatchId = null;
  }
}

function startLandmarkLoop() {
  if (!mediaStream) {
    return;
  }

  if (
    webcam.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    webcam.currentTime !== previousVideoTime
  ) {
    previousVideoTime = webcam.currentTime;
    const timestamp = performance.now();

    const handResult = handLandmarker
      ? handLandmarker.detectForVideo(webcam, timestamp)
      : { landmarks: [] };

    const faceResult = faceLandmarker
      ? faceLandmarker.detectForVideo(webcam, timestamp)
      : { faceLandmarks: [], faceBlendshapes: [] };

    const poseResult = poseLandmarker
      ? poseLandmarker.detectForVideo(webcam, timestamp)
      : { landmarks: [] };

    latestHandLandmarks = handResult.landmarks ?? [];
    latestFaceLandmarks = faceResult.faceLandmarks ?? [];
    latestFaceBlendshapes = faceResult.faceBlendshapes?.[0]?.categories ?? [];
    latestPoseLandmarks = poseResult.landmarks?.[0] ?? [];

    latestFeatures = extractFeatures(
      latestHandLandmarks,
      latestFaceLandmarks[0],
      latestFaceBlendshapes,
      latestPoseLandmarks
    );

    if (timestamp - lastFeatureLogTime > 500 && !isCalibrating) {
      lastFeatureLogTime = timestamp;
      console.log("Live feature profile:", latestFeatures);
    }

    runAutoMatch(timestamp);
    drawLandmarks(latestHandLandmarks, latestFaceLandmarks);
  }

  animationFrameId = requestAnimationFrame(startLandmarkLoop);
}

function resizeLandmarkCanvas() {
  const width = landmarkCanvas.clientWidth;
  const height = landmarkCanvas.clientHeight;
  const pixelRatio = window.devicePixelRatio || 1;

  const targetWidth = Math.round(width * pixelRatio);
  const targetHeight = Math.round(height * pixelRatio);

  if (
    landmarkCanvas.width !== targetWidth ||
    landmarkCanvas.height !== targetHeight
  ) {
    landmarkCanvas.width = targetWidth;
    landmarkCanvas.height = targetHeight;
  }

  landmarkContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  return { width, height };
}

function landmarkToCanvasPoint(landmark, canvasWidth, canvasHeight) {
  const sourceWidth = webcam.videoWidth;
  const sourceHeight = webcam.videoHeight;

  const scale = Math.max(
    canvasWidth / sourceWidth,
    canvasHeight / sourceHeight
  );

  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;

  return {
    x: landmark.x * renderedWidth + (canvasWidth - renderedWidth) / 2,
    y: landmark.y * renderedHeight + (canvasHeight - renderedHeight) / 2,
  };
}

function drawConnections(landmarks, connections, color, width, size) {
  landmarkContext.strokeStyle = color;
  landmarkContext.lineWidth = width;
  landmarkContext.lineCap = "round";
  landmarkContext.lineJoin = "round";

  connections.forEach((connection) => {
    const startIndex = connection.start ?? connection[0];
    const endIndex = connection.end ?? connection[1];

    const start = landmarkToCanvasPoint(
      landmarks[startIndex],
      size.width,
      size.height
    );

    const end = landmarkToCanvasPoint(
      landmarks[endIndex],
      size.width,
      size.height
    );

    landmarkContext.beginPath();
    landmarkContext.moveTo(start.x, start.y);
    landmarkContext.lineTo(end.x, end.y);
    landmarkContext.stroke();
  });
}

function drawFaceLandmarks(faces, size) {
  const faceGroups = [
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
    FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
    FaceLandmarker.FACE_LANDMARKS_LIPS,
  ];

  faces.forEach((face) => {
    faceGroups.forEach((connections) => {
      drawConnections(face, connections, "#5ef0e2", 1.5, size);
    });
  });
}

function drawHandLandmarks(hands, size) {
  hands.forEach((hand) => {
    drawConnections(hand, HAND_CONNECTIONS, "#baff45", 3, size);

    landmarkContext.fillStyle = "#ffe66d";

    hand.forEach((landmark) => {
      const point = landmarkToCanvasPoint(
        landmark,
        size.width,
        size.height
      );

      landmarkContext.beginPath();
      landmarkContext.arc(point.x, point.y, 4, 0, Math.PI * 2);
      landmarkContext.fill();
    });
  });
}

function drawPoseLandmarks(poses, size) {
  poses.forEach((pose) => {
    drawConnections(pose, POSE_CONNECTIONS, "#ff9f5c", 2, size);
  });
}

function drawLandmarks(hands, faces) {
  const size = resizeLandmarkCanvas();

  landmarkContext.clearRect(0, 0, size.width, size.height);
  drawHandLandmarks(hands, size);
}

function memeNameFromFile(file) {
  return file.name.replace(/\.[^/.]+$/, "");
}

// Renders `meme` as the current large meme image. `label` and
// `confidenceText` let callers override the status text (manual pick vs.
// live auto-match); otherwise sensible defaults are used.
function displayMeme(meme, { label, confidenceText, isManual = false } = {}) {
  selectedMeme = meme;

  const image = document.createElement("img");
  image.className = "current-meme-image";
  image.src = meme.url;
  image.alt = meme.name;

  const caption = document.createElement("p");
  caption.className = "current-meme-caption";
  caption.textContent = meme.name;

  currentMemePlaceholder.replaceChildren(image, caption);
  matchLabel.textContent = label ?? (isManual ? "Selected manually" : "Live match");
  currentMatch.textContent = meme.name;
  confidence.textContent = confidenceText ?? "Confidence: ready for matching";

  document.querySelectorAll(".meme-tile").forEach((tile) => {
    tile.classList.toggle("selected", tile.dataset.memeId === meme.id);
  });
}

function updateTileCalibrationBadge(meme) {
  const tile = memeStrip.querySelector(`[data-meme-id="${meme.id}"]`);
  if (!tile) return;

  const badge = tile.querySelector(".calibration-badge");
  const calibrateButton = tile.querySelector(".calibrate-button");
  const hasProfile = Boolean(calibratedProfiles[meme.id]);

  if (badge) {
    badge.textContent = hasProfile ? "Calibrated" : "Not calibrated";
    badge.classList.toggle("calibrated", hasProfile);
  }

  if (calibrateButton) {
    calibrateButton.textContent = hasProfile ? "Recalibrate" : "Calibrate";
  }
}

async function calibrateMeme(meme) {
  if (!mediaStream) {
    cameraMessage.textContent = "Start the camera before calibrating a meme.";
    return;
  }

  if (isCalibrating) {
    return;
  }

  isCalibrating = true;
  displayMeme(meme, { isManual: true });
  calibrationOverlay.classList.add("visible");

  const sessionProfile = await runCalibrationTake({
    getFeatures: () => latestFeatures,
    countdownSeconds: 3,
    captureDurationMs: 1500,
    onStatusChange: (text) => {
      if (text) {
        calibrationOverlay.textContent = text;
      } else {
        calibrationOverlay.classList.remove("visible");
      }
    },
  });

  // Recalibrating replaces the previous profile entirely — no blending
  // with older takes.
  calibratedProfiles[meme.id] = sessionProfile;

  try {
    await saveCalibrationRecord(meme.id, sessionProfile);
  } catch (error) {
    console.error("Failed to save calibration to IndexedDB:", error);
  }

  console.log(`Calibration saved for "${meme.name}":`, sessionProfile);

  updateTileCalibrationBadge(meme);
  isCalibrating = false;
}

function renderMemeTile(meme) {
  const tile = document.createElement("div");
  tile.className = "meme-tile";
  tile.dataset.memeId = meme.id;

  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.className = "meme-tile-select";
  selectButton.title = `Select ${meme.name}`;

  const image = document.createElement("img");
  image.src = meme.url;
  image.alt = meme.name;

  const label = document.createElement("span");
  label.textContent = meme.name;

  selectButton.append(image, label);
  selectButton.addEventListener("click", () => {
    displayMeme(meme, { isManual: true });
    lastManualSelectTime = performance.now();
    currentAutoMatchId = null;
  });

  const calibrateButton = document.createElement("button");
  calibrateButton.type = "button";
  calibrateButton.className = "calibrate-button";
  calibrateButton.textContent = "Calibrate";
  calibrateButton.addEventListener("click", () => calibrateMeme(meme));

  const badge = document.createElement("span");
  badge.className = "calibration-badge";
  badge.textContent = "Not calibrated";

  tile.append(selectButton, calibrateButton, badge);
  memeStrip.append(tile);

  document.querySelectorAll(".meme-tile").forEach((t) => {
    t.classList.toggle("selected", t.dataset.memeId === selectedMeme?.id);
  });

  updateTileCalibrationBadge(meme);
}

async function loadPersistedData() {
  try {
    const memeRecords = await loadAllMemeRecords();

    memeRecords.forEach((record) => {
      const meme = {
        id: record.id,
        name: record.name,
        url: URL.createObjectURL(record.blob),
      };

      uploadedMemes.push(meme);
      renderMemeTile(meme);
    });

    if (uploadedMemes.length > 0) {
      memeStrip.querySelector(".empty-library")?.remove();
      memeCount.textContent = `${uploadedMemes.length} uploaded`;
      displayMeme(uploadedMemes[0], { isManual: true });
    }

    const calibrationRecords = await loadAllCalibrationRecords();

    calibrationRecords.forEach((record) => {
      calibratedProfiles[record.memeId] = record.profile;
    });

    uploadedMemes.forEach((meme) => updateTileCalibrationBadge(meme));
  } catch (error) {
    console.error("Failed to load saved memes/calibrations from IndexedDB:", error);
  }
}

memeUpload.addEventListener("change", (event) => {
  const imageFiles = [...event.target.files].filter((file) =>
    file.type.startsWith("image/")
  );

  if (imageFiles.length === 0) {
    return;
  }

  if (uploadedMemes.length === 0) {
    memeStrip.replaceChildren();
  }

  imageFiles.forEach((file) => {
    const meme = {
      id: crypto.randomUUID(),
      name: memeNameFromFile(file),
      url: URL.createObjectURL(file),
    };

    uploadedMemes.push(meme);
    renderMemeTile(meme);

    saveMemeRecord(meme, file).catch((error) => {
      console.error("Failed to save meme to IndexedDB:", error);
    });
  });

  memeCount.textContent = `${uploadedMemes.length} uploaded`;

  if (!selectedMeme) {
    displayMeme(uploadedMemes[0], { isManual: true });
  }

  memeUpload.value = "";
});

startCameraButton.addEventListener("click", startCamera);
stopCameraButton.addEventListener("click", stopCamera);
window.addEventListener("beforeunload", stopCamera);

loadPersistedData();