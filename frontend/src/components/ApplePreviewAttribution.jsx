import { useEffect, useState } from 'react';

const getAppleStoreUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !(hostname === 'apple.com' || hostname.endsWith('.apple.com'))
    ) {
      return null;
    }
    url.protocol = 'https:';
    return url.href;
  } catch {
    return null;
  }
};

const isApplePreviewUrl = (value) => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return ['http:', 'https:'].includes(url.protocol) && (
      hostname === 'apple.com' ||
      hostname.endsWith('.apple.com') ||
      hostname === 'mzstatic.com' ||
      hostname.endsWith('.mzstatic.com')
    );
  } catch {
    return false;
  }
};

const ApplePreviewAttribution = ({ previewUrl, trackViewUrl, trackId, className = '' }) => {
  const [resolvedTrackUrl, setResolvedTrackUrl] = useState(() => getAppleStoreUrl(trackViewUrl));

  useEffect(() => {
    const storeUrl = getAppleStoreUrl(trackViewUrl);
    setResolvedTrackUrl(storeUrl);
    if (storeUrl || !isApplePreviewUrl(previewUrl)) return undefined;

    const numericTrackId = Math.abs(Number(trackId));
    if (!Number.isSafeInteger(numericTrackId) || numericTrackId < 1000000) return undefined;

    const controller = new AbortController();
    fetch(`https://itunes.apple.com/lookup?id=${numericTrackId}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`iTunes lookup returned ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const match = (data.results || []).find(
          (item) => Math.abs(Number(item.trackId)) === numericTrackId
        );
        const resolvedUrl = getAppleStoreUrl(match?.trackViewUrl);
        if (resolvedUrl) setResolvedTrackUrl(resolvedUrl);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.warn('[ApplePreviewAttribution] Could not resolve Apple store link:', error);
        }
      });

    return () => controller.abort();
  }, [previewUrl, trackId, trackViewUrl]);

  if (!resolvedTrackUrl) return null;

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      <a
        href={resolvedTrackUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download on iTunes"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="inline-flex h-7 items-center rounded bg-black px-2.5 text-xs text-white">
          Download on <strong className="ml-1 font-semibold">iTunes</strong>
        </span>
      </a>
      <span className="text-[10px] leading-tight text-gray-400">
        Preview provided courtesy of iTunes
      </span>
    </div>
  );
};

export default ApplePreviewAttribution;
