#!/bin/sh
set -eu

carriage_return="$(printf '\r')"
request_hex=''

while IFS= read -r line; do
    request_hex="${request_hex}$(printf '%s\n' "$line" | od -An -tx1 | tr -d ' \n')"
    line="${line%"$carriage_return"}"
    [ -z "$line" ] && break
done

expected_hex='474554202f5f70696e6720485454502f312e310d0a486f73743a20646f636b65720d0a436f6e6e656374696f6e3a20636c6f73650d0a0d0a'
printf 'MOCK_REQUEST_HEX=%s\n' "$request_hex" >&2

if [ "$request_hex" != "$expected_hex" ]; then
    body='bad request framing'
    printf 'HTTP/1.1 400 Bad Request\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' "${#body}" "$body"
    exit 0
fi

sleep 1
printf 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n2\r\nOK\r\n0\r\n\r\n'
