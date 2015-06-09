"use strict";
var debug = require("debug")("rho-on-steroids");
var _ = require("lodash");
var s = require("string");
var rho = require("rho");

function enhance(options) {
  debug("Extending rho...");

  // Copy original prototype to be sure that the original is not changed
  var InlineCompiler = function(opts) { rho.InlineCompiler.call(this, opts); };
  var inlineCompilerPrototype = _.merge({}, rho.InlineCompiler.prototype);
  InlineCompiler.prototype = inlineCompilerPrototype;

  var BlockCompiler = function(opts) { rho.BlockCompiler.call(this, opts); };
  var blockCompilerPrototype = _.merge({}, rho.BlockCompiler.prototype);
  blockCompilerPrototype.InlineCompiler = InlineCompiler;
  BlockCompiler.prototype = blockCompilerPrototype;

  options = normalize(options);

  // ENHANCE IMAGE
  InlineCompiler.prototype.tryImg = function(walk) {
    var self = this;
    if (!walk.at("![")) { return false; }
  // Try to find the ]
    walk.skip(2);
    var start = walk.position;
    var endAlt = walk.indexOf("]");
    if (endAlt === null) {
      this.out.push("![");
      return true;
    }
  // Collecting the text up to ] and matching further
    var text = walk.yieldUntil(endAlt);
    walk.skip();

  // Try to match image url
    if (!walk.at("(")) {
      nothingMatched();
      return true;
    }
    var endUrl = walk.indexOf(")");
    if (endUrl === null) {
      nothingMatched();
      return true;
    }
    walk.skip(1); // (
    var src = walk.yieldUntil(endUrl);
    walk.skip(1); // )

  // Try to match image type but it is not mandatory
    var pushClosingBracketAfterEmitting = false;
    var imageTypes = [];

    if (walk.at("{")) {
      walk.skip(1); // [
      var endType = walk.indexOf("}");
      if (endType === null) {
        pushClosingBracketAfterEmitting = true;
      } else {
        imageTypes = walk.yieldUntil(endType).split(",");
        walk.skip(); // ]
      }
    }

    this.emitImg(text, src, imageTypes);
    if (pushClosingBracketAfterEmitting) {
      this.out.push("{");
    }
    return true;
    // Nothing matched -- rolling back and processing text normally
    function nothingMatched() {
      walk.startFrom(start);
      self.out.push("![");
      return true;
    }
  };
  InlineCompiler.prototype.emitImg = function(alt, src, types) {
    var escapedAlt = s(alt).escapeHTML().s;
    var escapedTypesArr = _.map(types, function(type) { return s(type).trim().escapeHTML().s; });

    if (_.isFunction(options.renderImg)) {
      this.out.push(options.renderImg(escapedAlt, src, escapedTypesArr));
    } else {
      this.out.push(
        "<img src=\"" + src + "\" alt=\"" + escapedAlt + "\"" +
        " title=\"" + escapedAlt + "\"");

      if (escapedTypesArr.length > 0) {
        this.out.push(" class=\"" + escapedTypesArr.join(" ") + this.out.push("\""));
      }

      this.out.push(">");
    }
  };

  // ENHANCE A
  /* Links and images are resolved from supplied `options`. */

  InlineCompiler.prototype.emitLink = function(text, link, flags) {
    var escapedFlagsArr = _.map(flags, function(flag) { return s(flag).trim().escapeHTML().s; });
    var innerLinkHtml = new InlineCompiler(this.options).toHtml(text);

    if (_.isFunction(options.renderImg)) {
      this.out.push(options.renderA(innerLinkHtml, link, escapedFlagsArr));
    } else {
      this.out.push("<a href=\"" + link + "\">");
      this.out.push(innerLinkHtml);
      this.out.push("</a>");
    }
  };

  InlineCompiler.prototype.tryHeadlessLink = function(walk) {
    if (!walk.at("[[")) { return false; }
    walk.skip(2);
    var linkEnd = walk.indexOf("]]");
    // ]] not found, emitting
    if (linkEnd === null) {
      this.out.push("[[");
      return true;
    }
    var link = walk.yieldUntil(linkEnd);
    walk.skip(2);

    // Try to match flags but it is not mandatory
    var pushClosingBracketAfterEmitting = false;
    var flagsFound = [];

    if (walk.at("[")) {
      walk.skip(1); // [
      var endType = walk.indexOf("]");
      if (endType === null) {
        pushClosingBracketAfterEmitting = true;
      } else {
        flagsFound = walk.yieldUntil(endType).split(",");
        walk.skip(); // ]
      }
    }

    this.emitLink(link, link, flagsFound);
    if (pushClosingBracketAfterEmitting) {
      this.out.push("[");
    }
    return true;
  };

  InlineCompiler.prototype.tryLink = function(walk) {
    var self = this;

    if (!walk.at("[")) { return false; }
    // Try to find the ]
    walk.skip();
    var start = walk.position;
    var endText = walk.lookahead(function(w) {
      var nested = 0;
      var found = false;
      while (!found && w.hasCurrent()) {
        if (w.at("\\")) {
          w.skip(2);
        } else if (w.at("![")) {
          nested += 1;
          w.skip(2);
        } else if (w.at("]")) {
          if (nested === 0) {
            found = true;
          } else {
            nested -= 1;
            w.skip();
          }
        } else {
          w.skip();
        }
      }
      return found ? w.position : null;
    });
    if (endText === null) {
      this.out.push("[");
      return true;
    }
    // Collecting the text up to ] and matching further
    var text = walk.yieldUntil(endText);
    walk.skip();

    if (!walk.at("(")) {
      nothingMatched();
      return true;
    }
    var endHref = walk.indexOf(")");
    if (endHref === null) {
      nothingMatched();
      return false;
    }

    walk.skip(1); // (
    var href = walk.yieldUntil(endHref);
    walk.skip(1); // )

    // Try to match flags but it is not mandatory
    var pushClosingBracketAfterEmitting = false;
    var flagsFound = [];

    if (walk.at("{")) {
      walk.skip(1); // [
      var endFlags = walk.indexOf("}");
      if (endFlags === null) {
        pushClosingBracketAfterEmitting = true;
      } else {
        flagsFound = walk.yieldUntil(endFlags).split(",");
        walk.skip(); // ]
      }
    }

    this.emitLink(text, href, flagsFound);
    if (pushClosingBracketAfterEmitting) {
      this.out.push("{");
    }
    return true;

    // Nothing matched -- rolling back and processing text normally
    function nothingMatched() {
      walk.startFrom(start);
      self.out.push("[");
      return true;
    }
  };

  // CLEANUP UNUSED ORIGINAL METHODS
  delete inlineCompilerPrototype.tryInlineImg;
  delete inlineCompilerPrototype.tryRefImg;
  delete inlineCompilerPrototype.tryInlineLink;
  delete inlineCompilerPrototype.tryRefLink;

  var inlineEmitNormalOriginal = inlineCompilerPrototype.emitNormal;

  InlineCompiler.prototype.emitNormal = function(walk) {
    if (this.emitText(walk)) { return; }
    // if (this.tryInputText(walk)) return;
    var inlineEmitNormalOriginalBound = inlineEmitNormalOriginal.bind(this);
    inlineEmitNormalOriginalBound(walk);
  };

  return BlockCompiler;
}

function normalize(options) {
  var defaults = {
    renderImg: null,
    renderA: null
  };
  options = _.merge({}, defaults, options);

  return options;
}

module.exports = enhance;
