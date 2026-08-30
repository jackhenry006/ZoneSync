export const URGENT_TERMS = {
  sos: 10,
  emergency: 10,
  help: 6,
  medical: 8,
  fire: 9,
  trapped: 9,
  injured: 8,
  urgent: 7,
  dying: 10,
  bleeding: 9,
  rescue: 8,
  danger: 7,
  "can't breathe": 10,
  evacuate: 8,
  flood: 5,
  collapse: 7,
};

export function classifyUrgency(text, terms = URGENT_TERMS) {
  const lower = (text || "").toLowerCase();
  let score = 0;
  for (const [term, w] of Object.entries(terms || URGENT_TERMS)) {
    if (lower.includes(term)) score += w;
  }
  if (score >= 8) return { level: "critical", score };
  if (score >= 3) return { level: "elevated", score };
  return { level: "normal", score };
}

export function uid() {
  return Math.random().toString(36).slice(2, 8);
}

export function edgeKey(a, b) {
  return [a, b].sort().join("|");
}
