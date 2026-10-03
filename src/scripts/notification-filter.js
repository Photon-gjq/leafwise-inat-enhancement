/* Notification-only rules. Missing or ambiguous history must never hide an update. */
(function (root) {
  "use strict";
  const positiveID = value => Number.isSafeInteger(value) && value > 0;
  const time = value => typeof value === "string" ? Date.parse(value) : NaN;

  function observationLink(href, base) {
    let url;
    try { url = new URL(href, base); } catch { return null; }
    if (url.protocol !== "https:" || !["inaturalist.org", "www.inaturalist.org"].includes(url.hostname)) return null;
    const match = /^\/observations\/([1-9]\d*)\/?$/.exec(url.pathname);
    if (!match || !positiveID(Number(match[1]))) return null;
    const anchor = /^#activity_identification_([1-9]\d*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.hash);
    return { observationId: Number(match[1]), identification: anchor?.[1].toLowerCase() || null };
  }

  function classify(identifications, reference, viewerId) {
    if (!Array.isArray(identifications) || identifications.some(item => !item || typeof item !== "object")
      || !reference || !positiveID(viewerId)) return "unknown";
    const targets = identifications.filter(item => String(item.id) === reference || item.uuid === reference);
    if (targets.length !== 1) return "unknown";
    const target = targets[0];
    if (target.hasRemark) return "remark";
    if (target.hidden || target.current !== true || !positiveID(target.taxonId)
      || !positiveID(target.id) || !positiveID(target.userId) || target.userId === viewerId) return "unknown";
    const targetTime = time(target.createdAt);
    if (!Number.isFinite(targetTime)) return "unknown";
    const own = identifications.filter(item => item.userId === viewerId);
    if (own.some(item => !Number.isFinite(time(item.createdAt)) || !positiveID(item.id))) return "unknown";
    const before = own.filter(item => time(item.createdAt) < targetTime
      || (time(item.createdAt) === targetTime && item.id < target.id));
    before.sort((a, b) => time(b.createdAt) - time(a.createdAt) || b.id - a.id);
    const baseline = before[0];
    // A withdrawn ID has no withdrawal timestamp. Do not guess whether it was
    // active at the notification, or compare with an ID added afterwards.
    if (!baseline || baseline.current !== true || baseline.hidden || !positiveID(baseline.taxonId)
      || time(baseline.updatedAt) > targetTime) return "unknown";
    return baseline.taxonId === target.taxonId ? "confirming" : "different";
  }

  const api = { observationLink, classify };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LeafwiseNotificationFilter = api;
})(globalThis);
