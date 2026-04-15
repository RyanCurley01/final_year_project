import { useState, useCallback } from 'react';
import { FiShoppingCart, FiCheck, FiX } from 'react-icons/fi';
import { FaStar, FaRegStar } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

const TOAST_VARIANTS = {
  'cart-add':    { bg: 'bg-green-600',  icon: FiCheck,    trail: FiShoppingCart, verb: 'added to cart' },
  'cart-remove': { bg: 'bg-red-600',    icon: FiX,        trail: FiShoppingCart, verb: 'removed from cart' },
  'wish-add':    { bg: 'bg-yellow-600', icon: FaStar,     trail: null,           verb: 'added to wishlist' },
  'wish-remove': { bg: 'bg-gray-600',   icon: FaRegStar,  trail: null,           verb: 'removed from wishlist' },
};

/**
 * Generic action toast hook.
 * Returns [showToast, ToastComponent].
 *   showToast(productName, variant)
 *     variant: 'cart-add' | 'cart-remove' | 'wish-add' | 'wish-remove'
 */
export function useActionToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((productName, variant = 'cart-add') => {
    const id = Date.now();
    setToast({ id, productName, variant });
    setTimeout(() => setToast((prev) => (prev?.id === id ? null : prev)), 2200);
  }, []);

  const cfg = toast ? (TOAST_VARIANTS[toast.variant] || TOAST_VARIANTS['cart-add']) : null;
  const Icon = cfg?.icon;
  const Trail = cfg?.trail;

  const ToastComponent = (
    <AnimatePresence>
      {toast && cfg && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.25 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none"
        >
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${cfg.bg} text-white text-sm font-semibold shadow-lg shadow-black/40 whitespace-nowrap`}>
            {Icon && <Icon className="text-white text-base shrink-0" />}
            <span className="truncate max-w-xs">
              {toast.productName ? `${toast.productName} ${cfg.verb}` : cfg.verb.charAt(0).toUpperCase() + cfg.verb.slice(1)}
            </span>
            {Trail && <Trail className="text-white/80 text-base shrink-0" />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return [showToast, ToastComponent];
}

/**
 * Convenience wrapper — backwards-compatible cart-add-only toast.
 */
export function useCartToast() {
  const [showToast, ToastComponent] = useActionToast();
  const show = useCallback((productName) => showToast(productName, 'cart-add'), [showToast]);
  return [show, ToastComponent];
}
