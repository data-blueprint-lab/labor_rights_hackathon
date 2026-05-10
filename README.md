# Labor Rights Story Portal

Static hackathon site for the labor-rights datasets in `src-data/`.

## Live site

Open the rendered story portal here:

https://data-blueprint-lab.github.io/labor_rights_hackathon/

Use this link instead of opening the HTML files in the GitHub repo browser, which shows source code.

## What it is

- A story-first portal built around five labor metrics:
  - employment rate by sex
  - gender pay gap
  - in-work at-risk-of-poverty rate by sex
  - mean weekly hours usually worked per employee by sex
  - employed persons by job tenure
- The main narrative is the **equality illusion**: countries can look fair on one metric while still showing hidden gaps in access, pay, workload, or security.

## Final output

- `index.html` is the master portal page.
- The chapter pages are:
  - `access.html`
  - `pay.html`
  - `workload.html`
  - `security.html`
- All pages open directly in a browser because the normalized data bundle is pre-generated in `data/labor-rights-data.js`.

## Regenerate data

If the CSV sources change, rebuild the local data bundle with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-data.ps1
```
