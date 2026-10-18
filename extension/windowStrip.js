// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Subhadip Jana <subhadipjana866@gmail.com>
//
// A row of live window thumbnails shown next to a dock icon while a drag
// rests on it.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const THUMBNAIL_WIDTH = 200;
const THUMBNAIL_HEIGHT = 130;
const GAP = 8;

function scaleFactor() {
    return St.ThemeContext.get_for_stage(global.stage).scale_factor;
}

// A live clone of the window, cropped to its frame (without the shadow and
// invisible borders around client-side decorated windows).
function createThumbnail(window) {
    const scale = scaleFactor();
    const frame = window.get_frame_rect();
    const buffer = window.get_buffer_rect();
    const fit = Math.min(THUMBNAIL_WIDTH * scale / frame.width,
        THUMBNAIL_HEIGHT * scale / frame.height, 1);

    const box = new St.Widget({
        style_class: 'springdock-thumbnail',
        width: Math.round(frame.width * fit),
        height: Math.round(frame.height * fit),
        clip_to_allocation: true,
        x_align: Clutter.ActorAlign.CENTER,
    });
    const actor = window.get_compositor_private();
    if (actor) {
        box.add_child(new Clutter.Clone({
            source: actor,
            x: Math.round((buffer.x - frame.x) * fit),
            y: Math.round((buffer.y - frame.y) * fit),
            width: Math.round(buffer.width * fit),
            height: Math.round(buffer.height * fit),
        }));
    }
    return box;
}

export const WindowStrip = GObject.registerClass(
class WindowStrip extends St.BoxLayout {
    _init(icon, windows) {
        super._init({style_class: 'springdock-strip', reactive: true});
        this.icon = icon;
        this._items = windows.map(window => {
            const item = new St.BoxLayout({
                style_class: 'springdock-item',
                orientation: Clutter.Orientation.VERTICAL,
                reactive: true,
            });
            item.springdockWindow = window;

            const header = new St.BoxLayout({style_class: 'springdock-item-header'});
            header.add_child(icon.app.create_icon_texture(16));
            const title = new St.Label({
                style_class: 'springdock-item-title',
                text: window.get_title() ?? icon.app.get_name(),
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            header.add_child(title);
            item.add_child(header);
            item.add_child(createThumbnail(window));

            this.add_child(item);
            return item;
        });

        Main.layoutManager.addTopChrome(this);
        // Moving the strip from inside a layout pass would need a second
        // pass; do it just before the next redraw instead.
        this._placeLater = 0;
        this.connect('notify::width', () => this._queuePlace());
        this.connect('notify::height', () => this._queuePlace());
        this.connect('destroy', () => {
            if (this._placeLater)
                global.compositor.get_laters().remove(this._placeLater);
        });
        this._queuePlace();
    }

    _queuePlace() {
        if (this._placeLater)
            return;
        this._placeLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._placeLater = 0;
            this._place();
            return GLib.SOURCE_REMOVE;
        });
    }

    windowAt(actor) {
        for (let a = actor; a && a !== this; a = a.get_parent()) {
            if (a.springdockWindow)
                return a.springdockWindow;
        }
        return null;
    }

    setHighlighted(window) {
        for (const item of this._items) {
            if (item.springdockWindow === window)
                item.add_style_pseudo_class('highlighted');
            else
                item.remove_style_pseudo_class('highlighted');
        }
    }

    // Next to the icon, on the side away from the screen edge the dock is on.
    _place() {
        if (!this.icon.get_stage())
            return;
        const monitor = Main.layoutManager.findMonitorForActor(this.icon) ??
            Main.layoutManager.primaryMonitor;
        const [ix, iy] = this.icon.get_transformed_position();
        const [iw, ih] = this.icon.get_transformed_size();
        const [w, h] = [this.width, this.height];
        const gap = GAP * scaleFactor();

        const distances = {
            bottom: monitor.y + monitor.height - (iy + ih),
            top: iy - monitor.y,
            left: ix - monitor.x,
            right: monitor.x + monitor.width - (ix + iw),
        };
        const edge = Object.keys(distances).reduce((a, b) => distances[a] <= distances[b] ? a : b);

        let x, y;
        switch (edge) {
        case 'bottom':
            [x, y] = [ix + iw / 2 - w / 2, iy - h - gap];
            break;
        case 'top':
            [x, y] = [ix + iw / 2 - w / 2, iy + ih + gap];
            break;
        case 'left':
            [x, y] = [ix + iw + gap, iy + ih / 2 - h / 2];
            break;
        default:
            [x, y] = [ix - w - gap, iy + ih / 2 - h / 2];
        }

        x = Math.max(monitor.x + gap, Math.min(x, monitor.x + monitor.width - w - gap));
        y = Math.max(monitor.y + gap, Math.min(y, monitor.y + monitor.height - h - gap));
        this.set_position(Math.round(x), Math.round(y));
    }
});
