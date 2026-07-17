# Reproducible Android build environment for Parkplatz (Capacitor).
# Node 20 + JDK 21 + Android SDK (platform/build-tools 35) + Gradle (via wrapper).
# This image only contains the toolchain; the repo is mounted at build time so
# nothing app-specific is baked in. See ANDROID.md for usage.
FROM eclipse-temurin:21-jdk-jammy

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl unzip git ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ---- Android SDK ----
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="${PATH}:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools"

RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
    curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdline.zip && \
    unzip -q /tmp/cmdline.zip -d ${ANDROID_SDK_ROOT}/cmdline-tools && \
    mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && \
    rm /tmp/cmdline.zip && \
    yes | sdkmanager --licenses > /dev/null && \
    sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" > /dev/null && \
    chmod -R a+rwX ${ANDROID_SDK_ROOT}

# Make the SDK writable so a non-root caller (docker run -u $(id -u)) can let
# Gradle add any extra components without hitting permission errors.
WORKDIR /workspace
CMD ["bash"]
