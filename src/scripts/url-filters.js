/* Shared by the isolated content script and dependency-free Node tests. */
(function (root) {
  const keys = ["user_id", "unobserved_by_user_id"];
  function isSearchPage(href) {
    const url = new URL(href);
    return url.protocol === "https:" &&
      ["www.inaturalist.org", "inaturalist.org"].includes(url.hostname) &&
      /^\/observations\/?$/.test(url.pathname);
  }
  function updateFilters(href, changes) {
    const url = new URL(href);
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
      const value = String(changes[key] ?? "").trim();
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    return url.toString();
  }
  const api = { keys, isSearchPage, updateFilters };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QGInatFilters = api;
})(globalThis);
