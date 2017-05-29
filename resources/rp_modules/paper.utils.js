/**
 * @file Robopaint->Mode->Paper.JS include module. Contains useful paper.js
 *  utilities not tied to mode specific use that will be attached to the passed
 *  paper object under paper.utils.
 */
/* globals $, _, robopaint, mode, i18n */

module.exports = function(paper) {
  // Emulate PaperScript "Globals" as needed
  var Point = paper.Point;
  var Layer = paper.Layer;
  var project = paper.project;

  paper.utils = {

    // Load a paperscript file into the paperscope via DOM insertion & jQuery
    loadDOM: function(file, canvas) {
      paper.PaperScript.load($('<script>').attr({
        type:"text/paperscript",
        src: file,
        canvas: canvas
      })[0]);
    },

    // Setup the 4 default useful layers used all over the place. Assumes the
    // current layer is intended to be the main layer.
    setupLayers: function() {
      if (!paper.canvas) paper.canvas = {};

      // SVG is imported to here
      paper.canvas.mainLayer = project.getActiveLayer();

      // Temporary working layer
      paper.canvas.tempLayer = new Layer();

      // Actual movement paths & preview
      paper.canvas.actionLayer = new Layer();

      // Overlay elements, like the pen position.
      paper.canvas.overlayLayer = new Layer();
    },

    // Check if a fill/stroke color is "real".
    // Returns True if not null or fully transparent.
    hasColor: function(color) {
      if (!color) {
        return false;
      } else {
        return color.alpha !== 0;
      }
    },


    /**
     * Offset a paper path a given amount, either in or out. Returns a reference
     * given to the output polygonal path created.
     *
     * @param {Path} inPath
     *   Paper Path object to be converted to polygon and offsetted.
     * @param {Number} amount
     *   The amount to
     * @param {Number} flattenResolution
     *   Resolution to flatten to polygons.
     * @return {Path}
     *   Reference to the path object created, false if the output of the path
     *   resulted in the eradication of the path.
     */
    offsetPath: function(inPath, amount, flattenResolution) {
      var ClipperLib = rpRequire('clipper');
      var scale = 100;
      if (!amount) amount = 0;

      // 1. Copy the input path & make it flatten to a polygon/multiple gons.
      // 2. Convert the polygon(s) points into the clipper array format.
      // 3. Delete the temp path.
      // 4. Run the paths array through the clipper offset.
      // 5. Output and descale the paths as single compound path.

      var p = inPath.clone();
      var paths = [];

      // Is this a compound path?
      try {
        if (p.children) {
          _.each(p.children, function(c, pathIndex) {
            if (c.segments.length <= 1 && c.closed) {
              c.closed = false;
            }
            c.flatten(flattenResolution);
            paths[pathIndex] = [];
            _.each(c.segments, function(s){
              paths[pathIndex].push({
                X: s.point.x,
                Y: s.point.y,
              });
            });
          });
        } else { // Single path
          paths[0] = [];
          p.flatten(flattenResolution);
          _.each(p.segments, function(s){
            paths[0].push({
              X: s.point.x,
              Y: s.point.y,
            });
          });
        }
      } catch(e) {
        console.error('Error flattening path for offset:', inPath.data.name, e);
        p.remove();
        return inPath;
      }

      // Get rid of our temporary poly path
      p.remove();

      ClipperLib.JS.ScaleUpPaths(paths, scale);
      // Possibly ClipperLib.Clipper.SimplifyPolygons() here
      // Possibly ClipperLib.Clipper.CleanPolygons() here

      // 0.1 should be an appropriate delta for most cases.
      var cleanDelta = 0.1;
      paths = ClipperLib.JS.Clean(paths, cleanDelta * scale);

      var miterLimit = 2;
      var arcTolerance = 0.25;
      var co = new ClipperLib.ClipperOffset(miterLimit, arcTolerance);

      co.AddPaths(
        paths,
        ClipperLib.JoinType.jtRound,
        ClipperLib.EndType.etClosedPolygon
      );
      var offsettedPaths = new ClipperLib.Paths();
      co.Execute(offsettedPaths, amount * scale);

      // Scale down coordinates and draw ...
      var pathString = paper.utils.paths2string(offsettedPaths, scale);
      if (pathString) {
        var inset = new paper.CompoundPath(pathString);
        inset.data = _.extend({}, inPath.data);
        inset.set({
          strokeColor: inPath.strokeColor,
          strokeWidth: inPath.strokeWidth,
          fillColor: inPath.fillColor
        });

        inPath.remove();
        return inset;
      } else {
        inPath.remove();
        return false;
      }
    },

    /**
     * Convert a ClipperLib paths array into an SVG path string.
     * @param  {Array} paths
     *   A Nested ClipperLib Paths array of point objects
     * @param  {[type]} scale
     *   The amount to scale the values back down from.
     * @return {String}
     *   A properly formatted SVG path "d" string.
     */
    paths2string: function(paths, scale) {
      var svgpath = "", i, j;
      if (!scale) scale = 1;
      for(i = 0; i < paths.length; i++) {
        for(j = 0; j < paths[i].length; j++){
          if (!j) svgpath += "M";
          else svgpath += "L";
          svgpath += (paths[i][j].X / scale) + ", " + (paths[i][j].Y / scale);
        }
        svgpath += "Z";
      }
      return svgpath;
    },

    // Will return true if the given point is in either the top left or bottom
    // right otuside the realm of the bound rect:
    //         |
    //   (true)| (false)
    // ----------------+
    //         | Bounds|
    // (false) |(false)| (false)
    //         +----------------
    //         (false) | (true)
    //                 |
    pointBeyond: function(point, bounds){
      // Outside top left
      if (point.x < bounds.left && point.y < bounds.top ) return true;

      // Outside bottom right
      if (point.x > bounds.right && point.y > bounds.bottom ) return true;

      // Otherwise, not.
      return false;
    },

    // Try to get a compound path's length.
    getPathLength: function(path) {
      if (_.isNumber(path.length)) return path.length;
      var len = 0;
      if (path.children) {
        _.forEach(path.children, function(child) {
          len += paper.utils.getPathLength(child);
        });
      }
      return len;
    },

    // Try to set a compound path's option.
    setPathOption: function(path, options) {
      _.forEach(options, function(value, key){
        path[key] = value;
        if (path.children) {
          _.forEach(path.children, function(child) {
            var opt = {};
            opt[key] = value;
            paper.utils.setPathOption(child, opt);
          });
        }
      });
    },

    // Return an integer for the "color type" of a path, defining how it's
    // attributes combine to make it either filled, stroked, etc.
    getPathColorType: function(path) {
      // Sometimes SVG will save NaN as strokeWidth or other values :/
      if (isNaN(path.strokeWidth)) path.strokeWidth = 0;

      var hasStroke = (path.strokeWidth !== 0 && paper.utils.hasColor(path.strokeColor));
      var hasFill = paper.utils.hasColor(path.fillColor);

      // Types of path coloring:
      // 1. Has fill, has stroke (Stroked filled shape)
      // 2. No fill, has stroke (Ftandard line, or closed empty shape)
      // 3. Has fill, no stroke (Strokeless Filled shape)
      // 4. No fill, No stroke (Invisible path!)
      if (hasStroke && hasFill) {
        return 1;
      }

      if (hasStroke && !hasFill) {
        return 2;
      }

      if (!hasStroke && hasFill) {
        return 3;
      }

      if (!hasStroke && !hasFill) {
        return 4;
      }
    },

    // Return true if the layer contains any groups at the top level
    layerContainsGroups: function (layer) {
      for(var i in layer.children) {
        if (layer.children[i] instanceof paper.Group) return true;
      }
      return false;
    },

    // Ungroup any groups recursively
    ungroupAllGroups: function (layer) {
      // Remove all groups
      while(paper.utils.layerContainsGroups(layer)) {
        for(var i in layer.children) {
          var path = layer.children[i];
          if (path instanceof paper.Group) {
            path.parent.insertChildren(0, path.removeChildren());
            path.remove();
          }
        }
      }
    },

    // Snap the given color to the nearest tool ID name.
    snapColorID: function (color, opacity) {
      var penmode = parseInt(robopaint.settings.penmode, 10);

      // Is the color/opacity transparent?
      if ((typeof opacity !== 'undefined' && opacity < 1) ||
          (color.alpha < 1 && color.alpha > 0)) {

        // If the penmode supports water, output that.
        if (penmode === 0 || penmode === 1) {
          return 'water2';
        } else {
          // If it doesn't, match to white/skip.
          return false;
        }
      }

      // If the color has alpha at this point, we need to reset that to 1 as the
      // closest color matcher does not take opacity into account.
      if (color.alpha !== 1) {
        color = color.clone();
        color.alpha = 1;
      }

      var closestColorID = robopaint.utils.closestColor(
        color.toCSS(), robopaint.media.currentSet.colors
      );

      // If the closest color is outside the range, skip it.
      if (closestColorID === -1) {
        return false;
      }

      // Skip white paint if selected and setting is enabled.
      if (robopaint.media.currentSet.colors[closestColorID].key === 'white') {
        if (robopaint.settings.skipwhite) {
          return false;
        }
      }

      // If pen/pencil mode, return a special ID with a color index in it.
      if (penmode === 3) {
        return "manualswap|" + closestColorID;
      } else {
        return "color" + closestColorID;
      }
    },

    // Get the actual color of the nearest color to the one given.
    snapColor: function (color, opacity) {
      var snapID = "";

      // Either we get a color object, or a snapID passed to get the color
      if (typeof color === "string") {
        snapID = color.replace('dip', '');
      } else {
        snapID = paper.utils.snapColorID(color, opacity);
      }

      // If the closest color is a skip, just use white.
      if (snapID === false) {
        return new paper.Color(robopaint.media.white.color.HEX);
      }

      var outColor;
      // Switch between water and regular colors
      if (snapID.indexOf('water') !== -1) {
        // TODO: Redo this when media sets get done.
        // Make Water preview paths blue and transparent
        outColor = new paper.Color('#256d7b');
        outColor.alpha = 0.3;
      } else {
        outColor = new paper.Color(
          robopaint.media.currentSet.colors[snapID.substr(-1)].color.HEX
        );
      }

      return outColor;
    },

    // Get only the ID of closest point in an intersection array.
    getClosestIntersectionID: function (srcPoint, points) {
      var closestID = 0;
      var closest = srcPoint.getDistance(points[0].point);

      _.each(points, function(destPoint, index){
        var dist = srcPoint.getDistance(destPoint.point);
        if (dist < closest) {
          closest = dist;
          closestID = index;
        }
      });

      return closestID;
    },

    // Return the closest intersection of the two given paths to the given point
    getClosestIntersection: function (path1, path2, point) {
      var ints = path1.getIntersections(path2);
      if (!ints.length) return null; // No intersections? huh

      return ints[paper.utils.getClosestIntersectionID(point, ints)];
    },


    // Find the closest point to a given point from an array of point groups.
    closestPointInGroup: function (srcPoint, pathGroup) {
      var closestID = 0;
      var closestPointIndex = 0;
      var closest = srcPoint.getDistance(pathGroup[0].points[0]);

      _.each(pathGroup, function(p, index){
        _.each(p.points, function(destPoint, pointIndex){
          var dist = srcPoint.getDistance(destPoint);
          if (dist < closest) {
            closest = dist;
            closestID = index;
            closestPointIndex = pointIndex;
          }
        });
      });

      return {
        id: closestID,
        closestPointIndex: closestPointIndex,
        dist: closest
      };
    },

    // Order a layers children by top left travel path from tip to tail,
    // reversing path order where needed, grouped by data.color. Only works
    // with paths, not groups or compound paths as it needs everything on an
    // even playing field to be reordered.
    travelSortLayer: function(layer) {
      var a = layer;

      if (a.children.count <= 1) return; // This doesn't need to be run

      // 1. Move through all paths, group into colors
      // 2. Move through each group, convert list of paths into sets of first
      //    and last segment points, ensure groups are sorted by luminosity.
      // 3. Find the point closest to the top left corner. If it's an end,
      //    reverse the path associated, make the first point the next one to
      //    check, remove the points from the group.
      // 4. Rinse and repeat!

      // Prep the colorGroups
      var sortedColors = robopaint.media.sortedColors();
      var colorGroups = {};
      _.each(sortedColors, function(tool) {
        colorGroups[tool] = [];
      });

      // Put each path in the sorted colorGroups, with its first and last point
      _.each(a.children, function(path){
        // If the color/tool defined isn't in the grouping, just stick it on the
        // end.
        if (path.data.color && !colorGroups[path.data.color]) {
          colorGroups[path.data.color] = [];
        } else if (!path.data.color) {
          // TODO: We -really- shouldn't be getting empty color IDs here, but it
          // has been confirmed to happen on some very large/complex images.
          // The line below keeps the error from killing the job, but assigns
          // an arbitrary color, not what it might actually want. We'll need to
          // throughly audit both auto.fill and auto.stroke to find out who's
          // the culprit, and this can be removed... or at least a non-breaking
          // error catch and cleanup put in place.
          path.data.color = 'color0';
        }

        colorGroups[path.data.color].push({
          path: path,
          points: [path.firstSegment.point, path.lastSegment.point]
        });
      });

      // Move through each color group, then each point set for distance
      var drawIndex = 0; // Track the path index to insert paths to on the layer
      _.each(colorGroups, function(group){
        var lastPoint = new Point(0, 0); // Last point, start at the corner
        var lastPath = null; // The last path worked on for joining 0 dist paths

        while(group.length) {
          var c = paper.utils.closestPointInGroup(lastPoint, group);

          // First segment, or last segment?
          if (c.closestPointIndex === 0) { // First
            // Set last point to the end of the path
            lastPoint = group[c.id].points[1];
          } else { // last
            // Reverse the path direction, so its first point is now the last
             group[c.id].path.reverse();

            // Set last point to the start of the path (now the end)
            lastPoint = group[c.id].points[0];
          }

          // If the distance between the lastPoint and the next closest point is
          // 0, and our lastPoint is on a path, we can make this more efficient
          // by joining the two paths.
          if (c.dist === 0 && lastPath) {
            // Combine lastPath with this path (remove the remainder)
            lastPath.join(group[c.id].path);
          } else { // Non-zero distance, add as separate path
            // Insert the path to the next spot in the action layer.
            a.insertChild(drawIndex, group[c.id].path);
            lastPath = group[c.id].path;
          }

          group.splice(c.id, 1); // Remove it from the list of paths

          drawIndex++;
        }
      });
    },

    // Run an open linear segmented non-compound tracing path into the buffer
    runPath: function(path) {
      mode.run('up');
      var isDown = false;
      _.each(path.segments, function(seg){
        mode.run('move', {x: seg.point.x, y: seg.point.y});
        if (!isDown) {
          mode.run('down');
          isDown = true;
        }
      });


      // Extend the last point to account for brush bend
      if (robopaint.settings.strokeovershoot > 0) {
        var point = path.lastSegment.point;
        var m = robopaint.settings.strokeovershoot * 4;
        point = point.add(path.getTangentAt(path.length).multiply(m));
        mode.run('move', {x: point.x, y: point.y});
      }

      mode.run('up');
    },

    // Actually handle a fully setup action layer to be streamed into the buffer
    // in the path and segment order they're meant to be streamed.
    autoPaint: function(layer) {
      // Run through and delete any paths without color/tool information.
      _.each(_.extend([], layer.children), function(path){
        if (path.data.color === false) {
          path.remove();
        }
      });

      if (robopaint.settings.optimizepath) {
        paper.utils.travelSortLayer(layer);
      }

      var run = mode.run;
      // TODO: Pre-check to make sure the layer is fully ready, composed of only
      // completely open polygonal (linear) non-compound paths with no fill.

      // All paths on layer are expected to have data value object with:
      //  * data.color: media/toolName
      //  * data.name: name/id of the path
      //  * data.type: either "fill" or "stroke"

      var runColor;
      // Add a callback for begin so we know when things have kicked off, which
      // can definitely be later than expected if prefillbuffer is enabled.
      run('callbackname', 'autoPaintBegin');

      _.each(layer.children, function(path){
        // If the color doesn't match, be sure to wash & change it
        if (path.data.color !== runColor) {
          runColor = path.data.color;
          run(['wash', ['media', runColor]]);
        }

        var typeKey = 'stroke';
        if (path.data.type === "fill") {
          typeKey = 'fill';
        }

        // If it doesn't have a name, default to an empty string.
        if (typeof path.data.name === 'undefined') path.data.name = '';

        run('status', i18n.t('libs.auto' + typeKey, {id: path.data.name}));
        paper.utils.runPath(path);
      });

      // Wrap up
      run([
        'wash',
        'park',
        'up', // Ensure last command sent is clean, see evil-mad/robopaint#250
        ['status', i18n.t('libs.autocomplete')],
        ['callbackname', 'autoPaintComplete']
      ]);
    }
  };
};
