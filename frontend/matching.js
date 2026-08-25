// matching.js
// Compares a live feature profile against every calibrated meme profile
// and returns the best match, using the weighted category scoring scheme
// described in the project blueprint (face / hands / pose / spatial).
//
// --- Tuning weights ---
// These are the starting values from the project doc. If matching feels
// wrong in a specific way, adjust here based on what you see in the
// console debug log (script.js logs the category breakdown for whatever
// is currently winning, throttled to ~1x/sec):
//   - Memes defined mostly by hand gestures losing to others? Raise `hands`.
//   - Facial expression memes not getting picked up? Raise `face`.
//   - Body/arm-position memes unreliable? Raise `pose`.
//   - Weights must not need to sum to 1 — they're normalised automatically
//     using only the categories that had data for a given comparison.
export const CATEGORY_WEIGHTS = {
  face: 0.25,
  hands: 0.3,
  pose: 0.3,
  spatial: 0.15,
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// Converts a raw difference into a 0-1 closeness score. `scale` is roughly
// "how big a difference counts as completely different" for that field.
function closeness(diff, scale) {
  return clamp01(1 - Math.abs(diff) / scale);
}

function average(values) {
  const defined = values.filter(
    (v) => v !== null && v !== undefined && !Number.isNaN(v)
  );
  if (defined.length === 0) return null;
  return defined.reduce((sum, v) => sum + v, 0) / defined.length;
}

function compareFace(live, profile) {
  if (!live || !profile) return null;

  const scale = 0.35;
  return average([
    closeness(live.mouthOpen - profile.mouthOpen, scale),
    closeness(live.smiling - profile.smiling, scale),
    closeness(live.eyeOpenLeft - profile.eyeOpenLeft, scale),
    closeness(live.eyeOpenRight - profile.eyeOpenRight, scale),
    closeness(live.browRaise - profile.browRaise, scale),
  ]);
}

function compareHand(liveHand, profileHand) {
  const curlScale = 0.6;
  const curlScores = Object.keys(profileHand.curl).map((finger) =>
    closeness((liveHand.curl[finger] ?? 0) - profileHand.curl[finger], curlScale)
  );

  const boolScores = [
    closeness((liveHand.isOpenHand ? 1 : 0) - profileHand.isOpenHand, 1),
    closeness((liveHand.isClosedHand ? 1 : 0) - profileHand.isClosedHand, 1),
    closeness((liveHand.isThumbsUp ? 1 : 0) - profileHand.isThumbsUp, 1),
    closeness((liveHand.isPointing ? 1 : 0) - profileHand.isPointing, 1),
  ];

  const distScore =
    liveHand.wristToFaceDistance != null && profileHand.wristToFaceDistance != null
      ? closeness(liveHand.wristToFaceDistance - profileHand.wristToFaceDistance, 0.35)
      : null;

  return average([...curlScores, ...boolScores, distScore]);
}

function compareHands(liveHands, profileHands) {
  if (!profileHands || profileHands.length === 0) return null;
  if (!liveHands || liveHands.length === 0) return 0;

  const pairCount = Math.min(liveHands.length, profileHands.length);
  const pairScores = [];

  for (let i = 0; i < pairCount; i += 1) {
    pairScores.push(compareHand(liveHands[i], profileHands[i]));
  }

  // Penalise mismatched hand counts (e.g. profile expects two hands, only one visible).
  const countPenalty =
    1 -
    Math.abs(liveHands.length - profileHands.length) /
      Math.max(liveHands.length, profileHands.length, 1);

  const pairedAverage = average(pairScores);
  return pairedAverage === null ? null : pairedAverage * countPenalty;
}

function comparePose(live, profile) {
  if (!live || !profile) return null;

  const scores = [];

  if (live.leftElbowAngle != null && profile.leftElbowAngle != null) {
    scores.push(closeness(live.leftElbowAngle - profile.leftElbowAngle, 45));
  }
  if (live.rightElbowAngle != null && profile.rightElbowAngle != null) {
    scores.push(closeness(live.rightElbowAngle - profile.rightElbowAngle, 45));
  }

  scores.push(closeness((live.leftArmRaised ? 1 : 0) - profile.leftArmRaised, 1));
  scores.push(closeness((live.rightArmRaised ? 1 : 0) - profile.rightArmRaised, 1));
  scores.push(closeness((live.armsCrossed ? 1 : 0) - profile.armsCrossed, 1));

  if (live.shoulderAngle != null && profile.shoulderAngle != null) {
    scores.push(closeness(live.shoulderAngle - profile.shoulderAngle, 35));
  }

  return average(scores);
}

function compareSpatial(live, profile) {
  if (!live || !profile) return null;

  return average([
    closeness((live.handNearMouth ? 1 : 0) - profile.handNearMouth, 1),
    closeness((live.handOnHead ? 1 : 0) - profile.handOnHead, 1),
    closeness((live.handsAboveHead ? 1 : 0) - profile.handsAboveHead, 1),
  ]);
}

// Scores one live feature snapshot against one calibrated profile.
// Returns an overall 0-1 score plus the per-category breakdown (handy for
// debugging / tuning weights in the console).
export function scoreAgainstProfile(liveFeatures, profile) {
  const categoryScores = {
    face: compareFace(liveFeatures.face, profile.face),
    hands: compareHands(liveFeatures.hands, profile.hands),
    pose: comparePose(liveFeatures.pose, profile.pose),
    spatial: compareSpatial(liveFeatures.spatial, profile.spatial),
  };

  let weightedSum = 0;
  let weightTotal = 0;

  Object.entries(CATEGORY_WEIGHTS).forEach(([category, weight]) => {
    const score = categoryScores[category];
    if (score !== null && score !== undefined) {
      weightedSum += score * weight;
      weightTotal += weight;
    }
  });

  const overallScore = weightTotal > 0 ? weightedSum / weightTotal : 0;

  return { overallScore, categoryScores };
}

// Compares live features against every calibrated profile and returns the
// single best match: { memeId, overallScore, categoryScores } or null if
// there are no calibrated profiles yet.
export function findBestMatch(liveFeatures, calibratedProfiles) {
  let best = null;

  Object.entries(calibratedProfiles).forEach(([memeId, profile]) => {
    if (!profile) return;

    const { overallScore, categoryScores } = scoreAgainstProfile(liveFeatures, profile);

    if (!best || overallScore > best.overallScore) {
      best = { memeId, overallScore, categoryScores };
    }
  });

  return best;
}