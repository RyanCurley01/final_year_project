# audio_service/feature_extraction.py
import os
import tempfile
import asyncio
import httpx
import numpy as np
import librosa
from urllib.parse import urlparse
from typing import Dict, Optional, List
from fastapi import HTTPException

from utils import console
from config import executor
from s3_service import generate_presigned_url


def derive_mood(valence: float, energy: float) -> str:
    """
    Derive mood from audio features using Russell's Circumplex Model of Affect.
    Maps valence (positivity) and energy (arousal) to four mood quadrants.
    
    Returns one of: 'Energetic', 'Happy', 'Calm', 'Sad'
    """
    if energy >= 0.55 and valence >= 0.45:
        return "Energetic"
    elif valence >= 0.45 and energy < 0.55:
        return "Happy"
    elif energy < 0.45 and valence < 0.45:
        return "Sad"
    else:
        return "Calm"


# EXECUTION ORDER: Can be called any time to analyze a URL.
# Uses 'executor' for CPU-bound tasks in background.
async def extract_features_for_product_async(product_id: int, file_url: str) -> Optional[Dict]:
    """
    Async wrapper to extract audio features from S3 in a thread pool.
    Used for real-time feature extraction when cache is empty.
    """
    loop = asyncio.get_event_loop()
    
    # Generate presigned URL if needed
    presigned_url = generate_presigned_url(file_url) if file_url else None
    if not presigned_url:
        return None
    
    # Run librosa extraction in thread pool (CPU-bound operation)
    features = await loop.run_in_executor(
        executor,
        extract_audio_features_librosa,
        presigned_url,
        product_id
    )
    
    return features

