import re

# 1. Update WishlistPage.jsx (Price Alert Logic)
with open('src/pages/WishlistPage.jsx', 'r') as f:
    wishlist_code = f.read()

price_alert_detection_old = """  useEffect(() => {
    // Basic tracking arrays and UI resets
    const newItems = [];
    const validIds = new Set();
    const resolvedItems = {};"""

price_alert_detection_new = """  // PRICE ALERT DETECTOR LOGIC:
  // Scans the active Redux `wishlistProducts` array on every render.
  // Calculates an `effectivePrice` (e.g., assessing discounts).
  // Looks inside `state.priceAlerts[product.id]` to compare the newly calculated price
  // against the historical tracked price. If it is lower, it dispatches `updatePriceAlert`
  // effectively mapping local saving diffs and triggering the green UI card without ever hitting the backend.
  useEffect(() => {
    // Basic tracking arrays and UI resets
    const newItems = [];
    const validIds = new Set();
    const resolvedItems = {};"""

wishlist_code = wishlist_code.replace(price_alert_detection_old, price_alert_detection_new)

display_alerts_old = """  const activeAlerts = Object.entries(priceAlerts).filter(([, alert]) => alert.dropped);"""

display_alerts_new = """  // UI RENDER FILTER: Extracts active price alerts from the Redux cache.
  // Filters out items where `alert.dropped === false` to ensure we only
  // map the PriceDropCard to items currently cheaper than their saved snapshot.
  const activeAlerts = Object.entries(priceAlerts).filter(([, alert]) => alert.dropped);"""

wishlist_code = wishlist_code.replace(display_alerts_old, display_alerts_new)

with open('src/pages/WishlistPage.jsx', 'w') as f:
    f.write(wishlist_code)


# 2. Update globalAudioContext.js (Qubit Panning Logic)
with open('src/utils/globalAudioContext.js', 'r') as f:
    qubit_code = f.read()

qubit_math_old = """  measureQubit() {
    // Generate two "qubit" measurements (each 0 or 1 with equal probability)
    // This gives us 4 basis states: |00⟩, |01⟩, |10⟩, |11⟩
    const qubit1 = Math.random() < 0.5 ? 0 : 1;
    const qubit2 = Math.random() < 0.5 ? 0 : 1;"""

qubit_math_new = """  // QUBIT PANNING MATHEMATICS:
  // Uses two simulated binary states (qubits collapsing) upon Audio transient hits 
  // rather than a basic continuous LR sweep. By mapping a 50/50 Math.random() twice,
  // we derive exactly 1 of 4 quantum basis states (|00>, |01>, |10>, |11>).
  // These uniquely push the HTML5 StereoPannerNode strictly to either `Hard Left (-1.0)`, 
  // `Hard Right (+1.0)`, `Soft Left (-0.4)`, or `Soft Right (+0.4)`, instantly spatializing the drum hit.
  measureQubit() {
    // Generate two "qubit" measurements (each 0 or 1 with equal probability)
    // This gives us 4 basis states: |00⟩, |01⟩, |10⟩, |11⟩
    const qubit1 = Math.random() < 0.5 ? 0 : 1;
    const qubit2 = Math.random() < 0.5 ? 0 : 1;"""

qubit_code = qubit_code.replace(qubit_math_old, qubit_math_new)

apply_quantum_old = """  applyQuantumState(onset) {
    if (!this.quantumMode || !this.audioContext) return;"""

apply_quantum_new = """  // APPLES QUBIT TO AUDIO:
  // Triggered directly by the OnsetDetector when a kick/snare frequency transient strikes.
  // Overrides any currently playing scheduled Pan node smoothly via `setTargetAtTime`, completing the audio illusion.
  applyQuantumState(onset) {
    if (!this.quantumMode || !this.audioContext) return;"""

qubit_code = qubit_code.replace(apply_quantum_old, apply_quantum_new)

with open('src/utils/globalAudioContext.js', 'w') as f:
    f.write(qubit_code)


# 3. Update SmartRecommendationVisualizer.jsx (Visualizer Logic)
with open('src/components/SmartRecommendationVisualizer.jsx', 'r') as f:
    vis_code = f.read()

vis_useeffect_old = """  // Reset state when active song changes (including from other pages)
  useEffect(() => {"""

vis_useeffect_new = """  // RECOMMENDATION VISUALIZER LOGIC:
  // Subscribes directly to `activeSong` Redux pointer. Whenever the user clicks a
  // new song across the app, this hook fires. It drops stale recommendations, shows the
  // Loader `loading: true`, and prepares to call the Audio Features context to map a radar cluster.
  // Reset state when active song changes (including from other pages)
  useEffect(() => {"""

vis_code = vis_code.replace(vis_useeffect_old, vis_useeffect_new)

calculate_scores_old = """  /**
   * Calculate visualization parameters
   */
  const calculateVisuals = (rec, currentFeats) => {"""

calculate_scores_new = """  // VISUAL CALCULATIONS:
  // Derives physical CSS coordinates (X, Y scales, sizes) based on raw float data diffs.
  // E.g., if a track is highly 'danceable', it shifts further outward locally without calling the API again.
  /**
   * Calculate visualization parameters
   */
  const calculateVisuals = (rec, currentFeats) => {"""
  
vis_code = vis_code.replace(calculate_scores_old, calculate_scores_new)

with open('src/components/SmartRecommendationVisualizer.jsx', 'w') as f:
    f.write(vis_code)

print("Comments Applied Successfully.")
