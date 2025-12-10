import {Link } from 'react-router-dom';
import {useDispatch, useSelector } from 'react-redux';
import { useRef, useEffect, useState } from 'react';
import { MdFullscreen } from 'react-icons/md';
import { PayPalButtons } from "@paypal/react-paypal-js";

import PlayPause from './PlayPause';
import AudioReactiveVideo from './AudioReactiveVideo';
import { useVideoModal } from '../context/VideoModalContext';
import { playPause, setActiveSong } from '../redux/features/playerSlice';
import { paymentService } from '../redux/services/paymentService';
import { orderService } from '../redux/services/orderService';
import placeholders from '../utils/placeholderImage';

const SongCard = ({ product, payment, i, data, user, email, password }) => {
  // Determine if it's a game or music based on which fields are populated
  const isMusic = product.albumTitle !== null && product.albumTitle !== undefined;
  const isGame = product.gameTitle !== null && product.gameTitle !== undefined;
  const isPaid = payment !== null && payment !== undefined;

  const productName = isMusic ? product.albumTitle : product.gameTitle;
  const price = isMusic ? product.albumPrice : product.gamePrice;
  const coverMedia = isMusic ? product.albumCoverImageUrl : product.gameCoverImageUrl;

  // Check if the cover media is a video (mp4)
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  
  // Debug logging
  if (i === 0) {
    console.log('First product:', { productName, coverMedia, isVideo, isMusic, isGame });
  }

  // Check if current song is a playable song 
  const isPlayableSong = isMusic && product.albumTitle !== 'Selected Electronic Works';

  const dispatch = useDispatch();
  const { activeSong, isPlaying, songEnded } = useSelector((state) => state.player);
  const { openModal } = useVideoModal();
  const [showPayPal, setShowPayPal] = useState(false);
  
  // Check if this card's song is currently active
  const isThisSongActive = activeSong?.albumTitle === product.albumTitle;

  const handleMaximizeClick = (e) => {
    e.stopPropagation();
    openModal({
      videoSrc: coverMedia,
      title: productName,
      isPlaying,
      isActive: isThisSongActive
    });
  };

  const handlePauseClick = () => {
    console.log('🔴 Pause clicked for:', product.albumTitle);
    dispatch(playPause(false));
  };

  const handlePlayClick = () => {
    console.log('▶️ Play clicked for:', product.albumTitle, 'fileUrl:', product.fileUrl);
    dispatch(setActiveSong({ song: product, data, i }));
    dispatch(playPause(true));
  };

  const handleCreateOrder = async (data, actions) => {
    try {
      // First create an Order record
      const orderData = {
        accountId: user?.accountId,
        totalAmount: isMusic ? product.albumPrice : product.gamePrice,
      };
      
      const order = await orderService.createOrder(orderData, email, password);
      
      // Then create the PayPal order with the orderId
      const paypalOrderData = {
        amount: isMusic ? product.albumPrice : product.gamePrice,
        currency: 'EUR',
        productId: product.id,
        accountId: user?.accountId,
        orderId: order.id,
      };
      
      const response = await paymentService.createPayPalOrder(paypalOrderData, email, password);
      return response.id;
    } catch (error) {
      console.error("Error creating PayPal order:", error);
      throw error;
    }
  };

  const handleApprove = async (data, actions) => {
    try {
      const response = await paymentService.capturePayPalOrder(data.orderID, email, password);
      console.log("Payment successful:", response);
      alert("Payment successful!");
      setShowPayPal(false);
    } catch (error) {
      console.error("Error capturing PayPal order:", error);
      alert("Payment failed!");
    }
  };


  return (
    /**
     * Shows the cover image with song and game details
     */
    <div className="flex flex-col w-[250px] p-4 bg-white/5 
    bg-opacity-80 backdrop-blur-sm animate-slideup
    rounded-lg cursor-pointer">
      <div className="relative w-full h-[160px] group">
        {isVideo ? (
          <>
            <AudioReactiveVideo
              src={coverMedia}
              alt={productName}
              className="w-full h-full rounded-lg object-cover"
              isPlaying={isPlaying}
              isActive={isThisSongActive}
              onError={(e) => {
                console.error('Video failed to load:', coverMedia, e);
              }}
            />
            {/* Maximize button - always visible for videos */}
            <button
              onClick={handleMaximizeClick}
              className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 rounded-md 
                       transition-all duration-200 z-50 shadow-lg"
              title="Fullscreen"
            >
              <MdFullscreen className="text-white text-2xl" />
            </button>
          </>
        ) : null}
        {!isVideo || true ? (
          <img
            src={coverMedia || placeholders.large}
            alt={productName}
            className={`w-full h-full rounded-lg object-cover ${isVideo ? 'hidden' : ''}`}
            onError={(e) => {
              if (e.target.src !== placeholders.large) {
                e.target.src = placeholders.large;
              }
            }}
          />
        ) : null}
        <div className={`group-hover:flex absolute rounded-lg inset-0 justify-center items-center
           bg-black bg-opacity-50 z-10 ${isPlayableSong ? 'flex bg-black bg-opacity-50' : 'hidden'}
            ${isPlayableSong ? 'hidden' : 'flex bg-black bg-opacity-50'}`}>
          {isPlayableSong && (
            <PlayPause 
              isPlaying={isPlaying && activeSong?.albumTitle === product.albumTitle}
              activeSong={activeSong}
              handlePause={handlePauseClick}
              handlePlay={handlePlayClick}
              song={product}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col mt-4">
        <p className="font-semibold text-lg text-white">
          {isGame ? (
            <Link
              to={`/games/${product.id}`}
              title={productName || 'Unknown'}
              className="block break-words"
            >
              {productName || 'Unknown'}
            </Link>
          ) : (
            <span className="block break-words">
              {productName || 'Unknown'}
            </span>
          )}
        </p>
        <div className="flex justify-between items-center mt-2">
          <p className="text-sm text-white">
            {isMusic ? 'Music' : 'Game'}
          </p>
          <p className="text-sm font-bold text-white">
            ${price?.toFixed(2) || '0.00'}
          </p>
        </div>
        {isGame && (
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-white">
              {product.platform ? `Platform: ${product.platform}` : ''}
            </p>
            {!showPayPal ? (
              <button 
                onClick={() => setShowPayPal(true)}
                className="px-2 py-1 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-[15px] leading-none flex items-center justify-center"
              >
                Add to Cart
              </button>
            ) : (
              <div className="w-[120px] relative z-20">
                <PayPalButtons
                  style={{ layout: "horizontal", height: 35, tagline: false }}
                  createOrder={handleCreateOrder}
                  onApprove={handleApprove}
                  onCancel={() => setShowPayPal(false)}
                />
              </div>
            )}
          </div>
        )}
        {isMusic && (
            !showPayPal ? (
              <button 
                onClick={() => setShowPayPal(true)}
                className="px-2 py-1 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-[15px] leading-none flex items-center justify-center"
              >
                Add to Cart
              </button>
            ) : (
              <div className="w-[120px] relative z-20 mt-2">
                <PayPalButtons
                  style={{ layout: "horizontal", height: 35, tagline: false }}
                  createOrder={handleCreateOrder}
                  onApprove={handleApprove}
                  onCancel={() => setShowPayPal(false)}
                />
              </div>
            )
        )}
      </div>
    </div>
  );
};

export default SongCard;
