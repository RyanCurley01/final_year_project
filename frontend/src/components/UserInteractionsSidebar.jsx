import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useGetAllInteractionsQuery } from "../redux/services/apiService";
import { FaDatabase } from "react-icons/fa";

const UserInteractionsSidebar = () => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

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

  if (!canView) return null;

  return (
    <div className="my-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-row justify-start items-center text-sm font-medium text-[#1E90FF] hover:text-[#00BFFF]"
      >
        <FaDatabase className="w-6 h-6 mr-2" />
        <span className="whitespace-nowrap underline hover:no-underline">User Interactions</span>
      </button>

      {isOpen && (
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
                  <table className="w-full text-left text-sm text-gray-300 whitespace-nowrap">
                    <thead className="text-xs uppercase bg-[#333] text-gray-300">
                      <tr>
                        <th className="px-4 py-2">InteractionID</th>
                        <th className="px-4 py-2">AccountID</th>
                        <th className="px-4 py-2">ProductID</th>
                        <th className="px-4 py-2">InteractionType</th>
                        <th className="px-4 py-2">InteractionTimestamp</th>
                        <th className="px-4 py-2">DurationSeconds</th>
                        <th className="px-4 py-2">CompletionPercentage</th>
                        <th className="px-4 py-2">EngagementScore</th>
                        <th className="px-4 py-2">DeviceType</th>
                        <th className="px-4 py-2">SessionID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interactions.map((interaction, i) => (
                        <tr
                          key={i}
                          className="border-b border-gray-700 hover:bg-gray-800"
                        >
                          <td className="px-4 py-2">
                            {interaction.interactionId}
                          </td>
                          <td className="px-4 py-2">{interaction.accountId}</td>
                          <td className="px-4 py-2">{interaction.productId}</td>
                          <td className="px-4 py-2">
                            {interaction.interactionType}
                          </td>
                          <td className="px-4 py-2">
                            {interaction.interactionTimestamp}
                          </td>
                          <td className="px-4 py-2">
                            {interaction.durationSeconds ?? "NULL"}
                          </td>
                          <td className="px-4 py-2">
                            {interaction.completionPercentage ?? "NULL"}
                          </td>
                          <td className="px-4 py-2">
                            {interaction.engagementScore ?? "NULL"}
                          </td>
                          <td className="px-4 py-2">
                            {interaction.deviceType}
                          </td>
                          <td className="px-4 py-2">{interaction.sessionId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

              {!isLoading && !error && interactions?.length === 0 && (
                <p className="text-gray-400">No interactions found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserInteractionsSidebar;
