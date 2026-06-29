// GENERIERT aus src/main/plugins/artifact/signCli*.ts — nicht von Hand editieren. Build: npm run build:signer
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to2, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to2, key) && key !== except)
        __defProp(to2, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to2;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/uri-js/dist/es5/uri.all.js
var require_uri_all = __commonJS({
  "node_modules/uri-js/dist/es5/uri.all.js"(exports2, module2) {
    (function(global, factory) {
      typeof exports2 === "object" && typeof module2 !== "undefined" ? factory(exports2) : typeof define === "function" && define.amd ? define(["exports"], factory) : factory(global.URI = global.URI || {});
    })(exports2, (function(exports3) {
      "use strict";
      function merge() {
        for (var _len = arguments.length, sets = Array(_len), _key = 0; _key < _len; _key++) {
          sets[_key] = arguments[_key];
        }
        if (sets.length > 1) {
          sets[0] = sets[0].slice(0, -1);
          var xl = sets.length - 1;
          for (var x = 1; x < xl; ++x) {
            sets[x] = sets[x].slice(1, -1);
          }
          sets[xl] = sets[xl].slice(1);
          return sets.join("");
        } else {
          return sets[0];
        }
      }
      function subexp(str) {
        return "(?:" + str + ")";
      }
      function typeOf(o) {
        return o === void 0 ? "undefined" : o === null ? "null" : Object.prototype.toString.call(o).split(" ").pop().split("]").shift().toLowerCase();
      }
      function toUpperCase(str) {
        return str.toUpperCase();
      }
      function toArray(obj) {
        return obj !== void 0 && obj !== null ? obj instanceof Array ? obj : typeof obj.length !== "number" || obj.split || obj.setInterval || obj.call ? [obj] : Array.prototype.slice.call(obj) : [];
      }
      function assign(target, source) {
        var obj = target;
        if (source) {
          for (var key in source) {
            obj[key] = source[key];
          }
        }
        return obj;
      }
      function buildExps(isIRI2) {
        var ALPHA$$ = "[A-Za-z]", CR$ = "[\\x0D]", DIGIT$$ = "[0-9]", DQUOTE$$ = "[\\x22]", HEXDIG$$2 = merge(DIGIT$$, "[A-Fa-f]"), LF$$ = "[\\x0A]", SP$$ = "[\\x20]", PCT_ENCODED$2 = subexp(subexp("%[EFef]" + HEXDIG$$2 + "%" + HEXDIG$$2 + HEXDIG$$2 + "%" + HEXDIG$$2 + HEXDIG$$2) + "|" + subexp("%[89A-Fa-f]" + HEXDIG$$2 + "%" + HEXDIG$$2 + HEXDIG$$2) + "|" + subexp("%" + HEXDIG$$2 + HEXDIG$$2)), GEN_DELIMS$$ = "[\\:\\/\\?\\#\\[\\]\\@]", SUB_DELIMS$$ = "[\\!\\$\\&\\'\\(\\)\\*\\+\\,\\;\\=]", RESERVED$$ = merge(GEN_DELIMS$$, SUB_DELIMS$$), UCSCHAR$$ = isIRI2 ? "[\\xA0-\\u200D\\u2010-\\u2029\\u202F-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF]" : "[]", IPRIVATE$$ = isIRI2 ? "[\\uE000-\\uF8FF]" : "[]", UNRESERVED$$2 = merge(ALPHA$$, DIGIT$$, "[\\-\\.\\_\\~]", UCSCHAR$$), SCHEME$ = subexp(ALPHA$$ + merge(ALPHA$$, DIGIT$$, "[\\+\\-\\.]") + "*"), USERINFO$ = subexp(subexp(PCT_ENCODED$2 + "|" + merge(UNRESERVED$$2, SUB_DELIMS$$, "[\\:]")) + "*"), DEC_OCTET$ = subexp(subexp("25[0-5]") + "|" + subexp("2[0-4]" + DIGIT$$) + "|" + subexp("1" + DIGIT$$ + DIGIT$$) + "|" + subexp("[1-9]" + DIGIT$$) + "|" + DIGIT$$), DEC_OCTET_RELAXED$ = subexp(subexp("25[0-5]") + "|" + subexp("2[0-4]" + DIGIT$$) + "|" + subexp("1" + DIGIT$$ + DIGIT$$) + "|" + subexp("0?[1-9]" + DIGIT$$) + "|0?0?" + DIGIT$$), IPV4ADDRESS$ = subexp(DEC_OCTET_RELAXED$ + "\\." + DEC_OCTET_RELAXED$ + "\\." + DEC_OCTET_RELAXED$ + "\\." + DEC_OCTET_RELAXED$), H16$ = subexp(HEXDIG$$2 + "{1,4}"), LS32$ = subexp(subexp(H16$ + "\\:" + H16$) + "|" + IPV4ADDRESS$), IPV6ADDRESS1$ = subexp(subexp(H16$ + "\\:") + "{6}" + LS32$), IPV6ADDRESS2$ = subexp("\\:\\:" + subexp(H16$ + "\\:") + "{5}" + LS32$), IPV6ADDRESS3$ = subexp(subexp(H16$) + "?\\:\\:" + subexp(H16$ + "\\:") + "{4}" + LS32$), IPV6ADDRESS4$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,1}" + H16$) + "?\\:\\:" + subexp(H16$ + "\\:") + "{3}" + LS32$), IPV6ADDRESS5$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,2}" + H16$) + "?\\:\\:" + subexp(H16$ + "\\:") + "{2}" + LS32$), IPV6ADDRESS6$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,3}" + H16$) + "?\\:\\:" + H16$ + "\\:" + LS32$), IPV6ADDRESS7$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,4}" + H16$) + "?\\:\\:" + LS32$), IPV6ADDRESS8$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,5}" + H16$) + "?\\:\\:" + H16$), IPV6ADDRESS9$ = subexp(subexp(subexp(H16$ + "\\:") + "{0,6}" + H16$) + "?\\:\\:"), IPV6ADDRESS$ = subexp([IPV6ADDRESS1$, IPV6ADDRESS2$, IPV6ADDRESS3$, IPV6ADDRESS4$, IPV6ADDRESS5$, IPV6ADDRESS6$, IPV6ADDRESS7$, IPV6ADDRESS8$, IPV6ADDRESS9$].join("|")), ZONEID$ = subexp(subexp(UNRESERVED$$2 + "|" + PCT_ENCODED$2) + "+"), IPV6ADDRZ$ = subexp(IPV6ADDRESS$ + "\\%25" + ZONEID$), IPV6ADDRZ_RELAXED$ = subexp(IPV6ADDRESS$ + subexp("\\%25|\\%(?!" + HEXDIG$$2 + "{2})") + ZONEID$), IPVFUTURE$ = subexp("[vV]" + HEXDIG$$2 + "+\\." + merge(UNRESERVED$$2, SUB_DELIMS$$, "[\\:]") + "+"), IP_LITERAL$ = subexp("\\[" + subexp(IPV6ADDRZ_RELAXED$ + "|" + IPV6ADDRESS$ + "|" + IPVFUTURE$) + "\\]"), REG_NAME$ = subexp(subexp(PCT_ENCODED$2 + "|" + merge(UNRESERVED$$2, SUB_DELIMS$$)) + "*"), HOST$ = subexp(IP_LITERAL$ + "|" + IPV4ADDRESS$ + "(?!" + REG_NAME$ + ")|" + REG_NAME$), PORT$ = subexp(DIGIT$$ + "*"), AUTHORITY$ = subexp(subexp(USERINFO$ + "@") + "?" + HOST$ + subexp("\\:" + PORT$) + "?"), PCHAR$ = subexp(PCT_ENCODED$2 + "|" + merge(UNRESERVED$$2, SUB_DELIMS$$, "[\\:\\@]")), SEGMENT$ = subexp(PCHAR$ + "*"), SEGMENT_NZ$ = subexp(PCHAR$ + "+"), SEGMENT_NZ_NC$ = subexp(subexp(PCT_ENCODED$2 + "|" + merge(UNRESERVED$$2, SUB_DELIMS$$, "[\\@]")) + "+"), PATH_ABEMPTY$ = subexp(subexp("\\/" + SEGMENT$) + "*"), PATH_ABSOLUTE$ = subexp("\\/" + subexp(SEGMENT_NZ$ + PATH_ABEMPTY$) + "?"), PATH_NOSCHEME$ = subexp(SEGMENT_NZ_NC$ + PATH_ABEMPTY$), PATH_ROOTLESS$ = subexp(SEGMENT_NZ$ + PATH_ABEMPTY$), PATH_EMPTY$ = "(?!" + PCHAR$ + ")", PATH$ = subexp(PATH_ABEMPTY$ + "|" + PATH_ABSOLUTE$ + "|" + PATH_NOSCHEME$ + "|" + PATH_ROOTLESS$ + "|" + PATH_EMPTY$), QUERY$ = subexp(subexp(PCHAR$ + "|" + merge("[\\/\\?]", IPRIVATE$$)) + "*"), FRAGMENT$ = subexp(subexp(PCHAR$ + "|[\\/\\?]") + "*"), HIER_PART$ = subexp(subexp("\\/\\/" + AUTHORITY$ + PATH_ABEMPTY$) + "|" + PATH_ABSOLUTE$ + "|" + PATH_ROOTLESS$ + "|" + PATH_EMPTY$), URI$ = subexp(SCHEME$ + "\\:" + HIER_PART$ + subexp("\\?" + QUERY$) + "?" + subexp("\\#" + FRAGMENT$) + "?"), RELATIVE_PART$ = subexp(subexp("\\/\\/" + AUTHORITY$ + PATH_ABEMPTY$) + "|" + PATH_ABSOLUTE$ + "|" + PATH_NOSCHEME$ + "|" + PATH_EMPTY$), RELATIVE$ = subexp(RELATIVE_PART$ + subexp("\\?" + QUERY$) + "?" + subexp("\\#" + FRAGMENT$) + "?"), URI_REFERENCE$ = subexp(URI$ + "|" + RELATIVE$), ABSOLUTE_URI$ = subexp(SCHEME$ + "\\:" + HIER_PART$ + subexp("\\?" + QUERY$) + "?"), GENERIC_REF$ = "^(" + SCHEME$ + ")\\:" + subexp(subexp("\\/\\/(" + subexp("(" + USERINFO$ + ")@") + "?(" + HOST$ + ")" + subexp("\\:(" + PORT$ + ")") + "?)") + "?(" + PATH_ABEMPTY$ + "|" + PATH_ABSOLUTE$ + "|" + PATH_ROOTLESS$ + "|" + PATH_EMPTY$ + ")") + subexp("\\?(" + QUERY$ + ")") + "?" + subexp("\\#(" + FRAGMENT$ + ")") + "?$", RELATIVE_REF$ = "^(){0}" + subexp(subexp("\\/\\/(" + subexp("(" + USERINFO$ + ")@") + "?(" + HOST$ + ")" + subexp("\\:(" + PORT$ + ")") + "?)") + "?(" + PATH_ABEMPTY$ + "|" + PATH_ABSOLUTE$ + "|" + PATH_NOSCHEME$ + "|" + PATH_EMPTY$ + ")") + subexp("\\?(" + QUERY$ + ")") + "?" + subexp("\\#(" + FRAGMENT$ + ")") + "?$", ABSOLUTE_REF$ = "^(" + SCHEME$ + ")\\:" + subexp(subexp("\\/\\/(" + subexp("(" + USERINFO$ + ")@") + "?(" + HOST$ + ")" + subexp("\\:(" + PORT$ + ")") + "?)") + "?(" + PATH_ABEMPTY$ + "|" + PATH_ABSOLUTE$ + "|" + PATH_ROOTLESS$ + "|" + PATH_EMPTY$ + ")") + subexp("\\?(" + QUERY$ + ")") + "?$", SAMEDOC_REF$ = "^" + subexp("\\#(" + FRAGMENT$ + ")") + "?$", AUTHORITY_REF$ = "^" + subexp("(" + USERINFO$ + ")@") + "?(" + HOST$ + ")" + subexp("\\:(" + PORT$ + ")") + "?$";
        return {
          NOT_SCHEME: new RegExp(merge("[^]", ALPHA$$, DIGIT$$, "[\\+\\-\\.]"), "g"),
          NOT_USERINFO: new RegExp(merge("[^\\%\\:]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
          NOT_HOST: new RegExp(merge("[^\\%\\[\\]\\:]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
          NOT_PATH: new RegExp(merge("[^\\%\\/\\:\\@]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
          NOT_PATH_NOSCHEME: new RegExp(merge("[^\\%\\/\\@]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
          NOT_QUERY: new RegExp(merge("[^\\%]", UNRESERVED$$2, SUB_DELIMS$$, "[\\:\\@\\/\\?]", IPRIVATE$$), "g"),
          NOT_FRAGMENT: new RegExp(merge("[^\\%]", UNRESERVED$$2, SUB_DELIMS$$, "[\\:\\@\\/\\?]"), "g"),
          ESCAPE: new RegExp(merge("[^]", UNRESERVED$$2, SUB_DELIMS$$), "g"),
          UNRESERVED: new RegExp(UNRESERVED$$2, "g"),
          OTHER_CHARS: new RegExp(merge("[^\\%]", UNRESERVED$$2, RESERVED$$), "g"),
          PCT_ENCODED: new RegExp(PCT_ENCODED$2, "g"),
          IPV4ADDRESS: new RegExp("^(" + IPV4ADDRESS$ + ")$"),
          IPV6ADDRESS: new RegExp("^\\[?(" + IPV6ADDRESS$ + ")" + subexp(subexp("\\%25|\\%(?!" + HEXDIG$$2 + "{2})") + "(" + ZONEID$ + ")") + "?\\]?$")
          //RFC 6874, with relaxed parsing rules
        };
      }
      var URI_PROTOCOL = buildExps(false);
      var IRI_PROTOCOL = buildExps(true);
      var slicedToArray = /* @__PURE__ */ (function() {
        function sliceIterator(arr, i) {
          var _arr = [];
          var _n2 = true;
          var _d = false;
          var _e2 = void 0;
          try {
            for (var _i2 = arr[Symbol.iterator](), _s2; !(_n2 = (_s2 = _i2.next()).done); _n2 = true) {
              _arr.push(_s2.value);
              if (i && _arr.length === i) break;
            }
          } catch (err) {
            _d = true;
            _e2 = err;
          } finally {
            try {
              if (!_n2 && _i2["return"]) _i2["return"]();
            } finally {
              if (_d) throw _e2;
            }
          }
          return _arr;
        }
        return function(arr, i) {
          if (Array.isArray(arr)) {
            return arr;
          } else if (Symbol.iterator in Object(arr)) {
            return sliceIterator(arr, i);
          } else {
            throw new TypeError("Invalid attempt to destructure non-iterable instance");
          }
        };
      })();
      var toConsumableArray = function(arr) {
        if (Array.isArray(arr)) {
          for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i];
          return arr2;
        } else {
          return Array.from(arr);
        }
      };
      var maxInt = 2147483647;
      var base = 36;
      var tMin = 1;
      var tMax = 26;
      var skew = 38;
      var damp = 700;
      var initialBias = 72;
      var initialN = 128;
      var delimiter = "-";
      var regexPunycode = /^xn--/;
      var regexNonASCII = /[^\0-\x7E]/;
      var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g;
      var errors = {
        "overflow": "Overflow: input needs wider integers to process",
        "not-basic": "Illegal input >= 0x80 (not a basic code point)",
        "invalid-input": "Invalid input"
      };
      var baseMinusTMin = base - tMin;
      var floor = Math.floor;
      var stringFromCharCode = String.fromCharCode;
      function error$1(type) {
        throw new RangeError(errors[type]);
      }
      function map(array, fn) {
        var result = [];
        var length = array.length;
        while (length--) {
          result[length] = fn(array[length]);
        }
        return result;
      }
      function mapDomain(string, fn) {
        var parts = string.split("@");
        var result = "";
        if (parts.length > 1) {
          result = parts[0] + "@";
          string = parts[1];
        }
        string = string.replace(regexSeparators, ".");
        var labels = string.split(".");
        var encoded = map(labels, fn).join(".");
        return result + encoded;
      }
      function ucs2decode(string) {
        var output = [];
        var counter = 0;
        var length = string.length;
        while (counter < length) {
          var value = string.charCodeAt(counter++);
          if (value >= 55296 && value <= 56319 && counter < length) {
            var extra = string.charCodeAt(counter++);
            if ((extra & 64512) == 56320) {
              output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
            } else {
              output.push(value);
              counter--;
            }
          } else {
            output.push(value);
          }
        }
        return output;
      }
      var ucs2encode = function ucs2encode2(array) {
        return String.fromCodePoint.apply(String, toConsumableArray(array));
      };
      var basicToDigit = function basicToDigit2(codePoint) {
        if (codePoint - 48 < 10) {
          return codePoint - 22;
        }
        if (codePoint - 65 < 26) {
          return codePoint - 65;
        }
        if (codePoint - 97 < 26) {
          return codePoint - 97;
        }
        return base;
      };
      var digitToBasic = function digitToBasic2(digit, flag) {
        return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
      };
      var adapt = function adapt2(delta, numPoints, firstTime) {
        var k2 = 0;
        delta = firstTime ? floor(delta / damp) : delta >> 1;
        delta += floor(delta / numPoints);
        for (
          ;
          /* no initialization */
          delta > baseMinusTMin * tMax >> 1;
          k2 += base
        ) {
          delta = floor(delta / baseMinusTMin);
        }
        return floor(k2 + (baseMinusTMin + 1) * delta / (delta + skew));
      };
      var decode = function decode2(input) {
        var output = [];
        var inputLength = input.length;
        var i = 0;
        var n = initialN;
        var bias = initialBias;
        var basic = input.lastIndexOf(delimiter);
        if (basic < 0) {
          basic = 0;
        }
        for (var j2 = 0; j2 < basic; ++j2) {
          if (input.charCodeAt(j2) >= 128) {
            error$1("not-basic");
          }
          output.push(input.charCodeAt(j2));
        }
        for (var index = basic > 0 ? basic + 1 : 0; index < inputLength; ) {
          var oldi = i;
          for (
            var w2 = 1, k2 = base;
            ;
            /* no condition */
            k2 += base
          ) {
            if (index >= inputLength) {
              error$1("invalid-input");
            }
            var digit = basicToDigit(input.charCodeAt(index++));
            if (digit >= base || digit > floor((maxInt - i) / w2)) {
              error$1("overflow");
            }
            i += digit * w2;
            var t = k2 <= bias ? tMin : k2 >= bias + tMax ? tMax : k2 - bias;
            if (digit < t) {
              break;
            }
            var baseMinusT = base - t;
            if (w2 > floor(maxInt / baseMinusT)) {
              error$1("overflow");
            }
            w2 *= baseMinusT;
          }
          var out = output.length + 1;
          bias = adapt(i - oldi, out, oldi == 0);
          if (floor(i / out) > maxInt - n) {
            error$1("overflow");
          }
          n += floor(i / out);
          i %= out;
          output.splice(i++, 0, n);
        }
        return String.fromCodePoint.apply(String, output);
      };
      var encode = function encode2(input) {
        var output = [];
        input = ucs2decode(input);
        var inputLength = input.length;
        var n = initialN;
        var delta = 0;
        var bias = initialBias;
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = void 0;
        try {
          for (var _iterator = input[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var _currentValue2 = _step.value;
            if (_currentValue2 < 128) {
              output.push(stringFromCharCode(_currentValue2));
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
        var basicLength = output.length;
        var handledCPCount = basicLength;
        if (basicLength) {
          output.push(delimiter);
        }
        while (handledCPCount < inputLength) {
          var m2 = maxInt;
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = void 0;
          try {
            for (var _iterator2 = input[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var currentValue = _step2.value;
              if (currentValue >= n && currentValue < m2) {
                m2 = currentValue;
              }
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }
          var handledCPCountPlusOne = handledCPCount + 1;
          if (m2 - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
            error$1("overflow");
          }
          delta += (m2 - n) * handledCPCountPlusOne;
          n = m2;
          var _iteratorNormalCompletion3 = true;
          var _didIteratorError3 = false;
          var _iteratorError3 = void 0;
          try {
            for (var _iterator3 = input[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
              var _currentValue = _step3.value;
              if (_currentValue < n && ++delta > maxInt) {
                error$1("overflow");
              }
              if (_currentValue == n) {
                var q2 = delta;
                for (
                  var k2 = base;
                  ;
                  /* no condition */
                  k2 += base
                ) {
                  var t = k2 <= bias ? tMin : k2 >= bias + tMax ? tMax : k2 - bias;
                  if (q2 < t) {
                    break;
                  }
                  var qMinusT = q2 - t;
                  var baseMinusT = base - t;
                  output.push(stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0)));
                  q2 = floor(qMinusT / baseMinusT);
                }
                output.push(stringFromCharCode(digitToBasic(q2, 0)));
                bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
                delta = 0;
                ++handledCPCount;
              }
            }
          } catch (err) {
            _didIteratorError3 = true;
            _iteratorError3 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion3 && _iterator3.return) {
                _iterator3.return();
              }
            } finally {
              if (_didIteratorError3) {
                throw _iteratorError3;
              }
            }
          }
          ++delta;
          ++n;
        }
        return output.join("");
      };
      var toUnicode = function toUnicode2(input) {
        return mapDomain(input, function(string) {
          return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
        });
      };
      var toASCII = function toASCII2(input) {
        return mapDomain(input, function(string) {
          return regexNonASCII.test(string) ? "xn--" + encode(string) : string;
        });
      };
      var punycode = {
        /**
         * A string representing the current Punycode.js version number.
         * @memberOf punycode
         * @type String
         */
        "version": "2.1.0",
        /**
         * An object of methods to convert from JavaScript's internal character
         * representation (UCS-2) to Unicode code points, and back.
         * @see <https://mathiasbynens.be/notes/javascript-encoding>
         * @memberOf punycode
         * @type Object
         */
        "ucs2": {
          "decode": ucs2decode,
          "encode": ucs2encode
        },
        "decode": decode,
        "encode": encode,
        "toASCII": toASCII,
        "toUnicode": toUnicode
      };
      var SCHEMES = {};
      function pctEncChar(chr) {
        var c = chr.charCodeAt(0);
        var e = void 0;
        if (c < 16) e = "%0" + c.toString(16).toUpperCase();
        else if (c < 128) e = "%" + c.toString(16).toUpperCase();
        else if (c < 2048) e = "%" + (c >> 6 | 192).toString(16).toUpperCase() + "%" + (c & 63 | 128).toString(16).toUpperCase();
        else e = "%" + (c >> 12 | 224).toString(16).toUpperCase() + "%" + (c >> 6 & 63 | 128).toString(16).toUpperCase() + "%" + (c & 63 | 128).toString(16).toUpperCase();
        return e;
      }
      function pctDecChars(str) {
        var newStr = "";
        var i = 0;
        var il = str.length;
        while (i < il) {
          var c = parseInt(str.substr(i + 1, 2), 16);
          if (c < 128) {
            newStr += String.fromCharCode(c);
            i += 3;
          } else if (c >= 194 && c < 224) {
            if (il - i >= 6) {
              var c2 = parseInt(str.substr(i + 4, 2), 16);
              newStr += String.fromCharCode((c & 31) << 6 | c2 & 63);
            } else {
              newStr += str.substr(i, 6);
            }
            i += 6;
          } else if (c >= 224) {
            if (il - i >= 9) {
              var _c = parseInt(str.substr(i + 4, 2), 16);
              var c3 = parseInt(str.substr(i + 7, 2), 16);
              newStr += String.fromCharCode((c & 15) << 12 | (_c & 63) << 6 | c3 & 63);
            } else {
              newStr += str.substr(i, 9);
            }
            i += 9;
          } else {
            newStr += str.substr(i, 3);
            i += 3;
          }
        }
        return newStr;
      }
      function _normalizeComponentEncoding(components, protocol) {
        function decodeUnreserved2(str) {
          var decStr = pctDecChars(str);
          return !decStr.match(protocol.UNRESERVED) ? str : decStr;
        }
        if (components.scheme) components.scheme = String(components.scheme).replace(protocol.PCT_ENCODED, decodeUnreserved2).toLowerCase().replace(protocol.NOT_SCHEME, "");
        if (components.userinfo !== void 0) components.userinfo = String(components.userinfo).replace(protocol.PCT_ENCODED, decodeUnreserved2).replace(protocol.NOT_USERINFO, pctEncChar).replace(protocol.PCT_ENCODED, toUpperCase);
        if (components.host !== void 0) components.host = String(components.host).replace(protocol.PCT_ENCODED, decodeUnreserved2).toLowerCase().replace(protocol.NOT_HOST, pctEncChar).replace(protocol.PCT_ENCODED, toUpperCase);
        if (components.path !== void 0) components.path = String(components.path).replace(protocol.PCT_ENCODED, decodeUnreserved2).replace(components.scheme ? protocol.NOT_PATH : protocol.NOT_PATH_NOSCHEME, pctEncChar).replace(protocol.PCT_ENCODED, toUpperCase);
        if (components.query !== void 0) components.query = String(components.query).replace(protocol.PCT_ENCODED, decodeUnreserved2).replace(protocol.NOT_QUERY, pctEncChar).replace(protocol.PCT_ENCODED, toUpperCase);
        if (components.fragment !== void 0) components.fragment = String(components.fragment).replace(protocol.PCT_ENCODED, decodeUnreserved2).replace(protocol.NOT_FRAGMENT, pctEncChar).replace(protocol.PCT_ENCODED, toUpperCase);
        return components;
      }
      function _stripLeadingZeros(str) {
        return str.replace(/^0*(.*)/, "$1") || "0";
      }
      function _normalizeIPv4(host, protocol) {
        var matches = host.match(protocol.IPV4ADDRESS) || [];
        var _matches = slicedToArray(matches, 2), address = _matches[1];
        if (address) {
          return address.split(".").map(_stripLeadingZeros).join(".");
        } else {
          return host;
        }
      }
      function _normalizeIPv6(host, protocol) {
        var matches = host.match(protocol.IPV6ADDRESS) || [];
        var _matches2 = slicedToArray(matches, 3), address = _matches2[1], zone = _matches2[2];
        if (address) {
          var _address$toLowerCase$ = address.toLowerCase().split("::").reverse(), _address$toLowerCase$2 = slicedToArray(_address$toLowerCase$, 2), last = _address$toLowerCase$2[0], first = _address$toLowerCase$2[1];
          var firstFields = first ? first.split(":").map(_stripLeadingZeros) : [];
          var lastFields = last.split(":").map(_stripLeadingZeros);
          var isLastFieldIPv4Address = protocol.IPV4ADDRESS.test(lastFields[lastFields.length - 1]);
          var fieldCount = isLastFieldIPv4Address ? 7 : 8;
          var lastFieldsStart = lastFields.length - fieldCount;
          var fields = Array(fieldCount);
          for (var x = 0; x < fieldCount; ++x) {
            fields[x] = firstFields[x] || lastFields[lastFieldsStart + x] || "";
          }
          if (isLastFieldIPv4Address) {
            fields[fieldCount - 1] = _normalizeIPv4(fields[fieldCount - 1], protocol);
          }
          var allZeroFields = fields.reduce(function(acc, field, index) {
            if (!field || field === "0") {
              var lastLongest = acc[acc.length - 1];
              if (lastLongest && lastLongest.index + lastLongest.length === index) {
                lastLongest.length++;
              } else {
                acc.push({ index, length: 1 });
              }
            }
            return acc;
          }, []);
          var longestZeroFields = allZeroFields.sort(function(a, b2) {
            return b2.length - a.length;
          })[0];
          var newHost = void 0;
          if (longestZeroFields && longestZeroFields.length > 1) {
            var newFirst = fields.slice(0, longestZeroFields.index);
            var newLast = fields.slice(longestZeroFields.index + longestZeroFields.length);
            newHost = newFirst.join(":") + "::" + newLast.join(":");
          } else {
            newHost = fields.join(":");
          }
          if (zone) {
            newHost += "%" + zone;
          }
          return newHost;
        } else {
          return host;
        }
      }
      var URI_PARSE = /^(?:([^:\/?#]+):)?(?:\/\/((?:([^\/?#@]*)@)?(\[[^\/?#\]]+\]|[^\/?#:]*)(?:\:(\d*))?))?([^?#]*)(?:\?([^#]*))?(?:#((?:.|\n|\r)*))?/i;
      var NO_MATCH_IS_UNDEFINED = "".match(/(){0}/)[1] === void 0;
      function parse(uriString) {
        var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
        var components = {};
        var protocol = options.iri !== false ? IRI_PROTOCOL : URI_PROTOCOL;
        if (options.reference === "suffix") uriString = (options.scheme ? options.scheme + ":" : "") + "//" + uriString;
        var matches = uriString.match(URI_PARSE);
        if (matches) {
          if (NO_MATCH_IS_UNDEFINED) {
            components.scheme = matches[1];
            components.userinfo = matches[3];
            components.host = matches[4];
            components.port = parseInt(matches[5], 10);
            components.path = matches[6] || "";
            components.query = matches[7];
            components.fragment = matches[8];
            if (isNaN(components.port)) {
              components.port = matches[5];
            }
          } else {
            components.scheme = matches[1] || void 0;
            components.userinfo = uriString.indexOf("@") !== -1 ? matches[3] : void 0;
            components.host = uriString.indexOf("//") !== -1 ? matches[4] : void 0;
            components.port = parseInt(matches[5], 10);
            components.path = matches[6] || "";
            components.query = uriString.indexOf("?") !== -1 ? matches[7] : void 0;
            components.fragment = uriString.indexOf("#") !== -1 ? matches[8] : void 0;
            if (isNaN(components.port)) {
              components.port = uriString.match(/\/\/(?:.|\n)*\:(?:\/|\?|\#|$)/) ? matches[4] : void 0;
            }
          }
          if (components.host) {
            components.host = _normalizeIPv6(_normalizeIPv4(components.host, protocol), protocol);
          }
          if (components.scheme === void 0 && components.userinfo === void 0 && components.host === void 0 && components.port === void 0 && !components.path && components.query === void 0) {
            components.reference = "same-document";
          } else if (components.scheme === void 0) {
            components.reference = "relative";
          } else if (components.fragment === void 0) {
            components.reference = "absolute";
          } else {
            components.reference = "uri";
          }
          if (options.reference && options.reference !== "suffix" && options.reference !== components.reference) {
            components.error = components.error || "URI is not a " + options.reference + " reference.";
          }
          var schemeHandler = SCHEMES[(options.scheme || components.scheme || "").toLowerCase()];
          if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
            if (components.host && (options.domainHost || schemeHandler && schemeHandler.domainHost)) {
              try {
                components.host = punycode.toASCII(components.host.replace(protocol.PCT_ENCODED, pctDecChars).toLowerCase());
              } catch (e) {
                components.error = components.error || "Host's domain name can not be converted to ASCII via punycode: " + e;
              }
            }
            _normalizeComponentEncoding(components, URI_PROTOCOL);
          } else {
            _normalizeComponentEncoding(components, protocol);
          }
          if (schemeHandler && schemeHandler.parse) {
            schemeHandler.parse(components, options);
          }
        } else {
          components.error = components.error || "URI can not be parsed.";
        }
        return components;
      }
      function _recomposeAuthority(components, options) {
        var protocol = options.iri !== false ? IRI_PROTOCOL : URI_PROTOCOL;
        var uriTokens = [];
        if (components.userinfo !== void 0) {
          uriTokens.push(components.userinfo);
          uriTokens.push("@");
        }
        if (components.host !== void 0) {
          uriTokens.push(_normalizeIPv6(_normalizeIPv4(String(components.host), protocol), protocol).replace(protocol.IPV6ADDRESS, function(_2, $1, $2) {
            return "[" + $1 + ($2 ? "%25" + $2 : "") + "]";
          }));
        }
        if (typeof components.port === "number" || typeof components.port === "string") {
          uriTokens.push(":");
          uriTokens.push(String(components.port));
        }
        return uriTokens.length ? uriTokens.join("") : void 0;
      }
      var RDS1 = /^\.\.?\//;
      var RDS2 = /^\/\.(\/|$)/;
      var RDS3 = /^\/\.\.(\/|$)/;
      var RDS5 = /^\/?(?:.|\n)*?(?=\/|$)/;
      function removeDotSegments(input) {
        var output = [];
        while (input.length) {
          if (input.match(RDS1)) {
            input = input.replace(RDS1, "");
          } else if (input.match(RDS2)) {
            input = input.replace(RDS2, "/");
          } else if (input.match(RDS3)) {
            input = input.replace(RDS3, "/");
            output.pop();
          } else if (input === "." || input === "..") {
            input = "";
          } else {
            var im = input.match(RDS5);
            if (im) {
              var s3 = im[0];
              input = input.slice(s3.length);
              output.push(s3);
            } else {
              throw new Error("Unexpected dot segment condition");
            }
          }
        }
        return output.join("");
      }
      function serialize(components) {
        var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
        var protocol = options.iri ? IRI_PROTOCOL : URI_PROTOCOL;
        var uriTokens = [];
        var schemeHandler = SCHEMES[(options.scheme || components.scheme || "").toLowerCase()];
        if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(components, options);
        if (components.host) {
          if (protocol.IPV6ADDRESS.test(components.host)) {
          } else if (options.domainHost || schemeHandler && schemeHandler.domainHost) {
            try {
              components.host = !options.iri ? punycode.toASCII(components.host.replace(protocol.PCT_ENCODED, pctDecChars).toLowerCase()) : punycode.toUnicode(components.host);
            } catch (e) {
              components.error = components.error || "Host's domain name can not be converted to " + (!options.iri ? "ASCII" : "Unicode") + " via punycode: " + e;
            }
          }
        }
        _normalizeComponentEncoding(components, protocol);
        if (options.reference !== "suffix" && components.scheme) {
          uriTokens.push(components.scheme);
          uriTokens.push(":");
        }
        var authority = _recomposeAuthority(components, options);
        if (authority !== void 0) {
          if (options.reference !== "suffix") {
            uriTokens.push("//");
          }
          uriTokens.push(authority);
          if (components.path && components.path.charAt(0) !== "/") {
            uriTokens.push("/");
          }
        }
        if (components.path !== void 0) {
          var s3 = components.path;
          if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
            s3 = removeDotSegments(s3);
          }
          if (authority === void 0) {
            s3 = s3.replace(/^\/\//, "/%2F");
          }
          uriTokens.push(s3);
        }
        if (components.query !== void 0) {
          uriTokens.push("?");
          uriTokens.push(components.query);
        }
        if (components.fragment !== void 0) {
          uriTokens.push("#");
          uriTokens.push(components.fragment);
        }
        return uriTokens.join("");
      }
      function resolveComponents(base2, relative2) {
        var options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
        var skipNormalization = arguments[3];
        var target = {};
        if (!skipNormalization) {
          base2 = parse(serialize(base2, options), options);
          relative2 = parse(serialize(relative2, options), options);
        }
        options = options || {};
        if (!options.tolerant && relative2.scheme) {
          target.scheme = relative2.scheme;
          target.userinfo = relative2.userinfo;
          target.host = relative2.host;
          target.port = relative2.port;
          target.path = removeDotSegments(relative2.path || "");
          target.query = relative2.query;
        } else {
          if (relative2.userinfo !== void 0 || relative2.host !== void 0 || relative2.port !== void 0) {
            target.userinfo = relative2.userinfo;
            target.host = relative2.host;
            target.port = relative2.port;
            target.path = removeDotSegments(relative2.path || "");
            target.query = relative2.query;
          } else {
            if (!relative2.path) {
              target.path = base2.path;
              if (relative2.query !== void 0) {
                target.query = relative2.query;
              } else {
                target.query = base2.query;
              }
            } else {
              if (relative2.path.charAt(0) === "/") {
                target.path = removeDotSegments(relative2.path);
              } else {
                if ((base2.userinfo !== void 0 || base2.host !== void 0 || base2.port !== void 0) && !base2.path) {
                  target.path = "/" + relative2.path;
                } else if (!base2.path) {
                  target.path = relative2.path;
                } else {
                  target.path = base2.path.slice(0, base2.path.lastIndexOf("/") + 1) + relative2.path;
                }
                target.path = removeDotSegments(target.path);
              }
              target.query = relative2.query;
            }
            target.userinfo = base2.userinfo;
            target.host = base2.host;
            target.port = base2.port;
          }
          target.scheme = base2.scheme;
        }
        target.fragment = relative2.fragment;
        return target;
      }
      function resolve2(baseURI, relativeURI, options) {
        var schemelessOptions = assign({ scheme: "null" }, options);
        return serialize(resolveComponents(parse(baseURI, schemelessOptions), parse(relativeURI, schemelessOptions), schemelessOptions, true), schemelessOptions);
      }
      function normalize(uri, options) {
        if (typeof uri === "string") {
          uri = serialize(parse(uri, options), options);
        } else if (typeOf(uri) === "object") {
          uri = parse(serialize(uri, options), options);
        }
        return uri;
      }
      function equal(uriA, uriB, options) {
        if (typeof uriA === "string") {
          uriA = serialize(parse(uriA, options), options);
        } else if (typeOf(uriA) === "object") {
          uriA = serialize(uriA, options);
        }
        if (typeof uriB === "string") {
          uriB = serialize(parse(uriB, options), options);
        } else if (typeOf(uriB) === "object") {
          uriB = serialize(uriB, options);
        }
        return uriA === uriB;
      }
      function escapeComponent(str, options) {
        return str && str.toString().replace(!options || !options.iri ? URI_PROTOCOL.ESCAPE : IRI_PROTOCOL.ESCAPE, pctEncChar);
      }
      function unescapeComponent(str, options) {
        return str && str.toString().replace(!options || !options.iri ? URI_PROTOCOL.PCT_ENCODED : IRI_PROTOCOL.PCT_ENCODED, pctDecChars);
      }
      var handler = {
        scheme: "http",
        domainHost: true,
        parse: function parse2(components, options) {
          if (!components.host) {
            components.error = components.error || "HTTP URIs must have a host.";
          }
          return components;
        },
        serialize: function serialize2(components, options) {
          var secure = String(components.scheme).toLowerCase() === "https";
          if (components.port === (secure ? 443 : 80) || components.port === "") {
            components.port = void 0;
          }
          if (!components.path) {
            components.path = "/";
          }
          return components;
        }
      };
      var handler$1 = {
        scheme: "https",
        domainHost: handler.domainHost,
        parse: handler.parse,
        serialize: handler.serialize
      };
      function isSecure(wsComponents) {
        return typeof wsComponents.secure === "boolean" ? wsComponents.secure : String(wsComponents.scheme).toLowerCase() === "wss";
      }
      var handler$2 = {
        scheme: "ws",
        domainHost: true,
        parse: function parse2(components, options) {
          var wsComponents = components;
          wsComponents.secure = isSecure(wsComponents);
          wsComponents.resourceName = (wsComponents.path || "/") + (wsComponents.query ? "?" + wsComponents.query : "");
          wsComponents.path = void 0;
          wsComponents.query = void 0;
          return wsComponents;
        },
        serialize: function serialize2(wsComponents, options) {
          if (wsComponents.port === (isSecure(wsComponents) ? 443 : 80) || wsComponents.port === "") {
            wsComponents.port = void 0;
          }
          if (typeof wsComponents.secure === "boolean") {
            wsComponents.scheme = wsComponents.secure ? "wss" : "ws";
            wsComponents.secure = void 0;
          }
          if (wsComponents.resourceName) {
            var _wsComponents$resourc = wsComponents.resourceName.split("?"), _wsComponents$resourc2 = slicedToArray(_wsComponents$resourc, 2), path = _wsComponents$resourc2[0], query = _wsComponents$resourc2[1];
            wsComponents.path = path && path !== "/" ? path : void 0;
            wsComponents.query = query;
            wsComponents.resourceName = void 0;
          }
          wsComponents.fragment = void 0;
          return wsComponents;
        }
      };
      var handler$3 = {
        scheme: "wss",
        domainHost: handler$2.domainHost,
        parse: handler$2.parse,
        serialize: handler$2.serialize
      };
      var O2 = {};
      var isIRI = true;
      var UNRESERVED$$ = "[A-Za-z0-9\\-\\.\\_\\~" + (isIRI ? "\\xA0-\\u200D\\u2010-\\u2029\\u202F-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF" : "") + "]";
      var HEXDIG$$ = "[0-9A-Fa-f]";
      var PCT_ENCODED$ = subexp(subexp("%[EFef]" + HEXDIG$$ + "%" + HEXDIG$$ + HEXDIG$$ + "%" + HEXDIG$$ + HEXDIG$$) + "|" + subexp("%[89A-Fa-f]" + HEXDIG$$ + "%" + HEXDIG$$ + HEXDIG$$) + "|" + subexp("%" + HEXDIG$$ + HEXDIG$$));
      var ATEXT$$ = "[A-Za-z0-9\\!\\$\\%\\'\\*\\+\\-\\^\\_\\`\\{\\|\\}\\~]";
      var QTEXT$$ = "[\\!\\$\\%\\'\\(\\)\\*\\+\\,\\-\\.0-9\\<\\>A-Z\\x5E-\\x7E]";
      var VCHAR$$ = merge(QTEXT$$, '[\\"\\\\]');
      var SOME_DELIMS$$ = "[\\!\\$\\'\\(\\)\\*\\+\\,\\;\\:\\@]";
      var UNRESERVED = new RegExp(UNRESERVED$$, "g");
      var PCT_ENCODED = new RegExp(PCT_ENCODED$, "g");
      var NOT_LOCAL_PART = new RegExp(merge("[^]", ATEXT$$, "[\\.]", '[\\"]', VCHAR$$), "g");
      var NOT_HFNAME = new RegExp(merge("[^]", UNRESERVED$$, SOME_DELIMS$$), "g");
      var NOT_HFVALUE = NOT_HFNAME;
      function decodeUnreserved(str) {
        var decStr = pctDecChars(str);
        return !decStr.match(UNRESERVED) ? str : decStr;
      }
      var handler$4 = {
        scheme: "mailto",
        parse: function parse$$1(components, options) {
          var mailtoComponents = components;
          var to2 = mailtoComponents.to = mailtoComponents.path ? mailtoComponents.path.split(",") : [];
          mailtoComponents.path = void 0;
          if (mailtoComponents.query) {
            var unknownHeaders = false;
            var headers = {};
            var hfields = mailtoComponents.query.split("&");
            for (var x = 0, xl = hfields.length; x < xl; ++x) {
              var hfield = hfields[x].split("=");
              switch (hfield[0]) {
                case "to":
                  var toAddrs = hfield[1].split(",");
                  for (var _x = 0, _xl = toAddrs.length; _x < _xl; ++_x) {
                    to2.push(toAddrs[_x]);
                  }
                  break;
                case "subject":
                  mailtoComponents.subject = unescapeComponent(hfield[1], options);
                  break;
                case "body":
                  mailtoComponents.body = unescapeComponent(hfield[1], options);
                  break;
                default:
                  unknownHeaders = true;
                  headers[unescapeComponent(hfield[0], options)] = unescapeComponent(hfield[1], options);
                  break;
              }
            }
            if (unknownHeaders) mailtoComponents.headers = headers;
          }
          mailtoComponents.query = void 0;
          for (var _x2 = 0, _xl2 = to2.length; _x2 < _xl2; ++_x2) {
            var addr = to2[_x2].split("@");
            addr[0] = unescapeComponent(addr[0]);
            if (!options.unicodeSupport) {
              try {
                addr[1] = punycode.toASCII(unescapeComponent(addr[1], options).toLowerCase());
              } catch (e) {
                mailtoComponents.error = mailtoComponents.error || "Email address's domain name can not be converted to ASCII via punycode: " + e;
              }
            } else {
              addr[1] = unescapeComponent(addr[1], options).toLowerCase();
            }
            to2[_x2] = addr.join("@");
          }
          return mailtoComponents;
        },
        serialize: function serialize$$1(mailtoComponents, options) {
          var components = mailtoComponents;
          var to2 = toArray(mailtoComponents.to);
          if (to2) {
            for (var x = 0, xl = to2.length; x < xl; ++x) {
              var toAddr = String(to2[x]);
              var atIdx = toAddr.lastIndexOf("@");
              var localPart = toAddr.slice(0, atIdx).replace(PCT_ENCODED, decodeUnreserved).replace(PCT_ENCODED, toUpperCase).replace(NOT_LOCAL_PART, pctEncChar);
              var domain = toAddr.slice(atIdx + 1);
              try {
                domain = !options.iri ? punycode.toASCII(unescapeComponent(domain, options).toLowerCase()) : punycode.toUnicode(domain);
              } catch (e) {
                components.error = components.error || "Email address's domain name can not be converted to " + (!options.iri ? "ASCII" : "Unicode") + " via punycode: " + e;
              }
              to2[x] = localPart + "@" + domain;
            }
            components.path = to2.join(",");
          }
          var headers = mailtoComponents.headers = mailtoComponents.headers || {};
          if (mailtoComponents.subject) headers["subject"] = mailtoComponents.subject;
          if (mailtoComponents.body) headers["body"] = mailtoComponents.body;
          var fields = [];
          for (var name in headers) {
            if (headers[name] !== O2[name]) {
              fields.push(name.replace(PCT_ENCODED, decodeUnreserved).replace(PCT_ENCODED, toUpperCase).replace(NOT_HFNAME, pctEncChar) + "=" + headers[name].replace(PCT_ENCODED, decodeUnreserved).replace(PCT_ENCODED, toUpperCase).replace(NOT_HFVALUE, pctEncChar));
            }
          }
          if (fields.length) {
            components.query = fields.join("&");
          }
          return components;
        }
      };
      var URN_PARSE = /^([^\:]+)\:(.*)/;
      var handler$5 = {
        scheme: "urn",
        parse: function parse$$1(components, options) {
          var matches = components.path && components.path.match(URN_PARSE);
          var urnComponents = components;
          if (matches) {
            var scheme = options.scheme || urnComponents.scheme || "urn";
            var nid = matches[1].toLowerCase();
            var nss = matches[2];
            var urnScheme = scheme + ":" + (options.nid || nid);
            var schemeHandler = SCHEMES[urnScheme];
            urnComponents.nid = nid;
            urnComponents.nss = nss;
            urnComponents.path = void 0;
            if (schemeHandler) {
              urnComponents = schemeHandler.parse(urnComponents, options);
            }
          } else {
            urnComponents.error = urnComponents.error || "URN can not be parsed.";
          }
          return urnComponents;
        },
        serialize: function serialize$$1(urnComponents, options) {
          var scheme = options.scheme || urnComponents.scheme || "urn";
          var nid = urnComponents.nid;
          var urnScheme = scheme + ":" + (options.nid || nid);
          var schemeHandler = SCHEMES[urnScheme];
          if (schemeHandler) {
            urnComponents = schemeHandler.serialize(urnComponents, options);
          }
          var uriComponents = urnComponents;
          var nss = urnComponents.nss;
          uriComponents.path = (nid || options.nid) + ":" + nss;
          return uriComponents;
        }
      };
      var UUID = /^[0-9A-Fa-f]{8}(?:\-[0-9A-Fa-f]{4}){3}\-[0-9A-Fa-f]{12}$/;
      var handler$6 = {
        scheme: "urn:uuid",
        parse: function parse2(urnComponents, options) {
          var uuidComponents = urnComponents;
          uuidComponents.uuid = uuidComponents.nss;
          uuidComponents.nss = void 0;
          if (!options.tolerant && (!uuidComponents.uuid || !uuidComponents.uuid.match(UUID))) {
            uuidComponents.error = uuidComponents.error || "UUID is not valid.";
          }
          return uuidComponents;
        },
        serialize: function serialize2(uuidComponents, options) {
          var urnComponents = uuidComponents;
          urnComponents.nss = (uuidComponents.uuid || "").toLowerCase();
          return urnComponents;
        }
      };
      SCHEMES[handler.scheme] = handler;
      SCHEMES[handler$1.scheme] = handler$1;
      SCHEMES[handler$2.scheme] = handler$2;
      SCHEMES[handler$3.scheme] = handler$3;
      SCHEMES[handler$4.scheme] = handler$4;
      SCHEMES[handler$5.scheme] = handler$5;
      SCHEMES[handler$6.scheme] = handler$6;
      exports3.SCHEMES = SCHEMES;
      exports3.pctEncChar = pctEncChar;
      exports3.pctDecChars = pctDecChars;
      exports3.parse = parse;
      exports3.removeDotSegments = removeDotSegments;
      exports3.serialize = serialize;
      exports3.resolveComponents = resolveComponents;
      exports3.resolve = resolve2;
      exports3.normalize = normalize;
      exports3.equal = equal;
      exports3.escapeComponent = escapeComponent;
      exports3.unescapeComponent = unescapeComponent;
      Object.defineProperty(exports3, "__esModule", { value: true });
    }));
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports2, module2) {
    "use strict";
    module2.exports = function equal(a, b2) {
      if (a === b2) return true;
      if (a && b2 && typeof a == "object" && typeof b2 == "object") {
        if (a.constructor !== b2.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b2.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b2[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b2.source && a.flags === b2.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b2.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b2.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b2).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b2, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b2[key])) return false;
        }
        return true;
      }
      return a !== a && b2 !== b2;
    };
  }
});

// node_modules/ajv/lib/compile/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/lib/compile/ucs2length.js"(exports2, module2) {
    "use strict";
    module2.exports = function ucs2length(str) {
      var length = 0, len = str.length, pos = 0, value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) == 56320) pos++;
        }
      }
      return length;
    };
  }
});

// node_modules/ajv/lib/compile/util.js
var require_util = __commonJS({
  "node_modules/ajv/lib/compile/util.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      copy,
      checkDataType,
      checkDataTypes,
      coerceToTypes,
      toHash,
      getProperty,
      escapeQuotes,
      equal: require_fast_deep_equal(),
      ucs2length: require_ucs2length(),
      varOccurences,
      varReplace,
      schemaHasRules,
      schemaHasRulesExcept,
      schemaUnknownRules,
      toQuotedString,
      getPathExpr,
      getPath,
      getData,
      unescapeFragment,
      unescapeJsonPointer,
      escapeFragment,
      escapeJsonPointer
    };
    function copy(o, to2) {
      to2 = to2 || {};
      for (var key in o) to2[key] = o[key];
      return to2;
    }
    function checkDataType(dataType, data, strictNumbers, negate) {
      var EQUAL = negate ? " !== " : " === ", AND = negate ? " || " : " && ", OK = negate ? "!" : "", NOT = negate ? "" : "!";
      switch (dataType) {
        case "null":
          return data + EQUAL + "null";
        case "array":
          return OK + "Array.isArray(" + data + ")";
        case "object":
          return "(" + OK + data + AND + "typeof " + data + EQUAL + '"object"' + AND + NOT + "Array.isArray(" + data + "))";
        case "integer":
          return "(typeof " + data + EQUAL + '"number"' + AND + NOT + "(" + data + " % 1)" + AND + data + EQUAL + data + (strictNumbers ? AND + OK + "isFinite(" + data + ")" : "") + ")";
        case "number":
          return "(typeof " + data + EQUAL + '"' + dataType + '"' + (strictNumbers ? AND + OK + "isFinite(" + data + ")" : "") + ")";
        default:
          return "typeof " + data + EQUAL + '"' + dataType + '"';
      }
    }
    function checkDataTypes(dataTypes, data, strictNumbers) {
      switch (dataTypes.length) {
        case 1:
          return checkDataType(dataTypes[0], data, strictNumbers, true);
        default:
          var code = "";
          var types = toHash(dataTypes);
          if (types.array && types.object) {
            code = types.null ? "(" : "(!" + data + " || ";
            code += "typeof " + data + ' !== "object")';
            delete types.null;
            delete types.array;
            delete types.object;
          }
          if (types.number) delete types.integer;
          for (var t in types)
            code += (code ? " && " : "") + checkDataType(t, data, strictNumbers, true);
          return code;
      }
    }
    var COERCE_TO_TYPES = toHash(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(optionCoerceTypes, dataTypes) {
      if (Array.isArray(dataTypes)) {
        var types = [];
        for (var i = 0; i < dataTypes.length; i++) {
          var t = dataTypes[i];
          if (COERCE_TO_TYPES[t]) types[types.length] = t;
          else if (optionCoerceTypes === "array" && t === "array") types[types.length] = t;
        }
        if (types.length) return types;
      } else if (COERCE_TO_TYPES[dataTypes]) {
        return [dataTypes];
      } else if (optionCoerceTypes === "array" && dataTypes === "array") {
        return ["array"];
      }
    }
    function toHash(arr) {
      var hash = {};
      for (var i = 0; i < arr.length; i++) hash[arr[i]] = true;
      return hash;
    }
    var IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var SINGLE_QUOTE = /'|\\/g;
    function getProperty(key) {
      return typeof key == "number" ? "[" + key + "]" : IDENTIFIER.test(key) ? "." + key : "['" + escapeQuotes(key) + "']";
    }
    function escapeQuotes(str) {
      return str.replace(SINGLE_QUOTE, "\\$&").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\f/g, "\\f").replace(/\t/g, "\\t");
    }
    function varOccurences(str, dataVar) {
      dataVar += "[^0-9]";
      var matches = str.match(new RegExp(dataVar, "g"));
      return matches ? matches.length : 0;
    }
    function varReplace(str, dataVar, expr) {
      dataVar += "([^0-9])";
      expr = expr.replace(/\$/g, "$$$$");
      return str.replace(new RegExp(dataVar, "g"), expr + "$1");
    }
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean") return !schema;
      for (var key in schema) if (rules[key]) return true;
    }
    function schemaHasRulesExcept(schema, rules, exceptKeyword) {
      if (typeof schema == "boolean") return !schema && exceptKeyword != "not";
      for (var key in schema) if (key != exceptKeyword && rules[key]) return true;
    }
    function schemaUnknownRules(schema, rules) {
      if (typeof schema == "boolean") return;
      for (var key in schema) if (!rules[key]) return key;
    }
    function toQuotedString(str) {
      return "'" + escapeQuotes(str) + "'";
    }
    function getPathExpr(currentPath, expr, jsonPointers, isNumber) {
      var path = jsonPointers ? "'/' + " + expr + (isNumber ? "" : ".replace(/~/g, '~0').replace(/\\//g, '~1')") : isNumber ? "'[' + " + expr + " + ']'" : "'[\\'' + " + expr + " + '\\']'";
      return joinPaths(currentPath, path);
    }
    function getPath(currentPath, prop, jsonPointers) {
      var path = jsonPointers ? toQuotedString("/" + escapeJsonPointer(prop)) : toQuotedString(getProperty(prop));
      return joinPaths(currentPath, path);
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, lvl, paths) {
      var up, jsonPointer, data, matches;
      if ($data === "") return "rootData";
      if ($data[0] == "/") {
        if (!JSON_POINTER.test($data)) throw new Error("Invalid JSON-pointer: " + $data);
        jsonPointer = $data;
        data = "rootData";
      } else {
        matches = $data.match(RELATIVE_JSON_POINTER);
        if (!matches) throw new Error("Invalid JSON-pointer: " + $data);
        up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer == "#") {
          if (up >= lvl) throw new Error("Cannot access property/index " + up + " levels up, current level is " + lvl);
          return paths[lvl - up];
        }
        if (up > lvl) throw new Error("Cannot access data " + up + " levels up, current level is " + lvl);
        data = "data" + (lvl - up || "");
        if (!jsonPointer) return data;
      }
      var expr = data;
      var segments = jsonPointer.split("/");
      for (var i = 0; i < segments.length; i++) {
        var segment = segments[i];
        if (segment) {
          data += getProperty(unescapeJsonPointer(segment));
          expr += " && " + data;
        }
      }
      return expr;
    }
    function joinPaths(a, b2) {
      if (a == '""') return b2;
      return (a + " + " + b2).replace(/([^\\])' \+ '/g, "$1");
    }
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    function escapeJsonPointer(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
  }
});

// node_modules/ajv/lib/compile/schema_obj.js
var require_schema_obj = __commonJS({
  "node_modules/ajv/lib/compile/schema_obj.js"(exports2, module2) {
    "use strict";
    var util = require_util();
    module2.exports = SchemaObject;
    function SchemaObject(obj) {
      util.copy(obj, this);
    }
  }
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/json-schema-traverse/index.js"(exports2, module2) {
    "use strict";
    var traverse = module2.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/ajv/lib/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/ajv/lib/compile/resolve.js"(exports2, module2) {
    "use strict";
    var URI = require_uri_all();
    var equal = require_fast_deep_equal();
    var util = require_util();
    var SchemaObject = require_schema_obj();
    var traverse = require_json_schema_traverse();
    module2.exports = resolve2;
    resolve2.normalizeId = normalizeId;
    resolve2.fullPath = getFullPath;
    resolve2.url = resolveUrl;
    resolve2.ids = resolveIds;
    resolve2.inlineRef = inlineRef;
    resolve2.schema = resolveSchema;
    function resolve2(compile, root, ref) {
      var refVal = this._refs[ref];
      if (typeof refVal == "string") {
        if (this._refs[refVal]) refVal = this._refs[refVal];
        else return resolve2.call(this, compile, root, refVal);
      }
      refVal = refVal || this._schemas[ref];
      if (refVal instanceof SchemaObject) {
        return inlineRef(refVal.schema, this._opts.inlineRefs) ? refVal.schema : refVal.validate || this._compile(refVal);
      }
      var res = resolveSchema.call(this, root, ref);
      var schema, v2, baseId;
      if (res) {
        schema = res.schema;
        root = res.root;
        baseId = res.baseId;
      }
      if (schema instanceof SchemaObject) {
        v2 = schema.validate || compile.call(this, schema.schema, root, void 0, baseId);
      } else if (schema !== void 0) {
        v2 = inlineRef(schema, this._opts.inlineRefs) ? schema : compile.call(this, schema, root, void 0, baseId);
      }
      return v2;
    }
    function resolveSchema(root, ref) {
      var p2 = URI.parse(ref), refPath = _getFullPath(p2), baseId = getFullPath(this._getId(root.schema));
      if (Object.keys(root.schema).length === 0 || refPath !== baseId) {
        var id = normalizeId(refPath);
        var refVal = this._refs[id];
        if (typeof refVal == "string") {
          return resolveRecursive.call(this, root, refVal, p2);
        } else if (refVal instanceof SchemaObject) {
          if (!refVal.validate) this._compile(refVal);
          root = refVal;
        } else {
          refVal = this._schemas[id];
          if (refVal instanceof SchemaObject) {
            if (!refVal.validate) this._compile(refVal);
            if (id == normalizeId(ref))
              return { schema: refVal, root, baseId };
            root = refVal;
          } else {
            return;
          }
        }
        if (!root.schema) return;
        baseId = getFullPath(this._getId(root.schema));
      }
      return getJsonPointer.call(this, p2, baseId, root.schema, root);
    }
    function resolveRecursive(root, ref, parsedRef) {
      var res = resolveSchema.call(this, root, ref);
      if (res) {
        var schema = res.schema;
        var baseId = res.baseId;
        root = res.root;
        var id = this._getId(schema);
        if (id) baseId = resolveUrl(baseId, id);
        return getJsonPointer.call(this, parsedRef, baseId, schema, root);
      }
    }
    var PREVENT_SCOPE_CHANGE = util.toHash(["properties", "patternProperties", "enum", "dependencies", "definitions"]);
    function getJsonPointer(parsedRef, baseId, schema, root) {
      parsedRef.fragment = parsedRef.fragment || "";
      if (parsedRef.fragment.slice(0, 1) != "/") return;
      var parts = parsedRef.fragment.split("/");
      for (var i = 1; i < parts.length; i++) {
        var part = parts[i];
        if (part) {
          part = util.unescapeFragment(part);
          schema = schema[part];
          if (schema === void 0) break;
          var id;
          if (!PREVENT_SCOPE_CHANGE[part]) {
            id = this._getId(schema);
            if (id) baseId = resolveUrl(baseId, id);
            if (schema.$ref) {
              var $ref = resolveUrl(baseId, schema.$ref);
              var res = resolveSchema.call(this, root, $ref);
              if (res) {
                schema = res.schema;
                root = res.root;
                baseId = res.baseId;
              }
            }
          }
        }
      }
      if (schema !== void 0 && schema !== root.schema)
        return { schema, root, baseId };
    }
    var SIMPLE_INLINED = util.toHash([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum"
    ]);
    function inlineRef(schema, limit) {
      if (limit === false) return false;
      if (limit === void 0 || limit === true) return checkNoRef(schema);
      else if (limit) return countKeys(schema) <= limit;
    }
    function checkNoRef(schema) {
      var item;
      if (Array.isArray(schema)) {
        for (var i = 0; i < schema.length; i++) {
          item = schema[i];
          if (typeof item == "object" && !checkNoRef(item)) return false;
        }
      } else {
        for (var key in schema) {
          if (key == "$ref") return false;
          item = schema[key];
          if (typeof item == "object" && !checkNoRef(item)) return false;
        }
      }
      return true;
    }
    function countKeys(schema) {
      var count = 0, item;
      if (Array.isArray(schema)) {
        for (var i = 0; i < schema.length; i++) {
          item = schema[i];
          if (typeof item == "object") count += countKeys(item);
          if (count == Infinity) return Infinity;
        }
      } else {
        for (var key in schema) {
          if (key == "$ref") return Infinity;
          if (SIMPLE_INLINED[key]) {
            count++;
          } else {
            item = schema[key];
            if (typeof item == "object") count += countKeys(item) + 1;
            if (count == Infinity) return Infinity;
          }
        }
      }
      return count;
    }
    function getFullPath(id, normalize) {
      if (normalize !== false) id = normalizeId(id);
      var p2 = URI.parse(id);
      return _getFullPath(p2);
    }
    function _getFullPath(p2) {
      return URI.serialize(p2).split("#")[0] + "#";
    }
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    function resolveUrl(baseId, id) {
      id = normalizeId(id);
      return URI.resolve(baseId, id);
    }
    function resolveIds(schema) {
      var schemaId = normalizeId(this._getId(schema));
      var baseIds = { "": schemaId };
      var fullPaths = { "": getFullPath(schemaId, false) };
      var localRefs = {};
      var self = this;
      traverse(schema, { allKeys: true }, function(sch, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
        if (jsonPtr === "") return;
        var id = self._getId(sch);
        var baseId = baseIds[parentJsonPtr];
        var fullPath = fullPaths[parentJsonPtr] + "/" + parentKeyword;
        if (keyIndex !== void 0)
          fullPath += "/" + (typeof keyIndex == "number" ? keyIndex : util.escapeFragment(keyIndex));
        if (typeof id == "string") {
          id = baseId = normalizeId(baseId ? URI.resolve(baseId, id) : id);
          var refVal = self._refs[id];
          if (typeof refVal == "string") refVal = self._refs[refVal];
          if (refVal && refVal.schema) {
            if (!equal(sch, refVal.schema))
              throw new Error('id "' + id + '" resolves to more than one schema');
          } else if (id != normalizeId(fullPath)) {
            if (id[0] == "#") {
              if (localRefs[id] && !equal(sch, localRefs[id]))
                throw new Error('id "' + id + '" resolves to more than one schema');
              localRefs[id] = sch;
            } else {
              self._refs[id] = fullPath;
            }
          }
        }
        baseIds[jsonPtr] = baseId;
        fullPaths[jsonPtr] = fullPath;
      });
      return localRefs;
    }
  }
});

// node_modules/ajv/lib/compile/error_classes.js
var require_error_classes = __commonJS({
  "node_modules/ajv/lib/compile/error_classes.js"(exports2, module2) {
    "use strict";
    var resolve2 = require_resolve();
    module2.exports = {
      Validation: errorSubclass(ValidationError),
      MissingRef: errorSubclass(MissingRefError)
    };
    function ValidationError(errors) {
      this.message = "validation failed";
      this.errors = errors;
      this.ajv = this.validation = true;
    }
    MissingRefError.message = function(baseId, ref) {
      return "can't resolve reference " + ref + " from id " + baseId;
    };
    function MissingRefError(baseId, ref, message) {
      this.message = message || MissingRefError.message(baseId, ref);
      this.missingRef = resolve2.url(baseId, ref);
      this.missingSchema = resolve2.normalizeId(resolve2.fullPath(this.missingRef));
    }
    function errorSubclass(Subclass) {
      Subclass.prototype = Object.create(Error.prototype);
      Subclass.prototype.constructor = Subclass;
      return Subclass;
    }
  }
});

// node_modules/fast-json-stable-stringify/index.js
var require_fast_json_stable_stringify = __commonJS({
  "node_modules/fast-json-stable-stringify/index.js"(exports2, module2) {
    "use strict";
    module2.exports = function(data, opts) {
      if (!opts) opts = {};
      if (typeof opts === "function") opts = { cmp: opts };
      var cycles = typeof opts.cycles === "boolean" ? opts.cycles : false;
      var cmp = opts.cmp && /* @__PURE__ */ (function(f2) {
        return function(node) {
          return function(a, b2) {
            var aobj = { key: a, value: node[a] };
            var bobj = { key: b2, value: node[b2] };
            return f2(aobj, bobj);
          };
        };
      })(opts.cmp);
      var seen = [];
      return (function stringify(node) {
        if (node && node.toJSON && typeof node.toJSON === "function") {
          node = node.toJSON();
        }
        if (node === void 0) return;
        if (typeof node == "number") return isFinite(node) ? "" + node : "null";
        if (typeof node !== "object") return JSON.stringify(node);
        var i, out;
        if (Array.isArray(node)) {
          out = "[";
          for (i = 0; i < node.length; i++) {
            if (i) out += ",";
            out += stringify(node[i]) || "null";
          }
          return out + "]";
        }
        if (node === null) return "null";
        if (seen.indexOf(node) !== -1) {
          if (cycles) return JSON.stringify("__cycle__");
          throw new TypeError("Converting circular structure to JSON");
        }
        var seenIndex = seen.push(node) - 1;
        var keys = Object.keys(node).sort(cmp && cmp(node));
        out = "";
        for (i = 0; i < keys.length; i++) {
          var key = keys[i];
          var value = stringify(node[key]);
          if (!value) continue;
          if (out) out += ",";
          out += JSON.stringify(key) + ":" + value;
        }
        seen.splice(seenIndex, 1);
        return "{" + out + "}";
      })(data);
    };
  }
});

// node_modules/ajv/lib/dotjs/validate.js
var require_validate = __commonJS({
  "node_modules/ajv/lib/dotjs/validate.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_validate(it2, $keyword, $ruleType) {
      var out = "";
      var $async = it2.schema.$async === true, $refKeywords = it2.util.schemaHasRulesExcept(it2.schema, it2.RULES.all, "$ref"), $id = it2.self._getId(it2.schema);
      if (it2.opts.strictKeywords) {
        var $unknownKwd = it2.util.schemaUnknownRules(it2.schema, it2.RULES.keywords);
        if ($unknownKwd) {
          var $keywordsMsg = "unknown keyword: " + $unknownKwd;
          if (it2.opts.strictKeywords === "log") it2.logger.warn($keywordsMsg);
          else throw new Error($keywordsMsg);
        }
      }
      if (it2.isTop) {
        out += " var validate = ";
        if ($async) {
          it2.async = true;
          out += "async ";
        }
        out += "function(data, dataPath, parentData, parentDataProperty, rootData) { 'use strict'; ";
        if ($id && (it2.opts.sourceCode || it2.opts.processCode)) {
          out += " " + ("/*# sourceURL=" + $id + " */") + " ";
        }
      }
      if (typeof it2.schema == "boolean" || !($refKeywords || it2.schema.$ref)) {
        var $keyword = "false schema";
        var $lvl = it2.level;
        var $dataLvl = it2.dataLevel;
        var $schema = it2.schema[$keyword];
        var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
        var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
        var $breakOnError = !it2.opts.allErrors;
        var $errorKeyword;
        var $data = "data" + ($dataLvl || "");
        var $valid = "valid" + $lvl;
        if (it2.schema === false) {
          if (it2.isTop) {
            $breakOnError = true;
          } else {
            out += " var " + $valid + " = false; ";
          }
          var $$outStack = $$outStack || [];
          $$outStack.push(out);
          out = "";
          if (it2.createErrors !== false) {
            out += " { keyword: '" + ($errorKeyword || "false schema") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: {} ";
            if (it2.opts.messages !== false) {
              out += " , message: 'boolean schema is false' ";
            }
            if (it2.opts.verbose) {
              out += " , schema: false , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
            }
            out += " } ";
          } else {
            out += " {} ";
          }
          var __err = out;
          out = $$outStack.pop();
          if (!it2.compositeRule && $breakOnError) {
            if (it2.async) {
              out += " throw new ValidationError([" + __err + "]); ";
            } else {
              out += " validate.errors = [" + __err + "]; return false; ";
            }
          } else {
            out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
          }
        } else {
          if (it2.isTop) {
            if ($async) {
              out += " return data; ";
            } else {
              out += " validate.errors = null; return true; ";
            }
          } else {
            out += " var " + $valid + " = true; ";
          }
        }
        if (it2.isTop) {
          out += " }; return validate; ";
        }
        return out;
      }
      if (it2.isTop) {
        var $top = it2.isTop, $lvl = it2.level = 0, $dataLvl = it2.dataLevel = 0, $data = "data";
        it2.rootId = it2.resolve.fullPath(it2.self._getId(it2.root.schema));
        it2.baseId = it2.baseId || it2.rootId;
        delete it2.isTop;
        it2.dataPathArr = [""];
        if (it2.schema.default !== void 0 && it2.opts.useDefaults && it2.opts.strictDefaults) {
          var $defaultMsg = "default is ignored in the schema root";
          if (it2.opts.strictDefaults === "log") it2.logger.warn($defaultMsg);
          else throw new Error($defaultMsg);
        }
        out += " var vErrors = null; ";
        out += " var errors = 0;     ";
        out += " if (rootData === undefined) rootData = data; ";
      } else {
        var $lvl = it2.level, $dataLvl = it2.dataLevel, $data = "data" + ($dataLvl || "");
        if ($id) it2.baseId = it2.resolve.url(it2.baseId, $id);
        if ($async && !it2.async) throw new Error("async schema in sync schema");
        out += " var errs_" + $lvl + " = errors;";
      }
      var $valid = "valid" + $lvl, $breakOnError = !it2.opts.allErrors, $closingBraces1 = "", $closingBraces2 = "";
      var $errorKeyword;
      var $typeSchema = it2.schema.type, $typeIsArray = Array.isArray($typeSchema);
      if ($typeSchema && it2.opts.nullable && it2.schema.nullable === true) {
        if ($typeIsArray) {
          if ($typeSchema.indexOf("null") == -1) $typeSchema = $typeSchema.concat("null");
        } else if ($typeSchema != "null") {
          $typeSchema = [$typeSchema, "null"];
          $typeIsArray = true;
        }
      }
      if ($typeIsArray && $typeSchema.length == 1) {
        $typeSchema = $typeSchema[0];
        $typeIsArray = false;
      }
      if (it2.schema.$ref && $refKeywords) {
        if (it2.opts.extendRefs == "fail") {
          throw new Error('$ref: validation keywords used in schema at path "' + it2.errSchemaPath + '" (see option extendRefs)');
        } else if (it2.opts.extendRefs !== true) {
          $refKeywords = false;
          it2.logger.warn('$ref: keywords ignored in schema at path "' + it2.errSchemaPath + '"');
        }
      }
      if (it2.schema.$comment && it2.opts.$comment) {
        out += " " + it2.RULES.all.$comment.code(it2, "$comment");
      }
      if ($typeSchema) {
        if (it2.opts.coerceTypes) {
          var $coerceToTypes = it2.util.coerceToTypes(it2.opts.coerceTypes, $typeSchema);
        }
        var $rulesGroup = it2.RULES.types[$typeSchema];
        if ($coerceToTypes || $typeIsArray || $rulesGroup === true || $rulesGroup && !$shouldUseGroup($rulesGroup)) {
          var $schemaPath = it2.schemaPath + ".type", $errSchemaPath = it2.errSchemaPath + "/type";
          var $schemaPath = it2.schemaPath + ".type", $errSchemaPath = it2.errSchemaPath + "/type", $method = $typeIsArray ? "checkDataTypes" : "checkDataType";
          out += " if (" + it2.util[$method]($typeSchema, $data, it2.opts.strictNumbers, true) + ") { ";
          if ($coerceToTypes) {
            var $dataType = "dataType" + $lvl, $coerced = "coerced" + $lvl;
            out += " var " + $dataType + " = typeof " + $data + "; var " + $coerced + " = undefined; ";
            if (it2.opts.coerceTypes == "array") {
              out += " if (" + $dataType + " == 'object' && Array.isArray(" + $data + ") && " + $data + ".length == 1) { " + $data + " = " + $data + "[0]; " + $dataType + " = typeof " + $data + "; if (" + it2.util.checkDataType(it2.schema.type, $data, it2.opts.strictNumbers) + ") " + $coerced + " = " + $data + "; } ";
            }
            out += " if (" + $coerced + " !== undefined) ; ";
            var arr1 = $coerceToTypes;
            if (arr1) {
              var $type, $i2 = -1, l1 = arr1.length - 1;
              while ($i2 < l1) {
                $type = arr1[$i2 += 1];
                if ($type == "string") {
                  out += " else if (" + $dataType + " == 'number' || " + $dataType + " == 'boolean') " + $coerced + " = '' + " + $data + "; else if (" + $data + " === null) " + $coerced + " = ''; ";
                } else if ($type == "number" || $type == "integer") {
                  out += " else if (" + $dataType + " == 'boolean' || " + $data + " === null || (" + $dataType + " == 'string' && " + $data + " && " + $data + " == +" + $data + " ";
                  if ($type == "integer") {
                    out += " && !(" + $data + " % 1)";
                  }
                  out += ")) " + $coerced + " = +" + $data + "; ";
                } else if ($type == "boolean") {
                  out += " else if (" + $data + " === 'false' || " + $data + " === 0 || " + $data + " === null) " + $coerced + " = false; else if (" + $data + " === 'true' || " + $data + " === 1) " + $coerced + " = true; ";
                } else if ($type == "null") {
                  out += " else if (" + $data + " === '' || " + $data + " === 0 || " + $data + " === false) " + $coerced + " = null; ";
                } else if (it2.opts.coerceTypes == "array" && $type == "array") {
                  out += " else if (" + $dataType + " == 'string' || " + $dataType + " == 'number' || " + $dataType + " == 'boolean' || " + $data + " == null) " + $coerced + " = [" + $data + "]; ";
                }
              }
            }
            out += " else {   ";
            var $$outStack = $$outStack || [];
            $$outStack.push(out);
            out = "";
            if (it2.createErrors !== false) {
              out += " { keyword: '" + ($errorKeyword || "type") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { type: '";
              if ($typeIsArray) {
                out += "" + $typeSchema.join(",");
              } else {
                out += "" + $typeSchema;
              }
              out += "' } ";
              if (it2.opts.messages !== false) {
                out += " , message: 'should be ";
                if ($typeIsArray) {
                  out += "" + $typeSchema.join(",");
                } else {
                  out += "" + $typeSchema;
                }
                out += "' ";
              }
              if (it2.opts.verbose) {
                out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
              }
              out += " } ";
            } else {
              out += " {} ";
            }
            var __err = out;
            out = $$outStack.pop();
            if (!it2.compositeRule && $breakOnError) {
              if (it2.async) {
                out += " throw new ValidationError([" + __err + "]); ";
              } else {
                out += " validate.errors = [" + __err + "]; return false; ";
              }
            } else {
              out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
            }
            out += " } if (" + $coerced + " !== undefined) {  ";
            var $parentData = $dataLvl ? "data" + ($dataLvl - 1 || "") : "parentData", $parentDataProperty = $dataLvl ? it2.dataPathArr[$dataLvl] : "parentDataProperty";
            out += " " + $data + " = " + $coerced + "; ";
            if (!$dataLvl) {
              out += "if (" + $parentData + " !== undefined)";
            }
            out += " " + $parentData + "[" + $parentDataProperty + "] = " + $coerced + "; } ";
          } else {
            var $$outStack = $$outStack || [];
            $$outStack.push(out);
            out = "";
            if (it2.createErrors !== false) {
              out += " { keyword: '" + ($errorKeyword || "type") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { type: '";
              if ($typeIsArray) {
                out += "" + $typeSchema.join(",");
              } else {
                out += "" + $typeSchema;
              }
              out += "' } ";
              if (it2.opts.messages !== false) {
                out += " , message: 'should be ";
                if ($typeIsArray) {
                  out += "" + $typeSchema.join(",");
                } else {
                  out += "" + $typeSchema;
                }
                out += "' ";
              }
              if (it2.opts.verbose) {
                out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
              }
              out += " } ";
            } else {
              out += " {} ";
            }
            var __err = out;
            out = $$outStack.pop();
            if (!it2.compositeRule && $breakOnError) {
              if (it2.async) {
                out += " throw new ValidationError([" + __err + "]); ";
              } else {
                out += " validate.errors = [" + __err + "]; return false; ";
              }
            } else {
              out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
            }
          }
          out += " } ";
        }
      }
      if (it2.schema.$ref && !$refKeywords) {
        out += " " + it2.RULES.all.$ref.code(it2, "$ref") + " ";
        if ($breakOnError) {
          out += " } if (errors === ";
          if ($top) {
            out += "0";
          } else {
            out += "errs_" + $lvl;
          }
          out += ") { ";
          $closingBraces2 += "}";
        }
      } else {
        var arr2 = it2.RULES;
        if (arr2) {
          var $rulesGroup, i2 = -1, l2 = arr2.length - 1;
          while (i2 < l2) {
            $rulesGroup = arr2[i2 += 1];
            if ($shouldUseGroup($rulesGroup)) {
              if ($rulesGroup.type) {
                out += " if (" + it2.util.checkDataType($rulesGroup.type, $data, it2.opts.strictNumbers) + ") { ";
              }
              if (it2.opts.useDefaults) {
                if ($rulesGroup.type == "object" && it2.schema.properties) {
                  var $schema = it2.schema.properties, $schemaKeys = Object.keys($schema);
                  var arr3 = $schemaKeys;
                  if (arr3) {
                    var $propertyKey, i3 = -1, l3 = arr3.length - 1;
                    while (i3 < l3) {
                      $propertyKey = arr3[i3 += 1];
                      var $sch = $schema[$propertyKey];
                      if ($sch.default !== void 0) {
                        var $passData = $data + it2.util.getProperty($propertyKey);
                        if (it2.compositeRule) {
                          if (it2.opts.strictDefaults) {
                            var $defaultMsg = "default is ignored for: " + $passData;
                            if (it2.opts.strictDefaults === "log") it2.logger.warn($defaultMsg);
                            else throw new Error($defaultMsg);
                          }
                        } else {
                          out += " if (" + $passData + " === undefined ";
                          if (it2.opts.useDefaults == "empty") {
                            out += " || " + $passData + " === null || " + $passData + " === '' ";
                          }
                          out += " ) " + $passData + " = ";
                          if (it2.opts.useDefaults == "shared") {
                            out += " " + it2.useDefault($sch.default) + " ";
                          } else {
                            out += " " + JSON.stringify($sch.default) + " ";
                          }
                          out += "; ";
                        }
                      }
                    }
                  }
                } else if ($rulesGroup.type == "array" && Array.isArray(it2.schema.items)) {
                  var arr4 = it2.schema.items;
                  if (arr4) {
                    var $sch, $i2 = -1, l4 = arr4.length - 1;
                    while ($i2 < l4) {
                      $sch = arr4[$i2 += 1];
                      if ($sch.default !== void 0) {
                        var $passData = $data + "[" + $i2 + "]";
                        if (it2.compositeRule) {
                          if (it2.opts.strictDefaults) {
                            var $defaultMsg = "default is ignored for: " + $passData;
                            if (it2.opts.strictDefaults === "log") it2.logger.warn($defaultMsg);
                            else throw new Error($defaultMsg);
                          }
                        } else {
                          out += " if (" + $passData + " === undefined ";
                          if (it2.opts.useDefaults == "empty") {
                            out += " || " + $passData + " === null || " + $passData + " === '' ";
                          }
                          out += " ) " + $passData + " = ";
                          if (it2.opts.useDefaults == "shared") {
                            out += " " + it2.useDefault($sch.default) + " ";
                          } else {
                            out += " " + JSON.stringify($sch.default) + " ";
                          }
                          out += "; ";
                        }
                      }
                    }
                  }
                }
              }
              var arr5 = $rulesGroup.rules;
              if (arr5) {
                var $rule, i5 = -1, l5 = arr5.length - 1;
                while (i5 < l5) {
                  $rule = arr5[i5 += 1];
                  if ($shouldUseRule($rule)) {
                    var $code = $rule.code(it2, $rule.keyword, $rulesGroup.type);
                    if ($code) {
                      out += " " + $code + " ";
                      if ($breakOnError) {
                        $closingBraces1 += "}";
                      }
                    }
                  }
                }
              }
              if ($breakOnError) {
                out += " " + $closingBraces1 + " ";
                $closingBraces1 = "";
              }
              if ($rulesGroup.type) {
                out += " } ";
                if ($typeSchema && $typeSchema === $rulesGroup.type && !$coerceToTypes) {
                  out += " else { ";
                  var $schemaPath = it2.schemaPath + ".type", $errSchemaPath = it2.errSchemaPath + "/type";
                  var $$outStack = $$outStack || [];
                  $$outStack.push(out);
                  out = "";
                  if (it2.createErrors !== false) {
                    out += " { keyword: '" + ($errorKeyword || "type") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { type: '";
                    if ($typeIsArray) {
                      out += "" + $typeSchema.join(",");
                    } else {
                      out += "" + $typeSchema;
                    }
                    out += "' } ";
                    if (it2.opts.messages !== false) {
                      out += " , message: 'should be ";
                      if ($typeIsArray) {
                        out += "" + $typeSchema.join(",");
                      } else {
                        out += "" + $typeSchema;
                      }
                      out += "' ";
                    }
                    if (it2.opts.verbose) {
                      out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
                    }
                    out += " } ";
                  } else {
                    out += " {} ";
                  }
                  var __err = out;
                  out = $$outStack.pop();
                  if (!it2.compositeRule && $breakOnError) {
                    if (it2.async) {
                      out += " throw new ValidationError([" + __err + "]); ";
                    } else {
                      out += " validate.errors = [" + __err + "]; return false; ";
                    }
                  } else {
                    out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
                  }
                  out += " } ";
                }
              }
              if ($breakOnError) {
                out += " if (errors === ";
                if ($top) {
                  out += "0";
                } else {
                  out += "errs_" + $lvl;
                }
                out += ") { ";
                $closingBraces2 += "}";
              }
            }
          }
        }
      }
      if ($breakOnError) {
        out += " " + $closingBraces2 + " ";
      }
      if ($top) {
        if ($async) {
          out += " if (errors === 0) return data;           ";
          out += " else throw new ValidationError(vErrors); ";
        } else {
          out += " validate.errors = vErrors; ";
          out += " return errors === 0;       ";
        }
        out += " }; return validate;";
      } else {
        out += " var " + $valid + " = errors === errs_" + $lvl + ";";
      }
      function $shouldUseGroup($rulesGroup2) {
        var rules = $rulesGroup2.rules;
        for (var i = 0; i < rules.length; i++)
          if ($shouldUseRule(rules[i])) return true;
      }
      function $shouldUseRule($rule2) {
        return it2.schema[$rule2.keyword] !== void 0 || $rule2.implements && $ruleImplementsSomeKeyword($rule2);
      }
      function $ruleImplementsSomeKeyword($rule2) {
        var impl = $rule2.implements;
        for (var i = 0; i < impl.length; i++)
          if (it2.schema[impl[i]] !== void 0) return true;
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/lib/compile/index.js"(exports2, module2) {
    "use strict";
    var resolve2 = require_resolve();
    var util = require_util();
    var errorClasses = require_error_classes();
    var stableStringify = require_fast_json_stable_stringify();
    var validateGenerator = require_validate();
    var ucs2length = util.ucs2length;
    var equal = require_fast_deep_equal();
    var ValidationError = errorClasses.Validation;
    module2.exports = compile;
    function compile(schema, root, localRefs, baseId) {
      var self = this, opts = this._opts, refVal = [void 0], refs = {}, patterns = [], patternsHash = {}, defaults = [], defaultsHash = {}, customRules = [];
      function patternCode(i, patterns2) {
        var regExpCode = opts.regExp ? "regExp" : "new RegExp";
        return "var pattern" + i + " = " + regExpCode + "(" + util.toQuotedString(patterns2[i]) + ");";
      }
      root = root || { schema, refVal, refs };
      var c = checkCompiling.call(this, schema, root, baseId);
      var compilation = this._compilations[c.index];
      if (c.compiling) return compilation.callValidate = callValidate;
      var formats = this._formats;
      var RULES = this.RULES;
      try {
        var v2 = localCompile(schema, root, localRefs, baseId);
        compilation.validate = v2;
        var cv = compilation.callValidate;
        if (cv) {
          cv.schema = v2.schema;
          cv.errors = null;
          cv.refs = v2.refs;
          cv.refVal = v2.refVal;
          cv.root = v2.root;
          cv.$async = v2.$async;
          if (opts.sourceCode) cv.source = v2.source;
        }
        return v2;
      } finally {
        endCompiling.call(this, schema, root, baseId);
      }
      function callValidate() {
        var validate = compilation.validate;
        var result = validate.apply(this, arguments);
        callValidate.errors = validate.errors;
        return result;
      }
      function localCompile(_schema, _root, localRefs2, baseId2) {
        var isRoot = !_root || _root && _root.schema == _schema;
        if (_root.schema != root.schema)
          return compile.call(self, _schema, _root, localRefs2, baseId2);
        var $async = _schema.$async === true;
        var sourceCode = validateGenerator({
          isTop: true,
          schema: _schema,
          isRoot,
          baseId: baseId2,
          root: _root,
          schemaPath: "",
          errSchemaPath: "#",
          errorPath: '""',
          MissingRefError: errorClasses.MissingRef,
          RULES,
          validate: validateGenerator,
          util,
          resolve: resolve2,
          resolveRef,
          usePattern,
          useDefault,
          useCustomRule,
          opts,
          formats,
          logger: self.logger,
          self
        });
        sourceCode = vars(refVal, refValCode) + vars(patterns, patternCode) + vars(defaults, defaultCode) + vars(customRules, customRuleCode) + sourceCode;
        if (opts.processCode) sourceCode = opts.processCode(sourceCode, _schema);
        var validate;
        try {
          var makeValidate = new Function(
            "self",
            "RULES",
            "formats",
            "root",
            "refVal",
            "defaults",
            "customRules",
            "equal",
            "ucs2length",
            "ValidationError",
            "regExp",
            sourceCode
          );
          validate = makeValidate(
            self,
            RULES,
            formats,
            root,
            refVal,
            defaults,
            customRules,
            equal,
            ucs2length,
            ValidationError,
            opts.regExp
          );
          refVal[0] = validate;
        } catch (e) {
          self.logger.error("Error compiling schema, function code:", sourceCode);
          throw e;
        }
        validate.schema = _schema;
        validate.errors = null;
        validate.refs = refs;
        validate.refVal = refVal;
        validate.root = isRoot ? validate : _root;
        if ($async) validate.$async = true;
        if (opts.sourceCode === true) {
          validate.source = {
            code: sourceCode,
            patterns,
            defaults
          };
        }
        return validate;
      }
      function resolveRef(baseId2, ref, isRoot) {
        ref = resolve2.url(baseId2, ref);
        var refIndex = refs[ref];
        var _refVal, refCode;
        if (refIndex !== void 0) {
          _refVal = refVal[refIndex];
          refCode = "refVal[" + refIndex + "]";
          return resolvedRef(_refVal, refCode);
        }
        if (!isRoot && root.refs) {
          var rootRefId = root.refs[ref];
          if (rootRefId !== void 0) {
            _refVal = root.refVal[rootRefId];
            refCode = addLocalRef(ref, _refVal);
            return resolvedRef(_refVal, refCode);
          }
        }
        refCode = addLocalRef(ref);
        var v3 = resolve2.call(self, localCompile, root, ref);
        if (v3 === void 0) {
          var localSchema = localRefs && localRefs[ref];
          if (localSchema) {
            v3 = resolve2.inlineRef(localSchema, opts.inlineRefs) ? localSchema : compile.call(self, localSchema, root, localRefs, baseId2);
          }
        }
        if (v3 === void 0) {
          removeLocalRef(ref);
        } else {
          replaceLocalRef(ref, v3);
          return resolvedRef(v3, refCode);
        }
      }
      function addLocalRef(ref, v3) {
        var refId = refVal.length;
        refVal[refId] = v3;
        refs[ref] = refId;
        return "refVal" + refId;
      }
      function removeLocalRef(ref) {
        delete refs[ref];
      }
      function replaceLocalRef(ref, v3) {
        var refId = refs[ref];
        refVal[refId] = v3;
      }
      function resolvedRef(refVal2, code) {
        return typeof refVal2 == "object" || typeof refVal2 == "boolean" ? { code, schema: refVal2, inline: true } : { code, $async: refVal2 && !!refVal2.$async };
      }
      function usePattern(regexStr) {
        var index = patternsHash[regexStr];
        if (index === void 0) {
          index = patternsHash[regexStr] = patterns.length;
          patterns[index] = regexStr;
        }
        return "pattern" + index;
      }
      function useDefault(value) {
        switch (typeof value) {
          case "boolean":
          case "number":
            return "" + value;
          case "string":
            return util.toQuotedString(value);
          case "object":
            if (value === null) return "null";
            var valueStr = stableStringify(value);
            var index = defaultsHash[valueStr];
            if (index === void 0) {
              index = defaultsHash[valueStr] = defaults.length;
              defaults[index] = value;
            }
            return "default" + index;
        }
      }
      function useCustomRule(rule, schema2, parentSchema, it2) {
        if (self._opts.validateSchema !== false) {
          var deps = rule.definition.dependencies;
          if (deps && !deps.every(function(keyword) {
            return Object.prototype.hasOwnProperty.call(parentSchema, keyword);
          }))
            throw new Error("parent schema must have all required keywords: " + deps.join(","));
          var validateSchema = rule.definition.validateSchema;
          if (validateSchema) {
            var valid = validateSchema(schema2);
            if (!valid) {
              var message = "keyword schema is invalid: " + self.errorsText(validateSchema.errors);
              if (self._opts.validateSchema == "log") self.logger.error(message);
              else throw new Error(message);
            }
          }
        }
        var compile2 = rule.definition.compile, inline = rule.definition.inline, macro = rule.definition.macro;
        var validate;
        if (compile2) {
          validate = compile2.call(self, schema2, parentSchema, it2);
        } else if (macro) {
          validate = macro.call(self, schema2, parentSchema, it2);
          if (opts.validateSchema !== false) self.validateSchema(validate, true);
        } else if (inline) {
          validate = inline.call(self, it2, rule.keyword, schema2, parentSchema);
        } else {
          validate = rule.definition.validate;
          if (!validate) return;
        }
        if (validate === void 0)
          throw new Error('custom keyword "' + rule.keyword + '"failed to compile');
        var index = customRules.length;
        customRules[index] = validate;
        return {
          code: "customRule" + index,
          validate
        };
      }
    }
    function checkCompiling(schema, root, baseId) {
      var index = compIndex.call(this, schema, root, baseId);
      if (index >= 0) return { index, compiling: true };
      index = this._compilations.length;
      this._compilations[index] = {
        schema,
        root,
        baseId
      };
      return { index, compiling: false };
    }
    function endCompiling(schema, root, baseId) {
      var i = compIndex.call(this, schema, root, baseId);
      if (i >= 0) this._compilations.splice(i, 1);
    }
    function compIndex(schema, root, baseId) {
      for (var i = 0; i < this._compilations.length; i++) {
        var c = this._compilations[i];
        if (c.schema == schema && c.root == root && c.baseId == baseId) return i;
      }
      return -1;
    }
    function defaultCode(i) {
      return "var default" + i + " = defaults[" + i + "];";
    }
    function refValCode(i, refVal) {
      return refVal[i] === void 0 ? "" : "var refVal" + i + " = refVal[" + i + "];";
    }
    function customRuleCode(i) {
      return "var customRule" + i + " = customRules[" + i + "];";
    }
    function vars(arr, statement) {
      if (!arr.length) return "";
      var code = "";
      for (var i = 0; i < arr.length; i++)
        code += statement(i, arr);
      return code;
    }
  }
});

// node_modules/ajv/lib/cache.js
var require_cache = __commonJS({
  "node_modules/ajv/lib/cache.js"(exports2, module2) {
    "use strict";
    var Cache = module2.exports = function Cache2() {
      this._cache = {};
    };
    Cache.prototype.put = function Cache_put(key, value) {
      this._cache[key] = value;
    };
    Cache.prototype.get = function Cache_get(key) {
      return this._cache[key];
    };
    Cache.prototype.del = function Cache_del(key) {
      delete this._cache[key];
    };
    Cache.prototype.clear = function Cache_clear() {
      this._cache = {};
    };
  }
});

// node_modules/ajv/lib/compile/formats.js
var require_formats = __commonJS({
  "node_modules/ajv/lib/compile/formats.js"(exports2, module2) {
    "use strict";
    var util = require_util();
    var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
    var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var TIME = /^(\d\d):(\d\d):(\d\d)(\.\d+)?(z|[+-]\d\d(?::?\d\d)?)?$/i;
    var HOSTNAME = /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i;
    var URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    var URIREF = /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    var URITEMPLATE = /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i;
    var URL2 = /^(?:(?:http[s\u017F]?|ftp):\/\/)(?:(?:[\0-\x08\x0E-\x1F!-\x9F\xA1-\u167F\u1681-\u1FFF\u200B-\u2027\u202A-\u202E\u2030-\u205E\u2060-\u2FFF\u3001-\uD7FF\uE000-\uFEFE\uFF00-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+(?::(?:[\0-\x08\x0E-\x1F!-\x9F\xA1-\u167F\u1681-\u1FFF\u200B-\u2027\u202A-\u202E\u2030-\u205E\u2060-\u2FFF\u3001-\uD7FF\uE000-\uFEFE\uFF00-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])*)?@)?(?:(?!10(?:\.[0-9]{1,3}){3})(?!127(?:\.[0-9]{1,3}){3})(?!169\.254(?:\.[0-9]{1,3}){2})(?!192\.168(?:\.[0-9]{1,3}){2})(?!172\.(?:1[6-9]|2[0-9]|3[01])(?:\.[0-9]{1,3}){2})(?:[1-9][0-9]?|1[0-9][0-9]|2[01][0-9]|22[0-3])(?:\.(?:1?[0-9]{1,2}|2[0-4][0-9]|25[0-5])){2}(?:\.(?:[1-9][0-9]?|1[0-9][0-9]|2[0-4][0-9]|25[0-4]))|(?:(?:(?:[0-9a-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+-)*(?:[0-9a-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+)(?:\.(?:(?:[0-9a-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+-)*(?:[0-9a-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+)*(?:\.(?:(?:[a-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]){2,})))(?::[0-9]{2,5})?(?:\/(?:[\0-\x08\x0E-\x1F!-\x9F\xA1-\u167F\u1681-\u1FFF\u200B-\u2027\u202A-\u202E\u2030-\u205E\u2060-\u2FFF\u3001-\uD7FF\uE000-\uFEFE\uFF00-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])*)?$/i;
    var UUID = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    var JSON_POINTER = /^(?:\/(?:[^~/]|~0|~1)*)*$/;
    var JSON_POINTER_URI_FRAGMENT = /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i;
    var RELATIVE_JSON_POINTER = /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/;
    module2.exports = formats;
    function formats(mode) {
      mode = mode == "full" ? "full" : "fast";
      return util.copy(formats[mode]);
    }
    formats.fast = {
      // date: http://tools.ietf.org/html/rfc3339#section-5.6
      date: /^\d\d\d\d-[0-1]\d-[0-3]\d$/,
      // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
      time: /^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i,
      "date-time": /^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i,
      // uri: https://github.com/mafintosh/is-my-json-valid/blob/master/formats.js
      uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
      "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
      "uri-template": URITEMPLATE,
      url: URL2,
      // email (sources from jsen validator):
      // http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address#answer-8829363
      // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address (search for 'willful violation')
      email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i,
      hostname: HOSTNAME,
      // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
      ipv4: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
      // optimized http://stackoverflow.com/questions/53497/regular-expression-that-matches-valid-ipv6-addresses
      ipv6: /^\s*(?:(?:(?:[0-9a-f]{1,4}:){7}(?:[0-9a-f]{1,4}|:))|(?:(?:[0-9a-f]{1,4}:){6}(?::[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(?:(?:[0-9a-f]{1,4}:){5}(?:(?:(?::[0-9a-f]{1,4}){1,2})|:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(?:(?:[0-9a-f]{1,4}:){4}(?:(?:(?::[0-9a-f]{1,4}){1,3})|(?:(?::[0-9a-f]{1,4})?:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){3}(?:(?:(?::[0-9a-f]{1,4}){1,4})|(?:(?::[0-9a-f]{1,4}){0,2}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){2}(?:(?:(?::[0-9a-f]{1,4}){1,5})|(?:(?::[0-9a-f]{1,4}){0,3}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){1}(?:(?:(?::[0-9a-f]{1,4}){1,6})|(?:(?::[0-9a-f]{1,4}){0,4}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?::(?:(?:(?::[0-9a-f]{1,4}){1,7})|(?:(?::[0-9a-f]{1,4}){0,5}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(?:%.+)?\s*$/i,
      regex,
      // uuid: http://tools.ietf.org/html/rfc4122
      uuid: UUID,
      // JSON-pointer: https://tools.ietf.org/html/rfc6901
      // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
      "json-pointer": JSON_POINTER,
      "json-pointer-uri-fragment": JSON_POINTER_URI_FRAGMENT,
      // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
      "relative-json-pointer": RELATIVE_JSON_POINTER
    };
    formats.full = {
      date,
      time,
      "date-time": date_time,
      uri,
      "uri-reference": URIREF,
      "uri-template": URITEMPLATE,
      url: URL2,
      email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
      hostname: HOSTNAME,
      ipv4: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
      ipv6: /^\s*(?:(?:(?:[0-9a-f]{1,4}:){7}(?:[0-9a-f]{1,4}|:))|(?:(?:[0-9a-f]{1,4}:){6}(?::[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(?:(?:[0-9a-f]{1,4}:){5}(?:(?:(?::[0-9a-f]{1,4}){1,2})|:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(?:(?:[0-9a-f]{1,4}:){4}(?:(?:(?::[0-9a-f]{1,4}){1,3})|(?:(?::[0-9a-f]{1,4})?:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){3}(?:(?:(?::[0-9a-f]{1,4}){1,4})|(?:(?::[0-9a-f]{1,4}){0,2}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){2}(?:(?:(?::[0-9a-f]{1,4}){1,5})|(?:(?::[0-9a-f]{1,4}){0,3}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){1}(?:(?:(?::[0-9a-f]{1,4}){1,6})|(?:(?::[0-9a-f]{1,4}){0,4}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?::(?:(?:(?::[0-9a-f]{1,4}){1,7})|(?:(?::[0-9a-f]{1,4}){0,5}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(?:%.+)?\s*$/i,
      regex,
      uuid: UUID,
      "json-pointer": JSON_POINTER,
      "json-pointer-uri-fragment": JSON_POINTER_URI_FRAGMENT,
      "relative-json-pointer": RELATIVE_JSON_POINTER
    };
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    function date(str) {
      var matches = str.match(DATE);
      if (!matches) return false;
      var year = +matches[1];
      var month = +matches[2];
      var day = +matches[3];
      return month >= 1 && month <= 12 && day >= 1 && day <= (month == 2 && isLeapYear(year) ? 29 : DAYS[month]);
    }
    function time(str, full) {
      var matches = str.match(TIME);
      if (!matches) return false;
      var hour = matches[1];
      var minute = matches[2];
      var second = matches[3];
      var timeZone = matches[5];
      return (hour <= 23 && minute <= 59 && second <= 59 || hour == 23 && minute == 59 && second == 60) && (!full || timeZone);
    }
    var DATE_TIME_SEPARATOR = /t|\s/i;
    function date_time(str) {
      var dateTime = str.split(DATE_TIME_SEPARATOR);
      return dateTime.length == 2 && date(dateTime[0]) && time(dateTime[1], true);
    }
    var NOT_URI_FRAGMENT = /\/|:/;
    function uri(str) {
      return NOT_URI_FRAGMENT.test(str) && URI.test(str);
    }
    var Z_ANCHOR = /[^\\]\\Z/;
    function regex(str) {
      if (Z_ANCHOR.test(str)) return false;
      try {
        new RegExp(str);
        return true;
      } catch (e) {
        return false;
      }
    }
  }
});

// node_modules/ajv/lib/dotjs/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/lib/dotjs/ref.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_ref(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $async, $refCode;
      if ($schema == "#" || $schema == "#/") {
        if (it2.isRoot) {
          $async = it2.async;
          $refCode = "validate";
        } else {
          $async = it2.root.schema.$async === true;
          $refCode = "root.refVal[0]";
        }
      } else {
        var $refVal = it2.resolveRef(it2.baseId, $schema, it2.isRoot);
        if ($refVal === void 0) {
          var $message = it2.MissingRefError.message(it2.baseId, $schema);
          if (it2.opts.missingRefs == "fail") {
            it2.logger.error($message);
            var $$outStack = $$outStack || [];
            $$outStack.push(out);
            out = "";
            if (it2.createErrors !== false) {
              out += " { keyword: '$ref' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { ref: '" + it2.util.escapeQuotes($schema) + "' } ";
              if (it2.opts.messages !== false) {
                out += " , message: 'can\\'t resolve reference " + it2.util.escapeQuotes($schema) + "' ";
              }
              if (it2.opts.verbose) {
                out += " , schema: " + it2.util.toQuotedString($schema) + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
              }
              out += " } ";
            } else {
              out += " {} ";
            }
            var __err = out;
            out = $$outStack.pop();
            if (!it2.compositeRule && $breakOnError) {
              if (it2.async) {
                out += " throw new ValidationError([" + __err + "]); ";
              } else {
                out += " validate.errors = [" + __err + "]; return false; ";
              }
            } else {
              out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
            }
            if ($breakOnError) {
              out += " if (false) { ";
            }
          } else if (it2.opts.missingRefs == "ignore") {
            it2.logger.warn($message);
            if ($breakOnError) {
              out += " if (true) { ";
            }
          } else {
            throw new it2.MissingRefError(it2.baseId, $schema, $message);
          }
        } else if ($refVal.inline) {
          var $it = it2.util.copy(it2);
          $it.level++;
          var $nextValid = "valid" + $it.level;
          $it.schema = $refVal.schema;
          $it.schemaPath = "";
          $it.errSchemaPath = $schema;
          var $code = it2.validate($it).replace(/validate\.schema/g, $refVal.code);
          out += " " + $code + " ";
          if ($breakOnError) {
            out += " if (" + $nextValid + ") { ";
          }
        } else {
          $async = $refVal.$async === true || it2.async && $refVal.$async !== false;
          $refCode = $refVal.code;
        }
      }
      if ($refCode) {
        var $$outStack = $$outStack || [];
        $$outStack.push(out);
        out = "";
        if (it2.opts.passContext) {
          out += " " + $refCode + ".call(this, ";
        } else {
          out += " " + $refCode + "( ";
        }
        out += " " + $data + ", (dataPath || '')";
        if (it2.errorPath != '""') {
          out += " + " + it2.errorPath;
        }
        var $parentData = $dataLvl ? "data" + ($dataLvl - 1 || "") : "parentData", $parentDataProperty = $dataLvl ? it2.dataPathArr[$dataLvl] : "parentDataProperty";
        out += " , " + $parentData + " , " + $parentDataProperty + ", rootData)  ";
        var __callValidate = out;
        out = $$outStack.pop();
        if ($async) {
          if (!it2.async) throw new Error("async schema referenced by sync schema");
          if ($breakOnError) {
            out += " var " + $valid + "; ";
          }
          out += " try { await " + __callValidate + "; ";
          if ($breakOnError) {
            out += " " + $valid + " = true; ";
          }
          out += " } catch (e) { if (!(e instanceof ValidationError)) throw e; if (vErrors === null) vErrors = e.errors; else vErrors = vErrors.concat(e.errors); errors = vErrors.length; ";
          if ($breakOnError) {
            out += " " + $valid + " = false; ";
          }
          out += " } ";
          if ($breakOnError) {
            out += " if (" + $valid + ") { ";
          }
        } else {
          out += " if (!" + __callValidate + ") { if (vErrors === null) vErrors = " + $refCode + ".errors; else vErrors = vErrors.concat(" + $refCode + ".errors); errors = vErrors.length; } ";
          if ($breakOnError) {
            out += " else { ";
          }
        }
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/lib/dotjs/allOf.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_allOf(it2, $keyword, $ruleType) {
      var out = " ";
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $it = it2.util.copy(it2);
      var $closingBraces = "";
      $it.level++;
      var $nextValid = "valid" + $it.level;
      var $currentBaseId = $it.baseId, $allSchemasEmpty = true;
      var arr1 = $schema;
      if (arr1) {
        var $sch, $i2 = -1, l1 = arr1.length - 1;
        while ($i2 < l1) {
          $sch = arr1[$i2 += 1];
          if (it2.opts.strictKeywords ? typeof $sch == "object" && Object.keys($sch).length > 0 || $sch === false : it2.util.schemaHasRules($sch, it2.RULES.all)) {
            $allSchemasEmpty = false;
            $it.schema = $sch;
            $it.schemaPath = $schemaPath + "[" + $i2 + "]";
            $it.errSchemaPath = $errSchemaPath + "/" + $i2;
            out += "  " + it2.validate($it) + " ";
            $it.baseId = $currentBaseId;
            if ($breakOnError) {
              out += " if (" + $nextValid + ") { ";
              $closingBraces += "}";
            }
          }
        }
      }
      if ($breakOnError) {
        if ($allSchemasEmpty) {
          out += " if (true) { ";
        } else {
          out += " " + $closingBraces.slice(0, -1) + " ";
        }
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/lib/dotjs/anyOf.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_anyOf(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $errs = "errs__" + $lvl;
      var $it = it2.util.copy(it2);
      var $closingBraces = "";
      $it.level++;
      var $nextValid = "valid" + $it.level;
      var $noEmptySchema = $schema.every(function($sch2) {
        return it2.opts.strictKeywords ? typeof $sch2 == "object" && Object.keys($sch2).length > 0 || $sch2 === false : it2.util.schemaHasRules($sch2, it2.RULES.all);
      });
      if ($noEmptySchema) {
        var $currentBaseId = $it.baseId;
        out += " var " + $errs + " = errors; var " + $valid + " = false;  ";
        var $wasComposite = it2.compositeRule;
        it2.compositeRule = $it.compositeRule = true;
        var arr1 = $schema;
        if (arr1) {
          var $sch, $i2 = -1, l1 = arr1.length - 1;
          while ($i2 < l1) {
            $sch = arr1[$i2 += 1];
            $it.schema = $sch;
            $it.schemaPath = $schemaPath + "[" + $i2 + "]";
            $it.errSchemaPath = $errSchemaPath + "/" + $i2;
            out += "  " + it2.validate($it) + " ";
            $it.baseId = $currentBaseId;
            out += " " + $valid + " = " + $valid + " || " + $nextValid + "; if (!" + $valid + ") { ";
            $closingBraces += "}";
          }
        }
        it2.compositeRule = $it.compositeRule = $wasComposite;
        out += " " + $closingBraces + " if (!" + $valid + ") {   var err =   ";
        if (it2.createErrors !== false) {
          out += " { keyword: 'anyOf' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: {} ";
          if (it2.opts.messages !== false) {
            out += " , message: 'should match some schema in anyOf' ";
          }
          if (it2.opts.verbose) {
            out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
          }
          out += " } ";
        } else {
          out += " {} ";
        }
        out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
        if (!it2.compositeRule && $breakOnError) {
          if (it2.async) {
            out += " throw new ValidationError(vErrors); ";
          } else {
            out += " validate.errors = vErrors; return false; ";
          }
        }
        out += " } else {  errors = " + $errs + "; if (vErrors !== null) { if (" + $errs + ") vErrors.length = " + $errs + "; else vErrors = null; } ";
        if (it2.opts.allErrors) {
          out += " } ";
        }
      } else {
        if ($breakOnError) {
          out += " if (true) { ";
        }
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/comment.js
var require_comment = __commonJS({
  "node_modules/ajv/lib/dotjs/comment.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_comment(it2, $keyword, $ruleType) {
      var out = " ";
      var $schema = it2.schema[$keyword];
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $comment = it2.util.toQuotedString($schema);
      if (it2.opts.$comment === true) {
        out += " console.log(" + $comment + ");";
      } else if (typeof it2.opts.$comment == "function") {
        out += " self._opts.$comment(" + $comment + ", " + it2.util.toQuotedString($errSchemaPath) + ", validate.root.schema);";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/const.js
var require_const = __commonJS({
  "node_modules/ajv/lib/dotjs/const.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_const(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      if (!$isData) {
        out += " var schema" + $lvl + " = validate.schema" + $schemaPath + ";";
      }
      out += "var " + $valid + " = equal(" + $data + ", schema" + $lvl + "); if (!" + $valid + ") {   ";
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: 'const' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { allowedValue: schema" + $lvl + " } ";
        if (it2.opts.messages !== false) {
          out += " , message: 'should be equal to constant' ";
        }
        if (it2.opts.verbose) {
          out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += " }";
      if ($breakOnError) {
        out += " else { ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/lib/dotjs/contains.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_contains(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $errs = "errs__" + $lvl;
      var $it = it2.util.copy(it2);
      var $closingBraces = "";
      $it.level++;
      var $nextValid = "valid" + $it.level;
      var $idx = "i" + $lvl, $dataNxt = $it.dataLevel = it2.dataLevel + 1, $nextData = "data" + $dataNxt, $currentBaseId = it2.baseId, $nonEmptySchema = it2.opts.strictKeywords ? typeof $schema == "object" && Object.keys($schema).length > 0 || $schema === false : it2.util.schemaHasRules($schema, it2.RULES.all);
      out += "var " + $errs + " = errors;var " + $valid + ";";
      if ($nonEmptySchema) {
        var $wasComposite = it2.compositeRule;
        it2.compositeRule = $it.compositeRule = true;
        $it.schema = $schema;
        $it.schemaPath = $schemaPath;
        $it.errSchemaPath = $errSchemaPath;
        out += " var " + $nextValid + " = false; for (var " + $idx + " = 0; " + $idx + " < " + $data + ".length; " + $idx + "++) { ";
        $it.errorPath = it2.util.getPathExpr(it2.errorPath, $idx, it2.opts.jsonPointers, true);
        var $passData = $data + "[" + $idx + "]";
        $it.dataPathArr[$dataNxt] = $idx;
        var $code = it2.validate($it);
        $it.baseId = $currentBaseId;
        if (it2.util.varOccurences($code, $nextData) < 2) {
          out += " " + it2.util.varReplace($code, $nextData, $passData) + " ";
        } else {
          out += " var " + $nextData + " = " + $passData + "; " + $code + " ";
        }
        out += " if (" + $nextValid + ") break; }  ";
        it2.compositeRule = $it.compositeRule = $wasComposite;
        out += " " + $closingBraces + " if (!" + $nextValid + ") {";
      } else {
        out += " if (" + $data + ".length == 0) {";
      }
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: 'contains' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: {} ";
        if (it2.opts.messages !== false) {
          out += " , message: 'should contain a valid item' ";
        }
        if (it2.opts.verbose) {
          out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += " } else { ";
      if ($nonEmptySchema) {
        out += "  errors = " + $errs + "; if (vErrors !== null) { if (" + $errs + ") vErrors.length = " + $errs + "; else vErrors = null; } ";
      }
      if (it2.opts.allErrors) {
        out += " } ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/lib/dotjs/dependencies.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_dependencies(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $errs = "errs__" + $lvl;
      var $it = it2.util.copy(it2);
      var $closingBraces = "";
      $it.level++;
      var $nextValid = "valid" + $it.level;
      var $schemaDeps = {}, $propertyDeps = {}, $ownProperties = it2.opts.ownProperties;
      for ($property in $schema) {
        if ($property == "__proto__") continue;
        var $sch = $schema[$property];
        var $deps = Array.isArray($sch) ? $propertyDeps : $schemaDeps;
        $deps[$property] = $sch;
      }
      out += "var " + $errs + " = errors;";
      var $currentErrorPath = it2.errorPath;
      out += "var missing" + $lvl + ";";
      for (var $property in $propertyDeps) {
        $deps = $propertyDeps[$property];
        if ($deps.length) {
          out += " if ( " + $data + it2.util.getProperty($property) + " !== undefined ";
          if ($ownProperties) {
            out += " && Object.prototype.hasOwnProperty.call(" + $data + ", '" + it2.util.escapeQuotes($property) + "') ";
          }
          if ($breakOnError) {
            out += " && ( ";
            var arr1 = $deps;
            if (arr1) {
              var $propertyKey, $i2 = -1, l1 = arr1.length - 1;
              while ($i2 < l1) {
                $propertyKey = arr1[$i2 += 1];
                if ($i2) {
                  out += " || ";
                }
                var $prop = it2.util.getProperty($propertyKey), $useData = $data + $prop;
                out += " ( ( " + $useData + " === undefined ";
                if ($ownProperties) {
                  out += " || ! Object.prototype.hasOwnProperty.call(" + $data + ", '" + it2.util.escapeQuotes($propertyKey) + "') ";
                }
                out += ") && (missing" + $lvl + " = " + it2.util.toQuotedString(it2.opts.jsonPointers ? $propertyKey : $prop) + ") ) ";
              }
            }
            out += ")) {  ";
            var $propertyPath = "missing" + $lvl, $missingProperty = "' + " + $propertyPath + " + '";
            if (it2.opts._errorDataPathProperty) {
              it2.errorPath = it2.opts.jsonPointers ? it2.util.getPathExpr($currentErrorPath, $propertyPath, true) : $currentErrorPath + " + " + $propertyPath;
            }
            var $$outStack = $$outStack || [];
            $$outStack.push(out);
            out = "";
            if (it2.createErrors !== false) {
              out += " { keyword: 'dependencies' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { property: '" + it2.util.escapeQuotes($property) + "', missingProperty: '" + $missingProperty + "', depsCount: " + $deps.length + ", deps: '" + it2.util.escapeQuotes($deps.length == 1 ? $deps[0] : $deps.join(", ")) + "' } ";
              if (it2.opts.messages !== false) {
                out += " , message: 'should have ";
                if ($deps.length == 1) {
                  out += "property " + it2.util.escapeQuotes($deps[0]);
                } else {
                  out += "properties " + it2.util.escapeQuotes($deps.join(", "));
                }
                out += " when property " + it2.util.escapeQuotes($property) + " is present' ";
              }
              if (it2.opts.verbose) {
                out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
              }
              out += " } ";
            } else {
              out += " {} ";
            }
            var __err = out;
            out = $$outStack.pop();
            if (!it2.compositeRule && $breakOnError) {
              if (it2.async) {
                out += " throw new ValidationError([" + __err + "]); ";
              } else {
                out += " validate.errors = [" + __err + "]; return false; ";
              }
            } else {
              out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
            }
          } else {
            out += " ) { ";
            var arr2 = $deps;
            if (arr2) {
              var $propertyKey, i2 = -1, l2 = arr2.length - 1;
              while (i2 < l2) {
                $propertyKey = arr2[i2 += 1];
                var $prop = it2.util.getProperty($propertyKey), $missingProperty = it2.util.escapeQuotes($propertyKey), $useData = $data + $prop;
                if (it2.opts._errorDataPathProperty) {
                  it2.errorPath = it2.util.getPath($currentErrorPath, $propertyKey, it2.opts.jsonPointers);
                }
                out += " if ( " + $useData + " === undefined ";
                if ($ownProperties) {
                  out += " || ! Object.prototype.hasOwnProperty.call(" + $data + ", '" + it2.util.escapeQuotes($propertyKey) + "') ";
                }
                out += ") {  var err =   ";
                if (it2.createErrors !== false) {
                  out += " { keyword: 'dependencies' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { property: '" + it2.util.escapeQuotes($property) + "', missingProperty: '" + $missingProperty + "', depsCount: " + $deps.length + ", deps: '" + it2.util.escapeQuotes($deps.length == 1 ? $deps[0] : $deps.join(", ")) + "' } ";
                  if (it2.opts.messages !== false) {
                    out += " , message: 'should have ";
                    if ($deps.length == 1) {
                      out += "property " + it2.util.escapeQuotes($deps[0]);
                    } else {
                      out += "properties " + it2.util.escapeQuotes($deps.join(", "));
                    }
                    out += " when property " + it2.util.escapeQuotes($property) + " is present' ";
                  }
                  if (it2.opts.verbose) {
                    out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
                  }
                  out += " } ";
                } else {
                  out += " {} ";
                }
                out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; } ";
              }
            }
          }
          out += " }   ";
          if ($breakOnError) {
            $closingBraces += "}";
            out += " else { ";
          }
        }
      }
      it2.errorPath = $currentErrorPath;
      var $currentBaseId = $it.baseId;
      for (var $property in $schemaDeps) {
        var $sch = $schemaDeps[$property];
        if (it2.opts.strictKeywords ? typeof $sch == "object" && Object.keys($sch).length > 0 || $sch === false : it2.util.schemaHasRules($sch, it2.RULES.all)) {
          out += " " + $nextValid + " = true; if ( " + $data + it2.util.getProperty($property) + " !== undefined ";
          if ($ownProperties) {
            out += " && Object.prototype.hasOwnProperty.call(" + $data + ", '" + it2.util.escapeQuotes($property) + "') ";
          }
          out += ") { ";
          $it.schema = $sch;
          $it.schemaPath = $schemaPath + it2.util.getProperty($property);
          $it.errSchemaPath = $errSchemaPath + "/" + it2.util.escapeFragment($property);
          out += "  " + it2.validate($it) + " ";
          $it.baseId = $currentBaseId;
          out += " }  ";
          if ($breakOnError) {
            out += " if (" + $nextValid + ") { ";
            $closingBraces += "}";
          }
        }
      }
      if ($breakOnError) {
        out += "   " + $closingBraces + " if (" + $errs + " == errors) {";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/lib/dotjs/enum.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_enum(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      var $i2 = "i" + $lvl, $vSchema = "schema" + $lvl;
      if (!$isData) {
        out += " var " + $vSchema + " = validate.schema" + $schemaPath + ";";
      }
      out += "var " + $valid + ";";
      if ($isData) {
        out += " if (schema" + $lvl + " === undefined) " + $valid + " = true; else if (!Array.isArray(schema" + $lvl + ")) " + $valid + " = false; else {";
      }
      out += "" + $valid + " = false;for (var " + $i2 + "=0; " + $i2 + "<" + $vSchema + ".length; " + $i2 + "++) if (equal(" + $data + ", " + $vSchema + "[" + $i2 + "])) { " + $valid + " = true; break; }";
      if ($isData) {
        out += "  }  ";
      }
      out += " if (!" + $valid + ") {   ";
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: 'enum' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { allowedValues: schema" + $lvl + " } ";
        if (it2.opts.messages !== false) {
          out += " , message: 'should be equal to one of the allowed values' ";
        }
        if (it2.opts.verbose) {
          out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += " }";
      if ($breakOnError) {
        out += " else { ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/format.js
var require_format = __commonJS({
  "node_modules/ajv/lib/dotjs/format.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_format(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      if (it2.opts.format === false) {
        if ($breakOnError) {
          out += " if (true) { ";
        }
        return out;
      }
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      var $unknownFormats = it2.opts.unknownFormats, $allowUnknown = Array.isArray($unknownFormats);
      if ($isData) {
        var $format = "format" + $lvl, $isObject = "isObject" + $lvl, $formatType = "formatType" + $lvl;
        out += " var " + $format + " = formats[" + $schemaValue + "]; var " + $isObject + " = typeof " + $format + " == 'object' && !(" + $format + " instanceof RegExp) && " + $format + ".validate; var " + $formatType + " = " + $isObject + " && " + $format + ".type || 'string'; if (" + $isObject + ") { ";
        if (it2.async) {
          out += " var async" + $lvl + " = " + $format + ".async; ";
        }
        out += " " + $format + " = " + $format + ".validate; } if (  ";
        if ($isData) {
          out += " (" + $schemaValue + " !== undefined && typeof " + $schemaValue + " != 'string') || ";
        }
        out += " (";
        if ($unknownFormats != "ignore") {
          out += " (" + $schemaValue + " && !" + $format + " ";
          if ($allowUnknown) {
            out += " && self._opts.unknownFormats.indexOf(" + $schemaValue + ") == -1 ";
          }
          out += ") || ";
        }
        out += " (" + $format + " && " + $formatType + " == '" + $ruleType + "' && !(typeof " + $format + " == 'function' ? ";
        if (it2.async) {
          out += " (async" + $lvl + " ? await " + $format + "(" + $data + ") : " + $format + "(" + $data + ")) ";
        } else {
          out += " " + $format + "(" + $data + ") ";
        }
        out += " : " + $format + ".test(" + $data + "))))) {";
      } else {
        var $format = it2.formats[$schema];
        if (!$format) {
          if ($unknownFormats == "ignore") {
            it2.logger.warn('unknown format "' + $schema + '" ignored in schema at path "' + it2.errSchemaPath + '"');
            if ($breakOnError) {
              out += " if (true) { ";
            }
            return out;
          } else if ($allowUnknown && $unknownFormats.indexOf($schema) >= 0) {
            if ($breakOnError) {
              out += " if (true) { ";
            }
            return out;
          } else {
            throw new Error('unknown format "' + $schema + '" is used in schema at path "' + it2.errSchemaPath + '"');
          }
        }
        var $isObject = typeof $format == "object" && !($format instanceof RegExp) && $format.validate;
        var $formatType = $isObject && $format.type || "string";
        if ($isObject) {
          var $async = $format.async === true;
          $format = $format.validate;
        }
        if ($formatType != $ruleType) {
          if ($breakOnError) {
            out += " if (true) { ";
          }
          return out;
        }
        if ($async) {
          if (!it2.async) throw new Error("async format in sync schema");
          var $formatRef = "formats" + it2.util.getProperty($schema) + ".validate";
          out += " if (!(await " + $formatRef + "(" + $data + "))) { ";
        } else {
          out += " if (! ";
          var $formatRef = "formats" + it2.util.getProperty($schema);
          if ($isObject) $formatRef += ".validate";
          if (typeof $format == "function") {
            out += " " + $formatRef + "(" + $data + ") ";
          } else {
            out += " " + $formatRef + ".test(" + $data + ") ";
          }
          out += ") { ";
        }
      }
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: 'format' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { format:  ";
        if ($isData) {
          out += "" + $schemaValue;
        } else {
          out += "" + it2.util.toQuotedString($schema);
        }
        out += "  } ";
        if (it2.opts.messages !== false) {
          out += ` , message: 'should match format "`;
          if ($isData) {
            out += "' + " + $schemaValue + " + '";
          } else {
            out += "" + it2.util.escapeQuotes($schema);
          }
          out += `"' `;
        }
        if (it2.opts.verbose) {
          out += " , schema:  ";
          if ($isData) {
            out += "validate.schema" + $schemaPath;
          } else {
            out += "" + it2.util.toQuotedString($schema);
          }
          out += "         , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += " } ";
      if ($breakOnError) {
        out += " else { ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/if.js
var require_if = __commonJS({
  "node_modules/ajv/lib/dotjs/if.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_if(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $errs = "errs__" + $lvl;
      var $it = it2.util.copy(it2);
      $it.level++;
      var $nextValid = "valid" + $it.level;
      var $thenSch = it2.schema["then"], $elseSch = it2.schema["else"], $thenPresent = $thenSch !== void 0 && (it2.opts.strictKeywords ? typeof $thenSch == "object" && Object.keys($thenSch).length > 0 || $thenSch === false : it2.util.schemaHasRules($thenSch, it2.RULES.all)), $elsePresent = $elseSch !== void 0 && (it2.opts.strictKeywords ? typeof $elseSch == "object" && Object.keys($elseSch).length > 0 || $elseSch === false : it2.util.schemaHasRules($elseSch, it2.RULES.all)), $currentBaseId = $it.baseId;
      if ($thenPresent || $elsePresent) {
        var $ifClause;
        $it.createErrors = false;
        $it.schema = $schema;
        $it.schemaPath = $schemaPath;
        $it.errSchemaPath = $errSchemaPath;
        out += " var " + $errs + " = errors; var " + $valid + " = true;  ";
        var $wasComposite = it2.compositeRule;
        it2.compositeRule = $it.compositeRule = true;
        out += "  " + it2.validate($it) + " ";
        $it.baseId = $currentBaseId;
        $it.createErrors = true;
        out += "  errors = " + $errs + "; if (vErrors !== null) { if (" + $errs + ") vErrors.length = " + $errs + "; else vErrors = null; }  ";
        it2.compositeRule = $it.compositeRule = $wasComposite;
        if ($thenPresent) {
          out += " if (" + $nextValid + ") {  ";
          $it.schema = it2.schema["then"];
          $it.schemaPath = it2.schemaPath + ".then";
          $it.errSchemaPath = it2.errSchemaPath + "/then";
          out += "  " + it2.validate($it) + " ";
          $it.baseId = $currentBaseId;
          out += " " + $valid + " = " + $nextValid + "; ";
          if ($thenPresent && $elsePresent) {
            $ifClause = "ifClause" + $lvl;
            out += " var " + $ifClause + " = 'then'; ";
          } else {
            $ifClause = "'then'";
          }
          out += " } ";
          if ($elsePresent) {
            out += " else { ";
          }
        } else {
          out += " if (!" + $nextValid + ") { ";
        }
        if ($elsePresent) {
          $it.schema = it2.schema["else"];
          $it.schemaPath = it2.schemaPath + ".else";
          $it.errSchemaPath = it2.errSchemaPath + "/else";
          out += "  " + it2.validate($it) + " ";
          $it.baseId = $currentBaseId;
          out += " " + $valid + " = " + $nextValid + "; ";
          if ($thenPresent && $elsePresent) {
            $ifClause = "ifClause" + $lvl;
            out += " var " + $ifClause + " = 'else'; ";
          } else {
            $ifClause = "'else'";
          }
          out += " } ";
        }
        out += " if (!" + $valid + ") {   var err =   ";
        if (it2.createErrors !== false) {
          out += " { keyword: 'if' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { failingKeyword: " + $ifClause + " } ";
          if (it2.opts.messages !== false) {
            out += ` , message: 'should match "' + ` + $ifClause + ` + '" schema' `;
          }
          if (it2.opts.verbose) {
            out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
          }
          out += " } ";
        } else {
          out += " {} ";
        }
        out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
        if (!it2.compositeRule && $breakOnError) {
          if (it2.async) {
            out += " throw new ValidationError(vErrors); ";
          } else {
            out += " validate.errors = vErrors; return false; ";
          }
        }
        out += " }   ";
        if ($breakOnError) {
          out += " else { ";
        }
      } else {
        if ($breakOnError) {
          out += " if (true) { ";
        }
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/items.js
var require_items = __commonJS({
  "node_modules/ajv/lib/dotjs/items.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_items(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $errs = "errs__" + $lvl;
      var $it = it2.util.copy(it2);
      var $closingBraces = "";
      $it.level++;
      var $nextValid = "valid" + $it.level;
      var $idx = "i" + $lvl, $dataNxt = $it.dataLevel = it2.dataLevel + 1, $nextData = "data" + $dataNxt, $currentBaseId = it2.baseId;
      out += "var " + $errs + " = errors;var " + $valid + ";";
      if (Array.isArray($schema)) {
        var $additionalItems = it2.schema.additionalItems;
        if ($additionalItems === false) {
          out += " " + $valid + " = " + $data + ".length <= " + $schema.length + "; ";
          var $currErrSchemaPath = $errSchemaPath;
          $errSchemaPath = it2.errSchemaPath + "/additionalItems";
          out += "  if (!" + $valid + ") {   ";
          var $$outStack = $$outStack || [];
          $$outStack.push(out);
          out = "";
          if (it2.createErrors !== false) {
            out += " { keyword: 'additionalItems' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { limit: " + $schema.length + " } ";
            if (it2.opts.messages !== false) {
              out += " , message: 'should NOT have more than " + $schema.length + " items' ";
            }
            if (it2.opts.verbose) {
              out += " , schema: false , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
            }
            out += " } ";
          } else {
            out += " {} ";
          }
          var __err = out;
          out = $$outStack.pop();
          if (!it2.compositeRule && $breakOnError) {
            if (it2.async) {
              out += " throw new ValidationError([" + __err + "]); ";
            } else {
              out += " validate.errors = [" + __err + "]; return false; ";
            }
          } else {
            out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
          }
          out += " } ";
          $errSchemaPath = $currErrSchemaPath;
          if ($breakOnError) {
            $closingBraces += "}";
            out += " else { ";
          }
        }
        var arr1 = $schema;
        if (arr1) {
          var $sch, $i2 = -1, l1 = arr1.length - 1;
          while ($i2 < l1) {
            $sch = arr1[$i2 += 1];
            if (it2.opts.strictKeywords ? typeof $sch == "object" && Object.keys($sch).length > 0 || $sch === false : it2.util.schemaHasRules($sch, it2.RULES.all)) {
              out += " " + $nextValid + " = true; if (" + $data + ".length > " + $i2 + ") { ";
              var $passData = $data + "[" + $i2 + "]";
              $it.schema = $sch;
              $it.schemaPath = $schemaPath + "[" + $i2 + "]";
              $it.errSchemaPath = $errSchemaPath + "/" + $i2;
              $it.errorPath = it2.util.getPathExpr(it2.errorPath, $i2, it2.opts.jsonPointers, true);
              $it.dataPathArr[$dataNxt] = $i2;
              var $code = it2.validate($it);
              $it.baseId = $currentBaseId;
              if (it2.util.varOccurences($code, $nextData) < 2) {
                out += " " + it2.util.varReplace($code, $nextData, $passData) + " ";
              } else {
                out += " var " + $nextData + " = " + $passData + "; " + $code + " ";
              }
              out += " }  ";
              if ($breakOnError) {
                out += " if (" + $nextValid + ") { ";
                $closingBraces += "}";
              }
            }
          }
        }
        if (typeof $additionalItems == "object" && (it2.opts.strictKeywords ? typeof $additionalItems == "object" && Object.keys($additionalItems).length > 0 || $additionalItems === false : it2.util.schemaHasRules($additionalItems, it2.RULES.all))) {
          $it.schema = $additionalItems;
          $it.schemaPath = it2.schemaPath + ".additionalItems";
          $it.errSchemaPath = it2.errSchemaPath + "/additionalItems";
          out += " " + $nextValid + " = true; if (" + $data + ".length > " + $schema.length + ") {  for (var " + $idx + " = " + $schema.length + "; " + $idx + " < " + $data + ".length; " + $idx + "++) { ";
          $it.errorPath = it2.util.getPathExpr(it2.errorPath, $idx, it2.opts.jsonPointers, true);
          var $passData = $data + "[" + $idx + "]";
          $it.dataPathArr[$dataNxt] = $idx;
          var $code = it2.validate($it);
          $it.baseId = $currentBaseId;
          if (it2.util.varOccurences($code, $nextData) < 2) {
            out += " " + it2.util.varReplace($code, $nextData, $passData) + " ";
          } else {
            out += " var " + $nextData + " = " + $passData + "; " + $code + " ";
          }
          if ($breakOnError) {
            out += " if (!" + $nextValid + ") break; ";
          }
          out += " } }  ";
          if ($breakOnError) {
            out += " if (" + $nextValid + ") { ";
            $closingBraces += "}";
          }
        }
      } else if (it2.opts.strictKeywords ? typeof $schema == "object" && Object.keys($schema).length > 0 || $schema === false : it2.util.schemaHasRules($schema, it2.RULES.all)) {
        $it.schema = $schema;
        $it.schemaPath = $schemaPath;
        $it.errSchemaPath = $errSchemaPath;
        out += "  for (var " + $idx + " = 0; " + $idx + " < " + $data + ".length; " + $idx + "++) { ";
        $it.errorPath = it2.util.getPathExpr(it2.errorPath, $idx, it2.opts.jsonPointers, true);
        var $passData = $data + "[" + $idx + "]";
        $it.dataPathArr[$dataNxt] = $idx;
        var $code = it2.validate($it);
        $it.baseId = $currentBaseId;
        if (it2.util.varOccurences($code, $nextData) < 2) {
          out += " " + it2.util.varReplace($code, $nextData, $passData) + " ";
        } else {
          out += " var " + $nextData + " = " + $passData + "; " + $code + " ";
        }
        if ($breakOnError) {
          out += " if (!" + $nextValid + ") break; ";
        }
        out += " }";
      }
      if ($breakOnError) {
        out += " " + $closingBraces + " if (" + $errs + " == errors) {";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/_limit.js
var require_limit = __commonJS({
  "node_modules/ajv/lib/dotjs/_limit.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate__limit(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $errorKeyword;
      var $data = "data" + ($dataLvl || "");
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      var $isMax = $keyword == "maximum", $exclusiveKeyword = $isMax ? "exclusiveMaximum" : "exclusiveMinimum", $schemaExcl = it2.schema[$exclusiveKeyword], $isDataExcl = it2.opts.$data && $schemaExcl && $schemaExcl.$data, $op = $isMax ? "<" : ">", $notOp = $isMax ? ">" : "<", $errorKeyword = void 0;
      if (!($isData || typeof $schema == "number" || $schema === void 0)) {
        throw new Error($keyword + " must be number");
      }
      if (!($isDataExcl || $schemaExcl === void 0 || typeof $schemaExcl == "number" || typeof $schemaExcl == "boolean")) {
        throw new Error($exclusiveKeyword + " must be number or boolean");
      }
      if ($isDataExcl) {
        var $schemaValueExcl = it2.util.getData($schemaExcl.$data, $dataLvl, it2.dataPathArr), $exclusive = "exclusive" + $lvl, $exclType = "exclType" + $lvl, $exclIsNumber = "exclIsNumber" + $lvl, $opExpr = "op" + $lvl, $opStr = "' + " + $opExpr + " + '";
        out += " var schemaExcl" + $lvl + " = " + $schemaValueExcl + "; ";
        $schemaValueExcl = "schemaExcl" + $lvl;
        out += " var " + $exclusive + "; var " + $exclType + " = typeof " + $schemaValueExcl + "; if (" + $exclType + " != 'boolean' && " + $exclType + " != 'undefined' && " + $exclType + " != 'number') { ";
        var $errorKeyword = $exclusiveKeyword;
        var $$outStack = $$outStack || [];
        $$outStack.push(out);
        out = "";
        if (it2.createErrors !== false) {
          out += " { keyword: '" + ($errorKeyword || "_exclusiveLimit") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: {} ";
          if (it2.opts.messages !== false) {
            out += " , message: '" + $exclusiveKeyword + " should be boolean' ";
          }
          if (it2.opts.verbose) {
            out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
          }
          out += " } ";
        } else {
          out += " {} ";
        }
        var __err = out;
        out = $$outStack.pop();
        if (!it2.compositeRule && $breakOnError) {
          if (it2.async) {
            out += " throw new ValidationError([" + __err + "]); ";
          } else {
            out += " validate.errors = [" + __err + "]; return false; ";
          }
        } else {
          out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
        }
        out += " } else if ( ";
        if ($isData) {
          out += " (" + $schemaValue + " !== undefined && typeof " + $schemaValue + " != 'number') || ";
        }
        out += " " + $exclType + " == 'number' ? ( (" + $exclusive + " = " + $schemaValue + " === undefined || " + $schemaValueExcl + " " + $op + "= " + $schemaValue + ") ? " + $data + " " + $notOp + "= " + $schemaValueExcl + " : " + $data + " " + $notOp + " " + $schemaValue + " ) : ( (" + $exclusive + " = " + $schemaValueExcl + " === true) ? " + $data + " " + $notOp + "= " + $schemaValue + " : " + $data + " " + $notOp + " " + $schemaValue + " ) || " + $data + " !== " + $data + ") { var op" + $lvl + " = " + $exclusive + " ? '" + $op + "' : '" + $op + "='; ";
        if ($schema === void 0) {
          $errorKeyword = $exclusiveKeyword;
          $errSchemaPath = it2.errSchemaPath + "/" + $exclusiveKeyword;
          $schemaValue = $schemaValueExcl;
          $isData = $isDataExcl;
        }
      } else {
        var $exclIsNumber = typeof $schemaExcl == "number", $opStr = $op;
        if ($exclIsNumber && $isData) {
          var $opExpr = "'" + $opStr + "'";
          out += " if ( ";
          if ($isData) {
            out += " (" + $schemaValue + " !== undefined && typeof " + $schemaValue + " != 'number') || ";
          }
          out += " ( " + $schemaValue + " === undefined || " + $schemaExcl + " " + $op + "= " + $schemaValue + " ? " + $data + " " + $notOp + "= " + $schemaExcl + " : " + $data + " " + $notOp + " " + $schemaValue + " ) || " + $data + " !== " + $data + ") { ";
        } else {
          if ($exclIsNumber && $schema === void 0) {
            $exclusive = true;
            $errorKeyword = $exclusiveKeyword;
            $errSchemaPath = it2.errSchemaPath + "/" + $exclusiveKeyword;
            $schemaValue = $schemaExcl;
            $notOp += "=";
          } else {
            if ($exclIsNumber) $schemaValue = Math[$isMax ? "min" : "max"]($schemaExcl, $schema);
            if ($schemaExcl === ($exclIsNumber ? $schemaValue : true)) {
              $exclusive = true;
              $errorKeyword = $exclusiveKeyword;
              $errSchemaPath = it2.errSchemaPath + "/" + $exclusiveKeyword;
              $notOp += "=";
            } else {
              $exclusive = false;
              $opStr += "=";
            }
          }
          var $opExpr = "'" + $opStr + "'";
          out += " if ( ";
          if ($isData) {
            out += " (" + $schemaValue + " !== undefined && typeof " + $schemaValue + " != 'number') || ";
          }
          out += " " + $data + " " + $notOp + " " + $schemaValue + " || " + $data + " !== " + $data + ") { ";
        }
      }
      $errorKeyword = $errorKeyword || $keyword;
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: '" + ($errorKeyword || "_limit") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { comparison: " + $opExpr + ", limit: " + $schemaValue + ", exclusive: " + $exclusive + " } ";
        if (it2.opts.messages !== false) {
          out += " , message: 'should be " + $opStr + " ";
          if ($isData) {
            out += "' + " + $schemaValue;
          } else {
            out += "" + $schemaValue + "'";
          }
        }
        if (it2.opts.verbose) {
          out += " , schema:  ";
          if ($isData) {
            out += "validate.schema" + $schemaPath;
          } else {
            out += "" + $schema;
          }
          out += "         , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += " } ";
      if ($breakOnError) {
        out += " else { ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/_limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/lib/dotjs/_limitItems.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate__limitItems(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $errorKeyword;
      var $data = "data" + ($dataLvl || "");
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      if (!($isData || typeof $schema == "number")) {
        throw new Error($keyword + " must be number");
      }
      var $op = $keyword == "maxItems" ? ">" : "<";
      out += "if ( ";
      if ($isData) {
        out += " (" + $schemaValue + " !== undefined && typeof " + $schemaValue + " != 'number') || ";
      }
      out += " " + $data + ".length " + $op + " " + $schemaValue + ") { ";
      var $errorKeyword = $keyword;
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: '" + ($errorKeyword || "_limitItems") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { limit: " + $schemaValue + " } ";
        if (it2.opts.messages !== false) {
          out += " , message: 'should NOT have ";
          if ($keyword == "maxItems") {
            out += "more";
          } else {
            out += "fewer";
          }
          out += " than ";
          if ($isData) {
            out += "' + " + $schemaValue + " + '";
          } else {
            out += "" + $schema;
          }
          out += " items' ";
        }
        if (it2.opts.verbose) {
          out += " , schema:  ";
          if ($isData) {
            out += "validate.schema" + $schemaPath;
          } else {
            out += "" + $schema;
          }
          out += "         , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += "} ";
      if ($breakOnError) {
        out += " else { ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/_limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/lib/dotjs/_limitLength.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate__limitLength(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $errorKeyword;
      var $data = "data" + ($dataLvl || "");
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      if (!($isData || typeof $schema == "number")) {
        throw new Error($keyword + " must be number");
      }
      var $op = $keyword == "maxLength" ? ">" : "<";
      out += "if ( ";
      if ($isData) {
        out += " (" + $schemaValue + " !== undefined && typeof " + $schemaValue + " != 'number') || ";
      }
      if (it2.opts.unicode === false) {
        out += " " + $data + ".length ";
      } else {
        out += " ucs2length(" + $data + ") ";
      }
      out += " " + $op + " " + $schemaValue + ") { ";
      var $errorKeyword = $keyword;
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: '" + ($errorKeyword || "_limitLength") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { limit: " + $schemaValue + " } ";
        if (it2.opts.messages !== false) {
          out += " , message: 'should NOT be ";
          if ($keyword == "maxLength") {
            out += "longer";
          } else {
            out += "shorter";
          }
          out += " than ";
          if ($isData) {
            out += "' + " + $schemaValue + " + '";
          } else {
            out += "" + $schema;
          }
          out += " characters' ";
        }
        if (it2.opts.verbose) {
          out += " , schema:  ";
          if ($isData) {
            out += "validate.schema" + $schemaPath;
          } else {
            out += "" + $schema;
          }
          out += "         , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += "} ";
      if ($breakOnError) {
        out += " else { ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/_limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/lib/dotjs/_limitProperties.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate__limitProperties(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $errorKeyword;
      var $data = "data" + ($dataLvl || "");
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      if (!($isData || typeof $schema == "number")) {
        throw new Error($keyword + " must be number");
      }
      var $op = $keyword == "maxProperties" ? ">" : "<";
      out += "if ( ";
      if ($isData) {
        out += " (" + $schemaValue + " !== undefined && typeof " + $schemaValue + " != 'number') || ";
      }
      out += " Object.keys(" + $data + ").length " + $op + " " + $schemaValue + ") { ";
      var $errorKeyword = $keyword;
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: '" + ($errorKeyword || "_limitProperties") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { limit: " + $schemaValue + " } ";
        if (it2.opts.messages !== false) {
          out += " , message: 'should NOT have ";
          if ($keyword == "maxProperties") {
            out += "more";
          } else {
            out += "fewer";
          }
          out += " than ";
          if ($isData) {
            out += "' + " + $schemaValue + " + '";
          } else {
            out += "" + $schema;
          }
          out += " properties' ";
        }
        if (it2.opts.verbose) {
          out += " , schema:  ";
          if ($isData) {
            out += "validate.schema" + $schemaPath;
          } else {
            out += "" + $schema;
          }
          out += "         , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += "} ";
      if ($breakOnError) {
        out += " else { ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/lib/dotjs/multipleOf.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_multipleOf(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      if (!($isData || typeof $schema == "number")) {
        throw new Error($keyword + " must be number");
      }
      out += "var division" + $lvl + ";if (";
      if ($isData) {
        out += " " + $schemaValue + " !== undefined && ( typeof " + $schemaValue + " != 'number' || ";
      }
      out += " (division" + $lvl + " = " + $data + " / " + $schemaValue + ", ";
      if (it2.opts.multipleOfPrecision) {
        out += " Math.abs(Math.round(division" + $lvl + ") - division" + $lvl + ") > 1e-" + it2.opts.multipleOfPrecision + " ";
      } else {
        out += " division" + $lvl + " !== parseInt(division" + $lvl + ") ";
      }
      out += " ) ";
      if ($isData) {
        out += "  )  ";
      }
      out += " ) {   ";
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: 'multipleOf' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { multipleOf: " + $schemaValue + " } ";
        if (it2.opts.messages !== false) {
          out += " , message: 'should be multiple of ";
          if ($isData) {
            out += "' + " + $schemaValue;
          } else {
            out += "" + $schemaValue + "'";
          }
        }
        if (it2.opts.verbose) {
          out += " , schema:  ";
          if ($isData) {
            out += "validate.schema" + $schemaPath;
          } else {
            out += "" + $schema;
          }
          out += "         , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += "} ";
      if ($breakOnError) {
        out += " else { ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/not.js
var require_not = __commonJS({
  "node_modules/ajv/lib/dotjs/not.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_not(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $errs = "errs__" + $lvl;
      var $it = it2.util.copy(it2);
      $it.level++;
      var $nextValid = "valid" + $it.level;
      if (it2.opts.strictKeywords ? typeof $schema == "object" && Object.keys($schema).length > 0 || $schema === false : it2.util.schemaHasRules($schema, it2.RULES.all)) {
        $it.schema = $schema;
        $it.schemaPath = $schemaPath;
        $it.errSchemaPath = $errSchemaPath;
        out += " var " + $errs + " = errors;  ";
        var $wasComposite = it2.compositeRule;
        it2.compositeRule = $it.compositeRule = true;
        $it.createErrors = false;
        var $allErrorsOption;
        if ($it.opts.allErrors) {
          $allErrorsOption = $it.opts.allErrors;
          $it.opts.allErrors = false;
        }
        out += " " + it2.validate($it) + " ";
        $it.createErrors = true;
        if ($allErrorsOption) $it.opts.allErrors = $allErrorsOption;
        it2.compositeRule = $it.compositeRule = $wasComposite;
        out += " if (" + $nextValid + ") {   ";
        var $$outStack = $$outStack || [];
        $$outStack.push(out);
        out = "";
        if (it2.createErrors !== false) {
          out += " { keyword: 'not' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: {} ";
          if (it2.opts.messages !== false) {
            out += " , message: 'should NOT be valid' ";
          }
          if (it2.opts.verbose) {
            out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
          }
          out += " } ";
        } else {
          out += " {} ";
        }
        var __err = out;
        out = $$outStack.pop();
        if (!it2.compositeRule && $breakOnError) {
          if (it2.async) {
            out += " throw new ValidationError([" + __err + "]); ";
          } else {
            out += " validate.errors = [" + __err + "]; return false; ";
          }
        } else {
          out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
        }
        out += " } else {  errors = " + $errs + "; if (vErrors !== null) { if (" + $errs + ") vErrors.length = " + $errs + "; else vErrors = null; } ";
        if (it2.opts.allErrors) {
          out += " } ";
        }
      } else {
        out += "  var err =   ";
        if (it2.createErrors !== false) {
          out += " { keyword: 'not' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: {} ";
          if (it2.opts.messages !== false) {
            out += " , message: 'should NOT be valid' ";
          }
          if (it2.opts.verbose) {
            out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
          }
          out += " } ";
        } else {
          out += " {} ";
        }
        out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
        if ($breakOnError) {
          out += " if (false) { ";
        }
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/lib/dotjs/oneOf.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_oneOf(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $errs = "errs__" + $lvl;
      var $it = it2.util.copy(it2);
      var $closingBraces = "";
      $it.level++;
      var $nextValid = "valid" + $it.level;
      var $currentBaseId = $it.baseId, $prevValid = "prevValid" + $lvl, $passingSchemas = "passingSchemas" + $lvl;
      out += "var " + $errs + " = errors , " + $prevValid + " = false , " + $valid + " = false , " + $passingSchemas + " = null; ";
      var $wasComposite = it2.compositeRule;
      it2.compositeRule = $it.compositeRule = true;
      var arr1 = $schema;
      if (arr1) {
        var $sch, $i2 = -1, l1 = arr1.length - 1;
        while ($i2 < l1) {
          $sch = arr1[$i2 += 1];
          if (it2.opts.strictKeywords ? typeof $sch == "object" && Object.keys($sch).length > 0 || $sch === false : it2.util.schemaHasRules($sch, it2.RULES.all)) {
            $it.schema = $sch;
            $it.schemaPath = $schemaPath + "[" + $i2 + "]";
            $it.errSchemaPath = $errSchemaPath + "/" + $i2;
            out += "  " + it2.validate($it) + " ";
            $it.baseId = $currentBaseId;
          } else {
            out += " var " + $nextValid + " = true; ";
          }
          if ($i2) {
            out += " if (" + $nextValid + " && " + $prevValid + ") { " + $valid + " = false; " + $passingSchemas + " = [" + $passingSchemas + ", " + $i2 + "]; } else { ";
            $closingBraces += "}";
          }
          out += " if (" + $nextValid + ") { " + $valid + " = " + $prevValid + " = true; " + $passingSchemas + " = " + $i2 + "; }";
        }
      }
      it2.compositeRule = $it.compositeRule = $wasComposite;
      out += "" + $closingBraces + "if (!" + $valid + ") {   var err =   ";
      if (it2.createErrors !== false) {
        out += " { keyword: 'oneOf' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { passingSchemas: " + $passingSchemas + " } ";
        if (it2.opts.messages !== false) {
          out += " , message: 'should match exactly one schema in oneOf' ";
        }
        if (it2.opts.verbose) {
          out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError(vErrors); ";
        } else {
          out += " validate.errors = vErrors; return false; ";
        }
      }
      out += "} else {  errors = " + $errs + "; if (vErrors !== null) { if (" + $errs + ") vErrors.length = " + $errs + "; else vErrors = null; }";
      if (it2.opts.allErrors) {
        out += " } ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/lib/dotjs/pattern.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_pattern(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      var $regExpCode = it2.opts.regExp ? "regExp" : "new RegExp";
      if ($isData) {
        out += " var " + $valid + " = true; try { " + $valid + " = " + $regExpCode + "(" + $schemaValue + ").test(" + $data + "); } catch(e) { " + $valid + " = false; } if ( ";
        if ($isData) {
          out += " (" + $schemaValue + " !== undefined && typeof " + $schemaValue + " != 'string') || ";
        }
        out += " !" + $valid + ") {";
      } else {
        var $regexp = it2.usePattern($schema);
        out += " if ( ";
        if ($isData) {
          out += " (" + $schemaValue + " !== undefined && typeof " + $schemaValue + " != 'string') || ";
        }
        out += " !" + $regexp + ".test(" + $data + ") ) {";
      }
      var $$outStack = $$outStack || [];
      $$outStack.push(out);
      out = "";
      if (it2.createErrors !== false) {
        out += " { keyword: 'pattern' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { pattern:  ";
        if ($isData) {
          out += "" + $schemaValue;
        } else {
          out += "" + it2.util.toQuotedString($schema);
        }
        out += "  } ";
        if (it2.opts.messages !== false) {
          out += ` , message: 'should match pattern "`;
          if ($isData) {
            out += "' + " + $schemaValue + " + '";
          } else {
            out += "" + it2.util.escapeQuotes($schema);
          }
          out += `"' `;
        }
        if (it2.opts.verbose) {
          out += " , schema:  ";
          if ($isData) {
            out += "validate.schema" + $schemaPath;
          } else {
            out += "" + it2.util.toQuotedString($schema);
          }
          out += "         , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
        }
        out += " } ";
      } else {
        out += " {} ";
      }
      var __err = out;
      out = $$outStack.pop();
      if (!it2.compositeRule && $breakOnError) {
        if (it2.async) {
          out += " throw new ValidationError([" + __err + "]); ";
        } else {
          out += " validate.errors = [" + __err + "]; return false; ";
        }
      } else {
        out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
      }
      out += "} ";
      if ($breakOnError) {
        out += " else { ";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/lib/dotjs/properties.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_properties(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $errs = "errs__" + $lvl;
      var $it = it2.util.copy(it2);
      var $closingBraces = "";
      $it.level++;
      var $nextValid = "valid" + $it.level;
      var $key = "key" + $lvl, $idx = "idx" + $lvl, $dataNxt = $it.dataLevel = it2.dataLevel + 1, $nextData = "data" + $dataNxt, $dataProperties = "dataProperties" + $lvl;
      var $schemaKeys = Object.keys($schema || {}).filter(notProto), $pProperties = it2.schema.patternProperties || {}, $pPropertyKeys = Object.keys($pProperties).filter(notProto), $aProperties = it2.schema.additionalProperties, $someProperties = $schemaKeys.length || $pPropertyKeys.length, $noAdditional = $aProperties === false, $additionalIsSchema = typeof $aProperties == "object" && Object.keys($aProperties).length, $removeAdditional = it2.opts.removeAdditional, $checkAdditional = $noAdditional || $additionalIsSchema || $removeAdditional, $ownProperties = it2.opts.ownProperties, $currentBaseId = it2.baseId;
      var $required = it2.schema.required;
      if ($required && !(it2.opts.$data && $required.$data) && $required.length < it2.opts.loopRequired) {
        var $requiredHash = it2.util.toHash($required);
      }
      function notProto(p2) {
        return p2 !== "__proto__";
      }
      out += "var " + $errs + " = errors;var " + $nextValid + " = true;";
      if ($ownProperties) {
        out += " var " + $dataProperties + " = undefined;";
      }
      if ($checkAdditional) {
        if ($ownProperties) {
          out += " " + $dataProperties + " = " + $dataProperties + " || Object.keys(" + $data + "); for (var " + $idx + "=0; " + $idx + "<" + $dataProperties + ".length; " + $idx + "++) { var " + $key + " = " + $dataProperties + "[" + $idx + "]; ";
        } else {
          out += " for (var " + $key + " in " + $data + ") { ";
        }
        if ($someProperties) {
          out += " var isAdditional" + $lvl + " = !(false ";
          if ($schemaKeys.length) {
            if ($schemaKeys.length > 8) {
              out += " || validate.schema" + $schemaPath + ".hasOwnProperty(" + $key + ") ";
            } else {
              var arr1 = $schemaKeys;
              if (arr1) {
                var $propertyKey, i1 = -1, l1 = arr1.length - 1;
                while (i1 < l1) {
                  $propertyKey = arr1[i1 += 1];
                  out += " || " + $key + " == " + it2.util.toQuotedString($propertyKey) + " ";
                }
              }
            }
          }
          if ($pPropertyKeys.length) {
            var arr2 = $pPropertyKeys;
            if (arr2) {
              var $pProperty, $i2 = -1, l2 = arr2.length - 1;
              while ($i2 < l2) {
                $pProperty = arr2[$i2 += 1];
                out += " || " + it2.usePattern($pProperty) + ".test(" + $key + ") ";
              }
            }
          }
          out += " ); if (isAdditional" + $lvl + ") { ";
        }
        if ($removeAdditional == "all") {
          out += " delete " + $data + "[" + $key + "]; ";
        } else {
          var $currentErrorPath = it2.errorPath;
          var $additionalProperty = "' + " + $key + " + '";
          if (it2.opts._errorDataPathProperty) {
            it2.errorPath = it2.util.getPathExpr(it2.errorPath, $key, it2.opts.jsonPointers);
          }
          if ($noAdditional) {
            if ($removeAdditional) {
              out += " delete " + $data + "[" + $key + "]; ";
            } else {
              out += " " + $nextValid + " = false; ";
              var $currErrSchemaPath = $errSchemaPath;
              $errSchemaPath = it2.errSchemaPath + "/additionalProperties";
              var $$outStack = $$outStack || [];
              $$outStack.push(out);
              out = "";
              if (it2.createErrors !== false) {
                out += " { keyword: 'additionalProperties' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { additionalProperty: '" + $additionalProperty + "' } ";
                if (it2.opts.messages !== false) {
                  out += " , message: '";
                  if (it2.opts._errorDataPathProperty) {
                    out += "is an invalid additional property";
                  } else {
                    out += "should NOT have additional properties";
                  }
                  out += "' ";
                }
                if (it2.opts.verbose) {
                  out += " , schema: false , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
                }
                out += " } ";
              } else {
                out += " {} ";
              }
              var __err = out;
              out = $$outStack.pop();
              if (!it2.compositeRule && $breakOnError) {
                if (it2.async) {
                  out += " throw new ValidationError([" + __err + "]); ";
                } else {
                  out += " validate.errors = [" + __err + "]; return false; ";
                }
              } else {
                out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
              }
              $errSchemaPath = $currErrSchemaPath;
              if ($breakOnError) {
                out += " break; ";
              }
            }
          } else if ($additionalIsSchema) {
            if ($removeAdditional == "failing") {
              out += " var " + $errs + " = errors;  ";
              var $wasComposite = it2.compositeRule;
              it2.compositeRule = $it.compositeRule = true;
              $it.schema = $aProperties;
              $it.schemaPath = it2.schemaPath + ".additionalProperties";
              $it.errSchemaPath = it2.errSchemaPath + "/additionalProperties";
              $it.errorPath = it2.opts._errorDataPathProperty ? it2.errorPath : it2.util.getPathExpr(it2.errorPath, $key, it2.opts.jsonPointers);
              var $passData = $data + "[" + $key + "]";
              $it.dataPathArr[$dataNxt] = $key;
              var $code = it2.validate($it);
              $it.baseId = $currentBaseId;
              if (it2.util.varOccurences($code, $nextData) < 2) {
                out += " " + it2.util.varReplace($code, $nextData, $passData) + " ";
              } else {
                out += " var " + $nextData + " = " + $passData + "; " + $code + " ";
              }
              out += " if (!" + $nextValid + ") { errors = " + $errs + "; if (validate.errors !== null) { if (errors) validate.errors.length = errors; else validate.errors = null; } delete " + $data + "[" + $key + "]; }  ";
              it2.compositeRule = $it.compositeRule = $wasComposite;
            } else {
              $it.schema = $aProperties;
              $it.schemaPath = it2.schemaPath + ".additionalProperties";
              $it.errSchemaPath = it2.errSchemaPath + "/additionalProperties";
              $it.errorPath = it2.opts._errorDataPathProperty ? it2.errorPath : it2.util.getPathExpr(it2.errorPath, $key, it2.opts.jsonPointers);
              var $passData = $data + "[" + $key + "]";
              $it.dataPathArr[$dataNxt] = $key;
              var $code = it2.validate($it);
              $it.baseId = $currentBaseId;
              if (it2.util.varOccurences($code, $nextData) < 2) {
                out += " " + it2.util.varReplace($code, $nextData, $passData) + " ";
              } else {
                out += " var " + $nextData + " = " + $passData + "; " + $code + " ";
              }
              if ($breakOnError) {
                out += " if (!" + $nextValid + ") break; ";
              }
            }
          }
          it2.errorPath = $currentErrorPath;
        }
        if ($someProperties) {
          out += " } ";
        }
        out += " }  ";
        if ($breakOnError) {
          out += " if (" + $nextValid + ") { ";
          $closingBraces += "}";
        }
      }
      var $useDefaults = it2.opts.useDefaults && !it2.compositeRule;
      if ($schemaKeys.length) {
        var arr3 = $schemaKeys;
        if (arr3) {
          var $propertyKey, i3 = -1, l3 = arr3.length - 1;
          while (i3 < l3) {
            $propertyKey = arr3[i3 += 1];
            var $sch = $schema[$propertyKey];
            if (it2.opts.strictKeywords ? typeof $sch == "object" && Object.keys($sch).length > 0 || $sch === false : it2.util.schemaHasRules($sch, it2.RULES.all)) {
              var $prop = it2.util.getProperty($propertyKey), $passData = $data + $prop, $hasDefault = $useDefaults && $sch.default !== void 0;
              $it.schema = $sch;
              $it.schemaPath = $schemaPath + $prop;
              $it.errSchemaPath = $errSchemaPath + "/" + it2.util.escapeFragment($propertyKey);
              $it.errorPath = it2.util.getPath(it2.errorPath, $propertyKey, it2.opts.jsonPointers);
              $it.dataPathArr[$dataNxt] = it2.util.toQuotedString($propertyKey);
              var $code = it2.validate($it);
              $it.baseId = $currentBaseId;
              if (it2.util.varOccurences($code, $nextData) < 2) {
                $code = it2.util.varReplace($code, $nextData, $passData);
                var $useData = $passData;
              } else {
                var $useData = $nextData;
                out += " var " + $nextData + " = " + $passData + "; ";
              }
              if ($hasDefault) {
                out += " " + $code + " ";
              } else {
                if ($requiredHash && $requiredHash[$propertyKey]) {
                  out += " if ( " + $useData + " === undefined ";
                  if ($ownProperties) {
                    out += " || ! Object.prototype.hasOwnProperty.call(" + $data + ", '" + it2.util.escapeQuotes($propertyKey) + "') ";
                  }
                  out += ") { " + $nextValid + " = false; ";
                  var $currentErrorPath = it2.errorPath, $currErrSchemaPath = $errSchemaPath, $missingProperty = it2.util.escapeQuotes($propertyKey);
                  if (it2.opts._errorDataPathProperty) {
                    it2.errorPath = it2.util.getPath($currentErrorPath, $propertyKey, it2.opts.jsonPointers);
                  }
                  $errSchemaPath = it2.errSchemaPath + "/required";
                  var $$outStack = $$outStack || [];
                  $$outStack.push(out);
                  out = "";
                  if (it2.createErrors !== false) {
                    out += " { keyword: 'required' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { missingProperty: '" + $missingProperty + "' } ";
                    if (it2.opts.messages !== false) {
                      out += " , message: '";
                      if (it2.opts._errorDataPathProperty) {
                        out += "is a required property";
                      } else {
                        out += "should have required property \\'" + $missingProperty + "\\'";
                      }
                      out += "' ";
                    }
                    if (it2.opts.verbose) {
                      out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
                    }
                    out += " } ";
                  } else {
                    out += " {} ";
                  }
                  var __err = out;
                  out = $$outStack.pop();
                  if (!it2.compositeRule && $breakOnError) {
                    if (it2.async) {
                      out += " throw new ValidationError([" + __err + "]); ";
                    } else {
                      out += " validate.errors = [" + __err + "]; return false; ";
                    }
                  } else {
                    out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
                  }
                  $errSchemaPath = $currErrSchemaPath;
                  it2.errorPath = $currentErrorPath;
                  out += " } else { ";
                } else {
                  if ($breakOnError) {
                    out += " if ( " + $useData + " === undefined ";
                    if ($ownProperties) {
                      out += " || ! Object.prototype.hasOwnProperty.call(" + $data + ", '" + it2.util.escapeQuotes($propertyKey) + "') ";
                    }
                    out += ") { " + $nextValid + " = true; } else { ";
                  } else {
                    out += " if (" + $useData + " !== undefined ";
                    if ($ownProperties) {
                      out += " &&   Object.prototype.hasOwnProperty.call(" + $data + ", '" + it2.util.escapeQuotes($propertyKey) + "') ";
                    }
                    out += " ) { ";
                  }
                }
                out += " " + $code + " } ";
              }
            }
            if ($breakOnError) {
              out += " if (" + $nextValid + ") { ";
              $closingBraces += "}";
            }
          }
        }
      }
      if ($pPropertyKeys.length) {
        var arr4 = $pPropertyKeys;
        if (arr4) {
          var $pProperty, i4 = -1, l4 = arr4.length - 1;
          while (i4 < l4) {
            $pProperty = arr4[i4 += 1];
            var $sch = $pProperties[$pProperty];
            if (it2.opts.strictKeywords ? typeof $sch == "object" && Object.keys($sch).length > 0 || $sch === false : it2.util.schemaHasRules($sch, it2.RULES.all)) {
              $it.schema = $sch;
              $it.schemaPath = it2.schemaPath + ".patternProperties" + it2.util.getProperty($pProperty);
              $it.errSchemaPath = it2.errSchemaPath + "/patternProperties/" + it2.util.escapeFragment($pProperty);
              if ($ownProperties) {
                out += " " + $dataProperties + " = " + $dataProperties + " || Object.keys(" + $data + "); for (var " + $idx + "=0; " + $idx + "<" + $dataProperties + ".length; " + $idx + "++) { var " + $key + " = " + $dataProperties + "[" + $idx + "]; ";
              } else {
                out += " for (var " + $key + " in " + $data + ") { ";
              }
              out += " if (" + it2.usePattern($pProperty) + ".test(" + $key + ")) { ";
              $it.errorPath = it2.util.getPathExpr(it2.errorPath, $key, it2.opts.jsonPointers);
              var $passData = $data + "[" + $key + "]";
              $it.dataPathArr[$dataNxt] = $key;
              var $code = it2.validate($it);
              $it.baseId = $currentBaseId;
              if (it2.util.varOccurences($code, $nextData) < 2) {
                out += " " + it2.util.varReplace($code, $nextData, $passData) + " ";
              } else {
                out += " var " + $nextData + " = " + $passData + "; " + $code + " ";
              }
              if ($breakOnError) {
                out += " if (!" + $nextValid + ") break; ";
              }
              out += " } ";
              if ($breakOnError) {
                out += " else " + $nextValid + " = true; ";
              }
              out += " }  ";
              if ($breakOnError) {
                out += " if (" + $nextValid + ") { ";
                $closingBraces += "}";
              }
            }
          }
        }
      }
      if ($breakOnError) {
        out += " " + $closingBraces + " if (" + $errs + " == errors) {";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/lib/dotjs/propertyNames.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_propertyNames(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $errs = "errs__" + $lvl;
      var $it = it2.util.copy(it2);
      var $closingBraces = "";
      $it.level++;
      var $nextValid = "valid" + $it.level;
      out += "var " + $errs + " = errors;";
      if (it2.opts.strictKeywords ? typeof $schema == "object" && Object.keys($schema).length > 0 || $schema === false : it2.util.schemaHasRules($schema, it2.RULES.all)) {
        $it.schema = $schema;
        $it.schemaPath = $schemaPath;
        $it.errSchemaPath = $errSchemaPath;
        var $key = "key" + $lvl, $idx = "idx" + $lvl, $i2 = "i" + $lvl, $invalidName = "' + " + $key + " + '", $dataNxt = $it.dataLevel = it2.dataLevel + 1, $nextData = "data" + $dataNxt, $dataProperties = "dataProperties" + $lvl, $ownProperties = it2.opts.ownProperties, $currentBaseId = it2.baseId;
        if ($ownProperties) {
          out += " var " + $dataProperties + " = undefined; ";
        }
        if ($ownProperties) {
          out += " " + $dataProperties + " = " + $dataProperties + " || Object.keys(" + $data + "); for (var " + $idx + "=0; " + $idx + "<" + $dataProperties + ".length; " + $idx + "++) { var " + $key + " = " + $dataProperties + "[" + $idx + "]; ";
        } else {
          out += " for (var " + $key + " in " + $data + ") { ";
        }
        out += " var startErrs" + $lvl + " = errors; ";
        var $passData = $key;
        var $wasComposite = it2.compositeRule;
        it2.compositeRule = $it.compositeRule = true;
        var $code = it2.validate($it);
        $it.baseId = $currentBaseId;
        if (it2.util.varOccurences($code, $nextData) < 2) {
          out += " " + it2.util.varReplace($code, $nextData, $passData) + " ";
        } else {
          out += " var " + $nextData + " = " + $passData + "; " + $code + " ";
        }
        it2.compositeRule = $it.compositeRule = $wasComposite;
        out += " if (!" + $nextValid + ") { for (var " + $i2 + "=startErrs" + $lvl + "; " + $i2 + "<errors; " + $i2 + "++) { vErrors[" + $i2 + "].propertyName = " + $key + "; }   var err =   ";
        if (it2.createErrors !== false) {
          out += " { keyword: 'propertyNames' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { propertyName: '" + $invalidName + "' } ";
          if (it2.opts.messages !== false) {
            out += " , message: 'property name \\'" + $invalidName + "\\' is invalid' ";
          }
          if (it2.opts.verbose) {
            out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
          }
          out += " } ";
        } else {
          out += " {} ";
        }
        out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
        if (!it2.compositeRule && $breakOnError) {
          if (it2.async) {
            out += " throw new ValidationError(vErrors); ";
          } else {
            out += " validate.errors = vErrors; return false; ";
          }
        }
        if ($breakOnError) {
          out += " break; ";
        }
        out += " } }";
      }
      if ($breakOnError) {
        out += " " + $closingBraces + " if (" + $errs + " == errors) {";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/required.js
var require_required = __commonJS({
  "node_modules/ajv/lib/dotjs/required.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_required(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      var $vSchema = "schema" + $lvl;
      if (!$isData) {
        if ($schema.length < it2.opts.loopRequired && it2.schema.properties && Object.keys(it2.schema.properties).length) {
          var $required = [];
          var arr1 = $schema;
          if (arr1) {
            var $property, i1 = -1, l1 = arr1.length - 1;
            while (i1 < l1) {
              $property = arr1[i1 += 1];
              var $propertySch = it2.schema.properties[$property];
              if (!($propertySch && (it2.opts.strictKeywords ? typeof $propertySch == "object" && Object.keys($propertySch).length > 0 || $propertySch === false : it2.util.schemaHasRules($propertySch, it2.RULES.all)))) {
                $required[$required.length] = $property;
              }
            }
          }
        } else {
          var $required = $schema;
        }
      }
      if ($isData || $required.length) {
        var $currentErrorPath = it2.errorPath, $loopRequired = $isData || $required.length >= it2.opts.loopRequired, $ownProperties = it2.opts.ownProperties;
        if ($breakOnError) {
          out += " var missing" + $lvl + "; ";
          if ($loopRequired) {
            if (!$isData) {
              out += " var " + $vSchema + " = validate.schema" + $schemaPath + "; ";
            }
            var $i2 = "i" + $lvl, $propertyPath = "schema" + $lvl + "[" + $i2 + "]", $missingProperty = "' + " + $propertyPath + " + '";
            if (it2.opts._errorDataPathProperty) {
              it2.errorPath = it2.util.getPathExpr($currentErrorPath, $propertyPath, it2.opts.jsonPointers);
            }
            out += " var " + $valid + " = true; ";
            if ($isData) {
              out += " if (schema" + $lvl + " === undefined) " + $valid + " = true; else if (!Array.isArray(schema" + $lvl + ")) " + $valid + " = false; else {";
            }
            out += " for (var " + $i2 + " = 0; " + $i2 + " < " + $vSchema + ".length; " + $i2 + "++) { " + $valid + " = " + $data + "[" + $vSchema + "[" + $i2 + "]] !== undefined ";
            if ($ownProperties) {
              out += " &&   Object.prototype.hasOwnProperty.call(" + $data + ", " + $vSchema + "[" + $i2 + "]) ";
            }
            out += "; if (!" + $valid + ") break; } ";
            if ($isData) {
              out += "  }  ";
            }
            out += "  if (!" + $valid + ") {   ";
            var $$outStack = $$outStack || [];
            $$outStack.push(out);
            out = "";
            if (it2.createErrors !== false) {
              out += " { keyword: 'required' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { missingProperty: '" + $missingProperty + "' } ";
              if (it2.opts.messages !== false) {
                out += " , message: '";
                if (it2.opts._errorDataPathProperty) {
                  out += "is a required property";
                } else {
                  out += "should have required property \\'" + $missingProperty + "\\'";
                }
                out += "' ";
              }
              if (it2.opts.verbose) {
                out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
              }
              out += " } ";
            } else {
              out += " {} ";
            }
            var __err = out;
            out = $$outStack.pop();
            if (!it2.compositeRule && $breakOnError) {
              if (it2.async) {
                out += " throw new ValidationError([" + __err + "]); ";
              } else {
                out += " validate.errors = [" + __err + "]; return false; ";
              }
            } else {
              out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
            }
            out += " } else { ";
          } else {
            out += " if ( ";
            var arr2 = $required;
            if (arr2) {
              var $propertyKey, $i2 = -1, l2 = arr2.length - 1;
              while ($i2 < l2) {
                $propertyKey = arr2[$i2 += 1];
                if ($i2) {
                  out += " || ";
                }
                var $prop = it2.util.getProperty($propertyKey), $useData = $data + $prop;
                out += " ( ( " + $useData + " === undefined ";
                if ($ownProperties) {
                  out += " || ! Object.prototype.hasOwnProperty.call(" + $data + ", '" + it2.util.escapeQuotes($propertyKey) + "') ";
                }
                out += ") && (missing" + $lvl + " = " + it2.util.toQuotedString(it2.opts.jsonPointers ? $propertyKey : $prop) + ") ) ";
              }
            }
            out += ") {  ";
            var $propertyPath = "missing" + $lvl, $missingProperty = "' + " + $propertyPath + " + '";
            if (it2.opts._errorDataPathProperty) {
              it2.errorPath = it2.opts.jsonPointers ? it2.util.getPathExpr($currentErrorPath, $propertyPath, true) : $currentErrorPath + " + " + $propertyPath;
            }
            var $$outStack = $$outStack || [];
            $$outStack.push(out);
            out = "";
            if (it2.createErrors !== false) {
              out += " { keyword: 'required' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { missingProperty: '" + $missingProperty + "' } ";
              if (it2.opts.messages !== false) {
                out += " , message: '";
                if (it2.opts._errorDataPathProperty) {
                  out += "is a required property";
                } else {
                  out += "should have required property \\'" + $missingProperty + "\\'";
                }
                out += "' ";
              }
              if (it2.opts.verbose) {
                out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
              }
              out += " } ";
            } else {
              out += " {} ";
            }
            var __err = out;
            out = $$outStack.pop();
            if (!it2.compositeRule && $breakOnError) {
              if (it2.async) {
                out += " throw new ValidationError([" + __err + "]); ";
              } else {
                out += " validate.errors = [" + __err + "]; return false; ";
              }
            } else {
              out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
            }
            out += " } else { ";
          }
        } else {
          if ($loopRequired) {
            if (!$isData) {
              out += " var " + $vSchema + " = validate.schema" + $schemaPath + "; ";
            }
            var $i2 = "i" + $lvl, $propertyPath = "schema" + $lvl + "[" + $i2 + "]", $missingProperty = "' + " + $propertyPath + " + '";
            if (it2.opts._errorDataPathProperty) {
              it2.errorPath = it2.util.getPathExpr($currentErrorPath, $propertyPath, it2.opts.jsonPointers);
            }
            if ($isData) {
              out += " if (" + $vSchema + " && !Array.isArray(" + $vSchema + ")) {  var err =   ";
              if (it2.createErrors !== false) {
                out += " { keyword: 'required' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { missingProperty: '" + $missingProperty + "' } ";
                if (it2.opts.messages !== false) {
                  out += " , message: '";
                  if (it2.opts._errorDataPathProperty) {
                    out += "is a required property";
                  } else {
                    out += "should have required property \\'" + $missingProperty + "\\'";
                  }
                  out += "' ";
                }
                if (it2.opts.verbose) {
                  out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
                }
                out += " } ";
              } else {
                out += " {} ";
              }
              out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; } else if (" + $vSchema + " !== undefined) { ";
            }
            out += " for (var " + $i2 + " = 0; " + $i2 + " < " + $vSchema + ".length; " + $i2 + "++) { if (" + $data + "[" + $vSchema + "[" + $i2 + "]] === undefined ";
            if ($ownProperties) {
              out += " || ! Object.prototype.hasOwnProperty.call(" + $data + ", " + $vSchema + "[" + $i2 + "]) ";
            }
            out += ") {  var err =   ";
            if (it2.createErrors !== false) {
              out += " { keyword: 'required' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { missingProperty: '" + $missingProperty + "' } ";
              if (it2.opts.messages !== false) {
                out += " , message: '";
                if (it2.opts._errorDataPathProperty) {
                  out += "is a required property";
                } else {
                  out += "should have required property \\'" + $missingProperty + "\\'";
                }
                out += "' ";
              }
              if (it2.opts.verbose) {
                out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
              }
              out += " } ";
            } else {
              out += " {} ";
            }
            out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; } } ";
            if ($isData) {
              out += "  }  ";
            }
          } else {
            var arr3 = $required;
            if (arr3) {
              var $propertyKey, i3 = -1, l3 = arr3.length - 1;
              while (i3 < l3) {
                $propertyKey = arr3[i3 += 1];
                var $prop = it2.util.getProperty($propertyKey), $missingProperty = it2.util.escapeQuotes($propertyKey), $useData = $data + $prop;
                if (it2.opts._errorDataPathProperty) {
                  it2.errorPath = it2.util.getPath($currentErrorPath, $propertyKey, it2.opts.jsonPointers);
                }
                out += " if ( " + $useData + " === undefined ";
                if ($ownProperties) {
                  out += " || ! Object.prototype.hasOwnProperty.call(" + $data + ", '" + it2.util.escapeQuotes($propertyKey) + "') ";
                }
                out += ") {  var err =   ";
                if (it2.createErrors !== false) {
                  out += " { keyword: 'required' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { missingProperty: '" + $missingProperty + "' } ";
                  if (it2.opts.messages !== false) {
                    out += " , message: '";
                    if (it2.opts._errorDataPathProperty) {
                      out += "is a required property";
                    } else {
                      out += "should have required property \\'" + $missingProperty + "\\'";
                    }
                    out += "' ";
                  }
                  if (it2.opts.verbose) {
                    out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
                  }
                  out += " } ";
                } else {
                  out += " {} ";
                }
                out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; } ";
              }
            }
          }
        }
        it2.errorPath = $currentErrorPath;
      } else if ($breakOnError) {
        out += " if (true) {";
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/lib/dotjs/uniqueItems.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_uniqueItems(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      if (($schema || $isData) && it2.opts.uniqueItems !== false) {
        if ($isData) {
          out += " var " + $valid + "; if (" + $schemaValue + " === false || " + $schemaValue + " === undefined) " + $valid + " = true; else if (typeof " + $schemaValue + " != 'boolean') " + $valid + " = false; else { ";
        }
        out += " var i = " + $data + ".length , " + $valid + " = true , j; if (i > 1) { ";
        var $itemType = it2.schema.items && it2.schema.items.type, $typeIsArray = Array.isArray($itemType);
        if (!$itemType || $itemType == "object" || $itemType == "array" || $typeIsArray && ($itemType.indexOf("object") >= 0 || $itemType.indexOf("array") >= 0)) {
          out += " outer: for (;i--;) { for (j = i; j--;) { if (equal(" + $data + "[i], " + $data + "[j])) { " + $valid + " = false; break outer; } } } ";
        } else {
          out += " var itemIndices = {}, item; for (;i--;) { var item = " + $data + "[i]; ";
          var $method = "checkDataType" + ($typeIsArray ? "s" : "");
          out += " if (" + it2.util[$method]($itemType, "item", it2.opts.strictNumbers, true) + ") continue; ";
          if ($typeIsArray) {
            out += ` if (typeof item == 'string') item = '"' + item; `;
          }
          out += " if (typeof itemIndices[item] == 'number') { " + $valid + " = false; j = itemIndices[item]; break; } itemIndices[item] = i; } ";
        }
        out += " } ";
        if ($isData) {
          out += "  }  ";
        }
        out += " if (!" + $valid + ") {   ";
        var $$outStack = $$outStack || [];
        $$outStack.push(out);
        out = "";
        if (it2.createErrors !== false) {
          out += " { keyword: 'uniqueItems' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { i: i, j: j } ";
          if (it2.opts.messages !== false) {
            out += " , message: 'should NOT have duplicate items (items ## ' + j + ' and ' + i + ' are identical)' ";
          }
          if (it2.opts.verbose) {
            out += " , schema:  ";
            if ($isData) {
              out += "validate.schema" + $schemaPath;
            } else {
              out += "" + $schema;
            }
            out += "         , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
          }
          out += " } ";
        } else {
          out += " {} ";
        }
        var __err = out;
        out = $$outStack.pop();
        if (!it2.compositeRule && $breakOnError) {
          if (it2.async) {
            out += " throw new ValidationError([" + __err + "]); ";
          } else {
            out += " validate.errors = [" + __err + "]; return false; ";
          }
        } else {
          out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
        }
        out += " } ";
        if ($breakOnError) {
          out += " else { ";
        }
      } else {
        if ($breakOnError) {
          out += " if (true) { ";
        }
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/dotjs/index.js
var require_dotjs = __commonJS({
  "node_modules/ajv/lib/dotjs/index.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      "$ref": require_ref(),
      allOf: require_allOf(),
      anyOf: require_anyOf(),
      "$comment": require_comment(),
      const: require_const(),
      contains: require_contains(),
      dependencies: require_dependencies(),
      "enum": require_enum(),
      format: require_format(),
      "if": require_if(),
      items: require_items(),
      maximum: require_limit(),
      minimum: require_limit(),
      maxItems: require_limitItems(),
      minItems: require_limitItems(),
      maxLength: require_limitLength(),
      minLength: require_limitLength(),
      maxProperties: require_limitProperties(),
      minProperties: require_limitProperties(),
      multipleOf: require_multipleOf(),
      not: require_not(),
      oneOf: require_oneOf(),
      pattern: require_pattern(),
      properties: require_properties(),
      propertyNames: require_propertyNames(),
      required: require_required(),
      uniqueItems: require_uniqueItems(),
      validate: require_validate()
    };
  }
});

// node_modules/ajv/lib/compile/rules.js
var require_rules = __commonJS({
  "node_modules/ajv/lib/compile/rules.js"(exports2, module2) {
    "use strict";
    var ruleModules = require_dotjs();
    var toHash = require_util().toHash;
    module2.exports = function rules() {
      var RULES = [
        {
          type: "number",
          rules: [
            { "maximum": ["exclusiveMaximum"] },
            { "minimum": ["exclusiveMinimum"] },
            "multipleOf",
            "format"
          ]
        },
        {
          type: "string",
          rules: ["maxLength", "minLength", "pattern", "format"]
        },
        {
          type: "array",
          rules: ["maxItems", "minItems", "items", "contains", "uniqueItems"]
        },
        {
          type: "object",
          rules: [
            "maxProperties",
            "minProperties",
            "required",
            "dependencies",
            "propertyNames",
            { "properties": ["additionalProperties", "patternProperties"] }
          ]
        },
        { rules: ["$ref", "const", "enum", "not", "anyOf", "oneOf", "allOf", "if"] }
      ];
      var ALL = ["type", "$comment"];
      var KEYWORDS = [
        "$schema",
        "$id",
        "id",
        "$data",
        "$async",
        "title",
        "description",
        "default",
        "definitions",
        "examples",
        "readOnly",
        "writeOnly",
        "contentMediaType",
        "contentEncoding",
        "additionalItems",
        "then",
        "else"
      ];
      var TYPES = ["number", "integer", "string", "array", "object", "boolean", "null"];
      RULES.all = toHash(ALL);
      RULES.types = toHash(TYPES);
      RULES.forEach(function(group) {
        group.rules = group.rules.map(function(keyword) {
          var implKeywords;
          if (typeof keyword == "object") {
            var key = Object.keys(keyword)[0];
            implKeywords = keyword[key];
            keyword = key;
            implKeywords.forEach(function(k2) {
              ALL.push(k2);
              RULES.all[k2] = true;
            });
          }
          ALL.push(keyword);
          var rule = RULES.all[keyword] = {
            keyword,
            code: ruleModules[keyword],
            implements: implKeywords
          };
          return rule;
        });
        RULES.all.$comment = {
          keyword: "$comment",
          code: ruleModules.$comment
        };
        if (group.type) RULES.types[group.type] = group;
      });
      RULES.keywords = toHash(ALL.concat(KEYWORDS));
      RULES.custom = {};
      return RULES;
    };
  }
});

// node_modules/ajv/lib/data.js
var require_data = __commonJS({
  "node_modules/ajv/lib/data.js"(exports2, module2) {
    "use strict";
    var KEYWORDS = [
      "multipleOf",
      "maximum",
      "exclusiveMaximum",
      "minimum",
      "exclusiveMinimum",
      "maxLength",
      "minLength",
      "pattern",
      "additionalItems",
      "maxItems",
      "minItems",
      "uniqueItems",
      "maxProperties",
      "minProperties",
      "required",
      "additionalProperties",
      "enum",
      "format",
      "const"
    ];
    module2.exports = function(metaSchema, keywordsJsonPointers) {
      for (var i = 0; i < keywordsJsonPointers.length; i++) {
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        var segments = keywordsJsonPointers[i].split("/");
        var keywords = metaSchema;
        var j2;
        for (j2 = 1; j2 < segments.length; j2++)
          keywords = keywords[segments[j2]];
        for (j2 = 0; j2 < KEYWORDS.length; j2++) {
          var key = KEYWORDS[j2];
          var schema = keywords[key];
          if (schema) {
            keywords[key] = {
              anyOf: [
                schema,
                { $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#" }
              ]
            };
          }
        }
      }
      return metaSchema;
    };
  }
});

// node_modules/ajv/lib/compile/async.js
var require_async = __commonJS({
  "node_modules/ajv/lib/compile/async.js"(exports2, module2) {
    "use strict";
    var MissingRefError = require_error_classes().MissingRef;
    module2.exports = compileAsync;
    function compileAsync(schema, meta, callback) {
      var self = this;
      if (typeof this._opts.loadSchema != "function")
        throw new Error("options.loadSchema should be a function");
      if (typeof meta == "function") {
        callback = meta;
        meta = void 0;
      }
      var p2 = loadMetaSchemaOf(schema).then(function() {
        var schemaObj = self._addSchema(schema, void 0, meta);
        return schemaObj.validate || _compileAsync(schemaObj);
      });
      if (callback) {
        p2.then(
          function(v2) {
            callback(null, v2);
          },
          callback
        );
      }
      return p2;
      function loadMetaSchemaOf(sch) {
        var $schema = sch.$schema;
        return $schema && !self.getSchema($schema) ? compileAsync.call(self, { $ref: $schema }, true) : Promise.resolve();
      }
      function _compileAsync(schemaObj) {
        try {
          return self._compile(schemaObj);
        } catch (e) {
          if (e instanceof MissingRefError) return loadMissingSchema(e);
          throw e;
        }
        function loadMissingSchema(e) {
          var ref = e.missingSchema;
          if (added(ref)) throw new Error("Schema " + ref + " is loaded but " + e.missingRef + " cannot be resolved");
          var schemaPromise = self._loadingSchemas[ref];
          if (!schemaPromise) {
            schemaPromise = self._loadingSchemas[ref] = self._opts.loadSchema(ref);
            schemaPromise.then(removePromise, removePromise);
          }
          return schemaPromise.then(function(sch) {
            if (!added(ref)) {
              return loadMetaSchemaOf(sch).then(function() {
                if (!added(ref)) self.addSchema(sch, ref, void 0, meta);
              });
            }
          }).then(function() {
            return _compileAsync(schemaObj);
          });
          function removePromise() {
            delete self._loadingSchemas[ref];
          }
          function added(ref2) {
            return self._refs[ref2] || self._schemas[ref2];
          }
        }
      }
    }
  }
});

// node_modules/ajv/lib/dotjs/custom.js
var require_custom = __commonJS({
  "node_modules/ajv/lib/dotjs/custom.js"(exports2, module2) {
    "use strict";
    module2.exports = function generate_custom(it2, $keyword, $ruleType) {
      var out = " ";
      var $lvl = it2.level;
      var $dataLvl = it2.dataLevel;
      var $schema = it2.schema[$keyword];
      var $schemaPath = it2.schemaPath + it2.util.getProperty($keyword);
      var $errSchemaPath = it2.errSchemaPath + "/" + $keyword;
      var $breakOnError = !it2.opts.allErrors;
      var $errorKeyword;
      var $data = "data" + ($dataLvl || "");
      var $valid = "valid" + $lvl;
      var $errs = "errs__" + $lvl;
      var $isData = it2.opts.$data && $schema && $schema.$data, $schemaValue;
      if ($isData) {
        out += " var schema" + $lvl + " = " + it2.util.getData($schema.$data, $dataLvl, it2.dataPathArr) + "; ";
        $schemaValue = "schema" + $lvl;
      } else {
        $schemaValue = $schema;
      }
      var $rule = this, $definition = "definition" + $lvl, $rDef = $rule.definition, $closingBraces = "";
      var $compile, $inline, $macro, $ruleValidate, $validateCode;
      if ($isData && $rDef.$data) {
        $validateCode = "keywordValidate" + $lvl;
        var $validateSchema = $rDef.validateSchema;
        out += " var " + $definition + " = RULES.custom['" + $keyword + "'].definition; var " + $validateCode + " = " + $definition + ".validate;";
      } else {
        $ruleValidate = it2.useCustomRule($rule, $schema, it2.schema, it2);
        if (!$ruleValidate) return;
        $schemaValue = "validate.schema" + $schemaPath;
        $validateCode = $ruleValidate.code;
        $compile = $rDef.compile;
        $inline = $rDef.inline;
        $macro = $rDef.macro;
      }
      var $ruleErrs = $validateCode + ".errors", $i2 = "i" + $lvl, $ruleErr = "ruleErr" + $lvl, $asyncKeyword = $rDef.async;
      if ($asyncKeyword && !it2.async) throw new Error("async keyword in sync schema");
      if (!($inline || $macro)) {
        out += "" + $ruleErrs + " = null;";
      }
      out += "var " + $errs + " = errors;var " + $valid + ";";
      if ($isData && $rDef.$data) {
        $closingBraces += "}";
        out += " if (" + $schemaValue + " === undefined) { " + $valid + " = true; } else { ";
        if ($validateSchema) {
          $closingBraces += "}";
          out += " " + $valid + " = " + $definition + ".validateSchema(" + $schemaValue + "); if (" + $valid + ") { ";
        }
      }
      if ($inline) {
        if ($rDef.statements) {
          out += " " + $ruleValidate.validate + " ";
        } else {
          out += " " + $valid + " = " + $ruleValidate.validate + "; ";
        }
      } else if ($macro) {
        var $it = it2.util.copy(it2);
        var $closingBraces = "";
        $it.level++;
        var $nextValid = "valid" + $it.level;
        $it.schema = $ruleValidate.validate;
        $it.schemaPath = "";
        var $wasComposite = it2.compositeRule;
        it2.compositeRule = $it.compositeRule = true;
        var $code = it2.validate($it).replace(/validate\.schema/g, $validateCode);
        it2.compositeRule = $it.compositeRule = $wasComposite;
        out += " " + $code;
      } else {
        var $$outStack = $$outStack || [];
        $$outStack.push(out);
        out = "";
        out += "  " + $validateCode + ".call( ";
        if (it2.opts.passContext) {
          out += "this";
        } else {
          out += "self";
        }
        if ($compile || $rDef.schema === false) {
          out += " , " + $data + " ";
        } else {
          out += " , " + $schemaValue + " , " + $data + " , validate.schema" + it2.schemaPath + " ";
        }
        out += " , (dataPath || '')";
        if (it2.errorPath != '""') {
          out += " + " + it2.errorPath;
        }
        var $parentData = $dataLvl ? "data" + ($dataLvl - 1 || "") : "parentData", $parentDataProperty = $dataLvl ? it2.dataPathArr[$dataLvl] : "parentDataProperty";
        out += " , " + $parentData + " , " + $parentDataProperty + " , rootData )  ";
        var def_callRuleValidate = out;
        out = $$outStack.pop();
        if ($rDef.errors === false) {
          out += " " + $valid + " = ";
          if ($asyncKeyword) {
            out += "await ";
          }
          out += "" + def_callRuleValidate + "; ";
        } else {
          if ($asyncKeyword) {
            $ruleErrs = "customErrors" + $lvl;
            out += " var " + $ruleErrs + " = null; try { " + $valid + " = await " + def_callRuleValidate + "; } catch (e) { " + $valid + " = false; if (e instanceof ValidationError) " + $ruleErrs + " = e.errors; else throw e; } ";
          } else {
            out += " " + $ruleErrs + " = null; " + $valid + " = " + def_callRuleValidate + "; ";
          }
        }
      }
      if ($rDef.modifying) {
        out += " if (" + $parentData + ") " + $data + " = " + $parentData + "[" + $parentDataProperty + "];";
      }
      out += "" + $closingBraces;
      if ($rDef.valid) {
        if ($breakOnError) {
          out += " if (true) { ";
        }
      } else {
        out += " if ( ";
        if ($rDef.valid === void 0) {
          out += " !";
          if ($macro) {
            out += "" + $nextValid;
          } else {
            out += "" + $valid;
          }
        } else {
          out += " " + !$rDef.valid + " ";
        }
        out += ") { ";
        $errorKeyword = $rule.keyword;
        var $$outStack = $$outStack || [];
        $$outStack.push(out);
        out = "";
        var $$outStack = $$outStack || [];
        $$outStack.push(out);
        out = "";
        if (it2.createErrors !== false) {
          out += " { keyword: '" + ($errorKeyword || "custom") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { keyword: '" + $rule.keyword + "' } ";
          if (it2.opts.messages !== false) {
            out += ` , message: 'should pass "` + $rule.keyword + `" keyword validation' `;
          }
          if (it2.opts.verbose) {
            out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
          }
          out += " } ";
        } else {
          out += " {} ";
        }
        var __err = out;
        out = $$outStack.pop();
        if (!it2.compositeRule && $breakOnError) {
          if (it2.async) {
            out += " throw new ValidationError([" + __err + "]); ";
          } else {
            out += " validate.errors = [" + __err + "]; return false; ";
          }
        } else {
          out += " var err = " + __err + ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
        }
        var def_customError = out;
        out = $$outStack.pop();
        if ($inline) {
          if ($rDef.errors) {
            if ($rDef.errors != "full") {
              out += "  for (var " + $i2 + "=" + $errs + "; " + $i2 + "<errors; " + $i2 + "++) { var " + $ruleErr + " = vErrors[" + $i2 + "]; if (" + $ruleErr + ".dataPath === undefined) " + $ruleErr + ".dataPath = (dataPath || '') + " + it2.errorPath + "; if (" + $ruleErr + ".schemaPath === undefined) { " + $ruleErr + '.schemaPath = "' + $errSchemaPath + '"; } ';
              if (it2.opts.verbose) {
                out += " " + $ruleErr + ".schema = " + $schemaValue + "; " + $ruleErr + ".data = " + $data + "; ";
              }
              out += " } ";
            }
          } else {
            if ($rDef.errors === false) {
              out += " " + def_customError + " ";
            } else {
              out += " if (" + $errs + " == errors) { " + def_customError + " } else {  for (var " + $i2 + "=" + $errs + "; " + $i2 + "<errors; " + $i2 + "++) { var " + $ruleErr + " = vErrors[" + $i2 + "]; if (" + $ruleErr + ".dataPath === undefined) " + $ruleErr + ".dataPath = (dataPath || '') + " + it2.errorPath + "; if (" + $ruleErr + ".schemaPath === undefined) { " + $ruleErr + '.schemaPath = "' + $errSchemaPath + '"; } ';
              if (it2.opts.verbose) {
                out += " " + $ruleErr + ".schema = " + $schemaValue + "; " + $ruleErr + ".data = " + $data + "; ";
              }
              out += " } } ";
            }
          }
        } else if ($macro) {
          out += "   var err =   ";
          if (it2.createErrors !== false) {
            out += " { keyword: '" + ($errorKeyword || "custom") + "' , dataPath: (dataPath || '') + " + it2.errorPath + " , schemaPath: " + it2.util.toQuotedString($errSchemaPath) + " , params: { keyword: '" + $rule.keyword + "' } ";
            if (it2.opts.messages !== false) {
              out += ` , message: 'should pass "` + $rule.keyword + `" keyword validation' `;
            }
            if (it2.opts.verbose) {
              out += " , schema: validate.schema" + $schemaPath + " , parentSchema: validate.schema" + it2.schemaPath + " , data: " + $data + " ";
            }
            out += " } ";
          } else {
            out += " {} ";
          }
          out += ";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";
          if (!it2.compositeRule && $breakOnError) {
            if (it2.async) {
              out += " throw new ValidationError(vErrors); ";
            } else {
              out += " validate.errors = vErrors; return false; ";
            }
          }
        } else {
          if ($rDef.errors === false) {
            out += " " + def_customError + " ";
          } else {
            out += " if (Array.isArray(" + $ruleErrs + ")) { if (vErrors === null) vErrors = " + $ruleErrs + "; else vErrors = vErrors.concat(" + $ruleErrs + "); errors = vErrors.length;  for (var " + $i2 + "=" + $errs + "; " + $i2 + "<errors; " + $i2 + "++) { var " + $ruleErr + " = vErrors[" + $i2 + "]; if (" + $ruleErr + ".dataPath === undefined) " + $ruleErr + ".dataPath = (dataPath || '') + " + it2.errorPath + ";  " + $ruleErr + '.schemaPath = "' + $errSchemaPath + '";  ';
            if (it2.opts.verbose) {
              out += " " + $ruleErr + ".schema = " + $schemaValue + "; " + $ruleErr + ".data = " + $data + "; ";
            }
            out += " } } else { " + def_customError + " } ";
          }
        }
        out += " } ";
        if ($breakOnError) {
          out += " else { ";
        }
      }
      return out;
    };
  }
});

// node_modules/ajv/lib/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS({
  "node_modules/ajv/lib/refs/json-schema-draft-07.json"(exports2, module2) {
    module2.exports = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "http://json-schema.org/draft-07/schema#",
      title: "Core schema meta-schema",
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $ref: "#" }
        },
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          allOf: [
            { $ref: "#/definitions/nonNegativeInteger" },
            { default: 0 }
          ]
        },
        simpleTypes: {
          enum: [
            "array",
            "boolean",
            "integer",
            "null",
            "number",
            "object",
            "string"
          ]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      },
      type: ["object", "boolean"],
      properties: {
        $id: {
          type: "string",
          format: "uri-reference"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        $ref: {
          type: "string",
          format: "uri-reference"
        },
        $comment: {
          type: "string"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        readOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/definitions/nonNegativeInteger" },
        minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: { $ref: "#" },
        items: {
          anyOf: [
            { $ref: "#" },
            { $ref: "#/definitions/schemaArray" }
          ],
          default: true
        },
        maxItems: { $ref: "#/definitions/nonNegativeInteger" },
        minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        contains: { $ref: "#" },
        maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
        minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        required: { $ref: "#/definitions/stringArray" },
        additionalProperties: { $ref: "#" },
        definitions: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [
              { $ref: "#" },
              { $ref: "#/definitions/stringArray" }
            ]
          }
        },
        propertyNames: { $ref: "#" },
        const: true,
        enum: {
          type: "array",
          items: true,
          minItems: 1,
          uniqueItems: true
        },
        type: {
          anyOf: [
            { $ref: "#/definitions/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/definitions/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        format: { type: "string" },
        contentMediaType: { type: "string" },
        contentEncoding: { type: "string" },
        if: { $ref: "#" },
        then: { $ref: "#" },
        else: { $ref: "#" },
        allOf: { $ref: "#/definitions/schemaArray" },
        anyOf: { $ref: "#/definitions/schemaArray" },
        oneOf: { $ref: "#/definitions/schemaArray" },
        not: { $ref: "#" }
      },
      default: true
    };
  }
});

// node_modules/ajv/lib/definition_schema.js
var require_definition_schema = __commonJS({
  "node_modules/ajv/lib/definition_schema.js"(exports2, module2) {
    "use strict";
    var metaSchema = require_json_schema_draft_07();
    module2.exports = {
      $id: "https://github.com/ajv-validator/ajv/blob/master/lib/definition_schema.js",
      definitions: {
        simpleTypes: metaSchema.definitions.simpleTypes
      },
      type: "object",
      dependencies: {
        schema: ["validate"],
        $data: ["validate"],
        statements: ["inline"],
        valid: { not: { required: ["macro"] } }
      },
      properties: {
        type: metaSchema.properties.type,
        schema: { type: "boolean" },
        statements: { type: "boolean" },
        dependencies: {
          type: "array",
          items: { type: "string" }
        },
        metaSchema: { type: "object" },
        modifying: { type: "boolean" },
        valid: { type: "boolean" },
        $data: { type: "boolean" },
        async: { type: "boolean" },
        errors: {
          anyOf: [
            { type: "boolean" },
            { const: "full" }
          ]
        }
      }
    };
  }
});

// node_modules/ajv/lib/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/lib/keyword.js"(exports2, module2) {
    "use strict";
    var IDENTIFIER = /^[a-z_$][a-z0-9_$-]*$/i;
    var customRuleCode = require_custom();
    var definitionSchema = require_definition_schema();
    module2.exports = {
      add: addKeyword,
      get: getKeyword,
      remove: removeKeyword,
      validate: validateKeyword
    };
    function addKeyword(keyword, definition) {
      var RULES = this.RULES;
      if (RULES.keywords[keyword])
        throw new Error("Keyword " + keyword + " is already defined");
      if (!IDENTIFIER.test(keyword))
        throw new Error("Keyword " + keyword + " is not a valid identifier");
      if (definition) {
        this.validateKeyword(definition, true);
        var dataType = definition.type;
        if (Array.isArray(dataType)) {
          for (var i = 0; i < dataType.length; i++)
            _addRule(keyword, dataType[i], definition);
        } else {
          _addRule(keyword, dataType, definition);
        }
        var metaSchema = definition.metaSchema;
        if (metaSchema) {
          if (definition.$data && this._opts.$data) {
            metaSchema = {
              anyOf: [
                metaSchema,
                { "$ref": "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#" }
              ]
            };
          }
          definition.validateSchema = this.compile(metaSchema, true);
        }
      }
      RULES.keywords[keyword] = RULES.all[keyword] = true;
      function _addRule(keyword2, dataType2, definition2) {
        var ruleGroup;
        for (var i2 = 0; i2 < RULES.length; i2++) {
          var rg = RULES[i2];
          if (rg.type == dataType2) {
            ruleGroup = rg;
            break;
          }
        }
        if (!ruleGroup) {
          ruleGroup = { type: dataType2, rules: [] };
          RULES.push(ruleGroup);
        }
        var rule = {
          keyword: keyword2,
          definition: definition2,
          custom: true,
          code: customRuleCode,
          implements: definition2.implements
        };
        ruleGroup.rules.push(rule);
        RULES.custom[keyword2] = rule;
      }
      return this;
    }
    function getKeyword(keyword) {
      var rule = this.RULES.custom[keyword];
      return rule ? rule.definition : this.RULES.keywords[keyword] || false;
    }
    function removeKeyword(keyword) {
      var RULES = this.RULES;
      delete RULES.keywords[keyword];
      delete RULES.all[keyword];
      delete RULES.custom[keyword];
      for (var i = 0; i < RULES.length; i++) {
        var rules = RULES[i].rules;
        for (var j2 = 0; j2 < rules.length; j2++) {
          if (rules[j2].keyword == keyword) {
            rules.splice(j2, 1);
            break;
          }
        }
      }
      return this;
    }
    function validateKeyword(definition, throwError) {
      validateKeyword.errors = null;
      var v2 = this._validateKeyword = this._validateKeyword || this.compile(definitionSchema, true);
      if (v2(definition)) return true;
      validateKeyword.errors = v2.errors;
      if (throwError)
        throw new Error("custom keyword definition is invalid: " + this.errorsText(v2.errors));
      else
        return false;
    }
  }
});

// node_modules/ajv/lib/refs/data.json
var require_data2 = __commonJS({
  "node_modules/ajv/lib/refs/data.json"(exports2, module2) {
    module2.exports = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON Schema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [
            { format: "relative-json-pointer" },
            { format: "json-pointer" }
          ]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/ajv/lib/ajv.js
var require_ajv = __commonJS({
  "node_modules/ajv/lib/ajv.js"(exports2, module2) {
    "use strict";
    var compileSchema = require_compile();
    var resolve2 = require_resolve();
    var Cache = require_cache();
    var SchemaObject = require_schema_obj();
    var stableStringify = require_fast_json_stable_stringify();
    var formats = require_formats();
    var rules = require_rules();
    var $dataMetaSchema = require_data();
    var util = require_util();
    module2.exports = Ajv2;
    Ajv2.prototype.validate = validate;
    Ajv2.prototype.compile = compile;
    Ajv2.prototype.addSchema = addSchema;
    Ajv2.prototype.addMetaSchema = addMetaSchema;
    Ajv2.prototype.validateSchema = validateSchema;
    Ajv2.prototype.getSchema = getSchema;
    Ajv2.prototype.removeSchema = removeSchema;
    Ajv2.prototype.addFormat = addFormat;
    Ajv2.prototype.errorsText = errorsText;
    Ajv2.prototype._addSchema = _addSchema;
    Ajv2.prototype._compile = _compile;
    Ajv2.prototype.compileAsync = require_async();
    var customKeyword = require_keyword();
    Ajv2.prototype.addKeyword = customKeyword.add;
    Ajv2.prototype.getKeyword = customKeyword.get;
    Ajv2.prototype.removeKeyword = customKeyword.remove;
    Ajv2.prototype.validateKeyword = customKeyword.validate;
    var errorClasses = require_error_classes();
    Ajv2.ValidationError = errorClasses.Validation;
    Ajv2.MissingRefError = errorClasses.MissingRef;
    Ajv2.$dataMetaSchema = $dataMetaSchema;
    var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes", "strictDefaults"];
    var META_SUPPORT_DATA = ["/properties"];
    function Ajv2(opts) {
      if (!(this instanceof Ajv2)) return new Ajv2(opts);
      opts = this._opts = util.copy(opts) || {};
      setLogger(this);
      this._schemas = {};
      this._refs = {};
      this._fragments = {};
      this._formats = formats(opts.format);
      this._cache = opts.cache || new Cache();
      this._loadingSchemas = {};
      this._compilations = [];
      this.RULES = rules();
      this._getId = chooseGetId(opts);
      opts.loopRequired = opts.loopRequired || Infinity;
      if (opts.errorDataPath == "property") opts._errorDataPathProperty = true;
      if (opts.serialize === void 0) opts.serialize = stableStringify;
      this._metaOpts = getMetaSchemaOptions(this);
      if (opts.formats) addInitialFormats(this);
      if (opts.keywords) addInitialKeywords(this);
      addDefaultMetaSchema(this);
      if (typeof opts.meta == "object") this.addMetaSchema(opts.meta);
      if (opts.nullable) this.addKeyword("nullable", { metaSchema: { type: "boolean" } });
      addInitialSchemas(this);
    }
    function validate(schemaKeyRef, data) {
      var v2;
      if (typeof schemaKeyRef == "string") {
        v2 = this.getSchema(schemaKeyRef);
        if (!v2) throw new Error('no schema with key or ref "' + schemaKeyRef + '"');
      } else {
        var schemaObj = this._addSchema(schemaKeyRef);
        v2 = schemaObj.validate || this._compile(schemaObj);
      }
      var valid = v2(data);
      if (v2.$async !== true) this.errors = v2.errors;
      return valid;
    }
    function compile(schema, _meta) {
      var schemaObj = this._addSchema(schema, void 0, _meta);
      return schemaObj.validate || this._compile(schemaObj);
    }
    function addSchema(schema, key, _skipValidation, _meta) {
      if (Array.isArray(schema)) {
        for (var i = 0; i < schema.length; i++) this.addSchema(schema[i], void 0, _skipValidation, _meta);
        return this;
      }
      var id = this._getId(schema);
      if (id !== void 0 && typeof id != "string")
        throw new Error("schema id must be string");
      key = resolve2.normalizeId(key || id);
      checkUnique(this, key);
      this._schemas[key] = this._addSchema(schema, _skipValidation, _meta, true);
      return this;
    }
    function addMetaSchema(schema, key, skipValidation) {
      this.addSchema(schema, key, skipValidation, true);
      return this;
    }
    function validateSchema(schema, throwOrLogError) {
      var $schema = schema.$schema;
      if ($schema !== void 0 && typeof $schema != "string")
        throw new Error("$schema must be a string");
      $schema = $schema || this._opts.defaultMeta || defaultMeta(this);
      if (!$schema) {
        this.logger.warn("meta-schema not available");
        this.errors = null;
        return true;
      }
      var valid = this.validate($schema, schema);
      if (!valid && throwOrLogError) {
        var message = "schema is invalid: " + this.errorsText();
        if (this._opts.validateSchema == "log") this.logger.error(message);
        else throw new Error(message);
      }
      return valid;
    }
    function defaultMeta(self) {
      var meta = self._opts.meta;
      self._opts.defaultMeta = typeof meta == "object" ? self._getId(meta) || meta : self.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0;
      return self._opts.defaultMeta;
    }
    function getSchema(keyRef) {
      var schemaObj = _getSchemaObj(this, keyRef);
      switch (typeof schemaObj) {
        case "object":
          return schemaObj.validate || this._compile(schemaObj);
        case "string":
          return this.getSchema(schemaObj);
        case "undefined":
          return _getSchemaFragment(this, keyRef);
      }
    }
    function _getSchemaFragment(self, ref) {
      var res = resolve2.schema.call(self, { schema: {} }, ref);
      if (res) {
        var schema = res.schema, root = res.root, baseId = res.baseId;
        var v2 = compileSchema.call(self, schema, root, void 0, baseId);
        self._fragments[ref] = new SchemaObject({
          ref,
          fragment: true,
          schema,
          root,
          baseId,
          validate: v2
        });
        return v2;
      }
    }
    function _getSchemaObj(self, keyRef) {
      keyRef = resolve2.normalizeId(keyRef);
      return self._schemas[keyRef] || self._refs[keyRef] || self._fragments[keyRef];
    }
    function removeSchema(schemaKeyRef) {
      if (schemaKeyRef instanceof RegExp) {
        _removeAllSchemas(this, this._schemas, schemaKeyRef);
        _removeAllSchemas(this, this._refs, schemaKeyRef);
        return this;
      }
      switch (typeof schemaKeyRef) {
        case "undefined":
          _removeAllSchemas(this, this._schemas);
          _removeAllSchemas(this, this._refs);
          this._cache.clear();
          return this;
        case "string":
          var schemaObj = _getSchemaObj(this, schemaKeyRef);
          if (schemaObj) this._cache.del(schemaObj.cacheKey);
          delete this._schemas[schemaKeyRef];
          delete this._refs[schemaKeyRef];
          return this;
        case "object":
          var serialize = this._opts.serialize;
          var cacheKey = serialize ? serialize(schemaKeyRef) : schemaKeyRef;
          this._cache.del(cacheKey);
          var id = this._getId(schemaKeyRef);
          if (id) {
            id = resolve2.normalizeId(id);
            delete this._schemas[id];
            delete this._refs[id];
          }
      }
      return this;
    }
    function _removeAllSchemas(self, schemas, regex) {
      for (var keyRef in schemas) {
        var schemaObj = schemas[keyRef];
        if (!schemaObj.meta && (!regex || regex.test(keyRef))) {
          self._cache.del(schemaObj.cacheKey);
          delete schemas[keyRef];
        }
      }
    }
    function _addSchema(schema, skipValidation, meta, shouldAddSchema) {
      if (typeof schema != "object" && typeof schema != "boolean")
        throw new Error("schema should be object or boolean");
      var serialize = this._opts.serialize;
      var cacheKey = serialize ? serialize(schema) : schema;
      var cached = this._cache.get(cacheKey);
      if (cached) return cached;
      shouldAddSchema = shouldAddSchema || this._opts.addUsedSchema !== false;
      var id = resolve2.normalizeId(this._getId(schema));
      if (id && shouldAddSchema) checkUnique(this, id);
      var willValidate = this._opts.validateSchema !== false && !skipValidation;
      var recursiveMeta;
      if (willValidate && !(recursiveMeta = id && id == resolve2.normalizeId(schema.$schema)))
        this.validateSchema(schema, true);
      var localRefs = resolve2.ids.call(this, schema);
      var schemaObj = new SchemaObject({
        id,
        schema,
        localRefs,
        cacheKey,
        meta
      });
      if (id[0] != "#" && shouldAddSchema) this._refs[id] = schemaObj;
      this._cache.put(cacheKey, schemaObj);
      if (willValidate && recursiveMeta) this.validateSchema(schema, true);
      return schemaObj;
    }
    function _compile(schemaObj, root) {
      if (schemaObj.compiling) {
        schemaObj.validate = callValidate;
        callValidate.schema = schemaObj.schema;
        callValidate.errors = null;
        callValidate.root = root ? root : callValidate;
        if (schemaObj.schema.$async === true)
          callValidate.$async = true;
        return callValidate;
      }
      schemaObj.compiling = true;
      var currentOpts;
      if (schemaObj.meta) {
        currentOpts = this._opts;
        this._opts = this._metaOpts;
      }
      var v2;
      try {
        v2 = compileSchema.call(this, schemaObj.schema, root, schemaObj.localRefs);
      } catch (e) {
        delete schemaObj.validate;
        throw e;
      } finally {
        schemaObj.compiling = false;
        if (schemaObj.meta) this._opts = currentOpts;
      }
      schemaObj.validate = v2;
      schemaObj.refs = v2.refs;
      schemaObj.refVal = v2.refVal;
      schemaObj.root = v2.root;
      return v2;
      function callValidate() {
        var _validate = schemaObj.validate;
        var result = _validate.apply(this, arguments);
        callValidate.errors = _validate.errors;
        return result;
      }
    }
    function chooseGetId(opts) {
      switch (opts.schemaId) {
        case "auto":
          return _get$IdOrId;
        case "id":
          return _getId;
        default:
          return _get$Id;
      }
    }
    function _getId(schema) {
      if (schema.$id) this.logger.warn("schema $id ignored", schema.$id);
      return schema.id;
    }
    function _get$Id(schema) {
      if (schema.id) this.logger.warn("schema id ignored", schema.id);
      return schema.$id;
    }
    function _get$IdOrId(schema) {
      if (schema.$id && schema.id && schema.$id != schema.id)
        throw new Error("schema $id is different from id");
      return schema.$id || schema.id;
    }
    function errorsText(errors, options) {
      errors = errors || this.errors;
      if (!errors) return "No errors";
      options = options || {};
      var separator = options.separator === void 0 ? ", " : options.separator;
      var dataVar = options.dataVar === void 0 ? "data" : options.dataVar;
      var text = "";
      for (var i = 0; i < errors.length; i++) {
        var e = errors[i];
        if (e) text += dataVar + e.dataPath + " " + e.message + separator;
      }
      return text.slice(0, -separator.length);
    }
    function addFormat(name, format) {
      if (typeof format == "string") format = new RegExp(format);
      this._formats[name] = format;
      return this;
    }
    function addDefaultMetaSchema(self) {
      var $dataSchema;
      if (self._opts.$data) {
        $dataSchema = require_data2();
        self.addMetaSchema($dataSchema, $dataSchema.$id, true);
      }
      if (self._opts.meta === false) return;
      var metaSchema = require_json_schema_draft_07();
      if (self._opts.$data) metaSchema = $dataMetaSchema(metaSchema, META_SUPPORT_DATA);
      self.addMetaSchema(metaSchema, META_SCHEMA_ID, true);
      self._refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
    }
    function addInitialSchemas(self) {
      var optsSchemas = self._opts.schemas;
      if (!optsSchemas) return;
      if (Array.isArray(optsSchemas)) self.addSchema(optsSchemas);
      else for (var key in optsSchemas) self.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats(self) {
      for (var name in self._opts.formats) {
        var format = self._opts.formats[name];
        self.addFormat(name, format);
      }
    }
    function addInitialKeywords(self) {
      for (var name in self._opts.keywords) {
        var keyword = self._opts.keywords[name];
        self.addKeyword(name, keyword);
      }
    }
    function checkUnique(self, id) {
      if (self._schemas[id] || self._refs[id])
        throw new Error('schema with key or id "' + id + '" already exists');
    }
    function getMetaSchemaOptions(self) {
      var metaOpts = util.copy(self._opts);
      for (var i = 0; i < META_IGNORE_OPTIONS.length; i++)
        delete metaOpts[META_IGNORE_OPTIONS[i]];
      return metaOpts;
    }
    function setLogger(self) {
      var logger = self._opts.logger;
      if (logger === false) {
        self.logger = { log: noop, warn: noop, error: noop };
      } else {
        if (logger === void 0) logger = console;
        if (!(typeof logger == "object" && logger.log && logger.warn && logger.error))
          throw new Error("logger must implement log, warn and error methods");
        self.logger = logger;
      }
    }
    function noop() {
    }
  }
});

// packages/plugin-api/node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "packages/plugin-api/node_modules/semver/internal/constants.js"(exports2, module2) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module2.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// packages/plugin-api/node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "packages/plugin-api/node_modules/semver/internal/debug.js"(exports2, module2) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module2.exports = debug;
  }
});

// packages/plugin-api/node_modules/semver/internal/re.js
var require_re = __commonJS({
  "packages/plugin-api/node_modules/semver/internal/re.js"(exports2, module2) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports2 = module2.exports = {};
    var re2 = exports2.re = [];
    var safeRe = exports2.safeRe = [];
    var src = exports2.src = [];
    var safeSrc = exports2.safeSrc = [];
    var t = exports2.t = {};
    var R2 = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R2++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re2[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports2.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports2.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports2.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// packages/plugin-api/node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "packages/plugin-api/node_modules/semver/internal/parse-options.js"(exports2, module2) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module2.exports = parseOptions;
  }
});

// packages/plugin-api/node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "packages/plugin-api/node_modules/semver/internal/identifiers.js"(exports2, module2) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b2) => {
      if (typeof a === "number" && typeof b2 === "number") {
        return a === b2 ? 0 : a < b2 ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b2);
      if (anum && bnum) {
        a = +a;
        b2 = +b2;
      }
      return a === b2 ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b2 ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b2) => compareIdentifiers(b2, a);
    module2.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// packages/plugin-api/node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "packages/plugin-api/node_modules/semver/classes/semver.js"(exports2, module2) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re2, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var isPrereleaseIdentifier = (prerelease, identifier) => {
      const identifiers = identifier.split(".");
      if (identifiers.length > prerelease.length) {
        return false;
      }
      for (let i = 0; i < identifiers.length; i++) {
        if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
          return false;
        }
      }
      return true;
    };
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m2 = version.trim().match(options.loose ? re2[t.LOOSE] : re2[t.FULL]);
        if (!m2) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m2[1];
        this.minor = +m2[2];
        this.patch = +m2[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m2[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m2[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m2[5] ? m2[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b2 = other.prerelease[i];
          debug("prerelease compare", i, a, b2);
          if (a === void 0 && b2 === void 0) {
            return 0;
          } else if (b2 === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b2) {
            continue;
          } else {
            return compareIdentifiers(a, b2);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b2 = other.build[i];
          debug("build compare", i, a, b2);
          if (a === void 0 && b2 === void 0) {
            return 0;
          } else if (b2 === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b2) {
            continue;
          } else {
            return compareIdentifiers(a, b2);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re2[t.PRERELEASELOOSE] : re2[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (isPrereleaseIdentifier(this.prerelease, identifier)) {
                const prereleaseBase = this.prerelease[identifier.split(".").length];
                if (isNaN(prereleaseBase)) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module2.exports = SemVer;
  }
});

// packages/plugin-api/node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/parse.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er2) {
        if (!throwErrors) {
          return null;
        }
        throw er2;
      }
    };
    module2.exports = parse;
  }
});

// packages/plugin-api/node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/valid.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var valid = (version, options) => {
      const v2 = parse(version, options);
      return v2 ? v2.version : null;
    };
    module2.exports = valid;
  }
});

// packages/plugin-api/node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/clean.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options) => {
      const s3 = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s3 ? s3.version : null;
    };
    module2.exports = clean;
  }
});

// packages/plugin-api/node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/inc.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er2) {
        return null;
      }
    };
    module2.exports = inc;
  }
});

// packages/plugin-api/node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/diff.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module2.exports = diff;
  }
});

// packages/plugin-api/node_modules/semver/functions/major.js
var require_major = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/major.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module2.exports = major;
  }
});

// packages/plugin-api/node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/minor.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module2.exports = minor;
  }
});

// packages/plugin-api/node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/patch.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module2.exports = patch;
  }
});

// packages/plugin-api/node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/prerelease.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module2.exports = prerelease;
  }
});

// packages/plugin-api/node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/compare.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b2, loose) => new SemVer(a, loose).compare(new SemVer(b2, loose));
    module2.exports = compare;
  }
});

// packages/plugin-api/node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/rcompare.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b2, loose) => compare(b2, a, loose);
    module2.exports = rcompare;
  }
});

// packages/plugin-api/node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/compare-loose.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b2) => compare(a, b2, true);
    module2.exports = compareLoose;
  }
});

// packages/plugin-api/node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/compare-build.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b2, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b2, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module2.exports = compareBuild;
  }
});

// packages/plugin-api/node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/sort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b2) => compareBuild(a, b2, loose));
    module2.exports = sort;
  }
});

// packages/plugin-api/node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/rsort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b2) => compareBuild(b2, a, loose));
    module2.exports = rsort;
  }
});

// packages/plugin-api/node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/gt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gt2 = (a, b2, loose) => compare(a, b2, loose) > 0;
    module2.exports = gt2;
  }
});

// packages/plugin-api/node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/lt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lt2 = (a, b2, loose) => compare(a, b2, loose) < 0;
    module2.exports = lt2;
  }
});

// packages/plugin-api/node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/eq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b2, loose) => compare(a, b2, loose) === 0;
    module2.exports = eq;
  }
});

// packages/plugin-api/node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/neq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b2, loose) => compare(a, b2, loose) !== 0;
    module2.exports = neq;
  }
});

// packages/plugin-api/node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/gte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b2, loose) => compare(a, b2, loose) >= 0;
    module2.exports = gte;
  }
});

// packages/plugin-api/node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/lte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b2, loose) => compare(a, b2, loose) <= 0;
    module2.exports = lte;
  }
});

// packages/plugin-api/node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/cmp.js"(exports2, module2) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt2 = require_gt();
    var gte = require_gte();
    var lt2 = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b2, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b2 === "object") {
            b2 = b2.version;
          }
          return a === b2;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b2 === "object") {
            b2 = b2.version;
          }
          return a !== b2;
        case "":
        case "=":
        case "==":
          return eq(a, b2, loose);
        case "!=":
          return neq(a, b2, loose);
        case ">":
          return gt2(a, b2, loose);
        case ">=":
          return gte(a, b2, loose);
        case "<":
          return lt2(a, b2, loose);
        case "<=":
          return lte(a, b2, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module2.exports = cmp;
  }
});

// packages/plugin-api/node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/coerce.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re2, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re2[t.COERCEFULL] : re2[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re2[t.COERCERTLFULL] : re2[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module2.exports = coerce;
  }
});

// packages/plugin-api/node_modules/semver/functions/truncate.js
var require_truncate = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/truncate.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var constants = require_constants();
    var SemVer = require_semver();
    var truncate = (version, truncation, options) => {
      if (!constants.RELEASE_TYPES.includes(truncation)) {
        return null;
      }
      const clonedVersion = cloneInputVersion(version, options);
      return clonedVersion && doTruncation(clonedVersion, truncation);
    };
    var cloneInputVersion = (version, options) => {
      const versionStringToParse = version instanceof SemVer ? version.version : version;
      return parse(versionStringToParse, options);
    };
    var doTruncation = (version, truncation) => {
      if (isPrerelease(truncation)) {
        return version.version;
      }
      version.prerelease = [];
      switch (truncation) {
        case "major":
          version.minor = 0;
          version.patch = 0;
          break;
        case "minor":
          version.patch = 0;
          break;
      }
      return version.format();
    };
    var isPrerelease = (type) => {
      return type.startsWith("pre");
    };
    module2.exports = truncate;
  }
});

// packages/plugin-api/node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "packages/plugin-api/node_modules/semver/internal/lrucache.js"(exports2, module2) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module2.exports = LRUCache;
  }
});

// packages/plugin-api/node_modules/semver/classes/range.js
var require_range = __commonJS({
  "packages/plugin-api/node_modules/semver/classes/range.js"(exports2, module2) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k2 = 0; k2 < comps.length; k2++) {
              if (k2 > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k2].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        range = range.replace(BUILDSTRIPRE, "");
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr2 = loose ? re2[t.HYPHENRANGELOOSE] : re2[t.HYPHENRANGE];
        range = range.replace(hr2, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re2[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re2[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re2[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re2[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er2) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module2.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re2,
      src,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re2[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var invalidXRangeOrder = (M2, m2, p2) => isX(M2) && !isX(m2) || isX(m2) && p2 && !isX(p2);
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re2[t.TILDELOOSE] : re2[t.TILDE];
      const z2 = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_2, M2, m2, p2, pr2) => {
        debug("tilde", comp, _2, M2, m2, p2, pr2);
        let ret;
        if (isX(M2)) {
          ret = "";
        } else if (isX(m2)) {
          ret = `>=${M2}.0.0${z2} <${+M2 + 1}.0.0-0`;
        } else if (isX(p2)) {
          ret = `>=${M2}.${m2}.0${z2} <${M2}.${+m2 + 1}.0-0`;
        } else if (pr2) {
          debug("replaceTilde pr", pr2);
          ret = `>=${M2}.${m2}.${p2}-${pr2} <${M2}.${+m2 + 1}.0-0`;
        } else {
          ret = `>=${M2}.${m2}.${p2} <${M2}.${+m2 + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re2[t.CARETLOOSE] : re2[t.CARET];
      const z2 = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_2, M2, m2, p2, pr2) => {
        debug("caret", comp, _2, M2, m2, p2, pr2);
        let ret;
        if (isX(M2)) {
          ret = "";
        } else if (isX(m2)) {
          ret = `>=${M2}.0.0${z2} <${+M2 + 1}.0.0-0`;
        } else if (isX(p2)) {
          if (M2 === "0") {
            ret = `>=${M2}.${m2}.0${z2} <${M2}.${+m2 + 1}.0-0`;
          } else {
            ret = `>=${M2}.${m2}.0${z2} <${+M2 + 1}.0.0-0`;
          }
        } else if (pr2) {
          debug("replaceCaret pr", pr2);
          if (M2 === "0") {
            if (m2 === "0") {
              ret = `>=${M2}.${m2}.${p2}-${pr2} <${M2}.${m2}.${+p2 + 1}-0`;
            } else {
              ret = `>=${M2}.${m2}.${p2}-${pr2} <${M2}.${+m2 + 1}.0-0`;
            }
          } else {
            ret = `>=${M2}.${m2}.${p2}-${pr2} <${+M2 + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M2 === "0") {
            if (m2 === "0") {
              ret = `>=${M2}.${m2}.${p2} <${M2}.${m2}.${+p2 + 1}-0`;
            } else {
              ret = `>=${M2}.${m2}.${p2} <${M2}.${+m2 + 1}.0-0`;
            }
          } else {
            ret = `>=${M2}.${m2}.${p2} <${+M2 + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re2[t.XRANGELOOSE] : re2[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M2, m2, p2, pr2) => {
        debug("xRange", comp, ret, gtlt, M2, m2, p2, pr2);
        if (invalidXRangeOrder(M2, m2, p2)) {
          return comp;
        }
        const xM = isX(M2);
        const xm = xM || isX(m2);
        const xp = xm || isX(p2);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr2 = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m2 = 0;
          }
          p2 = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M2 = +M2 + 1;
              m2 = 0;
              p2 = 0;
            } else {
              m2 = +m2 + 1;
              p2 = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M2 = +M2 + 1;
            } else {
              m2 = +m2 + 1;
            }
          }
          if (gtlt === "<") {
            pr2 = "-0";
          }
          ret = `${gtlt + M2}.${m2}.${p2}${pr2}`;
        } else if (xm) {
          ret = `>=${M2}.0.0${pr2} <${+M2 + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M2}.${m2}.0${pr2} <${M2}.${+m2 + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re2[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re2[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to2, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to2 = "";
      } else if (isX(tm)) {
        to2 = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to2 = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to2 = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to2 = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to2 = `<=${to2}`;
      }
      return `${from} ${to2}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// packages/plugin-api/node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "packages/plugin-api/node_modules/semver/classes/comparator.js"(exports2, module2) {
    "use strict";
    var ANY = Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re2[t.COMPARATORLOOSE] : re2[t.COMPARATOR];
        const m2 = comp.match(r);
        if (!m2) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m2[1] !== void 0 ? m2[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m2[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m2[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er2) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module2.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re2, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// packages/plugin-api/node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "packages/plugin-api/node_modules/semver/functions/satisfies.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er2) {
        return false;
      }
      return range.test(version);
    };
    module2.exports = satisfies;
  }
});

// packages/plugin-api/node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/to-comparators.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module2.exports = toComparators;
  }
});

// packages/plugin-api/node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/max-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er2) {
        return null;
      }
      versions.forEach((v2) => {
        if (rangeObj.test(v2)) {
          if (!max || maxSV.compare(v2) === -1) {
            max = v2;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module2.exports = maxSatisfying;
  }
});

// packages/plugin-api/node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/min-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er2) {
        return null;
      }
      versions.forEach((v2) => {
        if (rangeObj.test(v2)) {
          if (!min || minSV.compare(v2) === 1) {
            min = v2;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module2.exports = minSatisfying;
  }
});

// packages/plugin-api/node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/min-version.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt2 = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt2(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt2(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module2.exports = minVersion;
  }
});

// packages/plugin-api/node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/valid.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er2) {
        return null;
      }
    };
    module2.exports = validRange;
  }
});

// packages/plugin-api/node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/outside.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt2 = require_gt();
    var lt2 = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt2;
          ltefn = lte;
          ltfn = lt2;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt2;
          ltefn = gte;
          ltfn = gt2;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module2.exports = outside;
  }
});

// packages/plugin-api/node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/gtr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module2.exports = gtr;
  }
});

// packages/plugin-api/node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/ltr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module2.exports = ltr;
  }
});

// packages/plugin-api/node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/intersects.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module2.exports = intersects;
  }
});

// packages/plugin-api/node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/simplify.js"(exports2, module2) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module2.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v2 = versions.sort((a, b2) => compare(a, b2, options));
      for (const version of v2) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v2[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v2[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// packages/plugin-api/node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "packages/plugin-api/node_modules/semver/ranges/subset.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt2, lt2;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt2 = higherGT(gt2, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt2 = lowerLT(lt2, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt2 && lt2) {
        gtltComp = compare(gt2.semver, lt2.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt2.operator !== ">=" || lt2.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt2 && !satisfies(eq, String(gt2), options)) {
          return null;
        }
        if (lt2 && !satisfies(eq, String(lt2), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt2 && !options.includePrerelease && lt2.semver.prerelease.length ? lt2.semver : false;
      let needDomGTPre = gt2 && !options.includePrerelease && gt2.semver.prerelease.length ? gt2.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt2.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt2) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt2, c, options);
            if (higher === c && higher !== gt2) {
              return false;
            }
          } else if (gt2.operator === ">=" && !c.test(gt2.semver)) {
            return false;
          }
        }
        if (lt2) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt2, c, options);
            if (lower === c && lower !== lt2) {
              return false;
            }
          } else if (lt2.operator === "<=" && !c.test(lt2.semver)) {
            return false;
          }
        }
        if (!c.operator && (lt2 || gt2) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt2 && hasDomLT && !lt2 && gtltComp !== 0) {
        return false;
      }
      if (lt2 && hasDomGT && !gt2 && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b2, options) => {
      if (!a) {
        return b2;
      }
      const comp = compare(a.semver, b2.semver, options);
      return comp > 0 ? a : comp < 0 ? b2 : b2.operator === ">" && a.operator === ">=" ? b2 : a;
    };
    var lowerLT = (a, b2, options) => {
      if (!a) {
        return b2;
      }
      const comp = compare(a.semver, b2.semver, options);
      return comp < 0 ? a : comp > 0 ? b2 : b2.operator === "<" && a.operator === "<=" ? b2 : a;
    };
    module2.exports = subset;
  }
});

// packages/plugin-api/node_modules/semver/index.js
var require_semver2 = __commonJS({
  "packages/plugin-api/node_modules/semver/index.js"(exports2, module2) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt2 = require_gt();
    var lt2 = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var truncate = require_truncate();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module2.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt: gt2,
      lt: lt2,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      truncate,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// node_modules/tar/dist/esm/index.min.js
var index_min_exports = {};
__export(index_min_exports, {
  Header: () => F,
  Pack: () => wt,
  PackJob: () => pi,
  PackSync: () => kt,
  Parser: () => rt,
  Pax: () => ft,
  ReadEntry: () => $e,
  Unpack: () => Xt,
  UnpackSync: () => xe,
  WriteEntry: () => de,
  WriteEntrySync: () => ni,
  WriteEntryTar: () => oi,
  c: () => Qn,
  create: () => Qn,
  extract: () => So,
  filesFilter: () => Qi,
  list: () => Ct,
  r: () => vt,
  replace: () => vt,
  t: () => Ct,
  types: () => Hi,
  u: () => Oo,
  update: () => Oo,
  x: () => So
});
function Zn(s3, t, e) {
  let i = t, r = t ? t.next : s3.head, n = new me(e, i, r, s3);
  return n.next === void 0 && (s3.tail = n), n.prev === void 0 && (s3.head = n), s3.length++, n;
}
function Yn(s3, t) {
  s3.tail = new me(t, s3.tail, void 0, s3), s3.head || (s3.head = s3.tail), s3.length++;
}
function Kn(s3, t) {
  s3.head = new me(t, void 0, s3.head, s3), s3.tail || (s3.tail = s3.head), s3.length++;
}
var import_events, import_fs, import_node_events, import_node_stream, import_node_string_decoder, import_node_path, import_node_fs, import_path, import_events2, import_assert, import_buffer, Ps, import_zlib, import_node_path2, import_node_path3, import_fs2, import_fs3, import_path2, import_node_path4, import_path3, import_node_fs2, import_node_assert, import_node_crypto, import_node_fs3, import_node_path5, import_fs4, import_node_fs4, import_node_path6, import_node_fs5, import_promises, import_node_path7, import_node_path8, import_node_fs6, import_node_path9, zr, Ur, Ds, Wr, Gr, Zr, Q, J, nt, De, qt, Ne, Ns, Ae, As, z, Mt, g, Qt, Bt, b, N, _, bi, Ie, L, w, _i, Oi, Is, Ti, Z, xi, Ce, Jt, Rt, C, jt, Yr, Kr, Vr, $r, Fe, Li, Xr, qr, A, Jr, ht, H, te, u, Ni, tt, Ai, ki, vi, ie, ke, Ut, Ht, Ii, Pt, at, U, ot, Y, zt, Ci, j, ee, Fi, ve, gt, Me, bt, _t, Be, et, Wt, jr, Fs, ks, vs, Ms, Bs, tn, se, K, sn, M, rn, zs, nn, Bi, Tt, Gt, Pi, re, Pe, ze, Ue, He, We, Ge, Ze, Ye, Ke, Us, hn, an, Hs, ln, cn, Ws, Gs, Hi, ne, dn, Ui, oe, Ve, mn, F, un, xt, Wi, pn, lt, En, wn, Sn, ct, yn, Rn, gn, Gi, bn, Lt, ft, On, Tn, xn, Ln, f, $e, Dt, Nn, Xi, qi, An, B, Nt, it, Zi, Zs, V, he, dt, Ys, p, st, mt, Yi, At, y, Xe, qe, Ki, Ks, Vs, ae, Vi, Qe, Yt, $, Je, It, je, ti, $s, In, le, $i, Xs, Cn, rt, ut, vn, Qi, Mn, Bn, Ct, Ji, zn, qs, ce, ei, ji, Un, Hn, ts, Qs, rr, Wn, tr, er, ir, is, sr, fe, ii, ss, si, rs, ns, os, hs, pt, ri, as, es, q, de, ni, oi, Gn, hi, me, pi, nr, li, ue, W, pe, Et, Ft, Ee, ai, G, ls, ci, or, ds, ms, fi, di, hr, cs, mi, lr, fs, wt, kt, Vn, $n, fr, dr, Xn, qn, Qn, Jn, Er, wr, mr, Sr, yr, Rr, jn, to, eo, ur, us, ps, Ei, io, Es, so, ws, Se, St, no, gr, Ss, br, oo, _r, ys, Or, Vt, Tr, ho, ao, lo, yi, Lr, Dr, _s, Nr, Os, P, Ts, xs, gi, Ar, Ir, Re, Cr, Fr, Rs, yt, O, Ri, kr, $t, gs, bs, Ls, ge, be, _e, Oe, fo, Te, mo, uo, po, vr, Xt, ye, xe, Eo, wo, So, yo, Ro, go, bo, _o, vt, Oo, To;
var init_index_min = __esm({
  "node_modules/tar/dist/esm/index.min.js"() {
    import_events = __toESM(require("events"), 1);
    import_fs = __toESM(require("fs"), 1);
    import_node_events = require("node:events");
    import_node_stream = __toESM(require("node:stream"), 1);
    import_node_string_decoder = require("node:string_decoder");
    import_node_path = __toESM(require("node:path"), 1);
    import_node_fs = __toESM(require("node:fs"), 1);
    import_path = require("path");
    import_events2 = require("events");
    import_assert = __toESM(require("assert"), 1);
    import_buffer = require("buffer");
    Ps = __toESM(require("zlib"), 1);
    import_zlib = __toESM(require("zlib"), 1);
    import_node_path2 = require("node:path");
    import_node_path3 = require("node:path");
    import_fs2 = __toESM(require("fs"), 1);
    import_fs3 = __toESM(require("fs"), 1);
    import_path2 = __toESM(require("path"), 1);
    import_node_path4 = require("node:path");
    import_path3 = __toESM(require("path"), 1);
    import_node_fs2 = __toESM(require("node:fs"), 1);
    import_node_assert = __toESM(require("node:assert"), 1);
    import_node_crypto = require("node:crypto");
    import_node_fs3 = __toESM(require("node:fs"), 1);
    import_node_path5 = __toESM(require("node:path"), 1);
    import_fs4 = __toESM(require("fs"), 1);
    import_node_fs4 = __toESM(require("node:fs"), 1);
    import_node_path6 = __toESM(require("node:path"), 1);
    import_node_fs5 = __toESM(require("node:fs"), 1);
    import_promises = __toESM(require("node:fs/promises"), 1);
    import_node_path7 = __toESM(require("node:path"), 1);
    import_node_path8 = require("node:path");
    import_node_fs6 = __toESM(require("node:fs"), 1);
    import_node_path9 = __toESM(require("node:path"), 1);
    zr = Object.defineProperty;
    Ur = (s3, t) => {
      for (var e in t) zr(s3, e, { get: t[e], enumerable: true });
    };
    Ds = typeof process == "object" && process ? process : { stdout: null, stderr: null };
    Wr = (s3) => !!s3 && typeof s3 == "object" && (s3 instanceof A || s3 instanceof import_node_stream.default || Gr(s3) || Zr(s3));
    Gr = (s3) => !!s3 && typeof s3 == "object" && s3 instanceof import_node_events.EventEmitter && typeof s3.pipe == "function" && s3.pipe !== import_node_stream.default.Writable.prototype.pipe;
    Zr = (s3) => !!s3 && typeof s3 == "object" && s3 instanceof import_node_events.EventEmitter && typeof s3.write == "function" && typeof s3.end == "function";
    Q = Symbol("EOF");
    J = Symbol("maybeEmitEnd");
    nt = Symbol("emittedEnd");
    De = Symbol("emittingEnd");
    qt = Symbol("emittedError");
    Ne = Symbol("closed");
    Ns = Symbol("read");
    Ae = Symbol("flush");
    As = Symbol("flushChunk");
    z = Symbol("encoding");
    Mt = Symbol("decoder");
    g = Symbol("flowing");
    Qt = Symbol("paused");
    Bt = Symbol("resume");
    b = Symbol("buffer");
    N = Symbol("pipes");
    _ = Symbol("bufferLength");
    bi = Symbol("bufferPush");
    Ie = Symbol("bufferShift");
    L = Symbol("objectMode");
    w = Symbol("destroyed");
    _i = Symbol("error");
    Oi = Symbol("emitData");
    Is = Symbol("emitEnd");
    Ti = Symbol("emitEnd2");
    Z = Symbol("async");
    xi = Symbol("abort");
    Ce = Symbol("aborted");
    Jt = Symbol("signal");
    Rt = Symbol("dataListeners");
    C = Symbol("discarded");
    jt = (s3) => Promise.resolve().then(s3);
    Yr = (s3) => s3();
    Kr = (s3) => s3 === "end" || s3 === "finish" || s3 === "prefinish";
    Vr = (s3) => s3 instanceof ArrayBuffer || !!s3 && typeof s3 == "object" && s3.constructor && s3.constructor.name === "ArrayBuffer" && s3.byteLength >= 0;
    $r = (s3) => !Buffer.isBuffer(s3) && ArrayBuffer.isView(s3);
    Fe = class {
      src;
      dest;
      opts;
      ondrain;
      constructor(t, e, i) {
        this.src = t, this.dest = e, this.opts = i, this.ondrain = () => t[Bt](), this.dest.on("drain", this.ondrain);
      }
      unpipe() {
        this.dest.removeListener("drain", this.ondrain);
      }
      proxyErrors(t) {
      }
      end() {
        this.unpipe(), this.opts.end && this.dest.end();
      }
    };
    Li = class extends Fe {
      unpipe() {
        this.src.removeListener("error", this.proxyErrors), super.unpipe();
      }
      constructor(t, e, i) {
        super(t, e, i), this.proxyErrors = (r) => this.dest.emit("error", r), t.on("error", this.proxyErrors);
      }
    };
    Xr = (s3) => !!s3.objectMode;
    qr = (s3) => !s3.objectMode && !!s3.encoding && s3.encoding !== "buffer";
    A = class extends import_node_events.EventEmitter {
      [g] = false;
      [Qt] = false;
      [N] = [];
      [b] = [];
      [L];
      [z];
      [Z];
      [Mt];
      [Q] = false;
      [nt] = false;
      [De] = false;
      [Ne] = false;
      [qt] = null;
      [_] = 0;
      [w] = false;
      [Jt];
      [Ce] = false;
      [Rt] = 0;
      [C] = false;
      writable = true;
      readable = true;
      constructor(...t) {
        let e = t[0] || {};
        if (super(), e.objectMode && typeof e.encoding == "string") throw new TypeError("Encoding and objectMode may not be used together");
        Xr(e) ? (this[L] = true, this[z] = null) : qr(e) ? (this[z] = e.encoding, this[L] = false) : (this[L] = false, this[z] = null), this[Z] = !!e.async, this[Mt] = this[z] ? new import_node_string_decoder.StringDecoder(this[z]) : null, e && e.debugExposeBuffer === true && Object.defineProperty(this, "buffer", { get: () => this[b] }), e && e.debugExposePipes === true && Object.defineProperty(this, "pipes", { get: () => this[N] });
        let { signal: i } = e;
        i && (this[Jt] = i, i.aborted ? this[xi]() : i.addEventListener("abort", () => this[xi]()));
      }
      get bufferLength() {
        return this[_];
      }
      get encoding() {
        return this[z];
      }
      set encoding(t) {
        throw new Error("Encoding must be set at instantiation time");
      }
      setEncoding(t) {
        throw new Error("Encoding must be set at instantiation time");
      }
      get objectMode() {
        return this[L];
      }
      set objectMode(t) {
        throw new Error("objectMode must be set at instantiation time");
      }
      get async() {
        return this[Z];
      }
      set async(t) {
        this[Z] = this[Z] || !!t;
      }
      [xi]() {
        this[Ce] = true, this.emit("abort", this[Jt]?.reason), this.destroy(this[Jt]?.reason);
      }
      get aborted() {
        return this[Ce];
      }
      set aborted(t) {
      }
      write(t, e, i) {
        if (this[Ce]) return false;
        if (this[Q]) throw new Error("write after end");
        if (this[w]) return this.emit("error", Object.assign(new Error("Cannot call write after a stream was destroyed"), { code: "ERR_STREAM_DESTROYED" })), true;
        typeof e == "function" && (i = e, e = "utf8"), e || (e = "utf8");
        let r = this[Z] ? jt : Yr;
        if (!this[L] && !Buffer.isBuffer(t)) {
          if ($r(t)) t = Buffer.from(t.buffer, t.byteOffset, t.byteLength);
          else if (Vr(t)) t = Buffer.from(t);
          else if (typeof t != "string") throw new Error("Non-contiguous data written to non-objectMode stream");
        }
        return this[L] ? (this[g] && this[_] !== 0 && this[Ae](true), this[g] ? this.emit("data", t) : this[bi](t), this[_] !== 0 && this.emit("readable"), i && r(i), this[g]) : t.length ? (typeof t == "string" && !(e === this[z] && !this[Mt]?.lastNeed) && (t = Buffer.from(t, e)), Buffer.isBuffer(t) && this[z] && (t = this[Mt].write(t)), this[g] && this[_] !== 0 && this[Ae](true), this[g] ? this.emit("data", t) : this[bi](t), this[_] !== 0 && this.emit("readable"), i && r(i), this[g]) : (this[_] !== 0 && this.emit("readable"), i && r(i), this[g]);
      }
      read(t) {
        if (this[w]) return null;
        if (this[C] = false, this[_] === 0 || t === 0 || t && t > this[_]) return this[J](), null;
        this[L] && (t = null), this[b].length > 1 && !this[L] && (this[b] = [this[z] ? this[b].join("") : Buffer.concat(this[b], this[_])]);
        let e = this[Ns](t || null, this[b][0]);
        return this[J](), e;
      }
      [Ns](t, e) {
        if (this[L]) this[Ie]();
        else {
          let i = e;
          t === i.length || t === null ? this[Ie]() : typeof i == "string" ? (this[b][0] = i.slice(t), e = i.slice(0, t), this[_] -= t) : (this[b][0] = i.subarray(t), e = i.subarray(0, t), this[_] -= t);
        }
        return this.emit("data", e), !this[b].length && !this[Q] && this.emit("drain"), e;
      }
      end(t, e, i) {
        return typeof t == "function" && (i = t, t = void 0), typeof e == "function" && (i = e, e = "utf8"), t !== void 0 && this.write(t, e), i && this.once("end", i), this[Q] = true, this.writable = false, (this[g] || !this[Qt]) && this[J](), this;
      }
      [Bt]() {
        this[w] || (!this[Rt] && !this[N].length && (this[C] = true), this[Qt] = false, this[g] = true, this.emit("resume"), this[b].length ? this[Ae]() : this[Q] ? this[J]() : this.emit("drain"));
      }
      resume() {
        return this[Bt]();
      }
      pause() {
        this[g] = false, this[Qt] = true, this[C] = false;
      }
      get destroyed() {
        return this[w];
      }
      get flowing() {
        return this[g];
      }
      get paused() {
        return this[Qt];
      }
      [bi](t) {
        this[L] ? this[_] += 1 : this[_] += t.length, this[b].push(t);
      }
      [Ie]() {
        return this[L] ? this[_] -= 1 : this[_] -= this[b][0].length, this[b].shift();
      }
      [Ae](t = false) {
        do
          ;
        while (this[As](this[Ie]()) && this[b].length);
        !t && !this[b].length && !this[Q] && this.emit("drain");
      }
      [As](t) {
        return this.emit("data", t), this[g];
      }
      pipe(t, e) {
        if (this[w]) return t;
        this[C] = false;
        let i = this[nt];
        return e = e || {}, t === Ds.stdout || t === Ds.stderr ? e.end = false : e.end = e.end !== false, e.proxyErrors = !!e.proxyErrors, i ? e.end && t.end() : (this[N].push(e.proxyErrors ? new Li(this, t, e) : new Fe(this, t, e)), this[Z] ? jt(() => this[Bt]()) : this[Bt]()), t;
      }
      unpipe(t) {
        let e = this[N].find((i) => i.dest === t);
        e && (this[N].length === 1 ? (this[g] && this[Rt] === 0 && (this[g] = false), this[N] = []) : this[N].splice(this[N].indexOf(e), 1), e.unpipe());
      }
      addListener(t, e) {
        return this.on(t, e);
      }
      on(t, e) {
        let i = super.on(t, e);
        if (t === "data") this[C] = false, this[Rt]++, !this[N].length && !this[g] && this[Bt]();
        else if (t === "readable" && this[_] !== 0) super.emit("readable");
        else if (Kr(t) && this[nt]) super.emit(t), this.removeAllListeners(t);
        else if (t === "error" && this[qt]) {
          let r = e;
          this[Z] ? jt(() => r.call(this, this[qt])) : r.call(this, this[qt]);
        }
        return i;
      }
      removeListener(t, e) {
        return this.off(t, e);
      }
      off(t, e) {
        let i = super.off(t, e);
        return t === "data" && (this[Rt] = this.listeners("data").length, this[Rt] === 0 && !this[C] && !this[N].length && (this[g] = false)), i;
      }
      removeAllListeners(t) {
        let e = super.removeAllListeners(t);
        return (t === "data" || t === void 0) && (this[Rt] = 0, !this[C] && !this[N].length && (this[g] = false)), e;
      }
      get emittedEnd() {
        return this[nt];
      }
      [J]() {
        !this[De] && !this[nt] && !this[w] && this[b].length === 0 && this[Q] && (this[De] = true, this.emit("end"), this.emit("prefinish"), this.emit("finish"), this[Ne] && this.emit("close"), this[De] = false);
      }
      emit(t, ...e) {
        let i = e[0];
        if (t !== "error" && t !== "close" && t !== w && this[w]) return false;
        if (t === "data") return !this[L] && !i ? false : this[Z] ? (jt(() => this[Oi](i)), true) : this[Oi](i);
        if (t === "end") return this[Is]();
        if (t === "close") {
          if (this[Ne] = true, !this[nt] && !this[w]) return false;
          let n = super.emit("close");
          return this.removeAllListeners("close"), n;
        } else if (t === "error") {
          this[qt] = i, super.emit(_i, i);
          let n = !this[Jt] || this.listeners("error").length ? super.emit("error", i) : false;
          return this[J](), n;
        } else if (t === "resume") {
          let n = super.emit("resume");
          return this[J](), n;
        } else if (t === "finish" || t === "prefinish") {
          let n = super.emit(t);
          return this.removeAllListeners(t), n;
        }
        let r = super.emit(t, ...e);
        return this[J](), r;
      }
      [Oi](t) {
        for (let i of this[N]) i.dest.write(t) === false && this.pause();
        let e = this[C] ? false : super.emit("data", t);
        return this[J](), e;
      }
      [Is]() {
        return this[nt] ? false : (this[nt] = true, this.readable = false, this[Z] ? (jt(() => this[Ti]()), true) : this[Ti]());
      }
      [Ti]() {
        if (this[Mt]) {
          let e = this[Mt].end();
          if (e) {
            for (let i of this[N]) i.dest.write(e);
            this[C] || super.emit("data", e);
          }
        }
        for (let e of this[N]) e.end();
        let t = super.emit("end");
        return this.removeAllListeners("end"), t;
      }
      async collect() {
        let t = Object.assign([], { dataLength: 0 });
        this[L] || (t.dataLength = 0);
        let e = this.promise();
        return this.on("data", (i) => {
          t.push(i), this[L] || (t.dataLength += i.length);
        }), await e, t;
      }
      async concat() {
        if (this[L]) throw new Error("cannot concat in objectMode");
        let t = await this.collect();
        return this[z] ? t.join("") : Buffer.concat(t, t.dataLength);
      }
      async promise() {
        return new Promise((t, e) => {
          this.on(w, () => e(new Error("stream destroyed"))), this.on("error", (i) => e(i)), this.on("end", () => t());
        });
      }
      [Symbol.asyncIterator]() {
        this[C] = false;
        let t = false, e = async () => (this.pause(), t = true, { value: void 0, done: true });
        return { next: () => {
          if (t) return e();
          let r = this.read();
          if (r !== null) return Promise.resolve({ done: false, value: r });
          if (this[Q]) return e();
          let n, o, h = (d) => {
            this.off("data", a), this.off("end", l), this.off(w, c), e(), o(d);
          }, a = (d) => {
            this.off("error", h), this.off("end", l), this.off(w, c), this.pause(), n({ value: d, done: !!this[Q] });
          }, l = () => {
            this.off("error", h), this.off("data", a), this.off(w, c), e(), n({ done: true, value: void 0 });
          }, c = () => h(new Error("stream destroyed"));
          return new Promise((d, S) => {
            o = S, n = d, this.once(w, c), this.once("error", h), this.once("end", l), this.once("data", a);
          });
        }, throw: e, return: e, [Symbol.asyncIterator]() {
          return this;
        }, [Symbol.asyncDispose]: async () => {
        } };
      }
      [Symbol.iterator]() {
        this[C] = false;
        let t = false, e = () => (this.pause(), this.off(_i, e), this.off(w, e), this.off("end", e), t = true, { done: true, value: void 0 }), i = () => {
          if (t) return e();
          let r = this.read();
          return r === null ? e() : { done: false, value: r };
        };
        return this.once("end", e), this.once(_i, e), this.once(w, e), { next: i, throw: e, return: e, [Symbol.iterator]() {
          return this;
        }, [Symbol.dispose]: () => {
        } };
      }
      destroy(t) {
        if (this[w]) return t ? this.emit("error", t) : this.emit(w), this;
        this[w] = true, this[C] = true, this[b].length = 0, this[_] = 0;
        let e = this;
        return typeof e.close == "function" && !this[Ne] && e.close(), t ? this.emit("error", t) : this.emit(w), this;
      }
      static get isStream() {
        return Wr;
      }
    };
    Jr = import_fs.default.writev;
    ht = Symbol("_autoClose");
    H = Symbol("_close");
    te = Symbol("_ended");
    u = Symbol("_fd");
    Ni = Symbol("_finished");
    tt = Symbol("_flags");
    Ai = Symbol("_flush");
    ki = Symbol("_handleChunk");
    vi = Symbol("_makeBuf");
    ie = Symbol("_mode");
    ke = Symbol("_needDrain");
    Ut = Symbol("_onerror");
    Ht = Symbol("_onopen");
    Ii = Symbol("_onread");
    Pt = Symbol("_onwrite");
    at = Symbol("_open");
    U = Symbol("_path");
    ot = Symbol("_pos");
    Y = Symbol("_queue");
    zt = Symbol("_read");
    Ci = Symbol("_readSize");
    j = Symbol("_reading");
    ee = Symbol("_remain");
    Fi = Symbol("_size");
    ve = Symbol("_write");
    gt = Symbol("_writing");
    Me = Symbol("_defaultFlag");
    bt = Symbol("_errored");
    _t = class extends A {
      [bt] = false;
      [u];
      [U];
      [Ci];
      [j] = false;
      [Fi];
      [ee];
      [ht];
      constructor(t, e) {
        if (e = e || {}, super(e), this.readable = true, this.writable = false, typeof t != "string") throw new TypeError("path must be a string");
        this[bt] = false, this[u] = typeof e.fd == "number" ? e.fd : void 0, this[U] = t, this[Ci] = e.readSize || 16 * 1024 * 1024, this[j] = false, this[Fi] = typeof e.size == "number" ? e.size : 1 / 0, this[ee] = this[Fi], this[ht] = typeof e.autoClose == "boolean" ? e.autoClose : true, typeof this[u] == "number" ? this[zt]() : this[at]();
      }
      get fd() {
        return this[u];
      }
      get path() {
        return this[U];
      }
      write() {
        throw new TypeError("this is a readable stream");
      }
      end() {
        throw new TypeError("this is a readable stream");
      }
      [at]() {
        import_fs.default.open(this[U], "r", (t, e) => this[Ht](t, e));
      }
      [Ht](t, e) {
        t ? this[Ut](t) : (this[u] = e, this.emit("open", e), this[zt]());
      }
      [vi]() {
        return Buffer.allocUnsafe(Math.min(this[Ci], this[ee]));
      }
      [zt]() {
        if (!this[j]) {
          this[j] = true;
          let t = this[vi]();
          if (t.length === 0) return process.nextTick(() => this[Ii](null, 0, t));
          import_fs.default.read(this[u], t, 0, t.length, null, (e, i, r) => this[Ii](e, i, r));
        }
      }
      [Ii](t, e, i) {
        this[j] = false, t ? this[Ut](t) : this[ki](e, i) && this[zt]();
      }
      [H]() {
        if (this[ht] && typeof this[u] == "number") {
          let t = this[u];
          this[u] = void 0, import_fs.default.close(t, (e) => e ? this.emit("error", e) : this.emit("close"));
        }
      }
      [Ut](t) {
        this[j] = true, this[H](), this.emit("error", t);
      }
      [ki](t, e) {
        let i = false;
        return this[ee] -= t, t > 0 && (i = super.write(t < e.length ? e.subarray(0, t) : e)), (t === 0 || this[ee] <= 0) && (i = false, this[H](), super.end()), i;
      }
      emit(t, ...e) {
        switch (t) {
          case "prefinish":
          case "finish":
            return false;
          case "drain":
            return typeof this[u] == "number" && this[zt](), false;
          case "error":
            return this[bt] ? false : (this[bt] = true, super.emit(t, ...e));
          default:
            return super.emit(t, ...e);
        }
      }
    };
    Be = class extends _t {
      [at]() {
        let t = true;
        try {
          this[Ht](null, import_fs.default.openSync(this[U], "r")), t = false;
        } finally {
          t && this[H]();
        }
      }
      [zt]() {
        let t = true;
        try {
          if (!this[j]) {
            this[j] = true;
            do {
              let e = this[vi](), i = e.length === 0 ? 0 : import_fs.default.readSync(this[u], e, 0, e.length, null);
              if (!this[ki](i, e)) break;
            } while (true);
            this[j] = false;
          }
          t = false;
        } finally {
          t && this[H]();
        }
      }
      [H]() {
        if (this[ht] && typeof this[u] == "number") {
          let t = this[u];
          this[u] = void 0, import_fs.default.closeSync(t), this.emit("close");
        }
      }
    };
    et = class extends import_events.default {
      readable = false;
      writable = true;
      [bt] = false;
      [gt] = false;
      [te] = false;
      [Y] = [];
      [ke] = false;
      [U];
      [ie];
      [ht];
      [u];
      [Me];
      [tt];
      [Ni] = false;
      [ot];
      constructor(t, e) {
        e = e || {}, super(e), this[U] = t, this[u] = typeof e.fd == "number" ? e.fd : void 0, this[ie] = e.mode === void 0 ? 438 : e.mode, this[ot] = typeof e.start == "number" ? e.start : void 0, this[ht] = typeof e.autoClose == "boolean" ? e.autoClose : true;
        let i = this[ot] !== void 0 ? "r+" : "w";
        this[Me] = e.flags === void 0, this[tt] = e.flags === void 0 ? i : e.flags, this[u] === void 0 && this[at]();
      }
      emit(t, ...e) {
        if (t === "error") {
          if (this[bt]) return false;
          this[bt] = true;
        }
        return super.emit(t, ...e);
      }
      get fd() {
        return this[u];
      }
      get path() {
        return this[U];
      }
      [Ut](t) {
        this[H](), this[gt] = true, this.emit("error", t);
      }
      [at]() {
        import_fs.default.open(this[U], this[tt], this[ie], (t, e) => this[Ht](t, e));
      }
      [Ht](t, e) {
        this[Me] && this[tt] === "r+" && t && t.code === "ENOENT" ? (this[tt] = "w", this[at]()) : t ? this[Ut](t) : (this[u] = e, this.emit("open", e), this[gt] || this[Ai]());
      }
      end(t, e) {
        return t && this.write(t, e), this[te] = true, !this[gt] && !this[Y].length && typeof this[u] == "number" && this[Pt](null, 0), this;
      }
      write(t, e) {
        return typeof t == "string" && (t = Buffer.from(t, e)), this[te] ? (this.emit("error", new Error("write() after end()")), false) : this[u] === void 0 || this[gt] || this[Y].length ? (this[Y].push(t), this[ke] = true, false) : (this[gt] = true, this[ve](t), true);
      }
      [ve](t) {
        import_fs.default.write(this[u], t, 0, t.length, this[ot], (e, i) => this[Pt](e, i));
      }
      [Pt](t, e) {
        t ? this[Ut](t) : (this[ot] !== void 0 && typeof e == "number" && (this[ot] += e), this[Y].length ? this[Ai]() : (this[gt] = false, this[te] && !this[Ni] ? (this[Ni] = true, this[H](), this.emit("finish")) : this[ke] && (this[ke] = false, this.emit("drain"))));
      }
      [Ai]() {
        if (this[Y].length === 0) this[te] && this[Pt](null, 0);
        else if (this[Y].length === 1) this[ve](this[Y].pop());
        else {
          let t = this[Y];
          this[Y] = [], Jr(this[u], t, this[ot], (e, i) => this[Pt](e, i));
        }
      }
      [H]() {
        if (this[ht] && typeof this[u] == "number") {
          let t = this[u];
          this[u] = void 0, import_fs.default.close(t, (e) => e ? this.emit("error", e) : this.emit("close"));
        }
      }
    };
    Wt = class extends et {
      [at]() {
        let t;
        if (this[Me] && this[tt] === "r+") try {
          t = import_fs.default.openSync(this[U], this[tt], this[ie]);
        } catch (e) {
          if (e?.code === "ENOENT") return this[tt] = "w", this[at]();
          throw e;
        }
        else t = import_fs.default.openSync(this[U], this[tt], this[ie]);
        this[Ht](null, t);
      }
      [H]() {
        if (this[ht] && typeof this[u] == "number") {
          let t = this[u];
          this[u] = void 0, import_fs.default.closeSync(t), this.emit("close");
        }
      }
      [ve](t) {
        let e = true;
        try {
          this[Pt](null, import_fs.default.writeSync(this[u], t, 0, t.length, this[ot])), e = false;
        } finally {
          if (e) try {
            this[H]();
          } catch {
          }
        }
      }
    };
    jr = /* @__PURE__ */ new Map([["C", "cwd"], ["f", "file"], ["z", "gzip"], ["P", "preservePaths"], ["U", "unlink"], ["strip-components", "strip"], ["stripComponents", "strip"], ["keep-newer", "newer"], ["keepNewer", "newer"], ["keep-newer-files", "newer"], ["keepNewerFiles", "newer"], ["k", "keep"], ["keep-existing", "keep"], ["keepExisting", "keep"], ["m", "noMtime"], ["no-mtime", "noMtime"], ["p", "preserveOwner"], ["L", "follow"], ["h", "follow"], ["onentry", "onReadEntry"]]);
    Fs = (s3) => !!s3.sync && !!s3.file;
    ks = (s3) => !s3.sync && !!s3.file;
    vs = (s3) => !!s3.sync && !s3.file;
    Ms = (s3) => !s3.sync && !s3.file;
    Bs = (s3) => !!s3.file;
    tn = (s3) => {
      let t = jr.get(s3);
      return t || s3;
    };
    se = (s3 = {}) => {
      if (!s3) return {};
      let t = {};
      for (let [e, i] of Object.entries(s3)) {
        let r = tn(e);
        t[r] = i;
      }
      return t.chmod === void 0 && t.noChmod === false && (t.chmod = true), delete t.noChmod, t;
    };
    K = (s3, t, e, i, r) => Object.assign((n = [], o, h) => {
      Array.isArray(n) && (o = n, n = {}), typeof o == "function" && (h = o, o = void 0), o = o ? Array.from(o) : [];
      let a = se(n);
      if (r?.(a, o), Fs(a)) {
        if (typeof h == "function") throw new TypeError("callback not supported for sync tar functions");
        return s3(a, o);
      } else if (ks(a)) {
        let l = t(a, o);
        return h ? l.then(() => h(), h) : l;
      } else if (vs(a)) {
        if (typeof h == "function") throw new TypeError("callback not supported for sync tar functions");
        return e(a, o);
      } else if (Ms(a)) {
        if (typeof h == "function") throw new TypeError("callback only supported with file option");
        return i(a, o);
      }
      throw new Error("impossible options??");
    }, { syncFile: s3, asyncFile: t, syncNoFile: e, asyncNoFile: i, validate: r });
    sn = import_zlib.default.constants || { ZLIB_VERNUM: 4736 };
    M = Object.freeze(Object.assign(/* @__PURE__ */ Object.create(null), { Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5, Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_MEM_ERROR: -4, Z_BUF_ERROR: -5, Z_VERSION_ERROR: -6, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0, DEFLATE: 1, INFLATE: 2, GZIP: 3, GUNZIP: 4, DEFLATERAW: 5, INFLATERAW: 6, UNZIP: 7, BROTLI_DECODE: 8, BROTLI_ENCODE: 9, Z_MIN_WINDOWBITS: 8, Z_MAX_WINDOWBITS: 15, Z_DEFAULT_WINDOWBITS: 15, Z_MIN_CHUNK: 64, Z_MAX_CHUNK: 1 / 0, Z_DEFAULT_CHUNK: 16384, Z_MIN_MEMLEVEL: 1, Z_MAX_MEMLEVEL: 9, Z_DEFAULT_MEMLEVEL: 8, Z_MIN_LEVEL: -1, Z_MAX_LEVEL: 9, Z_DEFAULT_LEVEL: -1, BROTLI_OPERATION_PROCESS: 0, BROTLI_OPERATION_FLUSH: 1, BROTLI_OPERATION_FINISH: 2, BROTLI_OPERATION_EMIT_METADATA: 3, BROTLI_MODE_GENERIC: 0, BROTLI_MODE_TEXT: 1, BROTLI_MODE_FONT: 2, BROTLI_DEFAULT_MODE: 0, BROTLI_MIN_QUALITY: 0, BROTLI_MAX_QUALITY: 11, BROTLI_DEFAULT_QUALITY: 11, BROTLI_MIN_WINDOW_BITS: 10, BROTLI_MAX_WINDOW_BITS: 24, BROTLI_LARGE_MAX_WINDOW_BITS: 30, BROTLI_DEFAULT_WINDOW: 22, BROTLI_MIN_INPUT_BLOCK_BITS: 16, BROTLI_MAX_INPUT_BLOCK_BITS: 24, BROTLI_PARAM_MODE: 0, BROTLI_PARAM_QUALITY: 1, BROTLI_PARAM_LGWIN: 2, BROTLI_PARAM_LGBLOCK: 3, BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING: 4, BROTLI_PARAM_SIZE_HINT: 5, BROTLI_PARAM_LARGE_WINDOW: 6, BROTLI_PARAM_NPOSTFIX: 7, BROTLI_PARAM_NDIRECT: 8, BROTLI_DECODER_RESULT_ERROR: 0, BROTLI_DECODER_RESULT_SUCCESS: 1, BROTLI_DECODER_RESULT_NEEDS_MORE_INPUT: 2, BROTLI_DECODER_RESULT_NEEDS_MORE_OUTPUT: 3, BROTLI_DECODER_PARAM_DISABLE_RING_BUFFER_REALLOCATION: 0, BROTLI_DECODER_PARAM_LARGE_WINDOW: 1, BROTLI_DECODER_NO_ERROR: 0, BROTLI_DECODER_SUCCESS: 1, BROTLI_DECODER_NEEDS_MORE_INPUT: 2, BROTLI_DECODER_NEEDS_MORE_OUTPUT: 3, BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_NIBBLE: -1, BROTLI_DECODER_ERROR_FORMAT_RESERVED: -2, BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_META_NIBBLE: -3, BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_ALPHABET: -4, BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_SAME: -5, BROTLI_DECODER_ERROR_FORMAT_CL_SPACE: -6, BROTLI_DECODER_ERROR_FORMAT_HUFFMAN_SPACE: -7, BROTLI_DECODER_ERROR_FORMAT_CONTEXT_MAP_REPEAT: -8, BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_1: -9, BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_2: -10, BROTLI_DECODER_ERROR_FORMAT_TRANSFORM: -11, BROTLI_DECODER_ERROR_FORMAT_DICTIONARY: -12, BROTLI_DECODER_ERROR_FORMAT_WINDOW_BITS: -13, BROTLI_DECODER_ERROR_FORMAT_PADDING_1: -14, BROTLI_DECODER_ERROR_FORMAT_PADDING_2: -15, BROTLI_DECODER_ERROR_FORMAT_DISTANCE: -16, BROTLI_DECODER_ERROR_DICTIONARY_NOT_SET: -19, BROTLI_DECODER_ERROR_INVALID_ARGUMENTS: -20, BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MODES: -21, BROTLI_DECODER_ERROR_ALLOC_TREE_GROUPS: -22, BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MAP: -25, BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_1: -26, BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_2: -27, BROTLI_DECODER_ERROR_ALLOC_BLOCK_TYPE_TREES: -30, BROTLI_DECODER_ERROR_UNREACHABLE: -31 }, sn));
    rn = import_buffer.Buffer.concat;
    zs = Object.getOwnPropertyDescriptor(import_buffer.Buffer, "concat");
    nn = (s3) => s3;
    Bi = zs?.writable === true || zs?.set !== void 0 ? (s3) => {
      import_buffer.Buffer.concat = s3 ? nn : rn;
    } : (s3) => {
    };
    Tt = Symbol("_superWrite");
    Gt = class extends Error {
      code;
      errno;
      constructor(t, e) {
        super("zlib: " + t.message, { cause: t }), this.code = t.code, this.errno = t.errno, this.code || (this.code = "ZLIB_ERROR"), this.message = "zlib: " + t.message, Error.captureStackTrace(this, e ?? this.constructor);
      }
      get name() {
        return "ZlibError";
      }
    };
    Pi = Symbol("flushFlag");
    re = class extends A {
      #t = false;
      #i = false;
      #s;
      #n;
      #r;
      #e;
      #o;
      get sawError() {
        return this.#t;
      }
      get handle() {
        return this.#e;
      }
      get flushFlag() {
        return this.#s;
      }
      constructor(t, e) {
        if (!t || typeof t != "object") throw new TypeError("invalid options for ZlibBase constructor");
        if (super(t), this.#s = t.flush ?? 0, this.#n = t.finishFlush ?? 0, this.#r = t.fullFlushFlag ?? 0, typeof Ps[e] != "function") throw new TypeError("Compression method not supported: " + e);
        try {
          this.#e = new Ps[e](t);
        } catch (i) {
          throw new Gt(i, this.constructor);
        }
        this.#o = (i) => {
          this.#t || (this.#t = true, this.close(), this.emit("error", i));
        }, this.#e?.on("error", (i) => this.#o(new Gt(i))), this.once("end", () => this.close);
      }
      close() {
        this.#e && (this.#e.close(), this.#e = void 0, this.emit("close"));
      }
      reset() {
        if (!this.#t) return (0, import_assert.default)(this.#e, "zlib binding closed"), this.#e.reset?.();
      }
      flush(t) {
        this.ended || (typeof t != "number" && (t = this.#r), this.write(Object.assign(import_buffer.Buffer.alloc(0), { [Pi]: t })));
      }
      end(t, e, i) {
        return typeof t == "function" && (i = t, e = void 0, t = void 0), typeof e == "function" && (i = e, e = void 0), t && (e ? this.write(t, e) : this.write(t)), this.flush(this.#n), this.#i = true, super.end(i);
      }
      get ended() {
        return this.#i;
      }
      [Tt](t) {
        return super.write(t);
      }
      write(t, e, i) {
        if (typeof e == "function" && (i = e, e = "utf8"), typeof t == "string" && (t = import_buffer.Buffer.from(t, e)), this.#t) return;
        (0, import_assert.default)(this.#e, "zlib binding closed");
        let r = this.#e._handle, n = r.close;
        r.close = () => {
        };
        let o = this.#e.close;
        this.#e.close = () => {
        }, Bi(true);
        let h;
        try {
          let l = typeof t[Pi] == "number" ? t[Pi] : this.#s;
          h = this.#e._processChunk(t, l), Bi(false);
        } catch (l) {
          Bi(false), this.#o(new Gt(l, this.write));
        } finally {
          this.#e && (this.#e._handle = r, r.close = n, this.#e.close = o, this.#e.removeAllListeners("error"));
        }
        this.#e && this.#e.on("error", (l) => this.#o(new Gt(l, this.write)));
        let a;
        if (h) if (Array.isArray(h) && h.length > 0) {
          let l = h[0];
          a = this[Tt](import_buffer.Buffer.from(l));
          for (let c = 1; c < h.length; c++) a = this[Tt](h[c]);
        } else a = this[Tt](import_buffer.Buffer.from(h));
        return i && i(), a;
      }
    };
    Pe = class extends re {
      #t;
      #i;
      constructor(t, e) {
        t = t || {}, t.flush = t.flush || M.Z_NO_FLUSH, t.finishFlush = t.finishFlush || M.Z_FINISH, t.fullFlushFlag = M.Z_FULL_FLUSH, super(t, e), this.#t = t.level, this.#i = t.strategy;
      }
      params(t, e) {
        if (!this.sawError) {
          if (!this.handle) throw new Error("cannot switch params when binding is closed");
          if (!this.handle.params) throw new Error("not supported in this implementation");
          if (this.#t !== t || this.#i !== e) {
            this.flush(M.Z_SYNC_FLUSH), (0, import_assert.default)(this.handle, "zlib binding closed");
            let i = this.handle.flush;
            this.handle.flush = (r, n) => {
              typeof r == "function" && (n = r, r = this.flushFlag), this.flush(r), n?.();
            };
            try {
              this.handle.params(t, e);
            } finally {
              this.handle.flush = i;
            }
            this.handle && (this.#t = t, this.#i = e);
          }
        }
      }
    };
    ze = class extends Pe {
      #t;
      constructor(t) {
        super(t, "Gzip"), this.#t = t && !!t.portable;
      }
      [Tt](t) {
        return this.#t ? (this.#t = false, t[9] = 255, super[Tt](t)) : super[Tt](t);
      }
    };
    Ue = class extends Pe {
      constructor(t) {
        super(t, "Unzip");
      }
    };
    He = class extends re {
      constructor(t, e) {
        t = t || {}, t.flush = t.flush || M.BROTLI_OPERATION_PROCESS, t.finishFlush = t.finishFlush || M.BROTLI_OPERATION_FINISH, t.fullFlushFlag = M.BROTLI_OPERATION_FLUSH, super(t, e);
      }
    };
    We = class extends He {
      constructor(t) {
        super(t, "BrotliCompress");
      }
    };
    Ge = class extends He {
      constructor(t) {
        super(t, "BrotliDecompress");
      }
    };
    Ze = class extends re {
      constructor(t, e) {
        t = t || {}, t.flush = t.flush || M.ZSTD_e_continue, t.finishFlush = t.finishFlush || M.ZSTD_e_end, t.fullFlushFlag = M.ZSTD_e_flush, super(t, e);
      }
    };
    Ye = class extends Ze {
      constructor(t) {
        super(t, "ZstdCompress");
      }
    };
    Ke = class extends Ze {
      constructor(t) {
        super(t, "ZstdDecompress");
      }
    };
    Us = (s3, t) => {
      if (Number.isSafeInteger(s3)) s3 < 0 ? an(s3, t) : hn(s3, t);
      else throw Error("cannot encode number outside of javascript safe integer range");
      return t;
    };
    hn = (s3, t) => {
      t[0] = 128;
      for (var e = t.length; e > 1; e--) t[e - 1] = s3 & 255, s3 = Math.floor(s3 / 256);
    };
    an = (s3, t) => {
      t[0] = 255;
      var e = false;
      s3 = s3 * -1;
      for (var i = t.length; i > 1; i--) {
        var r = s3 & 255;
        s3 = Math.floor(s3 / 256), e ? t[i - 1] = Ws(r) : r === 0 ? t[i - 1] = 0 : (e = true, t[i - 1] = Gs(r));
      }
    };
    Hs = (s3) => {
      let t = s3[0], e = t === 128 ? cn(s3.subarray(1, s3.length)) : t === 255 ? ln(s3) : null;
      if (e === null) throw Error("invalid base256 encoding");
      if (!Number.isSafeInteger(e)) throw Error("parsed number outside of javascript safe integer range");
      return e;
    };
    ln = (s3) => {
      for (var t = s3.length, e = 0, i = false, r = t - 1; r > -1; r--) {
        var n = Number(s3[r]), o;
        i ? o = Ws(n) : n === 0 ? o = n : (i = true, o = Gs(n)), o !== 0 && (e -= o * Math.pow(256, t - r - 1));
      }
      return e;
    };
    cn = (s3) => {
      for (var t = s3.length, e = 0, i = t - 1; i > -1; i--) {
        var r = Number(s3[i]);
        r !== 0 && (e += r * Math.pow(256, t - i - 1));
      }
      return e;
    };
    Ws = (s3) => (255 ^ s3) & 255;
    Gs = (s3) => (255 ^ s3) + 1 & 255;
    Hi = {};
    Ur(Hi, { code: () => Ve, isCode: () => ne, isName: () => dn, name: () => oe, normalFsTypes: () => Ui });
    ne = (s3) => oe.has(s3);
    dn = (s3) => Ve.has(s3);
    Ui = /* @__PURE__ */ new Set(["0", "", "1", "2", "3", "4", "5", "6", "7", "D"]);
    oe = /* @__PURE__ */ new Map([["0", "File"], ["", "OldFile"], ["1", "Link"], ["2", "SymbolicLink"], ["3", "CharacterDevice"], ["4", "BlockDevice"], ["5", "Directory"], ["6", "FIFO"], ["7", "ContiguousFile"], ["g", "GlobalExtendedHeader"], ["x", "ExtendedHeader"], ["A", "SolarisACL"], ["D", "GNUDumpDir"], ["I", "Inode"], ["K", "NextFileHasLongLinkpath"], ["L", "NextFileHasLongPath"], ["M", "ContinuationFile"], ["N", "OldGnuLongPath"], ["S", "SparseFile"], ["V", "TapeVolumeHeader"], ["X", "OldExtendedHeader"]]);
    Ve = new Map(Array.from(oe).map((s3) => [s3[1], s3[0]]));
    mn = (s3) => s3 === void 0 || s3 < 0 ? void 0 : s3;
    F = class {
      cksumValid = false;
      needPax = false;
      nullBlock = false;
      block;
      path;
      mode;
      uid;
      gid;
      size;
      cksum;
      #t = "Unsupported";
      linkpath;
      uname;
      gname;
      devmaj = 0;
      devmin = 0;
      atime;
      ctime;
      mtime;
      charset;
      comment;
      constructor(t, e = 0, i, r) {
        Buffer.isBuffer(t) ? this.decode(t, e || 0, i, r) : t && this.#i(t);
      }
      decode(t, e, i, r) {
        if (e || (e = 0), !t || !(t.length >= e + 512)) throw new Error("need 512 bytes for header");
        let n = xt(t, e + 156, 1), o = Ui.has(n), h = o ? i : void 0, a = o ? r : void 0;
        if (this.path = h?.path ?? xt(t, e, 100), this.mode = h?.mode ?? a?.mode ?? lt(t, e + 100, 8), this.uid = h?.uid ?? a?.uid ?? lt(t, e + 108, 8), this.gid = h?.gid ?? a?.gid ?? lt(t, e + 116, 8), this.size = mn(h?.size ?? a?.size ?? lt(t, e + 124, 12)), this.mtime = h?.mtime ?? a?.mtime ?? Wi(t, e + 136, 12), this.cksum = lt(t, e + 148, 12), a && this.#i(a, true), h && this.#i(h), ne(n) && (this.#t = n || "0"), this.#t === "0" && this.path.slice(-1) === "/" && (this.#t = "5"), this.#t === "5" && (this.size = 0), this.linkpath = xt(t, e + 157, 100), t.subarray(e + 257, e + 265).toString() === "ustar\x0000") if (this.uname = h?.uname ?? a?.uname ?? xt(t, e + 265, 32), this.gname = h?.gname ?? a?.gname ?? xt(t, e + 297, 32), this.devmaj = h?.devmaj ?? a?.devmaj ?? lt(t, e + 329, 8) ?? 0, this.devmin = h?.devmin ?? a?.devmin ?? lt(t, e + 337, 8) ?? 0, t[e + 475] !== 0) {
          let c = xt(t, e + 345, 155);
          this.path = c + "/" + this.path;
        } else {
          let c = xt(t, e + 345, 130);
          c && (this.path = c + "/" + this.path), this.atime = i?.atime ?? r?.atime ?? Wi(t, e + 476, 12), this.ctime = i?.ctime ?? r?.ctime ?? Wi(t, e + 488, 12);
        }
        let l = 256;
        for (let c = e; c < e + 148; c++) l += t[c];
        for (let c = e + 156; c < e + 512; c++) l += t[c];
        this.cksumValid = l === this.cksum, this.cksum === void 0 && l === 256 && (this.nullBlock = true);
      }
      #i(t, e = false) {
        Object.assign(this, Object.fromEntries(Object.entries(t).filter(([i, r]) => !(r == null || i === "size" && Number(r) < 0 || i === "path" && e || i === "linkpath" && e || i === "global"))));
      }
      encode(t, e = 0) {
        if (t || (t = this.block = Buffer.alloc(512)), this.#t === "Unsupported" && (this.#t = "0"), !(t.length >= e + 512)) throw new Error("need 512 bytes for header");
        let i = this.ctime || this.atime ? 130 : 155, r = un(this.path || "", i), n = r[0], o = r[1];
        this.needPax = !!r[2], this.needPax = Lt(t, e, 100, n) || this.needPax, this.needPax = ct(t, e + 100, 8, this.mode) || this.needPax, this.needPax = ct(t, e + 108, 8, this.uid) || this.needPax, this.needPax = ct(t, e + 116, 8, this.gid) || this.needPax, this.needPax = ct(t, e + 124, 12, this.size) || this.needPax, this.needPax = Gi(t, e + 136, 12, this.mtime) || this.needPax, t[e + 156] = Number(this.#t.codePointAt(0)), this.needPax = Lt(t, e + 157, 100, this.linkpath) || this.needPax, t.write("ustar\x0000", e + 257, 8), this.needPax = Lt(t, e + 265, 32, this.uname) || this.needPax, this.needPax = Lt(t, e + 297, 32, this.gname) || this.needPax, this.needPax = ct(t, e + 329, 8, this.devmaj) || this.needPax, this.needPax = ct(t, e + 337, 8, this.devmin) || this.needPax, this.needPax = Lt(t, e + 345, i, o) || this.needPax, t[e + 475] !== 0 ? this.needPax = Lt(t, e + 345, 155, o) || this.needPax : (this.needPax = Lt(t, e + 345, 130, o) || this.needPax, this.needPax = Gi(t, e + 476, 12, this.atime) || this.needPax, this.needPax = Gi(t, e + 488, 12, this.ctime) || this.needPax);
        let h = 256;
        for (let a = e; a < e + 148; a++) h += t[a];
        for (let a = e + 156; a < e + 512; a++) h += t[a];
        return this.cksum = h, ct(t, e + 148, 8, this.cksum), this.cksumValid = true, this.needPax;
      }
      get type() {
        return this.#t === "Unsupported" ? this.#t : oe.get(this.#t);
      }
      get typeKey() {
        return this.#t;
      }
      set type(t) {
        let e = String(Ve.get(t));
        if (ne(e) || e === "Unsupported") this.#t = e;
        else if (ne(t)) this.#t = t;
        else throw new TypeError("invalid entry type: " + t);
      }
    };
    un = (s3, t) => {
      let i = s3, r = "", n, o = import_node_path2.posix.parse(s3).root || ".";
      if (Buffer.byteLength(i) < 100) n = [i, r, false];
      else {
        r = import_node_path2.posix.dirname(i), i = import_node_path2.posix.basename(i);
        do
          Buffer.byteLength(i) <= 100 && Buffer.byteLength(r) <= t ? n = [i, r, false] : Buffer.byteLength(i) > 100 && Buffer.byteLength(r) <= t ? n = [i.slice(0, 99), r, true] : (i = import_node_path2.posix.join(import_node_path2.posix.basename(r), i), r = import_node_path2.posix.dirname(r));
        while (r !== o && n === void 0);
        n || (n = [s3.slice(0, 99), "", true]);
      }
      return n;
    };
    xt = (s3, t, e) => s3.subarray(t, t + e).toString("utf8").replace(/\0.*/, "");
    Wi = (s3, t, e) => pn(lt(s3, t, e));
    pn = (s3) => s3 === void 0 ? void 0 : new Date(s3 * 1e3);
    lt = (s3, t, e) => Number(s3[t]) & 128 ? Hs(s3.subarray(t, t + e)) : wn(s3, t, e);
    En = (s3) => isNaN(s3) ? void 0 : s3;
    wn = (s3, t, e) => En(parseInt(s3.subarray(t, t + e).toString("utf8").replace(/\0.*$/, "").trim(), 8));
    Sn = { 12: 8589934591, 8: 2097151 };
    ct = (s3, t, e, i) => i === void 0 ? false : i > Sn[e] || i < 0 ? (Us(i, s3.subarray(t, t + e)), true) : (yn(s3, t, e, i), false);
    yn = (s3, t, e, i) => s3.write(Rn(i, e), t, e, "ascii");
    Rn = (s3, t) => gn(Math.floor(s3).toString(8), t);
    gn = (s3, t) => (s3.length === t - 1 ? s3 : new Array(t - s3.length - 1).join("0") + s3 + " ") + "\0";
    Gi = (s3, t, e, i) => i === void 0 ? false : ct(s3, t, e, i.getTime() / 1e3);
    bn = new Array(156).join("\0");
    Lt = (s3, t, e, i) => i === void 0 ? false : (s3.write(i + bn, t, e, "utf8"), i.length !== Buffer.byteLength(i) || i.length > e);
    ft = class s {
      atime;
      mtime;
      ctime;
      charset;
      comment;
      gid;
      uid;
      gname;
      uname;
      linkpath;
      dev;
      ino;
      nlink;
      path;
      size;
      mode;
      global;
      constructor(t, e = false) {
        this.atime = t.atime, this.charset = t.charset, this.comment = t.comment, this.ctime = t.ctime, this.dev = t.dev, this.gid = t.gid, this.global = e, this.gname = t.gname, this.ino = t.ino, this.linkpath = t.linkpath, this.mtime = t.mtime, this.nlink = t.nlink, this.path = t.path, this.size = t.size, this.uid = t.uid, this.uname = t.uname;
      }
      encode() {
        let t = this.encodeBody();
        if (t === "") return Buffer.allocUnsafe(0);
        let e = Buffer.byteLength(t), i = 512 * Math.ceil(1 + e / 512), r = Buffer.allocUnsafe(i);
        for (let n = 0; n < 512; n++) r[n] = 0;
        new F({ path: ("PaxHeader/" + (0, import_node_path3.basename)(this.path ?? "")).slice(0, 99), mode: this.mode || 420, uid: this.uid, gid: this.gid, size: e, mtime: this.mtime, type: this.global ? "GlobalExtendedHeader" : "ExtendedHeader", linkpath: "", uname: this.uname || "", gname: this.gname || "", devmaj: 0, devmin: 0, atime: this.atime, ctime: this.ctime }).encode(r), r.write(t, 512, e, "utf8");
        for (let n = e + 512; n < r.length; n++) r[n] = 0;
        return r;
      }
      encodeBody() {
        return this.encodeField("path") + this.encodeField("ctime") + this.encodeField("atime") + this.encodeField("dev") + this.encodeField("ino") + this.encodeField("nlink") + this.encodeField("charset") + this.encodeField("comment") + this.encodeField("gid") + this.encodeField("gname") + this.encodeField("linkpath") + this.encodeField("mtime") + this.encodeField("size") + this.encodeField("uid") + this.encodeField("uname");
      }
      encodeField(t) {
        if (this[t] === void 0) return "";
        let e = this[t], i = e instanceof Date ? e.getTime() / 1e3 : e, r = " " + (t === "dev" || t === "ino" || t === "nlink" ? "SCHILY." : "") + t + "=" + i + `
`, n = Buffer.byteLength(r), o = Math.floor(Math.log(n) / Math.log(10)) + 1;
        return n + o >= Math.pow(10, o) && (o += 1), o + n + r;
      }
      static parse(t, e, i = false) {
        return new s(On(Tn(t), e), i);
      }
    };
    On = (s3, t) => t ? Object.assign({}, t, s3) : s3;
    Tn = (s3) => s3.replace(/\n$/, "").split(`
`).reduce(xn, /* @__PURE__ */ Object.create(null));
    xn = (s3, t) => {
      let e = parseInt(t, 10);
      if (e !== Buffer.byteLength(t) + 1) return s3;
      t = t.slice((e + " ").length);
      let i = t.split("="), r = i.shift();
      if (!r) return s3;
      let n = r.replace(/^SCHILY\.(dev|ino|nlink)/, "$1"), o = i.join("=").replace(/\0.*/, "");
      switch (n) {
        case "path":
        case "linkpath":
        case "type":
        case "charset":
        case "comment":
        case "gname":
        case "uname":
          s3[n] = o;
          break;
        case "ctime":
        case "atime":
        case "mtime":
          s3[n] = new Date(Number(o) * 1e3);
          break;
        case "size":
          let h = +o;
          h >= 0 && (s3[n] = h);
          break;
        case "gid":
        case "uid":
        case "dev":
        case "ino":
        case "nlink":
        case "mode":
          s3[n] = +o;
          break;
      }
      return s3;
    };
    Ln = process.env.TESTING_TAR_FAKE_PLATFORM || process.platform;
    f = Ln !== "win32" ? (s3) => String(s3) : (s3) => String(s3).replaceAll(/\\/g, "/");
    $e = class extends A {
      extended;
      globalExtended;
      header;
      startBlockSize;
      blockRemain;
      remain;
      type;
      meta = false;
      ignore = false;
      path;
      mode;
      uid;
      gid;
      uname;
      gname;
      size = 0;
      mtime;
      atime;
      ctime;
      linkpath;
      dev;
      ino;
      nlink;
      invalid = false;
      absolute;
      unsupported = false;
      constructor(t, e, i) {
        switch (super({}), this.pause(), this.extended = e, this.globalExtended = i, this.header = t, this.remain = t.size ?? 0, this.startBlockSize = 512 * Math.ceil(this.remain / 512), this.blockRemain = this.startBlockSize, this.type = t.type, this.type) {
          case "File":
          case "OldFile":
          case "Link":
          case "SymbolicLink":
          case "CharacterDevice":
          case "BlockDevice":
          case "Directory":
          case "FIFO":
          case "ContiguousFile":
          case "GNUDumpDir":
            break;
          case "NextFileHasLongLinkpath":
          case "NextFileHasLongPath":
          case "OldGnuLongPath":
          case "GlobalExtendedHeader":
          case "ExtendedHeader":
          case "OldExtendedHeader":
            this.meta = true;
            break;
          default:
            this.ignore = true;
        }
        if (!t.path) throw new Error("no path provided for tar.ReadEntry");
        this.path = f(t.path), this.mode = t.mode, this.mode && (this.mode = this.mode & 4095), this.uid = t.uid, this.gid = t.gid, this.uname = t.uname, this.gname = t.gname, this.size = this.remain, this.mtime = t.mtime, this.atime = t.atime, this.ctime = t.ctime, this.linkpath = t.linkpath ? f(t.linkpath) : void 0, this.uname = t.uname, this.gname = t.gname, e && this.#t(e), i && this.#t(i, true);
      }
      write(t) {
        let e = t.length;
        if (e > this.blockRemain) throw new Error("writing more to entry than is appropriate");
        let i = this.remain, r = this.blockRemain;
        return this.remain = Math.max(0, i - e), this.blockRemain = Math.max(0, r - e), this.ignore ? true : i >= e ? super.write(t) : super.write(t.subarray(0, i));
      }
      #t(t, e = false) {
        t.path && (t.path = f(t.path)), t.linkpath && (t.linkpath = f(t.linkpath)), Object.assign(this, Object.fromEntries(Object.entries(t).filter(([i, r]) => !(r == null || i === "path" && e))));
      }
    };
    Dt = (s3, t, e, i = {}) => {
      s3.file && (i.file = s3.file), s3.cwd && (i.cwd = s3.cwd), i.code = e instanceof Error && e.code || t, i.tarCode = t, !s3.strict && i.recoverable !== false ? (e instanceof Error && (i = Object.assign(e, i), e = e.message), s3.emit("warn", t, e, i)) : e instanceof Error ? s3.emit("error", Object.assign(e, i)) : s3.emit("error", Object.assign(new Error(`${t}: ${e}`), i));
    };
    Nn = 1024 * 1024;
    Xi = Buffer.from([31, 139]);
    qi = Buffer.from([40, 181, 47, 253]);
    An = Math.max(Xi.length, qi.length);
    B = Symbol("state");
    Nt = Symbol("writeEntry");
    it = Symbol("readEntry");
    Zi = Symbol("nextEntry");
    Zs = Symbol("processEntry");
    V = Symbol("extendedHeader");
    he = Symbol("globalExtendedHeader");
    dt = Symbol("meta");
    Ys = Symbol("emitMeta");
    p = Symbol("buffer");
    st = Symbol("queue");
    mt = Symbol("ended");
    Yi = Symbol("emittedEnd");
    At = Symbol("emit");
    y = Symbol("unzip");
    Xe = Symbol("consumeChunk");
    qe = Symbol("consumeChunkSub");
    Ki = Symbol("consumeBody");
    Ks = Symbol("consumeMeta");
    Vs = Symbol("consumeHeader");
    ae = Symbol("consuming");
    Vi = Symbol("bufferConcat");
    Qe = Symbol("maybeEnd");
    Yt = Symbol("writing");
    $ = Symbol("aborted");
    Je = Symbol("onDone");
    It = Symbol("sawValidEntry");
    je = Symbol("sawNullBlock");
    ti = Symbol("sawEOF");
    $s = Symbol("closeStream");
    In = 1e3;
    le = Symbol("compressedBytesRead");
    $i = Symbol("decompressedBytesRead");
    Xs = Symbol("checkDecompressionRatio");
    Cn = () => true;
    rt = class extends import_events2.EventEmitter {
      file;
      strict;
      maxMetaEntrySize;
      filter;
      brotli;
      zstd;
      maxDecompressionRatio;
      writable = true;
      readable = false;
      [st] = [];
      [p];
      [it];
      [Nt];
      [B] = "begin";
      [dt] = "";
      [V];
      [he];
      [mt] = false;
      [y];
      [$] = false;
      [It];
      [je] = false;
      [ti] = false;
      [Yt] = false;
      [ae] = false;
      [Yi] = false;
      [le] = 0;
      [$i] = 0;
      constructor(t = {}) {
        super(), this.file = t.file || "", this.on(Je, () => {
          (this[B] === "begin" || this[It] === false) && this.warn("TAR_BAD_ARCHIVE", "Unrecognized archive format");
        }), t.ondone ? this.on(Je, t.ondone) : this.on(Je, () => {
          this.emit("prefinish"), this.emit("finish"), this.emit("end");
        }), this.strict = !!t.strict, this.maxDecompressionRatio = typeof t.maxDecompressionRatio == "number" ? t.maxDecompressionRatio : In, this.maxMetaEntrySize = t.maxMetaEntrySize || Nn, this.filter = typeof t.filter == "function" ? t.filter : Cn;
        let e = t.file && (t.file.endsWith(".tar.br") || t.file.endsWith(".tbr"));
        this.brotli = !(t.gzip || t.zstd) && t.brotli !== void 0 ? t.brotli : e ? void 0 : false;
        let i = t.file && (t.file.endsWith(".tar.zst") || t.file.endsWith(".tzst"));
        this.zstd = !(t.gzip || t.brotli) && t.zstd !== void 0 ? t.zstd : i ? true : void 0, this.on("end", () => this[$s]()), typeof t.onwarn == "function" && this.on("warn", t.onwarn), typeof t.onReadEntry == "function" && this.on("entry", t.onReadEntry);
      }
      warn(t, e, i = {}) {
        Dt(this, t, e, i);
      }
      [Vs](t, e) {
        this[It] === void 0 && (this[It] = false);
        let i;
        try {
          i = new F(t, e, this[V], this[he]);
        } catch (r) {
          return this.warn("TAR_ENTRY_INVALID", r);
        }
        if (i.nullBlock) this[je] ? (this[ti] = true, this[B] === "begin" && (this[B] = "header"), this[At]("eof")) : (this[je] = true, this[At]("nullBlock"));
        else if (this[je] = false, !i.cksumValid) this.warn("TAR_ENTRY_INVALID", "checksum failure", { header: i });
        else if (!i.path) this.warn("TAR_ENTRY_INVALID", "path is required", { header: i });
        else {
          let r = i.type;
          if (/^(Symbolic)?Link$/.test(r) && !i.linkpath) this.warn("TAR_ENTRY_INVALID", "linkpath required", { header: i });
          else if (!/^(Symbolic)?Link$/.test(r) && !/^(Global)?ExtendedHeader$/.test(r) && i.linkpath) this.warn("TAR_ENTRY_INVALID", "linkpath forbidden", { header: i });
          else {
            let n = this[Nt] = new $e(i, this[V], this[he]);
            if (!this[It]) if (n.remain) {
              let o = () => {
                n.invalid || (this[It] = true);
              };
              n.on("end", o);
            } else this[It] = true;
            n.meta ? n.size > this.maxMetaEntrySize ? (n.ignore = true, this[At]("ignoredEntry", n), this[B] = "ignore", n.resume()) : n.size > 0 && (this[dt] = "", n.on("data", (o) => this[dt] += o), this[B] = "meta") : (this[V] = void 0, n.ignore = n.ignore || !this.filter(n.path, n), n.ignore ? (this[At]("ignoredEntry", n), this[B] = n.remain ? "ignore" : "header", n.resume()) : (n.remain ? this[B] = "body" : (this[B] = "header", n.end()), this[it] ? this[st].push(n) : (this[st].push(n), this[Zi]())));
          }
        }
      }
      [$s]() {
        queueMicrotask(() => this.emit("close"));
      }
      [Zs](t) {
        let e = true;
        if (!t) this[it] = void 0, e = false;
        else if (Array.isArray(t)) {
          let [i, ...r] = t;
          this.emit(i, ...r);
        } else this[it] = t, this.emit("entry", t), t.emittedEnd || (t.on("end", () => this[Zi]()), e = false);
        return e;
      }
      [Zi]() {
        do
          ;
        while (this[Zs](this[st].shift()));
        if (this[st].length === 0) {
          let t = this[it];
          !t || t.flowing || t.size === t.remain ? this[Yt] || this.emit("drain") : t.once("drain", () => this.emit("drain"));
        }
      }
      [Ki](t, e) {
        let i = this[Nt];
        if (!i) throw new Error("attempt to consume body without entry??");
        let r = i.blockRemain ?? 0, n = r >= t.length && e === 0 ? t : t.subarray(e, e + r);
        return i.write(n), i.blockRemain || (this[B] = "header", this[Nt] = void 0, i.end()), n.length;
      }
      [Ks](t, e) {
        let i = this[Nt], r = this[Ki](t, e);
        return !this[Nt] && i && this[Ys](i), r;
      }
      [At](t, e, i) {
        this[st].length === 0 && !this[it] ? this.emit(t, e, i) : this[st].push([t, e, i]);
      }
      [Ys](t) {
        switch (this[At]("meta", this[dt]), t.type) {
          case "ExtendedHeader":
          case "OldExtendedHeader":
            this[V] = ft.parse(this[dt], this[V], false);
            break;
          case "GlobalExtendedHeader":
            this[he] = ft.parse(this[dt], this[he], true);
            break;
          case "NextFileHasLongPath":
          case "OldGnuLongPath": {
            let e = this[V] ?? /* @__PURE__ */ Object.create(null);
            this[V] = e, e.path = this[dt].replace(/\0.*/, "");
            break;
          }
          case "NextFileHasLongLinkpath": {
            let e = this[V] || /* @__PURE__ */ Object.create(null);
            this[V] = e, e.linkpath = this[dt].replace(/\0.*/, "");
            break;
          }
          default:
            throw new Error("unknown meta: " + t.type);
        }
      }
      abort(t) {
        this[$] || (this[$] = true, this.emit("abort", t), this.warn("TAR_ABORT", t, { recoverable: false }));
      }
      [Xs](t) {
        this[$i] += t.length;
        let e = this[$i] / this[le];
        return e > this.maxDecompressionRatio ? (this.abort(new Error(`max decompression ratio exceeded: ${e.toFixed(2)} > ${this.maxDecompressionRatio}`)), false) : true;
      }
      write(t, e, i) {
        if (typeof e == "function" && (i = e, e = void 0), typeof t == "string" && (t = Buffer.from(t, typeof e == "string" ? e : "utf8")), this[$]) return i?.(), false;
        if ((this[y] === void 0 || this.brotli === void 0 && this[y] === false) && t) {
          if (this[p] && (t = Buffer.concat([this[p], t]), this[p] = void 0), t.length < An) return this[p] = t, i?.(), true;
          for (let a = 0; this[y] === void 0 && a < Xi.length; a++) t[a] !== Xi[a] && (this[y] = false);
          let o = false;
          if (this[y] === false && this.zstd !== false) {
            o = true;
            for (let a = 0; a < qi.length; a++) if (t[a] !== qi[a]) {
              o = false;
              break;
            }
          }
          let h = this.brotli === void 0 && !o;
          if (this[y] === false && h) if (t.length < 512) if (this[mt]) this.brotli = true;
          else return this[p] = t, i?.(), true;
          else try {
            new F(t.subarray(0, 512)), this.brotli = false;
          } catch {
            this.brotli = true;
          }
          if (this[y] === void 0 || this[y] === false && (this.brotli || o)) {
            let a = this[mt];
            this[mt] = false, this[y] = this[y] === void 0 ? new Ue({}) : o ? new Ke({}) : new Ge({}), this[y].on("data", (c) => {
              this[Xs](c) && this[Xe](c);
            }), this[y].on("error", (c) => {
              this[$] || this.abort(c);
            }), this[y].on("end", () => {
              this[mt] = true, this[Xe]();
            }), this[Yt] = true, this[le] += t.length;
            let l = !!this[y][a ? "end" : "write"](t);
            return this[Yt] = false, i?.(), l;
          }
        }
        this[Yt] = true, this[y] ? (this[le] += t.length, this[y].write(t)) : this[Xe](t), this[Yt] = false;
        let n = this[st].length > 0 ? false : this[it] ? this[it].flowing : true;
        return !n && this[st].length === 0 && this[it]?.once("drain", () => this.emit("drain")), i?.(), n;
      }
      [Vi](t) {
        t && !this[$] && (this[p] = this[p] ? Buffer.concat([this[p], t]) : t);
      }
      [Qe]() {
        if (this[mt] && !this[Yi] && !this[$] && !this[ae]) {
          this[Yi] = true;
          let t = this[Nt];
          if (t?.blockRemain) {
            let e = this[p] ? this[p].length : 0;
            this.warn("TAR_BAD_ARCHIVE", `Truncated input (needed ${t.blockRemain} more bytes, only ${e} available)`, { entry: t }), this[p] && t.write(this[p]), t.end();
          }
          this[At](Je);
        }
      }
      [Xe](t) {
        if (this[ae] && t) this[Vi](t);
        else if (!t && !this[p]) this[Qe]();
        else if (t) {
          if (this[ae] = true, this[p]) {
            this[Vi](t);
            let e = this[p];
            this[p] = void 0, this[qe](e);
          } else this[qe](t);
          for (; this[p] && this[p]?.length >= 512 && !this[$] && !this[ti]; ) {
            let e = this[p];
            this[p] = void 0, this[qe](e);
          }
          this[ae] = false;
        }
        (!this[p] || this[mt]) && this[Qe]();
      }
      [qe](t) {
        let e = 0, i = t.length;
        for (; e + 512 <= i && !this[$] && !this[ti]; ) switch (this[B]) {
          case "begin":
          case "header":
            this[Vs](t, e), e += 512;
            break;
          case "ignore":
          case "body":
            e += this[Ki](t, e);
            break;
          case "meta":
            e += this[Ks](t, e);
            break;
          default:
            throw new Error("invalid state: " + this[B]);
        }
        e < i && (this[p] = this[p] ? Buffer.concat([t.subarray(e), this[p]]) : t.subarray(e));
      }
      end(t, e, i) {
        return typeof t == "function" && (i = t, e = void 0, t = void 0), typeof e == "function" && (i = e, e = void 0), typeof t == "string" && (t = Buffer.from(t, e)), i && this.once("finish", i), this[$] || (this[y] ? (t && (this[le] += t.length, this[y].write(t)), this[y].end()) : (this[mt] = true, (this.brotli === void 0 || this.zstd === void 0) && (t = t || Buffer.alloc(0)), t && this.write(t), this[Qe]())), this;
      }
    };
    ut = (s3) => {
      let t = s3.length - 1, e = -1;
      for (; t > -1 && s3.charAt(t) === "/"; ) e = t, t--;
      return e === -1 ? s3 : s3.slice(0, e);
    };
    vn = (s3) => {
      let t = s3.onReadEntry;
      s3.onReadEntry = t ? (e) => {
        t(e), e.resume();
      } : (e) => e.resume();
    };
    Qi = (s3, t) => {
      let e = new Map(t.map((n) => [ut(n), true])), i = s3.filter, r = (n, o = "") => {
        let h = o || (0, import_path.parse)(n).root || ".", a;
        if (n === h) a = false;
        else {
          let l = e.get(n);
          a = l !== void 0 ? l : r((0, import_path.dirname)(n), h);
        }
        return e.set(n, a), a;
      };
      s3.filter = i ? (n, o) => i(n, o) && r(ut(n)) : (n) => r(ut(n));
    };
    Mn = (s3) => {
      let t = new rt(s3), e = s3.file, i;
      try {
        i = import_node_fs.default.openSync(e, "r");
        let r = import_node_fs.default.fstatSync(i), n = s3.maxReadSize || 16 * 1024 * 1024;
        if (r.size < n) {
          let o = Buffer.allocUnsafe(r.size), h = import_node_fs.default.readSync(i, o, 0, r.size, 0);
          t.end(h === o.byteLength ? o : o.subarray(0, h));
        } else {
          let o = 0, h = Buffer.allocUnsafe(n);
          for (; o < r.size; ) {
            let a = import_node_fs.default.readSync(i, h, 0, n, o);
            if (a === 0) break;
            o += a, t.write(h.subarray(0, a));
          }
          t.end();
        }
      } finally {
        if (typeof i == "number") try {
          import_node_fs.default.closeSync(i);
        } catch {
        }
      }
    };
    Bn = (s3, t) => {
      let e = new rt(s3), i = s3.maxReadSize || 16 * 1024 * 1024, r = s3.file;
      return new Promise((o, h) => {
        e.on("error", h), e.on("end", o), import_node_fs.default.stat(r, (a, l) => {
          if (a) h(a);
          else {
            let c = new _t(r, { readSize: i, size: l.size });
            c.on("error", h), c.pipe(e);
          }
        });
      });
    };
    Ct = K(Mn, Bn, (s3) => new rt(s3), (s3) => new rt(s3), (s3, t) => {
      t?.length && Qi(s3, t), s3.noResume || vn(s3);
    });
    Ji = (s3, t, e) => (s3 &= 4095, e && (s3 = (s3 | 384) & -19), t && (s3 & 256 && (s3 |= 64), s3 & 32 && (s3 |= 8), s3 & 4 && (s3 |= 1)), s3);
    ({ isAbsolute: zn, parse: qs } = import_node_path4.win32);
    ce = (s3) => {
      let t = "", e = qs(s3);
      for (; zn(s3) || e.root; ) {
        let i = s3.charAt(0) === "/" && s3.slice(0, 4) !== "//?/" ? "/" : e.root;
        s3 = s3.slice(i.length), t += i, e = qs(s3);
      }
      return [t, s3];
    };
    ei = ["|", "<", ">", "?", ":"];
    ji = ei.map((s3) => String.fromCodePoint(61440 + Number(s3.codePointAt(0))));
    Un = new Map(ei.map((s3, t) => [s3, ji[t]]));
    Hn = new Map(ji.map((s3, t) => [s3, ei[t]]));
    ts = (s3) => ei.reduce((t, e) => t.split(e).join(Un.get(e)), s3);
    Qs = (s3) => ji.reduce((t, e) => t.split(e).join(Hn.get(e)), s3);
    rr = (s3, t) => t ? (s3 = f(s3).replace(/^\.(\/|$)/, ""), ut(t) + "/" + s3) : f(s3);
    Wn = 16 * 1024 * 1024;
    tr = Symbol("process");
    er = Symbol("file");
    ir = Symbol("directory");
    is = Symbol("symlink");
    sr = Symbol("hardlink");
    fe = Symbol("header");
    ii = Symbol("read");
    ss = Symbol("lstat");
    si = Symbol("onlstat");
    rs = Symbol("onread");
    ns = Symbol("onreadlink");
    os = Symbol("openfile");
    hs = Symbol("onopenfile");
    pt = Symbol("close");
    ri = Symbol("mode");
    as = Symbol("awaitDrain");
    es = Symbol("ondrain");
    q = Symbol("prefix");
    de = class extends A {
      path;
      portable;
      myuid = process.getuid && process.getuid() || 0;
      myuser = process.env.USER || "";
      maxReadSize;
      linkCache;
      statCache;
      preservePaths;
      cwd;
      strict;
      mtime;
      noPax;
      noMtime;
      prefix;
      fd;
      blockLen = 0;
      blockRemain = 0;
      buf;
      pos = 0;
      remain = 0;
      length = 0;
      offset = 0;
      win32;
      absolute;
      header;
      type;
      linkpath;
      stat;
      onWriteEntry;
      #t = false;
      constructor(t, e = {}) {
        let i = se(e);
        super(), this.path = f(t), this.portable = !!i.portable, this.maxReadSize = i.maxReadSize || Wn, this.linkCache = i.linkCache || /* @__PURE__ */ new Map(), this.statCache = i.statCache || /* @__PURE__ */ new Map(), this.preservePaths = !!i.preservePaths, this.cwd = f(i.cwd || process.cwd()), this.strict = !!i.strict, this.noPax = !!i.noPax, this.noMtime = !!i.noMtime, this.mtime = i.mtime, this.prefix = i.prefix ? f(i.prefix) : void 0, this.onWriteEntry = i.onWriteEntry, typeof i.onwarn == "function" && this.on("warn", i.onwarn);
        let r = false;
        if (!this.preservePaths) {
          let [o, h] = ce(this.path);
          o && typeof h == "string" && (this.path = h, r = o);
        }
        this.win32 = !!i.win32 || process.platform === "win32", this.win32 && (this.path = Qs(this.path.replaceAll(/\\/g, "/")), t = t.replaceAll(/\\/g, "/")), this.absolute = f(i.absolute || import_path2.default.resolve(this.cwd, t)), this.path === "" && (this.path = "./"), r && this.warn("TAR_ENTRY_INFO", `stripping ${r} from absolute path`, { entry: this, path: r + this.path });
        let n = this.statCache.get(this.absolute);
        n ? this[si](n) : this[ss]();
      }
      warn(t, e, i = {}) {
        return Dt(this, t, e, i);
      }
      emit(t, ...e) {
        return t === "error" && (this.#t = true), super.emit(t, ...e);
      }
      [ss]() {
        import_fs3.default.lstat(this.absolute, (t, e) => {
          if (t) return this.emit("error", t);
          this[si](e);
        });
      }
      [si](t) {
        this.statCache.set(this.absolute, t), this.stat = t, t.isFile() || (t.size = 0), this.type = Gn(t), this.emit("stat", t), this[tr]();
      }
      [tr]() {
        switch (this.type) {
          case "File":
            return this[er]();
          case "Directory":
            return this[ir]();
          case "SymbolicLink":
            return this[is]();
          default:
            return this.end();
        }
      }
      [ri](t) {
        return Ji(t, this.type === "Directory", this.portable);
      }
      [q](t) {
        return rr(t, this.prefix);
      }
      [fe]() {
        if (!this.stat) throw new Error("cannot write header before stat");
        this.type === "Directory" && this.portable && (this.noMtime = true), this.onWriteEntry?.(this), this.header = new F({ path: this[q](this.path), linkpath: this.type === "Link" && this.linkpath !== void 0 ? this[q](this.linkpath) : this.linkpath, mode: this[ri](this.stat.mode), uid: this.portable ? void 0 : this.stat.uid, gid: this.portable ? void 0 : this.stat.gid, size: this.stat.size, mtime: this.noMtime ? void 0 : this.mtime || this.stat.mtime, type: this.type === "Unsupported" ? void 0 : this.type, uname: this.portable ? void 0 : this.stat.uid === this.myuid ? this.myuser : "", atime: this.portable ? void 0 : this.stat.atime, ctime: this.portable ? void 0 : this.stat.ctime }), this.header.encode() && !this.noPax && super.write(new ft({ atime: this.portable ? void 0 : this.header.atime, ctime: this.portable ? void 0 : this.header.ctime, gid: this.portable ? void 0 : this.header.gid, mtime: this.noMtime ? void 0 : this.mtime || this.header.mtime, path: this[q](this.path), linkpath: this.type === "Link" && this.linkpath !== void 0 ? this[q](this.linkpath) : this.linkpath, size: this.header.size, uid: this.portable ? void 0 : this.header.uid, uname: this.portable ? void 0 : this.header.uname, dev: this.portable ? void 0 : this.stat.dev, ino: this.portable ? void 0 : this.stat.ino, nlink: this.portable ? void 0 : this.stat.nlink }).encode());
        let t = this.header?.block;
        if (!t) throw new Error("failed to encode header");
        super.write(t);
      }
      [ir]() {
        if (!this.stat) throw new Error("cannot create directory entry without stat");
        this.path.slice(-1) !== "/" && (this.path += "/"), this.stat.size = 0, this[fe](), this.end();
      }
      [is]() {
        import_fs3.default.readlink(this.absolute, (t, e) => {
          if (t) return this.emit("error", t);
          this[ns](e);
        });
      }
      [ns](t) {
        this.linkpath = f(t), this[fe](), this.end();
      }
      [sr](t) {
        if (!this.stat) throw new Error("cannot create link entry without stat");
        this.type = "Link", this.linkpath = f(import_path2.default.relative(this.cwd, t)), this.stat.size = 0, this[fe](), this.end();
      }
      [er]() {
        if (!this.stat) throw new Error("cannot create file entry without stat");
        if (this.stat.nlink > 1) {
          let t = `${this.stat.dev}:${this.stat.ino}`, e = this.linkCache.get(t);
          if (e?.indexOf(this.cwd) === 0) return this[sr](e);
          this.linkCache.set(t, this.absolute);
        }
        if (this[fe](), this.stat.size === 0) return this.end();
        this[os]();
      }
      [os]() {
        import_fs3.default.open(this.absolute, "r", (t, e) => {
          if (t) return this.emit("error", t);
          this[hs](e);
        });
      }
      [hs](t) {
        if (this.fd = t, this.#t) return this[pt]();
        if (!this.stat) throw new Error("should stat before calling onopenfile");
        this.blockLen = 512 * Math.ceil(this.stat.size / 512), this.blockRemain = this.blockLen;
        let e = Math.min(this.blockLen, this.maxReadSize);
        this.buf = Buffer.allocUnsafe(e), this.offset = 0, this.pos = 0, this.remain = this.stat.size, this.length = this.buf.length, this[ii]();
      }
      [ii]() {
        let { fd: t, buf: e, offset: i, length: r, pos: n } = this;
        if (t === void 0 || e === void 0) throw new Error("cannot read file without first opening");
        import_fs3.default.read(t, e, i, r, n, (o, h) => {
          if (o) return this[pt](() => this.emit("error", o));
          this[rs](h);
        });
      }
      [pt](t = () => {
      }) {
        this.fd !== void 0 && import_fs3.default.close(this.fd, t);
      }
      [rs](t) {
        if (t <= 0 && this.remain > 0) {
          let r = Object.assign(new Error("encountered unexpected EOF"), { path: this.absolute, syscall: "read", code: "EOF" });
          return this[pt](() => this.emit("error", r));
        }
        if (t > this.remain) {
          let r = Object.assign(new Error("did not encounter expected EOF"), { path: this.absolute, syscall: "read", code: "EOF" });
          return this[pt](() => this.emit("error", r));
        }
        if (!this.buf) throw new Error("should have created buffer prior to reading");
        if (t === this.remain) for (let r = t; r < this.length && t < this.blockRemain; r++) this.buf[r + this.offset] = 0, t++, this.remain++;
        let e = this.offset === 0 && t === this.buf.length ? this.buf : this.buf.subarray(this.offset, this.offset + t);
        this.write(e) ? this[es]() : this[as](() => this[es]());
      }
      [as](t) {
        this.once("drain", t);
      }
      write(t, e, i) {
        if (typeof e == "function" && (i = e, e = void 0), typeof t == "string" && (t = Buffer.from(t, typeof e == "string" ? e : "utf8")), this.blockRemain < t.length) {
          let r = Object.assign(new Error("writing more data than expected"), { path: this.absolute });
          return this.emit("error", r);
        }
        return this.remain -= t.length, this.blockRemain -= t.length, this.pos += t.length, this.offset += t.length, super.write(t, null, i);
      }
      [es]() {
        if (!this.remain) return this.blockRemain && super.write(Buffer.alloc(this.blockRemain)), this[pt]((t) => t ? this.emit("error", t) : this.end());
        if (!this.buf) throw new Error("buffer lost somehow in ONDRAIN");
        this.offset >= this.length && (this.buf = Buffer.allocUnsafe(Math.min(this.blockRemain, this.buf.length)), this.offset = 0), this.length = this.buf.length - this.offset, this[ii]();
      }
    };
    ni = class extends de {
      sync = true;
      [ss]() {
        this[si](import_fs3.default.lstatSync(this.absolute));
      }
      [is]() {
        this[ns](import_fs3.default.readlinkSync(this.absolute));
      }
      [os]() {
        this[hs](import_fs3.default.openSync(this.absolute, "r"));
      }
      [ii]() {
        let t = true;
        try {
          let { fd: e, buf: i, offset: r, length: n, pos: o } = this;
          if (e === void 0 || i === void 0) throw new Error("fd and buf must be set in READ method");
          let h = import_fs3.default.readSync(e, i, r, n, o);
          this[rs](h), t = false;
        } finally {
          if (t) try {
            this[pt](() => {
            });
          } catch {
          }
        }
      }
      [as](t) {
        t();
      }
      [pt](t = () => {
      }) {
        this.fd !== void 0 && import_fs3.default.closeSync(this.fd), t();
      }
    };
    oi = class extends A {
      blockLen = 0;
      blockRemain = 0;
      buf = 0;
      pos = 0;
      remain = 0;
      length = 0;
      preservePaths;
      portable;
      strict;
      noPax;
      noMtime;
      readEntry;
      type;
      prefix;
      path;
      mode;
      uid;
      gid;
      uname;
      gname;
      header;
      mtime;
      atime;
      ctime;
      linkpath;
      size;
      onWriteEntry;
      warn(t, e, i = {}) {
        return Dt(this, t, e, i);
      }
      constructor(t, e = {}) {
        let i = se(e);
        super(), this.preservePaths = !!i.preservePaths, this.portable = !!i.portable, this.strict = !!i.strict, this.noPax = !!i.noPax, this.noMtime = !!i.noMtime, this.onWriteEntry = i.onWriteEntry, this.readEntry = t;
        let { type: r } = t;
        if (r === "Unsupported") throw new Error("writing entry that should be ignored");
        this.type = r, this.type === "Directory" && this.portable && (this.noMtime = true), this.prefix = i.prefix, this.path = f(t.path), this.mode = t.mode !== void 0 ? this[ri](t.mode) : void 0, this.uid = this.portable ? void 0 : t.uid, this.gid = this.portable ? void 0 : t.gid, this.uname = this.portable ? void 0 : t.uname, this.gname = this.portable ? void 0 : t.gname, this.size = t.size, this.mtime = this.noMtime ? void 0 : i.mtime || t.mtime, this.atime = this.portable ? void 0 : t.atime, this.ctime = this.portable ? void 0 : t.ctime, this.linkpath = t.linkpath !== void 0 ? f(t.linkpath) : void 0, typeof i.onwarn == "function" && this.on("warn", i.onwarn);
        let n = false;
        if (!this.preservePaths) {
          let [h, a] = ce(this.path);
          h && typeof a == "string" && (this.path = a, n = h);
        }
        this.remain = t.size, this.blockRemain = t.startBlockSize, this.onWriteEntry?.(this), this.header = new F({ path: this[q](this.path), linkpath: this.type === "Link" && this.linkpath !== void 0 ? this[q](this.linkpath) : this.linkpath, mode: this.mode, uid: this.portable ? void 0 : this.uid, gid: this.portable ? void 0 : this.gid, size: this.size, mtime: this.noMtime ? void 0 : this.mtime, type: this.type, uname: this.portable ? void 0 : this.uname, atime: this.portable ? void 0 : this.atime, ctime: this.portable ? void 0 : this.ctime }), n && this.warn("TAR_ENTRY_INFO", `stripping ${n} from absolute path`, { entry: this, path: n + this.path }), this.header.encode() && !this.noPax && super.write(new ft({ atime: this.portable ? void 0 : this.atime, ctime: this.portable ? void 0 : this.ctime, gid: this.portable ? void 0 : this.gid, mtime: this.noMtime ? void 0 : this.mtime, path: this[q](this.path), linkpath: this.type === "Link" && this.linkpath !== void 0 ? this[q](this.linkpath) : this.linkpath, size: this.size, uid: this.portable ? void 0 : this.uid, uname: this.portable ? void 0 : this.uname, dev: this.portable ? void 0 : this.readEntry.dev, ino: this.portable ? void 0 : this.readEntry.ino, nlink: this.portable ? void 0 : this.readEntry.nlink }).encode());
        let o = this.header?.block;
        if (!o) throw new Error("failed to encode header");
        super.write(o), t.pipe(this);
      }
      [q](t) {
        return rr(t, this.prefix);
      }
      [ri](t) {
        return Ji(t, this.type === "Directory", this.portable);
      }
      write(t, e, i) {
        typeof e == "function" && (i = e, e = void 0), typeof t == "string" && (t = Buffer.from(t, typeof e == "string" ? e : "utf8"));
        let r = t.length;
        if (r > this.blockRemain) throw new Error("writing more to entry than is appropriate");
        return this.blockRemain -= r, super.write(t, i);
      }
      end(t, e, i) {
        return this.blockRemain && super.write(Buffer.alloc(this.blockRemain)), typeof t == "function" && (i = t, e = void 0, t = void 0), typeof e == "function" && (i = e, e = void 0), typeof t == "string" && (t = Buffer.from(t, e ?? "utf8")), i && this.once("finish", i), t ? super.end(t, i) : super.end(i), this;
      }
    };
    Gn = (s3) => s3.isFile() ? "File" : s3.isDirectory() ? "Directory" : s3.isSymbolicLink() ? "SymbolicLink" : "Unsupported";
    hi = class s2 {
      tail;
      head;
      length = 0;
      static create(t = []) {
        return new s2(t);
      }
      constructor(t = []) {
        for (let e of t) this.push(e);
      }
      *[Symbol.iterator]() {
        for (let t = this.head; t; t = t.next) yield t.value;
      }
      removeNode(t) {
        if (t.list !== this) throw new Error("removing node which does not belong to this list");
        let e = t.next, i = t.prev;
        return e && (e.prev = i), i && (i.next = e), t === this.head && (this.head = e), t === this.tail && (this.tail = i), this.length--, t.next = void 0, t.prev = void 0, t.list = void 0, e;
      }
      unshiftNode(t) {
        if (t === this.head) return;
        t.list && t.list.removeNode(t);
        let e = this.head;
        t.list = this, t.next = e, e && (e.prev = t), this.head = t, this.tail || (this.tail = t), this.length++;
      }
      pushNode(t) {
        if (t === this.tail) return;
        t.list && t.list.removeNode(t);
        let e = this.tail;
        t.list = this, t.prev = e, e && (e.next = t), this.tail = t, this.head || (this.head = t), this.length++;
      }
      push(...t) {
        for (let e = 0, i = t.length; e < i; e++) Yn(this, t[e]);
        return this.length;
      }
      unshift(...t) {
        for (var e = 0, i = t.length; e < i; e++) Kn(this, t[e]);
        return this.length;
      }
      pop() {
        if (!this.tail) return;
        let t = this.tail.value, e = this.tail;
        return this.tail = this.tail.prev, this.tail ? this.tail.next = void 0 : this.head = void 0, e.list = void 0, this.length--, t;
      }
      shift() {
        if (!this.head) return;
        let t = this.head.value, e = this.head;
        return this.head = this.head.next, this.head ? this.head.prev = void 0 : this.tail = void 0, e.list = void 0, this.length--, t;
      }
      forEach(t, e) {
        e = e || this;
        for (let i = this.head, r = 0; i; r++) t.call(e, i.value, r, this), i = i.next;
      }
      forEachReverse(t, e) {
        e = e || this;
        for (let i = this.tail, r = this.length - 1; i; r--) t.call(e, i.value, r, this), i = i.prev;
      }
      get(t) {
        let e = 0, i = this.head;
        for (; i && e < t; e++) i = i.next;
        if (e === t && i) return i.value;
      }
      getReverse(t) {
        let e = 0, i = this.tail;
        for (; i && e < t; e++) i = i.prev;
        if (e === t && i) return i.value;
      }
      map(t, e) {
        e = e || this;
        let i = new s2();
        for (let r = this.head; r; ) i.push(t.call(e, r.value, this)), r = r.next;
        return i;
      }
      mapReverse(t, e) {
        e = e || this;
        var i = new s2();
        for (let r = this.tail; r; ) i.push(t.call(e, r.value, this)), r = r.prev;
        return i;
      }
      reduce(t, e) {
        let i, r = this.head;
        if (arguments.length > 1) i = e;
        else if (this.head) r = this.head.next, i = this.head.value;
        else throw new TypeError("Reduce of empty list with no initial value");
        for (var n = 0; r; n++) i = t(i, r.value, n), r = r.next;
        return i;
      }
      reduceReverse(t, e) {
        let i, r = this.tail;
        if (arguments.length > 1) i = e;
        else if (this.tail) r = this.tail.prev, i = this.tail.value;
        else throw new TypeError("Reduce of empty list with no initial value");
        for (let n = this.length - 1; r; n--) i = t(i, r.value, n), r = r.prev;
        return i;
      }
      toArray() {
        let t = new Array(this.length);
        for (let e = 0, i = this.head; i; e++) t[e] = i.value, i = i.next;
        return t;
      }
      toArrayReverse() {
        let t = new Array(this.length);
        for (let e = 0, i = this.tail; i; e++) t[e] = i.value, i = i.prev;
        return t;
      }
      slice(t = 0, e = this.length) {
        e < 0 && (e += this.length), t < 0 && (t += this.length);
        let i = new s2();
        if (e < t || e < 0) return i;
        t < 0 && (t = 0), e > this.length && (e = this.length);
        let r = this.head, n = 0;
        for (n = 0; r && n < t; n++) r = r.next;
        for (; r && n < e; n++, r = r.next) i.push(r.value);
        return i;
      }
      sliceReverse(t = 0, e = this.length) {
        e < 0 && (e += this.length), t < 0 && (t += this.length);
        let i = new s2();
        if (e < t || e < 0) return i;
        t < 0 && (t = 0), e > this.length && (e = this.length);
        let r = this.length, n = this.tail;
        for (; n && r > e; r--) n = n.prev;
        for (; n && r > t; r--, n = n.prev) i.push(n.value);
        return i;
      }
      splice(t, e = 0, ...i) {
        t > this.length && (t = this.length - 1), t < 0 && (t = this.length + t);
        let r = this.head;
        for (let o = 0; r && o < t; o++) r = r.next;
        let n = [];
        for (let o = 0; r && o < e; o++) n.push(r.value), r = this.removeNode(r);
        r ? r !== this.tail && (r = r.prev) : r = this.tail;
        for (let o of i) r = Zn(this, r, o);
        return n;
      }
      reverse() {
        let t = this.head, e = this.tail;
        for (let i = t; i; i = i.prev) {
          let r = i.prev;
          i.prev = i.next, i.next = r;
        }
        return this.head = e, this.tail = t, this;
      }
    };
    me = class {
      list;
      next;
      prev;
      value;
      constructor(t, e, i, r) {
        this.list = r, this.value = t, e ? (e.next = this, this.prev = e) : this.prev = void 0, i ? (i.prev = this, this.next = i) : this.next = void 0;
      }
    };
    pi = class {
      path;
      absolute;
      entry;
      stat;
      readdir;
      pending = false;
      pendingLink = false;
      ignore = false;
      piped = false;
      constructor(t, e) {
        this.path = t || "./", this.absolute = e;
      }
    };
    nr = Buffer.alloc(1024);
    li = Symbol("onStat");
    ue = Symbol("ended");
    W = Symbol("queue");
    pe = Symbol("pendingLinks");
    Et = Symbol("current");
    Ft = Symbol("process");
    Ee = Symbol("processing");
    ai = Symbol("processJob");
    G = Symbol("jobs");
    ls = Symbol("jobDone");
    ci = Symbol("addFSEntry");
    or = Symbol("addTarEntry");
    ds = Symbol("stat");
    ms = Symbol("readdir");
    fi = Symbol("onreaddir");
    di = Symbol("pipe");
    hr = Symbol("entry");
    cs = Symbol("entryOpt");
    mi = Symbol("writeEntryClass");
    lr = Symbol("write");
    fs = Symbol("ondrain");
    wt = class extends A {
      sync = false;
      opt;
      cwd;
      maxReadSize;
      preservePaths;
      strict;
      noPax;
      prefix;
      linkCache;
      statCache;
      file;
      portable;
      zip;
      readdirCache;
      noDirRecurse;
      follow;
      noMtime;
      mtime;
      filter;
      jobs;
      [mi];
      onWriteEntry;
      [W];
      [pe] = /* @__PURE__ */ new Map();
      [G] = 0;
      [Ee] = false;
      [ue] = false;
      constructor(t = {}) {
        if (super(), this.opt = t, this.file = t.file || "", this.cwd = t.cwd || process.cwd(), this.maxReadSize = t.maxReadSize, this.preservePaths = !!t.preservePaths, this.strict = !!t.strict, this.noPax = !!t.noPax, this.prefix = f(t.prefix || ""), this.linkCache = t.linkCache || /* @__PURE__ */ new Map(), this.statCache = t.statCache || /* @__PURE__ */ new Map(), this.readdirCache = t.readdirCache || /* @__PURE__ */ new Map(), this.onWriteEntry = t.onWriteEntry, this[mi] = de, typeof t.onwarn == "function" && this.on("warn", t.onwarn), this.portable = !!t.portable, t.gzip || t.brotli || t.zstd) {
          if ((t.gzip ? 1 : 0) + (t.brotli ? 1 : 0) + (t.zstd ? 1 : 0) > 1) throw new TypeError("gzip, brotli, zstd are mutually exclusive");
          if (t.gzip && (typeof t.gzip != "object" && (t.gzip = {}), this.portable && (t.gzip.portable = true), this.zip = new ze(t.gzip)), t.brotli && (typeof t.brotli != "object" && (t.brotli = {}), this.zip = new We(t.brotli)), t.zstd && (typeof t.zstd != "object" && (t.zstd = {}), this.zip = new Ye(t.zstd)), !this.zip) throw new Error("impossible");
          let e = this.zip;
          e.on("data", (i) => super.write(i)), e.on("end", () => super.end()), e.on("drain", () => this[fs]()), this.on("resume", () => e.resume());
        } else this.on("drain", this[fs]);
        this.noDirRecurse = !!t.noDirRecurse, this.follow = !!t.follow, this.noMtime = !!t.noMtime, t.mtime && (this.mtime = t.mtime), this.filter = typeof t.filter == "function" ? t.filter : () => true, this[W] = new hi(), this[G] = 0, this.jobs = Number(t.jobs) || 4, this[Ee] = false, this[ue] = false;
      }
      [lr](t) {
        return super.write(t);
      }
      add(t) {
        return this.write(t), this;
      }
      end(t, e, i) {
        return typeof t == "function" && (i = t, t = void 0), typeof e == "function" && (i = e, e = void 0), t && this.add(t), this[ue] = true, this[Ft](), i && i(), this;
      }
      write(t) {
        if (this[ue]) throw new Error("write after end");
        return typeof t == "string" ? this[ci](t) : this[or](t), this.flowing;
      }
      [or](t) {
        let e = f(import_path3.default.resolve(this.cwd, t.path));
        if (!this.filter(t.path, t)) t.resume();
        else {
          let i = new pi(t.path, e);
          i.entry = new oi(t, this[cs](i)), i.entry.on("end", () => this[ls](i)), this[G] += 1, this[W].push(i);
        }
        this[Ft]();
      }
      [ci](t) {
        let e = f(import_path3.default.resolve(this.cwd, t));
        this[W].push(new pi(t, e)), this[Ft]();
      }
      [ds](t) {
        t.pending = true, this[G] += 1;
        let e = this.follow ? "stat" : "lstat";
        import_fs2.default[e](t.absolute, (i, r) => {
          t.pending = false, this[G] -= 1, i ? this.emit("error", i) : this[li](t, r);
        });
      }
      [li](t, e) {
        if (this.statCache.set(t.absolute, e), t.stat = e, !this.filter(t.path, e)) t.ignore = true;
        else if (e.isFile() && e.nlink > 1 && !this.linkCache.get(`${e.dev}:${e.ino}`) && !this.sync) if (t === this[Et]) this[ai](t);
        else {
          let i = `${e.dev}:${e.ino}`, r = this[pe].get(i);
          r ? r.push(t) : this[pe].set(i, [t]), t.pendingLink = true, t.pending = true;
        }
        this[Ft]();
      }
      [ms](t) {
        t.pending = true, this[G] += 1, import_fs2.default.readdir(t.absolute, (e, i) => {
          if (t.pending = false, this[G] -= 1, e) return this.emit("error", e);
          this[fi](t, i);
        });
      }
      [fi](t, e) {
        this.readdirCache.set(t.absolute, e), t.readdir = e, this[Ft]();
      }
      [Ft]() {
        if (!this[Ee]) {
          this[Ee] = true;
          for (let t = this[W].head; t && this[G] < this.jobs; t = t.next) if (this[ai](t.value), t.value.ignore) {
            let e = t.next;
            this[W].removeNode(t), t.next = e;
          }
          this[Ee] = false, this[ue] && this[W].length === 0 && this[G] === 0 && (this.zip ? this.zip.end(nr) : (super.write(nr), super.end()));
        }
      }
      get [Et]() {
        return this[W] && this[W].head && this[W].head.value;
      }
      [ls](t) {
        this[W].shift(), this[G] -= 1;
        let { stat: e } = t;
        if (e && e.isFile() && e.nlink > 1) {
          let i = `${e.dev}:${e.ino}`, r = this[pe].get(i);
          if (r) {
            this[pe].delete(i);
            for (let n of r) n.pending = false, this[ai](n);
          }
        }
        this[Ft]();
      }
      [ai](t) {
        if (t.pending && t.pendingLink && t === this[Et] && (t.pending = false, t.pendingLink = false), !t.pending) {
          if (t.entry) {
            t === this[Et] && !t.piped && this[di](t);
            return;
          }
          if (!t.stat) {
            let e = this.statCache.get(t.absolute);
            e ? this[li](t, e) : this[ds](t);
          }
          if (t.stat && !t.ignore) {
            if (!this.noDirRecurse && t.stat.isDirectory() && !t.readdir) {
              let e = this.readdirCache.get(t.absolute);
              if (e ? this[fi](t, e) : this[ms](t), !t.readdir) return;
            }
            if (t.entry = this[hr](t), !t.entry) {
              t.ignore = true;
              return;
            }
            t === this[Et] && !t.piped && this[di](t);
          }
        }
      }
      [cs](t) {
        return { onwarn: (e, i, r) => this.warn(e, i, r), noPax: this.noPax, cwd: this.cwd, absolute: t.absolute, preservePaths: this.preservePaths, maxReadSize: this.maxReadSize, strict: this.strict, portable: this.portable, linkCache: this.linkCache, statCache: this.statCache, noMtime: this.noMtime, mtime: this.mtime, prefix: this.prefix, onWriteEntry: this.onWriteEntry };
      }
      [hr](t) {
        this[G] += 1;
        try {
          return new this[mi](t.path, this[cs](t)).on("end", () => this[ls](t)).on("error", (i) => this.emit("error", i));
        } catch (e) {
          this.emit("error", e);
        }
      }
      [fs]() {
        this[Et] && this[Et].entry && this[Et].entry.resume();
      }
      [di](t) {
        t.piped = true, t.readdir && t.readdir.forEach((r) => {
          let n = t.path, o = n === "./" ? "" : n.replace(/\/*$/, "/");
          this[ci](o + r);
        });
        let e = t.entry, i = this.zip;
        if (!e) throw new Error("cannot pipe without source");
        i ? e.on("data", (r) => {
          i.write(r) || e.pause();
        }) : e.on("data", (r) => {
          super.write(r) || e.pause();
        });
      }
      pause() {
        return this.zip && this.zip.pause(), super.pause();
      }
      warn(t, e, i = {}) {
        Dt(this, t, e, i);
      }
    };
    kt = class extends wt {
      sync = true;
      constructor(t) {
        super(t), this[mi] = ni;
      }
      pause() {
      }
      resume() {
      }
      [ds](t) {
        let e = this.follow ? "statSync" : "lstatSync";
        this[li](t, import_fs2.default[e](t.absolute));
      }
      [ms](t) {
        this[fi](t, import_fs2.default.readdirSync(t.absolute));
      }
      [di](t) {
        let e = t.entry, i = this.zip;
        if (t.readdir && t.readdir.forEach((r) => {
          let n = t.path, o = n === "./" ? "" : n.replace(/\/*$/, "/");
          this[ci](o + r);
        }), !e) throw new Error("Cannot pipe without source");
        i ? e.on("data", (r) => {
          i.write(r);
        }) : e.on("data", (r) => {
          super[lr](r);
        });
      }
    };
    Vn = (s3, t) => {
      let e = new kt(s3), i = new Wt(s3.file, { mode: s3.mode || 438 });
      e.pipe(i), fr(e, t);
    };
    $n = (s3, t) => {
      let e = new wt(s3), i = new et(s3.file, { mode: s3.mode || 438 });
      e.pipe(i);
      let r = new Promise((n, o) => {
        i.on("error", o), i.on("close", n), e.on("error", o);
      });
      return dr(e, t).catch((n) => e.emit("error", n)), r;
    };
    fr = (s3, t) => {
      t.forEach((e) => {
        e.charAt(0) === "@" ? Ct({ file: import_node_path.default.resolve(s3.cwd, e.slice(1)), sync: true, noResume: true, onReadEntry: (i) => s3.add(i) }) : s3.add(e);
      }), s3.end();
    };
    dr = async (s3, t) => {
      for (let e of t) e.charAt(0) === "@" ? await Ct({ file: import_node_path.default.resolve(String(s3.cwd), e.slice(1)), noResume: true, onReadEntry: (i) => {
        s3.add(i);
      } }) : s3.add(e);
      s3.end();
    };
    Xn = (s3, t) => {
      let e = new kt(s3);
      return fr(e, t), e;
    };
    qn = (s3, t) => {
      let e = new wt(s3);
      return dr(e, t).catch((i) => e.emit("error", i)), e;
    };
    Qn = K(Vn, $n, Xn, qn, (s3, t) => {
      if (!t?.length) throw new TypeError("no paths specified to add to archive");
    });
    Jn = process.env.__FAKE_PLATFORM__ || process.platform;
    Er = Jn === "win32";
    ({ O_CREAT: wr, O_NOFOLLOW: mr, O_TRUNC: Sr, O_WRONLY: yr } = import_fs4.default.constants);
    Rr = Number(process.env.__FAKE_FS_O_FILENAME__) || import_fs4.default.constants.UV_FS_O_FILEMAP || 0;
    jn = Er && !!Rr;
    to = 512 * 1024;
    eo = Rr | Sr | wr | yr;
    ur = !Er && typeof mr == "number" ? mr | Sr | wr | yr : null;
    us = ur !== null ? () => ur : jn ? (s3) => s3 < to ? eo : "w" : () => "w";
    ps = (s3, t, e) => {
      try {
        return import_node_fs4.default.lchownSync(s3, t, e);
      } catch (i) {
        if (i?.code !== "ENOENT") throw i;
      }
    };
    Ei = (s3, t, e, i) => {
      import_node_fs4.default.lchown(s3, t, e, (r) => {
        i(r && r?.code !== "ENOENT" ? r : null);
      });
    };
    io = (s3, t, e, i, r) => {
      if (t.isDirectory()) Es(import_node_path6.default.resolve(s3, t.name), e, i, (n) => {
        if (n) return r(n);
        let o = import_node_path6.default.resolve(s3, t.name);
        Ei(o, e, i, r);
      });
      else {
        let n = import_node_path6.default.resolve(s3, t.name);
        Ei(n, e, i, r);
      }
    };
    Es = (s3, t, e, i) => {
      import_node_fs4.default.readdir(s3, { withFileTypes: true }, (r, n) => {
        if (r) {
          if (r.code === "ENOENT") return i();
          if (r.code !== "ENOTDIR" && r.code !== "ENOTSUP") return i(r);
        }
        if (r || !n.length) return Ei(s3, t, e, i);
        let o = n.length, h = null, a = (l) => {
          if (!h) {
            if (l) return i(h = l);
            if (--o === 0) return Ei(s3, t, e, i);
          }
        };
        for (let l of n) io(s3, l, t, e, a);
      });
    };
    so = (s3, t, e, i) => {
      t.isDirectory() && ws(import_node_path6.default.resolve(s3, t.name), e, i), ps(import_node_path6.default.resolve(s3, t.name), e, i);
    };
    ws = (s3, t, e) => {
      let i;
      try {
        i = import_node_fs4.default.readdirSync(s3, { withFileTypes: true });
      } catch (r) {
        let n = r;
        if (n?.code === "ENOENT") return;
        if (n?.code === "ENOTDIR" || n?.code === "ENOTSUP") return ps(s3, t, e);
        throw n;
      }
      for (let r of i) so(s3, r, t, e);
      return ps(s3, t, e);
    };
    Se = class extends Error {
      path;
      code;
      syscall = "chdir";
      constructor(t, e) {
        super(`${e}: Cannot cd into '${t}'`), this.path = t, this.code = e;
      }
      get name() {
        return "CwdError";
      }
    };
    St = class extends Error {
      path;
      symlink;
      syscall = "symlink";
      code = "TAR_SYMLINK_ERROR";
      constructor(t, e) {
        super("TAR_SYMLINK_ERROR: Cannot extract through symbolic link"), this.symlink = t, this.path = e;
      }
      get name() {
        return "SymlinkError";
      }
    };
    no = (s3, t) => {
      import_node_fs5.default.stat(s3, (e, i) => {
        (e || !i.isDirectory()) && (e = new Se(s3, e?.code || "ENOTDIR")), t(e);
      });
    };
    gr = (s3, t, e) => {
      s3 = f(s3);
      let i = t.umask ?? 18, r = t.mode | 448, n = (r & i) !== 0, o = t.uid, h = t.gid, a = typeof o == "number" && typeof h == "number" && (o !== t.processUid || h !== t.processGid), l = t.preserve, c = t.unlink, d = f(t.cwd), S = (E, x) => {
        E ? e(E) : x && a ? Es(x, o, h, (Le) => S(Le)) : n ? import_node_fs5.default.chmod(s3, r, e) : e();
      };
      if (s3 === d) return no(s3, S);
      if (l) return import_promises.default.mkdir(s3, { mode: r, recursive: true }).then((E) => S(null, E ?? void 0), S);
      let D = f(import_node_path7.default.relative(d, s3)).split("/");
      Ss(d, D, r, c, d, void 0, S);
    };
    Ss = (s3, t, e, i, r, n, o) => {
      if (t.length === 0) return o(null, n);
      let h = t.shift(), a = f(import_node_path7.default.resolve(s3 + "/" + h));
      import_node_fs5.default.mkdir(a, e, br(a, t, e, i, r, n, o));
    };
    br = (s3, t, e, i, r, n, o) => (h) => {
      h ? import_node_fs5.default.lstat(s3, (a, l) => {
        if (a) a.path = a.path && f(a.path), o(a);
        else if (l.isDirectory()) Ss(s3, t, e, i, r, n, o);
        else if (i) import_node_fs5.default.unlink(s3, (c) => {
          if (c) return o(c);
          import_node_fs5.default.mkdir(s3, e, br(s3, t, e, i, r, n, o));
        });
        else {
          if (l.isSymbolicLink()) return o(new St(s3, s3 + "/" + t.join("/")));
          o(h);
        }
      }) : (n = n || s3, Ss(s3, t, e, i, r, n, o));
    };
    oo = (s3) => {
      let t = false, e;
      try {
        t = import_node_fs5.default.statSync(s3).isDirectory();
      } catch (i) {
        e = i?.code;
      } finally {
        if (!t) throw new Se(s3, e ?? "ENOTDIR");
      }
    };
    _r = (s3, t) => {
      s3 = f(s3);
      let e = t.umask ?? 18, i = t.mode | 448, r = (i & e) !== 0, n = t.uid, o = t.gid, h = typeof n == "number" && typeof o == "number" && (n !== t.processUid || o !== t.processGid), a = t.preserve, l = t.unlink, c = f(t.cwd), d = (E) => {
        E && h && ws(E, n, o), r && import_node_fs5.default.chmodSync(s3, i);
      };
      if (s3 === c) return oo(c), d();
      if (a) return d(import_node_fs5.default.mkdirSync(s3, { mode: i, recursive: true }) ?? void 0);
      let T = f(import_node_path7.default.relative(c, s3)).split("/"), D;
      for (let E = T.shift(), x = c; E && (x += "/" + E); E = T.shift()) {
        x = f(import_node_path7.default.resolve(x));
        try {
          import_node_fs5.default.mkdirSync(x, i), D = D || x;
        } catch {
          let Le = import_node_fs5.default.lstatSync(x);
          if (Le.isDirectory()) continue;
          if (l) {
            import_node_fs5.default.unlinkSync(x), import_node_fs5.default.mkdirSync(x, i), D = D || x;
            continue;
          } else if (Le.isSymbolicLink()) return new St(x, x + "/" + T.join("/"));
        }
      }
      return d(D);
    };
    ys = /* @__PURE__ */ Object.create(null);
    Or = 1e4;
    Vt = /* @__PURE__ */ new Set();
    Tr = (s3) => {
      Vt.has(s3) ? Vt.delete(s3) : ys[s3] = s3.normalize("NFD").toLocaleLowerCase("en").toLocaleUpperCase("en"), Vt.add(s3);
      let t = ys[s3], e = Vt.size - Or;
      if (e > Or / 10) {
        for (let i of Vt) if (Vt.delete(i), delete ys[i], --e <= 0) break;
      }
      return t;
    };
    ho = process.env.TESTING_TAR_FAKE_PLATFORM || process.platform;
    ao = ho === "win32";
    lo = (s3) => s3.split("/").slice(0, -1).reduce((e, i) => {
      let r = e.at(-1);
      return r !== void 0 && (i = (0, import_node_path8.join)(r, i)), e.push(i || "/"), e;
    }, []);
    yi = class {
      #t = /* @__PURE__ */ new Map();
      #i = /* @__PURE__ */ new Map();
      #s = /* @__PURE__ */ new Set();
      reserve(t, e) {
        t = ao ? ["win32 parallelization disabled"] : t.map((r) => ut((0, import_node_path8.join)(Tr(r))));
        let i = new Set(t.map((r) => lo(r)).reduce((r, n) => r.concat(n)));
        this.#i.set(e, { dirs: i, paths: t });
        for (let r of t) {
          let n = this.#t.get(r);
          n ? n.push(e) : this.#t.set(r, [e]);
        }
        for (let r of i) {
          let n = this.#t.get(r);
          if (!n) this.#t.set(r, [/* @__PURE__ */ new Set([e])]);
          else {
            let o = n.at(-1);
            o instanceof Set ? o.add(e) : n.push(/* @__PURE__ */ new Set([e]));
          }
        }
        return this.#r(e);
      }
      #n(t) {
        let e = this.#i.get(t);
        if (!e) throw new Error("function does not have any path reservations");
        return { paths: e.paths.map((i) => this.#t.get(i)), dirs: [...e.dirs].map((i) => this.#t.get(i)) };
      }
      check(t) {
        let { paths: e, dirs: i } = this.#n(t);
        return e.every((r) => r && r[0] === t) && i.every((r) => r && r[0] instanceof Set && r[0].has(t));
      }
      #r(t) {
        return this.#s.has(t) || !this.check(t) ? false : (this.#s.add(t), t(() => this.#e(t)), true);
      }
      #e(t) {
        if (!this.#s.has(t)) return false;
        let e = this.#i.get(t);
        if (!e) throw new Error("invalid reservation");
        let { paths: i, dirs: r } = e, n = /* @__PURE__ */ new Set();
        for (let o of i) {
          let h = this.#t.get(o);
          if (!h || h?.[0] !== t) continue;
          let a = h[1];
          if (!a) {
            this.#t.delete(o);
            continue;
          }
          if (h.shift(), typeof a == "function") n.add(a);
          else for (let l of a) n.add(l);
        }
        for (let o of r) {
          let h = this.#t.get(o), a = h?.[0];
          if (!(!h || !(a instanceof Set))) if (a.size === 1 && h.length === 1) {
            this.#t.delete(o);
            continue;
          } else if (a.size === 1) {
            h.shift();
            let l = h[0];
            typeof l == "function" && n.add(l);
          } else a.delete(t);
        }
        return this.#s.delete(t), n.forEach((o) => this.#r(o)), true;
      }
    };
    Lr = () => process.umask();
    Dr = Symbol("onEntry");
    _s = Symbol("checkFs");
    Nr = Symbol("checkFs2");
    Os = Symbol("isReusable");
    P = Symbol("makeFs");
    Ts = Symbol("file");
    xs = Symbol("directory");
    gi = Symbol("link");
    Ar = Symbol("symlink");
    Ir = Symbol("hardlink");
    Re = Symbol("ensureNoSymlink");
    Cr = Symbol("unsupported");
    Fr = Symbol("checkPath");
    Rs = Symbol("stripAbsolutePath");
    yt = Symbol("mkdir");
    O = Symbol("onError");
    Ri = Symbol("pending");
    kr = Symbol("pend");
    $t = Symbol("unpend");
    gs = Symbol("ended");
    bs = Symbol("maybeClose");
    Ls = Symbol("skip");
    ge = Symbol("doChown");
    be = Symbol("uid");
    _e = Symbol("gid");
    Oe = Symbol("checkedCwd");
    fo = process.env.TESTING_TAR_FAKE_PLATFORM || process.platform;
    Te = fo === "win32";
    mo = 1024;
    uo = (s3, t) => {
      if (!Te) return import_node_fs3.default.unlink(s3, t);
      let e = s3 + ".DELETE." + (0, import_node_crypto.randomBytes)(16).toString("hex");
      import_node_fs3.default.rename(s3, e, (i) => {
        if (i) return t(i);
        import_node_fs3.default.unlink(e, t);
      });
    };
    po = (s3) => {
      if (!Te) return import_node_fs3.default.unlinkSync(s3);
      let t = s3 + ".DELETE." + (0, import_node_crypto.randomBytes)(16).toString("hex");
      import_node_fs3.default.renameSync(s3, t), import_node_fs3.default.unlinkSync(t);
    };
    vr = (s3, t, e) => s3 !== void 0 && s3 === s3 >>> 0 ? s3 : t !== void 0 && t === t >>> 0 ? t : e;
    Xt = class extends rt {
      [gs] = false;
      [Oe] = false;
      [Ri] = 0;
      reservations = new yi();
      transform;
      writable = true;
      readable = false;
      uid;
      gid;
      setOwner;
      preserveOwner;
      processGid;
      processUid;
      maxDepth;
      forceChown;
      win32;
      newer;
      keep;
      noMtime;
      preservePaths;
      unlink;
      cwd;
      strip;
      processUmask;
      umask;
      dmode;
      fmode;
      chmod;
      constructor(t = {}) {
        if (t.ondone = () => {
          this[gs] = true, this[bs]();
        }, super(t), this.transform = t.transform, this.chmod = !!t.chmod, typeof t.uid == "number" || typeof t.gid == "number") {
          if (typeof t.uid != "number" || typeof t.gid != "number") throw new TypeError("cannot set owner without number uid and gid");
          if (t.preserveOwner) throw new TypeError("cannot preserve owner in archive and also set owner explicitly");
          this.uid = t.uid, this.gid = t.gid, this.setOwner = true;
        } else this.uid = void 0, this.gid = void 0, this.setOwner = false;
        this.preserveOwner = t.preserveOwner === void 0 && typeof t.uid != "number" ? process.getuid?.() === 0 : !!t.preserveOwner, this.processUid = (this.preserveOwner || this.setOwner) && process.getuid ? process.getuid() : void 0, this.processGid = (this.preserveOwner || this.setOwner) && process.getgid ? process.getgid() : void 0, this.maxDepth = typeof t.maxDepth == "number" ? t.maxDepth : mo, this.forceChown = t.forceChown === true, this.win32 = !!t.win32 || Te, this.newer = !!t.newer, this.keep = !!t.keep, this.noMtime = !!t.noMtime, this.preservePaths = !!t.preservePaths, this.unlink = !!t.unlink, this.cwd = f(import_node_path5.default.resolve(t.cwd || process.cwd())), this.strip = Number(t.strip) || 0, this.processUmask = this.chmod ? typeof t.processUmask == "number" ? t.processUmask : Lr() : 0, this.umask = typeof t.umask == "number" ? t.umask : this.processUmask, this.dmode = t.dmode || 511 & ~this.umask, this.fmode = t.fmode || 438 & ~this.umask, this.on("entry", (e) => this[Dr](e));
      }
      warn(t, e, i = {}) {
        return (t === "TAR_BAD_ARCHIVE" || t === "TAR_ABORT") && (i.recoverable = false), super.warn(t, e, i);
      }
      [bs]() {
        this[gs] && this[Ri] === 0 && (this.emit("prefinish"), this.emit("finish"), this.emit("end"));
      }
      [Rs](t, e) {
        let i = t[e], { type: r } = t;
        if (!i || this.preservePaths) return true;
        let [n, o] = ce(i), h = o.replaceAll(/\\/g, "/").split("/");
        if (h.includes("..") || Te && /^[a-z]:\.\.$/i.test(h[0] ?? "")) {
          if (e === "path" || r === "Link") return this.warn("TAR_ENTRY_ERROR", `${e} contains '..'`, { entry: t, [e]: i }), false;
          let a = import_node_path5.default.posix.dirname(t.path), l = import_node_path5.default.posix.normalize(import_node_path5.default.posix.join(a, h.join("/")));
          if (l.startsWith("../") || l === "..") return this.warn("TAR_ENTRY_ERROR", `${e} escapes extraction directory`, { entry: t, [e]: i }), false;
        }
        return n && (t[e] = String(o), this.warn("TAR_ENTRY_INFO", `stripping ${n} from absolute ${e}`, { entry: t, [e]: i })), true;
      }
      [Fr](t) {
        let e = f(t.path), i = e.split("/");
        if (this.strip) {
          if (i.length < this.strip) return false;
          if (t.type === "Link") {
            let r = f(String(t.linkpath)).split("/");
            if (r.length >= this.strip) t.linkpath = r.slice(this.strip).join("/");
            else return false;
          }
          i.splice(0, this.strip), t.path = i.join("/");
        }
        if (isFinite(this.maxDepth) && i.length > this.maxDepth) return this.warn("TAR_ENTRY_ERROR", "path excessively deep", { entry: t, path: e, depth: i.length, maxDepth: this.maxDepth }), false;
        if (!this[Rs](t, "path") || !this[Rs](t, "linkpath")) return false;
        if (t.absolute = import_node_path5.default.isAbsolute(t.path) ? f(import_node_path5.default.resolve(t.path)) : f(import_node_path5.default.resolve(this.cwd, t.path)), !this.preservePaths && typeof t.absolute == "string" && t.absolute.indexOf(this.cwd + "/") !== 0 && t.absolute !== this.cwd) return this.warn("TAR_ENTRY_ERROR", "path escaped extraction target", { entry: t, path: f(t.path), resolvedPath: t.absolute, cwd: this.cwd }), false;
        if (t.absolute === this.cwd && t.type !== "Directory" && t.type !== "GNUDumpDir") return false;
        if (this.win32) {
          let { root: r } = import_node_path5.default.win32.parse(String(t.absolute));
          t.absolute = r + ts(String(t.absolute).slice(r.length));
          let { root: n } = import_node_path5.default.win32.parse(t.path);
          t.path = n + ts(t.path.slice(n.length));
        }
        return true;
      }
      [Dr](t) {
        if (!this[Fr](t)) return t.resume();
        switch (import_node_assert.default.equal(typeof t.absolute, "string"), t.type) {
          case "Directory":
          case "GNUDumpDir":
            t.mode && (t.mode = t.mode | 448);
          case "File":
          case "OldFile":
          case "ContiguousFile":
          case "Link":
          case "SymbolicLink":
            return this[_s](t);
          default:
            return this[Cr](t);
        }
      }
      [O](t, e) {
        t.name === "CwdError" ? this.emit("error", t) : (this.warn("TAR_ENTRY_ERROR", t, { entry: e }), this[$t](), e.resume());
      }
      [yt](t, e, i) {
        gr(f(t), { uid: this.uid, gid: this.gid, processUid: this.processUid, processGid: this.processGid, umask: this.processUmask, preserve: this.preservePaths, unlink: this.unlink, cwd: this.cwd, mode: e }, i);
      }
      [ge](t) {
        return this.forceChown || this.preserveOwner && (typeof t.uid == "number" && t.uid !== this.processUid || typeof t.gid == "number" && t.gid !== this.processGid) || typeof this.uid == "number" && this.uid !== this.processUid || typeof this.gid == "number" && this.gid !== this.processGid;
      }
      [be](t) {
        return vr(this.uid, t.uid, this.processUid);
      }
      [_e](t) {
        return vr(this.gid, t.gid, this.processGid);
      }
      [Ts](t, e) {
        let i = typeof t.mode == "number" ? t.mode & 4095 : this.fmode, r = new et(String(t.absolute), { flags: us(t.size), mode: i, autoClose: false });
        r.on("error", (a) => {
          r.fd && import_node_fs3.default.close(r.fd, () => {
          }), r.write = () => true, this[O](a, t), e();
        });
        let n = 1, o = (a) => {
          if (a) {
            r.fd && import_node_fs3.default.close(r.fd, () => {
            }), this[O](a, t), e();
            return;
          }
          --n === 0 && r.fd !== void 0 && import_node_fs3.default.close(r.fd, (l) => {
            l ? this[O](l, t) : this[$t](), e();
          });
        };
        r.on("finish", () => {
          let a = String(t.absolute), l = r.fd;
          if (typeof l == "number" && t.mtime && !this.noMtime) {
            n++;
            let c = t.atime || /* @__PURE__ */ new Date(), d = t.mtime;
            import_node_fs3.default.futimes(l, c, d, (S) => S ? import_node_fs3.default.utimes(a, c, d, (T) => o(T && S)) : o());
          }
          if (typeof l == "number" && this[ge](t)) {
            n++;
            let c = this[be](t), d = this[_e](t);
            typeof c == "number" && typeof d == "number" && import_node_fs3.default.fchown(l, c, d, (S) => S ? import_node_fs3.default.chown(a, c, d, (T) => o(T && S)) : o());
          }
          o();
        });
        let h = this.transform && this.transform(t) || t;
        h !== t && (h.on("error", (a) => {
          this[O](a, t), e();
        }), t.pipe(h)), h.pipe(r);
      }
      [xs](t, e) {
        let i = typeof t.mode == "number" ? t.mode & 4095 : this.dmode;
        this[yt](String(t.absolute), i, (r) => {
          if (r) {
            this[O](r, t), e();
            return;
          }
          let n = 1, o = () => {
            --n === 0 && (e(), this[$t](), t.resume());
          };
          t.mtime && !this.noMtime && (n++, import_node_fs3.default.utimes(String(t.absolute), t.atime || /* @__PURE__ */ new Date(), t.mtime, o)), this[ge](t) && (n++, import_node_fs3.default.chown(String(t.absolute), Number(this[be](t)), Number(this[_e](t)), o)), o();
        });
      }
      [Cr](t) {
        t.unsupported = true, this.warn("TAR_ENTRY_UNSUPPORTED", `unsupported entry type: ${t.type}`, { entry: t }), t.resume();
      }
      [Ar](t, e) {
        let i = f(import_node_path5.default.relative(this.cwd, import_node_path5.default.resolve(import_node_path5.default.dirname(String(t.absolute)), String(t.linkpath)))).split("/");
        this[Re](t, this.cwd, i, () => this[gi](t, String(t.linkpath), "symlink", e), (r) => {
          this[O](r, t), e();
        });
      }
      [Ir](t, e) {
        let i = f(import_node_path5.default.resolve(this.cwd, String(t.linkpath))), r = f(String(t.linkpath)).split("/");
        this[Re](t, this.cwd, r, () => this[gi](t, i, "link", e), (n) => {
          this[O](n, t), e();
        });
      }
      [Re](t, e, i, r, n) {
        let o = i.shift();
        if (this.preservePaths || o === void 0) return r();
        let h = import_node_path5.default.resolve(e, o);
        import_node_fs3.default.lstat(h, (a, l) => {
          if (a) return r();
          if (l?.isSymbolicLink()) return n(new St(h, import_node_path5.default.resolve(h, i.join("/"))));
          this[Re](t, h, i, r, n);
        });
      }
      [kr]() {
        this[Ri]++;
      }
      [$t]() {
        this[Ri]--, this[bs]();
      }
      [Ls](t) {
        this[$t](), t.resume();
      }
      [Os](t, e) {
        return t.type === "File" && !this.unlink && e.isFile() && e.nlink <= 1 && !Te;
      }
      [_s](t) {
        this[kr]();
        let e = [t.path];
        t.linkpath && e.push(t.linkpath), this.reservations.reserve(e, (i) => this[Nr](t, i));
      }
      [Nr](t, e) {
        let i = (h) => {
          e(h);
        }, r = () => {
          this[yt](this.cwd, this.dmode, (h) => {
            if (h) {
              this[O](h, t), i();
              return;
            }
            this[Oe] = true, n();
          });
        }, n = () => {
          if (t.absolute !== this.cwd) {
            let h = f(import_node_path5.default.dirname(String(t.absolute)));
            if (h !== this.cwd) return this[yt](h, this.dmode, (a) => {
              if (a) {
                this[O](a, t), i();
                return;
              }
              o();
            });
          }
          o();
        }, o = () => {
          import_node_fs3.default.lstat(String(t.absolute), (h, a) => {
            if (a && (this.keep || this.newer && a.mtime > (t.mtime ?? a.mtime))) {
              this[Ls](t), i();
              return;
            }
            if (h || this[Os](t, a)) return this[P](null, t, i);
            if (a.isDirectory()) {
              if (t.type === "Directory") {
                let l = this.chmod && t.mode && (a.mode & 4095) !== t.mode, c = (d) => this[P](d ?? null, t, i);
                return l ? import_node_fs3.default.chmod(String(t.absolute), Number(t.mode), c) : c();
              }
              if (t.absolute !== this.cwd) return import_node_fs3.default.rmdir(String(t.absolute), (l) => this[P](l ?? null, t, i));
            }
            if (t.absolute === this.cwd) return this[P](null, t, i);
            uo(String(t.absolute), (l) => this[P](l ?? null, t, i));
          });
        };
        this[Oe] ? n() : r();
      }
      [P](t, e, i) {
        if (t) {
          this[O](t, e), i();
          return;
        }
        switch (e.type) {
          case "File":
          case "OldFile":
          case "ContiguousFile":
            return this[Ts](e, i);
          case "Link":
            return this[Ir](e, i);
          case "SymbolicLink":
            return this[Ar](e, i);
          case "Directory":
          case "GNUDumpDir":
            return this[xs](e, i);
        }
      }
      [gi](t, e, i, r) {
        import_node_fs3.default[i](e, String(t.absolute), (n) => {
          n ? this[O](n, t) : (this[$t](), t.resume()), r();
        });
      }
    };
    ye = (s3) => {
      try {
        return [null, s3()];
      } catch (t) {
        return [t, null];
      }
    };
    xe = class extends Xt {
      sync = true;
      [P](t, e) {
        return super[P](t, e, () => {
        });
      }
      [_s](t) {
        if (!this[Oe]) {
          let n = this[yt](this.cwd, this.dmode);
          if (n) return this[O](n, t);
          this[Oe] = true;
        }
        if (t.absolute !== this.cwd) {
          let n = f(import_node_path5.default.dirname(String(t.absolute)));
          if (n !== this.cwd) {
            let o = this[yt](n, this.dmode);
            if (o) return this[O](o, t);
          }
        }
        let [e, i] = ye(() => import_node_fs3.default.lstatSync(String(t.absolute)));
        if (i && (this.keep || this.newer && i.mtime > (t.mtime ?? i.mtime))) return this[Ls](t);
        if (e || this[Os](t, i)) return this[P](null, t);
        if (i.isDirectory()) {
          if (t.type === "Directory") {
            let o = this.chmod && t.mode && (i.mode & 4095) !== t.mode, [h] = o ? ye(() => {
              import_node_fs3.default.chmodSync(String(t.absolute), Number(t.mode));
            }) : [];
            return this[P](h, t);
          }
          let [n] = ye(() => import_node_fs3.default.rmdirSync(String(t.absolute)));
          this[P](n, t);
        }
        let [r] = t.absolute === this.cwd ? [] : ye(() => po(String(t.absolute)));
        this[P](r, t);
      }
      [Ts](t, e) {
        let i = typeof t.mode == "number" ? t.mode & 4095 : this.fmode, r = (h) => {
          let a;
          try {
            import_node_fs3.default.closeSync(n);
          } catch (l) {
            a = l;
          }
          (h || a) && this[O](h || a, t), e();
        }, n;
        try {
          n = import_node_fs3.default.openSync(String(t.absolute), us(t.size), i);
        } catch (h) {
          return r(h);
        }
        let o = this.transform && this.transform(t) || t;
        o !== t && (o.on("error", (h) => this[O](h, t)), t.pipe(o)), o.on("data", (h) => {
          try {
            import_node_fs3.default.writeSync(n, h, 0, h.length);
          } catch (a) {
            r(a);
          }
        }), o.on("end", () => {
          let h = null;
          if (t.mtime && !this.noMtime) {
            let a = t.atime || /* @__PURE__ */ new Date(), l = t.mtime;
            try {
              import_node_fs3.default.futimesSync(n, a, l);
            } catch (c) {
              try {
                import_node_fs3.default.utimesSync(String(t.absolute), a, l);
              } catch {
                h = c;
              }
            }
          }
          if (this[ge](t)) {
            let a = this[be](t), l = this[_e](t);
            try {
              import_node_fs3.default.fchownSync(n, Number(a), Number(l));
            } catch (c) {
              try {
                import_node_fs3.default.chownSync(String(t.absolute), Number(a), Number(l));
              } catch {
                h = h || c;
              }
            }
          }
          r(h);
        });
      }
      [xs](t, e) {
        let i = typeof t.mode == "number" ? t.mode & 4095 : this.dmode, r = this[yt](String(t.absolute), i);
        if (r) {
          this[O](r, t), e();
          return;
        }
        if (t.mtime && !this.noMtime) try {
          import_node_fs3.default.utimesSync(String(t.absolute), t.atime || /* @__PURE__ */ new Date(), t.mtime);
        } catch {
        }
        if (this[ge](t)) try {
          import_node_fs3.default.chownSync(String(t.absolute), Number(this[be](t)), Number(this[_e](t)));
        } catch {
        }
        e(), t.resume();
      }
      [yt](t, e) {
        try {
          return _r(f(t), { uid: this.uid, gid: this.gid, processUid: this.processUid, processGid: this.processGid, umask: this.processUmask, preserve: this.preservePaths, unlink: this.unlink, cwd: this.cwd, mode: e });
        } catch (i) {
          return i;
        }
      }
      [Re](t, e, i, r, n) {
        if (this.preservePaths || i.length === 0) return r();
        let o = e;
        for (let h of i) {
          o = import_node_path5.default.resolve(o, h);
          let [a, l] = ye(() => import_node_fs3.default.lstatSync(o));
          if (a) return r();
          if (l.isSymbolicLink()) return n(new St(o, import_node_path5.default.resolve(e, i.join("/"))));
        }
        r();
      }
      [gi](t, e, i, r) {
        let n = `${i}Sync`;
        try {
          import_node_fs3.default[n](e, String(t.absolute)), r(), t.resume();
        } catch (o) {
          return this[O](o, t);
        }
      }
    };
    Eo = (s3) => {
      let t = new xe(s3), e = s3.file, i = import_node_fs2.default.statSync(e), r = s3.maxReadSize || 16 * 1024 * 1024;
      new Be(e, { readSize: r, size: i.size }).pipe(t);
    };
    wo = (s3, t) => {
      let e = new Xt(s3), i = s3.maxReadSize || 16 * 1024 * 1024, r = s3.file;
      return new Promise((o, h) => {
        e.on("error", h), e.on("close", o), import_node_fs2.default.stat(r, (a, l) => {
          if (a) h(a);
          else {
            let c = new _t(r, { readSize: i, size: l.size });
            c.on("error", h), c.pipe(e);
          }
        });
      });
    };
    So = K(Eo, wo, (s3) => new xe(s3), (s3) => new Xt(s3), (s3, t) => {
      t?.length && Qi(s3, t);
    });
    yo = (s3, t) => {
      let e = new kt(s3), i = true, r, n;
      try {
        try {
          r = import_node_fs6.default.openSync(s3.file, "r+");
        } catch (a) {
          if (a?.code === "ENOENT") r = import_node_fs6.default.openSync(s3.file, "w+");
          else throw a;
        }
        let o = import_node_fs6.default.fstatSync(r), h = Buffer.alloc(512);
        t: for (n = 0; n < o.size; n += 512) {
          for (let c = 0, d = 0; c < 512; c += d) {
            if (d = import_node_fs6.default.readSync(r, h, c, h.length - c, n + c), n === 0 && h[0] === 31 && h[1] === 139) throw new Error("cannot append to compressed archives");
            if (!d) break t;
          }
          let a = new F(h);
          if (!a.cksumValid) break;
          let l = 512 * Math.ceil((a.size || 0) / 512);
          if (n + l + 512 > o.size) break;
          n += l, s3.mtimeCache && a.mtime && s3.mtimeCache.set(String(a.path), a.mtime);
        }
        i = false, Ro(s3, e, n, r, t);
      } finally {
        if (i) try {
          import_node_fs6.default.closeSync(r);
        } catch {
        }
      }
    };
    Ro = (s3, t, e, i, r) => {
      let n = new Wt(s3.file, { fd: i, start: e });
      t.pipe(n), bo(t, r);
    };
    go = (s3, t) => {
      t = Array.from(t);
      let e = new wt(s3), i = (n, o, h) => {
        let a = (T, D) => {
          T ? import_node_fs6.default.close(n, (E) => h(T)) : h(null, D);
        }, l = 0;
        if (o === 0) return a(null, 0);
        let c = 0, d = Buffer.alloc(512), S = (T, D) => {
          if (T || D === void 0) return a(T);
          if (c += D, c < 512 && D) return import_node_fs6.default.read(n, d, c, d.length - c, l + c, S);
          if (l === 0 && d[0] === 31 && d[1] === 139) return a(new Error("cannot append to compressed archives"));
          if (c < 512) return a(null, l);
          let E = new F(d);
          if (!E.cksumValid) return a(null, l);
          let x = 512 * Math.ceil((E.size ?? 0) / 512);
          if (l + x + 512 > o || (l += x + 512, l >= o)) return a(null, l);
          s3.mtimeCache && E.mtime && s3.mtimeCache.set(String(E.path), E.mtime), c = 0, import_node_fs6.default.read(n, d, 0, 512, l, S);
        };
        import_node_fs6.default.read(n, d, 0, 512, l, S);
      };
      return new Promise((n, o) => {
        e.on("error", o);
        let h = "r+", a = (l, c) => {
          if (l && l.code === "ENOENT" && h === "r+") return h = "w+", import_node_fs6.default.open(s3.file, h, a);
          if (l || !c) return o(l);
          import_node_fs6.default.fstat(c, (d, S) => {
            if (d) return import_node_fs6.default.close(c, () => o(d));
            i(c, S.size, (T, D) => {
              if (T) return o(T);
              let E = new et(s3.file, { fd: c, start: D });
              e.pipe(E), E.on("error", o), E.on("close", n), _o(e, t);
            });
          });
        };
        import_node_fs6.default.open(s3.file, h, a);
      });
    };
    bo = (s3, t) => {
      t.forEach((e) => {
        e.charAt(0) === "@" ? Ct({ file: import_node_path9.default.resolve(s3.cwd, e.slice(1)), sync: true, noResume: true, onReadEntry: (i) => s3.add(i) }) : s3.add(e);
      }), s3.end();
    };
    _o = async (s3, t) => {
      for (let e of t) e.charAt(0) === "@" ? await Ct({ file: import_node_path9.default.resolve(String(s3.cwd), e.slice(1)), noResume: true, onReadEntry: (i) => s3.add(i) }) : s3.add(e);
      s3.end();
    };
    vt = K(yo, go, () => {
      throw new TypeError("file is required");
    }, () => {
      throw new TypeError("file is required");
    }, (s3, t) => {
      if (!Bs(s3)) throw new TypeError("file is required");
      if (s3.gzip || s3.brotli || s3.zstd || s3.file.endsWith(".br") || s3.file.endsWith(".tbr")) throw new TypeError("cannot append to compressed archives");
      if (!t?.length) throw new TypeError("no paths specified to add/replace");
    });
    Oo = K(vt.syncFile, vt.asyncFile, vt.syncNoFile, vt.asyncNoFile, (s3, t = []) => {
      vt.validate?.(s3, t), To(s3);
    });
    To = (s3) => {
      let t = s3.filter;
      s3.mtimeCache || (s3.mtimeCache = /* @__PURE__ */ new Map()), s3.filter = t ? (e, i) => t(e, i) && !((s3.mtimeCache?.get(e) ?? i.mtime ?? 0) > (i.mtime ?? 0)) : (e, i) => !((s3.mtimeCache?.get(e) ?? i.mtime ?? 0) > (i.mtime ?? 0));
    };
  }
});

// src/main/plugins/artifact/signCli.main.ts
var import_node_crypto6 = require("node:crypto");
var import_node_fs10 = require("node:fs");

// src/main/plugins/artifact/signCli.ts
var import_node_crypto5 = require("node:crypto");
var import_node_fs9 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path12 = require("node:path");

// packages/plugin-api/src/validation.ts
var import_ajv = __toESM(require_ajv(), 1);
var import_semver = __toESM(require_semver2(), 1);

// packages/plugin-api/src/version.ts
var API_VERSION = "0.2.0";

// packages/plugin-api/src/validation.ts
var ajv = new import_ajv.default({ allErrors: true, removeAdditional: false });
var ENTRY_PATH_GUARD = "^(?![/\\\\])(?![A-Za-z][A-Za-z0-9+.-]*:)(?!\\.\\.(?:[/\\\\]|$))";
var ENTRY_JS_PATTERN = ENTRY_PATH_GUARD + ".+\\.js$";
var ENTRY_CSS_PATTERN = ENTRY_PATH_GUARD + ".+\\.css$";
var CAPABILITY_VALUES = [
  "vault.read",
  "vault.write",
  "secrets",
  "llm.generate",
  "http.fetch",
  "workflow.action",
  "device.usb",
  "pdf.render",
  "pdf.optimize",
  "dialog",
  "resource"
];
var CATEGORY_VALUES = [
  "ai",
  "communication",
  "business",
  "learning",
  "research",
  "devices",
  "documents"
];
var PLUGIN_MANIFEST_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  definitions: {
    workflowPort: {
      type: "object",
      required: ["id", "label", "kind"],
      properties: {
        id: { type: "string", minLength: 1 },
        label: { type: "string" },
        kind: { type: "string", minLength: 1 },
        required: { type: "boolean" },
        multiple: { type: "boolean" }
      },
      additionalProperties: false
    },
    // UI-Slot-Beitrag: strikt nur die zwei Slot-Kategorien; optional die speisende Action.
    // KEIN `view`-Feld (fromAction liefert die WidgetView, gegen WIDGET_VIEW_SCHEMA validiert).
    slotDecl: {
      type: "object",
      required: ["slot", "fromAction"],
      properties: {
        slot: { enum: ["dashboard.widget", "sidebar.panel"] },
        fromAction: { type: "string", minLength: 1 }
      },
      additionalProperties: false
    }
  },
  required: [
    "manifestVersion",
    "id",
    "version",
    "label",
    "description",
    "category",
    "capabilities",
    "apiVersion",
    "minAppVersion",
    "author",
    "entrypoints"
  ],
  // STRIKT: unbekannte Top-Level-Felder abweisen — fängt Tippfehler (z.B. `capabilites`).
  additionalProperties: false,
  properties: {
    // v1 wird nicht mehr akzeptiert: hart const:2 + global required. v3 bekommt ein eigenes Schema.
    manifestVersion: { const: 2 },
    id: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
    version: { type: "string", minLength: 1 },
    label: { type: "string", minLength: 1 },
    description: { type: "string" },
    category: { type: "string", enum: CATEGORY_VALUES },
    // SemVer-Form prüft die Semantik (validRange/valid); hier nur „nicht leer".
    apiVersion: { type: "string", minLength: 1 },
    minAppVersion: { type: "string", minLength: 1 },
    author: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        // url wird zusätzlich semantisch auf http(s) geprüft (isHttpUrl) — später klickbar im Store.
        url: { type: "string" },
        email: { type: "string", format: "email" }
      },
      additionalProperties: false
    },
    entrypoints: {
      type: "object",
      // Mindestens ein Code-Einstieg (main ODER renderer); styles ist optional.
      anyOf: [{ required: ["main"] }, { required: ["renderer"] }],
      properties: {
        main: { type: "string", minLength: 1, pattern: ENTRY_JS_PATTERN },
        renderer: { type: "string", minLength: 1, pattern: ENTRY_JS_PATTERN },
        styles: { type: "string", minLength: 1, pattern: ENTRY_CSS_PATTERN }
      },
      additionalProperties: false
    },
    repo: { type: "string" },
    icon: {
      type: "object",
      properties: { text: { type: "string" }, color: { type: "string" } },
      additionalProperties: false
    },
    capabilities: {
      type: "array",
      items: { type: "string", enum: CAPABILITY_VALUES },
      uniqueItems: true
    },
    http: {
      type: "object",
      required: ["allowedHosts"],
      properties: { allowedHosts: { type: "array", items: { type: "string" } } },
      additionalProperties: false
    },
    credentials: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "label"],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          secret: { type: "boolean" },
          required: { type: "boolean" }
        },
        additionalProperties: false
      }
    },
    module: {
      type: "object",
      required: ["enabledPath"],
      properties: {
        id: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
        enabledPath: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9]*(\\.[a-zA-Z][a-zA-Z0-9-]*)+$" },
        linkedEnabledPaths: {
          type: "array",
          items: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9]*(\\.[a-zA-Z][a-zA-Z0-9-]*)+$" },
          uniqueItems: true
        },
        legacyEnabledPath: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9]*(\\.[a-zA-Z][a-zA-Z0-9-]*)+$" }
      },
      additionalProperties: false
    },
    settingsSchema: { type: "object" },
    actions: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "requiredCapabilities"],
        properties: {
          id: { type: "string", minLength: 1 },
          label: { type: "string" },
          requiredCapabilities: {
            type: "array",
            items: { type: "string", enum: CAPABILITY_VALUES },
            uniqueItems: true
          },
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          isTrigger: { type: "boolean" },
          isWrite: { type: "boolean" },
          widgetProvider: { type: "boolean" },
          privacy: { type: "object" },
          hardLockModule: { type: "string" }
        },
        // STRIKT: unbekannte Action-Felder abweisen — fängt z.B. `outputShema` statt `outputSchema`.
        additionalProperties: false
      }
    },
    // Workflow-Canvas-Bausteine (Palette + Runner-Dispatch). Reine Metadaten — KEIN run().
    // Der Kern baut Palette und Runner generisch daraus auf; statische antares/edoobox-Einträge
    // gibt es nicht mehr (Deletion-Test).
    workflowActions: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "moduleId", "label", "inputs", "outputs"],
        properties: {
          id: { type: "string", minLength: 1 },
          moduleId: { type: "string", minLength: 1 },
          moduleLabel: { type: "string" },
          featureGate: { type: ["string", "null"] },
          label: { type: "string", minLength: 1 },
          description: { type: "string" },
          inputs: { type: "array", items: { $ref: "#/definitions/workflowPort" } },
          outputs: { type: "array", items: { $ref: "#/definitions/workflowPort" } },
          isTrigger: { type: "boolean" },
          isWrite: { type: "boolean" },
          isTerminal: { type: "boolean" },
          hardLockModule: { type: "string" },
          privacy: { type: "object" },
          config: { type: "array", items: { type: "object" } },
          simLine: { type: "string" }
        },
        additionalProperties: false
      }
    },
    ui: {
      type: "object",
      properties: {
        settingsTab: { type: "boolean" },
        // SlotDecl strikt: nur die zwei Slot-Kategorien; KEIN `view`-Template (fromAction liefert die WidgetView).
        dashboardWidget: { $ref: "#/definitions/slotDecl" },
        sidebarPanel: { $ref: "#/definitions/slotDecl" }
      },
      additionalProperties: false
    },
    privacy: {
      type: "object",
      properties: {
        containsPersonalData: { type: "boolean" },
        localOnly: { type: "boolean" }
      },
      additionalProperties: false
    }
  }
};
function formatErrors(fn) {
  return (fn.errors ?? []).map((e) => {
    const where = e.dataPath || e.schemaPath || "";
    return `${where} ${e.message ?? "ung\xFCltig"}`.trim();
  });
}
var validateManifestFn = ajv.compile(PLUGIN_MANIFEST_SCHEMA);
function validateManifest(value) {
  const valid = validateManifestFn(value);
  return { valid, errors: valid ? [] : formatErrors(validateManifestFn) };
}
function validateManifestSemantics(manifest) {
  const errors = [];
  if (!import_semver.default.valid(manifest.version)) {
    errors.push(`Ung\xFCltige SemVer-Version '${manifest.version}'.`);
  }
  if (!import_semver.default.valid(manifest.minAppVersion)) {
    errors.push(`Ung\xFCltige minAppVersion '${manifest.minAppVersion}' (konkrete SemVer erwartet).`);
  }
  if (!import_semver.default.validRange(manifest.apiVersion)) {
    errors.push(`Ung\xFCltige apiVersion-Range '${manifest.apiVersion}'.`);
  }
  if (manifest.repo !== void 0 && !isHttpUrl(manifest.repo)) {
    errors.push(`repo ist keine g\xFCltige http(s)-URL: '${manifest.repo}'.`);
  }
  if (manifest.author?.url !== void 0 && !isHttpUrl(manifest.author.url)) {
    errors.push(`author.url ist keine g\xFCltige http(s)-URL: '${manifest.author.url}'.`);
  }
  for (const [key, value] of Object.entries(manifest.entrypoints ?? {})) {
    if (typeof value === "string" && value.split(/[/\\]/).includes("..")) {
      errors.push(`Entry-Point '${key}' enth\xE4lt ein '..'-Segment: '${value}'.`);
    }
  }
  const declared = new Set(manifest.capabilities);
  const seenActionIds = /* @__PURE__ */ new Set();
  for (const action of manifest.actions ?? []) {
    if (seenActionIds.has(action.id)) {
      errors.push(`Doppelte Action-ID '${action.id}'.`);
    }
    seenActionIds.add(action.id);
    for (const cap of action.requiredCapabilities) {
      if (!declared.has(cap)) {
        errors.push(
          `Action '${action.id}' verlangt Capability '${cap}', die das Manifest nicht deklariert.`
        );
      }
    }
  }
  const actionsById = new Map((manifest.actions ?? []).map((a) => [a.id, a]));
  for (const slotKey of ["dashboardWidget", "sidebarPanel"]) {
    const fromAction = manifest.ui?.[slotKey]?.fromAction;
    if (!fromAction) continue;
    const action = actionsById.get(fromAction);
    if (!action) {
      errors.push(`ui.${slotKey}.fromAction '${fromAction}' referenziert keine deklarierte Action.`);
    } else if (action.widgetProvider !== true || action.isWrite !== false) {
      errors.push(
        `ui.${slotKey}.fromAction '${fromAction}' muss eine Action mit widgetProvider:true UND isWrite:false sein.`
      );
    }
    const expectedSlot = slotKey === "dashboardWidget" ? "dashboard.widget" : "sidebar.panel";
    if (manifest.ui?.[slotKey]?.slot !== expectedSlot) {
      errors.push(`ui.${slotKey}.slot muss exakt '${expectedSlot}' sein.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
function isHttpUrl(value) {
  try {
    const u2 = new URL(value);
    return u2.protocol === "http:" || u2.protocol === "https:";
  } catch {
    return false;
  }
}
function isApiCompatible(apiVersionRange) {
  if (typeof apiVersionRange !== "string" || !import_semver.default.validRange(apiVersionRange)) {
    return {
      compatible: false,
      kind: "manifest-invalid",
      reason: `Ung\xFCltige apiVersion-Range '${apiVersionRange}'.`
    };
  }
  if (!import_semver.default.satisfies(API_VERSION, apiVersionRange)) {
    return {
      compatible: false,
      kind: "incompatible-api",
      reason: `Inkompatible API-Version: Plugin verlangt '${apiVersionRange}', App bietet '${API_VERSION}'.`
    };
  }
  return { compatible: true };
}
function isAppCompatible(minAppVersion, appVersion) {
  if (typeof minAppVersion !== "string" || !import_semver.default.valid(minAppVersion)) {
    return {
      compatible: false,
      kind: "manifest-invalid",
      reason: `Ung\xFCltige minAppVersion '${minAppVersion}'.`
    };
  }
  if (!import_semver.default.valid(appVersion)) {
    return {
      compatible: false,
      kind: "incompatible-app",
      reason: `App-Version unlesbar ('${appVersion}') \u2014 Kompatibilit\xE4t nicht belegbar.`
    };
  }
  if (import_semver.default.lt(appVersion, minAppVersion)) {
    return {
      compatible: false,
      kind: "incompatible-app",
      reason: `App zu alt: Plugin verlangt mindestens '${minAppVersion}', App ist '${appVersion}'.`
    };
  }
  return { compatible: true };
}

// src/main/plugins/artifact/pack.ts
var import_node_crypto2 = require("node:crypto");
var import_node_fs7 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path10 = require("node:path");

// src/main/plugins/artifact/limits.ts
var ARTIFACT_LIMITS = {
  maxFiles: 512,
  maxArchiveBytes: 100 * 1024 * 1024,
  // 100 MiB komprimiert
  maxTotalUnpackedBytes: 250 * 1024 * 1024,
  // 250 MiB entpackt (Summe)
  maxFileBytes: 100 * 1024 * 1024,
  // 100 MiB pro Datei
  maxManifestBytes: 1024 * 1024,
  // 1 MiB
  maxIntegrityBytes: 1024 * 1024,
  // 1 MiB
  maxSigBytes: 16 * 1024,
  // 16 KiB
  maxPathLength: 240,
  maxPathDepth: 8,
  maxSegmentBytes: 100
  // USTAR-Namensfeld (kein PAX) → ≤ 100 ASCII-Bytes pro Segment
};
var ArtifactError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "ArtifactError";
    this.code = code;
  }
};

// src/main/plugins/artifact/format.ts
function canonicalJsonString(value) {
  return JSON.stringify(value, null, 2) + "\n";
}
function canonicalJsonBytes(value) {
  return Buffer.from(canonicalJsonString(value), "utf8");
}
function parseUtf8Json(buf, code, what) {
  if (buf.length >= 3 && buf[0] === 239 && buf[1] === 187 && buf[2] === 191) {
    throw new ArtifactError(code, `${what}: UTF-8-BOM nicht erlaubt`);
  }
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw new ArtifactError(code, `${what}: kein g\xFCltiges JSON`);
  }
}
function artifactPathError(p2, limits = ARTIFACT_LIMITS) {
  if (typeof p2 !== "string" || p2.length === 0) return "leerer Pfad";
  if (p2.length > limits.maxPathLength) return `Pfad l\xE4nger als ${limits.maxPathLength} Zeichen`;
  if (p2.includes("\\")) return "Backslash nicht erlaubt";
  if (p2.startsWith("/")) return "absoluter Pfad nicht erlaubt";
  if (/[A-Z]/.test(p2)) return "Gro\xDFbuchstaben nicht erlaubt (nur lowercase ASCII)";
  if (!/^[a-z0-9._/-]+$/.test(p2)) return "unerlaubte Zeichen (nur a\u2013z 0\u20139 . _ - /)";
  if (p2.startsWith("./")) return "f\xFChrendes './' nicht erlaubt";
  const segs = p2.split("/");
  if (segs.length > limits.maxPathDepth) return `Pfadtiefe gr\xF6\xDFer als ${limits.maxPathDepth}`;
  for (const s3 of segs) {
    if (s3.length === 0) return "leeres Pfadsegment (// oder Slash am Ende)";
    if (s3 === "." || s3 === "..") return `'${s3}'-Segment nicht erlaubt`;
    if (Buffer.byteLength(s3, "utf8") > limits.maxSegmentBytes) {
      return `Pfadsegment l\xE4nger als ${limits.maxSegmentBytes} ASCII-Bytes`;
    }
  }
  return null;
}
function assertArtifactPath(p2, limits = ARTIFACT_LIMITS) {
  const err = artifactPathError(p2, limits);
  if (err) throw new ArtifactError("path-invalid", `Ung\xFCltiger Pfad '${String(p2)}': ${err}`);
  return p2;
}
var INTEGRITY_FORMAT_VERSION = 1;
var INTEGRITY_ALGORITHM = "sha256";
var SHA256_HEX = /^[0-9a-f]{64}$/;
var PLAIN_OBJECT = (v2) => typeof v2 === "object" && v2 !== null && !Array.isArray(v2);
var hasExactKeys = (o, keys) => {
  const k2 = Object.keys(o);
  return k2.length === keys.length && keys.every((key) => key in o);
};
function validateIntegrityDoc(value, limits = ARTIFACT_LIMITS) {
  if (!PLAIN_OBJECT(value) || !hasExactKeys(value, ["formatVersion", "algorithm", "files"])) {
    throw new ArtifactError("integrity-invalid", "integrity.json: erwartet {formatVersion, algorithm, files}");
  }
  if (value.formatVersion !== INTEGRITY_FORMAT_VERSION) {
    throw new ArtifactError("integrity-invalid", `integrity.json: formatVersion muss ${INTEGRITY_FORMAT_VERSION} sein`);
  }
  if (value.algorithm !== INTEGRITY_ALGORITHM) {
    throw new ArtifactError("integrity-invalid", `integrity.json: algorithm muss '${INTEGRITY_ALGORITHM}' sein`);
  }
  if (!Array.isArray(value.files)) {
    throw new ArtifactError("integrity-invalid", "integrity.json: files muss eine Liste sein");
  }
  let prev = null;
  const files = value.files.map((raw, i) => {
    if (!PLAIN_OBJECT(raw) || !hasExactKeys(raw, ["path", "size", "sha256"])) {
      throw new ArtifactError("integrity-invalid", `integrity.files[${i}]: erwartet {path, size, sha256}`);
    }
    const pErr = artifactPathError(raw.path, limits);
    if (pErr) throw new ArtifactError("integrity-invalid", `integrity.files[${i}].path: ${pErr}`);
    if (typeof raw.size !== "number" || !Number.isSafeInteger(raw.size) || raw.size < 0) {
      throw new ArtifactError("integrity-invalid", `integrity.files[${i}].size: nichtnegativer Safe-Integer erwartet`);
    }
    if (typeof raw.sha256 !== "string" || !SHA256_HEX.test(raw.sha256)) {
      throw new ArtifactError("integrity-invalid", `integrity.files[${i}].sha256: 64 lowercase-hex erwartet`);
    }
    const path = raw.path;
    if (prev !== null && !(path > prev)) {
      throw new ArtifactError(
        "integrity-invalid",
        `integrity.files: nicht strikt nach path sortiert/eindeutig ('${prev}' vor '${path}')`
      );
    }
    prev = path;
    return { path, size: raw.size, sha256: raw.sha256 };
  });
  return { formatVersion: INTEGRITY_FORMAT_VERSION, algorithm: INTEGRITY_ALGORITHM, files };
}
var SIG_FORMAT_VERSION = 1;
var SIG_ALGORITHM = "ed25519";
var ED25519_SIG_BYTES = 64;
var BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
function isCanonicalBase64(s3) {
  if (!BASE64.test(s3)) return false;
  return Buffer.from(s3, "base64").toString("base64") === s3;
}
function validateSigEnvelope(value) {
  if (!PLAIN_OBJECT(value) || !hasExactKeys(value, ["formatVersion", "algorithm", "keyId", "signature"])) {
    throw new ArtifactError("sig-invalid", ".sig: erwartet {formatVersion, algorithm, keyId, signature}");
  }
  if (value.formatVersion !== SIG_FORMAT_VERSION) {
    throw new ArtifactError("sig-invalid", `.sig: formatVersion muss ${SIG_FORMAT_VERSION} sein`);
  }
  if (value.algorithm !== SIG_ALGORITHM) {
    throw new ArtifactError("sig-invalid", `.sig: algorithm muss '${SIG_ALGORITHM}' sein`);
  }
  if (typeof value.keyId !== "string" || value.keyId.length === 0) {
    throw new ArtifactError("sig-invalid", ".sig: keyId muss ein nichtleerer String sein");
  }
  if (typeof value.signature !== "string" || !isCanonicalBase64(value.signature)) {
    throw new ArtifactError("sig-invalid", ".sig: signature muss kanonisches Base64 sein");
  }
  const signature = Buffer.from(value.signature, "base64");
  if (signature.length !== ED25519_SIG_BYTES) {
    throw new ArtifactError("sig-invalid", `.sig: signature muss nach Decode ${ED25519_SIG_BYTES} Bytes sein`);
  }
  return {
    envelope: {
      formatVersion: SIG_FORMAT_VERSION,
      algorithm: SIG_ALGORITHM,
      keyId: value.keyId,
      signature: value.signature
    },
    signature
  };
}
var MANIFEST_FILE = "manifest.json";
var INTEGRITY_FILE = "integrity.json";
var SIG_FILE = "integrity.json.sig";

// src/main/plugins/artifact/pack.ts
var byPath = (a, b2) => a.path < b2.path ? -1 : a.path > b2.path ? 1 : 0;
async function packPluginArtifact(input) {
  const seen = /* @__PURE__ */ new Set();
  for (const f2 of input.files) {
    assertArtifactPath(f2.path);
    if (f2.path === INTEGRITY_FILE || f2.path === SIG_FILE) {
      throw new Error(`'${f2.path}' darf nicht als Nutzdatei \xFCbergeben werden (wird erzeugt)`);
    }
    if (seen.has(f2.path)) throw new Error(`Doppelter Pfad '${f2.path}'`);
    seen.add(f2.path);
  }
  if (!seen.has(MANIFEST_FILE)) throw new Error(`'${MANIFEST_FILE}' fehlt in den Nutzdateien`);
  const payload = [...input.files].sort(byPath);
  const entries = payload.map((f2) => ({
    path: f2.path,
    size: f2.content.length,
    sha256: (0, import_node_crypto2.createHash)("sha256").update(f2.content).digest("hex")
  }));
  const integrity = {
    formatVersion: INTEGRITY_FORMAT_VERSION,
    algorithm: INTEGRITY_ALGORITHM,
    files: entries
  };
  const integrityBytes = canonicalJsonBytes(integrity);
  const signature = (0, import_node_crypto2.sign)(null, integrityBytes, input.signKey);
  const sigBytes = canonicalJsonBytes({
    formatVersion: SIG_FORMAT_VERSION,
    algorithm: SIG_ALGORITHM,
    keyId: input.keyId,
    signature: signature.toString("base64")
  });
  const all = [
    ...payload,
    { path: INTEGRITY_FILE, content: integrityBytes },
    { path: SIG_FILE, content: sigBytes }
  ];
  const dir = (0, import_node_fs7.mkdtempSync)((0, import_node_path10.join)((0, import_node_os.tmpdir)(), "mgxpack-"));
  try {
    for (const f2 of all) {
      const abs = (0, import_node_path10.join)(dir, f2.path);
      (0, import_node_fs7.mkdirSync)((0, import_node_path10.dirname)(abs), { recursive: true });
      (0, import_node_fs7.writeFileSync)(abs, f2.content);
    }
    const tar = await Promise.resolve().then(() => (init_index_min(), index_min_exports));
    const outPath = (0, import_node_path10.join)(dir, "__artifact.tgz");
    const tarPaths = all.map((f2) => f2.path).sort();
    await tar.create({ gzip: { level: 9 }, portable: true, cwd: dir, file: outPath }, tarPaths);
    return (0, import_node_fs7.readFileSync)(outPath);
  } finally {
    (0, import_node_fs7.rmSync)(dir, { recursive: true, force: true });
  }
}

// src/main/plugins/artifact/verify.ts
var import_node_crypto3 = require("node:crypto");
var import_node_zlib = require("node:zlib");
var import_node_stream2 = require("node:stream");
var import_promises2 = require("node:stream/promises");
var import_node_fs8 = require("node:fs");
var import_node_path11 = require("node:path");
function perFileCap(path, limits) {
  if (path === SIG_FILE) return limits.maxSigBytes;
  if (path === INTEGRITY_FILE) return limits.maxIntegrityBytes;
  if (path === MANIFEST_FILE) return limits.maxManifestBytes;
  return limits.maxFileBytes;
}
async function gunzipCapped(archive, maxOut) {
  const chunks = [];
  let total = 0;
  const sink = new import_node_stream2.Writable({
    write(chunk, _enc, cb) {
      total += chunk.length;
      if (total > maxOut) {
        cb(new ArtifactError("limit-total-size", `Dekomprimierter Inhalt \xFCberschreitet ${maxOut} Bytes`));
        return;
      }
      chunks.push(chunk);
      cb();
    }
  });
  await (0, import_promises2.pipeline)(import_node_stream2.Readable.from(archive), (0, import_node_zlib.createGunzip)(), sink);
  return Buffer.concat(chunks);
}
async function extractEntries(plainTar, limits) {
  const tar = await Promise.resolve().then(() => (init_index_min(), index_min_exports));
  const files = /* @__PURE__ */ new Map();
  let count = 0;
  let contentTotal = 0;
  let pending = null;
  const fail = (e) => {
    if (!pending) pending = e;
  };
  const parser = new tar.Parser();
  parser.on("entry", (entry) => {
    if (pending) {
      entry.resume();
      return;
    }
    if (entry.type !== "File") {
      fail(new ArtifactError("entry-type", `Eintrag '${entry.path}' ist kein regul\xE4res File (${entry.type})`));
      entry.resume();
      return;
    }
    const pErr = artifactPathError(entry.path, limits);
    if (pErr) {
      fail(new ArtifactError("path-invalid", `Eintrag '${entry.path}': ${pErr}`));
      entry.resume();
      return;
    }
    if (files.has(entry.path)) {
      fail(new ArtifactError("duplicate-path", `Doppelter Eintrag '${entry.path}'`));
      entry.resume();
      return;
    }
    if (++count > limits.maxFiles) {
      fail(new ArtifactError("limit-files", `Mehr als ${limits.maxFiles} Dateien`));
      entry.resume();
      return;
    }
    const cap = perFileCap(entry.path, limits);
    const chunks = [];
    let n = 0;
    entry.on("data", (d) => {
      n += d.length;
      contentTotal += d.length;
      chunks.push(d);
    });
    entry.on("end", () => {
      if (pending) return;
      if (n > cap) {
        fail(new ArtifactError("limit-file-size", `'${entry.path}' \xFCberschreitet ${cap} Bytes`));
        return;
      }
      if (contentTotal > limits.maxTotalUnpackedBytes) {
        fail(new ArtifactError("limit-total-size", `Gesamtinhalt \xFCberschreitet ${limits.maxTotalUnpackedBytes} Bytes`));
        return;
      }
      files.set(entry.path, Buffer.concat(chunks));
    });
  });
  await new Promise((res, rej) => {
    parser.on("end", res);
    parser.on("error", rej);
    parser.end(plainTar);
  });
  if (pending) throw pending;
  return files;
}
function readManifest(files) {
  const buf = files.get(MANIFEST_FILE);
  if (!buf) throw new ArtifactError("fileset-mismatch", `'${MANIFEST_FILE}' fehlt im Archiv`);
  const value = parseUtf8Json(buf, "manifest-invalid", MANIFEST_FILE);
  const shape = validateManifest(value);
  if (!shape.valid) throw new ArtifactError("manifest-invalid", `Ung\xFCltiges Manifest: ${shape.errors.join("; ")}`);
  const semantics = validateManifestSemantics(value);
  if (!semantics.valid) throw new ArtifactError("manifest-invalid", `Ung\xFCltiges Manifest: ${semantics.errors.join("; ")}`);
  return value;
}
function assertCompatible(manifest, appVersion) {
  const api = isApiCompatible(manifest.apiVersion);
  if (!api.compatible) {
    throw new ArtifactError(api.kind === "incompatible-api" ? "incompatible-api" : "manifest-invalid", api.reason ?? "API inkompatibel");
  }
  const app = isAppCompatible(manifest.minAppVersion, appVersion);
  if (!app.compatible) {
    throw new ArtifactError(app.kind === "incompatible-app" ? "incompatible-app" : "manifest-invalid", app.reason ?? "App inkompatibel");
  }
}
function assertEntrypointsPresent(manifest, payload) {
  for (const key of ["main", "renderer", "styles"]) {
    const ep = manifest.entrypoints?.[key];
    if (ep && !payload.has(ep)) {
      throw new ArtifactError("entrypoint-missing", `entrypoints.${key} '${ep}' fehlt im Paket`);
    }
  }
}
function writeQuarantine(quarantineDir, files, entries) {
  const root = (0, import_node_path11.resolve)(quarantineDir);
  (0, import_node_fs8.mkdirSync)(root, { recursive: true });
  const write = (rel, buf) => {
    const abs = (0, import_node_path11.resolve)(root, rel);
    if (abs !== root && !abs.startsWith(root + import_node_path11.sep)) {
      throw new ArtifactError("path-invalid", `Pfad verl\xE4sst die Quarant\xE4ne: '${rel}'`);
    }
    (0, import_node_fs8.mkdirSync)((0, import_node_path11.dirname)(abs), { recursive: true });
    (0, import_node_fs8.writeFileSync)(abs, buf);
  };
  for (const e of entries) write(e.path, files.get(e.path));
  write(INTEGRITY_FILE, files.get(INTEGRITY_FILE));
  write(SIG_FILE, files.get(SIG_FILE));
}
function verifyFileMap(files, opts) {
  const limits = opts.limits ?? ARTIFACT_LIMITS;
  const integrityBytes = files.get(INTEGRITY_FILE);
  const sigBytes = files.get(SIG_FILE);
  if (!integrityBytes) throw new ArtifactError("fileset-mismatch", `'${INTEGRITY_FILE}' fehlt`);
  if (!sigBytes) throw new ArtifactError("fileset-mismatch", `'${SIG_FILE}' fehlt`);
  const sigValue = parseUtf8Json(sigBytes, "sig-invalid", SIG_FILE);
  const { envelope, signature } = validateSigEnvelope(sigValue);
  const publicKey = opts.keyring.get(envelope.keyId);
  if (!publicKey) throw new ArtifactError("sig-unknown-key", `Unbekannte keyId '${envelope.keyId}'`);
  if (!(0, import_node_crypto3.verify)(null, integrityBytes, publicKey, signature)) {
    throw new ArtifactError("sig-mismatch", "Signatur passt nicht zu integrity.json");
  }
  const doc = validateIntegrityDoc(parseUtf8Json(integrityBytes, "integrity-invalid", INTEGRITY_FILE), limits);
  const payloadPaths = new Set([...files.keys()].filter((p2) => p2 !== INTEGRITY_FILE && p2 !== SIG_FILE));
  const listed = new Set(doc.files.map((f2) => f2.path));
  for (const p2 of payloadPaths) {
    if (!listed.has(p2)) throw new ArtifactError("fileset-mismatch", `Datei '${p2}' nicht in integrity.json gelistet`);
  }
  for (const e of doc.files) {
    const buf = files.get(e.path);
    if (!buf) throw new ArtifactError("fileset-mismatch", `In integrity.json gelistete Datei '${e.path}' fehlt`);
    if (buf.length !== e.size) throw new ArtifactError("size-mismatch", `Gr\xF6\xDFe von '${e.path}' weicht ab`);
    if ((0, import_node_crypto3.createHash)("sha256").update(buf).digest("hex") !== e.sha256) {
      throw new ArtifactError("hash-mismatch", `Hash von '${e.path}' weicht ab`);
    }
  }
  const manifest = readManifest(files);
  assertCompatible(manifest, opts.appVersion);
  assertEntrypointsPresent(manifest, payloadPaths);
  return { manifest, files: doc.files };
}
async function verifyPluginArtifact(archive, opts) {
  const limits = opts.limits ?? ARTIFACT_LIMITS;
  if (archive.length > limits.maxArchiveBytes) {
    throw new ArtifactError("archive-too-large", `Archiv \xFCberschreitet ${limits.maxArchiveBytes} Bytes`);
  }
  const headroom = limits.maxFiles * 1024 + 2 * 512;
  const plainTar = await gunzipCapped(archive, limits.maxTotalUnpackedBytes + headroom);
  const files = await extractEntries(plainTar, limits);
  const { manifest, files: entries } = verifyFileMap(files, opts);
  writeQuarantine(opts.quarantineDir, files, entries);
  return {
    id: manifest.id,
    version: manifest.version,
    manifest,
    quarantineDir: (0, import_node_path11.resolve)(opts.quarantineDir),
    files: entries
  };
}
function readPluginDirFiles(dir, limits = ARTIFACT_LIMITS) {
  const root = (0, import_node_path11.resolve)(dir);
  const files = /* @__PURE__ */ new Map();
  let count = 0;
  let total = 0;
  const walk = (abs) => {
    for (const name of (0, import_node_fs8.readdirSync)(abs)) {
      const childAbs = (0, import_node_path11.join)(abs, name);
      const st2 = (0, import_node_fs8.lstatSync)(childAbs);
      if (st2.isSymbolicLink()) throw new ArtifactError("entry-type", `Symlink nicht erlaubt: '${(0, import_node_path11.relative)(root, childAbs).split(import_node_path11.sep).join("/")}'`);
      if (st2.isDirectory()) {
        walk(childAbs);
        continue;
      }
      if (!st2.isFile()) throw new ArtifactError("entry-type", `Kein regul\xE4res File: '${name}'`);
      const rel = (0, import_node_path11.relative)(root, childAbs).split(import_node_path11.sep).join("/");
      const pErr = artifactPathError(rel, limits);
      if (pErr) throw new ArtifactError("path-invalid", `'${rel}': ${pErr}`);
      if (++count > limits.maxFiles) throw new ArtifactError("limit-files", `Mehr als ${limits.maxFiles} Dateien`);
      const cap = rel === SIG_FILE ? limits.maxSigBytes : rel === INTEGRITY_FILE ? limits.maxIntegrityBytes : rel === MANIFEST_FILE ? limits.maxManifestBytes : limits.maxFileBytes;
      if (st2.size > cap) throw new ArtifactError("limit-file-size", `'${rel}' \xFCberschreitet ${cap} Bytes`);
      total += st2.size;
      if (total > limits.maxTotalUnpackedBytes) {
        throw new ArtifactError("limit-total-size", `Gesamtinhalt \xFCberschreitet ${limits.maxTotalUnpackedBytes} Bytes`);
      }
      files.set(rel, (0, import_node_fs8.readFileSync)(childAbs));
    }
  };
  walk(root);
  return files;
}

// src/main/plugins/runtime/keyring.ts
var import_node_crypto4 = require("node:crypto");
var OFFICIAL_KEYS = {
  "mindgraph-release-2026-01": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAotaSK1jNLSNryc7N5QkfsssLDx5Hs+9GU/frKGhCLSQ=\n-----END PUBLIC KEY-----\n"
};
function keyringFromSpkiMap(map) {
  const keys = /* @__PURE__ */ new Map();
  for (const [keyId, pem] of Object.entries(map)) {
    try {
      keys.set(keyId, (0, import_node_crypto4.createPublicKey)(pem));
    } catch {
    }
  }
  return { get: (id) => keys.get(id) };
}

// src/main/plugins/download.ts
var OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
var REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
function parseRepoRef(input) {
  const s3 = String(input ?? "").trim();
  const m2 = s3.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m2) throw new ArtifactError("repo-ref-invalid", `Ung\xFCltige Repo-Angabe '${input}' (erwartet owner/repo)`);
  const owner = m2[1];
  const repo = m2[2].replace(/\.git$/, "");
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === "." || repo === "..") {
    throw new ArtifactError("repo-ref-invalid", `Ung\xFCltige Repo-Angabe '${input}'`);
  }
  return { owner, repo };
}
function parseRepoUrl(url) {
  let u2;
  try {
    u2 = new URL(String(url ?? ""));
  } catch {
    throw new ArtifactError("repo-ref-invalid", `Ung\xFCltige Repo-URL '${url}'`);
  }
  if (u2.protocol !== "https:" && u2.protocol !== "http:") {
    throw new ArtifactError("repo-ref-invalid", `Repo-URL muss http(s) sein: '${url}'`);
  }
  if (u2.hostname.toLowerCase() !== "github.com") {
    throw new ArtifactError("repo-ref-invalid", `Nur github.com-Repo-URLs erlaubt, nicht '${u2.hostname}'`);
  }
  const parts = u2.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new ArtifactError("repo-ref-invalid", `Repo-URL ohne owner/repo: '${url}'`);
  return parseRepoRef(`${parts[0]}/${parts[1]}`);
}

// src/main/plugins/artifact/signCli.ts
var SIGNER_KEY_ID = "mindgraph-release-2026-01";
var POST_VERIFY_APP_VERSION = "9999.0.0";
var SignError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SignError";
  }
};
var normPem = (pem) => pem.replace(/\r\n/g, "\n").trim();
async function signPlugin(input, deps = {}) {
  const keyId = input.keyId ?? SIGNER_KEY_ID;
  const officialKeys = deps.officialKeys ?? OFFICIAL_KEYS;
  const appVersion = deps.appVersion ?? POST_VERIFY_APP_VERSION;
  const official = officialKeys[keyId];
  if (!official) throw new SignError(`Kein OFFICIAL_KEYS-Eintrag f\xFCr keyId '${keyId}'`);
  const derivedPub = (0, import_node_crypto5.createPublicKey)(input.signKey).export({ type: "spki", format: "pem" }).toString();
  if (normPem(derivedPub) !== normPem(official)) {
    throw new SignError(`Secret-Public-Key \u2260 OFFICIAL_KEYS['${keyId}'] \u2014 falscher Signierschl\xFCssel.`);
  }
  const present = readPluginDirFiles(input.artifactDir, ARTIFACT_LIMITS);
  const manifestBuf = present.get(MANIFEST_FILE);
  if (!manifestBuf) throw new SignError(`${MANIFEST_FILE} fehlt im Artefakt`);
  let manifest;
  try {
    manifest = JSON.parse(manifestBuf.toString("utf8"));
  } catch {
    throw new SignError(`${MANIFEST_FILE} ist kein g\xFCltiges JSON`);
  }
  const schema = validateManifest(manifest);
  if (!schema.valid) throw new SignError(`Manifest ung\xFCltig: ${schema.errors.join("; ")}`);
  const sem = validateManifestSemantics(manifest);
  if (!sem.valid) throw new SignError(`Manifest-Semantik ung\xFCltig: ${sem.errors.join("; ")}`);
  if (manifest.version !== input.expectedVersion) {
    throw new SignError(`manifest.version '${manifest.version}' \u2260 Tag-Version '${input.expectedVersion}'`);
  }
  if (!manifest.repo) throw new SignError("manifest.repo fehlt \u2014 f\xFCr offizielle Signierung erforderlich.");
  const manifestRef = parseRepoUrl(manifest.repo);
  const wantRef = parseRepoRef(input.expectedRepo);
  if (manifestRef.owner.toLowerCase() !== wantRef.owner.toLowerCase() || manifestRef.repo.toLowerCase() !== wantRef.repo.toLowerCase()) {
    throw new SignError(
      `manifest.repo '${manifestRef.owner}/${manifestRef.repo}' \u2260 Input-Repo '${wantRef.owner}/${wantRef.repo}'`
    );
  }
  const expected = /* @__PURE__ */ new Set([MANIFEST_FILE]);
  for (const k2 of ["main", "renderer", "styles"]) {
    const ep = manifest.entrypoints?.[k2];
    if (ep) expected.add(ep);
  }
  for (const e of expected) if (!present.has(e)) throw new SignError(`Erwartete Datei fehlt: '${e}'`);
  for (const p2 of present.keys()) if (!expected.has(p2)) throw new SignError(`Unerwartete Datei im Artefakt: '${p2}'`);
  const payloadSet = new Set([...expected].filter((p2) => p2 !== MANIFEST_FILE));
  assertEntrypointsPresent(manifest, payloadSet);
  const files = [...expected].map((p2) => ({ path: p2, content: present.get(p2) }));
  const archive = await packPluginArtifact({ files, signKey: input.signKey, keyId });
  const quarantineDir = (0, import_node_fs9.mkdtempSync)((0, import_node_path12.join)((0, import_node_os2.tmpdir)(), "mgxsign-"));
  try {
    const verified = await verifyPluginArtifact(archive, {
      keyring: keyringFromSpkiMap(officialKeys),
      appVersion,
      quarantineDir
    });
    if (verified.id !== manifest.id || verified.version !== manifest.version) {
      throw new SignError("Post-Verify: id/version des Archivs weichen vom Manifest ab");
    }
  } finally {
    (0, import_node_fs9.rmSync)(quarantineDir, { recursive: true, force: true });
  }
  return archive;
}

// src/main/plugins/artifact/signCli.main.ts
async function main() {
  const pem = process.env.PLUGIN_SIGNING_KEY;
  if (!pem) {
    console.error("::error::PLUGIN_SIGNING_KEY fehlt (Environment release-signing nicht freigegeben?)");
    process.exit(2);
  }
  const artifactDir = process.env.ARTIFACT_DIR;
  const expectedRepo = process.env.PLUGIN_REPO;
  const expectedVersion = process.env.PLUGIN_VERSION;
  const outPath = process.env.OUT_PATH;
  if (!artifactDir || !expectedRepo || !expectedVersion || !outPath) {
    console.error("::error::ARTIFACT_DIR, PLUGIN_REPO, PLUGIN_VERSION, OUT_PATH erforderlich (ENV)");
    process.exit(2);
  }
  let signKey;
  try {
    signKey = (0, import_node_crypto6.createPrivateKey)({ key: pem, format: "pem" });
  } catch {
    console.error("::error::PLUGIN_SIGNING_KEY ist kein g\xFCltiges PEM");
    process.exit(2);
  }
  if (signKey.asymmetricKeyType !== "ed25519") {
    console.error("::error::PLUGIN_SIGNING_KEY ist kein Ed25519-Schl\xFCssel");
    process.exit(2);
  }
  try {
    const archive = await signPlugin({ artifactDir, expectedRepo, expectedVersion, signKey });
    (0, import_node_fs10.writeFileSync)(outPath, archive);
    console.log(`Signiert: ${outPath} (${archive.length} Bytes, repo=${expectedRepo}, v=${expectedVersion})`);
  } catch (err) {
    if (err instanceof SignError || err instanceof ArtifactError) {
      console.error(`::error::Signierung abgelehnt: ${err.message}`);
      process.exit(1);
    }
    console.error("::error::Signierung fehlgeschlagen:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
void main();
