#!/bin/sh
set -eu

socket='/tmp/mock-docker.sock'
identity_socket='/tmp/mock-identity-docker.sock'
request='GET /_ping HTTP/1.1\r\nHost: docker\r\nConnection: close\r\n\r\n'
identity_listener_pid=''

socat UNIX-LISTEN:"$socket",fork EXEC:/fixtures/mock-delayed-ping.sh &
listener_pid="$!"
trap 'kill "$listener_pid" 2>/dev/null || true; wait "$listener_pid" 2>/dev/null || true; if [ -n "$identity_listener_pid" ]; then kill "$identity_listener_pid" 2>/dev/null || true; wait "$identity_listener_pid" 2>/dev/null || true; fi' EXIT INT TERM
sleep 1

set +e
printf "$request" | timeout 5 socat - UNIX-CONNECT:"$socket" > /tmp/legacy-response 2> /tmp/legacy-stderr
legacy_exit="$?"
printf "$request" | timeout 5 socat -T 4 STDIO,ignoreeof UNIX-CONNECT:"$socket" > /tmp/safe-response 2> /tmp/safe-stderr
safe_exit="$?"
set -e

printf 'REQUEST_ESCAPED=GET /_ping HTTP/1.1\\r\\nHost: docker\\r\\nConnection: close\\r\\n\\r\\n\n'
printf 'LEGACY_EXIT=%s\n' "$legacy_exit"
printf 'LEGACY_RESPONSE_HEX='
od -An -tx1 /tmp/legacy-response | tr -d ' \n'
printf '\nLEGACY_STDERR_HEX='
od -An -tx1 /tmp/legacy-stderr | tr -d ' \n'
printf '\nSAFE_EXIT=%s\n' "$safe_exit"
printf 'SAFE_RESPONSE_HEX='
od -An -tx1 /tmp/safe-response | tr -d ' \n'
printf '\nSAFE_STDERR_HEX='
od -An -tx1 /tmp/safe-stderr | tr -d ' \n'
printf '\n'

expected_response_hex='485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a20746578742f706c61696e0d0a5472616e736665722d456e636f64696e673a206368756e6b65640d0a436f6e6e656374696f6e3a20636c6f73650d0a0d0a320d0a4f4b0d0a300d0a0d0a'
safe_response_hex="$(od -An -tx1 /tmp/safe-response | tr -d ' \n')"
[ "$safe_exit" -eq 0 ]
[ "$safe_response_hex" = "$expected_response_hex" ]

DOCKER_SOCKET_PATH="$socket" /fixtures/diagnose-docker-ping.sh

socat UNIX-LISTEN:"$identity_socket",fork EXEC:/fixtures/mock-probe-identity.sh &
identity_listener_pid="$!"
sleep 1
identity_output="$(DOCKER_SOCKET_PATH="$identity_socket" /fixtures/probe-docker-api.sh)"
printf '%s\n' "$identity_output"
[ "$identity_output" = "$(printf 'PING=OK\nDAEMON_ID=mock-daemon-id\nDAEMON_NAME=mock-daemon\nSERVER_VERSION=29.8.1\nAPI_VERSION=1.56\nOS=linux\nARCHITECTURE=amd64')" ]
