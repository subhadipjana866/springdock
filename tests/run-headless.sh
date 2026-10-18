#!/bin/sh
# Runs the extension inside a throwaway headless GNOME Shell and prints the
# test results. Uses its own D-Bus session, settings, data and runtime dirs,
# so the real desktop session is not touched.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/springdock-test.XXXXXX")"
RUN="$(mktemp -d /tmp/wv.XXXX)"   # short: Wayland socket paths max 108 bytes
chmod 700 "$RUN"
EXT="$T/data/gnome-shell/extensions"

mkdir -p "$EXT" "$T/config/glib-2.0/settings" "$T/out" "$T/files"
make -s -C "$ROOT" install-user USER_EXT_DIR="$EXT/springdock@subhadipjana866.github.io" >/dev/null
cp -r "$ROOT/tests/springdock-test@local" "$EXT/"
printf "[org/gnome/shell]\nenabled-extensions=['ubuntu-dock@ubuntu.com', 'springdock@subhadipjana866.github.io', 'springdock-test@local']\n" \
    > "$T/config/glib-2.0/settings/keyfile"
# The simulated mouse can start in the top-left hot corner; keep it from
# opening the overview.
printf "\n[org/gnome/desktop/interface]\nenable-hot-corners=false\n" >> "$T/config/glib-2.0/settings/keyfile"
# Optional: DOCK_POSITION=BOTTOM|LEFT|RIGHT to test another dock placement.
if [ -n "${DOCK_POSITION:-}" ]; then
    printf "\n[org/gnome/shell/extensions/dash-to-dock]\ndock-position='%s'\n" "$DOCK_POSITION" \
        >> "$T/config/glib-2.0/settings/keyfile"
fi

# Test apps (a drag source and a two-window drop target) and a file to drag.
mkdir -p "$T/data/applications" "$T/apps"
cp "$ROOT"/tests/apps/*.js "$T/apps/"
echo "test photo" > "$T/files/photo.jpg"
for f in "$ROOT"/tests/apps/*.desktop; do
    sed -e "s|@APPS@|$T/apps|" -e "s|@FILE@|$T/files/photo.jpg|" "$f" > "$T/data/applications/$(basename "$f")"
done

# Behave like an Ubuntu login (Ubuntu Dock as the dock, no overview at
# start) when Ubuntu's session mode is installed.
MODE=""
[ -f /usr/share/gnome-shell/modes/ubuntu.json ] && MODE="--mode=ubuntu"

env -u DISPLAY -u WAYLAND_DISPLAY -u GSETTINGS_SCHEMA_DIR -u GTK_PATH -u GIO_MODULE_DIR \
    -u GDK_PIXBUF_MODULE_FILE -u LD_LIBRARY_PATH \
    XDG_RUNTIME_DIR="$RUN" XDG_DATA_DIRS=/usr/share/ubuntu:/usr/share/gnome:/usr/local/share:/usr/share \
    XDG_DATA_HOME="$T/data" XDG_CONFIG_HOME="$T/config" XDG_CACHE_HOME="$T/cache" \
    XDG_STATE_HOME="$T/state" XDG_CURRENT_DESKTOP=ubuntu:GNOME GSETTINGS_BACKEND=keyfile SPRINGDOCK_TEST_DIR="$T" SPRINGDOCK_DROP_LOG="$T/out/drops.log" \
    timeout 130 dbus-run-session -- gnome-shell $MODE --headless --wayland --no-x11 \
    --virtual-monitor 1280x800 --wayland-display wt > "$T/shell.log" 2>&1 &
PID=$!

i=0
while [ ! -f "$T/out/result.txt" ] && [ $i -lt 120 ]; do
    sleep 1
    i=$((i + 1))
done
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true
rm -rf "$RUN"

cat "$T/out/result.txt" 2>/dev/null || echo "No result; see $T/shell.log"
grep -E "JS ERROR|JS WARNING|Gjs-CRITICAL|springdock:" "$T/shell.log" | grep -v SPRINGDOCKTEST || true
echo "Artifacts: $T"
grep -q '^FAIL' "$T/out/result.txt" 2>/dev/null && exit 1
[ -f "$T/out/result.txt" ]
