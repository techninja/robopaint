/**
 * @file Manage clientside state, messages, progress bar and status, and all
 * cncserver specific communication from modes to the one instance of the API.
 */
/* globals $, _, robopaint, cncserver, i18n, setModal  */
var modeWindow = {};

cncserver.state = {
  pen: {}, // The state of the pen/machine at the end of the buffer
  actualPen: {}, // The current state of the pen/machine
  bufferList: [], // Holds a copy of cncserver's internal command buffer
  bufferData: {},
  media: '', // What we think is currently on the brush
  mediaTarget: '', // What we "want" to paint with
  // True if buffer paused till we've sent all local commands to its buffer
  pausingTillEmpty: false,
  process: {
    name: 'idle',
    waiting: false,
    busy: false,
    paused: false,
    max: 0
  }
};

// When the subwindow has been (re)created.
$(robopaint).on('subwindowReady', function(){
  modeWindow = $subwindow[0]; // Set to actual webview

  // Bind for client messages
  modeWindow.addEventListener('ipc-message', function(event){
     // TODO: Is this needed if run works?
    if (event.channel === 'cncserver') {
      handleClientCmd.apply(undefined, event.args);
    }

    if(event.channel === 'cncserver-run') {
      cncserver.cmd.run.apply(undefined, event.args[0]);
    }
  });
});

// When main settings have fully loaded...
$(robopaint).on('settingsComplete', _.once(function(){

  // Set the "global" scope objects for any robopaint level details.
  cncserver.canvas = {
    height: robopaint.canvas.height,
    width: robopaint.canvas.width,
    scale: 1,
    offset: {
      top: 20,
      left: 235
    }
  };

  // Set base CNC Server API wrapper access location
  if (!robopaint.cncserver.api) robopaint.cncserver.api = {};
  robopaint.cncserver.api.server = robopaint.utils.getAPIServer(robopaint.settings);

  // Use direct buffer always (somewhat ignored if not local).
  robopaint.cncserver.penUpdateTrigger = penUpdateEvent;
  robopaint.cncserver.bufferUpdateTrigger = bufferUpdateEvent;

  // TODO: replace with ServerConnect(?)
  cncserver.status(robopaint.t('status.connected'));
}));

// Bind the Stream event callbacks ===========================================
// Bind socket connect
$(robopaint).on('socketIOComplete', function(){
  // If external, be sure to bind the pen and buffer update triggers.
  if (robopaint.statedata.external) {
    robopaint.socket.on('buffer update', bufferUpdateEvent);
    robopaint.socket.on('pen update', penUpdateEvent);
    console.log('EXTERNALLY BOUND');
  } else {
    console.log('INTERNALLY BOUND');
  }
  robopaint.socket.on('message update', messageUpdateEvent);
  robopaint.socket.on('callback update', callbackEvent);
  robopaint.socket.on('manualswap trigger', manualSwapTrigger);
});

// CNCServer Buffer Change events (for pause, update, or resume)
function bufferUpdateEvent(b){
  // What KIND of buffer update is this?
  switch (b.type) {
    case 'complete':
      // When local, this attaches cncserver.state.buffer* to the actual in use
      // cncserver buffer object. When external, this is a reference instance
      // inside the Socket.io callback data object.
      cncserver.state.bufferList = b.bufferList;
      cncserver.state.bufferData = b.bufferData;
      /* falls through */
    case 'vars':
      // Break out important buffer states into something with wider scope
      cncserver.state.process.busy = b.bufferRunning;
      cncserver.state.process.paused = b.bufferPaused;
      break;
    case 'add':
      // No need to actually edit the buffer when local as we have access to
      // the exact same buffer object in memory.
      if (robopaint.statedata.external) {
        cncserver.state.bufferList.unshift(b.hash);
        cncserver.state.bufferData[b.hash] = b.item;
      }
      cncserver.state.process.max++;
      break;
    case 'remove':
      // Again, when local, we don't need to do anything to the object we have
      if (robopaint.statedata.external) {
        var hash = cncserver.state.bufferList.pop();
        delete cncserver.state.bufferData[hash];
      }
      break;
  }

  // Send useful info to the mode
  cncserver.pushToMode('bufferUpdate', {
    length: cncserver.state.bufferList.length,
    paused: cncserver.state.process.paused
  });

  // Empty buffer?
  if (!cncserver.state.bufferList.length) {
    cncserver.state.process.max = 1;
    cncserver.progress({val: 0, max: 1});
  } else { // At least one item in buffer
    // Update the progress bar (if not trying to empty the local buffer)
    if (!cncserver.state.pausingTillEmpty) {
      cncserver.progress({
        val: cncserver.state.process.max - cncserver.state.bufferList.length,
        max: cncserver.state.process.max
      });
    }
  }
}

