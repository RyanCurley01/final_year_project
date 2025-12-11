"""
YouTube API Service
Standalone service for fetching YouTube channel data
"""
import os
from typing import Dict, List, Optional
from dotenv import load_dotenv
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Load environment variables
load_dotenv()

class YouTubeService:
    """Service for interacting with YouTube Data API v3"""
    
    def __init__(self, api_key: Optional[str] = None, channel_id: Optional[str] = None):
        """
        Initialize YouTube Service
        
        Args:
            api_key: YouTube API key (defaults to env YOUTUBE_API_KEY)
            channel_id: YouTube channel ID or handle (defaults to env YOUTUBE_CHANNEL_ID)
        """
        self.api_key = api_key or os.getenv("YOUTUBE_API_KEY")
        self.channel_id = channel_id or os.getenv("YOUTUBE_CHANNEL_ID", "@Ritrix252")
        self.youtube = None
        
        # Validate configuration
        if not self.api_key or self.api_key == "your_youtube_api_key_here":
            print("WARNING: YouTube API key not configured properly")
        
        if self.api_key and self.api_key != "your_youtube_api_key_here":
            self.youtube = build('youtube', 'v3', developerKey=self.api_key)
    
    def get_top_songs(self, max_results: int = 10) -> Dict:
        """
        Fetch top songs/videos from the YouTube channel
        
        Args:
            max_results: Maximum number of videos to return (default: 10)
            
        Returns:
            Dictionary containing video data or error information
        """
        # Validate API key
        if not self.api_key or self.api_key == "your_youtube_api_key_here":
            print("ERROR: YouTube API key not configured properly")
            return {
                "error": "YouTube API key not configured properly",
                "fallback_data": [
                    {"id": "demo1", "key": "demo1", "title": "Sample Song 1 (Demo)"},
                    {"id": "demo2", "key": "demo2", "title": "Sample Song 2 (Demo)"},
                    {"id": "demo3", "key": "demo3", "title": "Sample Song 3 (Demo)"}
                ]
            }
        
        # Validate channel ID exists
        if not self.channel_id:
            print("ERROR: YouTube channel ID not configured")
            return {
                "error": "YouTube channel ID not configured",
                "fallback_data": [
                    {"id": "demo1", "key": "demo1", "title": "Sample Song 1 (Demo)"},
                    {"id": "demo2", "key": "demo2", "title": "Sample Song 2 (Demo)"}
                ]
            }
        
        try:
            print(f"Attempting to fetch YouTube data for channel: {self.channel_id}")
            
            # For @username format, we need to search for the channel
            channel_username = self.channel_id.replace('@', '') if self.channel_id.startswith('@') else self.channel_id
            print(f"Searching for channel: {channel_username}")
            
            # Search for the channel by username/handle with error handling
            try:
                search_response = self.youtube.search().list(
                    part='snippet',
                    q=channel_username,
                    type='channel',
                    maxResults=1
                ).execute()
            except HttpError as e:
                print(f"Search API error: {e}")
                if e.resp.status == 403:
                    return {
                        "error": "YouTube API quota exceeded or access denied",
                        "fallback_data": [
                            {"id": "quota1", "key": "quota1", "title": "API Quota Demo Song 1"},
                            {"id": "quota2", "key": "quota2", "title": "API Quota Demo Song 2"}
                        ]
                    }
                raise
            
            if not search_response.get('items'):
                print(f"Channel '{self.channel_id}' not found in search results")
                return {
                    "error": f"Channel '{self.channel_id}' not found",
                    "fallback_data": [
                        {"id": "notfound1", "key": "notfound1", "title": "Channel Not Found Demo 1"}
                    ]
                }
            
            # Get the actual channel ID
            channel_id = search_response['items'][0]['snippet']['channelId']
            print(f"Found channel ID: {channel_id}")
            
            # Get the channel's uploads playlist ID
            try:
                channel_response = self.youtube.channels().list(
                    part='contentDetails,snippet',
                    id=channel_id
                ).execute()
            except HttpError as e:
                print(f"Channel details API error: {e}")
                raise
            
            if not channel_response.get('items'):
                return {
                    "error": "Channel details not found",
                    "fallback_data": [
                        {"id": "nodetails1", "key": "nodetails1", "title": "No Channel Details Demo"}
                    ]
                }
            
            # Get the uploads playlist ID
            uploads_playlist_id = channel_response['items'][0]['contentDetails']['relatedPlaylists']['uploads']
            print(f"Uploads playlist ID: {uploads_playlist_id}")
            
            # Fetch videos from the uploads playlist with reduced maxResults for stability
            try:
                playlist_response = self.youtube.playlistItems().list(
                    part='snippet,contentDetails',
                    playlistId=uploads_playlist_id,
                    maxResults=min(25, max_results * 2)  # Reduced for stability
                ).execute()
            except HttpError as e:
                print(f"Playlist API error: {e}")
                raise
            
            # Get video IDs and handle empty playlists
            video_ids = [item['contentDetails']['videoId'] for item in playlist_response.get('items', [])]
            
            if not video_ids:
                return {
                    "message": "No videos found in channel",
                    "data": []
                }
            
            print(f"Found {len(video_ids)} videos to process")
            
            # Get video statistics with batch processing for large lists
            try:
                # Process in smaller batches to avoid API limits
                batch_size = 20
                all_videos = []
                
                for i in range(0, len(video_ids), batch_size):
                    batch_ids = video_ids[i:i + batch_size]
                    videos_response = self.youtube.videos().list(
                        part='statistics,snippet,contentDetails',
                        id=','.join(batch_ids)
                    ).execute()
                    all_videos.extend(videos_response.get('items', []))
                
            except HttpError as e:
                print(f"Video statistics API error: {e}")
                # Return basic video info without statistics if stats API fails
                songs = []
                for i, video_id in enumerate(video_ids[:max_results]):
                    songs.append({
                        'id': video_id,
                        'key': video_id,
                        'title': f"Video {i+1} (Stats unavailable)",
                    })
                return {"data": songs, "note": "Video statistics unavailable"}
            
            # Sort videos by view count (descending) with error handling
            try:
                videos_sorted = sorted(
                    all_videos,
                    key=lambda x: int(x.get('statistics', {}).get('viewCount', 0)),
                    reverse=True
                )
            except (ValueError, TypeError) as e:
                print(f"Error sorting videos: {e}")
                # If sorting fails, just use the original order
                videos_sorted = all_videos
            
            # Take only the requested number of top videos
            top_videos = videos_sorted[:max_results]
            
            # Format the response with error handling
            songs = []
            for video in top_videos:
                try:
                    songs.append({
                        'id': video['id'],
                        'key': video['id'],  # For React key prop
                        'title': video.get('snippet', {}).get('title', 'Unknown Title'),
                        'viewCount': int(video.get('statistics', {}).get('viewCount', 0)),
                        'publishedAt': video.get('snippet', {}).get('publishedAt', '')
                    })
                except Exception as e:
                    print(f"Error processing video {video.get('id', 'unknown')}: {e}")
                    continue
            
            print(f"Successfully processed {len(songs)} songs")
            return {"data": songs}
            
        except HttpError as e:
            error_msg = f"YouTube API error: {str(e)}"
            print(error_msg)
            
            # Return fallback data instead of raising exception
            return {
                "error": error_msg,
                "fallback_data": [
                    {"id": "error1", "key": "error1", "title": "API Error Demo Song 1"},
                    {"id": "error2", "key": "error2", "title": "API Error Demo Song 2"}
                ]
            }
            
        except Exception as e:
            error_msg = f"Error fetching YouTube data: {str(e)}"
            print(error_msg)
            
            # Return fallback data instead of crashing
            return {
                "error": error_msg,
                "fallback_data": [
                    {"id": "fallback1", "key": "fallback1", "title": "Fallback Demo Song 1"},
                    {"id": "fallback2", "key": "fallback2", "title": "Fallback Demo Song 2"},
                    {"id": "fallback3", "key": "fallback3", "title": "Fallback Demo Song 3"}
                ]
            }
    
    def get_test_songs(self) -> Dict:
        """
        Test method that returns mock data without making YouTube API calls
        Useful for debugging and development
        
        Returns:
            Dictionary containing test video data
        """
        return {
            "data": [
                {"id": "test1", "key": "test1", "title": "Test Song 1", "viewCount": 1000000, "publishedAt": "2024-01-01"},
                {"id": "test2", "key": "test2", "title": "Test Song 2", "viewCount": 850000, "publishedAt": "2024-01-15"},
                {"id": "test3", "key": "test3", "title": "Test Song 3", "viewCount": 720000, "publishedAt": "2024-02-01"},
                {"id": "test4", "key": "test4", "title": "Test Song 4", "viewCount": 650000, "publishedAt": "2024-02-15"},
                {"id": "test5", "key": "test5", "title": "Test Song 5", "viewCount": 500000, "publishedAt": "2024-03-01"}
            ],
            "note": "This is test data for development purposes"
        }
    
    def check_config(self) -> Dict:
        """
        Check the current configuration without making external API calls
        
        Returns:
            Dictionary containing configuration status
        """
        return {
            "youtube_api_configured": bool(self.api_key and self.api_key != "your_youtube_api_key_here"),
            "youtube_channel_configured": bool(self.channel_id),
            "channel_id": self.channel_id,
            "api_key_present": bool(self.api_key),
            "service_initialized": self.youtube is not None
        }
