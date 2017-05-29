/*
 * @file Holds all RoboPaint GLOBAL settings specific configuration, binding and
 * handler code. If a new setting wants to show up in the application, in needs
 * to have its markup added in main.settings.inc.html. This may all eventually
 * move to a more centralized singluar configuration file ... but not yet. ;)
 */

// TODO: Limit the number of random globals going on here. :P
/* globals window, _, cncserver, robopaint, localStorage, $, initializing,
setModal, rpRequire, paper, homeVis, mainWindow, appMode, $subwindow, isModal,
 */

/**
 * Load settings from defaults/localStorage and push to elements
 */
function loadSettings() {
  loadPaperJS();

  var g = cncserver.conf.global;
  var b = cncserver.conf.bot;

  // Pull settings over from CNC server / RoboPaint defaults (defined here)
  robopaint.settings = {
    // CNC Server specific settings
    invertx: g.get('invertAxis:x'),
    inverty: g.get('invertAxis:y'),
    swapmotors: g.get('swapMotors'),
    serialpath: g.get('serialPath'),
    httpport: g.get('httpPort'),
    httplocalonly: g.get('httpLocalOnly'),
    latencyoffset: 20,
    servowash: parseFloat(b.get('servo:presets:wash'))*10,
    servopaint: parseFloat(b.get('servo:presets:draw'))*10,
    servoup: parseFloat(b.get('servo:presets:up'))*10,
    servotime: b.get('servo:duration'),
    movespeed: parseFloat(b.get('speed:moving')),
    paintspeed: parseFloat(b.get('speed:drawing')),

    // Robopaint specific defaults
    penmode: 0,
    openlast: 0,
    showcolortext: 0,
    colorset: 'generic-standard',
    maxpaintdistance: 10805, // 48.2cm @ ~2.24mm per step
    tsprunnertype: 'OPT',
    enabledmodes: {print: true, edit: true},
    remoteprint: 0,
    gapconnect: 1,
    refillmode: 0,
    refillaction: 0,
    rpdebug: 0,


    autostrokeenabled: 1,
    strokeprecision: 6,
    strokeovershoot: 5,
    strokefills: 1,
    strokeinvisible: 0,
    autostrokeiteration: 2,
    autostrokeocclusion: 1,
    strokeocclusionfills: 1,
    strokeocclusionstoke: 1,
    strokeocclusioncolor: 0,
    strokeocclusionwater: 1,
    autostrokewidth: 10,
    strokeclosefilled: 1,

    autofillenabled: 1,
    filltype: 'zigsmooth',
    fillangle: 28,
    fillspacing: 10,
    fillprecision: 14,
    fillgroupingthresh: 40,
    fillhatch: 0,
    fillrandomize: 1,
    fillspiralalign: 1,
    fillinset: 0,
    autofilliteration: 2,
    autofillwidth: 10,
    fillocclusionfills: 1,

    skipwhite: 1,
    optimizepath: 1
  };

  // Allow machine specific overrides of initial default settings
  settingsDefaultAlter(robopaint.settings);

  // Are there existing settings from a previous run? Mesh into the defaults.
  if (localStorage[robopaint.utils.settingsStorageKey()]) {
    var s = robopaint.utils.getSettings();
    for (var key in robopaint.settings) {
      if (typeof s[key] !== 'undefined' && s[key] !== null) {
        robopaint.settings[key] = s[key];
      }
    }
  }

  // Actually match the form elements to the given settings
  for (var key in robopaint.settings) {
    var $input = $('#' + key);
    switch (key) {
      case 'enabledmodes':
        for (var i in robopaint.settings.enabledmodes) {
          $('#' + i + 'modeenable')
            .prop('checked', robopaint.settings.enabledmodes[i])
            .change();
        }
        break;
      default:
        if ($input.attr('type') === 'checkbox') {
          $input.prop('checked', robopaint.settings[key]);
        } else {
          $input.val(robopaint.settings[key]);
        }
    }
    $input.change();
  }

  $(robopaint).trigger('settingsComplete');
}

/**
 * Called after robopaint.settings is initialized with defaults, allows for
 * machine specific overrides of global settings defaults.
 */
