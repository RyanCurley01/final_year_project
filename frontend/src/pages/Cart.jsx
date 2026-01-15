import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { FaTrash, FaMinus, FaPlus } from 'react-icons/fa';
import { PayPalButtons } from "@paypal/react-paypal-js";
import { useState } from 'react';

import { removeFromCart, updateQuantity, clearCart } from '../redux/features/cartSlice';
import { addPurchase } from '../redux/features/purchaseSlice';
import { paymentService } from '../redux/services/paymentService';
import { orderService } from '../redux/services/orderService';
import { orderItemService } from '../redux/services/orderItemService';
import placeholders from '../utils/placeholderImage';
import { downloadMultipleFiles, generateFilename } from '../utils/downloadHelper';

const Cart = () => {
  const dispatch = useDispatch();
  const { items, totalAmount, totalItems } = useSelector((state) => state.cart);
  const [showPayPal, setShowPayPal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  
  // Authentication credentials (hardcoded for demo)
  const email = 'john.smith@store.com';
  const password = 'password';
  const user = { accountId: 1, email };

  const handleRemove = (productId) => {
    dispatch(removeFromCart(productId));
  };

  const handleQuantityChange = (productId, newQuantity) => {
    dispatch(updateQuantity({ productId, quantity: newQuantity }));
  };

  const handleCreateOrder = async (data, actions) => {
    try {
      setProcessingPayment(true);
      
      // Step 1: Create an Order record
      const orderData = {
        accountId: user?.accountId,
        totalAmount: totalAmount,
      };
      
      const order = await orderService.createOrder(orderData, email, password);
      console.log('✅ Order created:', order);
      
      // Step 2: Create Order_Items for each cart item
      for (const item of items) {
        const orderItemData = {
          orderId: order.id,
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.albumPrice || item.gamePrice
        };
        await orderItemService.createOrderItem(orderItemData, email, password);
      }
      console.log('✅ Order items created for', items.length, 'products');
      
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
          price: item.albumPrice || item.gamePrice
        }))
      };
      
      const response = await paymentService.createPayPalOrder(paypalOrderData, email, password);
      return response.id;
    } catch (error) {
      console.error("Error creating PayPal order:", error);
      setProcessingPayment(false);
      throw error;
    }
  };

  const handleApprove = async (data, actions) => {
    try {
      const response = await paymentService.capturePayPalOrder(data.orderID, email, password);
      console.log("Payment successful:", response);
      
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
          // Only download music files (WAV files from S3)
          // Skip games since they link to itch.io
          const isMusic = item.albumTitle !== null && item.albumTitle !== undefined;
          return isMusic && item.fileUrl;
        })
        .map(item => ({
          url: item.fileUrl,
          filename: generateFilename(item, item.fileUrl)
        }));
      
      if (filesToDownload.length > 0) {
        console.log(`Starting download of ${filesToDownload.length} file(s)...`);
        try {
          await downloadMultipleFiles(filesToDownload);
          alert("Payment successful! Your files are downloading. Check your purchase history for details.");
        } catch (downloadError) {
          console.error("Error downloading files:", downloadError);
          alert("Payment successful! However, some files failed to download. Check your purchase history to download them manually.");
        }
      } else {
        alert("Payment successful! Check your purchase history.");
      }
      
      setShowPayPal(false);
    } catch (error) {
      console.error("Error capturing PayPal order:", error);
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
        <Link 
          to="/"
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Cart Items */}
      <div className="flex-1">
        <h2 className="text-white text-3xl font-bold mb-6">Shopping Cart ({totalItems} items)</h2>
        
        <div className="space-y-4">
          {items.map((item) => {
            const isMusic = item.albumTitle !== null && item.albumTitle !== undefined;
            const productName = isMusic ? item.albumTitle : item.gameTitle;
            const price = isMusic ? item.albumPrice : item.gamePrice;
            const coverMedia = isMusic ? item.albumCoverImageUrl : item.gameCoverImageUrl;
            const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');

            return (
              <div key={item.id} className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex gap-4">
                {/* Product Image */}
                <div className="w-24 h-24 flex-shrink-0">
                  {isVideo ? (
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
                    {isMusic ? 'Music' : 'Game'} {item.platform && `• Platform: ${item.platform}`}
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
      <div className="lg:w-96">
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

          {!showPayPal ? (
            <button
              onClick={() => setShowPayPal(true)}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg transition"
              disabled={processingPayment}
            >
              Proceed to Checkout
            </button>
          ) : (
            <div className="space-y-3">
              <PayPalButtons
                style={{ layout: "vertical" }}
                createOrder={handleCreateOrder}
                onApprove={handleApprove}
                onCancel={() => {
                  setShowPayPal(false);
                  setProcessingPayment(false);
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
