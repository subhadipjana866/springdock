# Springdock

Drag a file onto a dock icon to reach that app's window, like the Windows taskbar.

On Ubuntu, if you start dragging a file and the window you want to drop it into is hidden behind others, there is no way to bring it forward without letting go. Springdock fixes that:

1. Start dragging a file (from Files, the desktop, a browser, anywhere).
2. Hold it over the app's icon in the dock for a moment.
3. The app's window comes to the front. Drop the file into it.

If the app has several windows open, a row of live thumbnails appears next to the icon. Hold the file over the one you want and that window comes to the front.

Requested on Ubuntu since 2009 ([Launchpad #392947](https://bugs.launchpad.net/bugs/392947), [#469868](https://bugs.launchpad.net/bugs/469868), [GNOME Files #2043](https://gitlab.gnome.org/GNOME/nautilus/-/issues/2043)).

Works with Ubuntu Dock and Dash to Dock on GNOME Shell 50 and 51 (Ubuntu 26.04 and 26.10).

## Install

From [extensions.gnome.org](https://extensions.gnome.org/) (search for **Springdock**), or from source for the current user only:

```sh
make install-user
```

Then log out and back in (GNOME on Wayland only loads new extensions at login), and turn on **Springdock** in the **Extensions** app, or run:

```sh
gnome-extensions enable springdock@subhadipjana866.github.io
```

## Turning it on and off

- **Quick Settings:** open the system menu in the top-right corner and click the **Springdock** button.
- **Extensions app:** open Springdock's settings to turn it on or off, change how long to hold a file over an icon (default 0.6 seconds), or hide the Quick Settings button.

## Development

| Command | What it does |
|---|---|
| `make install-user` | Install for the current user |
| `make deb` | Build a local `.deb` into `dist/` (needs `debhelper`) |
| `make zip` | Build the upload bundle for extensions.gnome.org into `dist/` |
| `sh tests/run-headless.sh` | Run a real drag-and-drop test in a throwaway headless GNOME Shell and print PASS/FAIL lines; your desktop is not touched. Set `DOCK_POSITION=BOTTOM` (or `LEFT`, `RIGHT`) to test another dock placement. |

The tests drag a real file between two test apps with a simulated mouse. They pass on GNOME Shell 50 (Ubuntu 26.04) and 51 (Ubuntu 26.10), with the dock on the left and at the bottom.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
