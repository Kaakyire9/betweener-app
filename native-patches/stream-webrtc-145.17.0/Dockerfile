FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive DEPOT_TOOLS_UPDATE=0 DEPOT_TOOLS_METRICS=0 VPYTHON_BYPASS="manually managed python not used by chrome operations"
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git curl python3 python3-venv python3-pip xz-utils unzip \
    bzip2 build-essential pkg-config lsb-release file ninja-build \
    libglib2.0-dev libnss3-dev libnspr4-dev libdbus-1-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /work
ENTRYPOINT ["python3", "-u", "/input/run-native-tests.py"]
