import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { customerSummaryService } from "../redux/services/customerSummaryService";
import { accountService } from "../redux/services/accountService";
import { productService } from "../redux/services/productService";
import { orderService } from "../redux/services/orderService";
import { orderItemService } from "../redux/services/orderItemService";
import { FaUserFriends } from "react-icons/fa";
import OnsetImageCard from './OnsetImageCard';
import SidebarSearchFilter from './SidebarSearchFilter';

const CustomerSummarySidebar = () => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState([]);
  const [accountMap, setAccountMap] = useState({});
  const [productMap, setProductMap] = useState({});
  const [orderMap, setOrderMap] = useState({});
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const isGoogleAccount = !!currentUser?.firebaseUid;
  const isManager = currentUser?.accountType === "Manager";
  const hasBasicAuth =
    !!(currentUser?.email || currentUser?.accountEmailAddress) &&
    !!currentUser?.password;

  const canView = isManager && (isGoogleAccount || hasBasicAuth);

  useEffect(() => {
    if (isOpen && canView) {
      setIsLoading(true);
      const email = currentUser?.email || currentUser?.accountEmailAddress;
      customerSummaryService
        .getAllCustomerSummaries(email, currentUser?.password)
        .then(async (res) => {
          setData(res);

          // Enrich with account names
          const uniqueAccountIds = [...new Set(res.map((r) => r.accountId))];
          const aMap = {};
          await Promise.all(
            uniqueAccountIds.map(async (aid) => {
              try {
                const account = await accountService.getAccountById(aid, email, currentUser?.password);
                aMap[aid] = account;
              } catch {
                aMap[aid] = null;
              }
            })
          );
          setAccountMap(aMap);

          // Enrich with product names
          const uniqueProductIds = [...new Set(res.map((r) => r.productId))];
          const pMap = {};
          await Promise.all(
            uniqueProductIds.map(async (pid) => {
              try {
                const product = await productService.getProductById(pid);
                pMap[pid] = product;
              } catch {
                pMap[pid] = null;
              }
            })
          );
          setProductMap(pMap);

          // Enrich with order details
          const uniqueOrderIds = [...new Set(res.map((r) => r.orderId))];
          const oMap = {};
          const oiMap = {};
          await Promise.all(
            uniqueOrderIds.map(async (oid) => {
              try {
                const order = await orderService.getOrderById(oid);
                oMap[oid] = order;
                
                // Fetch order items for this order
                const orderItems = await orderItemService.getOrderItemsByOrderId(oid, email, currentUser?.password);
                oiMap[oid] = orderItems;
              } catch {
                oMap[oid] = null;
                oiMap[oid] = [];
              }
            })
          );
          setOrderMap(oMap);
          setOrderItemsMap(oiMap);

          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError(err);
          setIsLoading(false);
        });
    }
  }, [isOpen, canView, currentUser]);

  if (!canView) return null;

  return (
    <div className="my-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-row justify-start items-center text-sm font-medium text-[#1E90FF] hover:text-[#00BFFF]"
      >
        <FaUserFriends className="w-6 h-6 mr-2" />
        <span className="underline hover:no-underline">
          Customer Summary
        </span>
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-70 flex justify-center items-center p-4">
          <div className="bg-[#2a2a2a] p-6 rounded-lg max-w-6xl w-full max-h-[80vh] overflow-hidden flex flex-col relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-white text-xl"
            >
              &times;
            </button>
            <h2 className="text-xl font-bold text-white mb-4">
              Customer Summary
            </h2>

            <div className="overflow-auto bg-[#1a1a1a] p-2 rounded w-full">
              {isLoading && (
                <p className="text-gray-300">Loading customer summaries...</p>
              )}
              {error && (
                <p className="text-red-400">
                  Error loading customer summaries.
                </p>
              )}

              {!isLoading && !error && data && data.length > 0 && (
                <SidebarSearchFilter
                  data={data}
                  getSearchableText={(item) => {
                    const account = accountMap[item.accountId];
                    const product = productMap[item.productId];
                    return [account?.accountName, account?.accountEmailAddress, product?.albumTitle].filter(Boolean).join(' ');
                  }}
                  placeholder="Filter by customer or song name…"
                >
                  {(filteredData) => (
                <table className="w-full text-left text-sm text-gray-300 whitespace-nowrap">
                  <thead className="text-xs uppercase bg-[#333] text-gray-300">
                    <tr>
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2">Cover</th>
                      <th className="px-4 py-2">Order Date</th>
                      <th className="px-4 py-2">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((item, i) => {
                      const account = accountMap[item.accountId];
                      const product = productMap[item.productId];
                      const order = orderMap[item.orderId];
                      const orderItems = orderItemsMap[item.orderId] || [];
                      const orderItem = orderItems.find(oi => oi.productId === item.productId);
                      const actualPrice = orderItem?.unitPrice;
                      
                      return (
                        <tr
                          key={i}
                          className="border-b border-gray-700 hover:bg-gray-800"
                        >
                          <td className="px-4 py-2">{i + 1}</td>
                          <td className="px-4 py-2">
                            {account?.accountName || account?.accountEmailAddress || "—"}
                          </td>
                          <td className="px-4 py-2">
                            {product?.albumTitle || "—"}
                          </td>
                          <td className="px-4 py-2">
                            {product?.albumCoverImageUrl ? (
                              (() => {
                                const coverUrl = product.albumCoverImageUrl;
                                const isVideo = coverUrl && coverUrl.toLowerCase().includes('.mp4');
                                const isTeddyEmotion = product.albumTitle?.toLowerCase().includes('teddy emotion');
                                const useOnsetImages = isVideo && !isTeddyEmotion;

                                if (useOnsetImages) {
                                  return (
                                    <div className="w-10 h-10">
                                      <OnsetImageCard
                                        songTitle={product.albumTitle}
                                        songId={item.productId}
                                        className="w-full h-full rounded object-cover"
                                        isPlaying={false}
                                        isActive={false}
                                      />
                                    </div>
                                  );
                                }
                                return (
                                  <img
                                    src={isVideo ? '/cloud-cover.webp' : coverUrl}
                                    alt={product.albumTitle}
                                    className="w-10 h-10 rounded object-cover"
                                    onError={(e) => { e.target.onerror = null; e.target.src = '/cloud-cover.webp'; }}
                                  />
                                );
                              })()
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {order?.orderDate ? new Date(order.orderDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-2">
                            {actualPrice != null ? `$${Number(actualPrice).toFixed(2)}` : 
                             product?.albumPrice != null ? `$${Number(product.albumPrice).toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                  )}
                </SidebarSearchFilter>
              )}

              {!isLoading && !error && data?.length === 0 && (
                <p className="text-gray-400">No customer summaries found.</p>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

export default CustomerSummarySidebar;
