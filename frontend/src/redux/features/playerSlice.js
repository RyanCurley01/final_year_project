import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  currentSongs: [],
  currentIndex: 0,
  isActive: false,
  isPlaying: false,
  activeSong: {},
  genreListId: '',
  songEnded: false,
  playbackRate: 1.0,
};

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    setActiveSong: (state, action) => {
      state.activeSong = action.payload.song;

      if (action.payload?.data?.tracks?.hits) {
        state.currentSongs = action.payload.data.tracks.hits;
      } else if (action.payload?.data?.properties) {
        state.currentSongs = action.payload?.data?.tracks;
      } else {
        state.currentSongs = action.payload.data;
      }

      state.currentIndex = action.payload.i;
      state.isActive = true;
      // Reset playback rate to 1.0 when a new song starts playing
      state.playbackRate = 1.0;
    },

    nextSong: (state, action) => {
      if (state.currentSongs[action.payload]?.track) {
        state.activeSong = state.currentSongs[action.payload]?.track;
      } else {
        state.activeSong = state.currentSongs[action.payload];
      }

      state.currentIndex = action.payload;
      state.isActive = true;
      // Reset playback rate to 1.0 when moving to next song
      state.playbackRate = 1.0;
    },

    prevSong: (state, action) => {
      if (state.currentSongs[action.payload]?.track) {
        state.activeSong = state.currentSongs[action.payload]?.track;
      } else {
        state.activeSong = state.currentSongs[action.payload];
      }

      state.currentIndex = action.payload;
      state.isActive = true;
      // Reset playback rate to 1.0 when moving to previous song
      state.playbackRate = 1.0;
    },

    playPause: (state, action) => {
      state.isPlaying = action.payload;
      if (action.payload) {
        state.songEnded = false; // Reset when playing
      }
    },

    setPlaybackRate: (state, action) => {
      state.playbackRate = action.payload;
    },

    songEnded: (state) => {
      state.songEnded = true;
    },

    selectGenreListId: (state, action) => {
      state.genreListId = action.payload;
    },

    resetPlayer: (state) => {
      state.currentSongs = [];
      state.currentIndex = 0;
      state.isActive = false;
      state.isPlaying = false;
      state.activeSong = {};
      state.songEnded = false;
    },
  },
});

export const { setActiveSong, nextSong, prevSong, playPause, setPlaybackRate, songEnded, selectGenreListId, resetPlayer } = playerSlice.actions;

export default playerSlice.reducer;
