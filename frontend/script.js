const webcam = document.querySelector("#webcam");
const cameraPlaceholder = document.querySelector("#cameraPlaceholder");
const cameraMessage = document.querySelector("#cameraMessage");
const startCameraButton = document.querySelector("#startCameraButton");
const stopCameraButton = document.querySelector("#stopCameraButton");
const statusPill = document.querySelector(".status-pill");

let mediaStream = null;

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
    cameraPlaceholder.classList.add("camera-active");
    statusPill.textContent = "Camera on";
    startCameraButton.disabled = true;
    stopCameraButton.disabled = false;
  } catch (error) {
    console.error("Camera error:", error);
    cameraMessage.textContent =
      "Camera access was unavailable. Check browser permission and try again.";
    statusPill.textContent = "Camera unavailable";
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }

  mediaStream = null;
  webcam.srcObject = null;
  cameraPlaceholder.classList.remove("camera-active");
  cameraMessage.textContent = "Camera preview will appear here";
  statusPill.textContent = "Camera off";
  startCameraButton.disabled = false;
  stopCameraButton.disabled = true;
}

startCameraButton.addEventListener("click", startCamera);
stopCameraButton.addEventListener("click", stopCamera);
window.addEventListener("beforeunload", stopCamera);
const memeUpload = document.querySelector("#memeUpload");
const memeStrip = document.querySelector("#memeStrip");
const memeCount = document.querySelector("#memeCount");
const currentMemePlaceholder = document.querySelector("#currentMemePlaceholder");
const matchLabel = document.querySelector("#matchLabel");
const currentMatch = document.querySelector("#currentMatch");
const confidence = document.querySelector("#confidence");

const uploadedMemes = [];
let selectedMeme = null;

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