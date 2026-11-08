#!/bin/sh
set -eu

carriage_return="$(printf '\r')"
request_hex=''
lines=''

while IFS= read -r line; do
    request_hex="${request_hex}$(printf '%s\n' "$line" | od -An -tx1 | tr -d ' \n')"
    line="${line%"$carriage_return"}"
    lines="${lines}${line}\n"
    [ -z "$line" ] && break
done

request_line="$(printf '%b' "$lines" | sed -n '1p')"
host_header="$(printf '%b' "$lines" | sed -n '2p')"
connection_header="$(printf '%b' "$lines" | sed -n '3p')"
terminator="$(printf '%b' "$lines" | sed -n '4p')"
printf 'MOCK_IDENTITY_REQUEST_HEX=%s\n' "$request_hex" >&2

if [ "$host_header" != 'Host: docker' ] || [ "$connection_header" != 'Connection: close' ] || [ -n "$terminator" ]; then
    body='bad request framing'
    status='400 Bad Request'
else
    status='200 OK'
    case "$request_line" in
        'GET /_ping HTTP/1.1') body='OK' ;;
        'GET /version HTTP/1.1') body='{"Version":"29.8.1","Components":[{"Name":"decoy","Version":"0.19.0"}],"ApiVersion":"1.56","Os":"linux","Arch":"amd64"}' ;;
        'GET /info HTTP/1.1') body='{"ID":"mock-daemon-id","Nested":{"ID":"decoy-id","Name":"decoy-name"},"Name":"mock-daemon"}' ;;
        *) status='404 Not Found'; body='not found' ;;
    esac
fi

chunk_size="$(printf '%x' "${#body}")"
printf 'HTTP/1.1 %s\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n%s\r\n%s\r\n0\r\n\r\n' "$status" "$chunk_size" "$body"
