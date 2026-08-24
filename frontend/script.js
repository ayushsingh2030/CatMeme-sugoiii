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