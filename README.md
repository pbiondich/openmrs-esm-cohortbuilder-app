![OpenMRS CI](https://github.com/openmrs/openmrs-esm-cohortbuilder-app/actions/workflows/node.js.yml/badge.svg)

👋 New to our project? Be sure to review the ![OpenMRS 3 Frontend Developer Documentation](https://openmrs.atlassian.net/wiki/x/IABBHg) 🧑‍🏫

# OpenMRS ESM Cohort Builder App

The Cohort Builder is a tool in OpenMRS 1.0 in the Reporting Compatibility module (included with most OpenMRS installations) that lets the user perform ad-hoc queries for patients with defined characteristics, and combines multiple queries into more complex ones. 

## Running this code

```sh
yarn  # to install dependencies
yarn start  # to run the dev server
```
Once it is running, a browser window
should open with the OpenMRS 3 application. Log in and then navigate to
`/openmrs/spa/cohort-builder`.

## Opening the builder with a pre-filled definition

Links can open the builder with a search already run. The page reads one of these query parameters:

| Parameter | What it does |
| --- | --- |
| `?definition=<base64url JSON>` | Runs each criterion as a search, then (for 2 or more) a composition that ANDs them |
| `?cohort=<uuid>` | Shows the members of a saved cohort (the first 200 active members; a note says when there are more, or when some could not be loaded). It is not added to the search history. |
| `?query=<uuid>` | Runs a saved query |

If several are given, `definition` wins over `cohort`, which wins over `query`; the others are ignored with a console warning. The parameter is removed from the URL (with `history.replaceState`) as soon as it is read, so reloading the page does not run it again. A link opened while the builder is already shown (for example from the omnibar) runs too; if one is still running, the newest waiting link runs after it.

A `definition` link also fills in the Demographics, Enrollments and Drug Order tabs with its criteria (the first of each type, if a type repeats) and shows its first criterion's tab. For a link with one criterion, pressing Search there finds the same patients again and changing one field changes only that. For a link with several, each tab holds only its own criterion and Search runs only the open tab, not their combination; the combination is the composition in the Search History. Each new link fills them in afresh; tabs it has no criterion for are emptied. They are filled in even when the link's search fails, so it can be fixed and run again, while a link that can't be read leaves them as they were. A program or drug missing from its dropdown list is shown with its own name, or its uuid when that can't be found.

### The definition

```json
{
  "v": 1,
  "label": "Women aged 15-49 on ARVs",
  "criteria": [
    { "type": "demographics", "gender": "female", "minAge": 15, "maxAge": 49 },
    { "type": "enrollment", "programs": ["<program uuid>"], "enrolledOnOrAfter": "2024-01-01" },
    { "type": "drugOrder", "drugs": ["<drug uuid>"], "activeOnOrAfter": "today" }
  ]
}
```

- `v` must be `1`. `label` is optional text (up to 200 characters) shown as the description of the final search history entry.
- `criteria` has 1 to 5 items, ANDed together:
  - `demographics`: `gender` is `"male"`, `"female"` or `"any"` (the default); `minAge` is a whole number from 0 to 150 and `maxAge` from 1 to 150, with `minAge` not above `maxAge`. Give at least a gender other than `"any"`, `minAge` or `maxAge`. Only living patients are found, as in the Demographics tab.
  - `enrollment`: `programs` lists 1 to 10 program uuids; optional `enrolledOnOrAfter` and `enrolledOnOrBefore` are `YYYY-MM-DD` dates.
  - `drugOrder`: `drugs` lists 1 to 50 drug (`org.openmrs.Drug`, not concept) uuids; optional `activeOnOrAfter` and `activeOnOrBefore` are `YYYY-MM-DD` dates or `"today"`, which is worked out when the link is opened, so shared links stay relative.
- Uuids are standard uuids or 36-character ids such as CIEL's `1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`.
- The encoded definition is [base64url](https://www.rfc-editor.org/rfc/rfc4648#section-5) of UTF-8 JSON, with or without `=` padding, and at most 4096 bytes once decoded.

Anything else (unknown keys, wrong types, out-of-range values, bad base64url, too large) rejects the whole link: an error notification explains why, nothing is run, and the builder works as usual. If a linked saved cohort or query cannot be loaded, the same notification says so. If one of the searches fails on the server, the entries the link added are removed from the search history (searches you ran meanwhile stay) and the notification says which search failed.

To make a link, encode the JSON with either of these one-liners and append it to `/openmrs/spa/cohort-builder?definition=`:

```sh
node -e 'console.log(Buffer.from(process.argv[1]).toString("base64url"))' '{"v":1,"label":"Women aged 15-49","criteria":[{"type":"demographics","gender":"female","minAge":15,"maxAge":49}]}'
printf '%s' '{"v":1,"label":"Women aged 15-49","criteria":[{"type":"demographics","gender":"female","minAge":15,"maxAge":49}]}' | base64 | tr '+/' '-_' | tr -d '=\n'
```

Both print `eyJ2IjoxLCJsYWJlbCI6IldvbWVuIGFnZWQgMTUtNDkiLCJjcml0ZXJpYSI6W3sidHlwZSI6ImRlbW9ncmFwaGljcyIsImdlbmRlciI6ImZlbWFsZSIsIm1pbkFnZSI6MTUsIm1heEFnZSI6NDl9XX0`.

### Drug order searches need a server-side definition

The Drug Order tab and `drugOrder` criteria search with the reporting definition library key in the `drugOrderSearchDefinitionKey` config option, which defaults to `reporting.library.cohortDefinition.builtIn.drugOrderSearch`. Released reporting modules (up to 2.2.0) do not define that key, so on a stock server these searches fail. A link with a `drugOrder` criterion then shows the error notification and keeps nothing from the link.

Until the reporting module ships that definition, a site can provide its own without a module release:

1. Add a serialized `DrugOrderCohortDefinition` to `<application data directory>/configuration/reporting/definitionLibraries/cohort/drugOrderSearch.reportingserializerxml`. Its parameters must use the names the builder sends: `drugs` (list of Drug), `careSetting`, `activeOnOrAfter`, `activeOnOrBefore`, `activatedOnOrAfter` and `activatedOnOrBefore` (dates).
2. Point the builder at it in the frontend configuration:

   ```json
   {
     "@openmrs/esm-cohort-builder-app": {
       "drugOrderSearchDefinitionKey": "configuration.definitionlibrary.cohort.drugOrderSearch"
     }
   }
   ```


## Omnibar providers

When an omnibar is installed, the builder adds cohort rows to it outside a chart. They are four extensions in `omnibar-providers-slot`, built on the omnibar provider contract version 1 (a copy of the contract folder is in `src/omnibar/omnibar-contract/`; don't edit it). They need an omnibar host that mounts providers from that slot, such as `@openmrs/esm-omnibar-app` with contract 1; an older host that passes no hints works too. Without an omnibar nothing is mounted, and the builder works as before.

| Extension | Order | Row | Privileges |
| --- | --- | --- | --- |
| `omnibar-cohort-criteria-provider` | 20 | "Build cohort: …" when the whole text reads as a cohort ("women aged 15-49 enrolled in HIV program"). It opens the builder with that `?definition=`. Text it can't fully read gives no row | Get Patients, Run Reports |
| `omnibar-cohort-builder-provider` | 30 | "Cohort Builder" for text starting with "cohort", "build cohort", "find patients who" and the like | Get Patients, Run Reports |
| `omnibar-saved-cohorts-provider` | 40 | Saved cohorts by name (`GET /cohort?q=`), opened with `?cohort=` | Get Patient Cohorts, Get Patients |
| `omnibar-saved-queries-provider` | 50 | Saved queries by name (`GET /reportingrest/dataSetDefinition?q=[AdHocDataExport]`), opened with `?query=` | View Reports, Run Reports, Get Patients |

- The first two rows never call the server; nothing is searched until a row is chosen. The saved rows wait for typing to pause, cancel a request that is out of date, and need `omnibar.savedSearchMinCharacters` characters.
- Text shaped like a patient identifier (such as `100GEJ` or `MRN-1234`) gets no cohort row, so patient search has it to itself.
- When the server can't be reached, a saved group shows one quiet "unavailable" line.
- The links are built and checked against this builder's own decoder, so a row never offers a link the builder would refuse.

Config, in `@openmrs/esm-cohort-builder-app`:

| Key | Default | What it does |
| --- | --- | --- |
| `omnibar.enabled` | `true` | Off, every row stays empty and nothing is fetched. Removing the extensions with `"omnibar-providers-slot": {"remove": [...]}` works too |
| `omnibar.savedSearchMinCharacters` | `2` | Characters needed before saved cohorts and queries are searched. At least 1: a lower value is refused and treated as 1 |
| `omnibar.programs` | The RefApp demo programs | Programs the cohort row understands, with aliases ("enrolled in HIV") |
| `omnibar.drugGroups` | ARVs (demo formulary), TLD (none on the demo) | Drug groups the cohort row understands ("on ARVs"), as Drug uuids |
| `drugCriteriaEnabled` | `false` | Whether the server can run drug order searches (see above). Off, "on ARVs" gives no row |
