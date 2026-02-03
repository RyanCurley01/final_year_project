# audio_service/feature_extraction.py
import os
import tempfile
import asyncio
import httpx
import numpy as np
import librosa
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from urllib.parse import urlparse
from typing import Dict, Optional, List
from fastapi import HTTPException

from utils import console
from config import executor
from s3_service import generate_presigned_url

# Global classifier state
# EXECUTION ORDER: Initialized later by train_genre_classifier or implicitly.
genre_classifier = None
genre_labels = ["Energetic", "Calm", "Balanced"]

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
            tempo = float(tempo) if hasattr(tempo, '__float__') else float(tempo[0]) if len(tempo) > 0 else 120.0
            
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
                'mfcc_mean': mfcc_mean,
                'chroma_mean': chroma_mean,
                'key_signature': key_signature,
                'time_signature': time_signature,
                'duration': duration
            }
            
            console.log(f"✅ Librosa extracted FULL features for product {product_id}: tempo={tempo:.1f}, energy={energy:.2f}, key={key_signature}")
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
            tempo = float(tempo) if hasattr(tempo, '__float__') else float(tempo[0]) if len(tempo) > 0 else 120.0
            
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
                'mfcc_mean': mfcc_mean,
                'chroma_mean': chroma_mean,
                'key_signature': key_signature,
                'time_signature': time_signature,
                'duration': duration
            }
            
            console.log(f"✅ Extracted FULL features for track {track_id}: tempo={tempo:.1f}, energy={energy:.2f}, key={key_signature}")
            return features
            
        finally:
            os.unlink(tmp_path)
            
    except ImportError as e:
        console.log(f"❌ librosa required but not available: {e}")
        raise HTTPException(status_code=503, detail="Audio analysis library (librosa) not available")
    except Exception as e:
        console.log(f"❌ Error extracting audio features for track {track_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Audio feature extraction failed: {e}")

# EXECUTION ORDER: Called when a genre needs to be classified from features.
def classify_genre_from_features(tempo: float, energy: float, valence: float, danceability: float, acousticness: float, current_cache_size: int = 0, current_cache_items: Dict = {}) -> str:
    """
    Classify genre using K-Means clustering on audio features.
    Automatically detects 3 genre clusters: Energetic, Calm, Balanced.
    """
    global genre_classifier
    
    # Train classifier if not already trained
    if genre_classifier is None and current_cache_size >= 10:
        # Extract features from cache
        X_train = []
        for pid, data in current_cache_items.items():
            if all(k in data for k in ['tempo', 'energy', 'valence', 'danceability', 'acousticness']):
                X_train.append([
                    float(data['tempo'] or 0) / 200.0,  # Normalize tempo (0-200 BPM -> 0-1)
                    float(data['energy'] or 0),
                    float(data['valence'] or 0),
                    float(data['danceability'] or 0),
                    float(data['acousticness'] or 0)
                ])
        
        if len(X_train) >= 10:
            # Normalize features
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X_train)
            
            # Fit K-Means with 3 clusters
            genre_classifier = {
                'model': KMeans(n_clusters=3, random_state=42, n_init=10),
                'scaler': scaler
            }
            genre_classifier['model'].fit(X_scaled)
            
            # Determine which cluster represents which genre based on centroids
            centroids = genre_classifier['model'].cluster_centers_
            # Energy is index 1 in scaled features
            energy_values = centroids[:, 1]
            
            # Sort clusters by energy: Low energy = Calm, High energy = Energetic, Middle = Balanced
            sorted_indices = np.argsort(energy_values)
            genre_classifier['mapping'] = {
                sorted_indices[0]: "Calm",       # Lowest energy cluster
                sorted_indices[1]: "Balanced",   # Middle energy cluster  
                sorted_indices[2]: "Energetic"   # Highest energy cluster
            }
            
            console.log(f"✅ Genre classifier trained with 3 clusters (Energetic, Calm, Balanced)")
    
    # Classify the new features
    if genre_classifier:
        features = np.array([[tempo, energy, valence, danceability, acousticness]])
        features_scaled = genre_classifier['scaler'].transform(features)
        cluster = genre_classifier['model'].predict(features_scaled)[0]
        return genre_classifier['mapping'][cluster]
    else:
        # Fallback: Simple heuristic classification
        if energy > 0.7:
            return "Energetic"
        elif energy < 0.3:
            return "Calm"
        else:
            return "Balanced"

async def extract_audio_features_from_preview_async(audio_url: str, track_id: int) -> Optional[Dict]:
    """Async wrapper for extract_audio_features_from_preview"""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(executor, extract_audio_features_from_preview, audio_url, track_id)
    except Exception as e:
        console.log(f"Async extraction failed: {e}")
        return None
