(function (root) {
  const storageKeys = ["savedUsernames", "unobservedByUserId"];
  function normalize(values) {
    const seen = new Set();
    return values.filter(value => typeof value === "string").map(value => value.trim()).filter(value => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function read(data) {
    // An explicitly empty list must not resurrect the legacy username.
    return normalize(Array.isArray(data.savedUsernames) ? data.savedUsernames : [data.unobservedByUserId]);
  }
  const api = { storageKeys, normalize, read };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QGInatUsers = api;
})(globalThis);
