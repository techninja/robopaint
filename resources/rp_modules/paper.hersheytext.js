/*
 * @file exports a function for rendering Hersheytext onto a PaperScope Layer.
 */
/* globals _, window */

var hershey = window.hershey ? window.hershey : require('hersheytext');

// Render HersheyText to a PaperScope canvas
module.exports = function(paper) {
  var Point = paper.Point;
  var Group = paper.Group;
  var Path = paper.Path;
  var CompoundPath = paper.CompoundPath;
  var view = paper.view;

  var chars = new Group();

  paper.renderText = function(text, options) {
    // Mesh in option defaults
    options = _.extend({
      spaceWidth: 15,
      strokeWidth: 2,
      strokeColor: 'black',
      charSpacing: 3,
      lineHeight: 15,
      hCenter: 0,
      vCenter: 0,
      textAlign: 'left',
      rotation: 0
    }, options);

    if (options.layer) {
      options.layer.activate();
    }

    var t = hershey.renderTextArray(text, options);
    var caretPos = new Point(0, 50);

    chars.remove();
    chars = new Group(); // Hold output lines groups

    var lines = [new Group()]; // Hold chars in lines
    var cLine = 0;
    _.each(t, function(char, index){
      if (char.type === "space" || char.type === "newline") {
        caretPos.x+= options.spaceWidth;

        // Allow line wrap on space
        if (caretPos.x > options.wrapWidth || char.type === "newline") {
          caretPos.x = 0;
          caretPos.y += options.lineHeight;

          cLine++;
          lines.push(new Group());
        }
      } else {
        var data = {
          d: char.d,
          char: char.type,

          // Structure for paper.utils.autoPaint
          color: paper.utils.snapColorID(new paper.Color(options.strokeColor)),
          name: 'letter-' + char.type + ' - ' + index + '-' + cLine,
          type: 'stroke'
        };

        // Create the compound path as a group to retain subpath data.
        var c = new Group();
        lines[cLine].insertChild(0, c);

        // Use CompoundPath as a simple parser to get the subpaths, then add
        // them to our group and set the details in the subpath.
        var tmpCompound = new CompoundPath(char.d);
        _.each(tmpCompound.children, function(subpath){
          c.addChild(new Path({
            data: data,
            pathData: subpath.pathData,
            strokeWidth: options.strokeWidth,
            strokeColor: options.strokeColor
          }));
        });
        tmpCompound.remove();

        // Align to the top left as expected by the font system
        var b = c.bounds;
        c.pivot = new Point(0, 0);
        c.position = caretPos;

        // Move the caret to the next position based on width and char spacing
        caretPos.x += b.width + options.charSpacing;
      }
    });

    chars.addChildren(lines);
    chars.position = view.center.add(
      new Point(options.hCenter, options.vCenter)
    );
    chars.scale(options.scale);

    // Align the lines
    if (options.textAlign === 'center') {
      _.each(lines, function(line) {
        line.position.x = chars.position.x;
      });
    } else if (options.textAlign === 'right') {
      _.each(lines, function(line) {
        line.pivot = new Point(line.bounds.width, line.bounds.height/2);
        line.position.x = chars.bounds.width;
      });
    }

    // Rotation!
    chars.rotate(options.rotation);
  };
};
