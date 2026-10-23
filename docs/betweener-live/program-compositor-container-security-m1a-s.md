# Program compositor container security - Milestone 1A-S

## Scope and gate

This audit covers the immutable staging image `adaptive-stage-m1-5812bc9` and its
replacement. Production and Milestone 2 are out of scope. ECR Basic scanning is
the deployment gate:

- unresolved Critical findings: `0`
- High findings with a safe fix: `0`
- every remaining High: upstream status, reachability, mitigation and residual
  risk recorded below

The old image remains immutable and is the rollback artifact.

## Baseline provenance

| Property | Old image | Hardened candidate |
| --- | --- | --- |
| Base | `node:24-bookworm-slim` | `node:24-trixie-slim` |
| Base OCI index | `sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205` | `sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea` |
| OS | Debian 12 bookworm | Debian 13 trixie |
| Node | 24.22.1 | 24.22.1 |
| Browser | Debian Chromium 155.0.8059.79 | Pinned Chrome for Testing 156.0.8078.47 |
| FFmpeg | Debian 5.1.9, full feature set | Pinned FFmpeg 9.0.2, allowlisted feature set |
| Image digest | `sha256:373029b26a8d851c761c8aaa725fb2db9bcbd713621630b9f8033eb7b76e180d` | `sha256:d358cec4887f030b6735fab9f9c90e48146b46d2716e84ec8dbf81aa88aa4736` |
| Runtime manifest | `sha256:35f68b89f1d3f03e82fd15c91630984d2dccdda0ff2a3ac92bae7c65c4edb443` | `sha256:fde55b45dcf20ecd1b3e6db9edc1a692f167f95d162cc883577db12edc76c0c1` |
| Compressed runtime size | `450,217,320` bytes | `403,749,029` bytes |
| Source revision | `5812bc9e6b93733e9f543c5e2003e1660f17a0d8` | `98c3013781113ff4b95a580b090f3358eb9deb70` |

The old runtime installed Debian `chromium`, `ffmpeg` and full `pulseaudio`.
That pulled broad decoder, demuxer and codec graphs including librist/cJSON,
JPEG XL and librsvg. The hardened image keeps build tools in a separate stage,
uses checksum-pinned upstream artifacts, extracts only the PulseAudio daemon,
and ships no distro FFmpeg or Chromium package. npm/yarn, source trees, archives,
test dependencies and package caches are absent from the final image.

## Dependency and reachability model

The table uses these paths:

- `F`: direct Debian FFmpeg runtime and its codec/demux dependencies.
- `C`: Chromium/GTK image stack.
- `B`: base Node/Debian runtime.

`Direct` means explicitly installed for runtime; `Indirect` means pulled by a
runtime dependency. All findings existed in the old final runtime image.

