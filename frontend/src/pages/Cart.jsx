import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { FaTrash, FaMinus, FaPlus } from 'react-icons/fa';
import { PayPalButtons } from "@paypal/react-paypal-js";
import { useState } from 'react';

import { removeFromCart, updateQuantity, clearCart } from '../redux/features/cartSlice';
import { addPurchase } from '../redux/features/purchaseSlice';
import { paymentService } from '../redux/services/paymentService';
import { orderService } from '../redux/services/orderService';
import { orderItemService } from '../redux/services/orderItemService';
import { customerSummaryService } from '../redux/services/customerSummaryService';
import { soldProductsService } from '../redux/services/soldProductsService';
import placeholders from '../utils/placeholderImage';
import OnsetImageCard from '../components/OnsetImageCard';
import { downloadMultipleFiles, generateFilename } from '../utils/downloadHelper';

import { useAuth } from '../context/AuthContext';

const Cart = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  // Extract real-time cart state variables from the Redux store.
  const { items, totalAmount, totalItems } = useSelector((state) => state.cart);
  
  // Local UI state: controls whether the PayPal buttons are currently visible.
  const [showPayPal, setShowPayPal] = useState(false);
  
  // Local state: tracking if a payment API transaction is currently in mid-flight to disable buttons.
  const [processingPayment, setProcessingPayment] = useState(false);
  
  // Local state: holds custom error messages returned from the checkout process to display to the user.
  const [paypalError, setPaypalError] = useState(null);
  
  // Local state: stores the pre-created order so the PayPal createOrder callback only needs one fast API call.
  const [preparedOrder, setPreparedOrder] = useState(null);
  
  // Local state: counter used to force PayPal buttons to re-mount after errors (avoids frozen buttons).
  const [paypalKey, setPaypalKey] = useState(0);
  
  // Pull the active user session from Context.
  const { currentUser } = useAuth();
  
  // Standardize the user object payload expected by backend services (gracefully handle null if logged out).
  const user = currentUser ? { 
    accountId: currentUser.id, 
    email: currentUser.email || currentUser.accountEmailAddress 
  } : null;

  // Dispatches the ID to the cartSlice to remove the entire row from the array.
  const handleRemove = (productId) => {
    dispatch(removeFromCart(productId));
  };

  // Dispatches the new integer amount to the cartSlice to overwrite the previous quantity.
  const handleQuantityChange = (productId, newQuantity) => {
    dispatch(updateQuantity({ productId, quantity: newQuantity }));
  };

  // handleProceedToCheckout: Triggered when user clicks "Proceed to Checkout".
  // Creates the order and order items upfront so the PayPal createOrder callback only needs one fast API call.
  // This prevents mobile Safari from timing out the PayPal popup/redirect.
  const handleProceedToCheckout = async () => {
    if (!user?.accountId) {
      console.error("Cannot create order: User not logged in or Account ID missing");
      return;
    }

    try {
      setProcessingPayment(true);
      setPaypalError(null);

      // Step 1: Create a master 'Order' record attached to the user's account with the computed total.
      const orderData = {
        accountId: user?.accountId,
        totalAmount: totalAmount,
      };

      // Await backend Spring Boot orders-service.
      const order = await orderService.createOrder(orderData);

      // Step 2: Create all order items in parallel for speed.
      await Promise.all(items.map(item => {
        const orderItemData = {
          orderId: order.id,
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.albumPrice
        };
        return orderItemService.createOrderItem(orderItemData);
      }));

      // Note: Sold_Products, Purchased_Products, and CustomerSummary tables
      // are automatically populated by the MySQL database trigger After_Order_Item_Insert
      // whenever an Order_Item is created above.

      // Store the prepared order so createOrder can use it immediately.
      setPreparedOrder(order);
      setShowPayPal(true);
      setProcessingPayment(false);
    } catch (error) {
      console.error('Error preparing order:', error);
      setProcessingPayment(false);
      setPaypalError('Could not prepare your order. Please try again.');
    }
  };

  // handleCreateOrder: Triggered automatically the moment the user clicks the black or yellow PayPal/Debit button.
  // Now only makes one fast API call since the order was pre-created in handleProceedToCheckout.
  const handleCreateOrder = async (data, actions) => {
    try {
      setProcessingPayment(true);

      // Format the JSON strictly required by the official PayPal capture API.
      const paypalOrderData = {
        amount: totalAmount,
        currency: 'EUR',
        accountId: user?.accountId,
        orderId: preparedOrder.id,
        // The payments table requires a singular productId for legacy indexing logic; we pass the ID of the first item index.
        productId: items.length > 0 ? items[0].id : null,
        // Mapping Redux array items strictly into PayPal's expected Item syntax format.
        items: items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.albumPrice
        }))
      };

      // Send formatting to custom Spring Boot payments-service which generates the official PayPal token ID.
      const response = await paymentService.createPayPalOrder(paypalOrderData);

      // This returned string ID automatically pops up the secure PayPal 3rd-party modal.
      return response.id;
    } catch (error) {
      console.error('createPayPalOrder failed:', error.message);
      setProcessingPayment(false);
      throw error;
    }
  };

  // handleApprove: This runs *only* after the user successfully enters their password and click 'Pay' INSIDE the PayPal popup.
  const handleApprove = async (data, actions) => {
    try {
      // Step 4: Tell our backend to formally capture the pre-authorized funds and finalize the table row.
      const response = await paymentService.capturePayPalOrder(data.orderID);
      
      // Step 5: Save standard purchase details into a separate Redux slice for the "recent transactions" UI views.
      dispatch(addPurchase({
        items: [...items],
        totalAmount,
        paymentId: data.orderID,
        status: 'completed'
      }));
      
      // Step 6: Empty the shopping cart entirely since they have been bought. 
      dispatch(clearCart());
      
      // Step 7: Trigger automatic browser downloads for purchased digital MP3 assets.
      const filesToDownload = items
        .filter(item => {
          // Verify a direct S3 bucket URL exists on the object.
          return item.fileUrl;
        })
        .map(item => ({
          url: item.fileUrl,
          filename: generateFilename(item, item.fileUrl)
        }));
      
      // Utilizing utility script to batch-download multiple blobs simultaneously.
      if (filesToDownload.length > 0) {
        try {
          await downloadMultipleFiles(filesToDownload);
          alert("Payment successful! Your files are downloading. Redirecting to purchase history.");
        } catch (downloadError) {
          alert("Payment successful! However, some files failed to download. You can download them from purchase history.");
        }
      } else {
        alert("Payment successful! Redirecting to purchase history.");
      }
      
      // Cleanup visual state.
      setShowPayPal(false);
      
      // Reroute user to the summary page.
      navigate('/purchase-history');
    } catch (error) {
      alert("Payment failed!");
    } finally {
      // Re-enable interactive elements whether success or fail.
      setProcessingPayment(false);
    }
  };

  // Guard Clause: Render a placeholder Empty UI component if there's nothing in Redux `items`.
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <FaTrash className="text-gray-400 text-6xl mb-4" />
        <h2 className="text-white text-2xl font-bold mb-2">Your cart is empty</h2>
        <p className="text-gray-400 mb-6">Add some products to get started!</p>
        <div className="flex gap-4">
          <Link 
            to="/"
            className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg"
          >
            Continue Shopping
          </Link>
          <Link 
            to="/purchase-history"
            className="px-6 py-3 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-lg"
          >
            View Purchase History
          </Link>
        </div>
      </div>
    );
  }

  // Active Cart UI returning main flexible row template
  return (
    <div className="flex flex-row gap-6">
      {/* Container: Left side - displaying individual list of cart items */}
      <div className="flex-1">
        <h2 className="text-white text-3xl font-bold mb-6">Shopping Cart ({totalItems} items)</h2>
        
        <div className="space-y-4">
          {/* Dynamically building a UI card for every individual object inside the Redux items array */}
          {items.map((item) => {
            const productName = item.albumTitle;
            const price = item.albumPrice;
            const coverMedia = item.albumCoverImageUrl;
            
            // Evaluates string logic to determine if the media tag is a playable .mp4 or an image.
            const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
            const isTeddyEmotion = productName && productName.toLowerCase().includes('teddy emotion');
            
            // Certain video variations use custom OnsetImageCard rendering rather than standard <video> tags.
            const useOnsetImages = isVideo && !isTeddyEmotion;

            return (
              <div key={item.id} className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex gap-4">
                
                {/* Product Image Component logic map */}
                <div className="w-24 h-24 flex-shrink-0">
                  {useOnsetImages ? (
                    <OnsetImageCard
                      songTitle={productName}
                      songId={item.id}
                      className="w-full h-full rounded-lg object-cover"
                      isPlaying={false}
                      isActive={false}
                    />
                  ) : isVideo ? (
                    <video
                      src={coverMedia}
                      className="w-full h-full rounded-lg object-cover"
                      muted
                      loop
                      autoPlay
                    />
                  ) : (
                    <img
                      src={coverMedia || placeholders.large}
                      alt={productName}
                      className="w-full h-full rounded-lg object-cover"
                      // Fallback logic: if the image fails downloading from AWS, overwrite src with a local default image.
                      onError={(e) => {
                        if (e.target.src !== placeholders.large) {
                          e.target.src = placeholders.large;
                        }
                      }}
                    />
                  )}
                </div>

                {/* Product Title and Category Info */}
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-1">{productName}</h3>
                  <p className="text-gray-400 text-sm mb-2">
                    Music
                  </p>
                  <p className="text-white font-bold">${price?.toFixed(2)}</p>
                </div>

                {/* Product specific UI functionality mapping (remove icon, negative/positive quantity increments) */}
                <div className="flex flex-col items-end justify-between">
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="text-red-500 hover:text-red-600 transition"
                    title="Remove from cart"
                  >
                    <FaTrash className="text-xl" />
                  </button>

                  <div className="flex items-center gap-2 bg-white/10 rounded-lg p-1">
                    {/* Quantity Modifier controls containing logic logic that prevents decreasing lower than integer 1 */}
                    <button
                      onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                      className="p-2 hover:bg-white/10 rounded transition"
                      disabled={item.quantity <= 1}
                    >
                      <FaMinus className="text-white text-xs" />
                    </button>
                    <span className="text-white font-semibold min-w-[30px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                      className="p-2 hover:bg-white/10 rounded transition"
                    >
                      <FaPlus className="text-white text-xs" />
                    </button>
                  </div>

                  <p className="text-white font-semibold">
                    ${(price * item.quantity).toFixed(2)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Order Summary */}
      <div className="w-80 min-w-[280px]">
        <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 sticky top-4">
          <h3 className="text-white text-2xl font-bold mb-4">Order Summary</h3>
          
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-gray-300">
              <span>Items ({totalItems}):</span>
              <span>${totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Shipping:</span>
              <span className="text-green-400">FREE</span>
            </div>
            <div className="border-t border-gray-600 pt-3 flex justify-between text-white text-xl font-bold">
              <span>Total:</span>
              <span>${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {!user ? (
            <Link
              to="/login"
              className="w-full block text-center py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition"
            >
              Log in to Checkout
            </Link>
          ) : !showPayPal ? (
            <button
              onClick={handleProceedToCheckout}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg transition"
              disabled={processingPayment}
            >
              {processingPayment ? 'Preparing Order...' : 'Proceed to Checkout'}
            </button>
          ) : (
            <div className="space-y-3">
              {paypalError && (
                <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3 mb-3">
                  <p className="text-red-300 text-sm">{paypalError}</p>
                  <button
                    onClick={() => { setPaypalError(null); setShowPayPal(false); setProcessingPayment(false); setPreparedOrder(null); setPaypalKey(k => k + 1); }}
                    className="text-red-400 hover:text-red-300 text-xs underline mt-1"
                  >
                    Try Again
                  </button>
                </div>
              )}
              {!paypalError && (
                <PayPalButtons
                  key={paypalKey}
                  style={{ layout: "vertical" }}
                  createOrder={handleCreateOrder}
                  onApprove={handleApprove}
                  onCancel={() => {
                    setShowPayPal(false);
                    setProcessingPayment(false);
                    setPaypalError(null);
                    setPreparedOrder(null);
                  }}
                  onError={(err) => {
                    console.error('PayPal error:', err);
                    setProcessingPayment(false);
                    setPaypalError('Payment could not be completed. Please try again.');
                  }}
                  disabled={processingPayment}
                />
              )}
              <button
                onClick={() => { setShowPayPal(false); setPreparedOrder(null); }}
                className="w-full py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition"
                disabled={processingPayment}
              >
                Cancel
              </button>
            </div>
          )}

          <Link
            to="/"
            className="block text-center mt-4 text-blue-400 hover:text-blue-300 transition"
          >
            ← Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Cart;
