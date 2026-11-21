/* Local notification queue. The background serializes every read/modify/write. */
(function (root) {
  "use strict";
  const rules = typeof module !== "undefined" && module.exports ? require("./notification-filter.js") : root.LeafwiseNotificationFilter;
  const PREFIX = "leafwiseNotificationQueueV1:";
  const BASE = "https://www.inaturalist.org";
  const LIMIT = 5000;
  const validId = value => Number.isSafeInteger(value) && value > 0;

  function event(raw) {
    if (!raw || typeof raw.href !== "string" || raw.href.length > 1000) throw new Error("Invalid notification entry");
    const direct = rules.observationLink(raw.href, BASE) || rules.flagLink(raw.href, BASE);
    const activity = rules.activityLink(raw.href, BASE);
    if (!direct && !activity) throw new Error("Invalid notification entry");
    const url = new URL(raw.href, BASE);
    const anchor = /^#activity_(?:identification|comment)_([1-9]\d*|[0-9a-f-]{36})$/i.test(url.hash) ? url.hash.toLowerCase() : "";
    const href = BASE + url.pathname.replace(/\/$/, "") + anchor;
    const stamp = !anchor && typeof raw.stamp === "string" && /^[a-f0-9]{16}$/.test(raw.stamp) ? raw.stamp : "";
    return { key: href + (stamp ? "|" + stamp : ""), href, ...(stamp ? { stamp } : {}) };
  }

  function target(entry) {
    if (entry.target === false) return null;
    const direct = rules.observationLink(entry.href, BASE) || rules.flagLink(entry.href, BASE);
    if (direct?.observationId) return "/observations/" + direct.observationId;
    if (direct?.flagId) return "/flags/" + direct.flagId;
    return typeof entry.target === "string" ? entry.target : new URL(rules.activityLink(entry.href, BASE)).pathname;
  }

  function resolvedTarget(raw) {
    if (raw === false) return false;
    if (typeof raw !== "string" || !/^\/(observations|flags)\/[1-9]\d*$/.test(raw)) throw new Error("Invalid notification destination");
    const item = rules.observationLink(raw, BASE) || rules.flagLink(raw, BASE);
    if (!item) throw new Error("Invalid notification destination");
    return raw;
  }

  function state(raw) {
    if (raw == null) return { revision: 0, batchSize: 10, entries: [] };
    if (!raw || !Array.isArray(raw.entries) || raw.entries.length > LIMIT * 3) throw new Error("Invalid notification queue");
    const entries = raw.entries.map(item => ({ ...event(item), opened: item.opened === true,
      ...(item.target !== undefined ? { target: resolvedTarget(item.target) } : {}) }));
    return { revision: Number.isSafeInteger(raw.revision) ? raw.revision : 0,
      batchSize: Number.isInteger(raw.batchSize) && raw.batchSize >= 1 && raw.batchSize <= 50 ? raw.batchSize : 10, entries };
  }

  function groups(entries, keep = () => true) {
    const result = new Map();
    for (const item of entries) {
      if (item.opened || !keep(item)) continue;
      const path = target(item);
      if (!path) continue;
      if (!result.has(path)) result.set(path, []);
      result.get(path).push(item);
    }
    return result;
  }

  function createService({ storage, createTab }) {
    let tail = Promise.resolve();
    return function request(message, sender) {
      const job = tail.then(async () => {
        if (!validId(message.viewerId)) throw new Error("Invalid notification viewer");
        const key = PREFIX + message.viewerId;
        const value = state((await storage.get(key))[key]);
        const save = async () => {
          // Pending entries are never evicted. Keep recent opened event markers
          // so the website's recent/read list cannot immediately re-add them.
          const opened = value.entries.filter(item => item.opened);
          if (opened.length > LIMIT * 2) {
            const retain = new Set(opened.slice(-LIMIT * 2));
            value.entries = value.entries.filter(item => !item.opened || retain.has(item));
          }
          value.revision++;
          await storage.set({ [key]: value });
        };
        if (message.action === "capture") {
          if (!Array.isArray(message.entries) || message.entries.length > LIMIT * 3) throw new Error("Notification queue full");
          const known = new Set(value.entries.map(item => item.key));
          const added = [];
          for (const raw of message.entries) {
            const item = event(raw);
            if (!known.has(item.key)) { added.push({ ...item, opened: false }); known.add(item.key); }
          }
          const capacity = LIMIT - value.entries.filter(item => !item.opened).length;
          if (added.length) { value.entries.push(...added.slice(0, capacity)); await save(); }
          return { ok: true, queue: value, full: added.length > capacity };
        } else if (message.action === "resolve") {
          if (!Array.isArray(message.entries) || message.entries.length > LIMIT) throw new Error("Invalid notification resolution");
          const updates = new Map(message.entries.map(item => [event(item).key, resolvedTarget(item.target)]));
          let changed = false;
          for (const item of value.entries) {
            if (!item.opened && updates.has(item.key) && item.target !== updates.get(item.key)) {
              item.target = updates.get(item.key); changed = true;
              if (item.target === false) item.opened = true;
            }
          }
          if (changed) await save();
        } else if (message.action === "size") {
          if (!Number.isInteger(message.batchSize) || message.batchSize < 1 || message.batchSize > 50) throw new Error("Invalid notification batch size");
          value.batchSize = message.batchSize;
          await save();
        } else if (message.action === "clear") {
          value.entries.forEach(item => { item.opened = true; });
          await save();
        } else if (message.action === "open") {
          if (!Array.isArray(message.targets) || message.targets.length > 50
            || message.targets.some(path => {
              if (typeof path !== "string" || !path.startsWith("/")) return true;
              try { return new URL(event({ href: path }).href).pathname !== path; } catch { return true; }
            })) throw new Error("Invalid notification batch");
          const available = groups(value.entries);
          const targets = [...new Set(message.targets)].filter(path => available.has(path)).slice(0, value.batchSize);
          // Verify storage is writable before creating any tabs.
          await save();
          const openedTargets = [];
          const failedTargets = [];
          for (const path of targets) {
            try { await createTab({ url: BASE + path, active: false, windowId: sender.tab.windowId }); }
            catch { failedTargets.push(path); continue; }
            openedTargets.push(path);
            for (const item of available.get(path)) item.opened = true;
            // A crash can at worst repeat the last opened tab, never drop an
            // unopened item. Do not remove failures or auto-open the next batch.
            await save();
          }
          return { ok: true, queue: value, openedTargets, failedTargets };
        } else if (message.action !== "list") throw new Error("Invalid notification queue action");
        return { ok: true, queue: value };
      });
      tail = job.catch(() => {});
      return job;
    };
  }

  const api = { PREFIX, event, target, groups, createService };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LeafwiseNotificationQueue = api;
})(globalThis);
