#!/bin/sh
set -eu

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  build-essential ca-certificates cmake curl dpkg-dev libpulse-dev libssl-dev \
  libx11-dev libx264-dev libxcb-shm0-dev libxcb-xfixes0-dev libxcb1-dev \
  ninja-build nasm pkg-config unzip xz-utils zlib1g-dev

fetch() {
  url="$1"
  destination="$2"
  expected="$3"
  cache_path="/cache/downloads/$expected"
  if [ -f "$cache_path" ] \
    && printf '%s  %s\n' "$expected" "$cache_path" | sha256sum --check --strict >/dev/null 2>&1; then
    cp "$cache_path" "$destination"
  else
    curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$destination" "$url"
    printf '%s  %s\n' "$expected" "$destination" | sha256sum --check --strict
    cp "$destination" "$cache_path"
  fi
  printf '%s  %s\n' "$expected" "$destination" | sha256sum --check --strict
}

package_control() {
  root="$1"
  package="$2"
  version="$3"
  depends="$4"
  description="$5"
  mkdir -p "$root/DEBIAN"
  cat > "$root/DEBIAN/control" <<EOF
Package: $package
Version: $version
Section: libs
Priority: optional
Architecture: amd64
Maintainer: Betweener Engineering <engineering@getbetweener.com>
Depends: $depends
Multi-Arch: same
Description: $description
EOF
}

mkdir -p /build /out/packages /out/ffmpeg/bin
cd /build

fetch \
  "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" \
  chrome.zip "$CHROME_SHA256"
unzip -q chrome.zip
mv chrome-linux64 /out/chrome
rm -f /out/chrome/chrome_sandbox

fetch \
  "https://deb.debian.org/debian/pool/main/p/pulseaudio/pulseaudio_17.0%2bdfsg1-2%2bb1_amd64.deb" \
  pulseaudio.deb "$PULSEAUDIO_SHA256"
mkdir -p /out/pulse
dpkg-deb --extract pulseaudio.deb /out/pulse
rm -rf /out/pulse/usr/share/doc /out/pulse/usr/share/man \
  /out/pulse/usr/lib/systemd /out/pulse/usr/libexec/systemd

fetch \
  "https://github.com/google/brotli/archive/refs/tags/v${BROTLI_VERSION}.tar.gz" \
  brotli.tar.gz "$BROTLI_SHA256"
mkdir brotli-src
tar -xzf brotli.tar.gz --strip-components=1 -C brotli-src
cmake -S brotli-src -B brotli-build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=/usr \
  -DCMAKE_INSTALL_LIBDIR=lib/x86_64-linux-gnu \
  -DBUILD_SHARED_LIBS=ON \
  -DBROTLI_DISABLE_TESTS=ON
cmake --build brotli-build --parallel
DESTDIR=/build/pkg-brotli cmake --install brotli-build
rm -rf /build/pkg-brotli/usr/bin /build/pkg-brotli/usr/include \
  /build/pkg-brotli/usr/lib/x86_64-linux-gnu/cmake \
  /build/pkg-brotli/usr/lib/x86_64-linux-gnu/pkgconfig \
  /build/pkg-brotli/usr/share
package_control /build/pkg-brotli libbrotli1 \
  "${BROTLI_VERSION}-0betweener1" 'libc6 (>= 2.34)' \
  'Patched Brotli shared libraries for the Betweener compositor.'
dpkg-deb --build --root-owner-group /build/pkg-brotli \
  "/out/packages/libbrotli1_${BROTLI_VERSION}-0betweener1_amd64.deb"

fetch \
  "https://github.com/madler/zlib/archive/${ZLIB_COMMIT}.tar.gz" \
  zlib.tar.gz "$ZLIB_SHA256"
