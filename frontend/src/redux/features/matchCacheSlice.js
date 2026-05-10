import { createSlice } from '@reduxjs/toolkit';

// Status rank used to prevent downgrades:
//   resolved (2) beats notFound (1) beats warming/pending (0)
const STATUS_RANK = {
  pending: 0,
  warming: 0,
  not_found: 1,
  resolved: 2,
};

const matchCacheSlice = createSlice({
  name: 'matchCache',
  initialState: {
    // Flat object keyed by trackId string so Redux can serialize it.
    // Shape of each value:
    //   { matchStatus, matchedLibraryTrack?, matchedDbSong? }
    entries: {},
  },
  reducers: {
    // Merge a batch of new results in — never downgrades an existing resolved entry.
    // action.payload: { [trackId]: matchData }
    mergeMatchData(state, action) {
      Object.entries(action.payload).forEach(([id, incoming]) => {
        const existing = state.entries[id];
        const existingRank = STATUS_RANK[existing?.matchStatus] ?? -1;
        const incomingRank = STATUS_RANK[incoming?.matchStatus] ?? -1;
        if (incomingRank >= existingRank) {
          state.entries[id] = incoming;
        }
      });
    },

    // Force-set a single entry regardless of rank.
    // Used when the poll loop definitively resolves or exhausts a card.
    setMatchEntry(state, action) {
      const { trackId, data } = action.payload;
      state.entries[trackId] = data;
    },
  },
});

export const { mergeMatchData, setMatchEntry } = matchCacheSlice.actions;
export default matchCacheSlice.reducer;