/**
 * Tool manual swap event trigger. When a queued tool change to a manual tool
 * is reached, the queue will be paused and this will get called. We need to
 * tell the use to get ready and actually do the manual swap. When done, we just
 * resume the queue.
 *
 * @param  {object} data
 *   Currently only supports one property: index, containing the originally sent
 *   tool index (color) to be used to tell the user what they should change to.
 */
function manualSwapTrigger(data) {
  // Alert user.
  var shell = require('electron').shell;
  shell.beep();

  // Unlock immediately.
  cncserver.cmd.run('unlock', true);

  // Translate window text based on given implement.
  var set = robopaint.media.currentSet;
  var name = set.colors[data.index].name;
  var type = set.media.toLowerCase();
  $('#manualswap b').text(
    i18n.t('libs.manual.notice', {color: name.toLowerCase(), type: type})
  );
  $('#manualswap button.continue').text(
    i18n.t('libs.manual.options.continue.title', {color: name})
  );

  // Show window and overlay.
  setModal(true, '#manualswap');
}

// Pen update event callback
function penUpdateEvent(actualPen){
  actualPen.absCoord = cncserver.utils.getStepstoAbsCoord(actualPen);
  cncserver.state.actualPen = $.extend({}, actualPen);
  actualPen.media = cncserver.state.mediaTarget; // Give the modes access to pen media
  cncserver.pushToMode('penUpdate', actualPen);
}

// General message update callback (handled locally for the main process)
function messageUpdateEvent(data){
  cncserver.status(data.message);
}

// Custom buffered callbacks (called here when eventually executed)
function callbackEvent(data){
  cncserver.pushToMode('callbackEvent', data.name);
}

// Send data to the window (pen updates)
cncserver.pushToMode = function() {
  try {
    modeWindow.send('cncserver', arguments);
  } catch(e) {
    // The above will fail whenever the window isn't ready. That's a fine fail.
  }
};

// Send settings updates to modes
$(robopaint).on('settingsUpdate', function(){
  try {
    modeWindow.send('settingsUpdate');
  } catch(e) {
    // The above will fail whenever the window isn't ready. That's a fine fail.
  }
});

// Handle CNCServer requests from mode windows.
function handleClientCmd(type, data) {
  switch(type) {

    default:
      console.log('CNC clientcmd', args);
  }

}


// Status and Progress management ==============================================
var statusTimeout = false;
function popoutStatus() {
  if (statusTimeout !== false) clearTimeout(statusTimeout);
  $('#status').css('right', 0);
  statusTimeout = setTimeout(function(){
    $('#status').css('right', "");
  }, 5000);
}

cncserver.status = function(msg, st) {
  var $status = $('#status div:first');
  var classname = 'wait';

  popoutStatus();

  // String messages, just set em
  if (typeof msg == "string") {
    $status.html(msg);
  } else if (Object.prototype.toString.call(msg) == "[object Array]") {
    // If it's an array, flop the message based on the status var

    // If there's not a second error message, default it.
    if (msg.length == 1) msg.push(robopaint.t('libs.problem'));

    $status.html(!st ? msg[1] : msg[0]);
  }

  // If stat var is actually set
  if (typeof st != 'undefined') {
    if (typeof st == 'string') {
      classname = st;
    } else {
      classname = !st ? 'error' : 'success';
    }

  }

  $status.attr('class', classname); // Reset class to only the set class
};

// Update global progress bar
// TODO: integrate with OS ui taskbar UI progress
cncserver.progress = function(p) {
  var $prog = $('#status progress');

  if (typeof p.max !== 'undefined') {
    p.max = Math.round(p.max);
    $prog.attr('max', p.max);
  }
  $prog.val(Math.round(p.val));

  $('#status .progress-wrapper label').text($prog.val() + '/' + $prog.attr('max'));
  popoutStatus();
};

/**
 * Fully cancel anything that's going on.
 */
cncserver.fullCancel = function() {
  cncserver.cmd.run([
    'clear',
    'resume',
    'park',
    ['progress', 0, 1],
    'localclear'
    // As a nice reminder, localclear MUST be last, otherwise the commands
    // after it will be cleared before being sent :P
  ], true); // As this is a forceful cancel, shove to the front of the queue
};

// TODO: Provide something for the parent script?
module.exports = {};
