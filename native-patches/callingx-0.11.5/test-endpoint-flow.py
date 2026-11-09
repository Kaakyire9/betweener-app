"""Compile and execute the actual Callingx endpoint collectors on a local JVM."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[2]
RELATIVE_SOURCE = Path(
    "node_modules/@stream-io/react-native-callingx/android/src/main/java/"
    "io/getstream/rn/callingx/repo/TelecomCallRepository.kt"
)
EXPECTED_UPSTREAM_FAILURES = {
    "single_consumer", "empty_then_ready", "ready_releases_pre_call",
    "endpoint_changes", "canonical_isolation",
    "first_registered_snapshot_is_seeded",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / RELATIVE_SOURCE)
    parser.add_argument("--kotlinc", default=os.environ.get("CALLINGX_KOTLINC"))
    parser.add_argument("--coroutines", default=os.environ.get("CALLINGX_COROUTINES_JAR"))
    parser.add_argument("--expect-upstream-race", action="store_true")
    parser.add_argument("--compare-upstream", action="store_true")
    args = parser.parse_args()
    compiler = args.kotlinc or shutil.which("kotlinc")
    if not compiler and os.name == "nt":
        candidate = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / (
            "Android/Android Studio/plugins/Kotlin/kotlinc/bin/kotlinc.bat"
        )
        if candidate.is_file():
            compiler = str(candidate)
    if not compiler:
        parser.error("Set CALLINGX_KOTLINC to a local Kotlin compiler; nothing is downloaded")
    coroutines = Path(args.coroutines) if args.coroutines else (
        Path(compiler).resolve().parents[1] / "lib/kotlinx-coroutines-core-jvm.jar"
    )
    java = shutil.which("java")
    if not coroutines.is_file() or not java:
        parser.error("Java and a local kotlinx-coroutines-core-jvm.jar are required")

    if args.compare_upstream:
        # Reconstruct the exact unpatched source in a disposable tree. Never modify node_modules.
        with tempfile.TemporaryDirectory(prefix="callingx-upstream-control-") as scratch:
            original = Path(scratch) / RELATIVE_SOURCE
            original.parent.mkdir(parents=True)
            original.write_bytes(args.source.read_bytes())
            patch = ROOT / "patches/@stream-io+react-native-callingx+0.11.5.patch"
            subprocess.run([
                "git", "apply", "--reverse", "--whitespace=nowarn", str(patch),
            ], cwd=scratch, check=True, timeout=15)
            command = [sys.executable, str(Path(__file__).resolve()), "--kotlinc", str(compiler),
                       "--coroutines", str(coroutines)]
            subprocess.run(command + ["--source", str(original), "--expect-upstream-race"], check=True)
        subprocess.run(command + ["--source", str(args.source)], check=True)
        return

    source_bytes = args.source.read_bytes()
    source = source_bytes.decode("utf-8").replace("\r\n", "\n")
    start = "                launch {\n                    currentCallEndpoint.collect {"
    end = "                launch {\n                    isMuted.collect {"
    if source.count(start) != 1 or source.count(end) != 1:
        parser.error("Callingx collector boundaries changed; review the harness before proceeding")
    block = source[source.index(start):source.index(end)]
    template = Path(__file__).with_name("EndpointFlowTest.kt").read_text(encoding="utf-8")
    marker = "/* REPOSITORY_ENDPOINT_COLLECTORS */"
    assert template.count(marker) == 1
    observer_start = "    private fun observeCalls(): Job {"
    observer_end = "    /** Collect the action source"
    if source.count(observer_start) != 1 or source.count(observer_end) != 1:
        parser.error("Callingx observer boundaries changed; review the harness before proceeding")
    observer = source[source.index(observer_start):source.index(observer_end)]
    observer_marker = "/* REPOSITORY_CALL_OBSERVER */"
    assert template.count(observer_marker) == 1

    print("Scope: local JVM coroutine delivery; no Android/device/provider verification", flush=True)
    print("Source SHA256: " + hashlib.sha256(source_bytes).hexdigest(), flush=True)
    print("Coroutines SHA256: " + hashlib.sha256(coroutines.read_bytes()).hexdigest(), flush=True)
    with tempfile.TemporaryDirectory(prefix="callingx-endpoint-flow-") as scratch:
        test = Path(scratch) / "EndpointFlowTest.kt"
        jar = Path(scratch) / "endpoint-flow-tests.jar"
        test.write_text(template.replace(marker, block).replace(observer_marker, observer), encoding="utf-8")
        subprocess.run([
            compiler, str(test), "-cp", str(coroutines), "-jvm-target", "11",
            "-include-runtime", "-d", str(jar),
        ], check=True, timeout=90)
        result = subprocess.run([
            java, "-cp", str(jar) + os.pathsep + str(coroutines), "EndpointFlowTestKt",
        ], text=True, capture_output=True, timeout=30)
        print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, end="")
        failures = set(re.findall(r"^FAIL (\w+):", result.stdout, re.MULTILINE))
        passes = re.findall(r"^PASS (\w+)$", result.stdout, re.MULTILINE)
        if args.expect_upstream_race:
            if result.returncode != 1 or failures != EXPECTED_UPSTREAM_FAILURES or len(passes) != 5:
                raise SystemExit("Upstream control did not reproduce exactly the six expected failures")
            print("CONTROL VERIFIED: original competing collectors lose endpoint updates")
        elif result.returncode != 0 or failures or len(passes) != 11:
            raise SystemExit("Patched endpoint collector regression failed")


if __name__ == "__main__":
    main()