| CVE | Severity / CVSS | Old package | Path | Requirement | Runtime reachability and disposition |
| --- | --- | --- | --- | --- | --- |
| CVE-2026-111497 | Critical / 9.2 | brotli 1.0.9-2 | F, C, B | Indirect | `PATCH_AVAILABLE`: replace system Brotli with 1.2.1; Node 24.22.1 also contains the embedded fix. |
| CVE-2026-75143 | Critical / 9.3 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `PACKAGE_CAN_BE_REPLACED`: replace with FFmpeg 9.0.2; RIST is not compiled and only trusted X11/Pulse inputs remain. |
| CVE-2026-52490 | Critical / 9.8 | tiff 4.5.0-6+deb12u4 | C | Indirect | `PATCH_AVAILABLE`: replace runtime library with TIFF 4.7.2; TIFF tools, including `tiffcrop`, are not shipped. |
| CVE-2026-29036 | High / 8.7 | cjson 1.7.15-1+deb12u4 | F | Indirect | `PACKAGE_CAN_BE_REMOVED`: removing Debian FFmpeg/librist removes cJSON. JSON Patch is not used by the compositor. |
| CVE-2026-67215 | High / 8.7 | cjson 1.7.15-1+deb12u4 | F | Indirect | `PACKAGE_CAN_BE_REMOVED`: same cJSON removal; affected cJSON Utils API is absent. |
| CVE-2026-67216 | High / 8.2 | cjson 1.7.15-1+deb12u4 | F | Indirect | `PACKAGE_CAN_BE_REMOVED`: same cJSON removal; affected comparison API is absent. |
| CVE-2025-70103 | High / 7.3 | jpeg-xl 0.7.0-10+deb12u1 | F | Indirect | `PACKAGE_CAN_BE_REMOVED`: JPEG XL is not in the allowlisted FFmpeg build. |
| CVE-2026-52584 | High / 7.1 | jpeg-xl 0.7.0-10+deb12u1 | F | Indirect | `PACKAGE_CAN_BE_REMOVED`: JPEG XL decoder is absent. |
| CVE-2026-96889 | High / 7.8 | librsvg 2.54.7+dfsg-1~deb12u1 | F | Indirect | `PACKAGE_CAN_BE_REMOVED`: distro FFmpeg SVG support is removed; compositor scenes are bundled HTML/CSS. |
| CVE-2026-12912 | High / 7.3 | tiff 4.5.0-6+deb12u4 | C | Indirect | `PATCH_AVAILABLE`: system library replaced by TIFF 4.7.2 with tools/codecs disabled. |
| CVE-2026-85091 | High / 8.3 | zlib 1.2.13.dfsg-1 | B, C, F | Indirect | `PATCH_AVAILABLE`: replace with upstream fixed commit `df84af25dc1942490e1d1c899a07619152a46148`. |
| CVE-2025-52290 | High / 7.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `PACKAGE_CAN_BE_REPLACED`: FFmpeg 9.0.2 minimal build; affected legacy path is not enabled. |
| CVE-2026-8461 | High / 8.8 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `PACKAGE_CAN_BE_REPLACED`: FFmpeg 9.0.2 minimal build; arbitrary media decode is disabled. |
| CVE-2026-38347 | High / 7.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `PATCH_AVAILABLE`: upgraded swscale; scale receives fixed, trusted raw X11 frames only. |
| CVE-2026-38350 | High / 7.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `PATCH_AVAILABLE`: upgraded swscale; fuzzer-controlled frame parameters are not exposed. |
| CVE-2026-52296 | High / 7.1 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `PACKAGE_CAN_BE_REPLACED`: WMA encoding is not compiled. |
| CVE-2026-52297 | High / 7.1 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `PACKAGE_CAN_BE_REPLACED`: affected WMA path is not compiled. |
| CVE-2026-58049 | High / 8.8 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: RASC decoder and arbitrary file decoding are not compiled. |
| CVE-2026-64830 | High / 8.7 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected decoder is excluded by the decoder allowlist. |
| CVE-2026-64832 | High / 8.7 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: NVDEC and hardware decode are not compiled. |
| CVE-2026-64833 | High / 7.1 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected decoder is excluded by the decoder allowlist. |
| CVE-2026-64834 | High / 8.7 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected decoder is excluded by the decoder allowlist. |
| CVE-2026-64835 | High / 8.7 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: ADX decoder is not compiled. |
| CVE-2026-65703 | High / 8.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected codec/demux path is excluded. |
| CVE-2026-65704 | High / 7.3 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected codec/demux path is excluded. |
| CVE-2026-65705 | High / 7.3 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected codec/demux path is excluded. |
| CVE-2026-65706 | High / 8.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected codec/demux path is excluded. |
| CVE-2026-66036 | High / 7.7 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected decoder is excluded. |
| CVE-2026-66037 | High / 7.1 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected decoder is excluded. |
| CVE-2026-66038 | High / 7.1 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: LCL/ZLIB decoder is not compiled. |
| CVE-2026-66039 | High / 8.7 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: MACE6/CAF decode is not compiled. |
| CVE-2026-66040 | High / 8.7 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: native PNG/APNG encoders are not compiled. |
| CVE-2026-70628 | High / 8.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: DVB subtitle parser and WTV demuxer are not compiled. |
| CVE-2026-70632 | High / 8.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected codec/demux path is excluded. |
| CVE-2026-75141 | High / 8.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: HEVC decoder and configuration mux path are not compiled. |
| CVE-2026-75142 | High / 8.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected codec/mux path is excluded. |
| CVE-2026-75144 | High / 8.5 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: RTP and VC-2/Dirac packetization are not compiled. |
| CVE-2026-75146 | High / 7.2 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected codec/demux path is excluded. |
| CVE-2026-96611 | High / 7.8 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected input path is excluded. |
| CVE-2026-107695 | High / 7.1 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: HLS demux and HTTP input are not compiled. |
| CVE-2026-107696 | High / 7.1 | ffmpeg 5.1.9-0+deb12u1 | F | Direct | `NOT_RUNTIME_REACHABLE`: affected network input path is excluded. |
| CVE-2026-53613 | High / 7.0 | util-linux 2.38.1-5+deb12u3 | B | Indirect | `NO_FIX_AVAILABLE` for every legacy path in stable trixie. New image has 2.41.5; no fstab user mounts, no `CAP_SYS_ADMIN`, non-root UID and read-only root. Residual risk: package metadata remains, but the privileged mount preconditions are absent. |
| CVE-2026-53615 | High / 8.0 | util-linux 2.38.1-5+deb12u3 | B | Indirect | `PATCH_AVAILABLE`: trixie 2.41.5 is newer than the 2.41.4 fix. The compositor never probes block devices. |
| CVE-2026-76642 | High / 8.5 | util-linux 2.38.1-5+deb12u3 | B | Indirect | `NO_FIX_AVAILABLE` in the selected stable base. Mount helpers are not invoked; mount capability is dropped and root is read-only. Residual local privilege path is unreachable. |
| CVE-2026-78408 | High / 7.9 | util-linux 2.38.1-5+deb12u3 | B | Indirect | `NO_FIX_AVAILABLE` in stable trixie. `nsenter` is removed, the task has no privileged host namespace access, runs non-root and drops all capabilities. Residual risk is limited to scanner package presence. |
| CVE-2026-78409 | High / 7.0 | util-linux 2.38.1-5+deb12u3 | B | Indirect | `NO_FIX_AVAILABLE` in stable trixie. No fstab authorization, mount capability or writable host path exists. Residual local mount path is unreachable. |
| CVE-2026-78410 | High / 7.8 | util-linux 2.38.1-5+deb12u3 | B | Indirect | `NO_FIX_AVAILABLE` in stable trixie. SUID mount tools are removed and all capabilities are dropped. Residual risk is package-level only. |

