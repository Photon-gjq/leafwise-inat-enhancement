(function (root) {
  "use strict";
  // Runs in MAIN with the site's jQuery and no extension API access.
  root.LeafwiseUploadPageData = function (element, name) {
    try {
      const jq = window.jQuery;
      return typeof jq === "function" ? jq(element).data(name) : null;
    } catch { return null; }
  };
})(globalThis);
