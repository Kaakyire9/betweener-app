#!/bin/sh
set -eu

carriage_return="$(printf '\r')"
request_line=''
IFS= read -r request_line || exit 1
request_line="${request_line%"$carriage_return"}"

method="${request_line%% *}"
remainder="${request_line#* }"
target="${remainder%% *}"
test_id='missing'

while IFS= read -r header; do
    header="${header%"$carriage_return"}"
    [ -z "$header" ] && break
    case "$header" in
        [Xx]-[Tt]est-[Ii][Dd]:*)
            test_id="${header#*:}"
            test_id="${test_id# }"
            ;;
    esac
done

path="${target%%\?*}"
printf 'MOCK_FORWARD test=%s path=%s method=%s target=%s\n' "$test_id" "$path" "$method" "$target" >&2

if [ "$path" = '/events' ] || printf '%s' "$path" | grep -Eq '^/v[0-9]+\.[0-9]+/events$'; then
    printf 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n'
    printf '16\r\n{"status":"event-one"}\r\n'
    sleep 1
    printf '16\r\n{"status":"event-two"}\r\n0\r\n\r\n'
    exit 0
fi

if [ "$path" = '/_ping' ] || printf '%s' "$path" | grep -Eq '^/v[0-9]+\.[0-9]+/_ping$'; then
    body='OK'
else
    body='{"mock":true}'
fi

printf 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' "${#body}" "$body"