## Hardened runtime controls

- multi-stage build; compiler, headers, source and test dependencies never copy
  into the final stage
- checksum verification for every upstream archive and Debian daemon package
- FFmpeg allowlist: X11 and Pulse inputs, rawvideo/PCM decoders, H.264/AAC
  encoders, FLV output, RTMP/RTMPS transport; RIST, RTSP, HLS and general media
  decoding are absent
- non-root `1000:1000`, read-only root filesystem, all Linux capabilities
  dropped, init process enabled, only `/tmp` writable
- a non-essential, capability-free root initializer changes only the empty
  Fargate `/tmp` volume mode to `1777`, exits successfully, and receives no
  application secret; the long-running compositor remains UID/GID `1000:1000`
- no inbound security-group rules and ECS Exec disabled
- source SHA, build identifier, manifest version, resolver version and native
  component versions embedded in image metadata/runtime environment

## Validation and residual-risk policy

The candidate is not deployable until all of these pass: unit tests, Phase C,
Phase C2, Adaptive Stage M1, TypeScript/build/lint, container build, three
H.264/AAC shape encodes at 30 fps, X11 capture, Pulse capture, Chrome render,
`/healthz`, SIGTERM shutdown and the completed ECR scan.

ECR may retain util-linux High findings because it evaluates installed package
metadata rather than ECS capabilities and actual process invocation. They may
be accepted only if no safe stable update exists and the post-push evidence
still confirms non-root execution, read-only root, capability drop and removal
of the affected privileged utilities. Any Critical result or safely fixable High
result blocks deployment.

## Hardened-image ECR disposition

