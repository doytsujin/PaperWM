/*
  Application functionality, like global new window actions etc.
 */

var Extension;
if (imports.misc.extensionUtils.extensions) {
    Extension = imports.misc.extensionUtils.extensions["paperwm@hedning:matrix.org"];
} else {
    Extension = imports.ui.main.extensionManager.lookup("paperwm@hedning:matrix.org");
}

var GLib = imports.gi.GLib
var Gio = imports.gi.Gio;
var Tiling = Extension.imports.tiling
var Kludges = Extension.imports.kludges;

var Shell = imports.gi.Shell;
var Tracker = Shell.WindowTracker.get_default();

var CouldNotLaunch = Symbol();

// Lookup table for custom handlers, keys being the app id
var customHandlers, customSpawnHandlers;
function init() {
    customHandlers = { 'org.gnome.Terminal.desktop': newGnomeTerminal };
    customSpawnHandlers = {};
    Kludges.registerOverridePrototype(
        Shell.App, "open_new_window",
        function(workspaceId) {
            log(`Shell.App.open_new_window`);
            return spawnWindow(this, global.workspace_manager.get_workspace_by_index(workspaceId));
        }
    );

    Kludges.registerOverridePrototype(
        Shell.App, "launch_action",
        function(name, ...args) {
            log(`ShellApp.launch_action ${name}`);
            if (name === 'new-window')
                return spawnWindow(this);
            else {
                let original = Kludges.getSavedProp(Gio.DesktopAppInfo.prototype, "launch_action");
                return original.call(this, name, ...args);
            }

        }
    );

    Kludges.registerOverridePrototype(
        Gio.DesktopAppInfo, "launch",
        function() {
            log(`DesktopAppInfo.launch`);
            return spawnWindow(this.get_id());
        }
    );

    Kludges.registerOverridePrototype(
        Gio.DesktopAppInfo, "launch_action",
        function(name, ...args) {
            log(`DesktopAppInfo.launch_action ${name}`);
            if (name === 'new-window')
                return spawnWindow(this.get_id());
            else {
                let original = Kludges.getSavedProp(Gio.DesktopAppInfo.prototype, "launch_action");
                return original.call(this, name, ...args);
            }

        }
    );
}

function launchFromWorkspaceDir(app, workspace=null) {
    if (typeof(app) === 'string') {
        app = new Shell.App({ app_info: Gio.DesktopAppInfo.new(app) });
    }
    let space = workspace ? Tiling.spaces.get(workspace) : Tiling.spaces.selectedSpace; 
    let dir = space.settings.get_string("directory");
    let cmd = app.app_info.get_commandline();
    if (!cmd || dir == '') {
        throw CouldNotLaunch;
    }

    if (dir[0] == "~") {
        dir = GLib.getenv("HOME") + dir.slice(1);
    }

    /* Note: One would think working directory could be specified in the AppLaunchContext
       The dbus spec https://specifications.freedesktop.org/desktop-entry-spec/1.1/ar01s07.html
       indicates otherwise (for dbus activated actions). Can affect arbitrary environment
       variables of exec activated actions, but no environment variable determine working
       directory of new processes. */
    // TODO: substitute correct values according to https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html#exec-variables
    cmd = cmd.replace(/%./g, "");
    let [success, cmdArgs] = GLib.shell_parse_argv(cmd);
    if (!success) {
        print("launchFromWorkspaceDir:", "Could not parse command line", cmd);
        throw CouldNotLaunch;
    }
    GLib.spawn_async(dir, cmdArgs, GLib.get_environ(), GLib.SpawnFlags.SEARCH_PATH, null);
}

function newGnomeTerminal(metaWindow, app) {
    /* Note: this action activation is _not_ bound to the window - instead it
       relies on the window being active when called.

       If the new window doesn't start in the same directory it's probably
       because 'vte.sh' haven't been sourced by the shell in this terminal */
    app.action_group.activate_action(
        "win.new-terminal", new imports.gi.GLib.Variant("(ss)", ["window", "current"]));
}

function duplicateWindow(metaWindow) {
    metaWindow = metaWindow || global.display.focus_window;
    let app = Tracker.get_window_app(metaWindow);

    let handler = customHandlers[app.id];
    if (handler) {
        let space = Tiling.spaces.spaceOfWindow(metaWindow);
        return handler(metaWindow, app, space);
    }

    let workspaceId = metaWindow.get_workspace().workspace_index;

    let original = Kludges.getSavedProp(Shell.App.prototype, "open_new_window");
    original.call(app, workspaceId);
    return true;
}

function spawnWindow(app, workspace) {
    if (typeof(app) === 'string') {
        app = new Shell.App({ app_info: Gio.DesktopAppInfo.new(app) });
    }
    let handler = customSpawnHandlers[app.id];
    if (handler) {
        let space = Tiling.spaces.selectedSpace;
        return handler(app, space);
    } else {
        launchFromWorkspaceDir(app, workspace);
    }
}


function expandCommandline(commandline, space) {
    let dir = space.settings.get_string('directory');
    commandline = commandline.replace(/%d/g, () => GLib.shell_quote(dir));
    return commandline;
}
