// Test app: two windows, "Target A" and "Target B", that accept dropped
// files and append "<window title> <uri>" lines to $SPRINGDOCK_DROP_LOG.

import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

const log = GLib.getenv('SPRINGDOCK_DROP_LOG');

function record(line) {
    const stream = Gio.File.new_for_path(log).append_to(Gio.FileCreateFlags.NONE, null);
    stream.write_all(new TextEncoder().encode(`${line}\n`), null);
    stream.close(null);
}

const app = new Gtk.Application({application_id: 'io.github.subhadipjana866.SpringdockTarget'});
app.connect('activate', () => {
    for (const title of ['Target A', 'Target B']) {
        const label = new Gtk.Label({label: title, hexpand: true, vexpand: true});
        const target = Gtk.DropTarget.new(Gdk.FileList.$gtype, Gdk.DragAction.COPY);
        target.connect('drop', (_target, value) => {
            for (const file of value.get_files())
                record(`${title} ${file.get_uri()}`);
            return true;
        });
        label.add_controller(target);

        const window = new Gtk.ApplicationWindow({application: app, title, default_width: 640, default_height: 460});
        window.set_child(label);
        window.present();
    }
});
app.run([]);
