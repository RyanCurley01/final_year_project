import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { customerSummaryService } from "../redux/services/customerSummaryService";
import { FaUserFriends } from "react-icons/fa";

const CustomerSummarySidebar = () => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState([]);
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
        .then((res) => {
          setData(res);
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
        <span className="whitespace-nowrap underline hover:no-underline">
          Customer Summary
        </span>
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
                <table className="w-full text-left text-sm text-gray-300 whitespace-nowrap">
                  <thead className="text-xs uppercase bg-[#333] text-gray-300">
                    <tr>
                      <th className="px-4 py-2">CustomerSummaryID</th>
                      <th className="px-4 py-2">AccountID</th>
                      <th className="px-4 py-2">ProductID</th>
                      <th className="px-4 py-2">OrderID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item, i) => (
                      <tr
                        key={i}
                        className="border-b border-gray-700 hover:bg-gray-800"
                      >
                        <td className="px-4 py-2">
                          {item.id || item.customerSummaryId}
                        </td>
                        <td className="px-4 py-2">{item.accountId}</td>
                        <td className="px-4 py-2">{item.productId}</td>
                        <td className="px-4 py-2">{item.orderId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!isLoading && !error && data?.length === 0 && (
                <p className="text-gray-400">No customer summaries found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerSummarySidebar;