function settingsDefaultAlter(settings) {
  var tools = robopaint.currentBot.data.tools;

  // Bot specific switches
  switch (robopaint.currentBot.type) {
    case "eggbot":
      // TODO: Bot specific things should be less important/useful than tool
      // specific changes (as new bots should have the ability to be added in
      // cncserver without needing explicit support in robopaint)
  }

  // Switch pen modes depending on bot's tool abilities
  if (!tools.color0) { // No colors...
    settings.penmode = 1;

    $("#penmode option[value=0]").remove(); // Diable WaterColor Mode

    if (!tools.water0) { // No water or color (Assume Pen only)
      settings.penmode = 3;
      settings.strokeovershoot = 0;
      settings.fillspacing = 1;
      settings.strokeprecision = 6;

      // Force the hand of settings to disable WCB specific options
      // (colorset is handled in verifyColorsetAbilities func)
      $("#penmodes, #overshoot, #maxpaint").hide();
    }
  } else if (!tools.water0) { // Has color, no water
    $("#penmode option[value=0]").remove(); // Diable WaterColor Mode
    $("#penmode option[value=1]").remove(); // Diable Water Mode
    settings.penmode = 2;
  }

}


/**
 * Called after settings have been loaded
 */
$(robopaint).on('settingsComplete', function(){
  addSettingsRangeValues(); // Add in the range value displays

  // Clear last used image
  if (robopaint.settings.openlast === 0) delete localStorage["svgedit-default"];
});

/**
 * Bind and callback functionality for any settings specific markup/controls
 */
