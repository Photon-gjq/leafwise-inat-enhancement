(function (root) {
  "use strict";
  // Scoped Firefox access; no callbacks, credentials or extension APIs exposed.
  root.LeafwiseUploadPageData = function (element, name) {
    try {
      const jq = window.wrappedJSObject?.jQuery;
      return typeof jq === "function" ? jq(element.wrappedJSObject || element).data(name) : null;
    } catch { return null; }
  };
})(globalThis);
