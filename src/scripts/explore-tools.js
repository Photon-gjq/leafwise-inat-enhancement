(function (root) {
  "use strict";
  // Official place IDs checked against /v1/places on 2026-09-10.
  // Display labels and regional groupings are user-selected conveniences.
  const places = { 6903:"中國大陸", 7613:"香港", 10301:"澳門", 7887:"臺灣",
    6907:"北京",12698:"天津",13350:"河北",12697:"山西",6910:"內蒙古",
    13355:"遼寧",13354:"吉林",8949:"黑龍江",6904:"上海",7285:"江蘇",53098:"浙江",
    65973:"安徽",54517:"福建",57829:"江西",13358:"山東",13351:"河南",53105:"湖北",57824:"湖南",
    53101:"廣東",66994:"廣西",7825:"海南",13345:"重慶",9738:"四川",53099:"貴州",53055:"雲南",13360:"西藏",
    13357:"陝西",13347:"甘肅",13356:"青海",12695:"寧夏",13359:"新疆" };
  const groups = [
    ["all", "中國大陸+港澳臺", [6903,7613,7887,10301]],
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
  function placeLabel(value, items = []) {
    if (value === "any") return "全球";
    const ids = String(value).split(",").map(Number).sort((a,b)=>a-b);
    const group = groups.find(group=>group.place===ids.join(","));
    return group?.name || ids.map(id=>places[id] || items.find(item=>item.id===id)?.name || String(id)).join("、");
  }
  function searchURL(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.inaturalist.org","inaturalist.org"].includes(url.hostname) || !/^\/observations\/?$/.test(url.pathname) || url.username || url.password || url.port) throw new Error("只能收藏 iNaturalist 觀察搜尋頁。");
    url.searchParams.delete("leafwise_query");
    return url.href;
  }
  function title(value) {
    const name = String(value ?? "").trim();
    if (!name || name.length > 80) throw new Error("名稱請填 1–80 個字。");
    return name;
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
  function exportTable(rows, options, core, delimiter = ",") {
    const cell = value => {
      let text=String(value??"");
      // Prevent spreadsheet formula execution, including leading whitespace.
      if (/^\s*[=+@-]/.test(text)) text="'"+text;
      if(delimiter==="\t")return text.replace(/[\t\r\n]+/g," ");
      return '"'+text.replaceAll('"','""')+'"';
    };
    const header=["中文名","學名","層級","當地觀察數","Leaf taxa","觀察連結","對比模式","地點","月份","開始日期","結束日期","項目 ID","對比年份","地點 ID","對比使用者","根類群 ID","當地品質"];
    const data=rows.map(row=>[row.commonName,row.name,row.rank,row.count,row.leaves,core.observationsURL(options,row.id),core.comparisonNames[options.comparison||"lifetime"],placeLabel(options.place),options.months||"全部",options.d1||"",options.d2||"",options.project||"",options.year||"",options.place,options.user,options.taxon,options.quality]);
    return [header,...data].map(row=>row.map(cell).join(delimiter)).join("\r\n");
  }
  function observationSummary(item) {
    if (!item) return null;
    if (!Number.isSafeInteger(item.id) || item.id<=0) throw new Error("觀察資料無效。");
    return { id:item.id,date:typeof item.observed_on==="string"?item.observed_on:"日期未提供",
      place:typeof item.place_guess==="string"?item.place_guess:"地點未公開或未提供",
      url:`https://www.inaturalist.org/observations/${item.id}` };
  }
  const api={places,groups,placeLabel,searchURL,editLibrary,exportTable,observationSummary};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.LeafwiseExploreTools=api;
})(globalThis);
