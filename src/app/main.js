// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
"use strict";

pkg.initGettext();
pkg.initFormat();
pkg.require({
    'Gdk': '3.0',
    'Gio': '2.0',
    'GLib': '2.0',
    'GObject': '2.0',
    'Gtk': '3.0',
    'WebKit2': '4.0'
});

const { GObject, Gio, GLib, Gtk, WebKit } = imports.gi;
const { Util, Window, Service, PreferenceAction } = imports.common;
const { ImageCacher, spawnService } = imports.app;

function initEnvironment() {
    window.getApp = () => Gio.Application.get_default();
}

const AlmondApplication = GObject.registerClass(
class AlmondApplication extends Gtk.Application {
    _init() {
        super._init({ application_id: pkg.name });
        GLib.set_application_name(_("Almond"));
        this._service = null;
        this.cache = new ImageCacher();
        this._activating = false;
    }

    _onQuit() {
        this.quit();
    }

    vfunc_startup() {
        super.vfunc_startup();
        Util.loadStyleSheet('/edu/stanford/Almond/application.css');
        Util.initActions(this, [{ name: 'quit', activate: this._onQuit }]);
        const webDataManager = new WebKit.WebsiteDataManager({
            base_cache_directory: GLib.get_user_cache_dir() + '/almond/webview',
            base_data_directory: GLib.get_user_config_dir() + '/almond/webview'
        });
        const webCookieManager = webDataManager.get_cookie_manager();
        webCookieManager.set_accept_policy(WebKit.CookieAcceptPolicy.NO_THIRD_PARTY);
        webCookieManager.set_persistent_storage(GLib.get_user_config_dir() + '/almond/webview/cookies.db',
                                                WebKit.CookiePersistentStorage.SQLITE);
        this.webContext = new WebKit.WebContext({
            website_data_manager: webDataManager
        });
    }

    vfunc_activate() {
        let window = this.get_active_window();
        if (!window) {
            if (this._service === null) {
                if (this._activating) return;
                this._activating = true;
                this.hold();
                new Service(Gio.DBus.session, 'edu.stanford.Almond.BackgroundService', '/edu/stanford/Almond/BackgroundService', (result, error) => {
                    this.release();
                    this._activating = false;
                    if (error) throw error;
                    this._service = result;
                    for (let pref of ['enable-voice-input', 'enable-voice-output'])
                        this.add_action(new PreferenceAction(this._service, pref, 'b'));
                    this.add_action(new PreferenceAction(this._service, 'sabrina-store-log', 'b', (fromjson) => new GLib.Variant('b', fromjson.deep_unpack() === 'yes'),
                    (tojson) => new GLib.Variant('s', tojson.deep_unpack() ? 'yes' : 'no')));
                    window = new Window.MainWindow(this, this._service);
                    window.present();
                });
            } else {
                window = new Window.MainWindow(this, this._service);
                window.present();
            }
        } else {
            window.present();
        }
    }
});

function main(argv) {
    const service = spawnService();
    initEnvironment();
    const exitCode = (new AlmondApplication()).run(argv);
    if (service) service.send_signal(15);
    return exitCode;
}
