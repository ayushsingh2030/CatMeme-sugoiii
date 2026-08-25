# Meowmeow Cat Cam Meme Detector

**Make a gesture. Get a cat meme.**

Point your webcam at yourself, make a face, hand gesture, or pose, and get a matching cat meme in real time.

The application uses **MediaPipe** computer-vision models to detect hand, face, and body landmarks. During calibration, your gestures are captured as personalized feature profiles associated with cat memes. During live use, your current gesture is compared with saved profiles and the strongest confident match is displayed.

The core recognition system runs entirely in the browser using **MediaPipe WASM**.

---

## Overview

The recognition pipeline is:

```text
Webcam
   ↓
MediaPipe Landmark Detection
   ├── Face
   ├── Hands
   └── Pose
   ↓
Feature Extraction
   ↓
Compare with Calibrated Profiles
   ↓
Weighted Similarity Matching
   ↓
Confidence Thresholding
   ↓
Temporal Smoothing
   ↓
Matched Meme
```

### Recognition Process

1. The browser captures frames from your webcam.
2. MediaPipe detects face, hand, and pose landmarks.
3. Raw landmarks are converted into numerical features.
4. During calibration, a gesture is associated with a meme.
5. The gesture profile is saved locally.
6. During live use, current features are compared with all saved profiles.
7. Similarity scores are combined using weighted matching.
8. Low-confidence matches are rejected.
9. Stable candidates are confirmed through temporal smoothing.
10. The corresponding meme is displayed.

---

## Interface

The application has two side-by-side panes.

### Camera

The camera pane displays:

- Live webcam feed
- Green hand landmarks
- Real-time detection and matching information

Face and pose landmarks are used internally for recognition but are not drawn over the camera feed.

### Meme

The meme pane displays:

- The current matched meme
- Matching status
- Confidence information

The camera and meme outputs use matching dimensions and aspect ratios.

---

## Gestures

The application supports **personalized gesture-to-meme mapping**. The following gestures represent the current example gesture set.

| # | Gesture | How to Trigger |
|---|---|---|
| 1 | **Muehehe** | Both hands up, index fingers only, tips touching |
| 2 | **Devo cat** | Both hands up, above the top of your head |
| 3 | **Crash out cord chewing kitty** | Both hands beside your face |
| 4 | **I will punch you** | One hand with all four fingers curled |
| 5 | **EHHEHEEEHEEEE** | Thumb and pinky extended |
| 6 | **Shhh silenced cat** | Index finger resting on your mouth |
| 7 | **Erm ackshuALLY! cat** | Index finger extended away from your face |
| 8 | **Shocked/kidnapped cat** | Hand covering your mouth |
| 9 | **gGIMME MONIE!!** | Open palm with all fingers extended away from your face |
| 10 | **Side eye cat** | Head turned approximately 15° or more |
| 11 | **Pokercat** | Neutral/default gesture |
| 12 | **Spinny OIIAI cat** | Spin yourself |

Meme images are stored in the `memes/` directory. Multiple images can be associated with a gesture.

---

# How the Recognition System Works

## Calibration

The project uses **calibration-based recognition** rather than training a new deep-learning model from scratch.

To create a gesture-to-meme mapping:

1. Enter calibration mode.
2. Select the meme to associate with the gesture.
3. Perform and hold the gesture in front of the webcam.
4. The application captures landmark information across multiple frames.
5. Face, hand, pose, and spatial features are extracted.
6. A representative gesture profile is created.
7. The profile is saved and associated with the selected meme.

```text
User Gesture + Selected Meme
            ↓
     MediaPipe Landmarks
            ↓
      Feature Extraction
            ↓
       Gesture Profile
            ↓
  Saved Calibration Record
```

The saved profiles allow the application to recognize personalized gestures during later sessions.

---

## Real-Time Matching

During live operation, the application extracts features from the current webcam frame and compares them with every calibrated profile.

The matching system evaluates four feature categories:

| Feature Category | Weight |
|---|---:|
| Face | **25%** |
| Hands | **30%** |
| Pose | **30%** |
| Spatial | **15%** |

The final score is based on a weighted combination of these similarities:

