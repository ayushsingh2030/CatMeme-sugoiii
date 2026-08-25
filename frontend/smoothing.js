// smoothing.js
// Prevents the displayed meme from flickering between candidates on
// frame-to-frame noise. A candidate must win a consistent streak of
// consecutive frames before the display actually switches, and the
// currently displayed meme is retained otherwise (hysteresis).
//
// Also exposes streak progress (candidateId / candidateStreak /
// dwellFramesRequired) so the UI can show a "Detecting..." state while a
// candidate is building up its streak, rather than jumping straight from
// nothing to a confirmed match with no in-between feedback.

export function createMatchSmoother({ dwellFramesRequired = 8 } = {}) {
  let currentDisplayedId = null;
  let candidateId = null;
  let candidateStreak = 0;

  // `candidate` is either { memeId, overallScore, ... } for a confident
  // match this frame, or null if nothing cleared the confidence threshold.
  function update(candidate) {
    if (!candidate) {
      candidateId = null;
      candidateStreak = 0;
      return {
        shouldSwitch: false,
        displayedId: currentDisplayedId,
        candidateId: null,
        candidateStreak: 0,
        dwellFramesRequired,
      };
    }

    if (candidate.memeId === candidateId) {
      candidateStreak += 1;
    } else {
      candidateId = candidate.memeId;
      candidateStreak = 1;
    }

    const shouldSwitch =
      candidateId !== currentDisplayedId && candidateStreak >= dwellFramesRequired;

    if (shouldSwitch) {
      currentDisplayedId = candidateId;
    }

    return {
      shouldSwitch,
      displayedId: currentDisplayedId,
      candidateId,
      candidateStreak,
      dwellFramesRequired,
    };
  }

  function reset() {
    currentDisplayedId = null;
    candidateId = null;
    candidateStreak = 0;
  }

  return { update, reset };
}