export const URGENT_TERMS = {
  // Critical Priority (8-10)
  "high priority": 10,
  critical: 10,
  emergency: 10,
  sos: 10,
  catastrophic: 10,
  explosion: 10,
  "gas leak": 10,
  "can't breathe": 10,
  dying: 10,
  fire: 9,
  smoke: 9,
  hazard: 9,
  danger: 9,
  trapped: 9,
  bleeding: 9,
  lockdown: 9,
  unresponsive: 9,
  breach: 8,
  evacuate: 8,
  collapse: 8,
  injured: 8,
  medical: 8,
  severe: 8,
  immediate: 8,
  rescue: 8,
  "priority alert": 8,

  // Attention / Elevated Priority (4-7)
  priority: 7,
  urgent: 7,
  alert: 6,
  attention: 6,
  anomaly: 6,
  warning: 6,
  failure: 6,
  incident: 6,
  overheat: 6,
  "power loss": 7,
  outage: 6,
  "sensor trip": 6,
  help: 6,
  offline: 5,
  fault: 5,
  unusual: 5,
  containment: 5,
  leak: 5,
  down: 4,
  rapid: 4,
  investigate: 4,
  flood: 5,
};

export function classifyUrgency(text, terms = URGENT_TERMS) {
  if (!text || typeof text !== "string") {
    return { level: "normal", score: 0, matched: [] };
  }

  const lower = text.toLowerCase();
  const activeTerms = { ...URGENT_TERMS, ...(terms || {}) };
  let maxWeight = 0;
  let totalScore = 0;
  const matched = [];

  // Sort longest terms first so multi-word phrases match before substrings
  const sortedTerms = Object.keys(activeTerms).sort((a, b) => b.length - a.length);

  for (const term of sortedTerms) {
    const w = Number(activeTerms[term]) || 0;
    // Word boundary or direct inclusion
    const regex = new RegExp(`(^|[^a-zA-Z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zA-Z0-9]|$)`, 'i');
    if (regex.test(lower) || lower.includes(term.toLowerCase())) {
      // Avoid duplicate sub-word matching if phrase was already matched
      if (!matched.some(m => m.term.includes(term))) {
        matched.push({ term, weight: w });
        totalScore += w;
        if (w > maxWeight) maxWeight = w;
      }
    }
  }

  // Combined score taking highest triggered weight + combo
  const effectiveScore = maxWeight >= 8 ? maxWeight : Math.min(10, totalScore);

  if (effectiveScore >= 8) {
    return { level: "critical", score: Math.min(10, effectiveScore), matched };
  }
  if (effectiveScore >= 4) {
    return { level: "elevated", score: Math.min(7, effectiveScore), matched };
  }
  return { level: "normal", score: Math.max(0, Math.min(3, effectiveScore)), matched };
}

export function uid() {
  return Math.random().toString(36).slice(2, 8);
}

export function edgeKey(a, b) {
  return [a, b].sort().join("|");
}

