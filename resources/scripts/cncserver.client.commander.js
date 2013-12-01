/**
 * @file Holds all CNC Server command abstractions for API shortcuts. The API
 * Makes the actual commands to the server, but this manages their execution and
 * buffering to avoid collisions.
 *
 * Only applies to specific API functions that require waiting for the bot to
 * finish, handles all API callbacks internally.
 */

// TODO: DO this better!
var returnPoints = [];
var lastPoint = {};

cncserver.cmd = {
  // Easy set for progress!
  progress: function(options){
    if (typeof options.val !== "undefined") {
      $('progress').attr('value', options.val);
    }

    if (typeof options.max !== "undefined") {
      $('progress').attr('max', options.max);
    }
  },

  // CMD specific callback handler
  cb: function(d) {
    // TODO: check for errors

    if (!cncserver.state.buffer.length) {
      cncserver.state.process.busy = false;
      cncserver.state.process.max = 0;
      cncserver.cmd.progress({val: 0, max: 0});
    } else {
      // Update the progress bar
      cncserver.cmd.progress({
        val: cncserver.state.process.max - cncserver.state.buffer.length,
        max: cncserver.state.process.max
      });

      // Check for paint refill
      if (!cncserver.state.process.paused) {
          // Check if using reload after distance, and if we've passed the max
          if ( (robopaint.settings.reloadwhen == 0) && (cncserver.state.pen.distanceCounter > robopaint.settings.maxpaintdistance) ) {
          var returnPoint = returnPoints[returnPoints.length-1] ? returnPoints[returnPoints.length-1] : lastPoint;
              
          ////////////////////////////////////////////////////
          // TODO: this switch should be implemented here!
          ////////////////////////////////////////////////////
          /*
           switch (robotpaint.settings.reloadhow) {
           case 0:
           run('getpaintfull');
           break;
           case 1:
           run('getwaterpaintdip');
           break;
           case 2:
           run('getpaintdip');
           break;
           case 3:
           run('getwaterpaintdoubledip');
           break;
           case 4:
           run('getpaintdoubledip');
           break;
           default:
           run('getpaintfull');
           break;
           }
           */
          ////////////////////////////////////////////////////
          // instead of the following
          ////////////////////////////////////////////////////

          cncserver.wcb.getMorePaint(returnPoint, function(){
            cncserver.api.pen.down(cncserver.cmd.executeNext);
          });
              
        } else {
          // Execute next command
          cncserver.cmd.executeNext();
        }
      } else {
        cncserver.state.process.pauseCallback();
      }
    }
  },

  executeNext: function(executeCallback) {
    if (!cncserver.state.buffer.length) {
      cncserver.cmd.cb();
      return;
    } else {
      cncserver.state.process.busy = true;
    };

    var next = cncserver.state.buffer.pop();

    if (typeof next == "string"){
      next = [next];
    }

    switch (next[0]) {
      case "move":
        returnPoints.unshift(next[1]);
        if (returnPoints.length > 4) {
          returnPoints.pop();
        }
        lastPoint = next[1];
        cncserver.api.pen.move(next[1], cncserver.cmd.cb);
        break;
      case "tool":
        cncserver.wcb.setMedia(next[1], cncserver.cmd.cb);
        break;
      case "up":
        returnPoints = [];
        cncserver.api.pen.up(cncserver.cmd.cb);
        break;
      case "down":
        cncserver.api.pen.down(cncserver.cmd.cb);
        break;
      case "status":
        cncserver.wcb.status(next[1], next[2]);
        cncserver.cmd.cb(true);
        break;
      case "wash":
        cncserver.wcb.fullWash(cncserver.cmd.cb, next[1]);
        break;
      case "park":
        cncserver.api.pen.park(cncserver.cmd.cb);
        break;
      case "custom":
        cncserver.cmd.cb();
        if (next[1]) next[1](); // Run custom passed callback
        break;
      case "getpaintfull":
        cncserver.wcb.getMorePaint(next[1],cncserver.cmd.cb);
        break;
      case "getwaterpaintdip":
      case "getwaterpaintdoubledip":
        // TODO: water + paint dips
        break;
      case "getpaintdip":
      case "getpaintdoubledip":
        // TODO: just paint dip
        break;
      default:
        console.debug('Queue shortcut not found:' + next[0]);
    }
    if (typeof executeCallback == "function") executeCallback();
  },

  // Add a command to the queue! format is cmd short name, arguments
  run: function(){
    if (typeof arguments[0] == "object") {
      cncserver.state.process.max+= arguments.length;
      $.each(arguments[0], function(i, args){
        cncserver.state.buffer.unshift(args);
        if (cncserver.state.isRecording) cncserver.state.recordBuffer.unshift(args);
      });
    } else {
      cncserver.state.process.max++;
      cncserver.state.buffer.unshift(arguments);
      if (cncserver.state.isRecording) cncserver.state.recordBuffer.unshift(arguments);
    }

  }
};

// Wait around for the buffer to contain elements, and for us to not be
// currently processing the buffer queue
setInterval(function(){
  if (!cncserver.state.process.busy && cncserver.state.buffer.length && !cncserver.state.process.paused) {
    cncserver.cmd.executeNext();
  }
}, 10);