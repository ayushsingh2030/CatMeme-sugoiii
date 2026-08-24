// features.js
// Converts raw MediaPipe landmarks into a compact numeric "performance profile".
// This is the data that will later be compared against calibrated meme profiles.

const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

// Approximate landmark indices on the 468-point FaceMesh used for spatial checks.
const FACE_ANCHORS = {
  noseTip: 1,
  foreheadTop: 10,
  mouthCenter: 13,
};

function dist(a, b) {
  if (!a || !b) return null;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(a.x - b.x, a.y - b.y, dz);
}

function angleAt(a, b, c) {
  // Angle at point b, formed by rays b->a and b->c, in degrees.
  if (!a || !b || !c) return null;

  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);

  if (mag1 === 0 || mag2 === 0) return null;

  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function blendshapeScore(categories, name) {
  const match = categories?.find((c) => c.categoryName === name);
  return match ? match.score : 0;
}

// --- Hand features -----------------------------------------------------

function handSize(hand) {
  // Wrist to middle-finger MCP, used to normalise finger measurements
  // so results are roughly consistent regardless of distance from camera.
  return dist(hand[0], hand[9]) || 1;
}

function extractHandFeatures(hand, faceLandmarks) {
  const size = handSize(hand);
  const wrist = hand[0];

  const curl = {};
  Object.entries(FINGERS).forEach(([name, indices]) => {
    const tip = hand[indices[3]];
    curl[name] = dist(tip, wrist) / size; // higher = more extended
  });

  const isExtended = (finger) => curl[finger] > 1.3;
  const isCurled = (finger) => curl[finger] < 1.0;

  const extendedCount = Object.keys(curl).filter(isExtended).length;
  const isOpenHand = extendedCount >= 4;
  const isClosedHand = extendedCount <= 1;

  const isThumbsUp =
    isExtended("thumb") &&
    isCurled("index") &&
    isCurled("middle") &&
    isCurled("ring") &&
    isCurled("pinky");

  const isPointing =
    isExtended("index") &&
    isCurled("middle") &&
    isCurled("ring") &&
    isCurled("pinky");

  let wristToFaceDistance = null;
  if (faceLandmarks && faceLandmarks.length > 0) {
    wristToFaceDistance = dist(wrist, faceLandmarks[FACE_ANCHORS.noseTip]);
  }

  return {
    curl,
    isOpenHand,
    isClosedHand,
    isThumbsUp,
    isPointing,
    wristToFaceDistance,
  };
}

// --- Face features -------------------------------------------------------

function extractFaceFeatures(faceBlendshapeCategories) {
  if (!faceBlendshapeCategories || faceBlendshapeCategories.length === 0) {
    return null;
  }

  const mouthOpen = blendshapeScore(faceBlendshapeCategories, "jawOpen");
  const smileLeft = blendshapeScore(faceBlendshapeCategories, "mouthSmileLeft");
  const smileRight = blendshapeScore(faceBlendshapeCategories, "mouthSmileRight");
  const eyeOpenLeft = 1 - blendshapeScore(faceBlendshapeCategories, "eyeBlinkLeft");
  const eyeOpenRight = 1 - blendshapeScore(faceBlendshapeCategories, "eyeBlinkRight");
  const browUpLeft = blendshapeScore(faceBlendshapeCategories, "browOuterUpLeft");
  const browUpRight = blendshapeScore(faceBlendshapeCategories, "browOuterUpRight");

  return {
    mouthOpen,
    smiling: (smileLeft + smileRight) / 2,
    eyeOpenLeft,
    eyeOpenRight,
    browRaise: (browUpLeft + browUpRight) / 2,
  };
}

// --- Pose features ---------------------------------------------------------

function extractPoseFeatures(pose) {
  if (!pose || pose.length === 0) {
    return null;
  }

  const leftShoulder = pose[11];
  const rightShoulder = pose[12];
  const leftElbow = pose[13];
  const rightElbow = pose[14];
  const leftWrist = pose[15];
  const rightWrist = pose[16];

  const leftElbowAngle = angleAt(leftShoulder, leftElbow, leftWrist);
  const rightElbowAngle = angleAt(rightShoulder, rightElbow, rightWrist);

  const leftArmRaised = leftWrist && leftShoulder ? leftWrist.y < leftShoulder.y : false;
  const rightArmRaised = rightWrist && rightShoulder ? rightWrist.y < rightShoulder.y : false;

  const armsCrossed =
    leftWrist && rightWrist && leftShoulder && rightShoulder
      ? leftWrist.x > rightShoulder.x && rightWrist.x < leftShoulder.x
      : false;

  const shoulderAngle =
    leftShoulder && rightShoulder
      ? (Math.atan2(
          rightShoulder.y - leftShoulder.y,
          rightShoulder.x - leftShoulder.x
        ) *
          180) /
        Math.PI
      : null;

  return {
    leftElbowAngle,
    rightElbowAngle,
    leftArmRaised,
    rightArmRaised,
    armsCrossed,
    shoulderAngle,
  };
}

// --- Spatial relationship features ------------------------------------------

function extractSpatialFeatures(hands, faceLandmarks, pose) {
  const result = {
    handNearMouth: false,
    handOnHead: false,
    handsAboveHead: false,
  };

  if (!hands || hands.length === 0) {
    return result;
  }

  if (faceLandmarks && faceLandmarks.length > 0) {
    const mouth = faceLandmarks[FACE_ANCHORS.mouthCenter];
    const forehead = faceLandmarks[FACE_ANCHORS.foreheadTop];

    hands.forEach((hand) => {
      const indexTip = hand[8];
      const size = handSize(hand);

      if (mouth && dist(indexTip, mouth) / size < 1.5) {
        result.handNearMouth = true;
      }

      if (forehead && hand[0].y < forehead.y) {
        result.handOnHead = true;
      }
    });
  }

  if (pose && pose.length > 0) {
    const nose = pose[0];
    if (nose) {
      result.handsAboveHead = hands.every((hand) => hand[0].y < nose.y);
    }
  }

  return result;
}

// --- Public entry point ------------------------------------------------------

export function extractFeatures(hands, faceLandmarks, faceBlendshapeCategories, pose) {
  const handFeatures = (hands || []).map((hand) =>
    extractHandFeatures(hand, faceLandmarks)
  );

  return {
    hands: handFeatures,
    face: extractFaceFeatures(faceBlendshapeCategories),
    pose: extractPoseFeatures(pose),
    spatial: extractSpatialFeatures(hands, faceLandmarks, pose),
  };
}
