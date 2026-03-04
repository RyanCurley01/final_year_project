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
  const { items, totalAmount, totalItems } = useSelector((state) => state.cart);
  const [showPayPal, setShowPayPal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paypalError, setPaypalError] = useState(null);
  const { currentUser } = useAuth();
  
  // Use authenticated user
  const user = currentUser ? { 
    accountId: currentUser.id, 
    email: currentUser.email || currentUser.accountEmailAddress 
  } : null;

  const handleRemove = (productId) => {
    dispatch(removeFromCart(productId));
  };

  const handleQuantityChange = (productId, newQuantity) => {
    dispatch(updateQuantity({ productId, quantity: newQuantity }));
  };

  const handleCreateOrder = async (data, actions) => {
    if (!user?.accountId) {
      console.error("Cannot create order: User not logged in or Account ID missing");
      setProcessingPayment(false);
      return; 
    }

    try {
      setProcessingPayment(true);
      
      // Step 1: Create an Order record
      const orderData = {
        accountId: user?.accountId,
        totalAmount: totalAmount,
      };
      
      const order = await orderService.createOrder(orderData);
      
      // Step 2: Create Order_Items for each cart item
      for (const item of items) {
        const orderItemData = {
          orderId: order.id,
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.albumPrice
        };
        const orderItem = await orderItemService.createOrderItem(orderItemData);
        
        // Note: Sold_Products, Purchased_Products, and CustomerSummary tables 
        // are automatically populated by the database trigger After_Order_Item_Insert 
        // whenever an Order_Item is created.
      }
      
      // Step 3: Create PayPal order (use first product ID for backward compatibility)
      const paypalOrderData = {
        amount: totalAmount,
        currency: 'EUR',
        accountId: user?.accountId,
        orderId: order.id,
        productId: items.length > 0 ? items[0].id : null, // First product for Payments table
        items: items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.albumPrice
        }))
      };
      
      const response = await paymentService.createPayPalOrder(paypalOrderData);
      return response.id;
    } catch (error) {
      setProcessingPayment(false);
      throw error;
    }
  };

  const handleApprove = async (data, actions) => {
    try {
      const response = await paymentService.capturePayPalOrder(data.orderID);
      
      // Add to purchase history
      dispatch(addPurchase({
        items: [...items],
        totalAmount,
        paymentId: data.orderID,
        status: 'completed'
      }));
      
      // Clear cart
      dispatch(clearCart());
      
      // Trigger automatic downloads for purchased items
      const filesToDownload = items
        .filter(item => {
          // Download music files from S3
          return item.fileUrl;
        })
        .map(item => ({
          url: item.fileUrl,
          filename: generateFilename(item, item.fileUrl)
        }));
      
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
      
      setShowPayPal(false);
      navigate('/purchase-history');
    } catch (error) {
      alert("Payment failed!");
    } finally {
      setProcessingPayment(false);
    }
  };

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

  return (
    <div className="flex flex-row gap-6">
      {/* Cart Items */}
      <div className="flex-1">
        <h2 className="text-white text-3xl font-bold mb-6">Shopping Cart ({totalItems} items)</h2>
        
        <div className="space-y-4">
          {items.map((item) => {
            const productName = item.albumTitle;
            const price = item.albumPrice;
            const coverMedia = item.albumCoverImageUrl;
            const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
            const isTeddyEmotion = productName && productName.toLowerCase().includes('teddy emotion');
            const useOnsetImages = isVideo && !isTeddyEmotion;

            return (
              <div key={item.id} className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex gap-4">
                {/* Product Image */}
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
                      onError={(e) => {
                        if (e.target.src !== placeholders.large) {
                          e.target.src = placeholders.large;
                        }
                      }}
                    />
                  )}
                </div>

                {/* Product Details */}
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg mb-1">{productName}</h3>
                  <p className="text-gray-400 text-sm mb-2">
                    Music
                  </p>
                  <p className="text-white font-bold">${price?.toFixed(2)}</p>
                </div>

                {/* Quantity Controls */}
                <div className="flex flex-col items-end justify-between">
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="text-red-500 hover:text-red-600 transition"
                    title="Remove from cart"
                  >
                    <FaTrash className="text-xl" />
                  </button>

                  <div className="flex items-center gap-2 bg-white/10 rounded-lg p-1">
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
              onClick={() => setShowPayPal(true)}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg transition"
              disabled={processingPayment}
            >
              Proceed to Checkout
            </button>
          ) : (
            <div className="space-y-3">
              {paypalError && (
                <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3 mb-3">
                  <p className="text-red-300 text-sm">{paypalError}</p>
                  <button
                    onClick={() => { setPaypalError(null); setShowPayPal(false); setProcessingPayment(false); }}
                    className="text-red-400 hover:text-red-300 text-xs underline mt-1"
                  >
                    Try Again
                  </button>
                </div>
              )}
              <PayPalButtons
                style={{ layout: "vertical" }}
                createOrder={handleCreateOrder}
                onApprove={handleApprove}
                onCancel={() => {
                  setShowPayPal(false);
                  setProcessingPayment(false);
                  setPaypalError(null);
                }}
                onError={(err) => {
                  console.error('PayPal error:', err);
                  setProcessingPayment(false);
                  setPaypalError('Payment could not be completed. Please try again.');
                }}
                disabled={processingPayment}
              />
              <button
                onClick={() => setShowPayPal(false)}
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
