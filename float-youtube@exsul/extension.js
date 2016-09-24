
// Copyright (c) Shou 2015
// License: MIT

const Lang = imports.lang;

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;

const Main = imports.ui.main;


function id(x)
{
  return x;
}

function plus1(n)
{
  return n + 1;
}


function init(em)
{
  return new Preview(em)
}

function Preview(em)
{
  this.init(em)
}

Preview.prototype =
{
    //preview: null,
    workspaceSwitchSignal: null,
    overviewShowingSignal: null,
    overviewHidingSignal: null,
    //posX: 0,
    //posY: 0,
    //corner: 0,
    //overview: false,

    init: function(em)
    {
      this.preview = undefined;
      this.extensionMeta = em
    },

    enable: function()
    {
      this.workspaceSwitchSignal
        = global.screen.connect( "workspace-switched" , Lang.bind(this, this.mpvFloat)
                                 )
      this.overviewHidingSignal
        =  Main.overview.connect( "hiding"
                                 , Lang.bind(this, this.toggleView, false)
                                 )
      this.overviewShowingSignal
        = Main.overview.connect( "showing"
                                 , Lang.bind(this, this.toggleView, true)
                                 )
    },

    disable: function()
    {
      this.removePreview()
      global.screen.disconnect(this.workspaceSwitchSignal)
      Main.overview.disconnect(this.overviewHidingSignal)
      Main.overview.disconnect(this.overviewShowingSignal)
    },

    toggleView: function(_, active)
    {
      this.overview = active
      if (active)
        this.removePreview()
      else
        this.mpvFloat()
    },

    mpvFloat: function()
    {
      let mpv = this.find_window("YouTube")
      if (mpv !== null && ! this.overview)
        this.showPreview(mpv)
      else
        this.removePreview()
    },

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


    showPreview: function(win)
    {
      this.removePreview()

      this.preview = new St.Button({ style_class: "youtube-preview" })

      let th = this.generate_texture(win, 100)
      this.preview.add_actor(th)

      Main.layoutManager.addChrome(this.preview)
    },

    removePreview: function()
    {
      if (this.preview)
      {
        this.preview.destroy()
        this.preview = null
      }
    },

    generate_texture: function(win, size)
    {
      let mutw = win.get_compositor_private()

      if (!mutw)
        return;

      let wtext = mutw.get_texture()
      let [width, height] = wtext.get_size()
      let scale = Math.min(1.0, size / width, size / height)
      let th = new Clutter.Clone
      ({
         source: wtext
         , reactive: true
         , width: width * scale
         , height: height * scale
      });

      return th
    }
}