# EXECUTION ORDER: Called by async wrapper or directly.
# Heavy CPU operation.
def extract_audio_features_librosa(audio_url: str, product_id: int) -> Optional[Dict]:
    """
    Extract audio features from any audio URL using librosa.
    Uses industry-standard audio analysis for tempo, energy, valence, danceability, acousticness.
    NO hardcoded genre/mood classification - purely data-driven.
    
    This is the same approach used for iTunes but works for S3/database songs.
    
    Args:
        audio_url: URL to audio file (S3 presigned URL or direct link)
        product_id: Product ID for logging
        
    Returns:
        Dict with extracted features or None if extraction fails
    """
    try:
        # Validate URL format
        parsed_url = urlparse(audio_url)
        path = parsed_url.path.lower()
        
        # Skip non-audio files (ZIP, etc.)
        if path.endswith('.zip') or path.endswith('.rar') or path.endswith('.7z'):
            console.log(f"⚠️ Skipping audio analysis for archive file (product {product_id})")
            return None
        
        # Download the audio file with longer timeout for S3 presigned URLs
        try:
            response = httpx.get(audio_url, timeout=30.0, follow_redirects=True)
            if response.status_code != 200:
                console.log(f"⚠️ Failed to download audio for product {product_id}: {response.status_code}")
                return None
        except httpx.TimeoutException:
            console.log(f"⚠️ Timeout downloading audio for product {product_id}")
            return None
        except Exception as e:
            console.log(f"⚠️ Network error downloading audio for product {product_id}: {e}")
            return None
        
        # Determine file extension from URL or default to wav
        if '.mp3' in path:
            suffix = '.mp3'
        elif '.m4a' in path:
            suffix = '.m4a'
        elif '.wav' in path:
            suffix = '.wav'
        else:
            suffix = '.wav'  # Default
        
        # Save to temp file and load with librosa
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
            tmp_file.write(response.content)
            tmp_path = tmp_file.name
        
        try:
            # Load audio file (first 30 seconds for consistency)
            y, sr = librosa.load(tmp_path, sr=22050, mono=True, duration=30)
            
            # ===== TEMPO (BPM) =====
            # Extract tempo using beat tracking
            print("Extracting features with librosa...")
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            # Handle numpy array return from newer librosa versions
            if isinstance(tempo, np.ndarray):
                tempo = float(tempo.flat[0]) if tempo.size > 0 else 120.0
            else:
                tempo = float(tempo) if tempo else 120.0
            
            # ===== ENERGY =====
            # RMS energy normalized to 0-1 range
            rms = librosa.feature.rms(y=y)[0]
            energy = float(np.mean(rms) / np.max(rms)) if np.max(rms) > 0 else 0.5
            energy = min(1.0, max(0.0, energy * 2))  # Scale to 0-1 range
            
            # ===== SPECTRAL FEATURES =====
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
            
            # ===== VALENCE (Brightness/Positivity) =====
            # Estimated from spectral centroid - brighter sounds tend to feel more positive
            valence = float(np.mean(spectral_centroid) / sr)
            valence = min(1.0, max(0.0, valence * 4))
            
            # ===== DANCEABILITY =====
            # Combination of tempo stability and beat strength
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
            danceability = float(np.mean(pulse))
            danceability = min(1.0, max(0.0, danceability))
            
            # ===== ACOUSTICNESS =====
            # Ratio of low frequency to total energy
            spec = np.abs(librosa.stft(y))
            low_freq_energy = np.mean(spec[:int(spec.shape[0] * 0.1), :])
            total_energy = np.mean(spec)
            acousticness = float(low_freq_energy / total_energy) if total_energy > 0 else 0.3
            acousticness = min(1.0, max(0.0, acousticness * 2))
            
            # ===== LOUDNESS (dB) =====
            S = librosa.stft(y)
            loudness = float(librosa.amplitude_to_db(np.abs(S), ref=np.max).mean())
            
            # ===== INSTRUMENTALNESS =====
            # Lack of vocal frequencies (using zero crossing rate as proxy)
            zcr = librosa.feature.zero_crossing_rate(y)[0]
            zero_crossing_rate = float(np.mean(zcr))
            instrumentalness = float(np.clip(1 - zero_crossing_rate * 2, 0, 1))
            
            # ===== SPEECHINESS =====
            speechiness = float(1 - instrumentalness)
            
            # ===== SPECTRAL BANDWIDTH =====
            # Width of spectral content - separates dense sounds (IDM) from narrow (pop vocals)
            spectral_bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
            spectral_bandwidth = float(np.mean(spectral_bw))
            
            # ===== SPECTRAL CONTRAST =====
            # 7-band spectral contrast - captures texture differences between genres
            spec_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
            spectral_contrast_mean = [float(np.mean(spec_contrast[i])) for i in range(spec_contrast.shape[0])]
            
            # ===== RAW RMS ENERGY =====
            rms_energy = float(np.mean(rms))
            
            # ===== ONSET RATE =====
            # Onsets per second - IDM has complex rhythms vs simple pop patterns
            onsets = librosa.onset.onset_detect(y=y, sr=sr)
            onset_rate = float(len(onsets) / max(1, len(y) / sr))
            
            # ===== HARMONIC / PERCUSSIVE SEPARATION =====
            y_harmonic, y_percussive = librosa.effects.hpss(y)
            harmonic_energy = float(np.mean(y_harmonic ** 2))
            percussive_energy = float(np.mean(y_percussive ** 2))
            total_hp_energy = harmonic_energy + percussive_energy
            harmonic_ratio = float(harmonic_energy / total_hp_energy) if total_hp_energy > 0 else 0.5
            percussive_ratio = float(percussive_energy / total_hp_energy) if total_hp_energy > 0 else 0.5
            
            # ===== MFCC (Mel-Frequency Cepstral Coefficients) =====
            # Extract timbre/texture features - critical for similarity matching
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            mfcc_mean = [float(np.mean(mfcc[i])) for i in range(13)]
            
            # ===== CHROMA (Pitch Class Profile) =====
            # Extract harmonic/melodic features - critical for musical similarity
            chroma = librosa.feature.chroma_stft(y=y, sr=sr)
            chroma_mean = [float(np.mean(chroma[i])) for i in range(12)]
            
            # ===== KEY SIGNATURE & TIME SIGNATURE =====
            # Estimate key from chroma features
            key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            key_index = int(np.argmax(chroma_mean))
            key_signature = key_names[key_index]
            
            # Estimate time signature (4/4 is most common, but can be detected from beat analysis)
            time_signature = "4/4"  # Default for most electronic music
            
            # ===== DURATION =====
            duration = int(len(y) / sr)  # Duration in seconds
            
            # ===== MOOD (derived from valence + energy) =====
            mood = derive_mood(valence, energy)
            
            features = {
                'product_id': product_id,
                'tempo': round(tempo, 2),
                'energy': round(energy, 3),
                'valence': round(valence, 3),
                'danceability': round(danceability, 3),
                'acousticness': round(acousticness, 3),
                'loudness': round(loudness, 2),
                'instrumentalness': round(instrumentalness, 3),
                'speechiness': round(speechiness, 3),
                'spectral_centroid': round(float(np.mean(spectral_centroid)), 2),
                'spectral_rolloff': round(float(np.mean(spectral_rolloff)), 2),
                'zero_crossing_rate': round(zero_crossing_rate, 4),
                'spectral_bandwidth': round(spectral_bandwidth, 2),
                'spectral_contrast_mean': spectral_contrast_mean,
                'rms_energy': round(rms_energy, 6),
                'onset_rate': round(onset_rate, 3),
                'harmonic_ratio': round(harmonic_ratio, 4),
                'percussive_ratio': round(percussive_ratio, 4),
                'mfcc_mean': mfcc_mean,
                'chroma_mean': chroma_mean,
                'key_signature': key_signature,
                'time_signature': time_signature,
                'duration': duration,
                'mood': mood
            }
            
            console.log(f"✅ Librosa extracted FULL features for product {product_id}: tempo={tempo:.1f}, energy={energy:.2f}, key={key_signature}, mood={mood}, onset_rate={onset_rate:.2f}")
            return features
            
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            
    except ImportError as e:
        console.log(f"❌ librosa required but not available: {e}")
        return None
    except Exception as e:
        console.log(f"❌ Error extracting audio features for product {product_id}: {e}")
        return None

