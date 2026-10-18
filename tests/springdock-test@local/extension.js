// Test harness extension. tests/run-headless.sh loads it next to Ubuntu Dock
// and Springdock inside a throwaway headless GNOME Shell. It launches two
// test apps and drags a file from one onto the other's dock icon with a
// simulated mouse, then writes PASS/FAIL lines to
// $SPRINGDOCK_TEST_DIR/out/result.txt.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const T = GLib.getenv('SPRINGDOCK_TEST_DIR');
const UUID = 'springdock@subhadipjana866.github.io';
const TARGET = 'io.github.subhadipjana866.SpringdockTarget.desktop';
const SOURCE = 'io.github.subhadipjana866.SpringdockSource.desktop';
const lines = [];
const out = s => {
    lines.push(s);
    console.log(`SPRINGDOCKTEST ${s}`);
};
const check = (name, cond) => out(`${cond ? 'PASS' : 'FAIL'} ${name}`);
const sleep = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

const appSystem = Shell.AppSystem.get_default();
const windowsOf = id => appSystem.lookup_app(id)?.get_windows() ?? [];
const byTitle = title => windowsOf(TARGET).find(w => w.get_title() === title);
const topWindow = () => global.get_window_actors().map(a => a.meta_window)
    .filter(w => w.get_window_type() === Meta.WindowType.NORMAL).at(-1);
const center = actor => {
    const [x, y] = actor.get_transformed_position();
    return [x + actor.width / 2, y + actor.height / 2];
};
const frameCenter = w => {
    const r = w.get_frame_rect();
    return [r.x + r.width / 2, r.y + r.height / 2];
};
const dropLog = () => {
    try {
        return new TextDecoder().decode(GLib.file_get_contents(`${T}/out/drops.log`)[1]);
    } catch {
        return '';
    }
};

function findDockIcon(appId) {
    const stack = [Main.layoutManager.uiGroup];
    while (stack.length) {
        const a = stack.pop();
        if (a.app?.get_id?.() === appId && a.is_mapped())
            return a;
        stack.push(...a.get_children());
    }
    return null;
}

let pointer = null;
let pos = [0, 0];
const now = () => GLib.get_monotonic_time();

async function moveTo(x, y, steps = 20) {
    const [sx, sy] = pos;
    for (let i = 1; i <= steps; i++) {
        pointer.notify_absolute_motion(now(), sx + (x - sx) * i / steps, sy + (y - sy) * i / steps);
        await sleep(15);
    }
    pos = [x, y];
}

async function press() {
    pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
    await sleep(80);
}

async function release() {
    pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
    await sleep(80);
}

// Starts a file drag in the source window and carries it to the target's
// dock icon.
async function dragToIcon(icon) {
    const src = windowsOf(SOURCE)[0];
    Main.activateWindow(src);
    await sleep(500);
    const [sx, sy] = frameCenter(src);
    pointer.notify_absolute_motion(now(), sx, sy);
    pos = [sx, sy];
    await sleep(150);
    await press();
    await moveTo(sx + 30, sy + 30, 6);
    await moveTo(...center(icon), 25);
}