mkdir zlib-src
tar -xzf zlib.tar.gz --strip-components=1 -C zlib-src
cd zlib-src
./configure --prefix=/usr --libdir=/usr/lib/x86_64-linux-gnu
make -j"$(nproc)"
make DESTDIR=/build/pkg-zlib install
cd /build
rm -rf /build/pkg-zlib/usr/include \
  /build/pkg-zlib/usr/lib/x86_64-linux-gnu/libz.a \
  /build/pkg-zlib/usr/lib/x86_64-linux-gnu/pkgconfig \
  /build/pkg-zlib/usr/share
package_control /build/pkg-zlib zlib1g \
  '1:1.3.2+gitdf84af25-0betweener1' 'libc6 (>= 2.34)' \
  'Patched zlib shared library for the Betweener compositor.'
dpkg-deb --build --root-owner-group /build/pkg-zlib \
  /out/packages/zlib1g_1.3.2+gitdf84af25-0betweener1_amd64.deb

fetch \
  "https://download.osgeo.org/libtiff/tiff-${TIFF_VERSION}.tar.xz" \
  tiff.tar.xz "$TIFF_SHA256"
mkdir tiff-src
tar -xJf tiff.tar.xz --strip-components=1 -C tiff-src
cmake -S tiff-src -B tiff-build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=/usr \
  -DCMAKE_INSTALL_LIBDIR=lib/x86_64-linux-gnu \
  -DBUILD_SHARED_LIBS=ON \
  -Dtiff-tools=OFF \
  -Dtiff-tests=OFF \
  -Dtiff-contrib=OFF \
  -Dtiff-docs=OFF \
  -Djpeg=OFF \
  -Djbig=OFF \
  -Dlerc=OFF \
  -Dlibdeflate=OFF \
  -Dlzma=OFF \
  -Dwebp=OFF \
  -Dzstd=OFF
cmake --build tiff-build --parallel
DESTDIR=/build/pkg-tiff cmake --install tiff-build
rm -rf /build/pkg-tiff/usr/bin /build/pkg-tiff/usr/include \
  /build/pkg-tiff/usr/lib/x86_64-linux-gnu/cmake \
  /build/pkg-tiff/usr/lib/x86_64-linux-gnu/pkgconfig \
  /build/pkg-tiff/usr/share
package_control /build/pkg-tiff libtiff6 \
  "${TIFF_VERSION}-0betweener1" 'libc6 (>= 2.34), zlib1g (>= 1:1.2.0)' \
  'Patched minimal LibTIFF shared libraries for the Betweener compositor.'
dpkg-deb --build --root-owner-group /build/pkg-tiff \
  "/out/packages/libtiff6_${TIFF_VERSION}-0betweener1_amd64.deb"

fetch \
  "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
  ffmpeg.tar.xz "$FFMPEG_SHA256"
mkdir ffmpeg-src
tar -xJf ffmpeg.tar.xz --strip-components=1 -C ffmpeg-src
cd ffmpeg-src
./configure \
  --prefix=/opt/ffmpeg \
  --disable-autodetect \
  --disable-debug \
  --disable-doc \
  --disable-everything \
  --disable-iconv \
  --disable-shared \
  --enable-static \
  --enable-ffmpeg \
  --enable-gpl \
  --enable-version3 \
  --enable-network \
  --enable-openssl \
  --enable-libpulse \
  --enable-libx264 \
  --enable-libxcb \
  --enable-libxcb-shm \
  --enable-libxcb-xfixes \
  --enable-avdevice \
  --enable-avfilter \
  --enable-swresample \
  --enable-swscale \
  --enable-indev=xcbgrab,pulse \
  --enable-decoder=rawvideo,pcm_s16le \
  --enable-encoder=libx264,aac \
  --enable-muxer=flv \
  --enable-protocol=file,tcp,tls,rtmp,rtmps \
  --enable-filter=aresample,aformat,format,scale \
  --enable-parser=aac,h264
make -j"$(nproc)"
make install
cp -a /opt/ffmpeg/bin/ffmpeg /out/ffmpeg/bin/ffmpeg
strip /out/ffmpeg/bin/ffmpeg
