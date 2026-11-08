# Phase B2 Docker Scout security gate

- Scan start (UTC): `2026-10-15T13:17:57.5441558Z`
- Human-readable scan finish (UTC): `2026-10-15T13:18:21.1411906Z`
- Structured scan file timestamp (UTC): `2026-10-15T13:18:50Z`
- Docker context: `desktop-linux`
- Image reference: `haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2`
- Verified local image descriptor digest: `sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2`
- Platform: `linux/amd64`
- Scanner: Docker Scout CLI `v1.24.0` (`b1c933fc27ae2b494f9a43376693f2f1fe7b60b9`)
- Authentication/service status: successful online analysis; both commands exited `0`; no authentication, service, or coverage error was reported
- Human-readable command: `docker --context desktop-linux scout cves --details --platform linux/amd64 --output <evidence-dir>/docker-scout-cves.txt "local://haproxy:3.2.26-alpine@sha256:51f173c6825753d9e3a888b1004a1c2cb730936cc9178730a5c555246bd161a2"`
- Structured command: the same command with `--format sarif` and output `docker-scout-cves.sarif.json`

## Result

- Critical: `0`
- High: `0`
- Medium: `0`
- Low: `0`
- Affected packages, installed versions, and fixed versions: none reported because the scan returned no findings
- Indexed packages: `30`
- Human-readable result: `No vulnerable packages detected`
- SARIF result: `0` rules and `0` results
- Scanner advisory database timestamp: **NOT EXPOSED** by either saved output
- Explicit distribution identity in the zero-finding outputs: **NOT EXPOSED**; local image metadata and the pinned tag identify the image as Alpine-based
- HAProxy package/version identification in the zero-finding outputs: **NOT EXPOSED**; the report does not provide a package inventory when it has no findings
- Warning: Docker Scout CLI `v1.26.0` was advertised as available. The installed `v1.24.0` scanner was not upgraded during this maintenance window.

Freshness evidence is the successful online analysis at the timestamps above. The prior Phase B2 official-source cross-check recorded Alpine 3.24 security database `Last-Modified` values of `2026-10-13T20:27:09Z` (main) and `2026-10-14T23:40:46Z` (community), and HAProxy's official 3.2 status page showed `3.2.26` as current with no queued known bugs on `2026-10-15`. These checks supplement, but do not expand, Docker Scout's package coverage.

## Gate decision

**PASS for the bounded socket identity probe.** No Critical, High, Medium, or Low finding was reported, and the scan completed without an authentication, service, or coverage error. This result is evidence about the scanner's recognised packages at scan time; it is not a claim that the image is vulnerability-free or that unreported components were assessed.

## Evidence integrity

- `docker-scout-cves.txt` SHA-256: `0981E95E5CF754AB6DAC3C33A10C393C4851C946A74E8B2E651548C4423218FF`
- `docker-scout-cves.sarif.json` SHA-256: `D5792A5052FB157AAF686DEC92FD7A5A2D83F524C846C9C4032FC13E820A44DF`