function shot(name) {
    return new Promise(resolve => {
        const stream = Gio.File.new_for_path(`${T}/out/${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
        new Shell.Screenshot().screenshot(false, stream, (s, res) => {
            try {
                s.screenshot_finish(res);
            } catch (e) {
                out(`shot error ${e}`);
            }
            stream.close(null);
            resolve();
        });
    });
}

export default class TestExt extends Extension {
    enable() {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            this._run().catch(e => out(`FAIL exception ${e}\n${e.stack}`)).finally(() => {
                GLib.file_set_contents(`${T}/out/result.txt`, `${lines.join('\n')}\nDONE\n`);
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {}

    async _run() {
        const ext = Main.extensionManager.lookup(UUID);
        out(`springdock state=${ext?.state} error=${ext?.error}`);
        const dock = Main.extensionManager.lookup('ubuntu-dock@ubuntu.com');
        out(`ubuntu-dock state=${dock?.state} error=${dock?.error}`);
        const obj = ext.stateObj;
        const delay = obj._settings.get_int('hover-delay');
        pointer = global.stage.context.get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);

        const toggle = obj._indicator?.quickSettingsItems[0];
        check('quick settings toggle added', !!toggle?.get_parent());
        check('toggle reflects setting', toggle?.checked === true);

        appSystem.lookup_app(TARGET).launch(0, -1, Shell.AppLaunchGpu.DEFAULT);
        await sleep(3000);
        appSystem.lookup_app(SOURCE).launch(0, -1, Shell.AppLaunchGpu.DEFAULT);
        await sleep(3000);
        check('target app has 2 windows', windowsOf(TARGET).length === 2);
        check('source app has 1 window', windowsOf(SOURCE).length === 1);

        // Plain GNOME starts in the Activities overview; Ubuntu's login does not.
        if (Main.overview.visible) {
            Main.overview.hide();
            await sleep(1500);
        }
        const icon = findDockIcon(TARGET);
        check('target icon found in dock', !!icon);
        out(`icon at ${icon && center(icon).map(Math.round)}`);

        // 1. Two windows: thumbnails appear, hovering B raises B, drop lands in B.
        await dragToIcon(icon);
        await sleep(delay + 400);
        const strip = obj._strip;
        check('thumbnails appear after hold', !!strip);
        check('one thumbnail per window', strip?._items.length === 2);
        await shot('strip');

        // Pass over the neighbouring dock icon on the way, as a hand often does.
        const neighbour = findDockIcon(SOURCE);
        if (neighbour) {
            await moveTo(...center(neighbour), 8);
            await sleep(150);
            check('passing over another icon keeps thumbnails', obj._strip === strip);
        }
        const itemB = strip?._items.find(i => i.springdockWindow.get_title() === 'Target B');
        if (itemB) {
            await moveTo(...center(itemB), 15);
            await sleep(700);
        }
        check('hovering thumbnail B raises Target B', topWindow()?.get_title() === 'Target B');
        check('thumbnail B highlighted', itemB?.has_style_pseudo_class('highlighted'));
        await shot('raised-b');

        await moveTo(...frameCenter(byTitle('Target B')), 20);
        await sleep(300);
        await release();
        await sleep(1200);
        check('file dropped into Target B', dropLog().includes('Target B file://'));
        check('thumbnails gone after drop', !obj._strip);

        // 2. Turned off from Quick Settings: nothing happens.
        toggle.checked = false;
        await sleep(100);
        check('toggle turns setting off', obj._settings.get_boolean('enabled') === false);
        await dragToIcon(icon);
        await sleep(delay + 400);
        check('off: no thumbnails', !obj._strip);
        check('off: source stays on top', topWindow()?.get_title() === 'Drag Source');
        await moveTo(...frameCenter(windowsOf(SOURCE)[0]), 15);
        await release();
        await sleep(500);
        toggle.checked = true;
        await sleep(100);

        // 3. One window: it is raised straight away, no thumbnails.
        byTitle('Target B').delete(global.get_current_time());
        await sleep(1000);
        check('target down to 1 window', windowsOf(TARGET).length === 1);
        await dragToIcon(icon);
        await sleep(delay + 400);
        check('single window: no thumbnails', !obj._strip);
        check('single window: Target A raised', topWindow()?.get_title() === 'Target A');
        await moveTo(...frameCenter(byTitle('Target A')), 20);
        await sleep(300);
        await release();
        await sleep(1200);
        check('file dropped into Target A', dropLog().includes('Target A file://'));

        // 4. Quick hover shorter than the hold time does nothing.
        await dragToIcon(icon);
        await sleep(Math.max(50, delay - 400));
        check('short hover: source still on top', topWindow()?.get_title() === 'Drag Source');
        await moveTo(...frameCenter(windowsOf(SOURCE)[0]), 10);
        await sleep(delay + 200);
        check('leaving icon cancels', topWindow()?.get_title() === 'Drag Source');
        await release();
        await sleep(500);

        // 5. Disabling the extension removes everything.
        Main.extensionManager.disableExtension(UUID);
        await sleep(500);
        check('disable removes drag monitor', !DND.dragMonitors.includes(obj._dragMonitor) && obj._dragMonitor === null);
        check('disable removes toggle', obj._indicator === null);
        Main.extensionManager.enableExtension(UUID);
        const toggleBack = () => !!Main.extensionManager.lookup(UUID).stateObj._indicator?.quickSettingsItems[0]?.get_parent();
        for (let i = 0; i < 30 && !toggleBack(); i++)
            await sleep(100);
        check('re-enable adds toggle back', toggleBack());
    }
}
