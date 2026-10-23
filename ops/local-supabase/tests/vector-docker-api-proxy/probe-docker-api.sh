#!/bin/sh
set -eu

docker_socket_path="${DOCKER_SOCKET_PATH:-/var/run/docker.sock}"

request_body() {
    endpoint="$1"
    response="$(
        printf 'GET %s HTTP/1.1\r\nHost: docker\r\nConnection: close\r\n\r\n' "$endpoint" |
            timeout 5 socat -T 4 STDIO,ignoreeof UNIX-CONNECT:"$docker_socket_path" |
            tr -d '\r'
    )"
    status="$(printf '%s\n' "$response" | sed -n '1p')"
    case "$status" in
        'HTTP/1.1 200 '*|'HTTP/1.0 200 '*) ;;
        *) printf 'Unexpected response for %s: %s\n' "$endpoint" "$status" >&2; exit 1 ;;
    esac
    headers="$(printf '%s\n' "$response" | sed -n '1,/^$/p')"
    body="$(printf '%s\n' "$response" | sed '1,/^$/d')"
    if printf '%s\n' "$headers" | grep -Eiq '^Transfer-Encoding:[[:space:]]*chunked[[:space:]]*$'; then
        body="$(printf '%s\n' "$body" | sed -E '/^[0-9A-Fa-f]+(;.*)?$/d' | tr -d '\n')"
    fi
    printf '%s\n' "$body"
}

json_string() {
    body="$1"
    key="$2"
    printf '%s' "$body" | awk -v wanted="$key" '
        {
            for (i = 1; i <= length($0); i++) {
                c = substr($0, i, 1)

                if (in_string) {
                    if (escaped) {
                        token = token c
                        escaped = 0
                    } else if (c == "\\") {
                        escaped = 1
                    } else if (c == "\"") {
                        in_string = 0
                        if (role == "key") {
                            current_key = token
                            expect_key = 0
                        } else if (role == "target") {
                            print token
                            found = 1
                            exit
                        } else if (role == "value") {
                            expect_value = 0
                        }
                    } else {
                        token = token c
                    }
                    continue
                }

                if (c == "{" || c == "[") {
                    depth++
                    if (depth == 1) expect_key = 1
                } else if (c == "}" || c == "]") {
                    depth--
                } else if (depth == 1 && c == ",") {
                    expect_key = 1
                    expect_value = 0
                    current_key = ""
                } else if (depth == 1 && c == ":") {
                    expect_value = 1
                } else if (depth == 1 && c == "\"") {
                    in_string = 1
                    escaped = 0
                    token = ""
                    if (expect_key) role = "key"
                    else if (expect_value && current_key == wanted) role = "target"
                    else role = "value"
                }
            }
        }
        END {
            if (!found) exit 1
        }
    '
}

ping="$(request_body '/_ping')"
[ "$ping" = 'OK' ] || { printf 'Unexpected ping body.\n' >&2; exit 1; }

version_body="$(request_body '/version')"
info_body="$(request_body '/info')"

daemon_id="$(json_string "$info_body" 'ID')"
daemon_name="$(json_string "$info_body" 'Name')"
server_version="$(json_string "$version_body" 'Version')"
api_version="$(json_string "$version_body" 'ApiVersion')"
os="$(json_string "$version_body" 'Os')"
architecture="$(json_string "$version_body" 'Arch')"

for value in "$daemon_id" "$daemon_name" "$server_version" "$api_version" "$os" "$architecture"; do
    [ -n "$value" ] || { printf 'A required daemon identity field was missing.\n' >&2; exit 1; }
done

printf 'PING=OK\n'
printf 'DAEMON_ID=%s\n' "$daemon_id"
printf 'DAEMON_NAME=%s\n' "$daemon_name"
printf 'SERVER_VERSION=%s\n' "$server_version"
printf 'API_VERSION=%s\n' "$api_version"
printf 'OS=%s\n' "$os"
printf 'ARCHITECTURE=%s\n' "$architecture"
