// createSlice: This is a powerful utility from Redux Toolkit. It simplifies standard Redux boilerplate. 
// Instead of manually writing action types, action creators, and multiple switch-case statements 
// in a reducer function, createSlice generates all of this automatically based on the functions you provide it.
import { createSlice } from '@reduxjs/toolkit';

// initialState: This object represents the default state of the cart when the application first loads 
// or when a user first visits the site.
const initialState = {
  // holds the product objects the user adds to their cart.
  items: [], 

  // A number (0) representing the total financial cost of the cart.
  totalAmount: 0,

  // A number (0) representing the total quantity of individual items currently in the cart.
  totalItems: 0,
};

const cartSlice = createSlice({
  // name: 'cart': The namespace for this slice. 
  // Generated action types will be prefixed with this name (e.g., cart/addToCart).
  name: 'cart',

  // Passes the default defined above into the slice
  initialState,

  // This object contains "reducer functions". 
  // Reducers define how the state should change when specific actions occur.
  reducers: {
    addToCart: (state, action) => {

      // The data passed when calling this action 
      // (in this case, the product object being added, like a song or album).
      const product = action.payload;

      // Checks if the item is already in the cart array by comparing IDs.
      const existingItem = state.items.find(item => item.id === product.id);
      
      // if the item is already there, it simply increments the quantity 
      // of that specific item by 1 rather than adding a duplicate row.
      if (existingItem) {
        existingItem.quantity += 1;
      } 
      
      // If the item doesn't exist yet, it adds it to the items array.
      else {
        // Add new item with quantity 1
        state.items.push({
          // Uses the spread operator to copy all properties of the original product (like title, image, etc.).
          ...product,
          
          // Initializes the item quantity to 1.
          quantity: 1,

          // Timestamps when the item was added.
          addedAt: new Date().toISOString()
        });
      }
      
      // After adding the item, the slice updates the global totals using the array reduce() method

      // Loops through every item in the cart, grabbing its quantity,
      // and adds them all together (starting from a sum of 0).
      state.totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0);

      // Also loops through the cart.
      state.totalAmount = state.items.reduce((sum, item) => {

        // For every item, it attempts to capture item.albumPrice.
        // If albumPrice doesn't exist, it defaults to 0 (preventing NaN errors).
        const price = item.albumPrice || 0;

        // It multiplies the price by the quantity for that row and adds it to the running sum
        return sum + (price * item.quantity);
      }, 0);
    },
    
    removeFromCart: (state, action) => {
      // The payload here is expected to be the ID of the product to remove.
      const productId = action.payload;

      // Overwrites the items array with a new array containing only items 
      // whose id does not match the productId being removed.
      state.items = state.items.filter(item => item.id !== productId);
      
      // Recalculate totals using the exact same logic as above.
      state.totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0);
      state.totalAmount = state.items.reduce((sum, item) => {
        const price = item.albumPrice || 0;
        return sum + (price * item.quantity);
      }, 0);
    },
    
    updateQuantity: (state, action) => {
      // Destructures the payload expecting an object with productId and the new quantity.
      const { productId, quantity } = action.payload;
      
      // Finds the target item in the cart array by ID.
      const item = state.items.find(item => item.id === productId);
      
      if (item) {
        if (quantity <= 0) {
          // If the new requested quantity is 0 or less, 
          // it completely removes the item from the cart using .filter().
          state.items = state.items.filter(item => item.id !== productId);
        } else {
          // If valid, it cleanly overwrites the old quantity with the new one.
          item.quantity = quantity;
        }
        
        // Recalculate totals
        state.totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0);
        state.totalAmount = state.items.reduce((sum, item) => {
          const price = item.albumPrice || 0;
          return sum + (price * item.quantity);
        }, 0);
      }
    },
    
    clearCart: (state) => {
      // This completely resets the state slice back to its initial values,
      // emptying the cart of all items and setting totals to 0.
      state.items = [];
      state.totalAmount = 0;
      state.totalItems = 0;
    },
  },
});

// Action Creators: createSlice automatically generated action creator functions matching the reducers.
// These are destructured from cartSlice.actions and exported so they can be dispatched from UI components.
export const { addToCart, removeFromCart, updateQuantity, clearCart } = cartSlice.actions;

// Reducer: The compiled reducer function handling all these cases is exported as the default export.
// This is what gets wired into the root store inside your store.js file.
export default cartSlice.reducer;
