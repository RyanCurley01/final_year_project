import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  purchases: [], // Array of completed purchases
  loading: false,
  error: null,
};

const purchaseSlice = createSlice({
  name: 'purchase',
  initialState,
  reducers: {
    addPurchase: (state, action) => {
      state.purchases.unshift({
        ...action.payload,
        purchaseDate: new Date().toISOString(),
        id: `purchase-${Date.now()}`
      });
    },
    
    setPurchases: (state, action) => {
      state.purchases = action.payload;
    },
    
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    
    setError: (state, action) => {
      state.error = action.payload;
    },
  },
});

export const { addPurchase, setPurchases, setLoading, setError } = purchaseSlice.actions;
export default purchaseSlice.reducer;
