import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs";

const webcam = document.querySelector("#webcam");
const landmarkCanvas = document.querySelector("#landmarkCanvas");
const landmarkContext = landmarkCanvas.getContext("2d");

const cameraPlaceholder = document.querySelector("#cameraPlaceholder");
const cameraMessage = document.querySelector("#cameraMessage");
const startCameraButton = document.querySelector("#startCameraButton");
const stopCameraButton = document.querySelector("#stopCameraButton");
const statusPill = document.querySelector(".status-pill");

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

const uploadedMemes = [];

let mediaStream = null;
let visionFileset = null;
let handLandmarker = null;
let faceLandmarker = null;
let selectedMeme = null;
let animationFrameId = null;
let previousVideoTime = -1;
let latestFaceBlendshapes = [];

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

    const trackerResults = await Promise.allSettled([
      createHandLandmarker(),
      createFaceLandmarker(),
    ]);

    const activeTrackers = trackerResults.filter(
      (result) => result.status === "fulfilled"
    ).length;

    if (activeTrackers === 0) {
      throw new Error("No landmark tracker could be loaded.");
    }

    statusPill.textContent = "Camera on • face + hands tracking";
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

  landmarkContext.clearRect(
    0,
    0,
    landmarkCanvas.width,
    landmarkCanvas.height
  );

  cameraPlaceholder.classList.remove("camera-active");
  cameraMessage.textContent = "Camera preview will appear here";
  statusPill.textContent = "Camera off";
  startCameraButton.disabled = false;
  stopCameraButton.disabled = true;
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

    latestFaceBlendshapes =
      faceResult.faceBlendshapes?.[0]?.categories ?? [];

    drawLandmarks(handResult.landmarks, faceResult.faceLandmarks);
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

 function drawLandmarks(hands, faces) {
  const size = resizeLandmarkCanvas();

  landmarkContext.clearRect(0, 0, size.width, size.height);
  drawHandLandmarks(hands, size);
}

function memeNameFromFile(file) {
  return file.name.replace(/\.[^/.]+$/, "");
}

function selectMeme(meme) {
  selectedMeme = meme;

  const image = document.createElement("img");
  image.className = "current-meme-image";
  image.src = meme.url;
  image.alt = meme.name;

  const caption = document.createElement("p");
  caption.className = "current-meme-caption";
  caption.textContent = meme.name;

  currentMemePlaceholder.replaceChildren(image, caption);
  matchLabel.textContent = "Selected manually";
  currentMatch.textContent = meme.name;
  confidence.textContent = "Confidence: ready for matching";

  document.querySelectorAll(".meme-tile").forEach((tile) => {
    tile.classList.toggle("selected", tile.dataset.memeId === meme.id);
  });
}

function renderMemeTile(meme) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "meme-tile";
  tile.dataset.memeId = meme.id;
  tile.title = `Select ${meme.name}`;

  const image = document.createElement("img");
  image.src = meme.url;
  image.alt = meme.name;

  const label = document.createElement("span");
  label.textContent = meme.name;

  tile.append(image, label);
  tile.addEventListener("click", () => selectMeme(meme));
  memeStrip.append(tile);
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
  });

  memeCount.textContent = `${uploadedMemes.length} uploaded`;

  if (!selectedMeme) {
    selectMeme(uploadedMemes[0]);
  }

  memeUpload.value = "";
});

startCameraButton.addEventListener("click", startCamera);
stopCameraButton.addEventListener("click", stopCamera);
window.addEventListener("beforeunload", stopCamera);