/**
 * Sidebar Search Filter
 *
 * Reusable search/filter input for the five database sidebar modals
 * (Stock, SoldProducts, PurchasedProducts, CustomerSummary, UserInteractions).
 *
 * Visually matches the main Searchbar component — icon, input, clear button —
 * but filters a local data array instead of navigating to /search/:term.
 *
 * Punctuation-insensitive: "teds" matches "Ted's" (same normalise logic as Search.jsx).
 */

import { useState, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';

/**
 * Strip apostrophes & common punctuation so "teds" matches "Ted's".
 * Mirrors the normalize() helper in Search.jsx.
 */
const normalize = (s) => s?.toLowerCase().replace(/[''`]/g, '') || '';

/**
 * @param {Object}   props
 * @param {string}   props.placeholder  – Input placeholder text (default: "Filter by song name…")
 * @param {Array}    props.data         – The full unfiltered data array
 * @param {Function} props.getSearchableText – (item) => string — returns the text to match against
 *                                              e.g. (item) => productMap[item.productId]?.albumTitle || ''
 * @param {Function} props.children     – Render-prop: (filteredData, searchTerm) => JSX
 */
const SidebarSearchFilter = ({
  placeholder = 'Filter by song name…',
  data = [],
  getSearchableText,
  children,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredData = useMemo(() => {
    const term = normalize(searchTerm.trim());
    if (!term) return data;
    return data.filter((item) => normalize(getSearchableText(item)).includes(term));
  }, [data, searchTerm, getSearchableText]);

  const handleClear = () => setSearchTerm('');

  return (
    <>
      {/* Search input — same visual style as Searchbar.jsx */}
      <div className="mb-3 flex items-center bg-[#1a1a1a] rounded-lg border border-gray-700 focus-within:border-cyan-500 transition-colors">
        <FiSearch className="w-4 h-4 ml-3 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-gray-500 px-3 py-2"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={handleClear}
            className="mr-2 text-gray-400 hover:text-cyan-400 transition-colors text-lg leading-none"
            title="Clear filter"
          >
            ×
          </button>
        )}
      </div>

      {/* Result count when filtering */}
      {searchTerm.trim() && (
        <p className="text-xs text-gray-500 mb-2">
          Showing {filteredData.length} of {data.length} results
          {filteredData.length === 0 && ' — try a different search term'}
        </p>
      )}

      {/* Render filtered data via children render-prop */}
      {children(filteredData, searchTerm)}
    </>
  );
};

export default SidebarSearchFilter;
