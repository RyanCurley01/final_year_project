import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { useGetAllInteractionsQuery } from "../redux/services/apiService";
import { productService } from "../redux/services/productService";
import { accountService } from "../redux/services/accountService";
import { FaDatabase } from "react-icons/fa";
import SidebarSearchFilter from './SidebarSearchFilter';

const UserInteractionsSidebar = () => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [productMap, setProductMap] = useState({});
  const [accountMap, setAccountMap] = useState({});

  const isGoogleAccount = !!currentUser?.firebaseUid;
  const isManager = currentUser?.accountType === "Manager";
  const hasBasicAuth =
    !!(currentUser?.email || currentUser?.accountEmailAddress) &&
    !!currentUser?.password;

  // The prompt states: "Only a logged in google account or auth basic account manager should be able to see the component"
  // Re-evaluated to be a Manager account type requirement.
  const canView = isManager && (isGoogleAccount || hasBasicAuth);

  const {
    data: interactions,
    isLoading,
    error,
  } = useGetAllInteractionsQuery(undefined, {
    skip: !isOpen || !canView, // Only fetch when open and authorized
  });

  // Enrich interactions with product and account names
  useEffect(() => {
    if (!interactions || interactions.length === 0) return;
    const email = currentUser?.email || currentUser?.accountEmailAddress;

    const enrichData = async () => {
      const uniqueProductIds = [...new Set(interactions.map((i) => i.productId).filter(Boolean))];
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

      const uniqueAccountIds = [...new Set(interactions.map((i) => i.accountId).filter(Boolean))];
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
    };

    enrichData();
  }, [interactions, currentUser]);

  if (!canView) return null;

  return (
    <div className="my-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-row justify-start items-center text-sm font-medium text-[#1E90FF] hover:text-[#00BFFF]"
      >
        <FaDatabase className="w-6 h-6 mr-2" />
        <span className="underline hover:no-underline">User Interactions</span>
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
              User Interactions
            </h2>

            <div className="overflow-auto bg-[#1a1a1a] p-2 rounded w-full">
              {isLoading && (
                <p className="text-gray-300">Loading interactions...</p>
              )}
              {error && (
                <p className="text-red-400">Error loading interactions.</p>
              )}

              {!isLoading &&
                !error &&
                interactions &&
                interactions.length > 0 && (
                  <SidebarSearchFilter
                    data={interactions}
                    getSearchableText={(interaction) => {
                      const account = accountMap[interaction.accountId];
                      const product = productMap[interaction.productId];
                      return [account?.accountName, account?.accountEmailAddress, product?.albumTitle, interaction.interactionType, interaction.deviceType].filter(Boolean).join(' ');
                    }}
                    placeholder="Filter by customer, song, type, or device…"
                  >
                    {(filteredData) => (
                  <table className="w-full text-left text-sm text-gray-300 whitespace-nowrap">
                    <thead className="text-xs uppercase bg-[#333] text-gray-300">
                      <tr>
                        <th className="px-4 py-2">#</th>
                        <th className="px-4 py-2">Customer</th>
                        <th className="px-4 py-2">Product</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">Timestamp</th>
                        <th className="px-4 py-2">Duration (s)</th>
                        <th className="px-4 py-2">Completion %</th>
                        <th className="px-4 py-2">Engagement</th>
                        <th className="px-4 py-2">Device</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.map((interaction, i) => {
                        const account = accountMap[interaction.accountId];
                        const product = productMap[interaction.productId];
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
                              {interaction.interactionType}
                            </td>
                            <td className="px-4 py-2">
                              {interaction.interactionTimestamp
                                ? new Date(interaction.interactionTimestamp).toLocaleString()
                                : "—"}
                            </td>
                            <td className="px-4 py-2">
                              {interaction.durationSeconds ?? "—"}
                            </td>
                            <td className="px-4 py-2">
                              {interaction.completionPercentage != null
                                ? `${interaction.completionPercentage}%`
                                : "—"}
                            </td>
                            <td className="px-4 py-2">
                              {interaction.engagementScore ?? "—"}
                            </td>
                            <td className="px-4 py-2">
                              {interaction.deviceType || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                    )}
                  </SidebarSearchFilter>
                )}

              {!isLoading && !error && interactions?.length === 0 && (
                <p className="text-gray-400">No interactions found.</p>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

export default UserInteractionsSidebar;
