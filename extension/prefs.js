// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Subhadip Jana <subhadipjana866@gmail.com>

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SpringdockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Springdock', icon_name: 'focus-windows-symbolic'});
        window.add(page);

        const group = new Adw.PreferencesGroup({
            description: 'While dragging a file, hold it over an app icon in the dock to bring that app’s window to the front.',
        });
        page.add(group);

        const enabled = new Adw.SwitchRow({title: 'Bring windows to the front while dragging'});
        settings.bind('enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(enabled);

        const delay = Adw.SpinRow.new_with_range(200, 2000, 50);
        delay.title = 'Hold time (milliseconds)';
        delay.subtitle = 'How long to hold the file over an icon before the window appears';
        settings.bind('hover-delay', delay, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(delay);

        const toggle = new Adw.SwitchRow({
            title: 'Show toggle in Quick Settings',
            subtitle: 'Adds a Springdock button to the system menu in the top-right corner',
        });
        settings.bind('show-quick-toggle', toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(toggle);
    }
}