function bindSettingsControls() {
  // Pull the list of available ports
  cncserver.getPorts(function(ports) {
    for (var portID in ports){
      var o = $('<option>')
        .attr('value', ports[portID].comName)
        .attr('title', ports[portID].pnpId);
      o.text(ports[portID].comName);

      o.appendTo('select#ports');
    }
  });

  // Pull the list of available bot types
  var botTypes = cncserver.getSupportedBots();
  for (var type in botTypes) {
    var o = $('<option>')
      .attr('value', type)
      .text(botTypes[type].name);

      o.appendTo('select#bottype');
  }
  $('select#bottype').val(robopaint.currentBot.type);


  var b = botTypes[robopaint.currentBot.type].data;

  // Re-init currentBot with full data and tools (also sets capabilities!)
  robopaint.currentBot = robopaint.utils.getCurrentBot(b);

  // Set robopaint global aspect ratio & margin
  robopaint.canvas = robopaint.utils.getRPCanvas(b);

  // Setup settings group tabs
  $('ul.tabs').each(function(){
    // For each set of tabs, we want to keep track of
    // which tab is active and its associated content
    var $active, $content, $links = $(this).find('a');

    // Use the first link as the initial active tab.
    $active = $($links[0]);
    $active.addClass('active');
    $content = $($active.attr('href'));

    // Hide the remaining content
    $links.not($active).each(function () {
      $($(this).attr('href')).hide();
    });

    // Bind the click event handler for tabs
    $(this).on('click', 'a', function(e){
      // Make the old tab inactive.
      $active.removeClass('active');
      $content.hide();

      // Update the variables with the new link and content
      $active = $(this);
      $content = $($(this).attr('href'));

      // Make the tab active.
      $active.addClass('active');
      $content.show();

      // Prevent the anchor's default click action
      e.preventDefault();
    });
  });

  // Catch all settings input changes
  $('#settings input, #settings select').bind('change input', function(e){
    var $input = $(this);
    var pushKey = [];
    var pushVal = '';
    var name = '';

    // Do this first as switch case can't use indexOf
    // Update available modes
    if (this.id.indexOf('modeenable') !== -1) {
      name = this.id.replace('modeenable', '');
      var enabled = $input.is(':checked');
      robopaint.settings.enabledmodes[name] = enabled;
      $('#bar-' + name).toggleClass('hidden', !enabled);
      robopaint.modes[name].enabled = enabled;
      homeVis.modeStatus(name, enabled);
      $(this).parents('.modebox').toggleClass('disabled', !enabled);

      if (!initializing) {
        robopaint.utils.saveSettings(robopaint.settings);
        $(robopaint).trigger('settingsUpdate');
      }
      return;
    }


    switch (this.id) {
      case 'colorset':
        // Disabled select properties can't be read with val(), so we use
        // selectedIndex as an always working option.
        robopaint.settings[this.id] = $input.find('option:selected').val();
        break;
      case 'servoup':
      case 'servopaint':
      case 'servowash':
        name = this.id.substr(5);

        // Shim to translate robopaint name to cncserver name
        if (name === "paint") name = 'draw';

        // Save settings
        cncserver.conf.bot.set(
          'servo:presets:' + name, parseFloat($input.val()/10)
        );

        // On input with nothing in the buffer allow active change of the bot.
        // On "change" of sliders, the user has finished sliding, we can reset
        // the height back to UP. Allows changing while paused.
        var state = robopaint.cncserver.state;
        if (!initializing &&
            (state.bufferList.length === 0 || state.process.paused)) {
          if (e.type === 'change') {
            cncserver.setHeight('up', null, state.process.paused);
          } else {
            cncserver.setHeight(name, null, state.process.paused);
          }
        }

        robopaint.settings[this.id] = $input.val();
        break;

      // TODO: Make the following pull from master pushkey list
      // This would mean a total change in the way this switch is being used,
      // and would remove all the code duplication below, of course it would
      // complicate the simple settings variable structure. Considering that
      // this currently works reasonably well has put it pretty low on the
      // priority list.
      case 'invertx':
        pushKey = ['g', 'invertAxis:x'];
        pushVal = $input.is(':checked');
        break;
      case 'inverty':
        pushKey = ['g', 'invertAxis:y'];
        pushVal = $input.is(':checked');
        break;
      case 'swapmotors':
        pushKey = ['g', 'swapMotors'];
        pushVal = $input .is(':checked');
        break;
      case 'httpport':
        pushKey = ['g', 'httpPort'];
        pushVal = $input.val();
        break;
      case 'httplocalonly':
        pushKey = ['g', 'httpLocalOnly'];
        pushVal = $input.is(':checked');
        break;
      case 'latencyoffset':
        pushKey = ['g', 'bufferLatencyOffset'];
        pushVal = parseInt($input.val());
        break;
      case 'servotime':
        pushKey = ['b', 'servo:duration'];
        pushVal = parseInt($input.val());
        break;
      case 'movespeed':
        pushKey = ['b', 'speed:moving'];
        pushVal = parseInt($input.val());
        break;
      case 'paintspeed':
        pushKey = ['b', 'speed:drawing'];
        pushVal = parseInt($input.val());
        break;
      case 'penmode':
        var v = parseInt($input.val(), 10);

        // No paint?
        /*toggleDisableSetting(
          '#showcolortext, #colorset',
          (v === 2 || v === 0),
          robopaint.t('settings.output.penmode.warningPaint')
        );*/

        // No nothing!
        toggleDisableSetting(
          '#maxpaintdistance, #refillmode, #refillaction, #maxpaint',
          v !== 3,
          robopaint.t('settings.output.penmode.warningAll')
        );

        robopaint.settings[this.id] = $input.val();
        break;
      case 'bottype': // Bot type change! Not a real setting
        localStorage.currentBot = JSON.stringify({
          type: $input.val(),
          name: $('#bottype option:selected').text()
        });
        return;
      default: // Nothing special to set, just change the settings object value
        if ($input.attr('type') === 'checkbox') {
          robopaint.settings[this.id] = $input.is(':checked');
        } else {
          robopaint.settings[this.id] = $input.val();
        }
    }

    // Enable only for debug windows (users can close them by hand).
    if (this.id === 'rpdebug' && $input.is(':checked')) {
      mainWindow.openDevTools();
      if (appMode !== 'home') $subwindow[0].openDevTools();
    }

    // Update paint sets when changes made that would effect them
    if (this.id === 'colorset' || this.id === 'showcolortext') {
      updateColorSetSettings();
      cncserver.pushToMode('updateMediaSet');
    }

    // Update visibility of paintsets on penmode change
    if (this.id === 'penmode') {
      cncserver.pushToMode('updatePenMode');
    }

    // If there's a key to override for CNC server, set it
    if (pushKey.length) {
      robopaint.settings[this.id] = pushVal;
      if (pushKey[0] === 'b') { // Bot!
        cncserver.conf.bot.set(pushKey[1], pushVal);
      } else { // Global conf
        cncserver.conf.global.set(pushKey[1], pushVal);
      }
    }

    if (!initializing) {
      robopaint.utils.saveSettings(robopaint.settings);
      $(robopaint).trigger('settingsUpdate');
    }
  });

  // Done Button
  $('#settings-done').click(function() {
    setSettingsWindow(false);
  });

  // Keyboard shortcut for exiting settings
  $(window).keydown(function (e){
    if (isModal && $('#settings').is(':visible')) {
      if (e.keyCode === 27) {
        $('#settings-done').click();
      }
    }
  });

  // Reset button
  $('#settings-reset').click(function() {
    if (confirm(robopaint.t('settings.buttons.reset.confirm'))) {
      // Disable any non-core modes
      $('.advanced-modes input').prop('checked', false).change();

      robopaint.utils.clearSettings();

      cncserver.loadGlobalConfig();
      cncserver.loadBotConfig();
      loadSettings();
    }
  });

  // Fill in the IP Address of local interfaces
  $('#settings div.httpport label span').text(
    robopaint.utils.getIPs(robopaint.settings.httplocalonly)
  );


  // Setup custom form element handlers
  $('#settings input[type="checkbox"]').each(function(){
    var $item = $(this);
    // Add a div after each one for iOS CSS style checkboxes.
    $item.after($('<div>').click(function(){
      $item.click();
    }));
  });

  // Add a target to see the aside details
  $('#settings aside').each(function(){
    var $aside = $(this);
    $aside
      .hide()
      .siblings('label:last').after(
        $('<span>')
          .text('?')
          .addClass('aside-show')
          .click(function(){
            if (!$aside.is('.open')) {
              $(this).addClass('open').text('▼');
              $aside.toggleClass('open', true).slideDown();
            } else {
              $(this).removeClass('open').text('?');
              $aside.removeClass('open').slideUp();
            }
          })
      );
  });
}

