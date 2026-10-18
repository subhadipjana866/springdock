// Test app: one window whose whole area can be dragged, offering a file
// (text/uri-list), the way Files offers a dragged file.
//
// Usage: gjs -m source.js FILE

import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

const uri = Gio.File.new_for_path(ARGV[0] ?? '/etc/hostname').get_uri();

const app = new Gtk.Application({application_id: 'io.github.subhadipjana866.SpringdockSource'});
app.connect('activate', () => {
    const label = new Gtk.Label({label: 'DRAG ME', hexpand: true, vexpand: true});
    const source = new Gtk.DragSource({actions: Gdk.DragAction.COPY});
    source.connect('prepare', () =>
        Gdk.ContentProvider.new_for_bytes('text/uri-list', new GLib.Bytes(new TextEncoder().encode(`${uri}\r\n`))));
    label.add_controller(source);

    const window = new Gtk.ApplicationWindow({application: app, title: 'Drag Source', default_width: 360, default_height: 260});
    window.set_child(label);
    window.present();
});
app.run([]);
