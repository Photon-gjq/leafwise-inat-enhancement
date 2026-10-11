// Controlled model of the relevant public URL -> API parameter contracts at
// iNaturalist b1274a0b6cbf757600ff435135867b7b4021f33c, not full Angular/React.
// Explore: observation_search.js.erb initializeTaxonParams / setInitialParams.
// Identify: search_params_reducer.js normalizeParams / paramsForSearch.
// Keep this function self-contained so browser tests can execute it on reload.
module.exports = function nativeSearchParams({ href, page }) {
  const params = Object.fromEntries(new URL(href).searchParams);
  if (page === 'observations') {
    if (params['taxon_ids[]']) {
      params.taxon_ids = new URL(href).searchParams.getAll('taxon_ids[]');
      delete params['taxon_ids[]'];
    }
    if (params.taxon_id) params.taxon_id = parseInt(params.taxon_id, 10);
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (value === 'true' || value === 'false') params[key] = value === 'true';
      else if (/^\d+$/.test(value)) params[key] = parseInt(value, 10);
      else if (value.includes(',')) params[key] = value.split(',');
    }
  }
  delete params.leafwise_query;
  return params;
};