function toggleDisableSetting(selector, toggle, message) {
  $(selector).each(function(){
    var $this = $(this);
    var $parent = $this.parent();

    $this.prop('disabled', !toggle);
    $parent.toggleClass('disabled', !toggle);

    if (!toggle) { // Disable element
      $parent.attr('title', message);
    } else { // Enable element
      $parent.attr('title', '');
    }
  });
}

/**
 * Fade in/out settings modal window
 *
 * @param {Boolean} toggle
 *   True to show window, false to hide.
 */
function setSettingsWindow(toggle) {
  if (toggle) {
    $('#settings').css('top', 0);
  } else {
    $('#settings').css('top', '-100%');
  }
  setModal(toggle);
}

/**
 * Adds label markup for range slider controls and controls label conversion
 */
function addSettingsRangeValues() {
  $('input[type=range]:not(.processed)').each(function(){
    var $r = $(this);
    var $l = $('<label>').addClass('rangeval');

    $r.bind('change input', function(){
      var num = parseInt($r.val());
      var post = "";
      var wrap = ['(', ')'];
      var dosep = true;


      switch (this.id){
        case "servotime":
          num = Math.round(num / 10) * 10;
          break;
        case "maxpaintdistance":
          // Display as Centimeters (2.24076923 mm per step!)
          num = Math.round((num / 224.076923) * 10) / 10;
          num = robopaint.t('common.metric.cm', {count: num}) + ' / ' +
            robopaint.t('common.imperial.in', {
              count: (Math.round((num / 2.54) * 10) / 10)
            });
          dosep = false;
          break;
        case 'servoup':
        case 'servopaint':
        case 'servowash':
          num = Math.round(num/10);
          dosep = false;
          post = '%';
          break;
        case 'movespeed':
        case 'paintspeed':
          var msg = "";

          if (num < 25) {
            msg = robopaint.t('settings.output.move.speed0');
          } else if (num < 50) {
            msg = robopaint.t('settings.output.move.speed1');
          } else if (num < 75) {
            msg = robopaint.t('settings.output.move.speed2');
          } else if (num < 80) {
            msg = robopaint.t('settings.output.move.speed3');
          } else {
            msg = robopaint.t('settings.output.move.speed4');
          }

          dosep = false;
          wrap = ['', ''];
          post = "% - " + msg;
          break;
      }

      // Format translated text with
      if (['servotime', 'latencyoffset'].indexOf(this.id) !== -1) {
        post = '';
        num = robopaint.t('common.time.ms', {count: num});
      }

      if (dosep) num = num.toString(10).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

      $l.text(wrap[0] + num + post + wrap[1]);
    }).change();

    $r.addClass('processed').after($l);
  });
}

/**
 * Update/render currently selected colorset in settings window
 */
function updateColorSetSettings() {
  if (!robopaint.media.sets) return; // Don't run too early

  var set = robopaint.media.currentSet;
  if (!set) return; // Don't run if the set is invalid

  var $colors = $('#colorsets .colors');

  // Add Sortable color names/colors
  $colors.empty();
  _.each(set.colors, function(color) {
    $('<li>')
      .append(
        $('<span>')
          .addClass('color')
          .css('background-color', color.color.HEX)
          .text(' '),
        $('<label>').text(color.name)
      ).appendTo($colors);
  });

  // Add metadata
  var meta = 'type name description media'.split(' ');
  for (var i in meta) {
    $('#colorsets .' + meta[i]).text(set[meta[i]]);
  }
}

// Manage PaperJS output for settings
var paperLoaded = false;
function loadPaperJS() {
  if (paperLoaded) return;

  paperLoaded = true;
  rpRequire('paper', function(){
    rpRequire('paper_utils')(paper);
    paper.utils.loadDOM('scripts/settings.ps.js', 'settings-preview');
    $('#render .renderpreview').change(paper.refreshPreview);
  });
}
