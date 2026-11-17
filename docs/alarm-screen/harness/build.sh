#!/bin/bash
# /tmp/ab/build.sh <gradle tasks>   e.g.  :app:assembleDebug :app:lintVitalRelease :app:minifyReleaseWithR8
#                                         :app:testDebugUnitTest --tests '*AlarmShotTest*'   (pictures land in /tmp/ab/shots)
export JAVA_HOME=/tmp/ab/jdk ANDROID_HOME=/tmp/ab/sdk ANDROID_SDK_ROOT=/tmp/ab/sdk GRADLE_USER_HOME=/tmp/ab/gradle-home
export PATH=$JAVA_HOME/bin:$PATH
cd /tmp/ab/proj/android && chmod +x gradlew
echo "START $(date -u +%H:%M:%S) $*"
./gradlew "$@" --console=plain 2>&1
echo "EXIT $? $(date -u +%H:%M:%S)"
