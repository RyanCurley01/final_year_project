import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { stockService } from "../redux/services/stockService";
import { productService } from "../redux/services/productService";
import { FaWarehouse } from "react-icons/fa";
import OnsetImageCard from './OnsetImageCard';
import SidebarSearchFilter from './SidebarSearchFilter';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const startOfIsoWeek = (date) => {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0 … Sunday=6
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Parse a date value that may be:
 *  - a JS Date already
 *  - an ISO string WITH timezone (e.g. "2025-05-06T14:30:00Z")
 *  - a Java LocalDateTime string WITHOUT timezone (e.g. "2025-05-06T14:30:00")
 *
 * For the no-timezone case we treat the value as LOCAL time by appending no
 * suffix (default JS behaviour), which is correct because the Spring server
 * and the browser are typically in the same timezone in a local-dev setup.
 * If your server is UTC and the browser is not, append "Z" here instead.
 */
const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const str = String(value).trim();
  if (!str) return null;

  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Returns true when `value` falls within [start, end).
 * Accepts any value accepted by parseDate.
 */
const inRange = (value, start, end) => {
  const d = parseDate(value);
  if (!d) return false;
  return d >= start && d < end;
};

// ---------------------------------------------------------------------------
// Field accessors (handle camelCase & PascalCase from the API)
// ---------------------------------------------------------------------------

const getAvailableSince   = (item) => item.availableSince   ?? item.AvailableSince   ?? null;
const getUnavailableSince = (item) => item.unavailableSince ?? item.UnavailableSince ?? null;
const isItemAvailable     = (item) => item.isAvailable !== undefined ? item.isAvailable : item.available;

// True if the product is a library song (positive ID), false if iTunes import (negative ID)
const isLibrarySong = (item) => {
  const pid = Number(item.productId);
  return Number.isFinite(pid) && pid > 0;
};

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

/**
 * Returns the "recency score" of a stock row so we can compare two rows for
 * the same productId and decide which is more authoritative.
 */
const getRowRecency = (item) => {
  const unavail = parseDate(getUnavailableSince(item));
  const avail   = parseDate(getAvailableSince(item));
  const id      = Number(item.id ?? item.stockId ?? item.StockID ?? 0);

  const latestDate = [unavail, avail]
    .filter(Boolean)
    .reduce((max, d) => (d > max ? d : max), new Date(0));

  return { latestDate, id };
};

const moreRecentRow = (a, b) => {
  const ra = getRowRecency(a);
  const rb = getRowRecency(b);
  if (ra.latestDate > rb.latestDate) return a;
  if (rb.latestDate > ra.latestDate) return b;
  return ra.id >= rb.id ? a : b;
};

/**
 * Merge duplicate stock rows for the same productId.
 *
 * KEY FIX: We now keep ALL removal records independently of whether an
 * available record exists for the same product.  A product that was removed
 * and then re-added should appear in BOTH "Current Stock" AND the relevant
 * "Removed …" section for the week it was removed.
 *
 * Strategy per productId:
 *  - available rows  → keep only the most-recent one (the canonical live row)
 *  - unavailable rows → keep the most-recent one per productId as well, but
 *    ALWAYS include it in the output so the "Removed" sections can see it.
 */
const mergeStockRows = (rows) => {
  const availableByProduct   = new Map(); // productId → best available row
  const unavailableByProduct = new Map(); // productId → best unavailable row

  rows.forEach((item) => {
    const key = item?.productId;
    if (key === null || key === undefined) return;

    if (isItemAvailable(item)) {
      const current = availableByProduct.get(key);
      availableByProduct.set(key, current ? moreRecentRow(current, item) : item);
    } else {
      const current = unavailableByProduct.get(key);
      unavailableByProduct.set(key, current ? moreRecentRow(current, item) : item);
    }
  });

  // Always emit both the available row AND the unavailable row for any given
  // productId.  The section filters (inRange + isItemAvailable) determine
  // which sections each row appears in — we must not pre-filter here.
  return [
    ...Array.from(availableByProduct.values()),
    ...Array.from(unavailableByProduct.values()),
  ];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const StockSidebar = () => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData]     = useState([]);
  const [productMap, setProductMap] = useState({});
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState(null);

  const isManager  = currentUser?.accountType === "Manager";
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

          const raw = res || [];
          console.log("RAW STOCK COUNT:", raw.length);

          // ── Debug: log raw unavailable rows ──────────────────────────────
          const rawUnavailable = raw.filter(
            (item) => !isItemAvailable(item)
          );
          console.log("RAW UNAVAILABLE ROWS:", rawUnavailable.length, rawUnavailable);

          // ── Debug: log all unique availableSince / unavailableSince values
          raw.forEach((item) => {
            const as = getAvailableSince(item);
            const us = getUnavailableSince(item);
            if (as || us) {
              console.log(
                `productId=${item.productId}`,
                `available=${isItemAvailable(item)}`,
                `availableSince=${as}`,
                `unavailableSince=${us}`,
                `parsed_as=${parseDate(as)}`,
                `parsed_us=${parseDate(us)}`
              );
            }
          });

          const merged = mergeStockRows(raw);
          console.log("MERGED STOCK COUNT:", merged.length);
          console.log(
            "MERGED UNAVAILABLE:",
            merged.filter((i) => !isItemAvailable(i)).length,
            merged.filter((i) => !isItemAvailable(i))
          );
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

  // ── Badge renderers ───────────────────────────────────────────────────────

  const getStockBadge = (available) => {
    if (available === null || available === undefined) return null;
    return available ? (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-400">
        Available
      </span>
    ) : (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">
        Unavailable
      </span>
    );
  };

  const getSourceBadge = (item) =>
    isLibrarySong(item) ? (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 ml-1">
        Library
      </span>
    ) : (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 ml-1">
        iTunes
      </span>
    );

  // ── Table renderer ────────────────────────────────────────────────────────

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
              const product      = productMap[item.productId];
              const defaultAvail = isItemAvailable(item);
              const sectionAvail = options.statusResolver
                ? options.statusResolver(item, defaultAvail)
                : defaultAvail;
              const dateValue = options.dateField ? options.dateField(item) : null;

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

  // ── Render ────────────────────────────────────────────────────────────────

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

                    // ── Debug week boundaries ─────────────────────────────
                    console.log("Week boundaries:",
                      "lastWeek:", lastWeekStart.toISOString(),
                      "thisWeek:", thisWeekStart.toISOString(),
                      "nextWeek:", nextWeekStart.toISOString()
                    );

                    // ── Currently available ───────────────────────────────
                    const available = filteredData.filter(isItemAvailable);

                    // ── Detect bulk-seeded timestamps ─────────────────────
                    // Items added in the same second as 5+ other items are
                    // considered bulk-seeded (migration/import) and must NOT
                    // appear in "Added" sections — they weren't really "added
                    // this week", they just got stamped during a data seed.
                    const isBulkSeeded = (item) => {
                      const d = parseDate(getAvailableSince(item));
                      if (!d) return true;
                      return d < thisWeekStart;
                    };

                    // ── Added this week ───────────────────────────────────
                    const addedThisWeek = filteredData
                      .filter((item) =>
                        isItemAvailable(item) &&
                        !isBulkSeeded(item) &&
                        inRange(getAvailableSince(item), thisWeekStart, nextWeekStart)
                      )
                      .sort((a, b) =>
                        (parseDate(getAvailableSince(b))?.getTime() ?? 0) -
                        (parseDate(getAvailableSince(a))?.getTime() ?? 0)
                      );

                    // ── Added last week ───────────────────────────────────
                    const addedLastWeek = filteredData
                      .filter((item) =>
                        isItemAvailable(item) &&
                        !isBulkSeeded(item) &&
                        inRange(getAvailableSince(item), lastWeekStart, thisWeekStart)
                      )
                      .sort((a, b) =>
                        (parseDate(getAvailableSince(b))?.getTime() ?? 0) -
                        (parseDate(getAvailableSince(a))?.getTime() ?? 0)
                      );

                    // ── Removed this week ─────────────────────────────────
                    // FIX: We check ALL rows (not just unavailable ones from
                    // mergeStockRows) because a product may have been removed
                    // AND re-added — in that case both an available AND an
                    // unavailable row survive the merge and we want to show
                    // the removal in the right section.
                    const removedThisWeek = filteredData
                      .filter((item) =>
                        !isItemAvailable(item) &&
                        inRange(getUnavailableSince(item), thisWeekStart, nextWeekStart)
                      )
                      .sort((a, b) =>
                        (parseDate(getUnavailableSince(b))?.getTime() ?? 0) -
                        (parseDate(getUnavailableSince(a))?.getTime() ?? 0)
                      );

                    // ── Removed last week ─────────────────────────────────
                    const removedLastWeek = filteredData
                      .filter((item) =>
                        !isItemAvailable(item) &&
                        inRange(getUnavailableSince(item), lastWeekStart, thisWeekStart)
                      )
                      .sort((a, b) =>
                        (parseDate(getUnavailableSince(b))?.getTime() ?? 0) -
                        (parseDate(getUnavailableSince(a))?.getTime() ?? 0)
                      );

                    // ── Debug section counts ──────────────────────────────
                    console.log("Section counts →",
                      "available:", available.length,
                      "addedThisWeek:", addedThisWeek.length,
                      "addedLastWeek:", addedLastWeek.length,
                      "removedThisWeek:", removedThisWeek.length,
                      "removedLastWeek:", removedLastWeek.length,
                    );

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
