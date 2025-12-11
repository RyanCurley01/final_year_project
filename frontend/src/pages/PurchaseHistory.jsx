import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { FaReceipt, FaCalendar, FaDollarSign } from 'react-icons/fa';
import placeholders from '../utils/placeholderImage';

const PurchaseHistory = () => {
  const { purchases } = useSelector((state) => state.purchase);

  if (purchases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <FaReceipt className="text-gray-400 text-6xl mb-4" />
        <h2 className="text-white text-2xl font-bold mb-2">No purchases yet</h2>
        <p className="text-gray-400 mb-6">Your purchase history will appear here</p>
        <Link 
          to="/"
          className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg"
        >
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-white text-3xl font-bold mb-6">Purchase History</h2>
      
      <div className="space-y-6">
        {purchases.map((purchase) => (
          <div key={purchase.id} className="bg-white/5 backdrop-blur-sm rounded-lg p-6">
            {/* Purchase Header */}
            <div className="flex flex-wrap justify-between items-start mb-4 pb-4 border-b border-gray-600">
              <div>
                <h3 className="text-white font-semibold text-lg mb-2">
                  Order ID: {purchase.id}
                </h3>
                <div className="flex flex-wrap gap-4 text-gray-400 text-sm">
                  <div className="flex items-center gap-2">
                    <FaCalendar />
                    <span>{new Date(purchase.purchaseDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FaDollarSign />
                    <span className="text-white font-semibold">
                      ${purchase.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                purchase.status === 'completed' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {purchase.status}
              </span>
            </div>

            {/* Purchase Items */}
            <div className="space-y-3">
              <h4 className="text-gray-300 font-semibold mb-2">Items:</h4>
              {purchase.items.map((item, index) => {
                const isMusic = item.albumTitle !== null && item.albumTitle !== undefined;
                const productName = isMusic ? item.albumTitle : item.gameTitle;
                const price = isMusic ? item.albumPrice : item.gamePrice;
                const coverMedia = isMusic ? item.albumCoverImageUrl : item.gameCoverImageUrl;

                return (
                  <div key={index} className="flex gap-3 bg-white/5 rounded-lg p-3">
                    <img
                      src={coverMedia || placeholders.small}
                      alt={productName}
                      className="w-16 h-16 rounded-lg object-cover"
                      onError={(e) => {
                        if (e.target.src !== placeholders.small) {
                          e.target.src = placeholders.small;
                        }
                      }}
                    />
                    <div className="flex-1">
                      <p className="text-white font-semibold">{productName}</p>
                      <p className="text-gray-400 text-sm">
                        Quantity: {item.quantity} × ${price.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-white font-semibold">
                      ${(price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Payment ID */}
            {purchase.paymentId && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <p className="text-gray-400 text-sm">
                  Payment ID: <span className="text-gray-300">{purchase.paymentId}</span>
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PurchaseHistory;
