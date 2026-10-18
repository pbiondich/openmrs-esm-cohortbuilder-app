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
| `?cohort=<uuid>` | Shows the members of a saved cohort |
| `?query=<uuid>` | Runs a saved query |

If several are given, `definition` wins over `cohort`, which wins over `query`; the others are ignored with a console warning. The parameter is removed from the URL (with `history.replaceState`) as soon as it is read, so reloading the page does not run it again.

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
  - `demographics`: `gender` is `"male"`, `"female"` or `"any"` (the default); `minAge` and `maxAge` are whole numbers from 0 to 150, with `minAge` not above `maxAge`. Give at least a gender other than `"any"`, `minAge` or `maxAge`. Only living patients are found, as in the Demographics tab.
  - `enrollment`: `programs` lists 1 to 10 program uuids; optional `enrolledOnOrAfter` and `enrolledOnOrBefore` are `YYYY-MM-DD` dates.
  - `drugOrder`: `drugs` lists 1 to 50 drug (`org.openmrs.Drug`, not concept) uuids; optional `activeOnOrAfter` and `activeOnOrBefore` are `YYYY-MM-DD` dates or `"today"`, which is worked out when the link is opened, so shared links stay relative.
- Uuids are standard uuids or 36-character ids such as CIEL's `1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`.
- The encoded definition is [base64url](https://www.rfc-editor.org/rfc/rfc4648#section-5) of UTF-8 JSON, with or without `=` padding, and at most 4096 bytes once decoded.

Anything else (unknown keys, wrong types, out-of-range values, bad base64url, too large) rejects the whole link: an error notification explains why, nothing is run, and the builder works as usual. If one of the searches fails on the server, the search history goes back to how it was before the link was opened and the notification says which search failed.

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

