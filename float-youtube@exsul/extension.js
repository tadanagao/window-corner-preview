
// Copyright (c) Shou 2015
// License: MIT

const Lang = imports.lang;
const Main = imports.ui.main;


function init(em)
{
  return new HoppingWindow(em)
}

function HoppingWindow(em)
{
}

HoppingWindow.prototype =
{
  enable: function()
  {
    this.workspaceSwitchSignal
      = global.screen.connect( "workspace-switched" , Lang.bind(this, this.try_spawn)
                               )
  }
  ,
  disable: function()
  {
    this.despawn_window()
    global.screen.disconnect(this.workspaceSwitchSignal)
  }
  ,
  try_spawn: function()
  {
    let mpv = this.find_window("YouTube")
    if (mpv !== null && ! this.overview)
      this.spawn_window(mpv)
    else
      this.despawn_window()
  }
  ,
  find_window: function(title)
  {
    let active_workspace_index
      = global.screen.get_active_workspace_index();

    let active_workspace
      = global.screen.get_workspace_by_index(active_workspace_index);

    let windows
      = active_workspace.list_windows();

    for (let i in windows)
      if (windows[i].get_title().search(title) > -1)
        return windows[i];

    return null;
  }
  ,
  despawn_window: function()
  {
    if (!this.preview)
      return;

    this.preview.destroy()
    this.preview = null
  }
  ,
  spawn_window: function(win)
  {
    this.despawn_window()

    this.preview = new imports.gi.St.Button({ style_class: "youtube-preview" })

    let th = this.generate_texture(win, 100)
    this.preview.add_actor(th)

    Main.layoutManager.addChrome(this.preview)
  }
  ,
  generate_texture: function(win, size)
  {
    let mutw = win.get_compositor_private()

    if (!mutw)
      return;

    let wtext = mutw.get_texture()
    let [width, height] = wtext.get_size()
    let scale = Math.min(1.0, size / width, size / height)
    let th = new imports.gi.Clutter.Clone
    ({
       source: wtext
       , reactive: true
       , width: width * scale
       , height: height * scale
    });

    return th
  }
}
