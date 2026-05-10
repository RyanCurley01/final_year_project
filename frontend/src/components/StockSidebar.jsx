import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { stockService } from "../redux/services/stockService";
import { productService } from "../redux/services/productService";
import { FaWarehouse } from "react-icons/fa";
import OnsetImageCard from './OnsetImageCard';
import SidebarSearchFilter from './SidebarSearchFilter';

const startOfIsoWeek = (date) => {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0..Sunday=6
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const inRange = (value, start, end) => {
  if (!value) return false;
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return false;
  return ts >= start && ts < end;
};

// Resolve availableSince from both camelCase and PascalCase keys
const getAvailableSince = (item) =>
  item.availableSince || item.AvailableSince || null;

// Resolve unavailableSince from both camelCase and PascalCase keys
const getUnavailableSince = (item) =>
  item.unavailableSince || item.UnavailableSince || null;

const latestDateValue = (...values) => {
  let latest = null;
  values.forEach((value) => {
    if (!value) return;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return;
    if (!latest || parsed > latest) latest = parsed;
  });
  return latest ? latest.toISOString() : null;
};

const getValidDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isItemAvailable = (item) =>
  item.isAvailable !== undefined ? item.isAvailable : item.available;

// True if the product is a library song (positive ID), false if iTunes import (negative ID)
const isLibrarySong = (item) => {
  const pid = Number(item.productId);
  return Number.isFinite(pid) && pid > 0;
};

const StockSidebar = () => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState([]);
  const [productMap, setProductMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const isManager = currentUser?.accountType === "Manager";
  const isEmployee = currentUser?.accountType === "Employee";
  const hasBasicAuth =
    !!(currentUser?.email || currentUser?.accountEmailAddress) &&
    !!currentUser?.password;

  const canView = (isManager || isEmployee) && hasBasicAuth;

  useEffect(() => {
    if (isOpen && canView) {
      setIsLoading(true);
      setError(null);
      const email = currentUser?.email || currentUser?.accountEmailAddress;

      const timeout = setTimeout(() => {
        setError(new Error('Request timed out — stock service may be unavailable.'));
        setIsLoading(false);
      }, 12000);

      stockService
        .getAllStock(email, currentUser?.password)
        .then(async (res) => {
          clearTimeout(timeout);

          // Merge duplicate rows by productId — if any row is available, treat as available.
          const mergedByProduct = new Map();
          (res || []).forEach((item) => {
            const key = item?.productId;
            if (key === null || key === undefined) return;

            const current = mergedByProduct.get(key);
            if (!current) {
              mergedByProduct.set(key, item);
              return;
            }

            const currentAvail = isItemAvailable(current);
            const itemAvail   = isItemAvailable(item);

            const mergedAvailableSince = latestDateValue(
              current.availableSince, current.AvailableSince,
              item.availableSince,    item.AvailableSince
            );
            const mergedUnavailableSince = latestDateValue(
              current.unavailableSince, current.UnavailableSince,
              item.unavailableSince,    item.UnavailableSince
            );

            const currentId = Number(current.id ?? current.stockId ?? current.StockID ?? 0);
            const itemId    = Number(item.id    ?? item.stockId    ?? item.StockID    ?? 0);
            const preferred = itemId >= currentId ? item : current;

            mergedByProduct.set(key, {
              ...preferred,
              isAvailable:      Boolean(currentAvail) || Boolean(itemAvail),
              availableSince:   mergedAvailableSince,
              unavailableSince: mergedUnavailableSince,
            });
          });

          const merged = Array.from(mergedByProduct.values());
          setData(merged);

          // Enrich with product names
          const uniqueProductIds = [...new Set(merged.map((r) => r.productId))];
          const map = {};
          await Promise.all(
            uniqueProductIds.map(async (pid) => {
              try {
                const product = await productService.getProductById(pid);
                map[pid] = product;
              } catch {
                map[pid] = null;
              }
            })
          );
          setProductMap(map);
          setIsLoading(false);
        })
        .catch((err) => {
          clearTimeout(timeout);
          console.error("Failed to load stock:", err);
          setError(err);
          setIsLoading(false);
        });

      return () => clearTimeout(timeout);
    }
  }, [isOpen, canView, currentUser]);

  if (!canView) return null;

  const getStockBadge = (available) => {
    if (available === null || available === undefined) return null;
    if (!available) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">
          Unavailable
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-400">
        Available
      </span>
    );
  };

  const getSourceBadge = (item) => {
    if (isLibrarySong(item)) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 ml-1">
          Library
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 ml-1">
        iTunes
      </span>
    );
  };

  const renderSection = (title, rows, options = {}) => (
    <div className="mb-6">
      <h3 className="text-md font-semibold text-white mb-2">
        {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm">No songs in this section.</p>
      ) : (
        <table className="w-full text-left text-sm text-gray-300 whitespace-nowrap">
          <thead className="text-xs uppercase bg-[#333] text-gray-300">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Product Name</th>
              <th className="px-4 py-2">Cover</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Status</th>
              {options.showDate && <th className="px-4 py-2">Date</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => {
              const product        = productMap[item.productId];
              const defaultAvail   = isItemAvailable(item);
              const sectionAvail   = options.statusResolver
                ? options.statusResolver(item, defaultAvail)
                : defaultAvail;
              const dateValue      = options.dateField ? options.dateField(item) : null;

              return (
                <tr
                  key={`${title}-${item.productId}-${i}`}
                  className="border-b border-gray-700 hover:bg-gray-800"
                >
                  <td className="px-4 py-2">{i + 1}</td>
                  <td className="px-4 py-2">{product?.albumTitle || "—"}</td>
                  <td className="px-4 py-2">
                    {product?.albumCoverImageUrl ? (
                      (() => {
                        const coverUrl = product.albumCoverImageUrl;
                        const isVideo  = coverUrl?.toLowerCase().includes('.mp4');
                        const isTeddy  = product.albumTitle?.toLowerCase().includes('teddy emotion');
                        if (isVideo && !isTeddy) {
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
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2">{getSourceBadge(item)}</td>
                  <td className="px-4 py-2">{getStockBadge(sectionAvail)}</td>
                  {options.showDate && (
                    <td className="px-4 py-2 text-xs text-gray-400">
                      {dateValue
                        ? new Date(dateValue).toLocaleDateString(undefined, {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })
                        : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="my-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-row justify-start items-center text-sm font-medium text-[#1E90FF] hover:text-[#00BFFF]"
      >
        <FaWarehouse className="w-6 h-6 mr-2" />
        <span className="underline hover:no-underline">Stock</span>
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-100 bg-black bg-opacity-70 flex justify-center items-center p-4">
          <div className="bg-[#2a2a2a] p-6 rounded-lg max-w-6xl w-full max-h-[80vh] overflow-hidden flex flex-col relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-white text-xl hover:text-red-400"
            >
              &times;
            </button>
            <h2 className="text-xl font-bold text-white mb-2">
              Stock Availability
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Weekly stock summary — library songs and rotating iTunes imports
              added and removed from the catalogue.
            </p>

            <div className="overflow-auto bg-[#1a1a1a] p-2 rounded w-full">
              {isLoading && (
                <p className="text-gray-300">Loading stock data...</p>
              )}
              {error && (
                <p className="text-red-400">
                  Error loading stock data: {error?.message || 'Unknown error'}
                </p>
              )}

              {!isLoading && !error && data && data.length > 0 && (
                <SidebarSearchFilter
                  data={data}
                  getSearchableText={(item) => productMap[item.productId]?.albumTitle || ''}
                  placeholder="Filter by song name…"
                >
                  {(filteredData) => {
                    const now           = new Date();
                    const thisWeekStart = startOfIsoWeek(now);
                    const nextWeekStart = new Date(thisWeekStart);
                    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
                    const lastWeekStart = new Date(thisWeekStart);
                    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

                    // ── Currently available ─────────────────────────────────
                    const available = filteredData.filter((item) => isItemAvailable(item));

                    // ── Added this week (availableSince falls in current week) ─
                    const addedThisWeek = filteredData
                      .filter((item) =>
                        isItemAvailable(item) &&
                        inRange(getAvailableSince(item), thisWeekStart, nextWeekStart)
                      )
                      .sort((a, b) => {
                        const da = getValidDate(getAvailableSince(a))?.getTime() ?? 0;
                        const db = getValidDate(getAvailableSince(b))?.getTime() ?? 0;
                        return db - da; // newest first
                      });

                    // ── Added last week ─────────────────────────────────────
                    const addedLastWeek = filteredData
                      .filter((item) =>
                        isItemAvailable(item) &&
                        inRange(getAvailableSince(item), lastWeekStart, thisWeekStart)
                      )
                      .sort((a, b) => {
                        const da = getValidDate(getAvailableSince(a))?.getTime() ?? 0;
                        const db = getValidDate(getAvailableSince(b))?.getTime() ?? 0;
                        return db - da;
                      });

                    // ── Removed this week (unavailableSince in current week) ─
                    const removedThisWeek = filteredData
                      .filter((item) =>
                        !isItemAvailable(item) &&
                        inRange(getUnavailableSince(item), thisWeekStart, nextWeekStart)
                      )
                      .sort((a, b) => {
                        const da = getValidDate(getUnavailableSince(a))?.getTime() ?? 0;
                        const db = getValidDate(getUnavailableSince(b))?.getTime() ?? 0;
                        return db - da;
                      });

                    // ── Removed last week ───────────────────────────────────
                    const removedLastWeek = filteredData
                      .filter((item) =>
                        !isItemAvailable(item) &&
                        inRange(getUnavailableSince(item), lastWeekStart, thisWeekStart)
                      )
                      .sort((a, b) => {
                        const da = getValidDate(getUnavailableSince(a))?.getTime() ?? 0;
                        const db = getValidDate(getUnavailableSince(b))?.getTime() ?? 0;
                        return db - da;
                      });

                    return (
                      <>
                        {renderSection("Current Stock", available, {
                          statusResolver: () => true,
                        })}
                        {renderSection("Added This Week", addedThisWeek, {
                          statusResolver: () => true,
                          showDate: true,
                          dateField: getAvailableSince,
                        })}
                        {renderSection("Added Last Week", addedLastWeek, {
                          statusResolver: () => true,
                          showDate: true,
                          dateField: getAvailableSince,
                        })}
                        {renderSection("Removed This Week", removedThisWeek, {
                          statusResolver: () => false,
                          showDate: true,
                          dateField: getUnavailableSince,
                        })}
                        {renderSection("Removed Last Week", removedLastWeek, {
                          statusResolver: () => false,
                          showDate: true,
                          dateField: getUnavailableSince,
                        })}
                      </>
                    );
                  }}
                </SidebarSearchFilter>
              )}

              {!isLoading && !error && data?.length === 0 && (
                <p className="text-gray-400">No stock data found.</p>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

export default StockSidebar;
