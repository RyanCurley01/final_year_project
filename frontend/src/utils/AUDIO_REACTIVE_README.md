# Audio-Reactive Sky Detection System

## Overview

This system combines **onset detection** for music signals with **sky segmentation** using TensorFlow.js to create visually reactive video experiences. The sky color in video album covers changes in response to percussive drum hits detected in the audio.

## Components

### 1. OnsetDetector (`utils/onsetDetection.js`)

Implements percussive onset detection based on the paper "A Tutorial on Onset Detection in Music Signals" by J.P. Bello et al.

**Features:**
- **High-Frequency Content (HFC)**: Weighted sum of spectral magnitudes, excellent for detecting percussive transients
- **Spectral Flux**: Measures rapid changes in the spectrum with half-wave rectification
- **Peak Picking**: Adaptive threshold-based onset detection with minimum time spacing to prevent double detection

**Algorithm:**
```javascript
HFC(n) = Σ(k * |X(k)|²)  // k = frequency bin, X(k) = magnitude
```

The HFC method weights higher frequencies more heavily, making it particularly effective for detecting drum hits and other percussive sounds.

### 2. SkySegmentation (`utils/skySegmentation.js`)

Uses TensorFlow.js to detect and segment sky regions in video frames using color and position heuristics.

**Sky Detection Criteria:**
1. **High Blue Channel**: Sky typically has strong blue component
2. **Blue > Red**: Sky has more blue than red in RGB space
3. **Position Weight**: Upper portion of image more likely to be sky

**Process:**
- Converts video frame to tensor
- Applies color-based sky detection
- Creates binary mask for sky regions
- Blends sky mask with chosen color overlay

### 3. AudioReactiveVideo (`components/AudioReactiveVideo.jsx`)

React component that ties everything together:

**Features:**
- Connects video audio to onset detector via Web Audio API
- Processes video frames through sky segmentation
- Changes sky color on drum hit detection
- Synchronizes with Redux player state for volume and playback

**Color Palette:**
- Sky Blue: `[135, 206, 235]`
- Hot Pink: `[255, 105, 180]`
- Blue Violet: `[138, 43, 226]`
- Gold: `[255, 215, 0]`
- Cyan: `[0, 255, 255]`
- Tomato Red: `[255, 99, 71]`
- Lime Green: `[50, 205, 50]`
- Dark Orange: `[255, 140, 0]`
- Medium Purple: `[147, 112, 219]`
- Turquoise: `[64, 224, 208]`

## Integration

### TopPlay Component
The `TopChartCard` in `TopPlay.jsx` uses `AudioReactiveVideo` for the top 5 songs display.

### SongCard Component
The `SongCard.jsx` component uses `AudioReactiveVideo` for all video album covers in the main grid.

## Technical Details

### Web Audio API Chain
```
MediaElementSource → OnsetDetector.analyser → AudioContext.destination
                           ↓
                    Onset Detection
                           ↓
                    Color Change Event
```

### Video Processing Pipeline
```
Video Element → Canvas → TensorFlow.js Processing → Modified Canvas
                              ↓
                         Sky Segmentation
                              ↓
                         Color Application
```

### Performance Considerations

1. **TensorFlow.js Backend**: Uses WebGL for GPU acceleration
2. **Frame Processing**: Only processes when video is playing and active
3. **Memory Management**: Properly disposes tensors to prevent memory leaks
4. **Audio Context**: Suspended until user interaction (browser autoplay policy)

## Parameters

### OnsetDetector
```javascript
{
  fftSize: 2048,        // FFT size for frequency analysis
  threshold: 0.25,      // Onset detection threshold (0-1)
  hopSize: 512,         // Hop size between frames
  minTimeBetweenOnsets: 100  // Minimum ms between detections
}
```

### SkySegmentation
```javascript
{
  blendFactor: 0.5,     // How much color to apply (0-1)
  threshold: 0.6        // Sky detection threshold (0-1)
}
```

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Requires user gesture for audio context
- **Mobile**: Limited by device performance

## Future Enhancements

1. **Deep Learning Sky Segmentation**: Use pre-trained models like DeepLabv3 for more accurate sky detection
2. **Multiple Onset Types**: Detect different instrument types (bass, snare, hi-hat)
3. **Advanced Visualizations**: Add particle effects, gradient transitions
4. **User Controls**: Allow threshold and color palette customization
5. **Performance Optimization**: Web Worker for TensorFlow.js processing

## Dependencies

- `@tensorflow/tfjs`: ^4.x
- Web Audio API (native)
- Canvas API (native)
- React 19.x
- Redux Toolkit

## Usage Example

```jsx
import AudioReactiveVideo from './AudioReactiveVideo';

<AudioReactiveVideo
  src="/path/to/video.mp4"
  alt="Album Cover"
  className="w-full h-full rounded-lg"
  isPlaying={isPlaying}
  isActive={isActive}
  onError={(e) => console.error(e)}
/>
```

## References

- Bello, J.P., et al. (2005). "A Tutorial on Onset Detection in Music Signals." IEEE Transactions on Speech and Audio Processing, 13(5).
- TensorFlow.js Documentation: https://www.tensorflow.org/js
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
