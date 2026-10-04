# Leafwise English User Guide

Version 1.1.0 follows iNaturalist's website language. Select English in iNaturalist and reload the page to use English controls; the settings page reuses the last website language. The Chinese label tables below remain useful when using an older version or the Chinese website. This guide applies to the Chrome, Edge, and Firefox builds from the same release. See [language coverage and fallback](I18N.md) for the initial 50 variants.

## Recent activity notifications

The **僅顯示非完全贊同的鑑定** (Only show non-confirming IDs) switch starts off and remembers its setting in this browser. When enabled, Leafwise reads public identification history on demand. It hides only an exact taxon match to your valid identification made before the update, without a remark. Different taxa, more specific or broader IDs, comments, remarks, and uncertain records remain visible. Withdrawn or subsequently modified history is not guessed, and the current community taxon is not used as the baseline.

Opening is disabled while checking. Afterwards, **開啟篩選後的觀察（N）** (Open filtered observations) opens the observations with visible notifications, still deduplicating multiple updates about one observation. Turning the switch off restores the list. This only filters the currently loaded menu; it does not fetch all unread updates or history. iNaturalist may show previously read updates when none are unread.

Open the speech-bubble activity menu at the top right of iNaturalist, then click **一鍵開啟這些觀察（N）** (Open these observations). Leafwise opens one background tab per resolved observation in the currently loaded menu. Several resolved updates about the same observation produce just one tab. Direct messages, dashboard links, and known non-observation destinations are skipped. This does not fetch all historical updates or mark individual updates as read; iNaturalist itself may reset the unread count when its menu is opened.

Observation mentions (@), favorites, comments and identifications are included. Mentions are never hidden as exact confirmations. The button is briefly disabled while mention permalinks resolve to observations. If resolution fails or requires login, the original notification permalink is opened instead of silently omitted; only identical permalinks can be deduplicated in that fallback, so different links to the same observation may open separate tabs. Known journal and other non-observation destinations are skipped.

## Installation and updates

