# Leafwise · iNaturalist Enhancement

[![Build, test and release](https://github.com/Photon-gjq/leafwise-inat-enhancement/actions/workflows/build.yml/badge.svg)](https://github.com/Photon-gjq/leafwise-inat-enhancement/actions/workflows/build.yml)

[繁體中文](README.md) · [English user guide](docs/GUIDE.en.md)

Leafwise is a browser extension that adds comparison, planning, personal-record, and upload-assistance tools to the iNaturalist website. One shared source tree builds the Chrome, Edge, and Firefox editions. Leafwise is not an official iNaturalist product.

The extension interface is currently in Chinese. The [English user guide](docs/GUIDE.en.md) translates the main controls and explains each workflow.

## Download and install

Download the package for your browser from the [latest GitHub Release](https://github.com/Photon-gjq/leafwise-inat-enhancement/releases/latest). All three packages use the same version number. The signed Firefox edition is also available from [Mozilla Add-ons](https://addons.mozilla.org/firefox/addon/leafwise-inat-enhancement/).

| Browser | Package | Installation |
| --- | --- | --- |
| Chrome 114+ | `Leafwise-x.y.z-chrome.zip` | Extract it, open `chrome://extensions`, enable Developer mode, and load the extracted `extension` folder. |
| Current desktop Edge | `Leafwise-x.y.z-edge.zip` | Extract it, open `edge://extensions`, enable Developer mode, and load the extracted `extension` folder. |
| Firefox 140+ | `Leafwise-x.y.z-firefox-unsigned.xpi` | For temporary testing, open `about:debugging#/runtime/this-firefox`, choose “Load Temporary Add-on,” and select the XPI. For normal installation, use Mozilla Add-ons. |

A GitHub Release updates the downloadable files; it does not automatically replace a locally loaded Chrome or Edge folder. See the [English guide](docs/GUIDE.en.md#installation-and-updates) for update steps.

## Features

- **Taxon comparison:** find branches you have never observed, branches missing from a selected year or place, or first records for a year. Aggregate from kingdom down to species.
- **Seasonal target lists:** restrict regional candidates by month, date range, project, and quality grade without accidentally narrowing the personal baseline.
- **Place groups and saved queries:** includes Mainland China + Hong Kong + Macau, Mainland China + Hong Kong + Macau + Taiwan, and several regional presets. Custom unions and complete search URLs can be saved locally.
- **Personal record cards and taxon statistics:** taxon pages show personal observations, leaf taxa, and species-rank taxa as `(observations|leaf taxa|species)`; open first, latest, and complete observation links from the count.
- **Batch-open activity:** open each distinct observation from the currently loaded activity dropdown in one background tab, even when it has multiple updates.
- **Copy and CSV export:** export the complete filtered comparison result with scope metadata and verified leaf-taxon counts.
- **AI suggestion enhancement:** show iNaturalist's existing `combined_score(vision_score)` beside visual suggestions on upload and observation pages, and optionally apply upload suggestions in batches.

The extension preserves iNaturalist's suggestion order. It does not rerank candidates, calculate its own identification probability, or submit observations automatically. The displayed scores are not calibrated correctness probabilities and should not be compared across observations.

## Documentation

- [English user guide](docs/GUIDE.en.md)
- [Chinese usage guide](docs/USAGE.md)
- [Installation and updates](docs/INSTALL.md)
- [Built-in place groups](docs/REGIONS.md)
- [Data and permissions](docs/PRIVACY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)

## Local development

Install Node.js 22 or later, clone the repository, and run:

```sh
npm ci
npm run check
npx playwright install chromium firefox
npm run test:layout
npm run package
```

`npm run check` builds and tests the Chrome, Edge, and Firefox outputs. `npm run test:layout` exercises the UI in isolated browsers. `npm run package` produces reproducible user ZIPs, Chrome/Edge store-upload ZIPs, Firefox XPI, and SHA-256 checksums. These commands do not sign in to iNaturalist or publish observations. See the [store publishing guide](docs/STORE_PUBLISHING.md) for first-time submissions and later automated updates.

## Origin and licence status

The original QG-inat-enhancement extension was developed by **Wang.QG**. Leafwise continues that work with the original author's permission and retains the existing Firefox extension ID. The repository is source-visible but is not offered under MIT or another general open-source licence; see [NOTICE.md](NOTICE.md).
