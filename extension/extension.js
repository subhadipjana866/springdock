// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Subhadip Jana <subhadipjana866@gmail.com>
//
// Springdock: spring-loaded dock icons for GNOME Shell.
//
// While a file (or anything else) is being dragged out of an app, holding it
// over another app's dock icon brings that app's window to the front, so the
// file can be dropped into it. When the app has several windows, a row of
// thumbnails appears and holding the drag over one raises that window.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {WindowStrip} from './windowStrip.js';

// How long the drag rests on a thumbnail before its window is raised.
const THUMBNAIL_DELAY_MS = 300;
// How long the thumbnails stay up after the drag moves off the icon and the
// thumbnails, so crossing the gap between them does not close them.
const LEAVE_DELAY_MS = 500;

// Dock, dash and app grid icons all carry the Shell.App they launch.
function findAppIcon(actor) {
    for (let a = actor; a; a = a.get_parent()) {
        if (a.app instanceof Shell.App)
            return a;
    }
    return null;
}

function appWindows(app) {
    return app.get_windows()
        .filter(w => !w.skip_taskbar && w.get_window_type() === Meta.WindowType.NORMAL)
        .sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
}

const SpringdockToggle = GObject.registerClass(
class SpringdockToggle extends QuickSettings.QuickToggle {
    _init(settings) {
        super._init({
            title: 'Springdock',
            subtitle: 'Drag files to windows',
            iconName: 'focus-windows-symbolic',
            toggleMode: true,
        });
        settings.bind('enabled', this, 'checked', Gio.SettingsBindFlags.DEFAULT);
    }
});

const SpringdockIndicator = GObject.registerClass(
class SpringdockIndicator extends QuickSettings.SystemIndicator {
    _init(settings) {
        super._init();
        this.quickSettingsItems.push(new SpringdockToggle(settings));
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});

export default class SpringdockExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._hoverIcon = null;
        this._hoverWindow = null;
        this._iconTimeoutId = 0;
        this._thumbnailTimeoutId = 0;
        this._leaveTimeoutId = 0;
        this._strip = null;
        this._indicator = null;

        this._dragMonitor = {dragMotion: event => this._onDragMotion(event)};
        DND.addDragMonitor(this._dragMonitor);
        Main.xdndHandler.connectObject('drag-end', () => this._reset(), this);

        this._settings.connectObject(
            'changed::enabled', () => {
                if (!this._settings.get_boolean('enabled'))
                    this._reset();
            },
            'changed::show-quick-toggle', () => this._syncIndicator(),
            this);
        this._syncIndicator();
    }

    disable() {
        DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = null;
        Main.xdndHandler.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._reset();
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }

    _syncIndicator() {
        const show = this._settings.get_boolean('show-quick-toggle');
        if (show && !this._indicator) {
            this._indicator = new SpringdockIndicator(this._settings);
            Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        } else if (!show && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    // Called for every pointer move during a drag. Only drags that come from
    // apps (Main.xdndHandler) count; dragging the shell's own icons around to
    // reorder favourites is left alone.
    _onDragMotion(event) {
        if (event.source !== Main.xdndHandler || !this._settings.get_boolean('enabled'))
            return DND.DragMotionResult.CONTINUE;

        const target = event.targetActor;
        if (this._strip && target && this._strip.contains(target)) {
            this._cancelLeave();
            this._leaveIcon();
            this._hoverThumbnail(this._strip.windowAt(target));
            return DND.DragMotionResult.CONTINUE;
        }

        const icon = findAppIcon(target);
        if (icon) {
            this._cancelLeave();
            this._hoverThumbnail(null);
            this._hoverAppIcon(icon);
        } else {
            this._leaveIcon();
            this._hoverThumbnail(null);
            this._scheduleLeave();
        }
        return DND.DragMotionResult.CONTINUE;
    }

    _hoverAppIcon(icon) {
        if (icon === this._hoverIcon)
            return;
        this._leaveIcon();
        this._hoverIcon = icon;
        // Open thumbnails stay up while the drag passes over other icons on
        // its way to them; they are replaced only if the drag rests on
        // another icon for the full hold time.

        this._iconTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            this._settings.get_int('hover-delay'), () => {
                this._iconTimeoutId = 0;
                this._spring(icon);
                return GLib.SOURCE_REMOVE;
            });
    }

    _leaveIcon() {
        this._hoverIcon = null;
        if (this._iconTimeoutId) {
            GLib.source_remove(this._iconTimeoutId);
            this._iconTimeoutId = 0;
        }
    }

    _spring(icon) {
        if (!icon.get_stage() || this._strip?.icon === icon)
            return;

        const windows = appWindows(icon.app);
        if (windows.length === 1) {
            this._destroyStrip();
            Main.activateWindow(windows[0]);
        } else if (windows.length > 1) {
            this._destroyStrip();
            this._strip = new WindowStrip(icon, windows);
        }
        // An app without windows is left to the dock: dropping on its icon
        // opens the file with it.
    }

    _hoverThumbnail(window) {
        if (window === this._hoverWindow)
            return;
        this._hoverWindow = window;
        this._strip?.setHighlighted(window);
        if (this._thumbnailTimeoutId) {
            GLib.source_remove(this._thumbnailTimeoutId);
            this._thumbnailTimeoutId = 0;
        }
        if (!window)
            return;

        this._thumbnailTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, THUMBNAIL_DELAY_MS, () => {
            this._thumbnailTimeoutId = 0;
            // The window may have closed while the drag rested on it.
            if (window.get_compositor_private())
                Main.activateWindow(window);
            return GLib.SOURCE_REMOVE;
        });
    }

    _scheduleLeave() {
        if (!this._strip || this._leaveTimeoutId)
            return;
        this._leaveTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LEAVE_DELAY_MS, () => {
            this._leaveTimeoutId = 0;
            this._destroyStrip();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelLeave() {
        if (this._leaveTimeoutId) {
            GLib.source_remove(this._leaveTimeoutId);
            this._leaveTimeoutId = 0;
        }
    }

    _destroyStrip() {
        this._hoverThumbnail(null);
        this._strip?.destroy();
        this._strip = null;
    }

    _reset() {
        this._leaveIcon();
        this._cancelLeave();
        this._destroyStrip();
    }
}