1. Download the package matching your browser from the [latest GitHub Release](https://github.com/Photon-gjq/leafwise-inat-enhancement/releases/latest).
2. Chrome or Edge: extract the ZIP, enable Developer mode on the browser's extensions page, and load the extracted `extension` folder.
3. Firefox: install the signed edition from [Mozilla Add-ons](https://addons.mozilla.org/firefox/addon/leafwise-inat-enhancement/), or load the unsigned XPI temporarily from `about:debugging#/runtime/this-firefox`.

For a locally loaded Chrome or Edge build, download and extract the new release, then use the extension page's Reload button. A new GitHub Release does not silently update that local folder. Mozilla Add-ons normally updates the signed Firefox edition automatically after Mozilla accepts the new version.

## Taxon comparison

Open an iNaturalist observations search page and click **類群對比** (Taxon comparison).

| Chinese label | Meaning |
| --- | --- |
| 对比用户 | iNaturalist user name or numeric user ID |
| 地點組合 | One place ID, a comma-separated union, a preset, or `any` for worldwide |
| 类群 ID | Root taxon ID; for example, `3` for Aves or `48460` for Life |
| 统计层级 | Rank to aggregate and compare |
| 开始对比 | Run comparison |
| 读取当前页面 | Read supported filters from the current observations URL |
| 這個月份可以找什麼 | Build a target list for the current calendar month |
| 複製結果 / 匯出 CSV | Copy or export all currently filtered rows |

Supported ranks are kingdom, phylum, class, order, suborder, superfamily, family, subfamily, tribe, genus, subgenus, and species. Selecting species groups infraspecific observations under their parent species. An identification made only at genus or a higher rank does not imply that every descendant species has been observed.

### Comparison modes

- **生涯未見** — never observed in the user's readable global records.
- **已見，但該年未見** — observed at some time, but not in the selected year.
- **已見，但此地未見** — observed somewhere, but not in the selected place or place union.
- **該年首次記錄** — present in the selected year's records but absent from dated records before that year.

All modes first form a regional candidate list. Month, local date range, project, and regional quality filters restrict that candidate list only. They do not redefine the user's lifetime baseline. Years use the observation date, not the upload date.

### Built-in place groups

Important presets include:

- **中國大陸+港澳** — Mainland China + Hong Kong + Macau (`6903,7613,10301`), excluding Taiwan.
- **中國大陸+港澳臺** — Mainland China + Hong Kong + Macau + Taiwan (`6903,7613,7887,10301`).
- **華南（含港澳）** — South China including Hong Kong and Macau.
- **華東** — East China, excluding Taiwan.

The member list under the selector is authoritative for a preset. Multiple places are queried as one iNaturalist union, so an observation covered by overlapping boundaries is counted once. See [the complete preset table](REGIONS.md).

### Reading results

Regional observation count includes the selected taxon and all its descendants. Seeing any descendant of an order counts that order as seen; an identification only at class level does not imply that its orders were seen. **Leaf taxa** normally comes from the downloaded taxonomy tree and can be verified per row with iNaturalist's `species_counts` endpoint.

Changing only the rank reuses the downloaded taxonomy trees. Errors are shown as errors rather than being converted into zero observations.

## Saved queries and custom place groups

You can also manage the same custom groups in the extension's settings page under **Saved regions**. Enter one `ID,ID = name` per line, for example `6903,7613,10301 = Mainland China + Hong Kong + Macao`. Names may be omitted. Save an empty list to remove custom groups only; built-in presets and saved searches remain unchanged. If another page edited the groups while settings were open, reopen settings before saving to avoid overwriting its changes.

Expand **查詢收藏與自訂地點組合** (Saved queries and custom place groups).

- A saved query keeps the complete observations URL and the current valid comparison settings. Loading it restores the page and panel but does not start a comparison automatically.
- A custom place group accepts up to 20 distinct iNaturalist place IDs. Editing a built-in preset and saving it creates a custom copy; built-in presets are not overwritten.
- Saved data stays in the current browser profile. A saved observations URL may contain personal search parameters.

## Upload AI helper

On `/observations/upload`, Leafwise appears beside the native **全選** (Select all) control in a collapsed form. Click **展開** (Expand) for the full panel.

| Chinese label | Meaning |
| --- | --- |
| 一鍵套用 AI 首選 | Apply eligible AI suggestions to upload drafts |
| 僅檢查建議 | Preview suggestions without changing taxa |
| 停止 | Stop the current batch |
| 自動處理空白觀察 | Process current and newly added blank cards while this page remains open |
| 保留已填寫的分類／文字 | Do not replace existing taxon choices or typed text |

The default score rule applies the first suggestion only when its combined score is strictly greater than 80. If that condition fails, Leafwise may use iNaturalist's separate “very confident about this ancestor” suggestion. It never uploads the draft; review every card and use iNaturalist's own Upload button yourself.

### Score display

Visual suggestions may show `combined_score(vision_score)`, for example `86.0(75.2)`:

Both values are raw API scores on a 0–100 scale, never multiplied based on their magnitude. A small score such as `0.316(0.382)` stays small. Positive values below 1 display three significant digits; other values display one decimal. Hover over a score for its full unrounded values. Only the text is rounded; matching and batch thresholds use the original numbers.

- The first value is iNaturalist's combined score using the information available to the website request, such as the image, place, and date. It is the only value used by Leafwise's batch threshold.
- The value in parentheses is the visual-model score for the same candidate and is informational only.

Leafwise passively reads the response to iNaturalist's existing computer-vision request. It does not send a second identification request and does not reorder the suggestions. Neither value is a calibrated probability of a correct identification, and values should not be compared between different observations.

The same score format is used in the native identification suggestion menu on an individual `/observations/<id>` page. Scores are shown only when Leafwise can safely match the response and visible suggestion by taxon ID; manual text-search results are not given AI scores.

The automatic blank-card mode runs in the open upload page. Browser tab throttling or suspension can pause page scripts, so keep that tab open and avoid letting the browser discard it during a long batch.

## Personal record cards

On a taxon page, title and taxonomy-tree counts follow the region selected at the top right. No selected region means worldwide personal records. The displayed triplet is observations, lowest observed taxa (not just species), then species-rank taxa. First/latest record cards and browse links use that same region. Clearing or switching the region discards outdated displayed counts while the new data loads. Individual observation pages still show global personal counts.

On taxon pages, the personal count uses `(observations|leaf taxa|species-rank taxa)`. The middle value matches the observations search page's “species” total: it counts the lowest observed taxa even when a taxon is identified only to genus or family. The last value matches the observer table's species column and counts taxa at species rank. Both use the same user and taxon scope as the observation count. If either extra API request fails, Leafwise keeps the known observation count without inventing a zero.

On observation and taxon pages, click the personal observation count beside a taxon name to open first and latest readable observations, plus a link to the complete list. The card queries only when opened and caches results briefly. It does not expose hidden coordinates or modify observations.

## Troubleshooting

- Confirm the installed extension version on the browser's extension page; a new GitHub Release alone does not update a developer-loaded copy.
- Reload the extension, then reload the iNaturalist page after installing a new build.
- If a result is missing, first check the selected user, root taxon, rank, place members, dates, months, project, and quality setting.
- If AI scores are absent, wait for the native suggestion request to finish and reopen the menu. A score remains hidden when the website response cannot be matched safely; it is not replaced by an invented zero.
- iNaturalist can change its private page components without notice. When reporting a problem, include the Leafwise version, browser version, page type, reproduction steps, and a screenshot with private data removed.

For data access and permissions, see [PRIVACY.md](PRIVACY.md). For the original Chinese instructions, see [USAGE.md](USAGE.md).
