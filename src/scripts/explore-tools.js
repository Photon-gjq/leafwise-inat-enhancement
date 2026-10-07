(function (root) {
  "use strict";
  // Official place IDs checked against /v1/places on 2026-09-10.
  // Optional settings examples only: never seed the user's saved library.
  const places = { 6903:"中國大陸", 7613:"香港", 10301:"澳門", 7887:"臺灣",
    6907:"北京",12698:"天津",13350:"河北",12697:"山西",6910:"內蒙古",
    13355:"遼寧",13354:"吉林",8949:"黑龍江",6904:"上海",7285:"江蘇",53098:"浙江",
    65973:"安徽",54517:"福建",57829:"江西",13358:"山東",13351:"河南",53105:"湖北",57824:"湖南",
    53101:"廣東",66994:"廣西",7825:"海南",13345:"重慶",9738:"四川",53099:"貴州",53055:"雲南",13360:"西藏",
    13357:"陝西",13347:"甘肅",13356:"青海",12695:"寧夏",13359:"新疆" };
  const groups = [
    ["all", "中國大陸+港澳臺", [6903,7613,7887,10301]],
    ["mainland-hk-mo", "中國大陸+港澳", [6903,7613,10301]],
    ["south", "華南（含港澳）", [53101,66994,7825,7613,10301]],
    ["east", "華東", [6904,7285,53098,65973,54517,57829,13358]],
    ["central", "華中", [13351,53105,57824]],
    ["north", "華北", [6907,12698,13350,12697,6910]],
    ["southwest", "西南", [13345,9738,53099,53055,13360]],
    ["northeast", "東北", [13355,13354,8949]],
    ["northwest", "西北", [13357,13347,13356,12695,13359]],
    ["mainland", "中國大陸", [6903]], ["hmt", "港澳臺", [7613,10301,7887]],
    ["hk", "香港", [7613]], ["mo", "澳門", [10301]], ["tw", "臺灣", [7887]]
  ].map(([id,name,ids])=>({id:`builtin:${id}`,name,place:ids.slice().sort((a,b)=>a-b).join(","),members:ids.map(id=>places[id]).join("、")}));
  function placeLabel(value, items = [], translate = text => text) {
    if (value === "any") return translate("全球");
    const ids = String(value).split(",").map(Number).sort((a,b)=>a-b);
    const group = groups.find(group=>group.place===ids.join(","));
    return group ? translate(group.name) : ids.map(id=>places[id] ? translate(places[id]) : items.find(item=>item.id===id)?.name || String(id)).join("、");
  }
  function searchURL(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.inaturalist.org","inaturalist.org"].includes(url.hostname) || !/^\/observations\/?$/.test(url.pathname) || url.username || url.password || url.port) throw new Error("只能收藏 iNaturalist 觀察搜尋頁。");
    url.searchParams.delete("leafwise_query");
    return url.href;
  }
  function quickSearchPage(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || !["www.inaturalist.org", "inaturalist.org"].includes(url.hostname) || url.username || url.password || url.port) return null;
      if (/^\/observations\/?$/.test(url.pathname)) return "observations";
      if (/^\/observations\/identify\/?$/.test(url.pathname)) return "identify";
    } catch { /* Unsupported/malformed pages must not mount or navigate. */ }
    return null;
  }
  function quickSearchURL(value) {
    if (!quickSearchPage(value)) throw new Error("仅支持 iNaturalist 观察搜索或鉴定页。");
    const url = new URL(value);
    url.searchParams.delete("leafwise_query");
    return url.href;
  }
  function placeSearchURL(href, place, core) {
    const url = new URL(quickSearchURL(href));
    const ids = core.placeIDs(place);
    url.searchParams.set("place_id", ids.length ? ids.join(",") : "any");
    // Replace the positive geographic scope, not unrelated/exclusion filters.
    // A saved-query pointer would restore its old comparison region on reload.
    for (const key of ["swlat", "swlng", "nelat", "nelng", "lat", "lng", "radius", "page"]) url.searchParams.delete(key);
    return url.href;
  }
  function taxonSearchURL(href, taxon, savedTaxa) {
    const url = new URL(quickSearchURL(href));
    // Each shortcut replaces the whole taxon scope, not just its positive ID.
    // Plain entries / Any explicitly clear the previous taxon exclusion.
    url.searchParams.delete("without_taxon_id");
    if (taxon === "any") url.searchParams.delete("taxon_id");
    else {
      const [item] = savedTaxa.normalize([taxon]);
      url.searchParams.set("taxon_id", savedTaxa.ids(item).join(","));
      if (item.withoutTaxonIds) url.searchParams.set("without_taxon_id", item.withoutTaxonIds.join(","));
    }
    // A saved-query pointer would restore its old taxon after navigation.
    url.searchParams.delete("page");
    return url.href;
  }
  function title(value) {
    const name = String(value ?? "").trim();
    if (!name || name.length > 80) throw new Error("名稱請填 1–80 個字。");
    return name;
  }
  function parsePlaceGroups(text, core) {
    const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length > 50) throw new Error("最多保存 50 项地区组合。");
    const seen = new Set();
    return lines.map(line => {
      const separator = line.indexOf("=");
      const ids = core.placeIDs(separator < 0 ? line : line.slice(0, separator));
      if (!ids.length) throw new Error("地點組合需要至少一個 ID。");
      const place = ids.join(",");
      if (seen.has(place)) throw new Error("地区组合重复，请合并相同的 ID 组合。");
      seen.add(place);
      const name = separator < 0 ? "" : title(line.slice(separator + 1));
      return {place, name};
    });
  }
  function formatPlaceGroups(items) {
    return items.map(item => item.name ? `${item.place} = ${item.name.replace(/[\r\n]+/g, " ")}` : item.place).join("\n");
  }
  function appendPlaceGroup(text, example, core) {
    const items = parsePlaceGroups(text, core);
    const [item] = parsePlaceGroups(formatPlaceGroups([example]), core);
    if (items.some(existing => existing.place === item.place)) return text;
    if (items.length >= 50) throw new Error("最多保存 50 项地区组合。");
    // Only edit the draft. Keep existing names, order and whitespace verbatim.
    return `${String(text).trimEnd()}${String(text).trim() ? "\n" : ""}${formatPlaceGroups([item])}`;
  }
  function replacePlaceGroups(library, entry, core, makeID) {
    const current = Array.isArray(library?.groups) ? library.groups : [];
    // The panel and settings edit one library. Reject stale forms, not newer edits.
    if (!Array.isArray(entry?.expectedGroups) || JSON.stringify(current) !== JSON.stringify(entry.expectedGroups)) {
      throw new Error("地区组合已在其他页面变更，请重新打开设置后保存。");
    }
    const parsed = parsePlaceGroups(entry.text, core);
    const groups = parsed.map(item => {
      const previous = current.find(group => group.place === item.place);
      return {id:previous?.id || makeID(), place:item.place, name:item.name || previous?.name || placeLabel(item.place)};
    });
    return {...library, queries:Array.isArray(library?.queries) ? library.queries : [], groups};
  }
  function editLibrary(library, action, entry, core, id) {
    const result = { queries: Array.isArray(library?.queries) ? [...library.queries] : [], groups: Array.isArray(library?.groups) ? [...library.groups] : [] };
    if (!/^(save|remove)-(query|place)$/.test(action)) throw new Error("收藏操作無效。");
    const key = action.endsWith("query") ? "queries" : "groups";
    const index = result[key].findIndex(item=>item.id===entry?.id);
    if (action.startsWith("remove")) {
      if (index < 0) throw new Error("收藏已不存在，請重新讀取。");
      result[key].splice(index,1); return result;
    }
    if (entry.id && index < 0) throw new Error("收藏已變更，請重新讀取。");
    const item = {id:index<0?id:entry.id,name:title(entry.name)};
    if (key === "queries") { item.url=searchURL(entry.url);item.options=core.normalize(entry.options); }
    else {const ids=core.placeIDs(entry.place);if(!ids.length)throw new Error("地點組合需要至少一個 ID。");item.place=ids.join(",");}
    if(index<0){if(result[key].length>=50)throw new Error("最多保存 50 項，請先移除不用的收藏。");result[key].push(item);}else result[key][index]=item;
    return result;
  }
  function exportTable(rows, options, core, delimiter = ",", translate = text => text) {
    const cell = value => {
      let text=String(value??"");
      // Prevent spreadsheet formula execution, including leading whitespace.
      if (/^\s*[=+@-]/.test(text)) text="'"+text;
      if(delimiter==="\t")return text.replace(/[\t\r\n]+/g," ");
      return '"'+text.replaceAll('"','""')+'"';
    };
    const header=["中文名","學名","層級","當地觀察數","Leaf taxa","觀察連結","對比模式","地點","月份","開始日期","結束日期","項目 ID","對比年份","地點 ID","對比使用者","根類群 ID","當地品質"].map(label => translate(label));
    const data=rows.map(row=>[row.commonName,row.name,row.rank,row.count,row.leaves,core.observationsURL(options,row.id),translate(core.comparisonNames[options.comparison||"lifetime"]),placeLabel(options.place,[],translate),options.months||translate("全部"),options.d1||"",options.d2||"",options.project||"",options.year||"",options.place,options.user,options.taxon,options.quality]);
    return [header,...data].map(row=>row.map(cell).join(delimiter)).join("\r\n");
  }
  function observationSummary(item) {
    if (!item) return null;
    if (!Number.isSafeInteger(item.id) || item.id<=0) throw new Error("觀察資料無效。");
    return { id:item.id,date:typeof item.observed_on==="string"?item.observed_on:"日期未提供",
      place:typeof item.place_guess==="string"?item.place_guess:"地點未公開或未提供",
      url:`https://www.inaturalist.org/observations/${item.id}` };
  }
  const api={places,groups,placeLabel,searchURL,quickSearchPage,placeSearchURL,taxonSearchURL,editLibrary,parsePlaceGroups,formatPlaceGroups,appendPlaceGroup,replacePlaceGroups,exportTable,observationSummary};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.LeafwiseExploreTools=api;
})(globalThis);
