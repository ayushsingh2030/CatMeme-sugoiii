import {
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
let handLandmarker = null;
let selectedMeme = null;
let animationFrameId = null;
let previousVideoTime = -1;

async function createHandLandmarker() {
  if (handLandmarker) {
    return handLandmarker;
  }

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );

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
    statusPill.textContent = "Loading hand tracker...";

    try {
      await createHandLandmarker();
      statusPill.textContent = "Camera on • hands tracking";
      startLandmarkLoop();
    } catch (error) {
      console.error("Hand tracker error:", error);
      statusPill.textContent = "Camera on • tracker unavailable";
    }
  } catch (error) {
    console.error("Camera error:", error);
    cameraMessage.textContent =
      "Camera access was unavailable. Check browser permission and try again.";
    statusPill.textContent = "Camera unavailable";
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
  if (!handLandmarker || !mediaStream) {
    return;
  }

  if (webcam.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    if (webcam.currentTime !== previousVideoTime) {
      previousVideoTime = webcam.currentTime;

      const result = handLandmarker.detectForVideo(
        webcam,
        performance.now()
      );

      drawHandLandmarks(result.landmarks);
    }
  }

  animationFrameId = requestAnimationFrame(startLandmarkLoop);
}

function resizeLandmarkCanvas() {
  const width = landmarkCanvas.clientWidth;
  const height = landmarkCanvas.clientHeight;
  const devicePixelRatio = window.devicePixelRatio || 1;

  const targetWidth = Math.round(width * devicePixelRatio);
  const targetHeight = Math.round(height * devicePixelRatio);

  if (
    landmarkCanvas.width !== targetWidth ||
    landmarkCanvas.height !== targetHeight
  ) {
    landmarkCanvas.width = targetWidth;
    landmarkCanvas.height = targetHeight;
  }

  landmarkContext.setTransform(
    devicePixelRatio,
    0,
    0,
    devicePixelRatio,
    0,
    0
  );

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

function drawHandLandmarks(hands) {
  const { width, height } = resizeLandmarkCanvas();

  landmarkContext.clearRect(0, 0, width, height);

  hands.forEach((hand) => {
    landmarkContext.strokeStyle = "#baff45";
    landmarkContext.lineWidth = 3;
    landmarkContext.lineCap = "round";
    landmarkContext.lineJoin = "round";

    HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
      const start = landmarkToCanvasPoint(hand[startIndex], width, height);
      const end = landmarkToCanvasPoint(hand[endIndex], width, height);

      landmarkContext.beginPath();
      landmarkContext.moveTo(start.x, start.y);
      landmarkContext.lineTo(end.x, end.y);
      landmarkContext.stroke();
    });

    landmarkContext.fillStyle = "#ffe66d";

    hand.forEach((landmark) => {
      const point = landmarkToCanvasPoint(landmark, width, height);

      landmarkContext.beginPath();
      landmarkContext.arc(point.x, point.y, 4, 0, Math.PI * 2);
      landmarkContext.fill();
    });
  });
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