#!/bin/sh
set -eu

request='GET /_ping HTTP/1.1\r\nHost: docker\r\nConnection: close\r\n\r\n'
response_file='/tmp/docker-ping-response'
stderr_file='/tmp/docker-ping-stderr'
socket_path="${DOCKER_SOCKET_PATH:-/var/run/docker.sock}"

printf 'REQUEST_UTC=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf 'REQUEST_ESCAPED=GET /_ping HTTP/1.1\\r\\nHost: docker\\r\\nConnection: close\\r\\n\\r\\n\n'
printf 'REQUEST_HEX='
printf "$request" | od -An -tx1 | tr -d ' \n'
printf '\n'

set +e
printf "$request" |
    timeout 5 socat -T 4 STDIO,ignoreeof UNIX-CONNECT:"$socket_path" > "$response_file" 2> "$stderr_file"
client_exit="$?"
set -e

printf 'COMPLETION_UTC=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf 'CLIENT_EXIT=%s\n' "$client_exit"
printf 'RESPONSE_HEX='
od -An -tx1 "$response_file" | tr -d ' \n'
printf '\nCLIENT_STDERR_HEX='
od -An -tx1 "$stderr_file" | tr -d ' \n'
printf '\nRESPONSE_NORMALIZED_BEGIN\n'
tr -d '\r' < "$response_file"
printf '\nRESPONSE_NORMALIZED_END\n'
printf 'CLIENT_STDERR_BEGIN\n'
cat "$stderr_file"
printf '\nCLIENT_STDERR_END\n'

status="$(tr -d '\r' < "$response_file" | sed -n '1p')"
headers="$(tr -d '\r' < "$response_file" | sed -n '1,/^$/p')"
body="$(tr -d '\r' < "$response_file" | sed '1,/^$/d')"
if printf '%s\n' "$headers" | grep -Eiq '^Transfer-Encoding:[[:space:]]*chunked[[:space:]]*$'; then
    body="$(printf '%s\n' "$body" | sed -E '/^[0-9A-Fa-f]+(;.*)?$/d' | tr -d '\n')"
fi
printf 'PARSED_BODY=%s\n' "$body"
[ "$client_exit" -eq 0 ]
[ "$status" = 'HTTP/1.1 200 OK' ] || [ "$status" = 'HTTP/1.0 200 OK' ]
[ "$body" = 'OK' ]