# EXECUTION ORDER: Called when iTunes preview needs analysis.
def extract_audio_features_from_preview(audio_url: str, track_id: int) -> Optional[Dict]:
    """
    Extract audio features from iTunes preview URL using librosa.
    Uses industry-standard audio analysis for tempo, energy, etc.
    Returns features in Spotify-like format for compatibility.
    """
    try:
        # Validate URL format
        parsed_url = urlparse(audio_url)
        path = parsed_url.path.lower()
        
        # Skip non-audio files (ZIP, etc.)
        if path.endswith('.zip') or path.endswith('.rar') or path.endswith('.7z'):
            console.log(f"⚠️ Skipping audio analysis for archive file: {audio_url}")
            return None
        
        # Download the preview audio
        # Download the preview audio with longer timeout for S3 presigned URLs
        try:
            response = httpx.get(audio_url, timeout=15.0, follow_redirects=True)
            if response.status_code != 200:
                console.log(f"⚠️ Failed to download preview for track {track_id}: {response.status_code}")
                return None
        except httpx.TimeoutException:
            console.log(f"⚠️ Timeout downloading preview for track {track_id}")
            return None
        except Exception as e:
            console.log(f"⚠️ Network error downloading preview for track {track_id}: {e}")
            return None
        
        # Save to temp file and load with librosa
        with tempfile.NamedTemporaryFile(suffix='.m4a', delete=False) as tmp_file:
            tmp_file.write(response.content)
            tmp_path = tmp_file.name
        
        try:
            # Load audio file
            y, sr = librosa.load(tmp_path, sr=22050, mono=True, duration=30)
            
            # Extract tempo (BPM) using beat tracking
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            # Handle numpy array return from newer librosa versions
            if isinstance(tempo, np.ndarray):
                tempo = float(tempo.flat[0]) if tempo.size > 0 else 120.0
            else:
                tempo = float(tempo) if tempo else 120.0
            
            # Extract energy (RMS energy normalized to 0-1)
            rms = librosa.feature.rms(y=y)[0]
            energy = float(np.mean(rms) / np.max(rms)) if np.max(rms) > 0 else 0.5
            energy = min(1.0, max(0.0, energy * 2))  # Scale to 0-1 range
            
            # Extract spectral features for valence estimation
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
            
            # Valence estimation (brightness/positivity)
            valence = float(np.mean(spectral_centroid) / sr)
            valence = min(1.0, max(0.0, valence * 4))
            
            # Danceability - combination of tempo stability and beat strength
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
            danceability = float(np.mean(pulse))
            danceability = min(1.0, max(0.0, danceability))
            
            # Acousticness - ratio of low frequency to total energy
            spec = np.abs(librosa.stft(y))
            low_freq_energy = np.mean(spec[:int(spec.shape[0] * 0.1), :])
            total_energy = np.mean(spec)
            acousticness = float(low_freq_energy / total_energy) if total_energy > 0 else 0.3
            acousticness = min(1.0, max(0.0, acousticness * 2))
            
            # ===== LOUDNESS (dB) =====
            S = librosa.stft(y)
            loudness = float(librosa.amplitude_to_db(np.abs(S), ref=np.max).mean())
            
            # ===== INSTRUMENTALNESS =====
            # Lack of vocal frequencies (using zero crossing rate as proxy)
            zcr = librosa.feature.zero_crossing_rate(y)[0]
            zero_crossing_rate = float(np.mean(zcr))
            instrumentalness = float(np.clip(1 - zero_crossing_rate * 2, 0, 1))
            
            # ===== SPEECHINESS =====
            speechiness = float(1 - instrumentalness)
            
            # ===== SPECTRAL BANDWIDTH =====
            spectral_bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
            spectral_bandwidth = float(np.mean(spectral_bw))
            
            # ===== SPECTRAL CONTRAST =====
            spec_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
            spectral_contrast_mean = [float(np.mean(spec_contrast[i])) for i in range(spec_contrast.shape[0])]
            
            # ===== RAW RMS ENERGY =====
            rms_energy = float(np.mean(rms))
            
            # ===== ONSET RATE =====
            onsets = librosa.onset.onset_detect(y=y, sr=sr)
            onset_rate = float(len(onsets) / max(1, len(y) / sr))
            
            # ===== HARMONIC / PERCUSSIVE SEPARATION =====
            y_harmonic, y_percussive = librosa.effects.hpss(y)
            harmonic_energy = float(np.mean(y_harmonic ** 2))
            percussive_energy = float(np.mean(y_percussive ** 2))
            total_hp_energy = harmonic_energy + percussive_energy
            harmonic_ratio = float(harmonic_energy / total_hp_energy) if total_hp_energy > 0 else 0.5
            percussive_ratio = float(percussive_energy / total_hp_energy) if total_hp_energy > 0 else 0.5
            
            # ===== MFCC (Mel-Frequency Cepstral Coefficients) =====
            # Extract timbre/texture features - critical for similarity matching
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            mfcc_mean = [float(np.mean(mfcc[i])) for i in range(13)]
            
            # ===== CHROMA (Pitch Class Profile) =====
            # Extract harmonic/melodic features - critical for musical similarity
            chroma = librosa.feature.chroma_stft(y=y, sr=sr)
            chroma_mean = [float(np.mean(chroma[i])) for i in range(12)]
            
            # ===== KEY SIGNATURE & TIME SIGNATURE =====
            # Estimate key from chroma features
            key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            key_index = int(np.argmax(chroma_mean))
            key_signature = key_names[key_index]
            
            # Estimate time signature (4/4 is most common, but can be detected from beat analysis)
            time_signature = "4/4"  # Default for most electronic music
            
            # ===== DURATION =====
            duration = int(len(y) / sr)  # Duration in seconds
            
            # ===== MOOD (derived from valence + energy) =====
            mood = derive_mood(valence, energy)
            
            features = {
                'track_id': track_id,
                'tempo': round(tempo, 1),
                'energy': round(energy, 3),
                'valence': round(valence, 3),
                'danceability': round(danceability, 3),
                'acousticness': round(acousticness, 3),
                'loudness': round(loudness, 2),
                'instrumentalness': round(instrumentalness, 3),
                'speechiness': round(speechiness, 3),
                'spectral_centroid': round(float(np.mean(spectral_centroid)), 2),
                'spectral_rolloff': round(float(np.mean(spectral_rolloff)), 2),
                'zero_crossing_rate': round(zero_crossing_rate, 4),
                'spectral_bandwidth': round(spectral_bandwidth, 2),
                'spectral_contrast_mean': spectral_contrast_mean,
                'rms_energy': round(rms_energy, 6),
                'onset_rate': round(onset_rate, 3),
                'harmonic_ratio': round(harmonic_ratio, 4),
                'percussive_ratio': round(percussive_ratio, 4),
                'mfcc_mean': mfcc_mean,
                'chroma_mean': chroma_mean,
                'key_signature': key_signature,
                'time_signature': time_signature,
                'duration': duration,
                'mood': mood
            }
            
            console.log(f"✅ Extracted FULL features for track {track_id}: tempo={tempo:.1f}, energy={energy:.2f}, key={key_signature}, mood={mood}, onset_rate={onset_rate:.2f}")
            return features
            
        finally:
            os.unlink(tmp_path)
            
    except ImportError as e:
        console.log(f"❌ librosa required but not available: {e}")
        raise HTTPException(status_code=503, detail="Audio analysis library (librosa) not available")
    except Exception as e:
        console.log(f"❌ Error extracting audio features for track {track_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Audio feature extraction failed: {e}")

async def extract_audio_features_from_preview_async(audio_url: str, track_id: int) -> Optional[Dict]:
    """Async wrapper for extract_audio_features_from_preview"""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(executor, extract_audio_features_from_preview, audio_url, track_id)
    except Exception as e:
        console.log(f"Async extraction failed: {e}")
        return None