```text
Final Similarity =
(Face × 0.25)
+ (Hands × 0.30)
+ (Pose × 0.30)
+ (Spatial × 0.15)
```

The profile with the strongest confident score becomes the current candidate.

---

## Confidence Thresholding

A candidate must meet a minimum confidence level before it can be accepted.

```text
High Confidence
      ↓
Candidate Can Be Considered

Low Confidence
      ↓
No Confident Match
```

This reduces false matches caused by neutral poses or random movements.

---

## Temporal Smoothing

Landmark positions naturally fluctuate slightly between webcam frames. Without smoothing, small changes could cause rapid switching:

```text
Frame 1 → Meme A
Frame 2 → Meme B
Frame 3 → Meme A
Frame 4 → Meme C
```

To prevent this, a candidate must remain consistently strong for multiple frames before the displayed meme changes.

```text
A → A → A → A → A
        ↓
   Confirm Match
        ↓
    Switch Meme
```

This provides temporal stability and significantly reduces flickering.

---

# Performance Optimization

Hand detection is prioritized because hand landmarks are visibly displayed on the camera feed.

| Detection | Processing |
|---|---|
| Hands | Every frame |
| Face | Throttled when possible |
| Pose | Throttled when possible |

Previous face and pose results can be reused between detection frames to reduce processing load and improve responsiveness.

---

# Project Structure

```text
project/
│
├── frontend/
│   ├── index.html
│   ├── script.js
│   ├── styles.css
│   ├── features.js
│   ├── calibration.js
│   ├── matching.js
│   └── smoothing.js
│
└── memes/
    └── Cat reaction images
```

## File Responsibilities

| File | Purpose |
|---|---|
| **`index.html`** | Defines the application interface and controls |
| **`script.js`** | Coordinates webcam, MediaPipe detection, matching, and UI |
| **`styles.css`** | Controls layout, panel dimensions, and visual states |
| **`features.js`** | Converts MediaPipe landmarks into numerical features |
| **`calibration.js`** | Creates and manages personalized gesture profiles |
| **`matching.js`** | Compares live gestures with calibrated profiles |
| **`smoothing.js`** | Prevents unstable rapid meme switching |

---

# Did We Train a Model?

**Not in the traditional deep-learning sense.**

The project uses pretrained **MediaPipe** models for:

- Face landmark detection
- Hand landmark detection
- Pose landmark detection

It does **not** train a new neural network using a large dataset, epochs, backpropagation, or gradient descent.

Instead, the project builds a **personalized recognition layer** on top of pretrained computer-vision models.

```text
Pretrained MediaPipe Models
            +
     User Calibration
            ↓
Personalized Gesture Profiles
            ↓
Feature Similarity Matching
            ↓
   Real-Time Meme Recognition
```

This makes the application a **calibration-based personalized recognition system**.

---

# Technology

- **JavaScript**
- **HTML**
- **CSS**
- **MediaPipe Tasks Vision**
- **MediaPipe WASM**
- **Face Landmark Detection**
- **Hand Landmark Detection**
- **Pose Landmark Detection**
- **Browser Webcam APIs**
- **Local Persistent Storage**
- **Weighted Similarity Matching**
- **Confidence Thresholding**
- **Temporal Smoothing**

---

# Running the Project

Serve the frontend using a local web server:

```bash
cd frontend
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Allow webcam access when prompted.

---

# Example Output

> Add your actual screenshots or GIFs to this section.

The expected output consists of a live camera pane and a meme pane displayed side by side. The selected meme matches the camera pane's dimensions and updates when a confident gesture match is confirmed.

```text
┌─────────────────────────┐    ┌─────────────────────────┐
│                         │    │                         │
│      LIVE CAMERA        │    │      MATCHED MEME       │
│                         │    │                         │
│   Green hand landmarks  │    │   Current cat reaction  │
│   Matching information  │    │   Confidence / status   │
│                         │    │                         │
└─────────────────────────┘    └─────────────────────────┘
```

---

# Future Improvements

- Further matching-weight tuning using real calibration data
- Improved low-confidence feedback
- Automatic calibration quality validation
- Better handling of landmark occlusion
- More robust gesture classification
- Additional facial expression features
- Multi-user profiles
- Additional meme categories and randomized outputs