ECR Basic scanning completed on 23 October 2026 for runtime manifest
`sha256:fde55b45dcf20ecd1b3e6db9edc1a692f167f95d162cc883577db12edc76c0c1`:

- Critical: `0`
- High: `9`
- Medium: `30`
- Low: `8`

No remaining High has a safe, ABI-compatible fix in Debian 13. The fixed
libxml2 release changes its ELF soname from `libxml2.so.2` to `libxml2.so.16`;
installing it over the stable package would break the Mesa/LLVM and GTK
dependency graph. Replacing glibc from Debian testing/unstable would be an
uncontrolled core-runtime upgrade. Both changes are therefore rejected in
favour of the following explicit residual-risk controls.

| CVE | CVSS | Package / source | Requirement | Classification, reachability, mitigation and residual risk |
| --- | --- | --- | --- | --- |
| CVE-2026-74860 | 8.5 | libxml2 `2.12.7+dfsg+really2.9.14-2.1+deb13u3` / Debian trixie | Indirect through `libllvm19` and `shared-mime-info` | `NOT_RUNTIME_REACHABLE`: requires libxml2 Python bindings; Python and those bindings are absent. No residual compositor input path exists. |
| CVE-2026-86138 | 7.8 | libxml2, same source | Indirect | `NO_FIX_AVAILABLE`: the worker does not parse attacker XML or call `xmlDictAddQString`; fixed ABI 16 is incompatible with stable consumers. Mitigated by trusted bundled HTML/CSS, non-root execution, read-only root and dropped capabilities. Residual risk is limited to a future indirect consumer exposing untrusted XML; dependency scans must continue on every rebuild. |
| CVE-2026-86139 | 7.8 | libxml2, same source | Indirect | `FALSE_POSITIVE_OR_SCANNER_LIMITATION`: Debian records the affected code as introduced in 2.13.0, while the package's real upstream source is 2.9.14 despite its epoch/version prefix. |
| CVE-2026-86140 | 7.8 | libxml2, same source | Indirect | `NO_FIX_AVAILABLE`: `xmlSnprintfElements` is not called by the compositor and no untrusted XML/DTD enters its indirect consumers. ABI 16 is not a safe in-place update. Residual risk is denial/corruption only if a future component adds this XML validation path. |
| CVE-2026-86142 | 7.8 | libxml2, same source | Indirect | `NO_FIX_AVAILABLE`: XPointer evaluation is not used by Node, Chrome launch, Xvfb, PulseAudio or FFmpeg. ABI 16 is incompatible. Residual risk is limited to future use of attacker-controlled XPointer documents. |
| CVE-2026-86143 | 7.3 | libxml2, same source | Indirect | `NO_FIX_AVAILABLE`: the compositor has no libxml output callback or XML serialization path. ABI 16 is incompatible. Non-root/read-only execution limits impact if a future indirect path is introduced. |
| CVE-2026-86144 | 7.8 | libxml2, same source | Indirect | `NO_FIX_AVAILABLE`: the worker never calls XInclude or supplies a custom XML resource loader, so the NONET/SSRF path is absent. Network destinations remain application-defined Supabase and RTMP endpoints. Residual risk requires a future untrusted XInclude consumer. |
| CVE-2026-5435 | 7.3 | glibc `2.41-12+deb13u4` / Debian trixie | Base runtime | `NO_FIX_AVAILABLE`: Debian marks the stable issue minor; affected deprecated TSIG-printing resolver functions are not used. All setuid/setgid bits are removed, the task runs as UID 1000 and drops all capabilities. Residual risk requires adding a caller of the deprecated APIs. |
| CVE-2026-19499 | 7.7 | glibc, same source | Base runtime | `NO_FIX_AVAILABLE`: `strfmon`/`strfmon_l` monetary formatting is absent from compositor code and no network-facing application impact is known upstream. Replacing glibc across releases is unsafe. Residual risk requires a future attacker-controlled monetary format path. |

The gate passes with documented residuals: unresolved Critical findings are
zero and safely fixable High findings are zero. The nine scanner Highs remain
visible rather than being hidden by deleting package metadata. Reassess them
when Debian publishes ABI-compatible stable updates or when the runtime
dependency graph changes.
