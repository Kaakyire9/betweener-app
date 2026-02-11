import argparse
import os
import subprocess
import sys
from pathlib import Path


PROJECT_ID_FALLBACK = "jbyblhithbqwojhwlenv"
SCHEMA = "public"
OUT_FILE = Path("supabase/types/database.ts")


def run_cmd(project_id: str) -> str:
    cmd = [
        "supabase",
        "gen",
        "types",
        "--lang",
        "typescript",
        "--project-id",
        project_id,
        "--schema",
        SCHEMA,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write(res.stderr or "")
        sys.stderr.write(res.stdout or "")
        raise RuntimeError(f"supabase gen types failed (exit {res.returncode})")

    if not res.stdout or res.stdout.strip() == "":
        raise RuntimeError("supabase gen types produced empty output")

    # Keep diffs stable across platforms.
    return res.stdout.replace("\r\n", "\n")


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Fail if generated types differ from committed file")
    args = parser.parse_args()

    project_id = os.environ.get("SUPABASE_PROJECT_ID") or os.environ.get("SUPABASE_PROJECT_REF") or PROJECT_ID_FALLBACK
    generated = run_cmd(project_id)

    if not args.check:
        write_file(OUT_FILE, generated)
        sys.stdout.write(f"Wrote {OUT_FILE.as_posix()} (project {project_id}, schema {SCHEMA})\n")
        return 0

    if not OUT_FILE.exists():
        sys.stderr.write(f"Missing {OUT_FILE.as_posix()}. Run: npm run supabase:types\n")
        return 1

    existing = OUT_FILE.read_text(encoding="utf-8").replace("\r\n", "\n")
    if existing != generated:
        sys.stderr.write(
            "\n".join(
                [
                    f"Supabase generated types are out of date: {OUT_FILE.as_posix()}",
                    f"Project: {project_id} | Schema: {SCHEMA}",
                    "",
                    "Run: npm run supabase:types",
                    "Then commit the updated file.",
                    "",
                ]
            )
            + "\n"
        )
        return 1

    sys.stdout.write(f"Supabase generated types are up to date: {OUT_FILE.as_posix()}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

