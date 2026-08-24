// calibration.js
// Handles capturing short bursts of live features and averaging them into
// a stable "profile" for a meme, and averaging multiple calibration takes
// together for a more robust profile.

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Recursively averages a list of values that share the same shape:
// numbers -> mean, booleans -> fraction-true (0-1), arrays -> averaged
// element-by-element, objects -> averaged key-by-key. Nulls are skipped.
export function averageValue(values) {
  const defined = values.filter((v) => v !== null && v !== undefined);

  if (defined.length === 0) {
    return null;
  }

  const sample = defined[0];

  if (typeof sample === "number") {
    return defined.reduce((sum, v) => sum + v, 0) / defined.length;
  }

  if (typeof sample === "boolean") {
    return defined.filter(Boolean).length / defined.length;
  }

  if (Array.isArray(sample)) {
    const maxLength = Math.max(...defined.map((arr) => arr.length));
    const result = [];

    for (let i = 0; i < maxLength; i += 1) {
      const itemsAtIndex = defined.map((arr) => arr[i]).filter((v) => v !== undefined);
      result.push(averageValue(itemsAtIndex));
    }

    return result;
  }

  if (typeof sample === "object") {
    const keys = Object.keys(sample);
    const result = {};

    keys.forEach((key) => {
      result[key] = averageValue(defined.map((item) => item[key]));
    });

    return result;
  }

  return sample;
}

// Collects `getFeatures()` results every animation frame for `durationMs`,
// then returns the raw list of frames captured (not yet averaged).
export function captureFrames(durationMs, getFeatures) {
  return new Promise((resolve) => {
    const frames = [];
    const start = performance.now();

    function tick() {
      const features = getFeatures();
      if (features) {
        frames.push(features);
      }

      if (performance.now() - start < durationMs) {
        requestAnimationFrame(tick);
      } else {
        resolve(frames);
      }
    }

    tick();
  });
}

// Runs a single calibration take: a short countdown, then a capture window,
// updating `onStatusChange` with human-readable status text throughout.
export async function runCalibrationTake({
  getFeatures,
  countdownSeconds = 3,
  captureDurationMs = 1500,
  onStatusChange,
}) {
  for (let i = countdownSeconds; i >= 1; i -= 1) {
    onStatusChange?.(`Get ready... ${i}`);
    await wait(1000);
  }

  onStatusChange?.("Hold your reaction!");
  const frames = await captureFrames(captureDurationMs, getFeatures);

  onStatusChange?.("Captured!");
  await wait(600);

  onStatusChange?.(null);

  return averageValue(frames);
}