// LLVM_STYLE: new

// Capture the output of this into a variable, if you want
//(function(Module, args) {
//  Module = Module || {};
//  args = args || [];

// Runs much faster, for some reason
this['Module'] = {};
arguments = [];
var args = arguments;
    // === Auto-generated preamble library stuff ===
  
  //========================================
  // Runtime code shared with compiler
  //========================================
  
  Runtime = {
    stackAlloc: function stackAlloc(size) { var ret = STACKTOP; assert(size > 0); for (var i = 0; i < size; i++) HEAP[STACKTOP+i] = 0; STACKTOP += size;STACKTOP = Math.ceil(STACKTOP/4)*4;; assert(STACKTOP < STACK_ROOT + STACK_MAX); return ret; },
    staticAlloc: function staticAlloc(size) { var ret = STATICTOP; assert(size > 0); STATICTOP += size;STATICTOP = Math.ceil(STATICTOP/4)*4;; return ret; },
    alignMemory: function alignMemory(size,quantum) { var ret = size = Math.ceil(size/(quantum ? quantum : 4))*(quantum ? quantum : 4);; return ret; },
    getFunctionIndex: function getFunctionIndex(func, ident) {
      var key = FUNCTION_TABLE.length;
      FUNCTION_TABLE[key] = func;
      FUNCTION_TABLE[key+1] = null; // Need to have keys be even numbers, see |polymorph| test
      Module[ident] = func; // Export using full name, for Closure Compiler
      return key;
    },
    isNumberType: function (type) {
      return type in Runtime.INT_TYPES || type in Runtime.FLOAT_TYPES;
    },
    isPointerType: function isPointerType(type) {
    return pointingLevels(type) > 0;
  },
    isStructType: function isStructType(type) {
    if (isPointerType(type)) return false;
    if (new RegExp(/^\[\d+\ x\ (.*)\]/g).test(type)) return true; // [15 x ?] blocks. Like structs
    // See comment in isStructPointerType()
    return !Runtime.isNumberType(type) && type[0] == '%';
  },
    INT_TYPES: {"i1":0,"i8":0,"i16":0,"i32":0,"i64":0},
    FLOAT_TYPES: {"float":0,"double":0},
    getNativeFieldSize: function getNativeFieldSize(field, alone) {
    if (4 == 1) return 1;
    var size = {
      'i1': 1,
      'i8': 1,
      'i16': 2,
      'i32': 4,
      'i64': 8,
      'float': 4,
      'double':8
    }[field];
    if (!size) {
      size = 4; // A pointer
    }
    if (!alone) size = Math.max(size, 4);
    return size;
  },
    dedup: function dedup(items, ident) {
    var seen = {};
    if (ident) {
      return items.filter(function(item) {
        if (seen[item[ident]]) return false;
        seen[item[ident]] = true;
        return true;
      });
    } else {
      return items.filter(function(item) {
        if (seen[item]) return false;
        seen[item] = true;
        return true;
      });
    }
  },
    set: function set() {
    if (typeof arguments[0] === 'object') arguments = arguments[0];
    var ret = {};
    for (var i = 0; i < arguments.length; i++) {
      ret[arguments[i]] = 0;
    }
    return ret;
  },
    calculateStructAlignment: function calculateStructAlignment(type, otherTypes) {
      type.flatSize = 0;
      var diffs = [];
      var prev = -1, maxSize = -1;
      type.flatIndexes = type.fields.map(function(field) {
        var size;
        if (Runtime.isNumberType(field) || Runtime.isPointerType(field)) {
          size = Runtime.getNativeFieldSize(field, true); // pack char; char; in structs, also char[X]s.
          maxSize = Math.max(maxSize, size);
        } else if (Runtime.isStructType(field)) {
          size = otherTypes[field].flatSize;
          maxSize = Math.max(maxSize, 4);
        } else {
          dprint('Unclear type in struct: ' + field + ', in ' + type.name_);
          assert(0);
        }
        var curr = Runtime.alignMemory(type.flatSize, Math.min(4, size)); // if necessary, place this on aligned memory
        type.flatSize = curr + size;
        if (prev >= 0) {
          diffs.push(curr-prev);
        }
        prev = curr;
        return curr;
      });
      type.flatSize = Runtime.alignMemory(type.flatSize, maxSize);
      if (diffs.length == 0) {
        type.flatFactor = type.flatSize;
      } else if (Runtime.dedup(diffs).length == 1) {
        type.flatFactor = diffs[0];
      }
      type.needsFlattening = (type.flatFactor != 1);
      return type.flatIndexes;
    },
    __dummy__: 0
  }
  
  
  
  
  
  
  //========================================
  // Runtime essentials
  //========================================
  
  function __globalConstructor__() {
  }
  
  // Maps ints ==> functions. This lets us pass around ints, which are
  // actually pointers to functions, and we convert at call()time
  var FUNCTION_TABLE = [];
  
  var __THREW__ = false; // Used in checking for thrown exceptions.
  
  var __ATEXIT__ = [];
  
  var ABORT = false;
  
  var undef = 0;
  
  function abort(text) {
    print(text + ':\n' + (new Error).stack);
    ABORT = true;
    throw "Assertion: " + text;
  }
  
  function assert(condition, text) {
    if (!condition) {
      abort('Assertion failed: ' + text);
    }
  }
  
  // Creates a pointer for a certain slab and a certain address in that slab.
  // If just a slab is given, will allocate room for it and copy it there. In
  // other words, do whatever is necessary in order to return a pointer, that
  // points to the slab (and possibly position) we are given.
  
  var ALLOC_NORMAL = 0; // Tries to use _malloc()
  var ALLOC_STACK = 1; // Lives for the duration of the current function call
  var ALLOC_STATIC = 2; // Cannot be freed
  
  function Pointer_make(slab, pos, allocator) {
    pos = pos ? pos : 0;
    assert(pos === 0); // TODO: remove 'pos'
    if (slab === HEAP) return pos;
    var size = slab.length;
  
    var i;
    for (i = 0; i < size; i++) {
      if (slab[i] === undefined) {
        throw 'Invalid element in slab at ' + new Error().stack; // This can be caught, and you can try again to allocate later, see globalFuncs in run()
      }
    }
  
    // Finalize
    var ret = [_malloc, Runtime.stackAlloc, Runtime.staticAlloc][allocator ? allocator : ALLOC_STATIC](Math.max(size, 1));
  
    for (i = 0; i < size; i++) {
      var curr = slab[i];
  
      if (typeof curr === 'function') {
        curr = Runtime.getFunctionIndex(curr);
      }
  
      HEAP[ret+i] = curr;
    }
  
    return ret;
  }
  Module['Pointer_make'] = Pointer_make;
  
  function Pointer_stringify(ptr) {
    var ret = "";
    var i = 0;
    var t;
    while (1) {
      t = String.fromCharCode(HEAP[ptr+i]);
      if (t == "\0") { break; } else {}
      ret += t;
      i += 1;
    }
    return ret;
  }
  
  // Memory management
  
  var PAGE_SIZE = 4096;
  function alignMemoryPage(x) {
    return Math.ceil(x/PAGE_SIZE)*PAGE_SIZE;
  }
  
  var HEAP, IHEAP, FHEAP;
  var STACK_ROOT, STACKTOP, STACK_MAX;
  var STATICTOP;
  
  // Mangled |new| and |free| (various manglings, for int, long params; new and new[], etc.
  var _malloc, _calloc, _free, __Znwj, __Znaj, __Znam, __Znwm, __ZdlPv, __ZdaPv;
  
  var HAS_TYPED_ARRAYS = false;
  var TOTAL_MEMORY = 50*1024*1024;
  
  function __initializeRuntime__() {
    // If we don't have malloc/free implemented, use a simple implementation.
    Module['_malloc'] = _malloc = __Znwj = __Znaj = __Znam = __Znwm = Module['_malloc'] ? Module['_malloc'] : Runtime.staticAlloc;
    Module['_calloc'] = _calloc                                     = Module['_calloc'] ? Module['_calloc'] : function(n, s) { return _malloc(n*s) };
    Module['_free']   = _free = __ZdlPv = __ZdaPv                   = Module['_free']   ? Module['_free']   : function() { };
  
    {
      // Without this optimization, Chrome is slow. Sadly, the constant here needs to be tweaked depending on the code being run...
      var FAST_MEMORY = TOTAL_MEMORY/32;
      IHEAP = FHEAP = HEAP = new Array(FAST_MEMORY);
      for (var i = 0; i < FAST_MEMORY; i++) {
        IHEAP[i] = FHEAP[i] = 0; // We do *not* use HEAP[i] = 0; here, since this is done just to optimize runtime speed
      }
    }
  
    var base = intArrayFromString('(null)').concat(0); // So printing %s of NULL gives '(null)'
                                                       // Also this ensures we leave 0 as an invalid address, 'NULL'
    for (var i = 0; i < base.length; i++) {
      HEAP[i] = base[i];
    }
  
    Module['HEAP'] = HEAP;
    Module['IHEAP'] = IHEAP;
    Module['FHEAP'] = FHEAP;
  
    STACK_ROOT = STACKTOP = alignMemoryPage(10);
    if (!this['TOTAL_STACK']) TOTAL_STACK = 1024*1024; // Reserved room for stack
    STACK_MAX = STACK_ROOT + TOTAL_STACK;
  
    STATICTOP = alignMemoryPage(STACK_MAX);
  }
  
  function __shutdownRuntime__() {
    while( __ATEXIT__.length > 0) {
      var func = __ATEXIT__.pop();
      if (typeof func === 'number') {
        func = FUNCTION_TABLE[func];
      }
      func();
    }
  }
  
  
  // Copies a list of num items on the HEAP into a
  // a normal JavaScript array of numbers
  function Array_copy(ptr, num) {
    // TODO: In the SAFE_HEAP case, do some reading here, for debugging purposes - currently this is an 'unnoticed read'.
    return IHEAP.slice(ptr, ptr+num);
  }
  
  function String_len(ptr) {
    var i = 0;
    while (HEAP[ptr+i]) i++; // Note: should be |!= 0|, technically. But this helps catch bugs with undefineds
    return i;
  }
  
  // Copies a C-style string, terminated by a zero, from the HEAP into
  // a normal JavaScript array of numbers
  function String_copy(ptr, addZero) {
    return Array_copy(ptr, String_len(ptr)).concat(addZero ? [0] : []);
  }
  
  // Tools
  
  PRINTBUFFER = '';
  function __print__(text) {
    if (text === null) {
      // Flush
      print(PRINTBUFFER);
      PRINTBUFFER = '';
      return;
    }
    // We print only when we see a '\n', as console JS engines always add
    // one anyhow.
    PRINTBUFFER = PRINTBUFFER + text;
    var endIndex;
    while ((endIndex = PRINTBUFFER.indexOf('\n')) != -1) {
      print(PRINTBUFFER.substr(0, endIndex));
      PRINTBUFFER = PRINTBUFFER.substr(endIndex + 1);
    }
  }
  
  function jrint(label, obj) { // XXX manual debugging
    if (!obj) {
      obj = label;
      label = '';
    } else
      label = label + ' : ';
    print(label + JSON.stringify(obj));
  }
  
  // This processes a 'normal' string into a C-line array of numbers.
  // For LLVM-originating strings, see parser.js:parseLLVMString function
  function intArrayFromString(stringy) {
    var ret = [];
    var t;
    var i = 0;
    while (i < stringy.length) {
      ret.push(stringy.charCodeAt(i));
      i = i + 1;
    }
    ret.push(0);
    return ret;
  }
  Module['intArrayFromString'] = intArrayFromString;
  
  function intArrayToString(array) {
    var ret = '';
    for (var i = 0; i < array.length; i++) {
      ret += String.fromCharCode(array[i]);
    }
    return ret;
  }
  
  // Converts a value we have as signed, into an unsigned value. For
  // example, -1 in int32 would be a very large number as unsigned.
  function unSign(value, bits) {
    if (value >= 0) return value;
    return 2*Math.abs(1 << (bits-1)) + value;
  }
  
  // === Body ===
  
  var $struct__IO_FILE___SIZE = 152; // %struct._IO_FILE
  var $struct__IO_FILE___FLATTENER = [0,4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64,68,70,71,72,76,84,88,92,96,100,104,108];
  var $struct__IO_marker___SIZE = 12; // %struct._IO_marker
  
  var $struct__expreval_t___SIZE = 40; // %struct._expreval_t
  var $struct__expreval_t___FLATTENER = [0,4,8,12,20,28,32];
  var $struct__lil_env_t___SIZE = 28; // %struct._lil_env_t
  
  var $struct__lil_func_t___SIZE = 16; // %struct._lil_func_t
  
  var $struct__lil_list_t___SIZE = 8; // %struct._lil_list_t
  
  var $struct__lil_t___SIZE = 108; // %struct._lil_t
  var $struct__lil_t___FLATTENER = [0,4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64,68,100,104];
  var $struct__lil_value_t___SIZE = 8; // %struct._lil_value_t
  
  var $struct__lil_var_t___SIZE = 12; // %struct._lil_var_t
  
  var __str;
  var __str1;
  var __str2;
  var __str3;
  var __str4;
  var __str5;
  var __str6;
  var __str7;
  var __str8;
  var __str9;
  var __str10;
  var __str11;
  var __str12;
  var __str13;
  var __str14;
  var __str15;
  var __str16;
  var __str17;
  var __str18;
  var __str19;
  var __str20;
  var __str21;
  var __str22;
  var __str23;
  var __str24;
  var __str25;
  var __str26;
  var __str27;
  var __str28;
  var __str29;
  var __str30;
  var __str31;
  var __str32;
  var __str33;
  var __str34;
  var __str35;
  var __str36;
  var __str37;
  var __str38;
  var __str39;
  var __str40;
  var __str41;
  var __str42;
  var __str43;
  var __str44;
  var __str45;
  var __str46;
  var __str47;
  var __str48;
  var __str49;
  var __str50;
  var __str51;
  var __str52;
  var __str53;
  var __str54;
  var __str55;
  var __str56;
  var __str57;
  var __str58;
  var __str59;
  var __str60;
  var __str61;
  var __str62;
  var __str63;
  var __str64;
  var __str65;
  var __str66;
  var __str67;
  var __str68;
  var __str69;
  var __str70;
  var __str71;
  var __str72;
  var __str73;
  var __str74;
  var __str75;
  var __str76;
  var __str77;
  var __str78;
  var __str79;
  var __str80;
  var __str81;
  var __str82;
  var __str83;
  var __str84;
  var __str85;
  var __str86;
  var __str87;
  var __str88;
  var __str89;
  var __str90;
  var __str91;
  
  // stub for _calloc
  // stub for _malloc
  // stub for _free
  _llvm_memcpy_p0i8_p0i8_i32 = function (dest, src, num, idunno) {
      var curr;
      for (var i = 0; i < num; i++) {
        // TODO: optimize for the typed arrays case
        // || 0, since memcpy sometimes copies uninitialized areas XXX: Investigate why initializing alloc'ed memory does not fix that too
        IHEAP[dest+i] = IHEAP[src+i]; FHEAP[dest+i] = FHEAP[src+i]; ;
      }
    }
  _realloc = function (ptr, size) {
      // Very simple, inefficient implementation - if you use a real malloc, best to use
      // a real realloc with it
      if (!size) {
        if (ptr) _free(ptr);
        return 0;
      }
      var ret = _malloc(size);
      if (ptr) {
        _memcpy(ret, ptr, size); // might be some invalid reads
        _free(ptr);
      }
      return ret;
    }
  _memcpy = function (dest, src, num, idunno) {
      var curr;
      for (var i = 0; i < num; i++) {
        // TODO: optimize for the typed arrays case
        // || 0, since memcpy sometimes copies uninitialized areas XXX: Investigate why initializing alloc'ed memory does not fix that too
        IHEAP[dest+i] = IHEAP[src+i]; FHEAP[dest+i] = FHEAP[src+i]; ;
      }
    }
  _strlen = function (ptr) {
      return String_len(ptr);
    }
  _sprintf = function () {
      var str = arguments[0];
      var args = Array.prototype.slice.call(arguments, 1);
      _strcpy(str, __formatString.apply(null, args)); // not terribly efficient
    }
  _strcpy = function (pdest, psrc) {
      var i = 0;
      do {
        HEAP[pdest+i] = HEAP[psrc+i];
        i ++;
      } while (HEAP[psrc+i-1] != 0);
    }
  __formatString = function () {
      function isFloatArg(type) {
        return String.fromCharCode(type) in Runtime.set('f', 'e', 'g');
      }
      var cStyle = false;
      var textIndex = arguments[0];
      var argIndex = 1;
      if (textIndex < 0) {
        cStyle = true;
        textIndex = -textIndex;
        slab = null;
        argIndex = arguments[1];
      } else {
        var _arguments = arguments;
      }
      function getNextArg(type) {
        var ret;
        if (!cStyle) {
          ret = _arguments[argIndex];
          argIndex++;
        } else {
          if (isFloatArg(type)) {
            ret = HEAP[argIndex];
          } else {
            ret = HEAP[argIndex];
          }
          argIndex += type === 'l'.charCodeAt(0) ? 8 : 4; // XXX hardcoded native sizes
        }
        return ret;
      }
  
      var ret = [];
      var curr, next, currArg;
      while(1) {
        curr = HEAP[textIndex];
        if (curr === 0) break;
        next = HEAP[textIndex+1];
        if (curr == '%'.charCodeAt(0)) {
          // Handle very very simply formatting, namely only %.X[f|d|u|etc.]
          var precision = -1;
          if (next == '.'.charCodeAt(0)) {
            textIndex++;
            precision = 0;
            while(1) {
              var precisionChr = HEAP[textIndex+1];
              if (!(precisionChr >= '0'.charCodeAt(0) && precisionChr <= '9'.charCodeAt(0))) break;
              precision *= 10;
              precision += precisionChr - '0'.charCodeAt(0);
              textIndex++;
            }
            next = HEAP[textIndex+1];
          }
          if (next == 'l'.charCodeAt(0)) {
            textIndex++;
            next = HEAP[textIndex+1];
          }
          if (isFloatArg(next)) {
            next = 'f'.charCodeAt(0); // no support for 'e'
          }
          if (['d', 'i', 'u', 'p', 'f'].indexOf(String.fromCharCode(next)) != -1) {
            var currArg;
            var argText;
            currArg = getNextArg(next);
            argText = String(+currArg); // +: boolean=>int
            if (next == 'u'.charCodeAt(0)) {
              argText = String(unSign(currArg, 32));
            } else if (next == 'p'.charCodeAt(0)) {
              argText = '0x' + currArg.toString(16);
            } else {
              argText = String(+currArg); // +: boolean=>int
            }
            if (precision >= 0) {
              if (isFloatArg(next)) {
                var dotIndex = argText.indexOf('.');
                if (dotIndex == -1 && next == 'f'.charCodeAt(0)) {
                  dotIndex = argText.length;
                  argText += '.';
                }
                argText += '00000000000'; // padding
                argText = argText.substr(0, dotIndex+1+precision);
              } else {
                while (argText.length < precision) {
                  argText = '0' + argText;
                }
              }
            }
            argText.split('').forEach(function(chr) {
              ret.push(chr.charCodeAt(0));
            });
            textIndex += 2;
          } else if (next == 's'.charCodeAt(0)) {
            ret = ret.concat(String_copy(getNextArg(next)));
            textIndex += 2;
          } else if (next == 'c'.charCodeAt(0)) {
            ret = ret.concat(getNextArg(next));
            textIndex += 2;
          } else {
            ret.push(next);
            textIndex += 2; // not sure what to do with this %, so print it
          }
        } else {
          ret.push(curr);
          textIndex += 1;
        }
      }
      return Pointer_make(ret.concat(0), 0, ALLOC_STACK); // NB: Stored on the stack
    }
  _STDIO = {"streams":{},"filenames":{},"counter":1,"SEEK_SET":0,"SEEK_CUR":1,"SEEK_END":2, init: function () {
        _stdin = Pointer_make([0], null, ALLOC_STATIC);
        IHEAP[_stdin] = this.prepare('<<stdin>>');
        _stdout = Pointer_make([0], null, ALLOC_STATIC);
        IHEAP[_stdout] = this.prepare('<<stdout>>', null, true);
        _stderr = Pointer_make([0], null, ALLOC_STATIC);
        IHEAP[_stderr] = this.prepare('<<stderr>>', null, true);
      }, prepare: function (filename, data, print_) {
        var stream = this.counter++;
        this.streams[stream] = {
          filename: filename,
          data: data ? data : [],
          position: 0,
          eof: 0,
          error: 0,
          print: print_ // true for stdout and stderr - we print when receiving data for them
        };
        this.filenames[filename] = stream;
        return stream;
      } }
  _strcmp = function (px, py) {
      var i = 0;
      while (true) {
        var x = HEAP[px+i];
        var y = HEAP[py+i];
        if (x == y && x == 0) return 0;
        if (x == 0) return -1;
        if (y == 0) return 1;
        if (x == y) {
          i ++;
          continue;
        } else {
          return x > y ? 1 : -1;
        }
      }
    }
  // stub for _atof
  // stub for _atoll
  // stub for _rand
  _fopen = function (filename, mode) {
      filename = Pointer_stringify(filename);
      mode = Pointer_stringify(mode);
      if (mode.indexOf('r') >= 0) {
        var stream = this._STDIO.filenames[filename];
        if (!stream) return 0; // assert(false, 'No information for file: ' + filename);
        var info = this._STDIO.streams[stream];
        info.position = info.error = info.eof = 0;
        return stream;
      } else if (mode.indexOf('w') >= 0) {
        return this._STDIO.prepare(filename);
      } else {
        assert(false, 'fopen with odd params: ' + mode);
      }
    }
  
  _fseek = function (stream, offset, whence) {
      var info = this._STDIO.streams[stream];
      if (whence === this._STDIO.SEEK_CUR) {
        offset += info.position;
      } else if (whence === this._STDIO.SEEK_END) {
        offset += info.data.length;
      }
      info.position = offset;
      info.eof = 0;
      return 0;
    }
  
  _ftell = function (stream) {
      return this._STDIO.streams[stream].position;
    }
  
  _fread = function (ptr, size, count, stream) {
      var info = this._STDIO.streams[stream];
      for (var i = 0; i < count; i++) {
        if (info.position + size > info.data.length) {
          info.eof = 1;
          return i;
        }
        for (var j = 0; j < size; j++) {
          HEAP[ptr] = info.data[info.position];
          info.position++;
          ptr++;
        }
      }
      return count;
    }
  
  _fclose = function (stream) {
      return 0;
    }
  
  _strchr = function (ptr, chr) {
      ptr--;
      do {
        ptr++;
        var val = HEAP[ptr];
        if (val == chr) return ptr;
      } while (val);
      return 0;
    }
  _strstr = function (ptr1, ptr2) {
      var str1 = Pointer_stringify(ptr1);
      var str2 = Pointer_stringify(ptr2);
      var ret = str1.search(str2);
      return ret >= 0 ? ptr1 + ret : 0;
    }
  _fwrite = function (ptr, size, count, stream) {
      var info = this._STDIO.streams[stream];
      if (info.print) {
        __print__(intArrayToString(Array_copy(ptr, count*size)));
      } else {
        for (var i = 0; i < size*count; i++) {
          info.data[info.position] = HEAP[ptr];
          info.position++;
          ptr++;
        }
      }
      return count;
    }
  
  // stub for _fmod
  _printf = function () {
      __print__(Pointer_stringify(__formatString.apply(null, arguments)));
    }
  
  ___ctype_b_loc = function () { // http://refspecs.freestandards.org/LSB_3.0.0/LSB-Core-generic/LSB-Core-generic/baselib---ctype-b-loc.html
      var me = arguments.callee;
      if (!me.ret) {
        var values = [
          0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
          0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
          0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
          0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
          0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,8195,0,8194,0,8194,0,8194,0,8194,0,2,0,2,
          0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,2,0,24577,0,49156,0,49156,0,49156,0,49156,0,49156,0,49156,
          0,49156,0,49156,0,49156,0,49156,0,49156,0,49156,0,49156,0,49156,0,49156,0,55304,0,55304,0,55304,0,55304,0,55304,0,55304,
          0,55304,0,55304,0,55304,0,55304,0,49156,0,49156,0,49156,0,49156,0,49156,0,49156,0,49156,0,54536,0,54536,0,54536,0,54536,
          0,54536,0,54536,0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,
          0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,0,50440,0,49156,0,49156,0,49156,0,49156,0,49156,0,49156,0,54792,0,54792,
          0,54792,0,54792,0,54792,0,54792,0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,
          0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,0,50696,0,49156,0,49156,0,49156,0,49156,0,2,0,0,0,0,0,0,
          0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
          0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
          0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
          0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
          0,0,0,0,0,0,0,0,0,0,0
        ];
        me.ret = Pointer_make([Pointer_make(values, 0, ALLOC_STATIC)+256], 0, ALLOC_STATIC);
        assert(IHEAP[IHEAP[me.ret]] == 2);
        assert(IHEAP[IHEAP[me.ret]-2] == 0);
        assert(IHEAP[IHEAP[me.ret]+18] == 8195);
      }
      return me.ret;
    }
  
  
  function _lil_clone_value($src) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $val = __stackBase__+8;
        HEAP[$2] = $src;;
        var $3 = HEAP[$2];
        var $4 = $3 != 0;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $5
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $6
        var $7 = _calloc(1, 8);
        var $8 = $7;
        HEAP[$val] = $8;;
        var $9 = HEAP[$val];
        var $10 = $9 != 0;
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $11
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 3: // $12
        var $13 = HEAP[$2];
        var $14 = $13;
        var $15 = HEAP[$14];
        var $16 = HEAP[$val];
        var $17 = $16;
        HEAP[$17] = $15;;
        var $18 = HEAP[$2];
        var $19 = $18;
        var $20 = HEAP[$19];
        var $21 = $20 != 0;
        if ($21) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $22
        var $23 = HEAP[$val];
        var $24 = $23;
        var $25 = HEAP[$24];
        var $26 = ($25 + 1)&4294967295;
        var $27 = _malloc($26);
        var $28 = HEAP[$val];
        var $29 = $28+4;
        HEAP[$29] = $27;;
        var $30 = HEAP[$val];
        var $31 = $30+4;
        var $32 = HEAP[$31];
        var $33 = $32 != 0;
        if ($33) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 8: // $34
        var $35 = HEAP[$val];
        var $36 = $35;
        _free($36);
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 7: // $37
        var $38 = HEAP[$val];
        var $39 = $38+4;
        var $40 = HEAP[$39];
        var $41 = HEAP[$2];
        var $42 = $41+4;
        var $43 = HEAP[$42];
        var $44 = HEAP[$val];
        var $45 = $44;
        var $46 = HEAP[$45];
        var $47 = ($46 + 1)&4294967295;
        _llvm_memcpy_p0i8_p0i8_i32($40, $43, $47, 1, 0);
        __label__ = 9; break;
      case 6: // $48
        var $49 = HEAP[$val];
        var $50 = $49+4;
        HEAP[$50] = 0;;
        __label__ = 9; break;
      case 9: // $51
        var $52 = HEAP[$val];
        HEAP[$1] = $52;;
        __label__ = 2; break;
      case 2: // $53
        var $54 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $54;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_clone_value.__index__ = Runtime.getFunctionIndex(_lil_clone_value, "_lil_clone_value");
  
  
  function _lil_append_char($val, $ch) {
    var __stackBase__  = STACKTOP; STACKTOP += 13; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $new = __stackBase__+9;
        HEAP[$2] = $val;;
        HEAP[$3] = $ch;;
        var $4 = HEAP[$2];
        var $5 = $4+4;
        var $6 = HEAP[$5];
        var $7 = HEAP[$2];
        var $8 = $7;
        var $9 = HEAP[$8];
        var $10 = ($9 + 2)&4294967295;
        var $11 = _realloc($6, $10);
        HEAP[$new] = $11;;
        var $12 = HEAP[$new];
        var $13 = $12 != 0;
        if ($13) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $14
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $15
        var $16 = HEAP[$3];
        var $17 = HEAP[$2];
        var $18 = $17;
        var $19 = HEAP[$18];
        var $20 = ($19 + 1)&4294967295;
        HEAP[$18] = $20;;
        var $21 = HEAP[$new];
        var $22 = $21+$19;
        HEAP[$22] = $16;;
        var $23 = HEAP[$2];
        var $24 = $23;
        var $25 = HEAP[$24];
        var $26 = HEAP[$new];
        var $27 = $26+$25;
        HEAP[$27] = 0;;
        var $28 = HEAP[$new];
        var $29 = HEAP[$2];
        var $30 = $29+4;
        HEAP[$30] = $28;;
        HEAP[$1] = 1;;
        __label__ = 2; break;
      case 2: // $31
        var $32 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $32;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_append_char.__index__ = Runtime.getFunctionIndex(_lil_append_char, "_lil_append_char");
  
  
  function _lil_append_string($val, $s) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $new = __stackBase__+12;
        var $len = __stackBase__+16;
        HEAP[$2] = $val;;
        HEAP[$3] = $s;;
        var $4 = HEAP[$3];
        var $5 = $4 != 0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7 = HEAP[$3];
        var $8 = $7;
        var $9 = HEAP[$8];
        var $10 = $9 != 0;
        if ($10) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $11
        HEAP[$1] = 1;;
        __label__ = 3; break;
      case 2: // $12
        var $13 = HEAP[$3];
        var $14 = _strlen($13);
        HEAP[$len] = $14;;
        var $15 = HEAP[$2];
        var $16 = $15+4;
        var $17 = HEAP[$16];
        var $18 = HEAP[$2];
        var $19 = $18;
        var $20 = HEAP[$19];
        var $21 = HEAP[$len];
        var $22 = ($20 + $21)&4294967295;
        var $23 = ($22 + 1)&4294967295;
        var $24 = _realloc($17, $23);
        HEAP[$new] = $24;;
        var $25 = HEAP[$new];
        var $26 = $25 != 0;
        if ($26) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 5: // $27
        HEAP[$1] = 0;;
        __label__ = 3; break;
      case 4: // $28
        var $29 = HEAP[$new];
        var $30 = HEAP[$2];
        var $31 = $30;
        var $32 = HEAP[$31];
        var $33 = $29+$32;
        var $34 = HEAP[$3];
        var $35 = HEAP[$len];
        var $36 = ($35 + 1)&4294967295;
        _llvm_memcpy_p0i8_p0i8_i32($33, $34, $36, 1, 0);
        var $37 = HEAP[$len];
        var $38 = HEAP[$2];
        var $39 = $38;
        var $40 = HEAP[$39];
        var $41 = ($40 + $37)&4294967295;
        HEAP[$39] = $41;;
        var $42 = HEAP[$new];
        var $43 = HEAP[$2];
        var $44 = $43+4;
        HEAP[$44] = $42;;
        HEAP[$1] = 1;;
        __label__ = 3; break;
      case 3: // $45
        var $46 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $46;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_append_string.__index__ = Runtime.getFunctionIndex(_lil_append_string, "_lil_append_string");
  
  
  function _lil_append_val($val, $v) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $new = __stackBase__+12;
        HEAP[$2] = $val;;
        HEAP[$3] = $v;;
        var $4 = HEAP[$3];
        var $5 = $4 != 0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7 = HEAP[$3];
        var $8 = $7;
        var $9 = HEAP[$8];
        var $10 = $9 != 0;
        if ($10) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $11
        HEAP[$1] = 1;;
        __label__ = 3; break;
      case 2: // $12
        var $13 = HEAP[$2];
        var $14 = $13+4;
        var $15 = HEAP[$14];
        var $16 = HEAP[$2];
        var $17 = $16;
        var $18 = HEAP[$17];
        var $19 = HEAP[$3];
        var $20 = $19;
        var $21 = HEAP[$20];
        var $22 = ($18 + $21)&4294967295;
        var $23 = ($22 + 1)&4294967295;
        var $24 = _realloc($15, $23);
        HEAP[$new] = $24;;
        var $25 = HEAP[$new];
        var $26 = $25 != 0;
        if ($26) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 5: // $27
        HEAP[$1] = 0;;
        __label__ = 3; break;
      case 4: // $28
        var $29 = HEAP[$new];
        var $30 = HEAP[$2];
        var $31 = $30;
        var $32 = HEAP[$31];
        var $33 = $29+$32;
        var $34 = HEAP[$3];
        var $35 = $34+4;
        var $36 = HEAP[$35];
        var $37 = HEAP[$3];
        var $38 = $37;
        var $39 = HEAP[$38];
        var $40 = ($39 + 1)&4294967295;
        _llvm_memcpy_p0i8_p0i8_i32($33, $36, $40, 1, 0);
        var $41 = HEAP[$3];
        var $42 = $41;
        var $43 = HEAP[$42];
        var $44 = HEAP[$2];
        var $45 = $44;
        var $46 = HEAP[$45];
        var $47 = ($46 + $43)&4294967295;
        HEAP[$45] = $47;;
        var $48 = HEAP[$new];
        var $49 = HEAP[$2];
        var $50 = $49+4;
        HEAP[$50] = $48;;
        HEAP[$1] = 1;;
        __label__ = 3; break;
      case 3: // $51
        var $52 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $52;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_append_val.__index__ = Runtime.getFunctionIndex(_lil_append_val, "_lil_append_val");
  
  
  function _lil_free_value($val) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        HEAP[$1] = $val;;
        var $2 = HEAP[$1];
        var $3 = $2 != 0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $4
        __label__ = 2; break;
      case 0: // $5
        var $6 = HEAP[$1];
        var $7 = $6+4;
        var $8 = HEAP[$7];
        _free($8);
        var $9 = HEAP[$1];
        var $10 = $9;
        _free($10);
        __label__ = 2; break;
      case 2: // $11
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_free_value.__index__ = Runtime.getFunctionIndex(_lil_free_value, "_lil_free_value");
  
  
  function _lil_alloc_list() {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $list = __stackBase__;
    var $1 = _calloc(1, 8);
    var $2 = $1;
    HEAP[$list] = $2;;
    var $3 = HEAP[$list];
    var $4 = $3;
    HEAP[$4] = 0;;
    var $5 = HEAP[$list];
    var $6 = $5+4;
    HEAP[$6] = 0;;
    var $7 = HEAP[$list];
    STACKTOP = __stackBase__;
    return $7;
  }
  _lil_alloc_list.__index__ = Runtime.getFunctionIndex(_lil_alloc_list, "_lil_alloc_list");
  
  
  function _lil_free_list($list) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $i = __stackBase__+4;
        HEAP[$1] = $list;;
        var $2 = HEAP[$1];
        var $3 = $2 != 0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $4
        __label__ = 2; break;
      case 0: // $5
        HEAP[$i] = 0;;
        __label__ = 3; break;
      case 3: // $6
        var $7 = HEAP[$i];
        var $8 = HEAP[$1];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = unSign($7, 32) < unSign($10, 32);
        if ($11) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $12
        var $13 = HEAP[$i];
        var $14 = HEAP[$1];
        var $15 = $14;
        var $16 = HEAP[$15];
        var $17 = $16+4*$13;
        var $18 = HEAP[$17];
        _lil_free_value($18);
        __label__ = 6; break;
      case 6: // $19
        var $20 = HEAP[$i];
        var $21 = ($20 + 1)&4294967295;
        HEAP[$i] = $21;;
        __label__ = 3; break;
      case 5: // $22
        var $23 = HEAP[$1];
        var $24 = $23;
        var $25 = HEAP[$24];
        var $26 = $25;
        _free($26);
        var $27 = HEAP[$1];
        var $28 = $27;
        _free($28);
        __label__ = 2; break;
      case 2: // $29
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_free_list.__index__ = Runtime.getFunctionIndex(_lil_free_list, "_lil_free_list");
  
  
  function _lil_list_append($list, $val) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $nv = __stackBase__+8;
        HEAP[$1] = $list;;
        HEAP[$2] = $val;;
        var $3 = HEAP[$1];
        var $4 = $3;
        var $5 = HEAP[$4];
        var $6 = $5;
        var $7 = HEAP[$1];
        var $8 = $7+4;
        var $9 = HEAP[$8];
        var $10 = ($9 + 1)&4294967295;
        var $11 = (4 * $10)&4294967295;
        var $12 = _realloc($6, $11);
        var $13 = $12;
        HEAP[$nv] = $13;;
        var $14 = HEAP[$nv];
        var $15 = $14 != 0;
        if ($15) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $16
        __label__ = 2; break;
      case 0: // $17
        var $18 = HEAP[$nv];
        var $19 = HEAP[$1];
        var $20 = $19;
        HEAP[$20] = $18;;
        var $21 = HEAP[$2];
        var $22 = HEAP[$1];
        var $23 = $22+4;
        var $24 = HEAP[$23];
        var $25 = ($24 + 1)&4294967295;
        HEAP[$23] = $25;;
        var $26 = HEAP[$nv];
        var $27 = $26+4*$24;
        HEAP[$27] = $21;;
        __label__ = 2; break;
      case 2: // $28
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_list_append.__index__ = Runtime.getFunctionIndex(_lil_list_append, "_lil_list_append");
  
  
  function _lil_list_size($list) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    HEAP[$1] = $list;;
    var $2 = HEAP[$1];
    var $3 = $2+4;
    var $4 = HEAP[$3];
    STACKTOP = __stackBase__;
    return $4;
  }
  _lil_list_size.__index__ = Runtime.getFunctionIndex(_lil_list_size, "_lil_list_size");
  
  
  function _lil_list_get($list, $index) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        HEAP[$1] = $list;;
        HEAP[$2] = $index;;
        var $3 = HEAP[$2];
        var $4 = HEAP[$1];
        var $5 = $4+4;
        var $6 = HEAP[$5];
        var $7 = unSign($3, 32) >= unSign($6, 32);
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        __lastLabel__ = 0; __label__ = 2; break;
      case 1: // $9
        var $10 = HEAP[$2];
        var $11 = HEAP[$1];
        var $12 = $11;
        var $13 = HEAP[$12];
        var $14 = $13+4*$10;
        var $15 = HEAP[$14];
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $16
        var $17 = __lastLabel__ == 0 ? 0 : ($15);
        STACKTOP = __stackBase__;
        return $17;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_list_get.__index__ = Runtime.getFunctionIndex(_lil_list_get, "_lil_list_get");
  
  
  function _lil_list_to_value($list, $do_escape) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $val = __stackBase__+8;
        var $i = __stackBase__+12;
        var $escape = __stackBase__+16;
        HEAP[$1] = $list;;
        HEAP[$2] = $do_escape;;
        var $3 = _alloc_value(0);
        HEAP[$val] = $3;;
        HEAP[$i] = 0;;
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$i];
        var $6 = HEAP[$1];
        var $7 = $6+4;
        var $8 = HEAP[$7];
        var $9 = unSign($5, 32) < unSign($8, 32);
        if ($9) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $10
        var $11 = HEAP[$2];
        var $12 = $11 != 0;
        if ($12) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $13
        var $14 = HEAP[$i];
        var $15 = HEAP[$1];
        var $16 = $15;
        var $17 = HEAP[$16];
        var $18 = $17+4*$14;
        var $19 = HEAP[$18];
        var $20 = _lil_to_string($19);
        var $21 = _needs_escape($20);
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $22
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $23
        var $24 = __lastLabel__ == 3 ? $21 : (0);
        HEAP[$escape] = $24;;
        var $25 = HEAP[$i];
        var $26 = $25 != 0;
        if ($26) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $27
        var $28 = HEAP[$val];
        var $29 = _lil_append_char($28, 32);
        __label__ = 7; break;
      case 7: // $30
        var $31 = HEAP[$escape];
        var $32 = $31 != 0;
        if ($32) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $33
        var $34 = HEAP[$val];
        var $35 = _lil_append_char($34, 123);
        __label__ = 9; break;
      case 9: // $36
        var $37 = HEAP[$val];
        var $38 = HEAP[$i];
        var $39 = HEAP[$1];
        var $40 = $39;
        var $41 = HEAP[$40];
        var $42 = $41+4*$38;
        var $43 = HEAP[$42];
        var $44 = _lil_append_val($37, $43);
        var $45 = HEAP[$escape];
        var $46 = $45 != 0;
        if ($46) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $47
        var $48 = HEAP[$val];
        var $49 = _lil_append_char($48, 125);
        __label__ = 11; break;
      case 11: // $50
        __label__ = 12; break;
      case 12: // $51
        var $52 = HEAP[$i];
        var $53 = ($52 + 1)&4294967295;
        HEAP[$i] = $53;;
        __label__ = 0; break;
      case 2: // $54
        var $55 = HEAP[$val];
        STACKTOP = __stackBase__;
        return $55;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_list_to_value.__index__ = Runtime.getFunctionIndex(_lil_list_to_value, "_lil_list_to_value");
  
  
  function _alloc_value($str) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $val = __stackBase__+8;
        HEAP[$2] = $str;;
        var $3 = _calloc(1, 8);
        var $4 = $3;
        HEAP[$val] = $4;;
        var $5 = HEAP[$val];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $8
        var $9 = HEAP[$2];
        var $10 = $9 != 0;
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $11
        var $12 = HEAP[$2];
        var $13 = _strlen($12);
        var $14 = HEAP[$val];
        var $15 = $14;
        HEAP[$15] = $13;;
        var $16 = HEAP[$val];
        var $17 = $16;
        var $18 = HEAP[$17];
        var $19 = ($18 + 1)&4294967295;
        var $20 = _malloc($19);
        var $21 = HEAP[$val];
        var $22 = $21+4;
        HEAP[$22] = $20;;
        var $23 = HEAP[$val];
        var $24 = $23+4;
        var $25 = HEAP[$24];
        var $26 = $25 != 0;
        if ($26) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $27
        var $28 = HEAP[$val];
        var $29 = $28;
        _free($29);
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 5: // $30
        var $31 = HEAP[$val];
        var $32 = $31+4;
        var $33 = HEAP[$32];
        var $34 = HEAP[$2];
        var $35 = HEAP[$val];
        var $36 = $35;
        var $37 = HEAP[$36];
        var $38 = ($37 + 1)&4294967295;
        _llvm_memcpy_p0i8_p0i8_i32($33, $34, $38, 1, 0);
        __label__ = 7; break;
      case 4: // $39
        var $40 = HEAP[$val];
        var $41 = $40;
        HEAP[$41] = 0;;
        var $42 = HEAP[$val];
        var $43 = $42+4;
        HEAP[$43] = 0;;
        __label__ = 7; break;
      case 7: // $44
        var $45 = HEAP[$val];
        HEAP[$1] = $45;;
        __label__ = 2; break;
      case 2: // $46
        var $47 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $47;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _alloc_value.__index__ = Runtime.getFunctionIndex(_alloc_value, "_alloc_value");
  
  
  function _needs_escape($str) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $i = __stackBase__+8;
        HEAP[$2] = $str;;
        var $3 = HEAP[$2];
        var $4 = $3 != 0;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $5
        var $6 = HEAP[$2];
        var $7 = $6;
        var $8 = HEAP[$7];
        var $9 = $8 != 0;
        if ($9) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 1: // $10
        HEAP[$1] = 1;;
        __label__ = 3; break;
      case 2: // $11
        HEAP[$i] = 0;;
        __label__ = 4; break;
      case 4: // $12
        var $13 = HEAP[$i];
        var $14 = HEAP[$2];
        var $15 = $14+$13;
        var $16 = HEAP[$15];
        var $17 = $16 != 0;
        if ($17) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $18
        var $19 = HEAP[$i];
        var $20 = HEAP[$2];
        var $21 = $20+$19;
        var $22 = HEAP[$21];
        var $23 = $22;
        var $24 = ___ctype_b_loc();
        var $25 = HEAP[$24];
        var $26 = $25+2*$23;
        var $27 = HEAP[$26];
        var $28 = $27;
        var $29 = $28 & 4;
        var $30 = $29 != 0;
        if ($30) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 8: // $31
        var $32 = HEAP[$i];
        var $33 = HEAP[$2];
        var $34 = $33+$32;
        var $35 = HEAP[$34];
        var $36 = $35;
        var $37 = ___ctype_b_loc();
        var $38 = HEAP[$37];
        var $39 = $38+2*$36;
        var $40 = HEAP[$39];
        var $41 = $40;
        var $42 = $41 & 8192;
        var $43 = $42 != 0;
        if ($43) { __label__ = 7; break; } else { __label__ = 9; break; }
      case 7: // $44
        HEAP[$1] = 1;;
        __label__ = 3; break;
      case 9: // $45
        __label__ = 10; break;
      case 10: // $46
        var $47 = HEAP[$i];
        var $48 = ($47 + 1)&4294967295;
        HEAP[$i] = $48;;
        __label__ = 4; break;
      case 6: // $49
        HEAP[$1] = 0;;
        __label__ = 3; break;
      case 3: // $50
        var $51 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $51;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _needs_escape.__index__ = Runtime.getFunctionIndex(_needs_escape, "_needs_escape");
  
  
  function _lil_to_string($val) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        HEAP[$1] = $val;;
        var $2 = HEAP[$1];
        var $3 = $2 != 0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $4
        var $5 = HEAP[$1];
        var $6 = $5+4;
        var $7 = HEAP[$6];
        var $8 = $7 != 0;
        if ($8) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $9
        var $10 = HEAP[$1];
        var $11 = $10+4;
        var $12 = HEAP[$11];
        __lastLabel__ = 2; __label__ = 3; break;
      case 1: // $13
        __lastLabel__ = 1; __label__ = 3; break;
      case 3: // $14
        var $15 = __lastLabel__ == 2 ? $12 : (__str4);
        STACKTOP = __stackBase__;
        return $15;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_to_string.__index__ = Runtime.getFunctionIndex(_lil_to_string, "_lil_to_string");
  
  
  function _lil_alloc_env($parent) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    var $env = __stackBase__+4;
    HEAP[$1] = $parent;;
    var $2 = _calloc(1, 28);
    var $3 = $2;
    HEAP[$env] = $3;;
    var $4 = HEAP[$1];
    var $5 = HEAP[$env];
    var $6 = $5;
    HEAP[$6] = $4;;
    var $7 = HEAP[$env];
    STACKTOP = __stackBase__;
    return $7;
  }
  _lil_alloc_env.__index__ = Runtime.getFunctionIndex(_lil_alloc_env, "_lil_alloc_env");
  
  
  function _lil_free_env($env) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $i = __stackBase__+4;
        HEAP[$1] = $env;;
        var $2 = HEAP[$1];
        var $3 = $2 != 0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $4
        __label__ = 2; break;
      case 0: // $5
        var $6 = HEAP[$1];
        var $7 = $6+20;
        var $8 = HEAP[$7];
        _lil_free_value($8);
        HEAP[$i] = 0;;
        __label__ = 3; break;
      case 3: // $9
        var $10 = HEAP[$i];
        var $11 = HEAP[$1];
        var $12 = $11+16;
        var $13 = HEAP[$12];
        var $14 = unSign($10, 32) < unSign($13, 32);
        if ($14) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $15
        var $16 = HEAP[$i];
        var $17 = HEAP[$1];
        var $18 = $17+12;
        var $19 = HEAP[$18];
        var $20 = $19+4*$16;
        var $21 = HEAP[$20];
        var $22 = $21;
        var $23 = HEAP[$22];
        _free($23);
        var $24 = HEAP[$i];
        var $25 = HEAP[$1];
        var $26 = $25+12;
        var $27 = HEAP[$26];
        var $28 = $27+4*$24;
        var $29 = HEAP[$28];
        var $30 = $29+8;
        var $31 = HEAP[$30];
        _lil_free_value($31);
        var $32 = HEAP[$i];
        var $33 = HEAP[$1];
        var $34 = $33+12;
        var $35 = HEAP[$34];
        var $36 = $35+4*$32;
        var $37 = HEAP[$36];
        var $38 = $37;
        _free($38);
        __label__ = 6; break;
      case 6: // $39
        var $40 = HEAP[$i];
        var $41 = ($40 + 1)&4294967295;
        HEAP[$i] = $41;;
        __label__ = 3; break;
      case 5: // $42
        var $43 = HEAP[$1];
        var $44 = $43+12;
        var $45 = HEAP[$44];
        var $46 = $45;
        _free($46);
        var $47 = HEAP[$1];
        var $48 = $47;
        _free($48);
        __label__ = 2; break;
      case 2: // $49
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_free_env.__index__ = Runtime.getFunctionIndex(_lil_free_env, "_lil_free_env");
  
  
  function _lil_register($lil, $name, $proc) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $cmd = __stackBase__+16;
        HEAP[$2] = $lil;;
        HEAP[$3] = $name;;
        HEAP[$4] = $proc;;
        var $5 = HEAP[$2];
        var $6 = HEAP[$3];
        var $7 = _add_func($5, $6);
        HEAP[$cmd] = $7;;
        var $8 = HEAP[$cmd];
        var $9 = $8 != 0;
        if ($9) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $10
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $11
        var $12 = HEAP[$4];
        var $13 = HEAP[$cmd];
        var $14 = $13+12;
        HEAP[$14] = $12;;
        HEAP[$1] = 1;;
        __label__ = 2; break;
      case 2: // $15
        var $16 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $16;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_register.__index__ = Runtime.getFunctionIndex(_lil_register, "_lil_register");
  
  
  function _add_func($lil, $name) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $cmd = __stackBase__+12;
        var $ncmd = __stackBase__+16;
        HEAP[$2] = $lil;;
        HEAP[$3] = $name;;
        var $4 = HEAP[$2];
        var $5 = HEAP[$3];
        var $6 = _find_cmd($4, $5);
        HEAP[$cmd] = $6;;
        var $7 = HEAP[$cmd];
        var $8 = $7 != 0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10 = HEAP[$cmd];
        HEAP[$1] = $10;;
        __label__ = 2; break;
      case 1: // $11
        var $12 = _calloc(1, 16);
        var $13 = $12;
        HEAP[$cmd] = $13;;
        var $14 = HEAP[$3];
        var $15 = _strclone($14);
        var $16 = HEAP[$cmd];
        var $17 = $16;
        HEAP[$17] = $15;;
        var $18 = HEAP[$2];
        var $19 = $18+16;
        var $20 = HEAP[$19];
        var $21 = $20;
        var $22 = HEAP[$2];
        var $23 = $22+20;
        var $24 = HEAP[$23];
        var $25 = ($24 + 1)&4294967295;
        var $26 = (4 * $25)&4294967295;
        var $27 = _realloc($21, $26);
        var $28 = $27;
        HEAP[$ncmd] = $28;;
        var $29 = HEAP[$ncmd];
        var $30 = $29 != 0;
        if ($30) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $31
        var $32 = HEAP[$cmd];
        var $33 = $32;
        _free($33);
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 3: // $34
        var $35 = HEAP[$ncmd];
        var $36 = HEAP[$2];
        var $37 = $36+16;
        HEAP[$37] = $35;;
        var $38 = HEAP[$cmd];
        var $39 = HEAP[$2];
        var $40 = $39+20;
        var $41 = HEAP[$40];
        var $42 = ($41 + 1)&4294967295;
        HEAP[$40] = $42;;
        var $43 = HEAP[$ncmd];
        var $44 = $43+4*$41;
        HEAP[$44] = $38;;
        var $45 = HEAP[$cmd];
        HEAP[$1] = $45;;
        __label__ = 2; break;
      case 2: // $46
        var $47 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $47;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _add_func.__index__ = Runtime.getFunctionIndex(_add_func, "_add_func");
  
  
  function _lil_set_var($lil, $name, $val, $local) {
    var __stackBase__  = STACKTOP; STACKTOP += 48; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $5 = __stackBase__+16;
        var $nvar = __stackBase__+20;
        var $env = __stackBase__+24;
        var $freeval = __stackBase__+28;
        var $var = __stackBase__+32;
        var $proc = __stackBase__+36;
        var $newval = __stackBase__+40;
        var $r = __stackBase__+44;
        HEAP[$2] = $lil;;
        HEAP[$3] = $name;;
        HEAP[$4] = $val;;
        HEAP[$5] = $local;;
        var $6 = HEAP[$5];
        var $7 = $6 == 0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9 = HEAP[$2];
        var $10 = $9+44;
        var $11 = HEAP[$10];
        __lastLabel__ = 0; __label__ = 2; break;
      case 1: // $12
        var $13 = HEAP[$2];
        var $14 = $13+40;
        var $15 = HEAP[$14];
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $16
        var $17 = __lastLabel__ == 0 ? $11 : ($15);
        HEAP[$env] = $17;;
        HEAP[$freeval] = 0;;
        var $18 = HEAP[$3];
        var $19 = $18;
        var $20 = HEAP[$19];
        var $21 = $20 != 0;
        if ($21) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $22
        HEAP[$1] = 0;;
        __label__ = 5; break;
      case 3: // $23
        var $24 = HEAP[$5];
        var $25 = $24 != 2;
        if ($25) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $26
        var $27 = HEAP[$2];
        var $28 = HEAP[$2];
        var $29 = $28+40;
        var $30 = HEAP[$29];
        var $31 = HEAP[$3];
        var $32 = _lil_find_var($27, $30, $31);
        HEAP[$var] = $32;;
        var $33 = HEAP[$var];
        var $34 = $33 != 0;
        if ($34) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 9: // $35
        var $36 = HEAP[$env];
        var $37 = HEAP[$2];
        var $38 = $37+44;
        var $39 = HEAP[$38];
        var $40 = $36 == $39;
        if ($40) { __label__ = 10; break; } else { __label__ = 8; break; }
      case 8: // $41
        var $42 = HEAP[$var];
        var $43 = $42 != 0;
        if ($43) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $44
        var $45 = HEAP[$var];
        var $46 = $45+4;
        var $47 = HEAP[$46];
        var $48 = HEAP[$2];
        var $49 = $48+44;
        var $50 = HEAP[$49];
        var $51 = $47 == $50;
        if ($51) { __label__ = 10; break; } else { __label__ = 12; break; }
      case 10: // $52
        var $53 = HEAP[$2];
        var $54 = $53+68;
        var $55 = $54+24;
        var $56 = HEAP[$55];
        var $57 = $56 != 0;
        if ($57) { __label__ = 13; break; } else { __label__ = 12; break; }
      case 13: // $58
        var $59 = HEAP[$2];
        var $60 = $59+68;
        var $61 = $60+24;
        var $62 = HEAP[$61];
        var $63 = $62;
        HEAP[$proc] = $63;;
        var $64 = HEAP[$4];
        HEAP[$newval] = $64;;
        var $65 = HEAP[$proc];
        var $66 = HEAP[$2];
        var $67 = HEAP[$3];
        var $68 = FUNCTION_TABLE[$65]($66, $67, $newval);
        HEAP[$r] = $68;;
        var $69 = HEAP[$r];
        var $70 = $69 < 0;
        if ($70) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $71
        HEAP[$1] = 0;;
        __label__ = 5; break;
      case 15: // $72
        var $73 = HEAP[$r];
        var $74 = $73 != 0;
        if ($74) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $75
        var $76 = HEAP[$newval];
        HEAP[$4] = $76;;
        HEAP[$freeval] = 1;;
        __label__ = 17; break;
      case 17: // $77
        __label__ = 12; break;
      case 12: // $78
        var $79 = HEAP[$var];
        var $80 = $79 != 0;
        if ($80) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $81
        var $82 = HEAP[$var];
        var $83 = $82+8;
        var $84 = HEAP[$83];
        _lil_free_value($84);
        var $85 = HEAP[$freeval];
        var $86 = $85 != 0;
        if ($86) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $87
        var $88 = HEAP[$4];
        __lastLabel__ = 20; __label__ = 22; break;
      case 21: // $89
        var $90 = HEAP[$4];
        var $91 = _lil_clone_value($90);
        __lastLabel__ = 21; __label__ = 22; break;
      case 22: // $92
        var $93 = __lastLabel__ == 20 ? $88 : ($91);
        var $94 = HEAP[$var];
        var $95 = $94+8;
        HEAP[$95] = $93;;
        var $96 = HEAP[$var];
        HEAP[$1] = $96;;
        __label__ = 5; break;
      case 19: // $97
        __label__ = 7; break;
      case 7: // $98
        var $99 = HEAP[$env];
        var $100 = $99+12;
        var $101 = HEAP[$100];
        var $102 = $101;
        var $103 = HEAP[$env];
        var $104 = $103+16;
        var $105 = HEAP[$104];
        var $106 = ($105 + 1)&4294967295;
        var $107 = (4 * $106)&4294967295;
        var $108 = _realloc($102, $107);
        var $109 = $108;
        HEAP[$nvar] = $109;;
        var $110 = HEAP[$nvar];
        var $111 = $110 != 0;
        if ($111) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 24: // $112
        HEAP[$1] = 0;;
        __label__ = 5; break;
      case 23: // $113
        var $114 = HEAP[$nvar];
        var $115 = HEAP[$env];
        var $116 = $115+12;
        HEAP[$116] = $114;;
        var $117 = _calloc(1, 12);
        var $118 = $117;
        var $119 = HEAP[$env];
        var $120 = $119+16;
        var $121 = HEAP[$120];
        var $122 = HEAP[$nvar];
        var $123 = $122+4*$121;
        HEAP[$123] = $118;;
        var $124 = HEAP[$3];
        var $125 = _strclone($124);
        var $126 = HEAP[$env];
        var $127 = $126+16;
        var $128 = HEAP[$127];
        var $129 = HEAP[$nvar];
        var $130 = $129+4*$128;
        var $131 = HEAP[$130];
        var $132 = $131;
        HEAP[$132] = $125;;
        var $133 = HEAP[$env];
        var $134 = HEAP[$env];
        var $135 = $134+16;
        var $136 = HEAP[$135];
        var $137 = HEAP[$nvar];
        var $138 = $137+4*$136;
        var $139 = HEAP[$138];
        var $140 = $139+4;
        HEAP[$140] = $133;;
        var $141 = HEAP[$freeval];
        var $142 = $141 != 0;
        if ($142) { __label__ = 25; break; } else { __label__ = 26; break; }
      case 25: // $143
        var $144 = HEAP[$4];
        __lastLabel__ = 25; __label__ = 27; break;
      case 26: // $145
        var $146 = HEAP[$4];
        var $147 = _lil_clone_value($146);
        __lastLabel__ = 26; __label__ = 27; break;
      case 27: // $148
        var $149 = __lastLabel__ == 25 ? $144 : ($147);
        var $150 = HEAP[$env];
        var $151 = $150+16;
        var $152 = HEAP[$151];
        var $153 = HEAP[$nvar];
        var $154 = $153+4*$152;
        var $155 = HEAP[$154];
        var $156 = $155+8;
        HEAP[$156] = $149;;
        var $157 = HEAP[$env];
        var $158 = $157+16;
        var $159 = HEAP[$158];
        var $160 = ($159 + 1)&4294967295;
        HEAP[$158] = $160;;
        var $161 = HEAP[$nvar];
        var $162 = $161+4*$159;
        var $163 = HEAP[$162];
        HEAP[$1] = $163;;
        __label__ = 5; break;
      case 5: // $164
        var $165 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $165;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_set_var.__index__ = Runtime.getFunctionIndex(_lil_set_var, "_lil_set_var");
  
  
  function _lil_find_var($lil, $env, $name) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $i = __stackBase__+16;
        HEAP[$2] = $lil;;
        HEAP[$3] = $env;;
        HEAP[$4] = $name;;
        var $5 = HEAP[$3];
        var $6 = $5+16;
        var $7 = HEAP[$6];
        var $8 = unSign($7, 32) > unSign(0, 32);
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10 = HEAP[$3];
        var $11 = $10+16;
        var $12 = HEAP[$11];
        var $13 = ($12 - 1)&4294967295;
        HEAP[$i] = $13;;
        __label__ = 2; break;
      case 2: // $14
        var $15 = HEAP[$i];
        var $16 = HEAP[$3];
        var $17 = $16+12;
        var $18 = HEAP[$17];
        var $19 = $18+4*$15;
        var $20 = HEAP[$19];
        var $21 = $20;
        var $22 = HEAP[$21];
        var $23 = HEAP[$4];
        var $24 = _strcmp($22, $23);
        var $25 = $24 != 0;
        if ($25) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $26
        var $27 = HEAP[$i];
        var $28 = HEAP[$3];
        var $29 = $28+12;
        var $30 = HEAP[$29];
        var $31 = $30+4*$27;
        var $32 = HEAP[$31];
        HEAP[$1] = $32;;
        __label__ = 5; break;
      case 3: // $33
        var $34 = HEAP[$i];
        var $35 = $34 != 0;
        if ($35) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 7: // $36
        __label__ = 8; break;
      case 6: // $37
        var $38 = HEAP[$i];
        var $39 = ($38 + -1)&4294967295;
        HEAP[$i] = $39;;
        __label__ = 2; break;
      case 8: // $40
        __label__ = 1; break;
      case 1: // $41
        var $42 = HEAP[$3];
        var $43 = HEAP[$2];
        var $44 = $43+44;
        var $45 = HEAP[$44];
        var $46 = $42 == $45;
        if ($46) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $47
        __lastLabel__ = 9; __label__ = 11; break;
      case 10: // $48
        var $49 = HEAP[$2];
        var $50 = HEAP[$2];
        var $51 = $50+44;
        var $52 = HEAP[$51];
        var $53 = HEAP[$4];
        var $54 = _lil_find_var($49, $52, $53);
        __lastLabel__ = 10; __label__ = 11; break;
      case 11: // $55
        var $56 = __lastLabel__ == 9 ? 0 : ($54);
        HEAP[$1] = $56;;
        __label__ = 5; break;
      case 5: // $57
        var $58 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $58;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_find_var.__index__ = Runtime.getFunctionIndex(_lil_find_var, "_lil_find_var");
  
  
  function _strclone($s) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $len = __stackBase__+8;
        var $ns = __stackBase__+12;
        HEAP[$2] = $s;;
        var $3 = HEAP[$2];
        var $4 = _strlen($3);
        var $5 = ($4 + 1)&4294967295;
        HEAP[$len] = $5;;
        var $6 = HEAP[$len];
        var $7 = _malloc($6);
        HEAP[$ns] = $7;;
        var $8 = HEAP[$ns];
        var $9 = $8 != 0;
        if ($9) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $10
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $11
        var $12 = HEAP[$ns];
        var $13 = HEAP[$2];
        var $14 = HEAP[$len];
        _llvm_memcpy_p0i8_p0i8_i32($12, $13, $14, 1, 0);
        var $15 = HEAP[$ns];
        HEAP[$1] = $15;;
        __label__ = 2; break;
      case 2: // $16
        var $17 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $17;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _strclone.__index__ = Runtime.getFunctionIndex(_strclone, "_strclone");
  
  
  function _lil_get_var($lil, $name) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    var $2 = __stackBase__+4;
    HEAP[$1] = $lil;;
    HEAP[$2] = $name;;
    var $3 = HEAP[$1];
    var $4 = HEAP[$2];
    var $5 = HEAP[$1];
    var $6 = $5+52;
    var $7 = HEAP[$6];
    var $8 = _lil_get_var_or($3, $4, $7);
    STACKTOP = __stackBase__;
    return $8;
  }
  _lil_get_var.__index__ = Runtime.getFunctionIndex(_lil_get_var, "_lil_get_var");
  
  
  function _lil_get_var_or($lil, $name, $defvalue) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $var = __stackBase__+12;
        var $retval = __stackBase__+16;
        var $proc = __stackBase__+20;
        var $newretval = __stackBase__+24;
        HEAP[$1] = $lil;;
        HEAP[$2] = $name;;
        HEAP[$3] = $defvalue;;
        var $4 = HEAP[$1];
        var $5 = HEAP[$1];
        var $6 = $5+40;
        var $7 = HEAP[$6];
        var $8 = HEAP[$2];
        var $9 = _lil_find_var($4, $7, $8);
        HEAP[$var] = $9;;
        var $10 = HEAP[$var];
        var $11 = $10 != 0;
        if ($11) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $12
        var $13 = HEAP[$var];
        var $14 = $13+8;
        var $15 = HEAP[$14];
        __lastLabel__ = 0; __label__ = 2; break;
      case 1: // $16
        var $17 = HEAP[$3];
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $18
        var $19 = __lastLabel__ == 0 ? $15 : ($17);
        HEAP[$retval] = $19;;
        var $20 = HEAP[$1];
        var $21 = $20+68;
        var $22 = $21+28;
        var $23 = HEAP[$22];
        var $24 = $23 != 0;
        if ($24) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $25
        var $26 = HEAP[$var];
        var $27 = $26 != 0;
        if ($27) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $28
        var $29 = HEAP[$var];
        var $30 = $29+4;
        var $31 = HEAP[$30];
        var $32 = HEAP[$1];
        var $33 = $32+44;
        var $34 = HEAP[$33];
        var $35 = $31 == $34;
        if ($35) { __label__ = 6; break; } else { __label__ = 4; break; }
      case 6: // $36
        var $37 = HEAP[$1];
        var $38 = $37+68;
        var $39 = $38+28;
        var $40 = HEAP[$39];
        var $41 = $40;
        HEAP[$proc] = $41;;
        var $42 = HEAP[$retval];
        HEAP[$newretval] = $42;;
        var $43 = HEAP[$proc];
        var $44 = HEAP[$1];
        var $45 = HEAP[$2];
        var $46 = FUNCTION_TABLE[$43]($44, $45, $newretval);
        var $47 = $46 != 0;
        if ($47) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $48
        var $49 = HEAP[$newretval];
        HEAP[$retval] = $49;;
        __label__ = 8; break;
      case 8: // $50
        __label__ = 4; break;
      case 4: // $51
        var $52 = HEAP[$retval];
        STACKTOP = __stackBase__;
        return $52;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_get_var_or.__index__ = Runtime.getFunctionIndex(_lil_get_var_or, "_lil_get_var_or");
  
  
  function _lil_push_env($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    var $env = __stackBase__+4;
    HEAP[$1] = $lil;;
    var $2 = HEAP[$1];
    var $3 = $2+40;
    var $4 = HEAP[$3];
    var $5 = _lil_alloc_env($4);
    HEAP[$env] = $5;;
    var $6 = HEAP[$env];
    var $7 = HEAP[$1];
    var $8 = $7+40;
    HEAP[$8] = $6;;
    var $9 = HEAP[$env];
    STACKTOP = __stackBase__;
    return $9;
  }
  _lil_push_env.__index__ = Runtime.getFunctionIndex(_lil_push_env, "_lil_push_env");
  
  
  function _lil_pop_env($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $next = __stackBase__+4;
        HEAP[$1] = $lil;;
        var $2 = HEAP[$1];
        var $3 = $2+40;
        var $4 = HEAP[$3];
        var $5 = $4;
        var $6 = HEAP[$5];
        var $7 = $6 != 0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9 = HEAP[$1];
        var $10 = $9+40;
        var $11 = HEAP[$10];
        var $12 = $11;
        var $13 = HEAP[$12];
        HEAP[$next] = $13;;
        var $14 = HEAP[$1];
        var $15 = $14+40;
        var $16 = HEAP[$15];
        _lil_free_env($16);
        var $17 = HEAP[$next];
        var $18 = HEAP[$1];
        var $19 = $18+40;
        HEAP[$19] = $17;;
        __label__ = 1; break;
      case 1: // $20
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_pop_env.__index__ = Runtime.getFunctionIndex(_lil_pop_env, "_lil_pop_env");
  
  
  function _lil_new() {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $lil = __stackBase__;
    var $1 = _calloc(1, 108);
    var $2 = $1;
    HEAP[$lil] = $2;;
    var $3 = _lil_alloc_env(0);
    var $4 = HEAP[$lil];
    var $5 = $4+40;
    HEAP[$5] = $3;;
    var $6 = HEAP[$lil];
    var $7 = $6+44;
    HEAP[$7] = $3;;
    var $8 = _alloc_value(0);
    var $9 = HEAP[$lil];
    var $10 = $9+52;
    HEAP[$10] = $8;;
    var $11 = _strclone(__str);
    var $12 = HEAP[$lil];
    var $13 = $12+36;
    HEAP[$13] = $11;;
    var $14 = HEAP[$lil];
    _register_stdcmds($14);
    var $15 = HEAP[$lil];
    STACKTOP = __stackBase__;
    return $15;
  }
  _lil_new.__index__ = Runtime.getFunctionIndex(_lil_new, "_lil_new");
  
  
  function _register_stdcmds($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    HEAP[$1] = $lil;;
    var $2 = HEAP[$1];
    var $3 = _lil_register($2, __str11, _fnc_reflect.__index__);
    var $4 = HEAP[$1];
    var $5 = _lil_register($4, __str12, _fnc_func.__index__);
    var $6 = HEAP[$1];
    var $7 = _lil_register($6, __str13, _fnc_rename.__index__);
    var $8 = HEAP[$1];
    var $9 = _lil_register($8, __str14, _fnc_unusedname.__index__);
    var $10 = HEAP[$1];
    var $11 = _lil_register($10, __str15, _fnc_quote.__index__);
    var $12 = HEAP[$1];
    var $13 = _lil_register($12, __str16, _fnc_set.__index__);
    var $14 = HEAP[$1];
    var $15 = _lil_register($14, __str17, _fnc_write.__index__);
    var $16 = HEAP[$1];
    var $17 = _lil_register($16, __str18, _fnc_print.__index__);
    var $18 = HEAP[$1];
    var $19 = _lil_register($18, __str19, _fnc_eval.__index__);
    var $20 = HEAP[$1];
    var $21 = _lil_register($20, __str20, _fnc_upeval.__index__);
    var $22 = HEAP[$1];
    var $23 = _lil_register($22, __str21, _fnc_downeval.__index__);
    var $24 = HEAP[$1];
    var $25 = _lil_register($24, __str22, _fnc_jaileval.__index__);
    var $26 = HEAP[$1];
    var $27 = _lil_register($26, __str23, _fnc_count.__index__);
    var $28 = HEAP[$1];
    var $29 = _lil_register($28, __str24, _fnc_index.__index__);
    var $30 = HEAP[$1];
    var $31 = _lil_register($30, __str25, _fnc_indexof.__index__);
    var $32 = HEAP[$1];
    var $33 = _lil_register($32, __str26, _fnc_filter.__index__);
    var $34 = HEAP[$1];
    var $35 = _lil_register($34, __str27, _fnc_list.__index__);
    var $36 = HEAP[$1];
    var $37 = _lil_register($36, __str28, _fnc_append.__index__);
    var $38 = HEAP[$1];
    var $39 = _lil_register($38, __str29, _fnc_slice.__index__);
    var $40 = HEAP[$1];
    var $41 = _lil_register($40, __str30, _fnc_subst.__index__);
    var $42 = HEAP[$1];
    var $43 = _lil_register($42, __str31, _fnc_concat.__index__);
    var $44 = HEAP[$1];
    var $45 = _lil_register($44, __str32, _fnc_foreach.__index__);
    var $46 = HEAP[$1];
    var $47 = _lil_register($46, __str33, _fnc_return.__index__);
    var $48 = HEAP[$1];
    var $49 = _lil_register($48, __str34, _fnc_expr.__index__);
    var $50 = HEAP[$1];
    var $51 = _lil_register($50, __str35, _fnc_inc.__index__);
    var $52 = HEAP[$1];
    var $53 = _lil_register($52, __str36, _fnc_dec.__index__);
    var $54 = HEAP[$1];
    var $55 = _lil_register($54, __str37, _fnc_read.__index__);
    var $56 = HEAP[$1];
    var $57 = _lil_register($56, __str38, _fnc_store.__index__);
    var $58 = HEAP[$1];
    var $59 = _lil_register($58, __str39, _fnc_if.__index__);
    var $60 = HEAP[$1];
    var $61 = _lil_register($60, __str40, _fnc_while.__index__);
    var $62 = HEAP[$1];
    var $63 = _lil_register($62, __str41, _fnc_for.__index__);
    var $64 = HEAP[$1];
    var $65 = _lil_register($64, __str42, _fnc_char.__index__);
    var $66 = HEAP[$1];
    var $67 = _lil_register($66, __str43, _fnc_charat.__index__);
    var $68 = HEAP[$1];
    var $69 = _lil_register($68, __str44, _fnc_codeat.__index__);
    var $70 = HEAP[$1];
    var $71 = _lil_register($70, __str45, _fnc_substr.__index__);
    var $72 = HEAP[$1];
    var $73 = _lil_register($72, __str46, _fnc_strpos.__index__);
    var $74 = HEAP[$1];
    var $75 = _lil_register($74, __str47, _fnc_length.__index__);
    var $76 = HEAP[$1];
    var $77 = _lil_register($76, __str48, _fnc_trim.__index__);
    var $78 = HEAP[$1];
    var $79 = _lil_register($78, __str49, _fnc_ltrim.__index__);
    var $80 = HEAP[$1];
    var $81 = _lil_register($80, __str50, _fnc_rtrim.__index__);
    var $82 = HEAP[$1];
    var $83 = _lil_register($82, __str51, _fnc_strcmp.__index__);
    var $84 = HEAP[$1];
    var $85 = _lil_register($84, __str52, _fnc_streq.__index__);
    var $86 = HEAP[$1];
    var $87 = _lil_register($86, __str53, _fnc_repstr.__index__);
    var $88 = HEAP[$1];
    var $89 = _lil_register($88, __str54, _fnc_split.__index__);
    var $90 = HEAP[$1];
    var $91 = _lil_register($90, __str55, _fnc_try.__index__);
    var $92 = HEAP[$1];
    var $93 = _lil_register($92, __str56, _fnc_error.__index__);
    var $94 = HEAP[$1];
    var $95 = _lil_register($94, __str57, _fnc_exit.__index__);
    var $96 = HEAP[$1];
    var $97 = _lil_register($96, __str58, _fnc_source.__index__);
    var $98 = HEAP[$1];
    var $99 = _lil_register($98, __str59, _fnc_lmap.__index__);
    var $100 = HEAP[$1];
    var $101 = _lil_register($100, __str60, _fnc_rand.__index__);
    var $102 = HEAP[$1];
    var $103 = _lil_register($102, __str61, _fnc_catcher.__index__);
    var $104 = HEAP[$1];
    var $105 = $104+20;
    var $106 = HEAP[$105];
    var $107 = HEAP[$1];
    var $108 = $107+24;
    HEAP[$108] = $106;;
    STACKTOP = __stackBase__;
    return;
  }
  _register_stdcmds.__index__ = Runtime.getFunctionIndex(_register_stdcmds, "_register_stdcmds");
  
  
  function _lil_subst_to_list($lil, $code) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    var $2 = __stackBase__+4;
    var $save_code = __stackBase__+8;
    var $save_clen = __stackBase__+12;
    var $save_head = __stackBase__+16;
    var $words = __stackBase__+20;
    HEAP[$1] = $lil;;
    HEAP[$2] = $code;;
    var $3 = HEAP[$1];
    var $4 = $3;
    var $5 = HEAP[$4];
    HEAP[$save_code] = $5;;
    var $6 = HEAP[$1];
    var $7 = $6+8;
    var $8 = HEAP[$7];
    HEAP[$save_clen] = $8;;
    var $9 = HEAP[$1];
    var $10 = $9+12;
    var $11 = HEAP[$10];
    HEAP[$save_head] = $11;;
    var $12 = HEAP[$2];
    var $13 = _lil_to_string($12);
    var $14 = HEAP[$1];
    var $15 = $14;
    HEAP[$15] = $13;;
    var $16 = HEAP[$2];
    var $17 = $16;
    var $18 = HEAP[$17];
    var $19 = HEAP[$1];
    var $20 = $19+8;
    HEAP[$20] = $18;;
    var $21 = HEAP[$1];
    var $22 = $21+12;
    HEAP[$22] = 0;;
    var $23 = HEAP[$1];
    var $24 = _substitute($23);
    HEAP[$words] = $24;;
    var $25 = HEAP[$save_code];
    var $26 = HEAP[$1];
    var $27 = $26;
    HEAP[$27] = $25;;
    var $28 = HEAP[$save_clen];
    var $29 = HEAP[$1];
    var $30 = $29+8;
    HEAP[$30] = $28;;
    var $31 = HEAP[$save_head];
    var $32 = HEAP[$1];
    var $33 = $32+12;
    HEAP[$33] = $31;;
    var $34 = HEAP[$words];
    STACKTOP = __stackBase__;
    return $34;
  }
  _lil_subst_to_list.__index__ = Runtime.getFunctionIndex(_lil_subst_to_list, "_lil_subst_to_list");
  
  
  function _substitute($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $words = __stackBase__+8;
        var $w = __stackBase__+12;
        var $head = __stackBase__+16;
        var $wp = __stackBase__+20;
        HEAP[$2] = $lil;;
        var $3 = _lil_alloc_list();
        HEAP[$words] = $3;;
        var $4 = HEAP[$2];
        _skip_spaces($4);
        __label__ = 0; break;
      case 0: // $5
        var $6 = HEAP[$2];
        var $7 = $6+12;
        var $8 = HEAP[$7];
        var $9 = HEAP[$2];
        var $10 = $9+8;
        var $11 = HEAP[$10];
        var $12 = unSign($8, 32) < unSign($11, 32);
        if ($12) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $13
        var $14 = HEAP[$2];
        var $15 = _ateol($14);
        var $16 = $15 != 0;
        if ($16) { __lastLabel__ = 1; __label__ = 2; break; } else { __lastLabel__ = 1; __label__ = 3; break; }
      case 3: // $17
        var $18 = HEAP[$2];
        var $19 = $18+56;
        var $20 = HEAP[$19];
        var $21 = $20 != 0;
        var $22 = $21 ^ 1;
        __lastLabel__ = 3; __label__ = 2; break;
      case 2: // $23
        var $24 = __lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($22));
        if ($24) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $25
        var $26 = _alloc_value(0);
        HEAP[$w] = $26;;
        __label__ = 6; break;
      case 6: // $27
        var $28 = HEAP[$2];
        var $29 = $28+12;
        var $30 = HEAP[$29];
        HEAP[$head] = $30;;
        var $31 = HEAP[$2];
        var $32 = _next_word($31);
        HEAP[$wp] = $32;;
        var $33 = HEAP[$head];
        var $34 = HEAP[$2];
        var $35 = $34+12;
        var $36 = HEAP[$35];
        var $37 = $33 == $36;
        if ($37) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $38
        var $39 = HEAP[$w];
        _lil_free_value($39);
        var $40 = HEAP[$wp];
        _lil_free_value($40);
        var $41 = HEAP[$words];
        _lil_free_list($41);
        HEAP[$1] = 0;;
        __label__ = 9; break;
      case 8: // $42
        var $43 = HEAP[$w];
        var $44 = HEAP[$wp];
        var $45 = _lil_append_val($43, $44);
        var $46 = HEAP[$wp];
        _lil_free_value($46);
        __label__ = 10; break;
      case 10: // $47
        var $48 = HEAP[$2];
        var $49 = $48+12;
        var $50 = HEAP[$49];
        var $51 = HEAP[$2];
        var $52 = $51+8;
        var $53 = HEAP[$52];
        var $54 = unSign($50, 32) < unSign($53, 32);
        if ($54) { __lastLabel__ = 10; __label__ = 11; break; } else { __lastLabel__ = 10; __label__ = 12; break; }
      case 11: // $55
        var $56 = HEAP[$2];
        var $57 = _ateol($56);
        var $58 = $57 != 0;
        if ($58) { __lastLabel__ = 11; __label__ = 12; break; } else { __lastLabel__ = 11; __label__ = 13; break; }
      case 13: // $59
        var $60 = HEAP[$2];
        var $61 = $60+12;
        var $62 = HEAP[$61];
        var $63 = HEAP[$2];
        var $64 = $63;
        var $65 = HEAP[$64];
        var $66 = $65+$62;
        var $67 = HEAP[$66];
        var $68 = $67;
        var $69 = ___ctype_b_loc();
        var $70 = HEAP[$69];
        var $71 = $70+2*$68;
        var $72 = HEAP[$71];
        var $73 = $72;
        var $74 = $73 & 8192;
        var $75 = $74 != 0;
        if ($75) { __lastLabel__ = 13; __label__ = 12; break; } else { __lastLabel__ = 13; __label__ = 14; break; }
      case 14: // $76
        var $77 = HEAP[$2];
        var $78 = $77+56;
        var $79 = HEAP[$78];
        var $80 = $79 != 0;
        var $81 = $80 ^ 1;
        __lastLabel__ = 14; __label__ = 12; break;
      case 12: // $82
        var $83 = __lastLabel__ == 13 ? 0 : (__lastLabel__ == 11 ? 0 : (__lastLabel__ == 10 ? 0 : ($81)));
        if ($83) { __label__ = 6; break; } else { __label__ = 15; break; }
      case 15: // $84
        var $85 = HEAP[$2];
        _skip_spaces($85);
        var $86 = HEAP[$words];
        var $87 = HEAP[$w];
        _lil_list_append($86, $87);
        __label__ = 0; break;
      case 5: // $88
        var $89 = HEAP[$words];
        HEAP[$1] = $89;;
        __label__ = 9; break;
      case 9: // $90
        var $91 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $91;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _substitute.__index__ = Runtime.getFunctionIndex(_substitute, "_substitute");
  
  
  function _lil_subst_to_value($lil, $code) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $words = __stackBase__+12;
        var $val = __stackBase__+16;
        HEAP[$2] = $lil;;
        HEAP[$3] = $code;;
        var $4 = HEAP[$2];
        var $5 = HEAP[$3];
        var $6 = _lil_subst_to_list($4, $5);
        HEAP[$words] = $6;;
        var $7 = HEAP[$words];
        var $8 = $7 != 0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $9
        var $10 = HEAP[$3];
        var $11 = _lil_clone_value($10);
        HEAP[$1] = $11;;
        __label__ = 2; break;
      case 0: // $12
        var $13 = HEAP[$words];
        var $14 = _lil_list_to_value($13, 0);
        HEAP[$val] = $14;;
        var $15 = HEAP[$words];
        _lil_free_list($15);
        var $16 = HEAP[$val];
        HEAP[$1] = $16;;
        __label__ = 2; break;
      case 2: // $17
        var $18 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $18;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_subst_to_value.__index__ = Runtime.getFunctionIndex(_lil_subst_to_value, "_lil_subst_to_value");
  
  
  function _lil_parse($lil, $code, $codelen, $funclevel) {
    var __stackBase__  = STACKTOP; STACKTOP += 68; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $save_code = __stackBase__+16;
        var $save_clen = __stackBase__+20;
        var $save_head = __stackBase__+24;
        var $val = __stackBase__+28;
        var $words = __stackBase__+32;
        var $cmd = __stackBase__+36;
        var $args = __stackBase__+40;
        var $msg = __stackBase__+44;
        var $msg1 = __stackBase__+48;
        var $shead = __stackBase__+52;
        var $args2 = __stackBase__+56;
        var $i = __stackBase__+60;
        var $proc = __stackBase__+64;
        HEAP[$1] = $lil;;
        HEAP[$2] = $code;;
        HEAP[$3] = $codelen;;
        HEAP[$4] = $funclevel;;
        var $5 = HEAP[$1];
        var $6 = $5;
        var $7 = HEAP[$6];
        HEAP[$save_code] = $7;;
        var $8 = HEAP[$1];
        var $9 = $8+8;
        var $10 = HEAP[$9];
        HEAP[$save_clen] = $10;;
        var $11 = HEAP[$1];
        var $12 = $11+12;
        var $13 = HEAP[$12];
        HEAP[$save_head] = $13;;
        HEAP[$val] = 0;;
        HEAP[$words] = 0;;
        var $14 = HEAP[$save_code];
        var $15 = $14 != 0;
        if ($15) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $16
        var $17 = HEAP[$2];
        var $18 = HEAP[$1];
        var $19 = $18+4;
        HEAP[$19] = $17;;
        __label__ = 0; break;
      case 0: // $20
        var $21 = HEAP[$2];
        var $22 = HEAP[$1];
        var $23 = $22;
        HEAP[$23] = $21;;
        var $24 = HEAP[$3];
        var $25 = $24 != 0;
        if ($25) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $26
        var $27 = HEAP[$3];
        __lastLabel__ = 2; __label__ = 4; break;
      case 3: // $28
        var $29 = HEAP[$2];
        var $30 = _strlen($29);
        __lastLabel__ = 3; __label__ = 4; break;
      case 4: // $31
        var $32 = __lastLabel__ == 2 ? $27 : ($30);
        var $33 = HEAP[$1];
        var $34 = $33+8;
        HEAP[$34] = $32;;
        var $35 = HEAP[$1];
        var $36 = $35+12;
        HEAP[$36] = 0;;
        var $37 = HEAP[$1];
        _skip_spaces($37);
        var $38 = HEAP[$1];
        var $39 = $38+100;
        var $40 = HEAP[$39];
        var $41 = ($40 + 1)&4294967295;
        HEAP[$39] = $41;;
        var $42 = HEAP[$1];
        var $43 = $42+100;
        var $44 = HEAP[$43];
        var $45 = $44 == 1;
        if ($45) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $46
        var $47 = HEAP[$1];
        var $48 = $47+56;
        HEAP[$48] = 0;;
        __label__ = 6; break;
      case 6: // $49
        __label__ = 7; break;
      case 7: // $50
        var $51 = HEAP[$1];
        var $52 = $51+12;
        var $53 = HEAP[$52];
        var $54 = HEAP[$1];
        var $55 = $54+8;
        var $56 = HEAP[$55];
        var $57 = unSign($53, 32) < unSign($56, 32);
        if ($57) { __lastLabel__ = 7; __label__ = 8; break; } else { __lastLabel__ = 7; __label__ = 9; break; }
      case 8: // $58
        var $59 = HEAP[$1];
        var $60 = $59+56;
        var $61 = HEAP[$60];
        var $62 = $61 != 0;
        var $63 = $62 ^ 1;
        __lastLabel__ = 8; __label__ = 9; break;
      case 9: // $64
        var $65 = __lastLabel__ == 7 ? 0 : ($63);
        if ($65) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $66
        var $67 = HEAP[$words];
        var $68 = $67 != 0;
        if ($68) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $69
        var $70 = HEAP[$words];
        _lil_free_list($70);
        __label__ = 13; break;
      case 13: // $71
        var $72 = HEAP[$val];
        var $73 = $72 != 0;
        if ($73) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $74
        var $75 = HEAP[$val];
        _lil_free_value($75);
        __label__ = 15; break;
      case 15: // $76
        HEAP[$val] = 0;;
        var $77 = HEAP[$1];
        var $78 = _substitute($77);
        HEAP[$words] = $78;;
        var $79 = HEAP[$words];
        var $80 = $79 != 0;
        if ($80) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $81
        var $82 = HEAP[$1];
        var $83 = $82+56;
        var $84 = HEAP[$83];
        var $85 = $84 != 0;
        if ($85) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $86
        __label__ = 19; break;
      case 18: // $87
        var $88 = HEAP[$words];
        var $89 = $88+4;
        var $90 = HEAP[$89];
        var $91 = $90 != 0;
        if ($91) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $92
        var $93 = HEAP[$1];
        var $94 = HEAP[$words];
        var $95 = $94;
        var $96 = HEAP[$95];
        var $97 = $96;
        var $98 = HEAP[$97];
        var $99 = _lil_to_string($98);
        var $100 = _find_cmd($93, $99);
        HEAP[$cmd] = $100;;
        var $101 = HEAP[$cmd];
        var $102 = $101 != 0;
        if ($102) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 23: // $103
        var $104 = HEAP[$words];
        var $105 = $104;
        var $106 = HEAP[$105];
        var $107 = $106;
        var $108 = HEAP[$107];
        var $109 = $108;
        var $110 = HEAP[$109];
        var $111 = $110 != 0;
        if ($111) { __label__ = 24; break; } else { __label__ = 25; break; }
      case 24: // $112
        var $113 = HEAP[$1];
        var $114 = $113+28;
        var $115 = HEAP[$114];
        var $116 = $115 != 0;
        if ($116) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 26: // $117
        var $118 = HEAP[$1];
        var $119 = $118+32;
        var $120 = HEAP[$119];
        var $121 = $120 < 16384;
        if ($121) { __label__ = 28; break; } else { __label__ = 29; break; }
      case 28: // $122
        var $123 = HEAP[$1];
        var $124 = $123+32;
        var $125 = HEAP[$124];
        var $126 = ($125 + 1)&4294967295;
        HEAP[$124] = $126;;
        var $127 = HEAP[$1];
        var $128 = _lil_push_env($127);
        var $129 = HEAP[$words];
        var $130 = $129;
        var $131 = HEAP[$130];
        var $132 = $131;
        var $133 = HEAP[$132];
        var $134 = HEAP[$1];
        var $135 = $134+40;
        var $136 = HEAP[$135];
        var $137 = $136+8;
        HEAP[$137] = $133;;
        var $138 = HEAP[$words];
        var $139 = _lil_list_to_value($138, 1);
        HEAP[$args] = $139;;
        var $140 = HEAP[$1];
        var $141 = HEAP[$args];
        var $142 = _lil_set_var($140, __str1, $141, 2);
        var $143 = HEAP[$args];
        _lil_free_value($143);
        var $144 = HEAP[$1];
        var $145 = HEAP[$1];
        var $146 = $145+28;
        var $147 = HEAP[$146];
        var $148 = _lil_parse($144, $147, 0, 1);
        HEAP[$val] = $148;;
        var $149 = HEAP[$1];
        _lil_pop_env($149);
        var $150 = HEAP[$1];
        var $151 = $150+32;
        var $152 = HEAP[$151];
        var $153 = ($152 + -1)&4294967295;
        HEAP[$151] = $153;;
        __label__ = 30; break;
      case 29: // $154
        var $155 = HEAP[$words];
        var $156 = $155;
        var $157 = HEAP[$156];
        var $158 = $157;
        var $159 = HEAP[$158];
        var $160 = $159;
        var $161 = HEAP[$160];
        var $162 = ($161 + 64)&4294967295;
        var $163 = _malloc($162);
        HEAP[$msg] = $163;;
        var $164 = HEAP[$msg];
        var $165 = HEAP[$words];
        var $166 = $165;
        var $167 = HEAP[$166];
        var $168 = $167;
        var $169 = HEAP[$168];
        var $170 = $169+4;
        var $171 = HEAP[$170];
        var $172 = _sprintf($164, __str2, $171);
        var $173 = HEAP[$1];
        var $174 = HEAP[$1];
        var $175 = $174+12;
        var $176 = HEAP[$175];
        var $177 = HEAP[$msg];
        _lil_set_error_at($173, $176, $177);
        var $178 = HEAP[$msg];
        _free($178);
        __label__ = 19; break;
      case 30: // $179
        __label__ = 31; break;
      case 27: // $180
        var $181 = HEAP[$words];
        var $182 = $181;
        var $183 = HEAP[$182];
        var $184 = $183;
        var $185 = HEAP[$184];
        var $186 = $185;
        var $187 = HEAP[$186];
        var $188 = ($187 + 32)&4294967295;
        var $189 = _malloc($188);
        HEAP[$msg1] = $189;;
        var $190 = HEAP[$msg1];
        var $191 = HEAP[$words];
        var $192 = $191;
        var $193 = HEAP[$192];
        var $194 = $193;
        var $195 = HEAP[$194];
        var $196 = $195+4;
        var $197 = HEAP[$196];
        var $198 = _sprintf($190, __str3, $197);
        var $199 = HEAP[$1];
        var $200 = HEAP[$1];
        var $201 = $200+12;
        var $202 = HEAP[$201];
        var $203 = HEAP[$msg1];
        _lil_set_error_at($199, $202, $203);
        var $204 = HEAP[$msg1];
        _free($204);
        __label__ = 19; break;
      case 31: // $205
        __label__ = 25; break;
      case 25: // $206
        __label__ = 22; break;
      case 22: // $207
        var $208 = HEAP[$cmd];
        var $209 = $208 != 0;
        if ($209) { __label__ = 32; break; } else { __label__ = 33; break; }
      case 32: // $210
        var $211 = HEAP[$cmd];
        var $212 = $211+12;
        var $213 = HEAP[$212];
        var $214 = $213 != 0;
        if ($214) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $215
        var $216 = HEAP[$1];
        var $217 = $216+12;
        var $218 = HEAP[$217];
        HEAP[$shead] = $218;;
        var $219 = HEAP[$cmd];
        var $220 = $219+12;
        var $221 = HEAP[$220];
        var $222 = HEAP[$1];
        var $223 = HEAP[$words];
        var $224 = $223+4;
        var $225 = HEAP[$224];
        var $226 = ($225 - 1)&4294967295;
        var $227 = HEAP[$words];
        var $228 = $227;
        var $229 = HEAP[$228];
        var $230 = $229+4;
        var $231 = FUNCTION_TABLE[$221]($222, $226, $230);
        HEAP[$val] = $231;;
        var $232 = HEAP[$1];
        var $233 = $232+56;
        var $234 = HEAP[$233];
        var $235 = $234 == 2;
        if ($235) { __label__ = 36; break; } else { __label__ = 37; break; }
      case 36: // $236
        var $237 = HEAP[$1];
        var $238 = $237+56;
        HEAP[$238] = 1;;
        var $239 = HEAP[$shead];
        var $240 = HEAP[$1];
        var $241 = $240+60;
        HEAP[$241] = $239;;
        __label__ = 37; break;
      case 37: // $242
        __label__ = 38; break;
      case 35: // $243
        var $244 = HEAP[$1];
        var $245 = _lil_push_env($244);
        var $246 = HEAP[$cmd];
        var $247 = HEAP[$1];
        var $248 = $247+40;
        var $249 = HEAP[$248];
        var $250 = $249+4;
        HEAP[$250] = $246;;
        var $251 = HEAP[$cmd];
        var $252 = $251+8;
        var $253 = HEAP[$252];
        var $254 = $253+4;
        var $255 = HEAP[$254];
        var $256 = $255 == 1;
        if ($256) { __label__ = 39; break; } else { __label__ = 40; break; }
      case 39: // $257
        var $258 = HEAP[$cmd];
        var $259 = $258+8;
        var $260 = HEAP[$259];
        var $261 = $260;
        var $262 = HEAP[$261];
        var $263 = $262;
        var $264 = HEAP[$263];
        var $265 = _lil_to_string($264);
        var $266 = _strcmp($265, __str1);
        var $267 = $266 != 0;
        if ($267) { __label__ = 40; break; } else { __label__ = 41; break; }
      case 41: // $268
        var $269 = HEAP[$words];
        var $270 = _lil_list_to_value($269, 1);
        HEAP[$args2] = $270;;
        var $271 = HEAP[$1];
        var $272 = HEAP[$args2];
        var $273 = _lil_set_var($271, __str1, $272, 2);
        var $274 = HEAP[$args2];
        _lil_free_value($274);
        __label__ = 42; break;
      case 40: // $275
        HEAP[$i] = 0;;
        __label__ = 43; break;
      case 43: // $276
        var $277 = HEAP[$i];
        var $278 = HEAP[$cmd];
        var $279 = $278+8;
        var $280 = HEAP[$279];
        var $281 = $280+4;
        var $282 = HEAP[$281];
        var $283 = unSign($277, 32) < unSign($282, 32);
        if ($283) { __label__ = 44; break; } else { __label__ = 45; break; }
      case 44: // $284
        var $285 = HEAP[$1];
        var $286 = HEAP[$i];
        var $287 = HEAP[$cmd];
        var $288 = $287+8;
        var $289 = HEAP[$288];
        var $290 = $289;
        var $291 = HEAP[$290];
        var $292 = $291+4*$286;
        var $293 = HEAP[$292];
        var $294 = _lil_to_string($293);
        var $295 = HEAP[$i];
        var $296 = HEAP[$words];
        var $297 = $296+4;
        var $298 = HEAP[$297];
        var $299 = ($298 - 1)&4294967295;
        var $300 = unSign($295, 32) < unSign($299, 32);
        if ($300) { __label__ = 46; break; } else { __label__ = 47; break; }
      case 46: // $301
        var $302 = HEAP[$i];
        var $303 = ($302 + 1)&4294967295;
        var $304 = HEAP[$words];
        var $305 = $304;
        var $306 = HEAP[$305];
        var $307 = $306+4*$303;
        var $308 = HEAP[$307];
        __lastLabel__ = 46; __label__ = 48; break;
      case 47: // $309
        var $310 = HEAP[$1];
        var $311 = $310+52;
        var $312 = HEAP[$311];
        __lastLabel__ = 47; __label__ = 48; break;
      case 48: // $313
        var $314 = __lastLabel__ == 46 ? $308 : ($312);
        var $315 = _lil_set_var($285, $294, $314, 2);
        __label__ = 49; break;
      case 49: // $316
        var $317 = HEAP[$i];
        var $318 = ($317 + 1)&4294967295;
        HEAP[$i] = $318;;
        __label__ = 43; break;
      case 45: // $319
        __label__ = 42; break;
      case 42: // $320
        var $321 = HEAP[$1];
        var $322 = HEAP[$cmd];
        var $323 = $322+4;
        var $324 = HEAP[$323];
        var $325 = _lil_parse_value($321, $324, 1);
        HEAP[$val] = $325;;
        var $326 = HEAP[$1];
        _lil_pop_env($326);
        __label__ = 38; break;
      case 38: // $327
        __label__ = 33; break;
      case 33: // $328
        __label__ = 21; break;
      case 21: // $329
        var $330 = HEAP[$1];
        var $331 = $330+40;
        var $332 = HEAP[$331];
        var $333 = $332+24;
        var $334 = HEAP[$333];
        var $335 = $334 != 0;
        if ($335) { __label__ = 50; break; } else { __label__ = 51; break; }
      case 50: // $336
        __label__ = 19; break;
      case 51: // $337
        var $338 = HEAP[$1];
        _skip_spaces($338);
        __label__ = 52; break;
      case 52: // $339
        var $340 = HEAP[$1];
        var $341 = _ateol($340);
        var $342 = $341 != 0;
        if ($342) { __label__ = 53; break; } else { __label__ = 54; break; }
      case 53: // $343
        var $344 = HEAP[$1];
        var $345 = $344+12;
        var $346 = HEAP[$345];
        var $347 = ($346 + 1)&4294967295;
        HEAP[$345] = $347;;
        __label__ = 52; break;
      case 54: // $348
        var $349 = HEAP[$1];
        _skip_spaces($349);
        __label__ = 7; break;
      case 11: // $350
        __label__ = 19; break;
      case 19: // $351
        var $352 = HEAP[$1];
        var $353 = $352+56;
        var $354 = HEAP[$353];
        var $355 = $354 != 0;
        if ($355) { __label__ = 55; break; } else { __label__ = 56; break; }
      case 55: // $356
        var $357 = HEAP[$1];
        var $358 = $357+68;
        var $359 = $358+20;
        var $360 = HEAP[$359];
        var $361 = $360 != 0;
        if ($361) { __label__ = 57; break; } else { __label__ = 56; break; }
      case 57: // $362
        var $363 = HEAP[$1];
        var $364 = $363+100;
        var $365 = HEAP[$364];
        var $366 = $365 == 1;
        if ($366) { __label__ = 58; break; } else { __label__ = 56; break; }
      case 58: // $367
        var $368 = HEAP[$1];
        var $369 = $368+68;
        var $370 = $369+20;
        var $371 = HEAP[$370];
        var $372 = $371;
        HEAP[$proc] = $372;;
        var $373 = HEAP[$proc];
        var $374 = HEAP[$1];
        var $375 = HEAP[$1];
        var $376 = $375+60;
        var $377 = HEAP[$376];
        var $378 = HEAP[$1];
        var $379 = $378+64;
        var $380 = HEAP[$379];
        FUNCTION_TABLE[$373]($374, $377, $380);
        __label__ = 56; break;
      case 56: // $381
        var $382 = HEAP[$words];
        var $383 = $382 != 0;
        if ($383) { __label__ = 59; break; } else { __label__ = 60; break; }
      case 59: // $384
        var $385 = HEAP[$words];
        _lil_free_list($385);
        __label__ = 60; break;
      case 60: // $386
        var $387 = HEAP[$save_code];
        var $388 = HEAP[$1];
        var $389 = $388;
        HEAP[$389] = $387;;
        var $390 = HEAP[$save_clen];
        var $391 = HEAP[$1];
        var $392 = $391+8;
        HEAP[$392] = $390;;
        var $393 = HEAP[$save_head];
        var $394 = HEAP[$1];
        var $395 = $394+12;
        HEAP[$395] = $393;;
        var $396 = HEAP[$4];
        var $397 = $396 != 0;
        if ($397) { __label__ = 61; break; } else { __label__ = 62; break; }
      case 61: // $398
        var $399 = HEAP[$val];
        var $400 = $399 != 0;
        if ($400) { __label__ = 63; break; } else { __label__ = 64; break; }
      case 63: // $401
        var $402 = HEAP[$val];
        _lil_free_value($402);
        __label__ = 64; break;
      case 64: // $403
        var $404 = HEAP[$1];
        var $405 = $404+40;
        var $406 = HEAP[$405];
        var $407 = $406+20;
        var $408 = HEAP[$407];
        HEAP[$val] = $408;;
        var $409 = HEAP[$1];
        var $410 = $409+40;
        var $411 = HEAP[$410];
        var $412 = $411+20;
        HEAP[$412] = 0;;
        var $413 = HEAP[$1];
        var $414 = $413+40;
        var $415 = HEAP[$414];
        var $416 = $415+24;
        HEAP[$416] = 0;;
        __label__ = 62; break;
      case 62: // $417
        var $418 = HEAP[$1];
        var $419 = $418+100;
        var $420 = HEAP[$419];
        var $421 = ($420 + -1)&4294967295;
        HEAP[$419] = $421;;
        var $422 = HEAP[$val];
        var $423 = $422 != 0;
        if ($423) { __label__ = 65; break; } else { __label__ = 66; break; }
      case 65: // $424
        var $425 = HEAP[$val];
        __lastLabel__ = 65; __label__ = 67; break;
      case 66: // $426
        var $427 = _alloc_value(0);
        __lastLabel__ = 66; __label__ = 67; break;
      case 67: // $428
        var $429 = __lastLabel__ == 65 ? $425 : ($427);
        STACKTOP = __stackBase__;
        return $429;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_parse.__index__ = Runtime.getFunctionIndex(_lil_parse, "_lil_parse");
  
  
  function _skip_spaces($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        HEAP[$1] = $lil;;
        __label__ = 0; break;
      case 0: // $2
        var $3 = HEAP[$1];
        var $4 = $3+12;
        var $5 = HEAP[$4];
        var $6 = HEAP[$1];
        var $7 = $6+8;
        var $8 = HEAP[$7];
        var $9 = unSign($5, 32) < unSign($8, 32);
        if ($9) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $10
        var $11 = HEAP[$1];
        var $12 = $11+12;
        var $13 = HEAP[$12];
        var $14 = HEAP[$1];
        var $15 = $14;
        var $16 = HEAP[$15];
        var $17 = $16+$13;
        var $18 = HEAP[$17];
        var $19 = $18;
        var $20 = $19 == 92;
        if ($20) { __lastLabel__ = 1; __label__ = 3; break; } else { __lastLabel__ = 1; __label__ = 4; break; }
      case 4: // $21
        var $22 = HEAP[$1];
        var $23 = $22+12;
        var $24 = HEAP[$23];
        var $25 = HEAP[$1];
        var $26 = $25;
        var $27 = HEAP[$26];
        var $28 = $27+$24;
        var $29 = HEAP[$28];
        var $30 = $29;
        var $31 = $30 == 35;
        if ($31) { __lastLabel__ = 4; __label__ = 3; break; } else { __lastLabel__ = 4; __label__ = 5; break; }
      case 5: // $32
        var $33 = HEAP[$1];
        var $34 = $33+12;
        var $35 = HEAP[$34];
        var $36 = HEAP[$1];
        var $37 = $36;
        var $38 = HEAP[$37];
        var $39 = $38+$35;
        var $40 = HEAP[$39];
        var $41 = $40;
        var $42 = ___ctype_b_loc();
        var $43 = HEAP[$42];
        var $44 = $43+2*$41;
        var $45 = HEAP[$44];
        var $46 = $45;
        var $47 = $46 & 8192;
        var $48 = $47 != 0;
        if ($48) { __lastLabel__ = 5; __label__ = 6; break; } else { __lastLabel__ = 5; __label__ = 7; break; }
      case 6: // $49
        var $50 = HEAP[$1];
        var $51 = $50+12;
        var $52 = HEAP[$51];
        var $53 = HEAP[$1];
        var $54 = $53;
        var $55 = HEAP[$54];
        var $56 = $55+$52;
        var $57 = HEAP[$56];
        var $58 = $57;
        var $59 = $58 == 13;
        if ($59) { __lastLabel__ = 6; __label__ = 8; break; } else { __lastLabel__ = 6; __label__ = 9; break; }
      case 9: // $60
        var $61 = HEAP[$1];
        var $62 = $61+12;
        var $63 = HEAP[$62];
        var $64 = HEAP[$1];
        var $65 = $64;
        var $66 = HEAP[$65];
        var $67 = $66+$63;
        var $68 = HEAP[$67];
        var $69 = $68;
        var $70 = $69 == 10;
        __lastLabel__ = 9; __label__ = 8; break;
      case 8: // $71
        var $72 = __lastLabel__ == 6 ? 1 : ($70);
        var $73 = $72 ^ 1;
        __lastLabel__ = 8; __label__ = 7; break;
      case 7: // $74
        var $75 = __lastLabel__ == 5 ? 0 : ($73);
        __lastLabel__ = 7; __label__ = 3; break;
      case 3: // $76
        var $77 = __lastLabel__ == 4 ? 1 : (__lastLabel__ == 1 ? 1 : ($75));
        __lastLabel__ = 3; __label__ = 2; break;
      case 2: // $78
        var $79 = __lastLabel__ == 0 ? 0 : ($77);
        if ($79) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $80
        var $81 = HEAP[$1];
        var $82 = $81+12;
        var $83 = HEAP[$82];
        var $84 = HEAP[$1];
        var $85 = $84;
        var $86 = HEAP[$85];
        var $87 = $86+$83;
        var $88 = HEAP[$87];
        var $89 = $88;
        var $90 = $89 == 35;
        if ($90) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $91
        __label__ = 14; break;
      case 14: // $92
        var $93 = HEAP[$1];
        var $94 = $93+12;
        var $95 = HEAP[$94];
        var $96 = HEAP[$1];
        var $97 = $96+8;
        var $98 = HEAP[$97];
        var $99 = unSign($95, 32) < unSign($98, 32);
        if ($99) { __lastLabel__ = 14; __label__ = 15; break; } else { __lastLabel__ = 14; __label__ = 16; break; }
      case 15: // $100
        var $101 = HEAP[$1];
        var $102 = _ateol($101);
        var $103 = $102 != 0;
        var $104 = $103 ^ 1;
        __lastLabel__ = 15; __label__ = 16; break;
      case 16: // $105
        var $106 = __lastLabel__ == 14 ? 0 : ($104);
        if ($106) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $107
        var $108 = HEAP[$1];
        var $109 = $108+12;
        var $110 = HEAP[$109];
        var $111 = ($110 + 1)&4294967295;
        HEAP[$109] = $111;;
        __label__ = 14; break;
      case 18: // $112
        __label__ = 19; break;
      case 13: // $113
        var $114 = HEAP[$1];
        var $115 = $114+12;
        var $116 = HEAP[$115];
        var $117 = HEAP[$1];
        var $118 = $117;
        var $119 = HEAP[$118];
        var $120 = $119+$116;
        var $121 = HEAP[$120];
        var $122 = $121;
        var $123 = $122 == 92;
        if ($123) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 20: // $124
        var $125 = HEAP[$1];
        var $126 = $125+12;
        var $127 = HEAP[$126];
        var $128 = ($127 + 1)&4294967295;
        var $129 = HEAP[$1];
        var $130 = $129;
        var $131 = HEAP[$130];
        var $132 = $131+$128;
        var $133 = HEAP[$132];
        var $134 = $133;
        var $135 = $134 == 13;
        if ($135) { __label__ = 22; break; } else { __label__ = 23; break; }
      case 23: // $136
        var $137 = HEAP[$1];
        var $138 = $137+12;
        var $139 = HEAP[$138];
        var $140 = ($139 + 1)&4294967295;
        var $141 = HEAP[$1];
        var $142 = $141;
        var $143 = HEAP[$142];
        var $144 = $143+$140;
        var $145 = HEAP[$144];
        var $146 = $145;
        var $147 = $146 == 10;
        if ($147) { __label__ = 22; break; } else { __label__ = 21; break; }
      case 22: // $148
        var $149 = HEAP[$1];
        var $150 = $149+12;
        var $151 = HEAP[$150];
        var $152 = ($151 + 1)&4294967295;
        HEAP[$150] = $152;;
        __label__ = 24; break;
      case 24: // $153
        var $154 = HEAP[$1];
        var $155 = $154+12;
        var $156 = HEAP[$155];
        var $157 = HEAP[$1];
        var $158 = $157+8;
        var $159 = HEAP[$158];
        var $160 = unSign($156, 32) < unSign($159, 32);
        if ($160) { __lastLabel__ = 24; __label__ = 25; break; } else { __lastLabel__ = 24; __label__ = 26; break; }
      case 25: // $161
        var $162 = HEAP[$1];
        var $163 = _ateol($162);
        var $164 = $163 != 0;
        __lastLabel__ = 25; __label__ = 26; break;
      case 26: // $165
        var $166 = __lastLabel__ == 24 ? 0 : ($164);
        if ($166) { __label__ = 27; break; } else { __label__ = 28; break; }
      case 27: // $167
        var $168 = HEAP[$1];
        var $169 = $168+12;
        var $170 = HEAP[$169];
        var $171 = ($170 + 1)&4294967295;
        HEAP[$169] = $171;;
        __label__ = 24; break;
      case 28: // $172
        __label__ = 29; break;
      case 21: // $173
        var $174 = HEAP[$1];
        var $175 = $174+12;
        var $176 = HEAP[$175];
        var $177 = ($176 + 1)&4294967295;
        HEAP[$175] = $177;;
        __label__ = 29; break;
      case 29: // $178
        __label__ = 19; break;
      case 19: // $179
        __label__ = 0; break;
      case 11: // $180
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _skip_spaces.__index__ = Runtime.getFunctionIndex(_skip_spaces, "_skip_spaces");
  
  
  function _find_cmd($lil, $name) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $i = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $name;;
        var $4 = HEAP[$2];
        var $5 = $4+20;
        var $6 = HEAP[$5];
        var $7 = unSign($6, 32) > unSign(0, 32);
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        var $9 = HEAP[$2];
        var $10 = $9+20;
        var $11 = HEAP[$10];
        var $12 = ($11 - 1)&4294967295;
        HEAP[$i] = $12;;
        __label__ = 2; break;
      case 2: // $13
        var $14 = HEAP[$i];
        var $15 = HEAP[$2];
        var $16 = $15+16;
        var $17 = HEAP[$16];
        var $18 = $17+4*$14;
        var $19 = HEAP[$18];
        var $20 = $19;
        var $21 = HEAP[$20];
        var $22 = HEAP[$3];
        var $23 = _strcmp($21, $22);
        var $24 = $23 != 0;
        if ($24) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $25
        var $26 = HEAP[$i];
        var $27 = HEAP[$2];
        var $28 = $27+16;
        var $29 = HEAP[$28];
        var $30 = $29+4*$26;
        var $31 = HEAP[$30];
        HEAP[$1] = $31;;
        __label__ = 5; break;
      case 3: // $32
        var $33 = HEAP[$i];
        var $34 = $33 != 0;
        if ($34) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 7: // $35
        __label__ = 8; break;
      case 6: // $36
        var $37 = HEAP[$i];
        var $38 = ($37 + -1)&4294967295;
        HEAP[$i] = $38;;
        __label__ = 2; break;
      case 8: // $39
        __label__ = 1; break;
      case 1: // $40
        HEAP[$1] = 0;;
        __label__ = 5; break;
      case 5: // $41
        var $42 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $42;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _find_cmd.__index__ = Runtime.getFunctionIndex(_find_cmd, "_find_cmd");
  
  
  function _lil_set_error_at($lil, $pos, $msg) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        HEAP[$1] = $lil;;
        HEAP[$2] = $pos;;
        HEAP[$3] = $msg;;
        var $4 = HEAP[$1];
        var $5 = $4+56;
        var $6 = HEAP[$5];
        var $7 = $6 != 0;
        if ($7) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $8
        __label__ = 2; break;
      case 1: // $9
        var $10 = HEAP[$1];
        var $11 = $10+64;
        var $12 = HEAP[$11];
        _free($12);
        var $13 = HEAP[$1];
        var $14 = $13+56;
        HEAP[$14] = 1;;
        var $15 = HEAP[$2];
        var $16 = HEAP[$1];
        var $17 = $16+60;
        HEAP[$17] = $15;;
        var $18 = HEAP[$3];
        var $19 = $18 != 0;
        if ($19) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $20
        var $21 = HEAP[$3];
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $22
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $23
        var $24 = __lastLabel__ == 3 ? $21 : (__str4);
        var $25 = _strclone($24);
        var $26 = HEAP[$1];
        var $27 = $26+64;
        HEAP[$27] = $25;;
        __label__ = 2; break;
      case 2: // $28
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_set_error_at.__index__ = Runtime.getFunctionIndex(_lil_set_error_at, "_lil_set_error_at");
  
  
  function _lil_parse_value($lil, $val, $funclevel) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $val;;
        HEAP[$4] = $funclevel;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8 = HEAP[$3];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = $10 != 0;
        if ($11) { __label__ = 2; break; } else { __label__ = 1; break; }
      case 2: // $12
        var $13 = HEAP[$3];
        var $14 = $13;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __label__ = 3; break; } else { __label__ = 1; break; }
      case 1: // $17
        var $18 = _alloc_value(0);
        HEAP[$1] = $18;;
        __label__ = 4; break;
      case 3: // $19
        var $20 = HEAP[$2];
        var $21 = HEAP[$3];
        var $22 = $21+4;
        var $23 = HEAP[$22];
        var $24 = HEAP[$3];
        var $25 = $24;
        var $26 = HEAP[$25];
        var $27 = HEAP[$4];
        var $28 = _lil_parse($20, $23, $26, $27);
        HEAP[$1] = $28;;
        __label__ = 4; break;
      case 4: // $29
        var $30 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $30;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_parse_value.__index__ = Runtime.getFunctionIndex(_lil_parse_value, "_lil_parse_value");
  
  
  function _ateol($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = 0; 
    while(1) switch(__label__) {
      case 0: // $0
        var $1 = __stackBase__;
        HEAP[$1] = $lil;;
        var $2 = HEAP[$1];
        var $3 = $2+12;
        var $4 = HEAP[$3];
        var $5 = HEAP[$1];
        var $6 = $5;
        var $7 = HEAP[$6];
        var $8 = $7+$4;
        var $9 = HEAP[$8];
        var $10 = $9;
        var $11 = $10 == 10;
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 2: // $12
        var $13 = HEAP[$1];
        var $14 = $13+12;
        var $15 = HEAP[$14];
        var $16 = HEAP[$1];
        var $17 = $16;
        var $18 = HEAP[$17];
        var $19 = $18+$15;
        var $20 = HEAP[$19];
        var $21 = $20;
        var $22 = $21 == 13;
        if ($22) { __lastLabel__ = 2; __label__ = 1; break; } else { __lastLabel__ = 2; __label__ = 3; break; }
      case 3: // $23
        var $24 = HEAP[$1];
        var $25 = $24+12;
        var $26 = HEAP[$25];
        var $27 = HEAP[$1];
        var $28 = $27;
        var $29 = HEAP[$28];
        var $30 = $29+$26;
        var $31 = HEAP[$30];
        var $32 = $31;
        var $33 = $32 == 59;
        __lastLabel__ = 3; __label__ = 1; break;
      case 1: // $34
        var $35 = __lastLabel__ == 2 ? 1 : (__lastLabel__ == 0 ? 1 : ($33));
        var $36 = $35;
        STACKTOP = __stackBase__;
        return $36;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ateol.__index__ = Runtime.getFunctionIndex(_ateol, "_ateol");
  
  
  function _lil_callback($lil, $cb, $proc) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        HEAP[$1] = $lil;;
        HEAP[$2] = $cb;;
        HEAP[$3] = $proc;;
        var $4 = HEAP[$2];
        var $5 = $4 < 0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $6
        var $7 = HEAP[$2];
        var $8 = $7 > 8;
        if ($8) { __label__ = 0; break; } else { __label__ = 2; break; }
      case 0: // $9
        __label__ = 3; break;
      case 2: // $10
        var $11 = HEAP[$3];
        var $12 = HEAP[$2];
        var $13 = HEAP[$1];
        var $14 = $13+68;
        var $15 = $14+$12*4;
        HEAP[$15] = $11;;
        __label__ = 3; break;
      case 3: // $16
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_callback.__index__ = Runtime.getFunctionIndex(_lil_callback, "_lil_callback");
  
  
  function _lil_set_error($lil, $msg) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        HEAP[$1] = $lil;;
        HEAP[$2] = $msg;;
        var $3 = HEAP[$1];
        var $4 = $3+56;
        var $5 = HEAP[$4];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$1];
        var $10 = $9+64;
        var $11 = HEAP[$10];
        _free($11);
        var $12 = HEAP[$1];
        var $13 = $12+56;
        HEAP[$13] = 2;;
        var $14 = HEAP[$1];
        var $15 = $14+60;
        HEAP[$15] = 0;;
        var $16 = HEAP[$2];
        var $17 = $16 != 0;
        if ($17) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $18
        var $19 = HEAP[$2];
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $20
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $21
        var $22 = __lastLabel__ == 3 ? $19 : (__str4);
        var $23 = _strclone($22);
        var $24 = HEAP[$1];
        var $25 = $24+64;
        HEAP[$25] = $23;;
        __label__ = 2; break;
      case 2: // $26
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_set_error.__index__ = Runtime.getFunctionIndex(_lil_set_error, "_lil_set_error");
  
  
  function _lil_error($lil, $msg, $pos) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $msg;;
        HEAP[$4] = $pos;;
        var $5 = HEAP[$2];
        var $6 = $5+56;
        var $7 = HEAP[$6];
        var $8 = $7 != 0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $9
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $10
        var $11 = HEAP[$2];
        var $12 = $11+64;
        var $13 = HEAP[$12];
        var $14 = HEAP[$3];
        HEAP[$14] = $13;;
        var $15 = HEAP[$2];
        var $16 = $15+60;
        var $17 = HEAP[$16];
        var $18 = HEAP[$4];
        HEAP[$18] = $17;;
        var $19 = HEAP[$2];
        var $20 = $19+56;
        HEAP[$20] = 0;;
        HEAP[$1] = 1;;
        __label__ = 2; break;
      case 2: // $21
        var $22 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $22;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_error.__index__ = Runtime.getFunctionIndex(_lil_error, "_lil_error");
  
  
  function _lil_eval_expr($lil, $code) {
    var __stackBase__  = STACKTOP; STACKTOP += 52; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $ee = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $code;;
        var $4 = HEAP[$2];
        var $5 = HEAP[$3];
        var $6 = _lil_subst_to_value($4, $5);
        HEAP[$3] = $6;;
        var $7 = HEAP[$2];
        var $8 = $7+56;
        var $9 = HEAP[$8];
        var $10 = $9 != 0;
        if ($10) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $11
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $12
        var $13 = HEAP[$3];
        var $14 = _lil_to_string($13);
        var $15 = $ee;
        HEAP[$15] = $14;;
        var $16 = $ee;
        var $17 = HEAP[$16];
        var $18 = $17;
        var $19 = HEAP[$18];
        var $20 = $19 != 0;
        if ($20) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $21
        var $22 = _lil_alloc_integer(0);
        HEAP[$1] = $22;;
        __label__ = 2; break;
      case 3: // $23
        var $24 = $ee+8;
        HEAP[$24] = 0;;
        var $25 = HEAP[$3];
        var $26 = $25;
        var $27 = HEAP[$26];
        var $28 = $ee+4;
        HEAP[$28] = $27;;
        var $29 = $ee+12;
        HEAP[$29] = 0;;
        var $30 = $ee+20;
        HEAP[$30] = 0;;
        var $31 = $ee+28;
        HEAP[$31] = 0;;
        var $32 = $ee+32;
        HEAP[$32] = 0;;
        _ee_expr($ee);
        var $33 = HEAP[$3];
        _lil_free_value($33);
        var $34 = $ee+32;
        var $35 = HEAP[$34];
        var $36 = $35 != 0;
        if ($36) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $37
        var $38 = $ee+32;
        var $39 = HEAP[$38];
        if ($39 == 3) {
          __label__ = 10; break;
        }
        else if ($39 == 2) {
          __label__ = 11; break;
        }
        else if ($39 == 1) {
          __label__ = 12; break;
        }
        else {
        __label__ = 7; break;
        }
        
      case 10: // $40
        var $41 = HEAP[$2];
        _lil_set_error($41, __str5);
        __label__ = 7; break;
      case 11: // $42
        var $43 = HEAP[$2];
        _lil_set_error($43, __str6);
        __label__ = 7; break;
      case 12: // $44
        var $45 = HEAP[$2];
        _lil_set_error($45, __str7);
        __label__ = 7; break;
      case 7: // $46
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 6: // $47
        var $48 = $ee+28;
        var $49 = HEAP[$48];
        var $50 = $49 == 0;
        if ($50) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $51
        var $52 = $ee+12;
        var $53 = HEAP[$52];
        var $54 = _lil_alloc_integer($53);
        HEAP[$1] = $54;;
        __label__ = 2; break;
      case 9: // $55
        var $56 = $ee+20;
        var $57 = HEAP[$56];
        var $58 = _lil_alloc_double($57);
        HEAP[$1] = $58;;
        __label__ = 2; break;
      case 2: // $59
        var $60 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $60;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_eval_expr.__index__ = Runtime.getFunctionIndex(_lil_eval_expr, "_lil_eval_expr");
  
  
  function _lil_alloc_integer($num) {
    var __stackBase__  = STACKTOP; STACKTOP += 136; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    var $buff = __stackBase__+8;
    HEAP[$1] = $num;;
    var $2 = $buff;
    var $3 = HEAP[$1];
    var $4 = _sprintf($2, __str10, $3);
    var $5 = $buff;
    var $6 = _alloc_value($5);
    STACKTOP = __stackBase__;
    return $6;
  }
  _lil_alloc_integer.__index__ = Runtime.getFunctionIndex(_lil_alloc_integer, "_lil_alloc_integer");
  
  
  function _ee_expr($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_logor($2);
        var $3 = HEAP[$1];
        var $4 = $3+32;
        var $5 = HEAP[$4];
        var $6 = $5 == 4;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8 = HEAP[$1];
        var $9 = $8+32;
        HEAP[$9] = 0;;
        var $10 = HEAP[$1];
        var $11 = $10+12;
        HEAP[$11] = 1;;
        __label__ = 1; break;
      case 1: // $12
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_expr.__index__ = Runtime.getFunctionIndex(_ee_expr, "_ee_expr");
  
  
  function _lil_alloc_double($num) {
    var __stackBase__  = STACKTOP; STACKTOP += 136; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    var $buff = __stackBase__+8;
    HEAP[$1] = $num;;
    var $2 = $buff;
    var $3 = HEAP[$1];
    var $4 = _sprintf($2, __str9, $3);
    var $5 = $buff;
    var $6 = _alloc_value($5);
    STACKTOP = __stackBase__;
    return $6;
  }
  _lil_alloc_double.__index__ = Runtime.getFunctionIndex(_lil_alloc_double, "_lil_alloc_double");
  
  
  function _lil_unused_name($lil, $part) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $name = __stackBase__+12;
        var $val = __stackBase__+16;
        var $i = __stackBase__+20;
        HEAP[$2] = $lil;;
        HEAP[$3] = $part;;
        var $4 = HEAP[$3];
        var $5 = _strlen($4);
        var $6 = ($5 + 64)&4294967295;
        var $7 = _malloc($6);
        HEAP[$name] = $7;;
        HEAP[$i] = 0;;
        __label__ = 0; break;
      case 0: // $8
        var $9 = HEAP[$i];
        var $10 = unSign($9, 32) < unSign(-1, 32);
        if ($10) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $11
        var $12 = HEAP[$name];
        var $13 = HEAP[$3];
        var $14 = HEAP[$i];
        var $15 = _sprintf($12, __str8, $13, $14);
        var $16 = HEAP[$2];
        var $17 = HEAP[$name];
        var $18 = _find_cmd($16, $17);
        var $19 = $18 != 0;
        if ($19) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $20
        __label__ = 5; break;
      case 4: // $21
        var $22 = HEAP[$2];
        var $23 = HEAP[$2];
        var $24 = $23+40;
        var $25 = HEAP[$24];
        var $26 = HEAP[$name];
        var $27 = _lil_find_var($22, $25, $26);
        var $28 = $27 != 0;
        if ($28) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $29
        __label__ = 5; break;
      case 7: // $30
        var $31 = HEAP[$name];
        var $32 = _lil_alloc_string($31);
        HEAP[$val] = $32;;
        var $33 = HEAP[$name];
        _free($33);
        var $34 = HEAP[$val];
        HEAP[$1] = $34;;
        __label__ = 8; break;
      case 5: // $35
        var $36 = HEAP[$i];
        var $37 = ($36 + 1)&4294967295;
        HEAP[$i] = $37;;
        __label__ = 0; break;
      case 2: // $38
        HEAP[$1] = 0;;
        __label__ = 8; break;
      case 8: // $39
        var $40 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $40;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_unused_name.__index__ = Runtime.getFunctionIndex(_lil_unused_name, "_lil_unused_name");
  
  
  function _lil_alloc_string($str) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    HEAP[$1] = $str;;
    var $2 = HEAP[$1];
    var $3 = _alloc_value($2);
    STACKTOP = __stackBase__;
    return $3;
  }
  _lil_alloc_string.__index__ = Runtime.getFunctionIndex(_lil_alloc_string, "_lil_alloc_string");
  
  
  function _lil_arg($argv, $index) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        HEAP[$1] = $argv;;
        HEAP[$2] = $index;;
        var $3 = HEAP[$1];
        var $4 = $3 != 0;
        if ($4) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $5
        var $6 = HEAP[$2];
        var $7 = HEAP[$1];
        var $8 = $7+4*$6;
        var $9 = HEAP[$8];
        __lastLabel__ = 0; __label__ = 2; break;
      case 1: // $10
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $11
        var $12 = __lastLabel__ == 0 ? $9 : (0);
        STACKTOP = __stackBase__;
        return $12;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_arg.__index__ = Runtime.getFunctionIndex(_lil_arg, "_lil_arg");
  
  
  function _lil_to_double($val) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    HEAP[$1] = $val;;
    var $2 = HEAP[$1];
    var $3 = _lil_to_string($2);
    var $4 = _atof($3);
    STACKTOP = __stackBase__;
    return $4;
  }
  _lil_to_double.__index__ = Runtime.getFunctionIndex(_lil_to_double, "_lil_to_double");
  
  
  function _lil_to_integer($val) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    HEAP[$1] = $val;;
    var $2 = HEAP[$1];
    var $3 = _lil_to_string($2);
    var $4 = _atoll($3);
    STACKTOP = __stackBase__;
    return $4;
  }
  _lil_to_integer.__index__ = Runtime.getFunctionIndex(_lil_to_integer, "_lil_to_integer");
  
  
  function _lil_to_boolean($val) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $s = __stackBase__+8;
        var $i = __stackBase__+12;
        var $dots = __stackBase__+16;
        HEAP[$2] = $val;;
        var $3 = HEAP[$2];
        var $4 = _lil_to_string($3);
        HEAP[$s] = $4;;
        HEAP[$dots] = 0;;
        var $5 = HEAP[$s];
        var $6 = $5;
        var $7 = HEAP[$6];
        var $8 = $7 != 0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $9
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $10
        HEAP[$i] = 0;;
        __label__ = 3; break;
      case 3: // $11
        var $12 = HEAP[$i];
        var $13 = HEAP[$s];
        var $14 = $13+$12;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $17
        var $18 = HEAP[$i];
        var $19 = HEAP[$s];
        var $20 = $19+$18;
        var $21 = HEAP[$20];
        var $22 = $21;
        var $23 = $22 != 48;
        if ($23) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $24
        var $25 = HEAP[$i];
        var $26 = HEAP[$s];
        var $27 = $26+$25;
        var $28 = HEAP[$27];
        var $29 = $28;
        var $30 = $29 != 46;
        if ($30) { __label__ = 8; break; } else { __label__ = 7; break; }
      case 8: // $31
        HEAP[$1] = 1;;
        __label__ = 2; break;
      case 7: // $32
        var $33 = HEAP[$i];
        var $34 = HEAP[$s];
        var $35 = $34+$33;
        var $36 = HEAP[$35];
        var $37 = $36;
        var $38 = $37 == 46;
        if ($38) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $39
        var $40 = HEAP[$dots];
        var $41 = $40 != 0;
        if ($41) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $42
        HEAP[$1] = 1;;
        __label__ = 2; break;
      case 12: // $43
        HEAP[$dots] = 1;;
        __label__ = 10; break;
      case 10: // $44
        __label__ = 13; break;
      case 13: // $45
        var $46 = HEAP[$i];
        var $47 = ($46 + 1)&4294967295;
        HEAP[$i] = $47;;
        __label__ = 3; break;
      case 5: // $48
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 2: // $49
        var $50 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $50;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_to_boolean.__index__ = Runtime.getFunctionIndex(_lil_to_boolean, "_lil_to_boolean");
  
  
  function _lil_free($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $i = __stackBase__+4;
        var $next = __stackBase__+8;
        HEAP[$1] = $lil;;
        var $2 = HEAP[$1];
        var $3 = $2 != 0;
        if ($3) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $4
        __label__ = 2; break;
      case 0: // $5
        var $6 = HEAP[$1];
        var $7 = $6+64;
        var $8 = HEAP[$7];
        _free($8);
        var $9 = HEAP[$1];
        var $10 = $9+52;
        var $11 = HEAP[$10];
        _lil_free_value($11);
        __label__ = 3; break;
      case 3: // $12
        var $13 = HEAP[$1];
        var $14 = $13+40;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $17
        var $18 = HEAP[$1];
        var $19 = $18+40;
        var $20 = HEAP[$19];
        var $21 = $20;
        var $22 = HEAP[$21];
        HEAP[$next] = $22;;
        var $23 = HEAP[$1];
        var $24 = $23+40;
        var $25 = HEAP[$24];
        _lil_free_env($25);
        var $26 = HEAP[$next];
        var $27 = HEAP[$1];
        var $28 = $27+40;
        HEAP[$28] = $26;;
        __label__ = 3; break;
      case 5: // $29
        HEAP[$i] = 0;;
        __label__ = 6; break;
      case 6: // $30
        var $31 = HEAP[$i];
        var $32 = HEAP[$1];
        var $33 = $32+20;
        var $34 = HEAP[$33];
        var $35 = unSign($31, 32) < unSign($34, 32);
        if ($35) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $36
        var $37 = HEAP[$i];
        var $38 = HEAP[$1];
        var $39 = $38+16;
        var $40 = HEAP[$39];
        var $41 = $40+4*$37;
        var $42 = HEAP[$41];
        var $43 = $42+8;
        var $44 = HEAP[$43];
        var $45 = $44 != 0;
        if ($45) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $46
        var $47 = HEAP[$i];
        var $48 = HEAP[$1];
        var $49 = $48+16;
        var $50 = HEAP[$49];
        var $51 = $50+4*$47;
        var $52 = HEAP[$51];
        var $53 = $52+8;
        var $54 = HEAP[$53];
        _lil_free_list($54);
        __label__ = 10; break;
      case 10: // $55
        var $56 = HEAP[$i];
        var $57 = HEAP[$1];
        var $58 = $57+16;
        var $59 = HEAP[$58];
        var $60 = $59+4*$56;
        var $61 = HEAP[$60];
        var $62 = $61+4;
        var $63 = HEAP[$62];
        _lil_free_value($63);
        var $64 = HEAP[$i];
        var $65 = HEAP[$1];
        var $66 = $65+16;
        var $67 = HEAP[$66];
        var $68 = $67+4*$64;
        var $69 = HEAP[$68];
        var $70 = $69;
        var $71 = HEAP[$70];
        _free($71);
        var $72 = HEAP[$i];
        var $73 = HEAP[$1];
        var $74 = $73+16;
        var $75 = HEAP[$74];
        var $76 = $75+4*$72;
        var $77 = HEAP[$76];
        var $78 = $77;
        _free($78);
        __label__ = 11; break;
      case 11: // $79
        var $80 = HEAP[$i];
        var $81 = ($80 + 1)&4294967295;
        HEAP[$i] = $81;;
        __label__ = 6; break;
      case 8: // $82
        var $83 = HEAP[$1];
        var $84 = $83+16;
        var $85 = HEAP[$84];
        var $86 = $85;
        _free($86);
        var $87 = HEAP[$1];
        var $88 = $87+36;
        var $89 = HEAP[$88];
        _free($89);
        var $90 = HEAP[$1];
        var $91 = $90+28;
        var $92 = HEAP[$91];
        _free($92);
        var $93 = HEAP[$1];
        var $94 = $93;
        _free($94);
        __label__ = 2; break;
      case 2: // $95
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _lil_free.__index__ = Runtime.getFunctionIndex(_lil_free, "_lil_free");
  
  
  function _lil_set_data($lil, $data) {
    var __stackBase__  = STACKTOP; STACKTOP += 8; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    var $2 = __stackBase__+4;
    HEAP[$1] = $lil;;
    HEAP[$2] = $data;;
    var $3 = HEAP[$2];
    var $4 = HEAP[$1];
    var $5 = $4+104;
    HEAP[$5] = $3;;
    STACKTOP = __stackBase__;
    return;
  }
  _lil_set_data.__index__ = Runtime.getFunctionIndex(_lil_set_data, "_lil_set_data");
  
  
  function _lil_get_data($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    HEAP[$1] = $lil;;
    var $2 = HEAP[$1];
    var $3 = $2+104;
    var $4 = HEAP[$3];
    STACKTOP = __stackBase__;
    return $4;
  }
  _lil_get_data.__index__ = Runtime.getFunctionIndex(_lil_get_data, "_lil_get_data");
  
  
  function _fnc_reflect($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 76; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $func = __stackBase__+16;
        var $type = __stackBase__+20;
        var $i = __stackBase__+24;
        var $r = __stackBase__+28;
        var $funcs = __stackBase__+32;
        var $vars = __stackBase__+36;
        var $env = __stackBase__+40;
        var $vars1 = __stackBase__+44;
        var $target = __stackBase__+48;
        var $target2 = __stackBase__+52;
        var $env3 = __stackBase__+56;
        var $target4 = __stackBase__+60;
        var $r5 = __stackBase__+64;
        var $env6 = __stackBase__+68;
        var $env7 = __stackBase__+72;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        HEAP[$type] = $12;;
        var $13 = HEAP[$type];
        var $14 = _strcmp($13, __str77);
        var $15 = $14 != 0;
        if ($15) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $16
        var $17 = _lil_alloc_string(__str78);
        HEAP[$1] = $17;;
        __label__ = 2; break;
      case 3: // $18
        var $19 = HEAP[$type];
        var $20 = _strcmp($19, __str1);
        var $21 = $20 != 0;
        if ($21) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $22
        var $23 = HEAP[$3];
        var $24 = unSign($23, 32) < unSign(2, 32);
        if ($24) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $25
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 8: // $26
        var $27 = HEAP[$2];
        var $28 = HEAP[$4];
        var $29 = $28+4;
        var $30 = HEAP[$29];
        var $31 = _lil_to_string($30);
        var $32 = _find_cmd($27, $31);
        HEAP[$func] = $32;;
        var $33 = HEAP[$func];
        var $34 = $33 != 0;
        if ($34) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $35
        var $36 = HEAP[$func];
        var $37 = $36+8;
        var $38 = HEAP[$37];
        var $39 = $38 != 0;
        if ($39) { __label__ = 11; break; } else { __label__ = 10; break; }
      case 10: // $40
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 11: // $41
        var $42 = HEAP[$func];
        var $43 = $42+8;
        var $44 = HEAP[$43];
        var $45 = _lil_list_to_value($44, 1);
        HEAP[$1] = $45;;
        __label__ = 2; break;
      case 5: // $46
        var $47 = HEAP[$type];
        var $48 = _strcmp($47, __str79);
        var $49 = $48 != 0;
        if ($49) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 13: // $50
        var $51 = HEAP[$3];
        var $52 = unSign($51, 32) < unSign(2, 32);
        if ($52) { __label__ = 14; break; } else { __label__ = 15; break; }
      case 14: // $53
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 15: // $54
        var $55 = HEAP[$2];
        var $56 = HEAP[$4];
        var $57 = $56+4;
        var $58 = HEAP[$57];
        var $59 = _lil_to_string($58);
        var $60 = _find_cmd($55, $59);
        HEAP[$func] = $60;;
        var $61 = HEAP[$func];
        var $62 = $61 != 0;
        if ($62) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 16: // $63
        var $64 = HEAP[$func];
        var $65 = $64+12;
        var $66 = HEAP[$65];
        var $67 = $66 != 0;
        if ($67) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $68
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 18: // $69
        var $70 = HEAP[$func];
        var $71 = $70+4;
        var $72 = HEAP[$71];
        var $73 = _lil_clone_value($72);
        HEAP[$1] = $73;;
        __label__ = 2; break;
      case 12: // $74
        var $75 = HEAP[$type];
        var $76 = _strcmp($75, __str80);
        var $77 = $76 != 0;
        if ($77) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 20: // $78
        var $79 = HEAP[$2];
        var $80 = $79+20;
        var $81 = HEAP[$80];
        var $82 = $81;
        var $83 = _lil_alloc_integer($82);
        HEAP[$1] = $83;;
        __label__ = 2; break;
      case 19: // $84
        var $85 = HEAP[$type];
        var $86 = _strcmp($85, __str81);
        var $87 = $86 != 0;
        if ($87) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 22: // $88
        var $89 = _lil_alloc_list();
        HEAP[$funcs] = $89;;
        HEAP[$i] = 0;;
        __label__ = 23; break;
      case 23: // $90
        var $91 = HEAP[$i];
        var $92 = HEAP[$2];
        var $93 = $92+20;
        var $94 = HEAP[$93];
        var $95 = unSign($91, 32) < unSign($94, 32);
        if ($95) { __label__ = 24; break; } else { __label__ = 25; break; }
      case 24: // $96
        var $97 = HEAP[$funcs];
        var $98 = HEAP[$i];
        var $99 = HEAP[$2];
        var $100 = $99+16;
        var $101 = HEAP[$100];
        var $102 = $101+4*$98;
        var $103 = HEAP[$102];
        var $104 = $103;
        var $105 = HEAP[$104];
        var $106 = _lil_alloc_string($105);
        _lil_list_append($97, $106);
        __label__ = 26; break;
      case 26: // $107
        var $108 = HEAP[$i];
        var $109 = ($108 + 1)&4294967295;
        HEAP[$i] = $109;;
        __label__ = 23; break;
      case 25: // $110
        var $111 = HEAP[$funcs];
        var $112 = _lil_list_to_value($111, 1);
        HEAP[$r] = $112;;
        var $113 = HEAP[$funcs];
        _lil_free_list($113);
        var $114 = HEAP[$r];
        HEAP[$1] = $114;;
        __label__ = 2; break;
      case 21: // $115
        var $116 = HEAP[$type];
        var $117 = _strcmp($116, __str82);
        var $118 = $117 != 0;
        if ($118) { __label__ = 27; break; } else { __label__ = 28; break; }
      case 28: // $119
        var $120 = _lil_alloc_list();
        HEAP[$vars] = $120;;
        var $121 = HEAP[$2];
        var $122 = $121+40;
        var $123 = HEAP[$122];
        HEAP[$env] = $123;;
        __label__ = 29; break;
      case 29: // $124
        var $125 = HEAP[$env];
        var $126 = $125 != 0;
        if ($126) { __label__ = 30; break; } else { __label__ = 31; break; }
      case 30: // $127
        HEAP[$i] = 0;;
        __label__ = 32; break;
      case 32: // $128
        var $129 = HEAP[$i];
        var $130 = HEAP[$env];
        var $131 = $130+16;
        var $132 = HEAP[$131];
        var $133 = unSign($129, 32) < unSign($132, 32);
        if ($133) { __label__ = 33; break; } else { __label__ = 34; break; }
      case 33: // $134
        var $135 = HEAP[$vars];
        var $136 = HEAP[$i];
        var $137 = HEAP[$env];
        var $138 = $137+12;
        var $139 = HEAP[$138];
        var $140 = $139+4*$136;
        var $141 = HEAP[$140];
        var $142 = $141;
        var $143 = HEAP[$142];
        var $144 = _lil_alloc_string($143);
        _lil_list_append($135, $144);
        __label__ = 35; break;
      case 35: // $145
        var $146 = HEAP[$i];
        var $147 = ($146 + 1)&4294967295;
        HEAP[$i] = $147;;
        __label__ = 32; break;
      case 34: // $148
        var $149 = HEAP[$env];
        var $150 = $149;
        var $151 = HEAP[$150];
        HEAP[$env] = $151;;
        __label__ = 29; break;
      case 31: // $152
        var $153 = HEAP[$vars];
        var $154 = _lil_list_to_value($153, 1);
        HEAP[$r] = $154;;
        var $155 = HEAP[$vars];
        _lil_free_list($155);
        var $156 = HEAP[$r];
        HEAP[$1] = $156;;
        __label__ = 2; break;
      case 27: // $157
        var $158 = HEAP[$type];
        var $159 = _strcmp($158, __str83);
        var $160 = $159 != 0;
        if ($160) { __label__ = 36; break; } else { __label__ = 37; break; }
      case 37: // $161
        var $162 = _lil_alloc_list();
        HEAP[$vars1] = $162;;
        HEAP[$i] = 0;;
        __label__ = 38; break;
      case 38: // $163
        var $164 = HEAP[$i];
        var $165 = HEAP[$2];
        var $166 = $165+44;
        var $167 = HEAP[$166];
        var $168 = $167+16;
        var $169 = HEAP[$168];
        var $170 = unSign($164, 32) < unSign($169, 32);
        if ($170) { __label__ = 39; break; } else { __label__ = 40; break; }
      case 39: // $171
        var $172 = HEAP[$vars1];
        var $173 = HEAP[$i];
        var $174 = HEAP[$2];
        var $175 = $174+44;
        var $176 = HEAP[$175];
        var $177 = $176+12;
        var $178 = HEAP[$177];
        var $179 = $178+4*$173;
        var $180 = HEAP[$179];
        var $181 = $180;
        var $182 = HEAP[$181];
        var $183 = _lil_alloc_string($182);
        _lil_list_append($172, $183);
        __label__ = 41; break;
      case 41: // $184
        var $185 = HEAP[$i];
        var $186 = ($185 + 1)&4294967295;
        HEAP[$i] = $186;;
        __label__ = 38; break;
      case 40: // $187
        var $188 = HEAP[$vars1];
        var $189 = _lil_list_to_value($188, 1);
        HEAP[$r] = $189;;
        var $190 = HEAP[$vars1];
        _lil_free_list($190);
        var $191 = HEAP[$r];
        HEAP[$1] = $191;;
        __label__ = 2; break;
      case 36: // $192
        var $193 = HEAP[$type];
        var $194 = _strcmp($193, __str84);
        var $195 = $194 != 0;
        if ($195) { __label__ = 42; break; } else { __label__ = 43; break; }
      case 43: // $196
        var $197 = HEAP[$3];
        var $198 = $197 == 1;
        if ($198) { __label__ = 44; break; } else { __label__ = 45; break; }
      case 44: // $199
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 45: // $200
        var $201 = HEAP[$4];
        var $202 = $201+4;
        var $203 = HEAP[$202];
        var $204 = _lil_to_string($203);
        HEAP[$target] = $204;;
        HEAP[$i] = 0;;
        __label__ = 46; break;
      case 46: // $205
        var $206 = HEAP[$i];
        var $207 = HEAP[$2];
        var $208 = $207+20;
        var $209 = HEAP[$208];
        var $210 = unSign($206, 32) < unSign($209, 32);
        if ($210) { __label__ = 47; break; } else { __label__ = 48; break; }
      case 47: // $211
        var $212 = HEAP[$target];
        var $213 = HEAP[$i];
        var $214 = HEAP[$2];
        var $215 = $214+16;
        var $216 = HEAP[$215];
        var $217 = $216+4*$213;
        var $218 = HEAP[$217];
        var $219 = $218;
        var $220 = HEAP[$219];
        var $221 = _strcmp($212, $220);
        var $222 = $221 != 0;
        if ($222) { __label__ = 49; break; } else { __label__ = 50; break; }
      case 50: // $223
        var $224 = _lil_alloc_string(__str85);
        HEAP[$1] = $224;;
        __label__ = 2; break;
      case 49: // $225
        __label__ = 51; break;
      case 51: // $226
        var $227 = HEAP[$i];
        var $228 = ($227 + 1)&4294967295;
        HEAP[$i] = $228;;
        __label__ = 46; break;
      case 48: // $229
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 42: // $230
        var $231 = HEAP[$type];
        var $232 = _strcmp($231, __str86);
        var $233 = $232 != 0;
        if ($233) { __label__ = 52; break; } else { __label__ = 53; break; }
      case 53: // $234
        var $235 = HEAP[$2];
        var $236 = $235+40;
        var $237 = HEAP[$236];
        HEAP[$env3] = $237;;
        var $238 = HEAP[$3];
        var $239 = $238 == 1;
        if ($239) { __label__ = 54; break; } else { __label__ = 55; break; }
      case 54: // $240
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 55: // $241
        var $242 = HEAP[$4];
        var $243 = $242+4;
        var $244 = HEAP[$243];
        var $245 = _lil_to_string($244);
        HEAP[$target2] = $245;;
        __label__ = 56; break;
      case 56: // $246
        var $247 = HEAP[$env3];
        var $248 = $247 != 0;
        if ($248) { __label__ = 57; break; } else { __label__ = 58; break; }
      case 57: // $249
        HEAP[$i] = 0;;
        __label__ = 59; break;
      case 59: // $250
        var $251 = HEAP[$i];
        var $252 = HEAP[$env3];
        var $253 = $252+16;
        var $254 = HEAP[$253];
        var $255 = unSign($251, 32) < unSign($254, 32);
        if ($255) { __label__ = 60; break; } else { __label__ = 61; break; }
      case 60: // $256
        var $257 = HEAP[$target2];
        var $258 = HEAP[$i];
        var $259 = HEAP[$env3];
        var $260 = $259+12;
        var $261 = HEAP[$260];
        var $262 = $261+4*$258;
        var $263 = HEAP[$262];
        var $264 = $263;
        var $265 = HEAP[$264];
        var $266 = _strcmp($257, $265);
        var $267 = $266 != 0;
        if ($267) { __label__ = 62; break; } else { __label__ = 63; break; }
      case 63: // $268
        var $269 = _lil_alloc_string(__str85);
        HEAP[$1] = $269;;
        __label__ = 2; break;
      case 62: // $270
        __label__ = 64; break;
      case 64: // $271
        var $272 = HEAP[$i];
        var $273 = ($272 + 1)&4294967295;
        HEAP[$i] = $273;;
        __label__ = 59; break;
      case 61: // $274
        var $275 = HEAP[$env3];
        var $276 = $275;
        var $277 = HEAP[$276];
        HEAP[$env3] = $277;;
        __label__ = 56; break;
      case 58: // $278
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 52: // $279
        var $280 = HEAP[$type];
        var $281 = _strcmp($280, __str87);
        var $282 = $281 != 0;
        if ($282) { __label__ = 65; break; } else { __label__ = 66; break; }
      case 66: // $283
        var $284 = HEAP[$3];
        var $285 = $284 == 1;
        if ($285) { __label__ = 67; break; } else { __label__ = 68; break; }
      case 67: // $286
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 68: // $287
        var $288 = HEAP[$4];
        var $289 = $288+4;
        var $290 = HEAP[$289];
        var $291 = _lil_to_string($290);
        HEAP[$target4] = $291;;
        HEAP[$i] = 0;;
        __label__ = 69; break;
      case 69: // $292
        var $293 = HEAP[$i];
        var $294 = HEAP[$2];
        var $295 = $294+44;
        var $296 = HEAP[$295];
        var $297 = $296+16;
        var $298 = HEAP[$297];
        var $299 = unSign($293, 32) < unSign($298, 32);
        if ($299) { __label__ = 70; break; } else { __label__ = 71; break; }
      case 70: // $300
        var $301 = HEAP[$target4];
        var $302 = HEAP[$i];
        var $303 = HEAP[$2];
        var $304 = $303+44;
        var $305 = HEAP[$304];
        var $306 = $305+12;
        var $307 = HEAP[$306];
        var $308 = $307+4*$302;
        var $309 = HEAP[$308];
        var $310 = $309;
        var $311 = HEAP[$310];
        var $312 = _strcmp($301, $311);
        var $313 = $312 != 0;
        if ($313) { __label__ = 72; break; } else { __label__ = 73; break; }
      case 73: // $314
        var $315 = _lil_alloc_string(__str85);
        HEAP[$1] = $315;;
        __label__ = 2; break;
      case 72: // $316
        __label__ = 74; break;
      case 74: // $317
        var $318 = HEAP[$i];
        var $319 = ($318 + 1)&4294967295;
        HEAP[$i] = $319;;
        __label__ = 69; break;
      case 71: // $320
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 65: // $321
        var $322 = HEAP[$type];
        var $323 = _strcmp($322, __str56);
        var $324 = $323 != 0;
        if ($324) { __label__ = 75; break; } else { __label__ = 76; break; }
      case 76: // $325
        var $326 = HEAP[$2];
        var $327 = $326+64;
        var $328 = HEAP[$327];
        var $329 = $328 != 0;
        if ($329) { __label__ = 77; break; } else { __label__ = 78; break; }
      case 77: // $330
        var $331 = HEAP[$2];
        var $332 = $331+64;
        var $333 = HEAP[$332];
        var $334 = _lil_alloc_string($333);
        __lastLabel__ = 77; __label__ = 79; break;
      case 78: // $335
        __lastLabel__ = 78; __label__ = 79; break;
      case 79: // $336
        var $337 = __lastLabel__ == 77 ? $334 : (0);
        HEAP[$1] = $337;;
        __label__ = 2; break;
      case 75: // $338
        var $339 = HEAP[$type];
        var $340 = _strcmp($339, __str88);
        var $341 = $340 != 0;
        if ($341) { __label__ = 80; break; } else { __label__ = 81; break; }
      case 81: // $342
        var $343 = HEAP[$3];
        var $344 = $343 == 1;
        if ($344) { __label__ = 82; break; } else { __label__ = 83; break; }
      case 82: // $345
        var $346 = HEAP[$2];
        var $347 = $346+36;
        var $348 = HEAP[$347];
        var $349 = _lil_alloc_string($348);
        HEAP[$1] = $349;;
        __label__ = 2; break;
      case 83: // $350
        var $351 = HEAP[$2];
        var $352 = $351+36;
        var $353 = HEAP[$352];
        var $354 = _lil_alloc_string($353);
        HEAP[$r5] = $354;;
        var $355 = HEAP[$2];
        var $356 = $355+36;
        var $357 = HEAP[$356];
        _free($357);
        var $358 = HEAP[$4];
        var $359 = $358+4;
        var $360 = HEAP[$359];
        var $361 = _lil_to_string($360);
        var $362 = _strclone($361);
        var $363 = HEAP[$2];
        var $364 = $363+36;
        HEAP[$364] = $362;;
        var $365 = HEAP[$r5];
        HEAP[$1] = $365;;
        __label__ = 2; break;
      case 80: // $366
        var $367 = HEAP[$type];
        var $368 = _strcmp($367, __str89);
        var $369 = $368 != 0;
        if ($369) { __label__ = 84; break; } else { __label__ = 85; break; }
      case 85: // $370
        var $371 = HEAP[$2];
        var $372 = $371+40;
        var $373 = HEAP[$372];
        HEAP[$env6] = $373;;
        __label__ = 86; break;
      case 86: // $374
        var $375 = HEAP[$env6];
        var $376 = HEAP[$2];
        var $377 = $376+44;
        var $378 = HEAP[$377];
        var $379 = $375 != $378;
        if ($379) { __lastLabel__ = 86; __label__ = 87; break; } else { __lastLabel__ = 86; __label__ = 88; break; }
      case 87: // $380
        var $381 = HEAP[$env6];
        var $382 = $381+8;
        var $383 = HEAP[$382];
        var $384 = $383 != 0;
        if ($384) { __lastLabel__ = 87; __label__ = 88; break; } else { __lastLabel__ = 87; __label__ = 89; break; }
      case 89: // $385
        var $386 = HEAP[$env6];
        var $387 = $386+4;
        var $388 = HEAP[$387];
        var $389 = $388 != 0;
        var $390 = $389 ^ 1;
        __lastLabel__ = 89; __label__ = 88; break;
      case 88: // $391
        var $392 = __lastLabel__ == 87 ? 0 : (__lastLabel__ == 86 ? 0 : ($390));
        if ($392) { __label__ = 90; break; } else { __label__ = 91; break; }
      case 90: // $393
        var $394 = HEAP[$env6];
        var $395 = $394;
        var $396 = HEAP[$395];
        HEAP[$env6] = $396;;
        __label__ = 86; break;
      case 91: // $397
        var $398 = HEAP[$env6];
        var $399 = $398+8;
        var $400 = HEAP[$399];
        var $401 = $400 != 0;
        if ($401) { __label__ = 92; break; } else { __label__ = 93; break; }
      case 92: // $402
        var $403 = HEAP[$2];
        var $404 = $403+28;
        var $405 = HEAP[$404];
        var $406 = _lil_alloc_string($405);
        HEAP[$1] = $406;;
        __label__ = 2; break;
      case 93: // $407
        var $408 = HEAP[$env6];
        var $409 = HEAP[$2];
        var $410 = $409+44;
        var $411 = HEAP[$410];
        var $412 = $408 == $411;
        if ($412) { __label__ = 94; break; } else { __label__ = 95; break; }
      case 94: // $413
        var $414 = HEAP[$2];
        var $415 = $414+4;
        var $416 = HEAP[$415];
        var $417 = _lil_alloc_string($416);
        HEAP[$1] = $417;;
        __label__ = 2; break;
      case 95: // $418
        var $419 = HEAP[$env6];
        var $420 = $419+4;
        var $421 = HEAP[$420];
        var $422 = $421 != 0;
        if ($422) { __label__ = 96; break; } else { __label__ = 97; break; }
      case 96: // $423
        var $424 = HEAP[$env6];
        var $425 = $424+4;
        var $426 = HEAP[$425];
        var $427 = $426+4;
        var $428 = HEAP[$427];
        __lastLabel__ = 96; __label__ = 98; break;
      case 97: // $429
        __lastLabel__ = 97; __label__ = 98; break;
      case 98: // $430
        var $431 = __lastLabel__ == 96 ? $428 : (0);
        HEAP[$1] = $431;;
        __label__ = 2; break;
      case 84: // $432
        var $433 = HEAP[$type];
        var $434 = _strcmp($433, __str90);
        var $435 = $434 != 0;
        if ($435) { __label__ = 99; break; } else { __label__ = 100; break; }
      case 100: // $436
        var $437 = HEAP[$2];
        var $438 = $437+40;
        var $439 = HEAP[$438];
        HEAP[$env7] = $439;;
        __label__ = 101; break;
      case 101: // $440
        var $441 = HEAP[$env7];
        var $442 = HEAP[$2];
        var $443 = $442+44;
        var $444 = HEAP[$443];
        var $445 = $441 != $444;
        if ($445) { __lastLabel__ = 101; __label__ = 102; break; } else { __lastLabel__ = 101; __label__ = 103; break; }
      case 102: // $446
        var $447 = HEAP[$env7];
        var $448 = $447+8;
        var $449 = HEAP[$448];
        var $450 = $449 != 0;
        if ($450) { __lastLabel__ = 102; __label__ = 103; break; } else { __lastLabel__ = 102; __label__ = 104; break; }
      case 104: // $451
        var $452 = HEAP[$env7];
        var $453 = $452+4;
        var $454 = HEAP[$453];
        var $455 = $454 != 0;
        var $456 = $455 ^ 1;
        __lastLabel__ = 104; __label__ = 103; break;
      case 103: // $457
        var $458 = __lastLabel__ == 102 ? 0 : (__lastLabel__ == 101 ? 0 : ($456));
        if ($458) { __label__ = 105; break; } else { __label__ = 106; break; }
      case 105: // $459
        var $460 = HEAP[$env7];
        var $461 = $460;
        var $462 = HEAP[$461];
        HEAP[$env7] = $462;;
        __label__ = 101; break;
      case 106: // $463
        var $464 = HEAP[$env7];
        var $465 = $464+8;
        var $466 = HEAP[$465];
        var $467 = $466 != 0;
        if ($467) { __label__ = 107; break; } else { __label__ = 108; break; }
      case 107: // $468
        var $469 = HEAP[$env7];
        var $470 = $469+8;
        var $471 = HEAP[$470];
        HEAP[$1] = $471;;
        __label__ = 2; break;
      case 108: // $472
        var $473 = HEAP[$env7];
        var $474 = HEAP[$2];
        var $475 = $474+44;
        var $476 = HEAP[$475];
        var $477 = $473 == $476;
        if ($477) { __label__ = 109; break; } else { __label__ = 110; break; }
      case 109: // $478
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 110: // $479
        var $480 = HEAP[$env7];
        var $481 = $480+4;
        var $482 = HEAP[$481];
        var $483 = $482 != 0;
        if ($483) { __label__ = 111; break; } else { __label__ = 112; break; }
      case 111: // $484
        var $485 = HEAP[$env7];
        var $486 = $485+4;
        var $487 = HEAP[$486];
        var $488 = $487;
        var $489 = HEAP[$488];
        var $490 = _lil_alloc_string($489);
        __lastLabel__ = 111; __label__ = 113; break;
      case 112: // $491
        __lastLabel__ = 112; __label__ = 113; break;
      case 113: // $492
        var $493 = __lastLabel__ == 111 ? $490 : (0);
        HEAP[$1] = $493;;
        __label__ = 2; break;
      case 99: // $494
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 2: // $495
        var $496 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $496;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_reflect.__index__ = Runtime.getFunctionIndex(_fnc_reflect, "_fnc_reflect");
  
  
  function _fnc_func($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $name = __stackBase__+16;
        var $cmd = __stackBase__+20;
        var $tmp = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$3];
        var $10 = $9 == 3;
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $11
        var $12 = HEAP[$4];
        var $13 = $12;
        var $14 = HEAP[$13];
        var $15 = _lil_clone_value($14);
        HEAP[$name] = $15;;
        var $16 = HEAP[$2];
        var $17 = HEAP[$4];
        var $18 = $17;
        var $19 = HEAP[$18];
        var $20 = _lil_to_string($19);
        var $21 = _add_func($16, $20);
        HEAP[$cmd] = $21;;
        var $22 = HEAP[$2];
        var $23 = HEAP[$4];
        var $24 = $23+4;
        var $25 = HEAP[$24];
        var $26 = _lil_subst_to_list($22, $25);
        var $27 = HEAP[$cmd];
        var $28 = $27+8;
        HEAP[$28] = $26;;
        var $29 = HEAP[$4];
        var $30 = $29+8;
        var $31 = HEAP[$30];
        var $32 = _lil_clone_value($31);
        var $33 = HEAP[$cmd];
        var $34 = $33+4;
        HEAP[$34] = $32;;
        __label__ = 5; break;
      case 4: // $35
        var $36 = HEAP[$2];
        var $37 = _lil_unused_name($36, __str76);
        HEAP[$name] = $37;;
        var $38 = HEAP[$2];
        var $39 = HEAP[$name];
        var $40 = _lil_to_string($39);
        var $41 = _add_func($38, $40);
        HEAP[$cmd] = $41;;
        var $42 = HEAP[$3];
        var $43 = unSign($42, 32) < unSign(2, 32);
        if ($43) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $44
        var $45 = _lil_alloc_string(__str1);
        HEAP[$tmp] = $45;;
        var $46 = HEAP[$2];
        var $47 = HEAP[$tmp];
        var $48 = _lil_subst_to_list($46, $47);
        var $49 = HEAP[$cmd];
        var $50 = $49+8;
        HEAP[$50] = $48;;
        var $51 = HEAP[$tmp];
        _lil_free_value($51);
        var $52 = HEAP[$4];
        var $53 = $52;
        var $54 = HEAP[$53];
        var $55 = _lil_clone_value($54);
        var $56 = HEAP[$cmd];
        var $57 = $56+4;
        HEAP[$57] = $55;;
        __label__ = 8; break;
      case 7: // $58
        var $59 = HEAP[$2];
        var $60 = HEAP[$4];
        var $61 = $60;
        var $62 = HEAP[$61];
        var $63 = _lil_subst_to_list($59, $62);
        var $64 = HEAP[$cmd];
        var $65 = $64+8;
        HEAP[$65] = $63;;
        var $66 = HEAP[$4];
        var $67 = $66+4;
        var $68 = HEAP[$67];
        var $69 = _lil_clone_value($68);
        var $70 = HEAP[$cmd];
        var $71 = $70+4;
        HEAP[$71] = $69;;
        __label__ = 8; break;
      case 8: // $72
        __label__ = 5; break;
      case 5: // $73
        var $74 = HEAP[$name];
        HEAP[$1] = $74;;
        __label__ = 2; break;
      case 2: // $75
        var $76 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $76;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_func.__index__ = Runtime.getFunctionIndex(_fnc_func, "_fnc_func");
  
  
  function _fnc_rename($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 36; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $r = __stackBase__+16;
        var $func = __stackBase__+20;
        var $oldname = __stackBase__+24;
        var $newname = __stackBase__+28;
        var $msg = __stackBase__+32;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        HEAP[$oldname] = $12;;
        var $13 = HEAP[$4];
        var $14 = $13+4;
        var $15 = HEAP[$14];
        var $16 = _lil_to_string($15);
        HEAP[$newname] = $16;;
        var $17 = HEAP[$2];
        var $18 = HEAP[$oldname];
        var $19 = _find_cmd($17, $18);
        HEAP[$func] = $19;;
        var $20 = HEAP[$func];
        var $21 = $20 != 0;
        if ($21) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $22
        var $23 = HEAP[$oldname];
        var $24 = _strlen($23);
        var $25 = (24 + $24)&4294967295;
        var $26 = _malloc($25);
        HEAP[$msg] = $26;;
        var $27 = HEAP[$msg];
        var $28 = HEAP[$oldname];
        var $29 = _sprintf($27, __str75, $28);
        var $30 = HEAP[$2];
        var $31 = HEAP[$2];
        var $32 = $31+12;
        var $33 = HEAP[$32];
        var $34 = HEAP[$msg];
        _lil_set_error_at($30, $33, $34);
        var $35 = HEAP[$msg];
        _free($35);
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 3: // $36
        var $37 = HEAP[$func];
        var $38 = $37;
        var $39 = HEAP[$38];
        var $40 = _lil_alloc_string($39);
        HEAP[$r] = $40;;
        var $41 = HEAP[$func];
        var $42 = $41;
        var $43 = HEAP[$42];
        _free($43);
        var $44 = HEAP[$newname];
        var $45 = _strclone($44);
        var $46 = HEAP[$func];
        var $47 = $46;
        HEAP[$47] = $45;;
        var $48 = HEAP[$r];
        HEAP[$1] = $48;;
        __label__ = 2; break;
      case 2: // $49
        var $50 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $50;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_rename.__index__ = Runtime.getFunctionIndex(_fnc_rename, "_fnc_rename");
  
  
  function _fnc_unusedname($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        HEAP[$1] = $lil;;
        HEAP[$2] = $argc;;
        HEAP[$3] = $argv;;
        var $4 = HEAP[$1];
        var $5 = HEAP[$2];
        var $6 = unSign($5, 32) > unSign(0, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8 = HEAP[$3];
        var $9 = $8;
        var $10 = HEAP[$9];
        var $11 = _lil_to_string($10);
        __lastLabel__ = 0; __label__ = 2; break;
      case 1: // $12
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $13
        var $14 = __lastLabel__ == 0 ? $11 : (__str14);
        var $15 = _lil_unused_name($4, $14);
        STACKTOP = __stackBase__;
        return $15;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_unusedname.__index__ = Runtime.getFunctionIndex(_fnc_unusedname, "_fnc_unusedname");
  
  
  function _fnc_quote($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $r = __stackBase__+16;
        var $i = __stackBase__+20;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = _alloc_value(0);
        HEAP[$r] = $9;;
        HEAP[$i] = 0;;
        __label__ = 3; break;
      case 3: // $10
        var $11 = HEAP[$i];
        var $12 = HEAP[$3];
        var $13 = unSign($11, 32) < unSign($12, 32);
        if ($13) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $14
        var $15 = HEAP[$i];
        var $16 = $15 != 0;
        if ($16) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $17
        var $18 = HEAP[$r];
        var $19 = _lil_append_char($18, 32);
        __label__ = 7; break;
      case 7: // $20
        var $21 = HEAP[$r];
        var $22 = HEAP[$i];
        var $23 = HEAP[$4];
        var $24 = $23+4*$22;
        var $25 = HEAP[$24];
        var $26 = _lil_append_val($21, $25);
        __label__ = 8; break;
      case 8: // $27
        var $28 = HEAP[$i];
        var $29 = ($28 + 1)&4294967295;
        HEAP[$i] = $29;;
        __label__ = 3; break;
      case 5: // $30
        var $31 = HEAP[$r];
        HEAP[$1] = $31;;
        __label__ = 2; break;
      case 2: // $32
        var $33 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $33;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_quote.__index__ = Runtime.getFunctionIndex(_fnc_quote, "_fnc_quote");
  
  
  function _fnc_set($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $i = __stackBase__+16;
        var $var = __stackBase__+20;
        var $access = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$i] = 0;;
        HEAP[$access] = 1;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        var $13 = _strcmp($12, __str68);
        var $14 = $13 != 0;
        if ($14) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $15
        HEAP[$i] = 1;;
        HEAP[$access] = 0;;
        __label__ = 3; break;
      case 3: // $16
        __label__ = 5; break;
      case 5: // $17
        var $18 = HEAP[$i];
        var $19 = HEAP[$3];
        var $20 = unSign($18, 32) < unSign($19, 32);
        if ($20) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $21
        var $22 = HEAP[$3];
        var $23 = HEAP[$i];
        var $24 = ($23 + 1)&4294967295;
        var $25 = $22 == $24;
        if ($25) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $26
        var $27 = HEAP[$2];
        var $28 = HEAP[$i];
        var $29 = HEAP[$4];
        var $30 = $29+4*$28;
        var $31 = HEAP[$30];
        var $32 = _lil_to_string($31);
        var $33 = _lil_get_var($27, $32);
        var $34 = _lil_clone_value($33);
        HEAP[$1] = $34;;
        __label__ = 2; break;
      case 9: // $35
        var $36 = HEAP[$2];
        var $37 = HEAP[$i];
        var $38 = HEAP[$4];
        var $39 = $38+4*$37;
        var $40 = HEAP[$39];
        var $41 = _lil_to_string($40);
        var $42 = HEAP[$i];
        var $43 = ($42 + 1)&4294967295;
        var $44 = HEAP[$4];
        var $45 = $44+4*$43;
        var $46 = HEAP[$45];
        var $47 = HEAP[$access];
        var $48 = _lil_set_var($36, $41, $46, $47);
        HEAP[$var] = $48;;
        var $49 = HEAP[$i];
        var $50 = ($49 + 2)&4294967295;
        HEAP[$i] = $50;;
        __label__ = 5; break;
      case 7: // $51
        var $52 = HEAP[$var];
        var $53 = $52 != 0;
        if ($53) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $54
        var $55 = HEAP[$var];
        var $56 = $55+8;
        var $57 = HEAP[$56];
        var $58 = _lil_clone_value($57);
        __lastLabel__ = 10; __label__ = 12; break;
      case 11: // $59
        __lastLabel__ = 11; __label__ = 12; break;
      case 12: // $60
        var $61 = __lastLabel__ == 10 ? $58 : (0);
        HEAP[$1] = $61;;
        __label__ = 2; break;
      case 2: // $62
        var $63 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $63;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_set.__index__ = Runtime.getFunctionIndex(_fnc_set, "_fnc_set");
  
  
  function _fnc_write($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $i = __stackBase__+12;
        var $msg = __stackBase__+16;
        var $proc = __stackBase__+20;
        HEAP[$1] = $lil;;
        HEAP[$2] = $argc;;
        HEAP[$3] = $argv;;
        var $4 = _lil_alloc_string(0);
        HEAP[$msg] = $4;;
        HEAP[$i] = 0;;
        __label__ = 0; break;
      case 0: // $5
        var $6 = HEAP[$i];
        var $7 = HEAP[$2];
        var $8 = unSign($6, 32) < unSign($7, 32);
        if ($8) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $9
        var $10 = HEAP[$i];
        var $11 = $10 != 0;
        if ($11) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $12
        var $13 = HEAP[$msg];
        var $14 = _lil_append_char($13, 32);
        __label__ = 4; break;
      case 4: // $15
        var $16 = HEAP[$msg];
        var $17 = HEAP[$i];
        var $18 = HEAP[$3];
        var $19 = $18+4*$17;
        var $20 = HEAP[$19];
        var $21 = _lil_append_val($16, $20);
        __label__ = 5; break;
      case 5: // $22
        var $23 = HEAP[$i];
        var $24 = ($23 + 1)&4294967295;
        HEAP[$i] = $24;;
        __label__ = 0; break;
      case 2: // $25
        var $26 = HEAP[$1];
        var $27 = $26+68;
        var $28 = $27+4;
        var $29 = HEAP[$28];
        var $30 = $29 != 0;
        if ($30) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $31
        var $32 = HEAP[$1];
        var $33 = $32+68;
        var $34 = $33+4;
        var $35 = HEAP[$34];
        var $36 = $35;
        HEAP[$proc] = $36;;
        var $37 = HEAP[$proc];
        var $38 = HEAP[$1];
        var $39 = HEAP[$msg];
        var $40 = _lil_to_string($39);
        FUNCTION_TABLE[$37]($38, $40);
        __label__ = 8; break;
      case 7: // $41
        var $42 = HEAP[$msg];
        var $43 = _lil_to_string($42);
        var $44 = _printf(__str74, $43);
        __label__ = 8; break;
      case 8: // $45
        var $46 = HEAP[$msg];
        _lil_free_value($46);
        STACKTOP = __stackBase__;
        return 0;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_write.__index__ = Runtime.getFunctionIndex(_fnc_write, "_fnc_write");
  
  
  function _fnc_print($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $proc = __stackBase__+12;
        HEAP[$1] = $lil;;
        HEAP[$2] = $argc;;
        HEAP[$3] = $argv;;
        var $4 = HEAP[$1];
        var $5 = HEAP[$2];
        var $6 = HEAP[$3];
        var $7 = _fnc_write($4, $5, $6);
        var $8 = HEAP[$1];
        var $9 = $8+68;
        var $10 = $9+4;
        var $11 = HEAP[$10];
        var $12 = $11 != 0;
        if ($12) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $13
        var $14 = HEAP[$1];
        var $15 = $14+68;
        var $16 = $15+4;
        var $17 = HEAP[$16];
        var $18 = $17;
        HEAP[$proc] = $18;;
        var $19 = HEAP[$proc];
        var $20 = HEAP[$1];
        FUNCTION_TABLE[$19]($20, __str73);
        __label__ = 2; break;
      case 1: // $21
        var $22 = _printf(__str73);
        __label__ = 2; break;
      case 2: // $23
        STACKTOP = __stackBase__;
        return 0;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_print.__index__ = Runtime.getFunctionIndex(_fnc_print, "_fnc_print");
  
  
  function _fnc_eval($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $val = __stackBase__+16;
        var $r = __stackBase__+20;
        var $i = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = $5 == 1;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8 = HEAP[$2];
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_parse_value($8, $11, 0);
        HEAP[$1] = $12;;
        __label__ = 2; break;
      case 1: // $13
        var $14 = HEAP[$3];
        var $15 = unSign($14, 32) > unSign(1, 32);
        if ($15) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $16
        var $17 = _alloc_value(0);
        HEAP[$val] = $17;;
        HEAP[$i] = 0;;
        __label__ = 5; break;
      case 5: // $18
        var $19 = HEAP[$i];
        var $20 = HEAP[$3];
        var $21 = unSign($19, 32) < unSign($20, 32);
        if ($21) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $22
        var $23 = HEAP[$i];
        var $24 = $23 != 0;
        if ($24) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $25
        var $26 = HEAP[$val];
        var $27 = _lil_append_char($26, 32);
        __label__ = 9; break;
      case 9: // $28
        var $29 = HEAP[$val];
        var $30 = HEAP[$i];
        var $31 = HEAP[$4];
        var $32 = $31+4*$30;
        var $33 = HEAP[$32];
        var $34 = _lil_append_val($29, $33);
        __label__ = 10; break;
      case 10: // $35
        var $36 = HEAP[$i];
        var $37 = ($36 + 1)&4294967295;
        HEAP[$i] = $37;;
        __label__ = 5; break;
      case 7: // $38
        var $39 = HEAP[$2];
        var $40 = HEAP[$val];
        var $41 = _lil_parse_value($39, $40, 0);
        HEAP[$r] = $41;;
        var $42 = HEAP[$val];
        _lil_free_value($42);
        var $43 = HEAP[$r];
        HEAP[$1] = $43;;
        __label__ = 2; break;
      case 4: // $44
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 2: // $45
        var $46 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $46;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_eval.__index__ = Runtime.getFunctionIndex(_fnc_eval, "_fnc_eval");
  
  
  function _fnc_upeval($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $thisenv = __stackBase__+16;
        var $thisdownenv = __stackBase__+20;
        var $r = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$2];
        var $6 = $5+40;
        var $7 = HEAP[$6];
        HEAP[$thisenv] = $7;;
        var $8 = HEAP[$2];
        var $9 = $8+48;
        var $10 = HEAP[$9];
        HEAP[$thisdownenv] = $10;;
        var $11 = HEAP[$2];
        var $12 = $11+44;
        var $13 = HEAP[$12];
        var $14 = HEAP[$thisenv];
        var $15 = $13 == $14;
        if ($15) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $16
        var $17 = HEAP[$2];
        var $18 = HEAP[$3];
        var $19 = HEAP[$4];
        var $20 = _fnc_eval($17, $18, $19);
        HEAP[$1] = $20;;
        __label__ = 2; break;
      case 1: // $21
        var $22 = HEAP[$thisenv];
        var $23 = $22;
        var $24 = HEAP[$23];
        var $25 = HEAP[$2];
        var $26 = $25+40;
        HEAP[$26] = $24;;
        var $27 = HEAP[$thisenv];
        var $28 = HEAP[$2];
        var $29 = $28+48;
        HEAP[$29] = $27;;
        var $30 = HEAP[$2];
        var $31 = HEAP[$3];
        var $32 = HEAP[$4];
        var $33 = _fnc_eval($30, $31, $32);
        HEAP[$r] = $33;;
        var $34 = HEAP[$thisenv];
        var $35 = HEAP[$2];
        var $36 = $35+40;
        HEAP[$36] = $34;;
        var $37 = HEAP[$thisdownenv];
        var $38 = HEAP[$2];
        var $39 = $38+48;
        HEAP[$39] = $37;;
        var $40 = HEAP[$r];
        HEAP[$1] = $40;;
        __label__ = 2; break;
      case 2: // $41
        var $42 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $42;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_upeval.__index__ = Runtime.getFunctionIndex(_fnc_upeval, "_fnc_upeval");
  
  
  function _fnc_downeval($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $r = __stackBase__+16;
        var $upenv = __stackBase__+20;
        var $downenv = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$2];
        var $6 = $5+40;
        var $7 = HEAP[$6];
        HEAP[$upenv] = $7;;
        var $8 = HEAP[$2];
        var $9 = $8+48;
        var $10 = HEAP[$9];
        HEAP[$downenv] = $10;;
        var $11 = HEAP[$downenv];
        var $12 = $11 != 0;
        if ($12) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $13
        var $14 = HEAP[$2];
        var $15 = HEAP[$3];
        var $16 = HEAP[$4];
        var $17 = _fnc_eval($14, $15, $16);
        HEAP[$1] = $17;;
        __label__ = 2; break;
      case 0: // $18
        var $19 = HEAP[$2];
        var $20 = $19+48;
        HEAP[$20] = 0;;
        var $21 = HEAP[$downenv];
        var $22 = HEAP[$2];
        var $23 = $22+40;
        HEAP[$23] = $21;;
        var $24 = HEAP[$2];
        var $25 = HEAP[$3];
        var $26 = HEAP[$4];
        var $27 = _fnc_eval($24, $25, $26);
        HEAP[$r] = $27;;
        var $28 = HEAP[$downenv];
        var $29 = HEAP[$2];
        var $30 = $29+48;
        HEAP[$30] = $28;;
        var $31 = HEAP[$upenv];
        var $32 = HEAP[$2];
        var $33 = $32+40;
        HEAP[$33] = $31;;
        var $34 = HEAP[$r];
        HEAP[$1] = $34;;
        __label__ = 2; break;
      case 2: // $35
        var $36 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $36;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_downeval.__index__ = Runtime.getFunctionIndex(_fnc_downeval, "_fnc_downeval");
  
  
  function _fnc_jaileval($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 36; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $i = __stackBase__+16;
        var $sublil = __stackBase__+20;
        var $r = __stackBase__+24;
        var $base = __stackBase__+28;
        var $fnc = __stackBase__+32;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$base] = 0;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        var $13 = _strcmp($12, __str72);
        var $14 = $13 != 0;
        if ($14) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $15
        HEAP[$base] = 1;;
        var $16 = HEAP[$3];
        var $17 = $16 == 1;
        if ($17) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $18
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 6: // $19
        __label__ = 3; break;
      case 3: // $20
        var $21 = _lil_new();
        HEAP[$sublil] = $21;;
        var $22 = HEAP[$base];
        var $23 = $22 != 1;
        if ($23) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $24
        var $25 = HEAP[$2];
        var $26 = $25+24;
        var $27 = HEAP[$26];
        HEAP[$i] = $27;;
        __label__ = 9; break;
      case 9: // $28
        var $29 = HEAP[$i];
        var $30 = HEAP[$2];
        var $31 = $30+20;
        var $32 = HEAP[$31];
        var $33 = unSign($29, 32) < unSign($32, 32);
        if ($33) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $34
        var $35 = HEAP[$i];
        var $36 = HEAP[$2];
        var $37 = $36+16;
        var $38 = HEAP[$37];
        var $39 = $38+4*$35;
        var $40 = HEAP[$39];
        HEAP[$fnc] = $40;;
        var $41 = HEAP[$fnc];
        var $42 = $41+12;
        var $43 = HEAP[$42];
        var $44 = $43 != 0;
        if ($44) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 13: // $45
        __label__ = 14; break;
      case 12: // $46
        var $47 = HEAP[$sublil];
        var $48 = HEAP[$fnc];
        var $49 = $48;
        var $50 = HEAP[$49];
        var $51 = HEAP[$fnc];
        var $52 = $51+12;
        var $53 = HEAP[$52];
        var $54 = _lil_register($47, $50, $53);
        __label__ = 14; break;
      case 14: // $55
        var $56 = HEAP[$i];
        var $57 = ($56 + 1)&4294967295;
        HEAP[$i] = $57;;
        __label__ = 9; break;
      case 11: // $58
        __label__ = 8; break;
      case 8: // $59
        var $60 = HEAP[$sublil];
        var $61 = HEAP[$base];
        var $62 = HEAP[$4];
        var $63 = $62+4*$61;
        var $64 = HEAP[$63];
        var $65 = _lil_parse_value($60, $64, 1);
        HEAP[$r] = $65;;
        var $66 = HEAP[$sublil];
        _lil_free($66);
        var $67 = HEAP[$r];
        HEAP[$1] = $67;;
        __label__ = 2; break;
      case 2: // $68
        var $69 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $69;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_jaileval.__index__ = Runtime.getFunctionIndex(_fnc_jaileval, "_fnc_jaileval");
  
  
  function _fnc_count($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 84; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $buff = __stackBase__+20;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $7
        var $8 = _alloc_value(__str70);
        HEAP[$1] = $8;;
        __label__ = 2; break;
      case 0: // $9
        var $10 = HEAP[$2];
        var $11 = HEAP[$4];
        var $12 = $11;
        var $13 = HEAP[$12];
        var $14 = _lil_subst_to_list($10, $13);
        HEAP[$list] = $14;;
        var $15 = $buff;
        var $16 = HEAP[$list];
        var $17 = $16+4;
        var $18 = HEAP[$17];
        var $19 = _sprintf($15, __str71, $18);
        var $20 = HEAP[$list];
        _lil_free_list($20);
        var $21 = $buff;
        var $22 = _alloc_value($21);
        HEAP[$1] = $22;;
        __label__ = 2; break;
      case 2: // $23
        var $24 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $24;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_count.__index__ = Runtime.getFunctionIndex(_fnc_count, "_fnc_count");
  
  
  function _fnc_index($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $index = __stackBase__+20;
        var $r = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = HEAP[$4];
        var $11 = $10;
        var $12 = HEAP[$11];
        var $13 = _lil_subst_to_list($9, $12);
        HEAP[$list] = $13;;
        var $14 = HEAP[$4];
        var $15 = $14+4;
        var $16 = HEAP[$15];
        var $17 = _lil_to_integer($16);
        var $18 = (($17) & 4294967295);
        HEAP[$index] = $18;;
        var $19 = HEAP[$index];
        var $20 = HEAP[$list];
        var $21 = $20+4;
        var $22 = HEAP[$21];
        var $23 = unSign($19, 32) >= unSign($22, 32);
        if ($23) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $24
        HEAP[$r] = 0;;
        __label__ = 5; break;
      case 4: // $25
        var $26 = HEAP[$index];
        var $27 = HEAP[$list];
        var $28 = $27;
        var $29 = HEAP[$28];
        var $30 = $29+4*$26;
        var $31 = HEAP[$30];
        var $32 = _lil_clone_value($31);
        HEAP[$r] = $32;;
        __label__ = 5; break;
      case 5: // $33
        var $34 = HEAP[$list];
        _lil_free_list($34);
        var $35 = HEAP[$r];
        HEAP[$1] = $35;;
        __label__ = 2; break;
      case 2: // $36
        var $37 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $37;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_index.__index__ = Runtime.getFunctionIndex(_fnc_index, "_fnc_index");
  
  
  function _fnc_indexof($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $index = __stackBase__+20;
        var $r = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$r] = 0;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = HEAP[$4];
        var $11 = $10;
        var $12 = HEAP[$11];
        var $13 = _lil_subst_to_list($9, $12);
        HEAP[$list] = $13;;
        HEAP[$index] = 0;;
        __label__ = 3; break;
      case 3: // $14
        var $15 = HEAP[$index];
        var $16 = HEAP[$list];
        var $17 = $16+4;
        var $18 = HEAP[$17];
        var $19 = unSign($15, 32) < unSign($18, 32);
        if ($19) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $20
        var $21 = HEAP[$index];
        var $22 = HEAP[$list];
        var $23 = $22;
        var $24 = HEAP[$23];
        var $25 = $24+4*$21;
        var $26 = HEAP[$25];
        var $27 = _lil_to_string($26);
        var $28 = HEAP[$4];
        var $29 = $28+4;
        var $30 = HEAP[$29];
        var $31 = _lil_to_string($30);
        var $32 = _strcmp($27, $31);
        var $33 = $32 != 0;
        if ($33) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 7: // $34
        var $35 = HEAP[$index];
        var $36 = $35;
        var $37 = _lil_alloc_integer($36);
        HEAP[$r] = $37;;
        __label__ = 5; break;
      case 6: // $38
        __label__ = 8; break;
      case 8: // $39
        var $40 = HEAP[$index];
        var $41 = ($40 + 1)&4294967295;
        HEAP[$index] = $41;;
        __label__ = 3; break;
      case 5: // $42
        var $43 = HEAP[$list];
        _lil_free_list($43);
        var $44 = HEAP[$r];
        HEAP[$1] = $44;;
        __label__ = 2; break;
      case 2: // $45
        var $46 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $46;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_indexof.__index__ = Runtime.getFunctionIndex(_fnc_indexof, "_fnc_indexof");
  
  
  function _fnc_filter($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 40; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $filtered = __stackBase__+20;
        var $i = __stackBase__+24;
        var $r = __stackBase__+28;
        var $varname = __stackBase__+32;
        var $base = __stackBase__+36;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$varname] = __str69;;
        HEAP[$base] = 0;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$3];
        var $10 = unSign($9, 32) < unSign(2, 32);
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $11
        var $12 = HEAP[$4];
        var $13 = $12;
        var $14 = HEAP[$13];
        var $15 = _lil_clone_value($14);
        HEAP[$1] = $15;;
        __label__ = 2; break;
      case 4: // $16
        var $17 = HEAP[$3];
        var $18 = unSign($17, 32) > unSign(2, 32);
        if ($18) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $19
        HEAP[$base] = 1;;
        var $20 = HEAP[$4];
        var $21 = $20;
        var $22 = HEAP[$21];
        var $23 = _lil_to_string($22);
        HEAP[$varname] = $23;;
        __label__ = 6; break;
      case 6: // $24
        var $25 = HEAP[$2];
        var $26 = HEAP[$base];
        var $27 = HEAP[$4];
        var $28 = $27+4*$26;
        var $29 = HEAP[$28];
        var $30 = _lil_subst_to_list($25, $29);
        HEAP[$list] = $30;;
        var $31 = _lil_alloc_list();
        HEAP[$filtered] = $31;;
        HEAP[$i] = 0;;
        __label__ = 7; break;
      case 7: // $32
        var $33 = HEAP[$i];
        var $34 = HEAP[$list];
        var $35 = $34+4;
        var $36 = HEAP[$35];
        var $37 = unSign($33, 32) < unSign($36, 32);
        if ($37) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $38
        var $39 = HEAP[$2];
        var $40 = HEAP[$varname];
        var $41 = HEAP[$i];
        var $42 = HEAP[$list];
        var $43 = $42;
        var $44 = HEAP[$43];
        var $45 = $44+4*$41;
        var $46 = HEAP[$45];
        var $47 = _lil_set_var($39, $40, $46, 1);
        var $48 = HEAP[$2];
        var $49 = HEAP[$base];
        var $50 = ($49 + 1)&4294967295;
        var $51 = HEAP[$4];
        var $52 = $51+4*$50;
        var $53 = HEAP[$52];
        var $54 = _lil_eval_expr($48, $53);
        HEAP[$r] = $54;;
        var $55 = HEAP[$r];
        var $56 = _lil_to_boolean($55);
        var $57 = $56 != 0;
        if ($57) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $58
        var $59 = HEAP[$filtered];
        var $60 = HEAP[$i];
        var $61 = HEAP[$list];
        var $62 = $61;
        var $63 = HEAP[$62];
        var $64 = $63+4*$60;
        var $65 = HEAP[$64];
        var $66 = _lil_clone_value($65);
        _lil_list_append($59, $66);
        __label__ = 11; break;
      case 11: // $67
        var $68 = HEAP[$r];
        _lil_free_value($68);
        __label__ = 12; break;
      case 12: // $69
        var $70 = HEAP[$i];
        var $71 = ($70 + 1)&4294967295;
        HEAP[$i] = $71;;
        __label__ = 7; break;
      case 9: // $72
        var $73 = HEAP[$list];
        _lil_free_list($73);
        var $74 = HEAP[$filtered];
        var $75 = _lil_list_to_value($74, 1);
        HEAP[$r] = $75;;
        var $76 = HEAP[$filtered];
        _lil_free_list($76);
        var $77 = HEAP[$r];
        HEAP[$1] = $77;;
        __label__ = 2; break;
      case 2: // $78
        var $79 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $79;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_filter.__index__ = Runtime.getFunctionIndex(_fnc_filter, "_fnc_filter");
  
  
  function _fnc_list($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $list = __stackBase__+12;
        var $r = __stackBase__+16;
        var $i = __stackBase__+20;
        HEAP[$1] = $lil;;
        HEAP[$2] = $argc;;
        HEAP[$3] = $argv;;
        var $4 = _lil_alloc_list();
        HEAP[$list] = $4;;
        HEAP[$i] = 0;;
        __label__ = 0; break;
      case 0: // $5
        var $6 = HEAP[$i];
        var $7 = HEAP[$2];
        var $8 = unSign($6, 32) < unSign($7, 32);
        if ($8) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $9
        var $10 = HEAP[$list];
        var $11 = HEAP[$i];
        var $12 = HEAP[$3];
        var $13 = $12+4*$11;
        var $14 = HEAP[$13];
        var $15 = _lil_clone_value($14);
        _lil_list_append($10, $15);
        __label__ = 3; break;
      case 3: // $16
        var $17 = HEAP[$i];
        var $18 = ($17 + 1)&4294967295;
        HEAP[$i] = $18;;
        __label__ = 0; break;
      case 2: // $19
        var $20 = HEAP[$list];
        var $21 = _lil_list_to_value($20, 1);
        HEAP[$r] = $21;;
        var $22 = HEAP[$list];
        _lil_free_list($22);
        var $23 = HEAP[$r];
        STACKTOP = __stackBase__;
        return $23;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_list.__index__ = Runtime.getFunctionIndex(_fnc_list, "_fnc_list");
  
  
  function _fnc_append($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 40; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $r = __stackBase__+20;
        var $i = __stackBase__+24;
        var $base = __stackBase__+28;
        var $access = __stackBase__+32;
        var $varname = __stackBase__+36;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$base] = 1;;
        HEAP[$access] = 1;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        HEAP[$varname] = $12;;
        var $13 = HEAP[$varname];
        var $14 = _strcmp($13, __str68);
        var $15 = $14 != 0;
        if ($15) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $16
        var $17 = HEAP[$3];
        var $18 = unSign($17, 32) < unSign(3, 32);
        if ($18) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $19
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 6: // $20
        var $21 = HEAP[$4];
        var $22 = $21+4;
        var $23 = HEAP[$22];
        var $24 = _lil_to_string($23);
        HEAP[$varname] = $24;;
        HEAP[$base] = 2;;
        HEAP[$access] = 0;;
        __label__ = 3; break;
      case 3: // $25
        var $26 = HEAP[$2];
        var $27 = HEAP[$2];
        var $28 = HEAP[$varname];
        var $29 = _lil_get_var($27, $28);
        var $30 = _lil_subst_to_list($26, $29);
        HEAP[$list] = $30;;
        var $31 = HEAP[$base];
        HEAP[$i] = $31;;
        __label__ = 7; break;
      case 7: // $32
        var $33 = HEAP[$i];
        var $34 = HEAP[$3];
        var $35 = unSign($33, 32) < unSign($34, 32);
        if ($35) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $36
        var $37 = HEAP[$list];
        var $38 = HEAP[$i];
        var $39 = HEAP[$4];
        var $40 = $39+4*$38;
        var $41 = HEAP[$40];
        var $42 = _lil_clone_value($41);
        _lil_list_append($37, $42);
        __label__ = 10; break;
      case 10: // $43
        var $44 = HEAP[$i];
        var $45 = ($44 + 1)&4294967295;
        HEAP[$i] = $45;;
        __label__ = 7; break;
      case 9: // $46
        var $47 = HEAP[$list];
        var $48 = _lil_list_to_value($47, 1);
        HEAP[$r] = $48;;
        var $49 = HEAP[$list];
        _lil_free_list($49);
        var $50 = HEAP[$2];
        var $51 = HEAP[$varname];
        var $52 = HEAP[$r];
        var $53 = HEAP[$access];
        var $54 = _lil_set_var($50, $51, $52, $53);
        var $55 = HEAP[$r];
        HEAP[$1] = $55;;
        __label__ = 2; break;
      case 2: // $56
        var $57 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $57;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_append.__index__ = Runtime.getFunctionIndex(_fnc_append, "_fnc_append");
  
  
  function _fnc_slice($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 48; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $slice = __stackBase__+20;
        var $i = __stackBase__+24;
        var $from = __stackBase__+28;
        var $to = __stackBase__+36;
        var $r = __stackBase__+44;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$3];
        var $10 = unSign($9, 32) < unSign(2, 32);
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $11
        var $12 = HEAP[$4];
        var $13 = $12;
        var $14 = HEAP[$13];
        var $15 = _lil_clone_value($14);
        HEAP[$1] = $15;;
        __label__ = 2; break;
      case 4: // $16
        var $17 = HEAP[$4];
        var $18 = $17+4;
        var $19 = HEAP[$18];
        var $20 = _lil_to_integer($19);
        HEAP[$from] = $20;;
        var $21 = HEAP[$from];
        var $22 = $21 < 0;
        if ($22) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $23
        HEAP[$from] = 0;;
        __label__ = 6; break;
      case 6: // $24
        var $25 = HEAP[$2];
        var $26 = HEAP[$4];
        var $27 = $26;
        var $28 = HEAP[$27];
        var $29 = _lil_subst_to_list($25, $28);
        HEAP[$list] = $29;;
        var $30 = HEAP[$3];
        var $31 = unSign($30, 32) > unSign(2, 32);
        if ($31) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $32
        var $33 = HEAP[$4];
        var $34 = $33+8;
        var $35 = HEAP[$34];
        var $36 = _lil_to_integer($35);
        __lastLabel__ = 7; __label__ = 9; break;
      case 8: // $37
        var $38 = HEAP[$list];
        var $39 = $38+4;
        var $40 = HEAP[$39];
        var $41 = $40;
        __lastLabel__ = 8; __label__ = 9; break;
      case 9: // $42
        var $43 = __lastLabel__ == 7 ? $36 : ($41);
        HEAP[$to] = $43;;
        var $44 = HEAP[$to];
        var $45 = HEAP[$list];
        var $46 = $45+4;
        var $47 = HEAP[$46];
        var $48 = $47;
        var $49 = $44 > $48;
        if ($49) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $50
        var $51 = HEAP[$list];
        var $52 = $51+4;
        var $53 = HEAP[$52];
        var $54 = $53;
        HEAP[$to] = $54;;
        __label__ = 11; break;
      case 11: // $55
        var $56 = HEAP[$to];
        var $57 = HEAP[$from];
        var $58 = $56 < $57;
        if ($58) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $59
        var $60 = HEAP[$from];
        HEAP[$to] = $60;;
        __label__ = 13; break;
      case 13: // $61
        var $62 = _lil_alloc_list();
        HEAP[$slice] = $62;;
        var $63 = HEAP[$from];
        var $64 = (($63) & 4294967295);
        HEAP[$i] = $64;;
        __label__ = 14; break;
      case 14: // $65
        var $66 = HEAP[$i];
        var $67 = HEAP[$to];
        var $68 = (($67) & 4294967295);
        var $69 = unSign($66, 32) < unSign($68, 32);
        if ($69) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $70
        var $71 = HEAP[$slice];
        var $72 = HEAP[$i];
        var $73 = HEAP[$list];
        var $74 = $73;
        var $75 = HEAP[$74];
        var $76 = $75+4*$72;
        var $77 = HEAP[$76];
        var $78 = _lil_clone_value($77);
        _lil_list_append($71, $78);
        __label__ = 17; break;
      case 17: // $79
        var $80 = HEAP[$i];
        var $81 = ($80 + 1)&4294967295;
        HEAP[$i] = $81;;
        __label__ = 14; break;
      case 16: // $82
        var $83 = HEAP[$list];
        _lil_free_list($83);
        var $84 = HEAP[$slice];
        var $85 = _lil_list_to_value($84, 1);
        HEAP[$r] = $85;;
        var $86 = HEAP[$slice];
        _lil_free_list($86);
        var $87 = HEAP[$r];
        HEAP[$1] = $87;;
        __label__ = 2; break;
      case 2: // $88
        var $89 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $89;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_slice.__index__ = Runtime.getFunctionIndex(_fnc_slice, "_fnc_slice");
  
  
  function _fnc_subst($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = HEAP[$4];
        var $11 = $10;
        var $12 = HEAP[$11];
        var $13 = _lil_subst_to_value($9, $12);
        HEAP[$1] = $13;;
        __label__ = 2; break;
      case 2: // $14
        var $15 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $15;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_subst.__index__ = Runtime.getFunctionIndex(_fnc_subst, "_fnc_subst");
  
  
  function _fnc_concat($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 32; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $r = __stackBase__+20;
        var $tmp = __stackBase__+24;
        var $i = __stackBase__+28;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = _lil_alloc_string(__str4);
        HEAP[$r] = $9;;
        HEAP[$i] = 0;;
        __label__ = 3; break;
      case 3: // $10
        var $11 = HEAP[$i];
        var $12 = HEAP[$3];
        var $13 = unSign($11, 32) < unSign($12, 32);
        if ($13) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $14
        var $15 = HEAP[$2];
        var $16 = HEAP[$i];
        var $17 = HEAP[$4];
        var $18 = $17+4*$16;
        var $19 = HEAP[$18];
        var $20 = _lil_subst_to_list($15, $19);
        HEAP[$list] = $20;;
        var $21 = HEAP[$list];
        var $22 = _lil_list_to_value($21, 1);
        HEAP[$tmp] = $22;;
        var $23 = HEAP[$list];
        _lil_free_list($23);
        var $24 = HEAP[$r];
        var $25 = HEAP[$tmp];
        var $26 = _lil_append_val($24, $25);
        var $27 = HEAP[$tmp];
        _lil_free_value($27);
        __label__ = 6; break;
      case 6: // $28
        var $29 = HEAP[$i];
        var $30 = ($29 + 1)&4294967295;
        HEAP[$i] = $30;;
        __label__ = 3; break;
      case 5: // $31
        var $32 = HEAP[$r];
        HEAP[$1] = $32;;
        __label__ = 2; break;
      case 2: // $33
        var $34 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $34;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_concat.__index__ = Runtime.getFunctionIndex(_fnc_concat, "_fnc_concat");
  
  
  function _fnc_foreach($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 48; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $rlist = __stackBase__+20;
        var $r = __stackBase__+24;
        var $i = __stackBase__+28;
        var $listidx = __stackBase__+32;
        var $codeidx = __stackBase__+36;
        var $varname = __stackBase__+40;
        var $rv = __stackBase__+44;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$listidx] = 0;;
        HEAP[$codeidx] = 1;;
        HEAP[$varname] = __str67;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$3];
        var $10 = $9 == 3;
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $11
        var $12 = HEAP[$4];
        var $13 = $12;
        var $14 = HEAP[$13];
        var $15 = _lil_to_string($14);
        HEAP[$varname] = $15;;
        HEAP[$listidx] = 1;;
        HEAP[$codeidx] = 2;;
        __label__ = 4; break;
      case 4: // $16
        var $17 = _lil_alloc_list();
        HEAP[$rlist] = $17;;
        var $18 = HEAP[$2];
        var $19 = HEAP[$listidx];
        var $20 = HEAP[$4];
        var $21 = $20+4*$19;
        var $22 = HEAP[$21];
        var $23 = _lil_subst_to_list($18, $22);
        HEAP[$list] = $23;;
        HEAP[$i] = 0;;
        __label__ = 5; break;
      case 5: // $24
        var $25 = HEAP[$i];
        var $26 = HEAP[$list];
        var $27 = $26+4;
        var $28 = HEAP[$27];
        var $29 = unSign($25, 32) < unSign($28, 32);
        if ($29) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $30
        var $31 = HEAP[$2];
        var $32 = HEAP[$varname];
        var $33 = HEAP[$i];
        var $34 = HEAP[$list];
        var $35 = $34;
        var $36 = HEAP[$35];
        var $37 = $36+4*$33;
        var $38 = HEAP[$37];
        var $39 = _lil_set_var($31, $32, $38, 1);
        var $40 = HEAP[$2];
        var $41 = HEAP[$codeidx];
        var $42 = HEAP[$4];
        var $43 = $42+4*$41;
        var $44 = HEAP[$43];
        var $45 = _lil_parse_value($40, $44, 0);
        HEAP[$rv] = $45;;
        var $46 = HEAP[$rv];
        var $47 = $46;
        var $48 = HEAP[$47];
        var $49 = $48 != 0;
        if ($49) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $50
        var $51 = HEAP[$rlist];
        var $52 = HEAP[$rv];
        _lil_list_append($51, $52);
        __label__ = 10; break;
      case 9: // $53
        var $54 = HEAP[$rv];
        _lil_free_value($54);
        __label__ = 10; break;
      case 10: // $55
        var $56 = HEAP[$2];
        var $57 = $56+56;
        var $58 = HEAP[$57];
        var $59 = $58 != 0;
        if ($59) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $60
        __label__ = 7; break;
      case 12: // $61
        __label__ = 13; break;
      case 13: // $62
        var $63 = HEAP[$i];
        var $64 = ($63 + 1)&4294967295;
        HEAP[$i] = $64;;
        __label__ = 5; break;
      case 7: // $65
        var $66 = HEAP[$rlist];
        var $67 = _lil_list_to_value($66, 1);
        HEAP[$r] = $67;;
        var $68 = HEAP[$list];
        _lil_free_list($68);
        var $69 = HEAP[$rlist];
        _lil_free_list($69);
        var $70 = HEAP[$r];
        HEAP[$1] = $70;;
        __label__ = 2; break;
      case 2: // $71
        var $72 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $72;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_foreach.__index__ = Runtime.getFunctionIndex(_fnc_foreach, "_fnc_foreach");
  
  
  function _fnc_return($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        HEAP[$1] = $lil;;
        HEAP[$2] = $argc;;
        HEAP[$3] = $argv;;
        var $4 = HEAP[$1];
        var $5 = $4+40;
        var $6 = HEAP[$5];
        var $7 = $6+24;
        HEAP[$7] = 1;;
        var $8 = HEAP[$1];
        var $9 = $8+40;
        var $10 = HEAP[$9];
        var $11 = $10+20;
        var $12 = HEAP[$11];
        _lil_free_value($12);
        var $13 = HEAP[$2];
        var $14 = unSign($13, 32) < unSign(1, 32);
        if ($14) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $15
        __lastLabel__ = 0; __label__ = 2; break;
      case 1: // $16
        var $17 = HEAP[$3];
        var $18 = $17;
        var $19 = HEAP[$18];
        var $20 = _lil_clone_value($19);
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $21
        var $22 = __lastLabel__ == 0 ? 0 : ($20);
        var $23 = HEAP[$1];
        var $24 = $23+40;
        var $25 = HEAP[$24];
        var $26 = $25+20;
        HEAP[$26] = $22;;
        STACKTOP = __stackBase__;
        return 0;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_return.__index__ = Runtime.getFunctionIndex(_fnc_return, "_fnc_return");
  
  
  function _fnc_expr($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $val = __stackBase__+16;
        var $r = __stackBase__+20;
        var $i = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = $5 == 1;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8 = HEAP[$2];
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_eval_expr($8, $11);
        HEAP[$1] = $12;;
        __label__ = 2; break;
      case 1: // $13
        var $14 = HEAP[$3];
        var $15 = unSign($14, 32) > unSign(1, 32);
        if ($15) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $16
        var $17 = _alloc_value(0);
        HEAP[$val] = $17;;
        HEAP[$i] = 0;;
        __label__ = 5; break;
      case 5: // $18
        var $19 = HEAP[$i];
        var $20 = HEAP[$3];
        var $21 = unSign($19, 32) < unSign($20, 32);
        if ($21) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $22
        var $23 = HEAP[$i];
        var $24 = $23 != 0;
        if ($24) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $25
        var $26 = HEAP[$val];
        var $27 = _lil_append_char($26, 32);
        __label__ = 9; break;
      case 9: // $28
        var $29 = HEAP[$val];
        var $30 = HEAP[$i];
        var $31 = HEAP[$4];
        var $32 = $31+4*$30;
        var $33 = HEAP[$32];
        var $34 = _lil_append_val($29, $33);
        __label__ = 10; break;
      case 10: // $35
        var $36 = HEAP[$i];
        var $37 = ($36 + 1)&4294967295;
        HEAP[$i] = $37;;
        __label__ = 5; break;
      case 7: // $38
        var $39 = HEAP[$2];
        var $40 = HEAP[$val];
        var $41 = _lil_eval_expr($39, $40);
        HEAP[$r] = $41;;
        var $42 = HEAP[$val];
        _lil_free_value($42);
        var $43 = HEAP[$r];
        HEAP[$1] = $43;;
        __label__ = 2; break;
      case 4: // $44
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 2: // $45
        var $46 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $46;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_expr.__index__ = Runtime.getFunctionIndex(_fnc_expr, "_fnc_expr");
  
  
  function _fnc_inc($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = HEAP[$4];
        var $11 = $10;
        var $12 = HEAP[$11];
        var $13 = _lil_to_string($12);
        var $14 = HEAP[$3];
        var $15 = unSign($14, 32) > unSign(1, 32);
        if ($15) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $16
        var $17 = HEAP[$4];
        var $18 = $17+4;
        var $19 = HEAP[$18];
        var $20 = _lil_to_double($19);
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $21
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $22
        var $23 = __lastLabel__ == 3 ? $20 : (1);
        var $24 = $23;
        var $25 = _real_inc($9, $13, $24);
        HEAP[$1] = $25;;
        __label__ = 2; break;
      case 2: // $26
        var $27 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $27;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_inc.__index__ = Runtime.getFunctionIndex(_fnc_inc, "_fnc_inc");
  
  
  function _fnc_dec($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = HEAP[$4];
        var $11 = $10;
        var $12 = HEAP[$11];
        var $13 = _lil_to_string($12);
        var $14 = HEAP[$3];
        var $15 = unSign($14, 32) > unSign(1, 32);
        if ($15) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $16
        var $17 = HEAP[$4];
        var $18 = $17+4;
        var $19 = HEAP[$18];
        var $20 = _lil_to_double($19);
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $21
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $22
        var $23 = __lastLabel__ == 3 ? $20 : (1);
        var $24 = 0 - $23;
        var $25 = $24;
        var $26 = _real_inc($9, $13, $25);
        HEAP[$1] = $26;;
        __label__ = 2; break;
      case 2: // $27
        var $28 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $28;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_dec.__index__ = Runtime.getFunctionIndex(_fnc_dec, "_fnc_dec");
  
  
  function _fnc_read($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 36; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $f = __stackBase__+16;
        var $size = __stackBase__+20;
        var $buffer = __stackBase__+24;
        var $r = __stackBase__+28;
        var $proc = __stackBase__+32;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = $9+68;
        var $11 = $10+8;
        var $12 = HEAP[$11];
        var $13 = $12 != 0;
        if ($13) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $14
        var $15 = HEAP[$2];
        var $16 = $15+68;
        var $17 = $16+8;
        var $18 = HEAP[$17];
        var $19 = $18;
        HEAP[$proc] = $19;;
        var $20 = HEAP[$proc];
        var $21 = HEAP[$2];
        var $22 = HEAP[$4];
        var $23 = $22;
        var $24 = HEAP[$23];
        var $25 = _lil_to_string($24);
        var $26 = FUNCTION_TABLE[$20]($21, $25);
        HEAP[$buffer] = $26;;
        __label__ = 5; break;
      case 4: // $27
        var $28 = HEAP[$4];
        var $29 = $28;
        var $30 = HEAP[$29];
        var $31 = _lil_to_string($30);
        var $32 = _fopen($31, __str62);
        HEAP[$f] = $32;;
        var $33 = HEAP[$f];
        var $34 = $33 != 0;
        if ($34) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 7: // $35
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 6: // $36
        var $37 = HEAP[$f];
        var $38 = _fseek($37, 0, 2);
        var $39 = HEAP[$f];
        var $40 = _ftell($39);
        HEAP[$size] = $40;;
        var $41 = HEAP[$f];
        var $42 = _fseek($41, 0, 0);
        var $43 = HEAP[$size];
        var $44 = ($43 + 1)&4294967295;
        var $45 = _malloc($44);
        HEAP[$buffer] = $45;;
        var $46 = HEAP[$buffer];
        var $47 = HEAP[$size];
        var $48 = HEAP[$f];
        var $49 = _fread($46, 1, $47, $48);
        var $50 = HEAP[$size];
        var $51 = HEAP[$buffer];
        var $52 = $51+$50;
        HEAP[$52] = 0;;
        var $53 = HEAP[$f];
        var $54 = _fclose($53);
        __label__ = 5; break;
      case 5: // $55
        var $56 = HEAP[$buffer];
        var $57 = _lil_alloc_string($56);
        HEAP[$r] = $57;;
        var $58 = HEAP[$buffer];
        _free($58);
        var $59 = HEAP[$r];
        HEAP[$1] = $59;;
        __label__ = 2; break;
      case 2: // $60
        var $61 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $61;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_read.__index__ = Runtime.getFunctionIndex(_fnc_read, "_fnc_read");
  
  
  function _fnc_store($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $f = __stackBase__+16;
        var $buffer = __stackBase__+20;
        var $proc = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = $9+68;
        var $11 = $10+12;
        var $12 = HEAP[$11];
        var $13 = $12 != 0;
        if ($13) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $14
        var $15 = HEAP[$2];
        var $16 = $15+68;
        var $17 = $16+12;
        var $18 = HEAP[$17];
        var $19 = $18;
        HEAP[$proc] = $19;;
        var $20 = HEAP[$proc];
        var $21 = HEAP[$2];
        var $22 = HEAP[$4];
        var $23 = $22;
        var $24 = HEAP[$23];
        var $25 = _lil_to_string($24);
        var $26 = HEAP[$4];
        var $27 = $26+4;
        var $28 = HEAP[$27];
        var $29 = _lil_to_string($28);
        FUNCTION_TABLE[$20]($21, $25, $29);
        __label__ = 5; break;
      case 4: // $30
        var $31 = HEAP[$4];
        var $32 = $31;
        var $33 = HEAP[$32];
        var $34 = _lil_to_string($33);
        var $35 = _fopen($34, __str66);
        HEAP[$f] = $35;;
        var $36 = HEAP[$f];
        var $37 = $36 != 0;
        if ($37) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 7: // $38
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 6: // $39
        var $40 = HEAP[$4];
        var $41 = $40+4;
        var $42 = HEAP[$41];
        var $43 = _lil_to_string($42);
        HEAP[$buffer] = $43;;
        var $44 = HEAP[$buffer];
        var $45 = HEAP[$buffer];
        var $46 = _strlen($45);
        var $47 = HEAP[$f];
        var $48 = _fwrite($44, 1, $46, $47);
        var $49 = HEAP[$f];
        var $50 = _fclose($49);
        __label__ = 5; break;
      case 5: // $51
        var $52 = HEAP[$4];
        var $53 = $52+4;
        var $54 = HEAP[$53];
        var $55 = _lil_clone_value($54);
        HEAP[$1] = $55;;
        __label__ = 2; break;
      case 2: // $56
        var $57 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $57;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_store.__index__ = Runtime.getFunctionIndex(_fnc_store, "_fnc_store");
  
  
  function _fnc_if($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 36; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $val = __stackBase__+16;
        var $r = __stackBase__+20;
        var $base = __stackBase__+24;
        var $not = __stackBase__+28;
        var $v = __stackBase__+32;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$r] = 0;;
        HEAP[$base] = 0;;
        HEAP[$not] = 0;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        var $13 = _strcmp($12, __str65);
        var $14 = $13 != 0;
        if ($14) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $15
        HEAP[$not] = 1;;
        HEAP[$base] = 1;;
        __label__ = 3; break;
      case 3: // $16
        var $17 = HEAP[$3];
        var $18 = HEAP[$base];
        var $19 = ($18 + 2)&4294967295;
        var $20 = unSign($17, 32) < unSign($19, 32);
        if ($20) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $21
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 6: // $22
        var $23 = HEAP[$2];
        var $24 = HEAP[$base];
        var $25 = HEAP[$4];
        var $26 = $25+4*$24;
        var $27 = HEAP[$26];
        var $28 = _lil_eval_expr($23, $27);
        HEAP[$val] = $28;;
        var $29 = HEAP[$val];
        var $30 = $29 != 0;
        if ($30) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $31
        var $32 = HEAP[$2];
        var $33 = $32+56;
        var $34 = HEAP[$33];
        var $35 = $34 != 0;
        if ($35) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $36
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 9: // $37
        var $38 = HEAP[$val];
        var $39 = _lil_to_boolean($38);
        HEAP[$v] = $39;;
        var $40 = HEAP[$not];
        var $41 = $40 != 0;
        if ($41) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $42
        var $43 = HEAP[$v];
        var $44 = $43 != 0;
        var $45 = $44 ^ 1;
        var $46 = $45;
        HEAP[$v] = $46;;
        __label__ = 11; break;
      case 11: // $47
        var $48 = HEAP[$v];
        var $49 = $48 != 0;
        if ($49) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $50
        var $51 = HEAP[$2];
        var $52 = HEAP[$base];
        var $53 = ($52 + 1)&4294967295;
        var $54 = HEAP[$4];
        var $55 = $54+4*$53;
        var $56 = HEAP[$55];
        var $57 = _lil_parse_value($51, $56, 0);
        HEAP[$r] = $57;;
        __label__ = 14; break;
      case 13: // $58
        var $59 = HEAP[$3];
        var $60 = HEAP[$base];
        var $61 = ($60 + 2)&4294967295;
        var $62 = unSign($59, 32) > unSign($61, 32);
        if ($62) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $63
        var $64 = HEAP[$2];
        var $65 = HEAP[$base];
        var $66 = ($65 + 2)&4294967295;
        var $67 = HEAP[$4];
        var $68 = $67+4*$66;
        var $69 = HEAP[$68];
        var $70 = _lil_parse_value($64, $69, 0);
        HEAP[$r] = $70;;
        __label__ = 16; break;
      case 16: // $71
        __label__ = 14; break;
      case 14: // $72
        var $73 = HEAP[$val];
        _lil_free_value($73);
        var $74 = HEAP[$r];
        HEAP[$1] = $74;;
        __label__ = 2; break;
      case 2: // $75
        var $76 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $76;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_if.__index__ = Runtime.getFunctionIndex(_fnc_if, "_fnc_if");
  
  
  function _fnc_while($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 36; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $val = __stackBase__+16;
        var $r = __stackBase__+20;
        var $base = __stackBase__+24;
        var $not = __stackBase__+28;
        var $v = __stackBase__+32;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$r] = 0;;
        HEAP[$base] = 0;;
        HEAP[$not] = 0;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        var $13 = _strcmp($12, __str65);
        var $14 = $13 != 0;
        if ($14) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $15
        HEAP[$not] = 1;;
        HEAP[$base] = 1;;
        __label__ = 3; break;
      case 3: // $16
        var $17 = HEAP[$3];
        var $18 = HEAP[$base];
        var $19 = ($18 + 2)&4294967295;
        var $20 = unSign($17, 32) < unSign($19, 32);
        if ($20) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $21
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 6: // $22
        __label__ = 7; break;
      case 7: // $23
        var $24 = HEAP[$2];
        var $25 = $24+56;
        var $26 = HEAP[$25];
        var $27 = $26 != 0;
        var $28 = $27 ^ 1;
        if ($28) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $29
        var $30 = HEAP[$2];
        var $31 = HEAP[$base];
        var $32 = HEAP[$4];
        var $33 = $32+4*$31;
        var $34 = HEAP[$33];
        var $35 = _lil_eval_expr($30, $34);
        HEAP[$val] = $35;;
        var $36 = HEAP[$val];
        var $37 = $36 != 0;
        if ($37) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $38
        var $39 = HEAP[$2];
        var $40 = $39+56;
        var $41 = HEAP[$40];
        var $42 = $41 != 0;
        if ($42) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $43
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 12: // $44
        var $45 = HEAP[$val];
        var $46 = _lil_to_boolean($45);
        HEAP[$v] = $46;;
        var $47 = HEAP[$not];
        var $48 = $47 != 0;
        if ($48) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $49
        var $50 = HEAP[$v];
        var $51 = $50 != 0;
        var $52 = $51 ^ 1;
        var $53 = $52;
        HEAP[$v] = $53;;
        __label__ = 14; break;
      case 14: // $54
        var $55 = HEAP[$v];
        var $56 = $55 != 0;
        if ($56) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 16: // $57
        var $58 = HEAP[$val];
        _lil_free_value($58);
        __label__ = 9; break;
      case 15: // $59
        var $60 = HEAP[$r];
        var $61 = $60 != 0;
        if ($61) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $62
        var $63 = HEAP[$r];
        _lil_free_value($63);
        __label__ = 18; break;
      case 18: // $64
        var $65 = HEAP[$2];
        var $66 = HEAP[$base];
        var $67 = ($66 + 1)&4294967295;
        var $68 = HEAP[$4];
        var $69 = $68+4*$67;
        var $70 = HEAP[$69];
        var $71 = _lil_parse_value($65, $70, 0);
        HEAP[$r] = $71;;
        var $72 = HEAP[$val];
        _lil_free_value($72);
        __label__ = 7; break;
      case 9: // $73
        var $74 = HEAP[$r];
        HEAP[$1] = $74;;
        __label__ = 2; break;
      case 2: // $75
        var $76 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $76;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_while.__index__ = Runtime.getFunctionIndex(_fnc_while, "_fnc_while");
  
  
  function _fnc_for($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $val = __stackBase__+16;
        var $r = __stackBase__+20;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$r] = 0;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(4, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = HEAP[$4];
        var $11 = $10;
        var $12 = HEAP[$11];
        var $13 = _lil_parse_value($9, $12, 0);
        _lil_free_value($13);
        __label__ = 3; break;
      case 3: // $14
        var $15 = HEAP[$2];
        var $16 = $15+56;
        var $17 = HEAP[$16];
        var $18 = $17 != 0;
        var $19 = $18 ^ 1;
        if ($19) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $20
        var $21 = HEAP[$2];
        var $22 = HEAP[$4];
        var $23 = $22+4;
        var $24 = HEAP[$23];
        var $25 = _lil_eval_expr($21, $24);
        HEAP[$val] = $25;;
        var $26 = HEAP[$val];
        var $27 = $26 != 0;
        if ($27) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $28
        var $29 = HEAP[$2];
        var $30 = $29+56;
        var $31 = HEAP[$30];
        var $32 = $31 != 0;
        if ($32) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $33
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 8: // $34
        var $35 = HEAP[$val];
        var $36 = _lil_to_boolean($35);
        var $37 = $36 != 0;
        if ($37) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 10: // $38
        var $39 = HEAP[$val];
        _lil_free_value($39);
        __label__ = 5; break;
      case 9: // $40
        var $41 = HEAP[$r];
        var $42 = $41 != 0;
        if ($42) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $43
        var $44 = HEAP[$r];
        _lil_free_value($44);
        __label__ = 12; break;
      case 12: // $45
        var $46 = HEAP[$2];
        var $47 = HEAP[$4];
        var $48 = $47+12;
        var $49 = HEAP[$48];
        var $50 = _lil_parse_value($46, $49, 0);
        HEAP[$r] = $50;;
        var $51 = HEAP[$val];
        _lil_free_value($51);
        var $52 = HEAP[$2];
        var $53 = HEAP[$4];
        var $54 = $53+8;
        var $55 = HEAP[$54];
        var $56 = _lil_parse_value($52, $55, 0);
        _lil_free_value($56);
        __label__ = 3; break;
      case 5: // $57
        var $58 = HEAP[$r];
        HEAP[$1] = $58;;
        __label__ = 2; break;
      case 2: // $59
        var $60 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $60;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_for.__index__ = Runtime.getFunctionIndex(_fnc_for, "_fnc_for");
  
  
  function _fnc_char($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 18; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $s = __stackBase__+16;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_integer($11);
        var $13 = (($12) & 255);
        var $14 = $s;
        HEAP[$14] = $13;;
        var $15 = $s+1;
        HEAP[$15] = 0;;
        var $16 = $s;
        var $17 = _lil_alloc_string($16);
        HEAP[$1] = $17;;
        __label__ = 2; break;
      case 2: // $18
        var $19 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $19;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_char.__index__ = Runtime.getFunctionIndex(_fnc_char, "_fnc_char");
  
  
  function _fnc_charat($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 26; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $index = __stackBase__+16;
        var $chstr = __stackBase__+20;
        var $str = __stackBase__+22;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        HEAP[$str] = $12;;
        var $13 = HEAP[$4];
        var $14 = $13+4;
        var $15 = HEAP[$14];
        var $16 = _lil_to_integer($15);
        var $17 = (($16) & 4294967295);
        HEAP[$index] = $17;;
        var $18 = HEAP[$index];
        var $19 = HEAP[$str];
        var $20 = _strlen($19);
        var $21 = unSign($18, 32) >= unSign($20, 32);
        if ($21) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $22
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 4: // $23
        var $24 = HEAP[$index];
        var $25 = HEAP[$str];
        var $26 = $25+$24;
        var $27 = HEAP[$26];
        var $28 = $chstr;
        HEAP[$28] = $27;;
        var $29 = $chstr+1;
        HEAP[$29] = 0;;
        var $30 = $chstr;
        var $31 = _lil_alloc_string($30);
        HEAP[$1] = $31;;
        __label__ = 2; break;
      case 2: // $32
        var $33 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $33;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_charat.__index__ = Runtime.getFunctionIndex(_fnc_charat, "_fnc_charat");
  
  
  function _fnc_codeat($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $index = __stackBase__+16;
        var $str = __stackBase__+20;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        HEAP[$str] = $12;;
        var $13 = HEAP[$4];
        var $14 = $13+4;
        var $15 = HEAP[$14];
        var $16 = _lil_to_integer($15);
        var $17 = (($16) & 4294967295);
        HEAP[$index] = $17;;
        var $18 = HEAP[$index];
        var $19 = HEAP[$str];
        var $20 = _strlen($19);
        var $21 = unSign($18, 32) >= unSign($20, 32);
        if ($21) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $22
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 4: // $23
        var $24 = HEAP[$index];
        var $25 = HEAP[$str];
        var $26 = $25+$24;
        var $27 = HEAP[$26];
        var $28 = $27;
        var $29 = _lil_alloc_integer($28);
        HEAP[$1] = $29;;
        __label__ = 2; break;
      case 2: // $30
        var $31 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $31;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_codeat.__index__ = Runtime.getFunctionIndex(_fnc_codeat, "_fnc_codeat");
  
  
  function _fnc_substr($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 40; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $str = __stackBase__+16;
        var $r = __stackBase__+20;
        var $start = __stackBase__+24;
        var $end = __stackBase__+28;
        var $i = __stackBase__+32;
        var $slen = __stackBase__+36;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        HEAP[$str] = $12;;
        var $13 = HEAP[$str];
        var $14 = $13;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 4: // $17
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 3: // $18
        var $19 = HEAP[$str];
        var $20 = _strlen($19);
        HEAP[$slen] = $20;;
        var $21 = HEAP[$4];
        var $22 = $21+4;
        var $23 = HEAP[$22];
        var $24 = _lil_to_string($23);
        var $25 = _atoll($24);
        var $26 = (($25) & 4294967295);
        HEAP[$start] = $26;;
        var $27 = HEAP[$3];
        var $28 = unSign($27, 32) > unSign(2, 32);
        if ($28) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $29
        var $30 = HEAP[$4];
        var $31 = $30+8;
        var $32 = HEAP[$31];
        var $33 = _lil_to_string($32);
        var $34 = _atoll($33);
        var $35 = (($34) & 4294967295);
        __lastLabel__ = 5; __label__ = 7; break;
      case 6: // $36
        var $37 = HEAP[$slen];
        __lastLabel__ = 6; __label__ = 7; break;
      case 7: // $38
        var $39 = __lastLabel__ == 5 ? $35 : ($37);
        HEAP[$end] = $39;;
        var $40 = HEAP[$end];
        var $41 = HEAP[$slen];
        var $42 = unSign($40, 32) > unSign($41, 32);
        if ($42) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $43
        var $44 = HEAP[$slen];
        HEAP[$end] = $44;;
        __label__ = 9; break;
      case 9: // $45
        var $46 = HEAP[$start];
        var $47 = HEAP[$end];
        var $48 = unSign($46, 32) >= unSign($47, 32);
        if ($48) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $49
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 11: // $50
        var $51 = _lil_alloc_string(__str4);
        HEAP[$r] = $51;;
        var $52 = HEAP[$start];
        HEAP[$i] = $52;;
        __label__ = 12; break;
      case 12: // $53
        var $54 = HEAP[$i];
        var $55 = HEAP[$end];
        var $56 = unSign($54, 32) < unSign($55, 32);
        if ($56) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $57
        var $58 = HEAP[$r];
        var $59 = HEAP[$i];
        var $60 = HEAP[$str];
        var $61 = $60+$59;
        var $62 = HEAP[$61];
        var $63 = _lil_append_char($58, $62);
        __label__ = 15; break;
      case 15: // $64
        var $65 = HEAP[$i];
        var $66 = ($65 + 1)&4294967295;
        HEAP[$i] = $66;;
        __label__ = 12; break;
      case 14: // $67
        var $68 = HEAP[$r];
        HEAP[$1] = $68;;
        __label__ = 2; break;
      case 2: // $69
        var $70 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $70;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_substr.__index__ = Runtime.getFunctionIndex(_fnc_substr, "_fnc_substr");
  
  
  function _fnc_strpos($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 28; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $hay = __stackBase__+16;
        var $str = __stackBase__+20;
        var $min = __stackBase__+24;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$min] = 0;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8 = _lil_alloc_integer(-1);
        HEAP[$1] = $8;;
        __label__ = 2; break;
      case 1: // $9
        var $10 = HEAP[$4];
        var $11 = $10;
        var $12 = HEAP[$11];
        var $13 = _lil_to_string($12);
        HEAP[$hay] = $13;;
        var $14 = HEAP[$3];
        var $15 = unSign($14, 32) > unSign(2, 32);
        if ($15) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $16
        var $17 = HEAP[$4];
        var $18 = $17+8;
        var $19 = HEAP[$18];
        var $20 = _lil_to_string($19);
        var $21 = _atoll($20);
        var $22 = (($21) & 4294967295);
        HEAP[$min] = $22;;
        var $23 = HEAP[$min];
        var $24 = HEAP[$hay];
        var $25 = _strlen($24);
        var $26 = unSign($23, 32) >= unSign($25, 32);
        if ($26) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $27
        var $28 = _lil_alloc_integer(-1);
        HEAP[$1] = $28;;
        __label__ = 2; break;
      case 6: // $29
        __label__ = 4; break;
      case 4: // $30
        var $31 = HEAP[$hay];
        var $32 = HEAP[$min];
        var $33 = $31+$32;
        var $34 = HEAP[$4];
        var $35 = $34+4;
        var $36 = HEAP[$35];
        var $37 = _lil_to_string($36);
        var $38 = _strstr($33, $37);
        HEAP[$str] = $38;;
        var $39 = HEAP[$str];
        var $40 = $39 != 0;
        if ($40) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 8: // $41
        var $42 = _lil_alloc_integer(-1);
        HEAP[$1] = $42;;
        __label__ = 2; break;
      case 7: // $43
        var $44 = HEAP[$str];
        var $45 = HEAP[$hay];
        var $46 = $44;
        var $47 = $45;
        var $48 = ($46 - $47)&4294967295;
        var $49 = $48;
        var $50 = _lil_alloc_integer($49);
        HEAP[$1] = $50;;
        __label__ = 2; break;
      case 2: // $51
        var $52 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $52;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_strpos.__index__ = Runtime.getFunctionIndex(_fnc_strpos, "_fnc_strpos");
  
  
  function _fnc_length($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $i = __stackBase__+12;
        var $total = __stackBase__+16;
        HEAP[$1] = $lil;;
        HEAP[$2] = $argc;;
        HEAP[$3] = $argv;;
        HEAP[$total] = 0;;
        HEAP[$i] = 0;;
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$i];
        var $6 = HEAP[$2];
        var $7 = unSign($5, 32) < unSign($6, 32);
        if ($7) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $8
        var $9 = HEAP[$i];
        var $10 = $9 != 0;
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $11
        var $12 = HEAP[$total];
        var $13 = ($12 + 1)&4294967295;
        HEAP[$total] = $13;;
        __label__ = 4; break;
      case 4: // $14
        var $15 = HEAP[$i];
        var $16 = HEAP[$3];
        var $17 = $16+4*$15;
        var $18 = HEAP[$17];
        var $19 = _lil_to_string($18);
        var $20 = _strlen($19);
        var $21 = HEAP[$total];
        var $22 = ($21 + $20)&4294967295;
        HEAP[$total] = $22;;
        __label__ = 5; break;
      case 5: // $23
        var $24 = HEAP[$i];
        var $25 = ($24 + 1)&4294967295;
        HEAP[$i] = $25;;
        __label__ = 0; break;
      case 2: // $26
        var $27 = HEAP[$total];
        var $28 = $27;
        var $29 = _lil_alloc_integer($28);
        STACKTOP = __stackBase__;
        return $29;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_length.__index__ = Runtime.getFunctionIndex(_fnc_length, "_fnc_length");
  
  
  function _fnc_trim($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        var $13 = HEAP[$3];
        var $14 = unSign($13, 32) < unSign(2, 32);
        if ($14) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $15
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $16
        var $17 = HEAP[$4];
        var $18 = $17+4;
        var $19 = HEAP[$18];
        var $20 = _lil_to_string($19);
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $21
        var $22 = __lastLabel__ == 3 ? __str64 : ($20);
        var $23 = _real_trim($12, $22, 1, 1);
        HEAP[$1] = $23;;
        __label__ = 2; break;
      case 2: // $24
        var $25 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $25;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_trim.__index__ = Runtime.getFunctionIndex(_fnc_trim, "_fnc_trim");
  
  
  function _fnc_ltrim($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        var $13 = HEAP[$3];
        var $14 = unSign($13, 32) < unSign(2, 32);
        if ($14) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $15
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $16
        var $17 = HEAP[$4];
        var $18 = $17+4;
        var $19 = HEAP[$18];
        var $20 = _lil_to_string($19);
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $21
        var $22 = __lastLabel__ == 3 ? __str64 : ($20);
        var $23 = _real_trim($12, $22, 1, 0);
        HEAP[$1] = $23;;
        __label__ = 2; break;
      case 2: // $24
        var $25 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $25;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_ltrim.__index__ = Runtime.getFunctionIndex(_fnc_ltrim, "_fnc_ltrim");
  
  
  function _fnc_rtrim($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 1: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 0: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        var $13 = HEAP[$3];
        var $14 = unSign($13, 32) < unSign(2, 32);
        if ($14) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $15
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $16
        var $17 = HEAP[$4];
        var $18 = $17+4;
        var $19 = HEAP[$18];
        var $20 = _lil_to_string($19);
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $21
        var $22 = __lastLabel__ == 3 ? __str64 : ($20);
        var $23 = _real_trim($12, $22, 0, 1);
        HEAP[$1] = $23;;
        __label__ = 2; break;
      case 2: // $24
        var $25 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $25;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_rtrim.__index__ = Runtime.getFunctionIndex(_fnc_rtrim, "_fnc_rtrim");
  
  
  function _fnc_strcmp($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        var $13 = HEAP[$4];
        var $14 = $13+4;
        var $15 = HEAP[$14];
        var $16 = _lil_to_string($15);
        var $17 = _strcmp($12, $16);
        var $18 = $17;
        var $19 = _lil_alloc_integer($18);
        HEAP[$1] = $19;;
        __label__ = 2; break;
      case 2: // $20
        var $21 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $21;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_strcmp.__index__ = Runtime.getFunctionIndex(_fnc_strcmp, "_fnc_strcmp");
  
  
  function _fnc_streq($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$4];
        var $10 = $9;
        var $11 = HEAP[$10];
        var $12 = _lil_to_string($11);
        var $13 = HEAP[$4];
        var $14 = $13+4;
        var $15 = HEAP[$14];
        var $16 = _lil_to_string($15);
        var $17 = _strcmp($12, $16);
        var $18 = $17 != 0;
        var $19 = $18 ? 0 : 1;
        var $20 = $19;
        var $21 = _lil_alloc_integer($20);
        HEAP[$1] = $21;;
        __label__ = 2; break;
      case 2: // $22
        var $23 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $23;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_streq.__index__ = Runtime.getFunctionIndex(_fnc_streq, "_fnc_streq");
  
  
  function _fnc_repstr($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 56; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $from = __stackBase__+16;
        var $to = __stackBase__+20;
        var $src = __stackBase__+24;
        var $sub = __stackBase__+28;
        var $idx = __stackBase__+32;
        var $fromlen = __stackBase__+36;
        var $tolen = __stackBase__+40;
        var $srclen = __stackBase__+44;
        var $r = __stackBase__+48;
        var $newsrc = __stackBase__+52;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$3];
        var $10 = unSign($9, 32) < unSign(3, 32);
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $11
        var $12 = HEAP[$4];
        var $13 = $12;
        var $14 = HEAP[$13];
        var $15 = _lil_clone_value($14);
        HEAP[$1] = $15;;
        __label__ = 2; break;
      case 4: // $16
        var $17 = HEAP[$4];
        var $18 = $17+4;
        var $19 = HEAP[$18];
        var $20 = _lil_to_string($19);
        HEAP[$from] = $20;;
        var $21 = HEAP[$4];
        var $22 = $21+8;
        var $23 = HEAP[$22];
        var $24 = _lil_to_string($23);
        HEAP[$to] = $24;;
        var $25 = HEAP[$from];
        var $26 = $25;
        var $27 = HEAP[$26];
        var $28 = $27 != 0;
        if ($28) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $29
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 5: // $30
        var $31 = HEAP[$4];
        var $32 = $31;
        var $33 = HEAP[$32];
        var $34 = _lil_to_string($33);
        var $35 = _strclone($34);
        HEAP[$src] = $35;;
        var $36 = HEAP[$src];
        var $37 = _strlen($36);
        HEAP[$srclen] = $37;;
        var $38 = HEAP[$from];
        var $39 = _strlen($38);
        HEAP[$fromlen] = $39;;
        var $40 = HEAP[$to];
        var $41 = _strlen($40);
        HEAP[$tolen] = $41;;
        __label__ = 7; break;
      case 7: // $42
        var $43 = HEAP[$src];
        var $44 = HEAP[$from];
        var $45 = _strstr($43, $44);
        HEAP[$sub] = $45;;
        var $46 = $45 != 0;
        if ($46) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $47
        var $48 = HEAP[$srclen];
        var $49 = HEAP[$fromlen];
        var $50 = ($48 - $49)&4294967295;
        var $51 = HEAP[$tolen];
        var $52 = ($50 + $51)&4294967295;
        var $53 = ($52 + 1)&4294967295;
        var $54 = _malloc($53);
        HEAP[$newsrc] = $54;;
        var $55 = HEAP[$sub];
        var $56 = HEAP[$src];
        var $57 = $55;
        var $58 = $56;
        var $59 = ($57 - $58)&4294967295;
        HEAP[$idx] = $59;;
        var $60 = HEAP[$idx];
        var $61 = $60 != 0;
        if ($61) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $62
        var $63 = HEAP[$newsrc];
        var $64 = HEAP[$src];
        var $65 = HEAP[$idx];
        _llvm_memcpy_p0i8_p0i8_i32($63, $64, $65, 1, 0);
        __label__ = 11; break;
      case 11: // $66
        var $67 = HEAP[$newsrc];
        var $68 = HEAP[$idx];
        var $69 = $67+$68;
        var $70 = HEAP[$to];
        var $71 = HEAP[$tolen];
        _llvm_memcpy_p0i8_p0i8_i32($69, $70, $71, 1, 0);
        var $72 = HEAP[$newsrc];
        var $73 = HEAP[$idx];
        var $74 = $72+$73;
        var $75 = HEAP[$tolen];
        var $76 = $74+$75;
        var $77 = HEAP[$src];
        var $78 = HEAP[$idx];
        var $79 = $77+$78;
        var $80 = HEAP[$fromlen];
        var $81 = $79+$80;
        var $82 = HEAP[$srclen];
        var $83 = HEAP[$idx];
        var $84 = ($82 - $83)&4294967295;
        var $85 = HEAP[$fromlen];
        var $86 = ($84 - $85)&4294967295;
        _llvm_memcpy_p0i8_p0i8_i32($76, $81, $86, 1, 0);
        var $87 = HEAP[$srclen];
        var $88 = HEAP[$fromlen];
        var $89 = ($87 - $88)&4294967295;
        var $90 = HEAP[$tolen];
        var $91 = ($89 + $90)&4294967295;
        HEAP[$srclen] = $91;;
        var $92 = HEAP[$src];
        _free($92);
        var $93 = HEAP[$newsrc];
        HEAP[$src] = $93;;
        var $94 = HEAP[$srclen];
        var $95 = HEAP[$src];
        var $96 = $95+$94;
        HEAP[$96] = 0;;
        __label__ = 7; break;
      case 9: // $97
        var $98 = HEAP[$src];
        var $99 = _lil_alloc_string($98);
        HEAP[$r] = $99;;
        var $100 = HEAP[$src];
        _free($100);
        var $101 = HEAP[$r];
        HEAP[$1] = $101;;
        __label__ = 2; break;
      case 2: // $102
        var $103 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $103;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_repstr.__index__ = Runtime.getFunctionIndex(_fnc_repstr, "_fnc_repstr");
  
  
  function _fnc_split($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 36; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $sep = __stackBase__+20;
        var $i = __stackBase__+24;
        var $val = __stackBase__+28;
        var $str = __stackBase__+32;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        HEAP[$sep] = __str63;;
        var $5 = HEAP[$3];
        var $6 = $5 == 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$3];
        var $10 = unSign($9, 32) > unSign(1, 32);
        if ($10) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $11
        var $12 = HEAP[$4];
        var $13 = $12+4;
        var $14 = HEAP[$13];
        var $15 = _lil_to_string($14);
        HEAP[$sep] = $15;;
        var $16 = HEAP[$sep];
        var $17 = $16 != 0;
        if ($17) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 6: // $18
        var $19 = HEAP[$4];
        var $20 = $19;
        var $21 = HEAP[$20];
        var $22 = _lil_clone_value($21);
        HEAP[$1] = $22;;
        __label__ = 2; break;
      case 5: // $23
        __label__ = 4; break;
      case 4: // $24
        var $25 = _lil_alloc_string(__str4);
        HEAP[$val] = $25;;
        var $26 = HEAP[$4];
        var $27 = $26;
        var $28 = HEAP[$27];
        var $29 = _lil_to_string($28);
        HEAP[$str] = $29;;
        var $30 = _lil_alloc_list();
        HEAP[$list] = $30;;
        HEAP[$i] = 0;;
        __label__ = 7; break;
      case 7: // $31
        var $32 = HEAP[$i];
        var $33 = HEAP[$str];
        var $34 = $33+$32;
        var $35 = HEAP[$34];
        var $36 = $35 != 0;
        if ($36) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $37
        var $38 = HEAP[$sep];
        var $39 = HEAP[$i];
        var $40 = HEAP[$str];
        var $41 = $40+$39;
        var $42 = HEAP[$41];
        var $43 = $42;
        var $44 = _strchr($38, $43);
        var $45 = $44 != 0;
        if ($45) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $46
        var $47 = HEAP[$list];
        var $48 = HEAP[$val];
        _lil_list_append($47, $48);
        var $49 = _lil_alloc_string(__str4);
        HEAP[$val] = $49;;
        __label__ = 12; break;
      case 11: // $50
        var $51 = HEAP[$val];
        var $52 = HEAP[$i];
        var $53 = HEAP[$str];
        var $54 = $53+$52;
        var $55 = HEAP[$54];
        var $56 = _lil_append_char($51, $55);
        __label__ = 12; break;
      case 12: // $57
        __label__ = 13; break;
      case 13: // $58
        var $59 = HEAP[$i];
        var $60 = ($59 + 1)&4294967295;
        HEAP[$i] = $60;;
        __label__ = 7; break;
      case 9: // $61
        var $62 = HEAP[$list];
        var $63 = HEAP[$val];
        _lil_list_append($62, $63);
        var $64 = HEAP[$list];
        var $65 = _lil_list_to_value($64, 1);
        HEAP[$val] = $65;;
        var $66 = HEAP[$list];
        _lil_free_list($66);
        var $67 = HEAP[$val];
        HEAP[$1] = $67;;
        __label__ = 2; break;
      case 2: // $68
        var $69 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $69;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_split.__index__ = Runtime.getFunctionIndex(_fnc_split, "_fnc_split");
  
  
  function _fnc_try($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $r = __stackBase__+16;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = $9+56;
        var $11 = HEAP[$10];
        var $12 = $11 != 0;
        if ($12) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $13
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 4: // $14
        var $15 = HEAP[$2];
        var $16 = HEAP[$4];
        var $17 = $16;
        var $18 = HEAP[$17];
        var $19 = _lil_parse_value($15, $18, 0);
        HEAP[$r] = $19;;
        var $20 = HEAP[$2];
        var $21 = $20+56;
        var $22 = HEAP[$21];
        var $23 = $22 != 0;
        if ($23) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $24
        var $25 = HEAP[$2];
        var $26 = $25+56;
        HEAP[$26] = 0;;
        var $27 = HEAP[$r];
        _lil_free_value($27);
        var $28 = HEAP[$3];
        var $29 = unSign($28, 32) > unSign(1, 32);
        if ($29) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $30
        var $31 = HEAP[$2];
        var $32 = HEAP[$4];
        var $33 = $32+4;
        var $34 = HEAP[$33];
        var $35 = _lil_parse_value($31, $34, 0);
        HEAP[$r] = $35;;
        __label__ = 9; break;
      case 8: // $36
        HEAP[$r] = 0;;
        __label__ = 9; break;
      case 9: // $37
        __label__ = 6; break;
      case 6: // $38
        var $39 = HEAP[$r];
        HEAP[$1] = $39;;
        __label__ = 2; break;
      case 2: // $40
        var $41 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $41;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_try.__index__ = Runtime.getFunctionIndex(_fnc_try, "_fnc_try");
  
  
  function _fnc_error($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        HEAP[$1] = $lil;;
        HEAP[$2] = $argc;;
        HEAP[$3] = $argv;;
        var $4 = HEAP[$1];
        var $5 = HEAP[$2];
        var $6 = unSign($5, 32) > unSign(0, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8 = HEAP[$3];
        var $9 = $8;
        var $10 = HEAP[$9];
        var $11 = _lil_to_string($10);
        __lastLabel__ = 0; __label__ = 2; break;
      case 1: // $12
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $13
        var $14 = __lastLabel__ == 0 ? $11 : (0);
        _lil_set_error($4, $14);
        STACKTOP = __stackBase__;
        return 0;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_error.__index__ = Runtime.getFunctionIndex(_fnc_error, "_fnc_error");
  
  
  function _fnc_exit($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $proc = __stackBase__+12;
        HEAP[$1] = $lil;;
        HEAP[$2] = $argc;;
        HEAP[$3] = $argv;;
        var $4 = HEAP[$1];
        var $5 = $4+68;
        var $6 = $5;
        var $7 = HEAP[$6];
        var $8 = $7 != 0;
        if ($8) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $9
        var $10 = HEAP[$1];
        var $11 = $10+68;
        var $12 = $11;
        var $13 = HEAP[$12];
        var $14 = $13;
        HEAP[$proc] = $14;;
        var $15 = HEAP[$proc];
        var $16 = HEAP[$1];
        var $17 = HEAP[$2];
        var $18 = unSign($17, 32) > unSign(0, 32);
        if ($18) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $19
        var $20 = HEAP[$3];
        var $21 = $20;
        var $22 = HEAP[$21];
        __lastLabel__ = 2; __label__ = 4; break;
      case 3: // $23
        __lastLabel__ = 3; __label__ = 4; break;
      case 4: // $24
        var $25 = __lastLabel__ == 2 ? $22 : (0);
        FUNCTION_TABLE[$15]($16, $25);
        __label__ = 1; break;
      case 1: // $26
        STACKTOP = __stackBase__;
        return 0;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_exit.__index__ = Runtime.getFunctionIndex(_fnc_exit, "_fnc_exit");
  
  
  function _fnc_source($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 40; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $f = __stackBase__+16;
        var $size = __stackBase__+20;
        var $buffer = __stackBase__+24;
        var $r = __stackBase__+28;
        var $proc = __stackBase__+32;
        var $proc1 = __stackBase__+36;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(1, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = $9+68;
        var $11 = $10+16;
        var $12 = HEAP[$11];
        var $13 = $12 != 0;
        if ($13) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $14
        var $15 = HEAP[$2];
        var $16 = $15+68;
        var $17 = $16+16;
        var $18 = HEAP[$17];
        var $19 = $18;
        HEAP[$proc] = $19;;
        var $20 = HEAP[$proc];
        var $21 = HEAP[$2];
        var $22 = HEAP[$4];
        var $23 = $22;
        var $24 = HEAP[$23];
        var $25 = _lil_to_string($24);
        var $26 = FUNCTION_TABLE[$20]($21, $25);
        HEAP[$buffer] = $26;;
        __label__ = 5; break;
      case 4: // $27
        var $28 = HEAP[$2];
        var $29 = $28+68;
        var $30 = $29+8;
        var $31 = HEAP[$30];
        var $32 = $31 != 0;
        if ($32) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $33
        var $34 = HEAP[$2];
        var $35 = $34+68;
        var $36 = $35+8;
        var $37 = HEAP[$36];
        var $38 = $37;
        HEAP[$proc1] = $38;;
        var $39 = HEAP[$proc1];
        var $40 = HEAP[$2];
        var $41 = HEAP[$4];
        var $42 = $41;
        var $43 = HEAP[$42];
        var $44 = _lil_to_string($43);
        var $45 = FUNCTION_TABLE[$39]($40, $44);
        HEAP[$buffer] = $45;;
        __label__ = 8; break;
      case 7: // $46
        var $47 = HEAP[$4];
        var $48 = $47;
        var $49 = HEAP[$48];
        var $50 = _lil_to_string($49);
        var $51 = _fopen($50, __str62);
        HEAP[$f] = $51;;
        var $52 = HEAP[$f];
        var $53 = $52 != 0;
        if ($53) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 10: // $54
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 9: // $55
        var $56 = HEAP[$f];
        var $57 = _fseek($56, 0, 2);
        var $58 = HEAP[$f];
        var $59 = _ftell($58);
        HEAP[$size] = $59;;
        var $60 = HEAP[$f];
        var $61 = _fseek($60, 0, 0);
        var $62 = HEAP[$size];
        var $63 = ($62 + 1)&4294967295;
        var $64 = _malloc($63);
        HEAP[$buffer] = $64;;
        var $65 = HEAP[$buffer];
        var $66 = HEAP[$size];
        var $67 = HEAP[$f];
        var $68 = _fread($65, 1, $66, $67);
        var $69 = HEAP[$size];
        var $70 = HEAP[$buffer];
        var $71 = $70+$69;
        HEAP[$71] = 0;;
        var $72 = HEAP[$f];
        var $73 = _fclose($72);
        __label__ = 8; break;
      case 8: // $74
        __label__ = 5; break;
      case 5: // $75
        var $76 = HEAP[$2];
        var $77 = HEAP[$buffer];
        var $78 = _lil_parse($76, $77, 0, 0);
        HEAP[$r] = $78;;
        var $79 = HEAP[$buffer];
        _free($79);
        var $80 = HEAP[$r];
        HEAP[$1] = $80;;
        __label__ = 2; break;
      case 2: // $81
        var $82 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $82;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_source.__index__ = Runtime.getFunctionIndex(_fnc_source, "_fnc_source");
  
  
  function _fnc_lmap($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $list = __stackBase__+16;
        var $i = __stackBase__+20;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = unSign($5, 32) < unSign(2, 32);
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$2];
        var $10 = HEAP[$4];
        var $11 = $10;
        var $12 = HEAP[$11];
        var $13 = _lil_subst_to_list($9, $12);
        HEAP[$list] = $13;;
        HEAP[$i] = 1;;
        __label__ = 3; break;
      case 3: // $14
        var $15 = HEAP[$i];
        var $16 = HEAP[$3];
        var $17 = unSign($15, 32) < unSign($16, 32);
        if ($17) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $18
        var $19 = HEAP[$2];
        var $20 = HEAP[$i];
        var $21 = HEAP[$4];
        var $22 = $21+4*$20;
        var $23 = HEAP[$22];
        var $24 = _lil_to_string($23);
        var $25 = HEAP[$list];
        var $26 = HEAP[$i];
        var $27 = ($26 - 1)&4294967295;
        var $28 = _lil_list_get($25, $27);
        var $29 = _lil_set_var($19, $24, $28, 1);
        __label__ = 6; break;
      case 6: // $30
        var $31 = HEAP[$i];
        var $32 = ($31 + 1)&4294967295;
        HEAP[$i] = $32;;
        __label__ = 3; break;
      case 5: // $33
        var $34 = HEAP[$list];
        _lil_free_list($34);
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 2: // $35
        var $36 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $36;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_lmap.__index__ = Runtime.getFunctionIndex(_fnc_lmap, "_fnc_lmap");
  
  
  function _fnc_rand($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 12; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    var $2 = __stackBase__+4;
    var $3 = __stackBase__+8;
    HEAP[$1] = $lil;;
    HEAP[$2] = $argc;;
    HEAP[$3] = $argv;;
    var $4 = _rand();
    var $5 = $4;
    var $6 = $5 / 2147483647;
    var $7 = _lil_alloc_double($6);
    STACKTOP = __stackBase__;
    return $7;
  }
  _fnc_rand.__index__ = Runtime.getFunctionIndex(_fnc_rand, "_fnc_rand");
  
  
  function _fnc_catcher($lil, $argc, $argv) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $catcher = __stackBase__+16;
        HEAP[$2] = $lil;;
        HEAP[$3] = $argc;;
        HEAP[$4] = $argv;;
        var $5 = HEAP[$3];
        var $6 = $5 == 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        var $8 = HEAP[$2];
        var $9 = $8+28;
        var $10 = HEAP[$9];
        var $11 = _lil_alloc_string($10);
        HEAP[$1] = $11;;
        __label__ = 2; break;
      case 1: // $12
        var $13 = HEAP[$4];
        var $14 = $13;
        var $15 = HEAP[$14];
        var $16 = _lil_to_string($15);
        HEAP[$catcher] = $16;;
        var $17 = HEAP[$2];
        var $18 = $17+28;
        var $19 = HEAP[$18];
        _free($19);
        var $20 = HEAP[$catcher];
        var $21 = $20;
        var $22 = HEAP[$21];
        var $23 = $22;
        var $24 = $23 != 0;
        if ($24) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $25
        var $26 = HEAP[$catcher];
        var $27 = _strclone($26);
        __lastLabel__ = 3; __label__ = 5; break;
      case 4: // $28
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $29
        var $30 = __lastLabel__ == 3 ? $27 : (0);
        var $31 = HEAP[$2];
        var $32 = $31+28;
        HEAP[$32] = $30;;
        __label__ = 6; break;
      case 6: // $33
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 2: // $34
        var $35 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $35;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _fnc_catcher.__index__ = Runtime.getFunctionIndex(_fnc_catcher, "_fnc_catcher");
  
  
  function _real_trim($str, $chars, $left, $right) {
    var __stackBase__  = STACKTOP; STACKTOP += 32; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $4 = __stackBase__+12;
        var $base = __stackBase__+16;
        var $r = __stackBase__+20;
        var $len = __stackBase__+24;
        var $s = __stackBase__+28;
        HEAP[$1] = $str;;
        HEAP[$2] = $chars;;
        HEAP[$3] = $left;;
        HEAP[$4] = $right;;
        HEAP[$base] = 0;;
        HEAP[$r] = 0;;
        var $5 = HEAP[$3];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        __label__ = 2; break;
      case 2: // $8
        var $9 = HEAP[$base];
        var $10 = HEAP[$1];
        var $11 = $10+$9;
        var $12 = HEAP[$11];
        var $13 = $12;
        var $14 = $13 != 0;
        if ($14) { __lastLabel__ = 2; __label__ = 3; break; } else { __lastLabel__ = 2; __label__ = 4; break; }
      case 3: // $15
        var $16 = HEAP[$2];
        var $17 = HEAP[$base];
        var $18 = HEAP[$1];
        var $19 = $18+$17;
        var $20 = HEAP[$19];
        var $21 = $20;
        var $22 = _strchr($16, $21);
        var $23 = $22 != 0;
        __lastLabel__ = 3; __label__ = 4; break;
      case 4: // $24
        var $25 = __lastLabel__ == 2 ? 0 : ($23);
        if ($25) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $26
        var $27 = HEAP[$base];
        var $28 = ($27 + 1)&4294967295;
        HEAP[$base] = $28;;
        __label__ = 2; break;
      case 6: // $29
        var $30 = HEAP[$4];
        var $31 = $30 != 0;
        if ($31) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 8: // $32
        var $33 = HEAP[$base];
        var $34 = HEAP[$1];
        var $35 = $34+$33;
        var $36 = HEAP[$35];
        var $37 = $36;
        var $38 = $37 != 0;
        if ($38) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $39
        var $40 = HEAP[$1];
        var $41 = HEAP[$base];
        var $42 = $40+$41;
        __lastLabel__ = 9; __label__ = 11; break;
      case 10: // $43
        __lastLabel__ = 10; __label__ = 11; break;
      case 11: // $44
        var $45 = __lastLabel__ == 9 ? $42 : (0);
        var $46 = _lil_alloc_string($45);
        HEAP[$r] = $46;;
        __label__ = 7; break;
      case 7: // $47
        __label__ = 1; break;
      case 1: // $48
        var $49 = HEAP[$4];
        var $50 = $49 != 0;
        if ($50) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $51
        var $52 = HEAP[$1];
        var $53 = HEAP[$base];
        var $54 = $52+$53;
        var $55 = _strclone($54);
        HEAP[$s] = $55;;
        var $56 = HEAP[$s];
        var $57 = _strlen($56);
        HEAP[$len] = $57;;
        __label__ = 14; break;
      case 14: // $58
        var $59 = HEAP[$len];
        var $60 = $59 != 0;
        if ($60) { __lastLabel__ = 14; __label__ = 15; break; } else { __lastLabel__ = 14; __label__ = 16; break; }
      case 15: // $61
        var $62 = HEAP[$2];
        var $63 = HEAP[$len];
        var $64 = ($63 - 1)&4294967295;
        var $65 = HEAP[$s];
        var $66 = $65+$64;
        var $67 = HEAP[$66];
        var $68 = $67;
        var $69 = _strchr($62, $68);
        var $70 = $69 != 0;
        __lastLabel__ = 15; __label__ = 16; break;
      case 16: // $71
        var $72 = __lastLabel__ == 14 ? 0 : ($70);
        if ($72) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $73
        var $74 = HEAP[$len];
        var $75 = ($74 + -1)&4294967295;
        HEAP[$len] = $75;;
        __label__ = 14; break;
      case 18: // $76
        var $77 = HEAP[$len];
        var $78 = HEAP[$s];
        var $79 = $78+$77;
        HEAP[$79] = 0;;
        var $80 = HEAP[$s];
        var $81 = _lil_alloc_string($80);
        HEAP[$r] = $81;;
        var $82 = HEAP[$s];
        _free($82);
        __label__ = 13; break;
      case 13: // $83
        var $84 = HEAP[$r];
        STACKTOP = __stackBase__;
        return $84;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _real_trim.__index__ = Runtime.getFunctionIndex(_real_trim, "_real_trim");
  
  
  function _real_inc($lil, $varname, $v) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $3 = __stackBase__+8;
        var $pv = __stackBase__+12;
        var $dv = __stackBase__+16;
        HEAP[$1] = $lil;;
        HEAP[$2] = $varname;;
        HEAP[$3] = $v;;
        var $4 = HEAP[$1];
        var $5 = HEAP[$2];
        var $6 = _lil_get_var($4, $5);
        HEAP[$pv] = $6;;
        var $7 = HEAP[$pv];
        var $8 = _lil_to_double($7);
        var $9 = HEAP[$3];
        var $10 = $9;
        var $11 = $8 + $10;
        HEAP[$dv] = $11;;
        var $12 = HEAP[$dv];
        var $13 = _fmod($12, 1);
        var $14 = $13 != 0;
        if ($14) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $15
        var $16 = HEAP[$dv];
        var $17 = _lil_alloc_double($16);
        HEAP[$pv] = $17;;
        __label__ = 2; break;
      case 1: // $18
        var $19 = HEAP[$pv];
        var $20 = _lil_to_integer($19);
        var $21 = $20;
        var $22 = HEAP[$3];
        var $23 = $21 + $22;
        var $24 = Math.floor($23);
        var $25 = _lil_alloc_integer($24);
        HEAP[$pv] = $25;;
        __label__ = 2; break;
      case 2: // $26
        var $27 = HEAP[$1];
        var $28 = HEAP[$2];
        var $29 = HEAP[$pv];
        var $30 = _lil_set_var($27, $28, $29, 1);
        var $31 = HEAP[$pv];
        STACKTOP = __stackBase__;
        return $31;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _real_inc.__index__ = Runtime.getFunctionIndex(_real_inc, "_real_inc");
  
  
  function _ee_logor($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $odval = __stackBase__+4;
        var $oival = __stackBase__+12;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_logand($2);
        var $3 = HEAP[$1];
        _ee_skip_spaces($3);
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$1];
        var $6 = $5+8;
        var $7 = HEAP[$6];
        var $8 = HEAP[$1];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = unSign($7, 32) < unSign($10, 32);
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $12
        var $13 = HEAP[$1];
        var $14 = $13+32;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __lastLabel__ = 1; __label__ = 2; break; } else { __lastLabel__ = 1; __label__ = 3; break; }
      case 3: // $17
        var $18 = HEAP[$1];
        var $19 = $18+8;
        var $20 = HEAP[$19];
        var $21 = HEAP[$1];
        var $22 = $21;
        var $23 = HEAP[$22];
        var $24 = $23+$20;
        var $25 = HEAP[$24];
        var $26 = $25;
        var $27 = $26 == 124;
        if ($27) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $28
        var $29 = HEAP[$1];
        var $30 = $29+8;
        var $31 = HEAP[$30];
        var $32 = ($31 + 1)&4294967295;
        var $33 = HEAP[$1];
        var $34 = $33;
        var $35 = HEAP[$34];
        var $36 = $35+$32;
        var $37 = HEAP[$36];
        var $38 = $37;
        var $39 = $38 == 124;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $40
        var $41 = __lastLabel__ == 3 ? 0 : ($39);
        __lastLabel__ = 5; __label__ = 2; break;
      case 2: // $42
        var $43 = __lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($41));
        if ($43) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $44
        var $45 = HEAP[$1];
        var $46 = $45+20;
        var $47 = HEAP[$46];
        HEAP[$odval] = $47;;
        var $48 = HEAP[$1];
        var $49 = $48+12;
        var $50 = HEAP[$49];
        HEAP[$oival] = $50;;
        var $51 = HEAP[$1];
        var $52 = $51+8;
        var $53 = HEAP[$52];
        var $54 = ($53 + 2)&4294967295;
        HEAP[$52] = $54;;
        var $55 = HEAP[$1];
        var $56 = $55+28;
        var $57 = HEAP[$56];
        if ($57 == 1) {
          __label__ = 27; break;
        }
        else if ($57 == 0) {
          __label__ = 28; break;
        }
        else {
        __label__ = 29; break;
        }
        
      case 27: // $58
        var $59 = HEAP[$1];
        _ee_logand($59);
        var $60 = HEAP[$1];
        var $61 = $60+32;
        var $62 = HEAP[$61];
        var $63 = $62 != 0;
        if ($63) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $64
        __label__ = 7; break;
      case 9: // $65
        var $66 = HEAP[$1];
        var $67 = $66+28;
        var $68 = HEAP[$67];
        if ($68 == 1) {
          __label__ = 10; break;
        }
        else if ($68 == 0) {
          __label__ = 14; break;
        }
        else {
        __label__ = 30; break;
        }
        
      case 10: // $69
        var $70 = HEAP[$odval];
        var $71 = $70 != 0;
        if ($71) { __lastLabel__ = 10; __label__ = 11; break; } else { __lastLabel__ = 10; __label__ = 12; break; }
      case 12: // $72
        var $73 = HEAP[$1];
        var $74 = $73+20;
        var $75 = HEAP[$74];
        var $76 = $75 != 0;
        __lastLabel__ = 12; __label__ = 11; break;
      case 11: // $77
        var $78 = __lastLabel__ == 10 ? 1 : ($76);
        var $79 = $78 ? 1 : 0;
        var $80 = $79;
        var $81 = HEAP[$1];
        var $82 = $81+12;
        HEAP[$82] = $80;;
        var $83 = HEAP[$1];
        var $84 = $83+28;
        HEAP[$84] = 0;;
        __label__ = 13; break;
      case 14: // $85
        var $86 = HEAP[$odval];
        var $87 = $86 != 0;
        if ($87) { __lastLabel__ = 14; __label__ = 15; break; } else { __lastLabel__ = 14; __label__ = 16; break; }
      case 16: // $88
        var $89 = HEAP[$1];
        var $90 = $89+12;
        var $91 = HEAP[$90];
        var $92 = $91 != 0;
        __lastLabel__ = 16; __label__ = 15; break;
      case 15: // $93
        var $94 = __lastLabel__ == 14 ? 1 : ($92);
        var $95 = $94 ? 1 : 0;
        var $96 = $95;
        var $97 = HEAP[$1];
        var $98 = $97+12;
        HEAP[$98] = $96;;
        __label__ = 13; break;
      case 30: // $99
        var $100 = HEAP[$1];
        var $101 = $100+32;
        HEAP[$101] = 2;;
        __label__ = 13; break;
      case 13: // $102
        __label__ = 17; break;
      case 28: // $103
        var $104 = HEAP[$1];
        _ee_logand($104);
        var $105 = HEAP[$1];
        var $106 = $105+32;
        var $107 = HEAP[$106];
        var $108 = $107 != 0;
        if ($108) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $109
        __label__ = 7; break;
      case 19: // $110
        var $111 = HEAP[$1];
        var $112 = $111+28;
        var $113 = HEAP[$112];
        if ($113 == 1) {
          __label__ = 20; break;
        }
        else if ($113 == 0) {
          __label__ = 24; break;
        }
        else {
        __label__ = 31; break;
        }
        
      case 20: // $114
        var $115 = HEAP[$oival];
        var $116 = $115 != 0;
        if ($116) { __lastLabel__ = 20; __label__ = 21; break; } else { __lastLabel__ = 20; __label__ = 22; break; }
      case 22: // $117
        var $118 = HEAP[$1];
        var $119 = $118+20;
        var $120 = HEAP[$119];
        var $121 = $120 != 0;
        __lastLabel__ = 22; __label__ = 21; break;
      case 21: // $122
        var $123 = __lastLabel__ == 20 ? 1 : ($121);
        var $124 = $123 ? 1 : 0;
        var $125 = $124;
        var $126 = HEAP[$1];
        var $127 = $126+12;
        HEAP[$127] = $125;;
        var $128 = HEAP[$1];
        var $129 = $128+28;
        HEAP[$129] = 0;;
        __label__ = 23; break;
      case 24: // $130
        var $131 = HEAP[$oival];
        var $132 = $131 != 0;
        if ($132) { __lastLabel__ = 24; __label__ = 25; break; } else { __lastLabel__ = 24; __label__ = 26; break; }
      case 26: // $133
        var $134 = HEAP[$1];
        var $135 = $134+12;
        var $136 = HEAP[$135];
        var $137 = $136 != 0;
        __lastLabel__ = 26; __label__ = 25; break;
      case 25: // $138
        var $139 = __lastLabel__ == 24 ? 1 : ($137);
        var $140 = $139 ? 1 : 0;
        var $141 = $140;
        var $142 = HEAP[$1];
        var $143 = $142+12;
        HEAP[$143] = $141;;
        __label__ = 23; break;
      case 31: // $144
        var $145 = HEAP[$1];
        var $146 = $145+32;
        HEAP[$146] = 2;;
        __label__ = 23; break;
      case 23: // $147
        __label__ = 17; break;
      case 29: // $148
        var $149 = HEAP[$1];
        var $150 = $149+32;
        HEAP[$150] = 2;;
        __label__ = 17; break;
      case 17: // $151
        var $152 = HEAP[$1];
        _ee_skip_spaces($152);
        __label__ = 0; break;
      case 7: // $153
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_logor.__index__ = Runtime.getFunctionIndex(_ee_logor, "_ee_logor");
  
  
  function _ee_logand($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $odval = __stackBase__+4;
        var $oival = __stackBase__+12;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_bitor($2);
        var $3 = HEAP[$1];
        _ee_skip_spaces($3);
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$1];
        var $6 = $5+8;
        var $7 = HEAP[$6];
        var $8 = HEAP[$1];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = unSign($7, 32) < unSign($10, 32);
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $12
        var $13 = HEAP[$1];
        var $14 = $13+32;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __lastLabel__ = 1; __label__ = 2; break; } else { __lastLabel__ = 1; __label__ = 3; break; }
      case 3: // $17
        var $18 = HEAP[$1];
        var $19 = $18+8;
        var $20 = HEAP[$19];
        var $21 = HEAP[$1];
        var $22 = $21;
        var $23 = HEAP[$22];
        var $24 = $23+$20;
        var $25 = HEAP[$24];
        var $26 = $25;
        var $27 = $26 == 38;
        if ($27) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $28
        var $29 = HEAP[$1];
        var $30 = $29+8;
        var $31 = HEAP[$30];
        var $32 = ($31 + 1)&4294967295;
        var $33 = HEAP[$1];
        var $34 = $33;
        var $35 = HEAP[$34];
        var $36 = $35+$32;
        var $37 = HEAP[$36];
        var $38 = $37;
        var $39 = $38 == 38;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $40
        var $41 = __lastLabel__ == 3 ? 0 : ($39);
        __lastLabel__ = 5; __label__ = 2; break;
      case 2: // $42
        var $43 = __lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($41));
        if ($43) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $44
        var $45 = HEAP[$1];
        var $46 = $45+20;
        var $47 = HEAP[$46];
        HEAP[$odval] = $47;;
        var $48 = HEAP[$1];
        var $49 = $48+12;
        var $50 = HEAP[$49];
        HEAP[$oival] = $50;;
        var $51 = HEAP[$1];
        var $52 = $51+8;
        var $53 = HEAP[$52];
        var $54 = ($53 + 2)&4294967295;
        HEAP[$52] = $54;;
        var $55 = HEAP[$1];
        var $56 = $55+28;
        var $57 = HEAP[$56];
        if ($57 == 1) {
          __label__ = 27; break;
        }
        else if ($57 == 0) {
          __label__ = 28; break;
        }
        else {
        __label__ = 29; break;
        }
        
      case 27: // $58
        var $59 = HEAP[$1];
        _ee_bitor($59);
        var $60 = HEAP[$1];
        var $61 = $60+32;
        var $62 = HEAP[$61];
        var $63 = $62 != 0;
        if ($63) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $64
        __label__ = 7; break;
      case 9: // $65
        var $66 = HEAP[$1];
        var $67 = $66+28;
        var $68 = HEAP[$67];
        if ($68 == 1) {
          __label__ = 10; break;
        }
        else if ($68 == 0) {
          __label__ = 14; break;
        }
        else {
        __label__ = 30; break;
        }
        
      case 10: // $69
        var $70 = HEAP[$odval];
        var $71 = $70 != 0;
        if ($71) { __lastLabel__ = 10; __label__ = 11; break; } else { __lastLabel__ = 10; __label__ = 12; break; }
      case 11: // $72
        var $73 = HEAP[$1];
        var $74 = $73+20;
        var $75 = HEAP[$74];
        var $76 = $75 != 0;
        __lastLabel__ = 11; __label__ = 12; break;
      case 12: // $77
        var $78 = __lastLabel__ == 10 ? 0 : ($76);
        var $79 = $78 ? 1 : 0;
        var $80 = $79;
        var $81 = HEAP[$1];
        var $82 = $81+12;
        HEAP[$82] = $80;;
        var $83 = HEAP[$1];
        var $84 = $83+28;
        HEAP[$84] = 0;;
        __label__ = 13; break;
      case 14: // $85
        var $86 = HEAP[$odval];
        var $87 = $86 != 0;
        if ($87) { __lastLabel__ = 14; __label__ = 15; break; } else { __lastLabel__ = 14; __label__ = 16; break; }
      case 15: // $88
        var $89 = HEAP[$1];
        var $90 = $89+12;
        var $91 = HEAP[$90];
        var $92 = $91 != 0;
        __lastLabel__ = 15; __label__ = 16; break;
      case 16: // $93
        var $94 = __lastLabel__ == 14 ? 0 : ($92);
        var $95 = $94 ? 1 : 0;
        var $96 = $95;
        var $97 = HEAP[$1];
        var $98 = $97+12;
        HEAP[$98] = $96;;
        __label__ = 13; break;
      case 30: // $99
        var $100 = HEAP[$1];
        var $101 = $100+32;
        HEAP[$101] = 2;;
        __label__ = 13; break;
      case 13: // $102
        __label__ = 17; break;
      case 28: // $103
        var $104 = HEAP[$1];
        _ee_bitor($104);
        var $105 = HEAP[$1];
        var $106 = $105+32;
        var $107 = HEAP[$106];
        var $108 = $107 != 0;
        if ($108) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $109
        __label__ = 7; break;
      case 19: // $110
        var $111 = HEAP[$1];
        var $112 = $111+28;
        var $113 = HEAP[$112];
        if ($113 == 1) {
          __label__ = 20; break;
        }
        else if ($113 == 0) {
          __label__ = 24; break;
        }
        else {
        __label__ = 31; break;
        }
        
      case 20: // $114
        var $115 = HEAP[$oival];
        var $116 = $115 != 0;
        if ($116) { __lastLabel__ = 20; __label__ = 21; break; } else { __lastLabel__ = 20; __label__ = 22; break; }
      case 21: // $117
        var $118 = HEAP[$1];
        var $119 = $118+20;
        var $120 = HEAP[$119];
        var $121 = $120 != 0;
        __lastLabel__ = 21; __label__ = 22; break;
      case 22: // $122
        var $123 = __lastLabel__ == 20 ? 0 : ($121);
        var $124 = $123 ? 1 : 0;
        var $125 = $124;
        var $126 = HEAP[$1];
        var $127 = $126+12;
        HEAP[$127] = $125;;
        var $128 = HEAP[$1];
        var $129 = $128+28;
        HEAP[$129] = 0;;
        __label__ = 23; break;
      case 24: // $130
        var $131 = HEAP[$oival];
        var $132 = $131 != 0;
        if ($132) { __lastLabel__ = 24; __label__ = 25; break; } else { __lastLabel__ = 24; __label__ = 26; break; }
      case 25: // $133
        var $134 = HEAP[$1];
        var $135 = $134+12;
        var $136 = HEAP[$135];
        var $137 = $136 != 0;
        __lastLabel__ = 25; __label__ = 26; break;
      case 26: // $138
        var $139 = __lastLabel__ == 24 ? 0 : ($137);
        var $140 = $139 ? 1 : 0;
        var $141 = $140;
        var $142 = HEAP[$1];
        var $143 = $142+12;
        HEAP[$143] = $141;;
        __label__ = 23; break;
      case 31: // $144
        var $145 = HEAP[$1];
        var $146 = $145+32;
        HEAP[$146] = 2;;
        __label__ = 23; break;
      case 23: // $147
        __label__ = 17; break;
      case 29: // $148
        var $149 = HEAP[$1];
        var $150 = $149+32;
        HEAP[$150] = 2;;
        __label__ = 17; break;
      case 17: // $151
        var $152 = HEAP[$1];
        _ee_skip_spaces($152);
        __label__ = 0; break;
      case 7: // $153
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_logand.__index__ = Runtime.getFunctionIndex(_ee_logand, "_ee_logand");
  
  
  function _ee_skip_spaces($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        HEAP[$1] = $ee;;
        __label__ = 0; break;
      case 0: // $2
        var $3 = HEAP[$1];
        var $4 = $3+8;
        var $5 = HEAP[$4];
        var $6 = HEAP[$1];
        var $7 = $6+4;
        var $8 = HEAP[$7];
        var $9 = unSign($5, 32) < unSign($8, 32);
        if ($9) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $10
        var $11 = HEAP[$1];
        var $12 = $11+8;
        var $13 = HEAP[$12];
        var $14 = HEAP[$1];
        var $15 = $14;
        var $16 = HEAP[$15];
        var $17 = $16+$13;
        var $18 = HEAP[$17];
        var $19 = $18;
        var $20 = ___ctype_b_loc();
        var $21 = HEAP[$20];
        var $22 = $21+2*$19;
        var $23 = HEAP[$22];
        var $24 = $23;
        var $25 = $24 & 8192;
        var $26 = $25 != 0;
        __lastLabel__ = 1; __label__ = 2; break;
      case 2: // $27
        var $28 = __lastLabel__ == 0 ? 0 : ($26);
        if ($28) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $29
        var $30 = HEAP[$1];
        var $31 = $30+8;
        var $32 = HEAP[$31];
        var $33 = ($32 + 1)&4294967295;
        HEAP[$31] = $33;;
        __label__ = 0; break;
      case 4: // $34
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_skip_spaces.__index__ = Runtime.getFunctionIndex(_ee_skip_spaces, "_ee_skip_spaces");
  
  
  function _ee_bitor($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $odval = __stackBase__+4;
        var $oival = __stackBase__+12;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_bitand($2);
        var $3 = HEAP[$1];
        _ee_skip_spaces($3);
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$1];
        var $6 = $5+8;
        var $7 = HEAP[$6];
        var $8 = HEAP[$1];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = unSign($7, 32) < unSign($10, 32);
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $12
        var $13 = HEAP[$1];
        var $14 = $13+32;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __lastLabel__ = 1; __label__ = 2; break; } else { __lastLabel__ = 1; __label__ = 3; break; }
      case 3: // $17
        var $18 = HEAP[$1];
        var $19 = $18+8;
        var $20 = HEAP[$19];
        var $21 = HEAP[$1];
        var $22 = $21;
        var $23 = HEAP[$22];
        var $24 = $23+$20;
        var $25 = HEAP[$24];
        var $26 = $25;
        var $27 = $26 == 124;
        if ($27) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $28
        var $29 = HEAP[$1];
        var $30 = $29+8;
        var $31 = HEAP[$30];
        var $32 = ($31 + 1)&4294967295;
        var $33 = HEAP[$1];
        var $34 = $33;
        var $35 = HEAP[$34];
        var $36 = $35+$32;
        var $37 = HEAP[$36];
        var $38 = $37;
        var $39 = ___ctype_b_loc();
        var $40 = HEAP[$39];
        var $41 = $40+2*$38;
        var $42 = HEAP[$41];
        var $43 = $42;
        var $44 = $43 & 4;
        var $45 = $44 != 0;
        var $46 = $45 ^ 1;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $47
        var $48 = __lastLabel__ == 3 ? 0 : ($46);
        __lastLabel__ = 5; __label__ = 2; break;
      case 2: // $49
        var $50 = __lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($48));
        if ($50) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $51
        var $52 = HEAP[$1];
        var $53 = $52+20;
        var $54 = HEAP[$53];
        HEAP[$odval] = $54;;
        var $55 = HEAP[$1];
        var $56 = $55+12;
        var $57 = HEAP[$56];
        HEAP[$oival] = $57;;
        var $58 = HEAP[$1];
        var $59 = $58+8;
        var $60 = HEAP[$59];
        var $61 = ($60 + 1)&4294967295;
        HEAP[$59] = $61;;
        var $62 = HEAP[$1];
        var $63 = $62+28;
        var $64 = HEAP[$63];
        if ($64 == 1) {
          __label__ = 15; break;
        }
        else if ($64 == 0) {
          __label__ = 16; break;
        }
        else {
        __label__ = 17; break;
        }
        
      case 15: // $65
        var $66 = HEAP[$1];
        _ee_bitand($66);
        var $67 = HEAP[$1];
        var $68 = $67+32;
        var $69 = HEAP[$68];
        var $70 = $69 != 0;
        if ($70) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $71
        __label__ = 7; break;
      case 9: // $72
        var $73 = HEAP[$1];
        var $74 = $73+28;
        var $75 = HEAP[$74];
        if ($75 == 1) {
          __label__ = 18; break;
        }
        else if ($75 == 0) {
          __label__ = 19; break;
        }
        else {
        __label__ = 20; break;
        }
        
      case 18: // $76
        var $77 = HEAP[$odval];
        var $78 = Math.floor($77);
        var $79 = HEAP[$1];
        var $80 = $79+20;
        var $81 = HEAP[$80];
        var $82 = Math.floor($81);
        var $83 = $78 | $82;
        var $84 = HEAP[$1];
        var $85 = $84+12;
        HEAP[$85] = $83;;
        var $86 = HEAP[$1];
        var $87 = $86+28;
        HEAP[$87] = 0;;
        __label__ = 10; break;
      case 19: // $88
        var $89 = HEAP[$odval];
        var $90 = Math.floor($89);
        var $91 = HEAP[$1];
        var $92 = $91+12;
        var $93 = HEAP[$92];
        var $94 = $90 | $93;
        var $95 = HEAP[$1];
        var $96 = $95+12;
        HEAP[$96] = $94;;
        __label__ = 10; break;
      case 20: // $97
        var $98 = HEAP[$1];
        var $99 = $98+32;
        HEAP[$99] = 2;;
        __label__ = 10; break;
      case 10: // $100
        __label__ = 11; break;
      case 16: // $101
        var $102 = HEAP[$1];
        _ee_bitand($102);
        var $103 = HEAP[$1];
        var $104 = $103+32;
        var $105 = HEAP[$104];
        var $106 = $105 != 0;
        if ($106) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $107
        __label__ = 7; break;
      case 13: // $108
        var $109 = HEAP[$1];
        var $110 = $109+28;
        var $111 = HEAP[$110];
        if ($111 == 1) {
          __label__ = 21; break;
        }
        else if ($111 == 0) {
          __label__ = 22; break;
        }
        else {
        __label__ = 23; break;
        }
        
      case 21: // $112
        var $113 = HEAP[$oival];
        var $114 = HEAP[$1];
        var $115 = $114+20;
        var $116 = HEAP[$115];
        var $117 = Math.floor($116);
        var $118 = $113 | $117;
        var $119 = HEAP[$1];
        var $120 = $119+12;
        HEAP[$120] = $118;;
        var $121 = HEAP[$1];
        var $122 = $121+28;
        HEAP[$122] = 0;;
        __label__ = 14; break;
      case 22: // $123
        var $124 = HEAP[$oival];
        var $125 = HEAP[$1];
        var $126 = $125+12;
        var $127 = HEAP[$126];
        var $128 = $124 | $127;
        var $129 = HEAP[$1];
        var $130 = $129+12;
        HEAP[$130] = $128;;
        __label__ = 14; break;
      case 23: // $131
        var $132 = HEAP[$1];
        var $133 = $132+32;
        HEAP[$133] = 2;;
        __label__ = 14; break;
      case 14: // $134
        __label__ = 11; break;
      case 17: // $135
        var $136 = HEAP[$1];
        var $137 = $136+32;
        HEAP[$137] = 2;;
        __label__ = 11; break;
      case 11: // $138
        var $139 = HEAP[$1];
        _ee_skip_spaces($139);
        __label__ = 0; break;
      case 7: // $140
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_bitor.__index__ = Runtime.getFunctionIndex(_ee_bitor, "_ee_bitor");
  
  
  function _ee_bitand($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $odval = __stackBase__+4;
        var $oival = __stackBase__+12;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_equals($2);
        var $3 = HEAP[$1];
        _ee_skip_spaces($3);
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$1];
        var $6 = $5+8;
        var $7 = HEAP[$6];
        var $8 = HEAP[$1];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = unSign($7, 32) < unSign($10, 32);
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $12
        var $13 = HEAP[$1];
        var $14 = $13+32;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __lastLabel__ = 1; __label__ = 2; break; } else { __lastLabel__ = 1; __label__ = 3; break; }
      case 3: // $17
        var $18 = HEAP[$1];
        var $19 = $18+8;
        var $20 = HEAP[$19];
        var $21 = HEAP[$1];
        var $22 = $21;
        var $23 = HEAP[$22];
        var $24 = $23+$20;
        var $25 = HEAP[$24];
        var $26 = $25;
        var $27 = $26 == 38;
        if ($27) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $28
        var $29 = HEAP[$1];
        var $30 = $29+8;
        var $31 = HEAP[$30];
        var $32 = ($31 + 1)&4294967295;
        var $33 = HEAP[$1];
        var $34 = $33;
        var $35 = HEAP[$34];
        var $36 = $35+$32;
        var $37 = HEAP[$36];
        var $38 = $37;
        var $39 = ___ctype_b_loc();
        var $40 = HEAP[$39];
        var $41 = $40+2*$38;
        var $42 = HEAP[$41];
        var $43 = $42;
        var $44 = $43 & 4;
        var $45 = $44 != 0;
        var $46 = $45 ^ 1;
        __lastLabel__ = 4; __label__ = 5; break;
      case 5: // $47
        var $48 = __lastLabel__ == 3 ? 0 : ($46);
        __lastLabel__ = 5; __label__ = 2; break;
      case 2: // $49
        var $50 = __lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($48));
        if ($50) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $51
        var $52 = HEAP[$1];
        var $53 = $52+20;
        var $54 = HEAP[$53];
        HEAP[$odval] = $54;;
        var $55 = HEAP[$1];
        var $56 = $55+12;
        var $57 = HEAP[$56];
        HEAP[$oival] = $57;;
        var $58 = HEAP[$1];
        var $59 = $58+8;
        var $60 = HEAP[$59];
        var $61 = ($60 + 1)&4294967295;
        HEAP[$59] = $61;;
        var $62 = HEAP[$1];
        var $63 = $62+28;
        var $64 = HEAP[$63];
        if ($64 == 1) {
          __label__ = 15; break;
        }
        else if ($64 == 0) {
          __label__ = 16; break;
        }
        else {
        __label__ = 17; break;
        }
        
      case 15: // $65
        var $66 = HEAP[$1];
        _ee_equals($66);
        var $67 = HEAP[$1];
        var $68 = $67+32;
        var $69 = HEAP[$68];
        var $70 = $69 != 0;
        if ($70) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $71
        __label__ = 7; break;
      case 9: // $72
        var $73 = HEAP[$1];
        var $74 = $73+28;
        var $75 = HEAP[$74];
        if ($75 == 1) {
          __label__ = 18; break;
        }
        else if ($75 == 0) {
          __label__ = 19; break;
        }
        else {
        __label__ = 20; break;
        }
        
      case 18: // $76
        var $77 = HEAP[$odval];
        var $78 = Math.floor($77);
        var $79 = HEAP[$1];
        var $80 = $79+20;
        var $81 = HEAP[$80];
        var $82 = Math.floor($81);
        var $83 = $78 & $82;
        var $84 = HEAP[$1];
        var $85 = $84+12;
        HEAP[$85] = $83;;
        var $86 = HEAP[$1];
        var $87 = $86+28;
        HEAP[$87] = 0;;
        __label__ = 10; break;
      case 19: // $88
        var $89 = HEAP[$odval];
        var $90 = Math.floor($89);
        var $91 = HEAP[$1];
        var $92 = $91+12;
        var $93 = HEAP[$92];
        var $94 = $90 & $93;
        var $95 = HEAP[$1];
        var $96 = $95+12;
        HEAP[$96] = $94;;
        __label__ = 10; break;
      case 20: // $97
        var $98 = HEAP[$1];
        var $99 = $98+32;
        HEAP[$99] = 2;;
        __label__ = 10; break;
      case 10: // $100
        __label__ = 11; break;
      case 16: // $101
        var $102 = HEAP[$1];
        _ee_equals($102);
        var $103 = HEAP[$1];
        var $104 = $103+32;
        var $105 = HEAP[$104];
        var $106 = $105 != 0;
        if ($106) { __label__ = 12; break; } else { __label__ = 13; break; }
      case 12: // $107
        __label__ = 7; break;
      case 13: // $108
        var $109 = HEAP[$1];
        var $110 = $109+28;
        var $111 = HEAP[$110];
        if ($111 == 1) {
          __label__ = 21; break;
        }
        else if ($111 == 0) {
          __label__ = 22; break;
        }
        else {
        __label__ = 23; break;
        }
        
      case 21: // $112
        var $113 = HEAP[$oival];
        var $114 = HEAP[$1];
        var $115 = $114+20;
        var $116 = HEAP[$115];
        var $117 = Math.floor($116);
        var $118 = $113 & $117;
        var $119 = HEAP[$1];
        var $120 = $119+12;
        HEAP[$120] = $118;;
        var $121 = HEAP[$1];
        var $122 = $121+28;
        HEAP[$122] = 0;;
        __label__ = 14; break;
      case 22: // $123
        var $124 = HEAP[$oival];
        var $125 = HEAP[$1];
        var $126 = $125+12;
        var $127 = HEAP[$126];
        var $128 = $124 & $127;
        var $129 = HEAP[$1];
        var $130 = $129+12;
        HEAP[$130] = $128;;
        __label__ = 14; break;
      case 23: // $131
        var $132 = HEAP[$1];
        var $133 = $132+32;
        HEAP[$133] = 2;;
        __label__ = 14; break;
      case 14: // $134
        __label__ = 11; break;
      case 17: // $135
        var $136 = HEAP[$1];
        var $137 = $136+32;
        HEAP[$137] = 2;;
        __label__ = 11; break;
      case 11: // $138
        var $139 = HEAP[$1];
        _ee_skip_spaces($139);
        __label__ = 0; break;
      case 7: // $140
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_bitand.__index__ = Runtime.getFunctionIndex(_ee_bitand, "_ee_bitand");
  
  
  function _ee_equals($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $odval = __stackBase__+4;
        var $oival = __stackBase__+12;
        var $op = __stackBase__+20;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_compare($2);
        var $3 = HEAP[$1];
        _ee_skip_spaces($3);
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$1];
        var $6 = $5+8;
        var $7 = HEAP[$6];
        var $8 = HEAP[$1];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = unSign($7, 32) < unSign($10, 32);
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $12
        var $13 = HEAP[$1];
        var $14 = $13+32;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __lastLabel__ = 1; __label__ = 2; break; } else { __lastLabel__ = 1; __label__ = 3; break; }
      case 3: // $17
        var $18 = HEAP[$1];
        var $19 = $18+8;
        var $20 = HEAP[$19];
        var $21 = HEAP[$1];
        var $22 = $21;
        var $23 = HEAP[$22];
        var $24 = $23+$20;
        var $25 = HEAP[$24];
        var $26 = $25;
        var $27 = $26 == 61;
        if ($27) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $28
        var $29 = HEAP[$1];
        var $30 = $29+8;
        var $31 = HEAP[$30];
        var $32 = ($31 + 1)&4294967295;
        var $33 = HEAP[$1];
        var $34 = $33;
        var $35 = HEAP[$34];
        var $36 = $35+$32;
        var $37 = HEAP[$36];
        var $38 = $37;
        var $39 = $38 == 61;
        if ($39) { __lastLabel__ = 4; __label__ = 6; break; } else { __lastLabel__ = 4; __label__ = 5; break; }
      case 5: // $40
        var $41 = HEAP[$1];
        var $42 = $41+8;
        var $43 = HEAP[$42];
        var $44 = HEAP[$1];
        var $45 = $44;
        var $46 = HEAP[$45];
        var $47 = $46+$43;
        var $48 = HEAP[$47];
        var $49 = $48;
        var $50 = $49 == 33;
        if ($50) { __lastLabel__ = 5; __label__ = 7; break; } else { __lastLabel__ = 5; __label__ = 8; break; }
      case 7: // $51
        var $52 = HEAP[$1];
        var $53 = $52+8;
        var $54 = HEAP[$53];
        var $55 = ($54 + 1)&4294967295;
        var $56 = HEAP[$1];
        var $57 = $56;
        var $58 = HEAP[$57];
        var $59 = $58+$55;
        var $60 = HEAP[$59];
        var $61 = $60;
        var $62 = $61 == 61;
        __lastLabel__ = 7; __label__ = 8; break;
      case 8: // $63
        var $64 = __lastLabel__ == 5 ? 0 : ($62);
        __lastLabel__ = 8; __label__ = 6; break;
      case 6: // $65
        var $66 = __lastLabel__ == 4 ? 1 : ($64);
        __lastLabel__ = 6; __label__ = 2; break;
      case 2: // $67
        var $68 = __lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($66));
        if ($68) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $69
        var $70 = HEAP[$1];
        var $71 = $70+20;
        var $72 = HEAP[$71];
        HEAP[$odval] = $72;;
        var $73 = HEAP[$1];
        var $74 = $73+12;
        var $75 = HEAP[$74];
        HEAP[$oival] = $75;;
        var $76 = HEAP[$1];
        var $77 = $76+8;
        var $78 = HEAP[$77];
        var $79 = HEAP[$1];
        var $80 = $79;
        var $81 = HEAP[$80];
        var $82 = $81+$78;
        var $83 = HEAP[$82];
        var $84 = $83;
        var $85 = $84 == 61;
        var $86 = $85 ? 1 : 2;
        HEAP[$op] = $86;;
        var $87 = HEAP[$1];
        var $88 = $87+8;
        var $89 = HEAP[$88];
        var $90 = ($89 + 2)&4294967295;
        HEAP[$88] = $90;;
        var $91 = HEAP[$op];
        if ($91 == 1) {
          __label__ = 26; break;
        }
        else if ($91 == 2) {
          __label__ = 27; break;
        }
        else {
        __label__ = 18; break;
        }
        
      case 26: // $92
        var $93 = HEAP[$1];
        var $94 = $93+28;
        var $95 = HEAP[$94];
        if ($95 == 1) {
          __label__ = 28; break;
        }
        else if ($95 == 0) {
          __label__ = 29; break;
        }
        else {
        __label__ = 30; break;
        }
        
      case 28: // $96
        var $97 = HEAP[$1];
        _ee_compare($97);
        var $98 = HEAP[$1];
        var $99 = $98+32;
        var $100 = HEAP[$99];
        var $101 = $100 != 0;
        if ($101) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $102
        __label__ = 10; break;
      case 12: // $103
        var $104 = HEAP[$1];
        var $105 = $104+28;
        var $106 = HEAP[$105];
        if ($106 == 1) {
          __label__ = 31; break;
        }
        else if ($106 == 0) {
          __label__ = 32; break;
        }
        else {
        __label__ = 33; break;
        }
        
      case 31: // $107
        var $108 = HEAP[$odval];
        var $109 = HEAP[$1];
        var $110 = $109+20;
        var $111 = HEAP[$110];
        var $112 = $108 == $111;
        var $113 = $112 ? 1 : 0;
        var $114 = $113;
        var $115 = HEAP[$1];
        var $116 = $115+12;
        HEAP[$116] = $114;;
        var $117 = HEAP[$1];
        var $118 = $117+28;
        HEAP[$118] = 0;;
        __label__ = 13; break;
      case 32: // $119
        var $120 = HEAP[$odval];
        var $121 = HEAP[$1];
        var $122 = $121+12;
        var $123 = HEAP[$122];
        var $124 = $123;
        var $125 = $120 == $124;
        var $126 = $125 ? 1 : 0;
        var $127 = $126;
        var $128 = HEAP[$1];
        var $129 = $128+12;
        HEAP[$129] = $127;;
        __label__ = 13; break;
      case 33: // $130
        var $131 = HEAP[$1];
        var $132 = $131+32;
        HEAP[$132] = 2;;
        __label__ = 13; break;
      case 13: // $133
        __label__ = 14; break;
      case 29: // $134
        var $135 = HEAP[$1];
        _ee_compare($135);
        var $136 = HEAP[$1];
        var $137 = $136+32;
        var $138 = HEAP[$137];
        var $139 = $138 != 0;
        if ($139) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $140
        __label__ = 10; break;
      case 16: // $141
        var $142 = HEAP[$1];
        var $143 = $142+28;
        var $144 = HEAP[$143];
        if ($144 == 1) {
          __label__ = 34; break;
        }
        else if ($144 == 0) {
          __label__ = 35; break;
        }
        else {
        __label__ = 36; break;
        }
        
      case 34: // $145
        var $146 = HEAP[$oival];
        var $147 = $146;
        var $148 = HEAP[$1];
        var $149 = $148+20;
        var $150 = HEAP[$149];
        var $151 = $147 == $150;
        var $152 = $151 ? 1 : 0;
        var $153 = $152;
        var $154 = HEAP[$1];
        var $155 = $154+12;
        HEAP[$155] = $153;;
        var $156 = HEAP[$1];
        var $157 = $156+28;
        HEAP[$157] = 0;;
        __label__ = 17; break;
      case 35: // $158
        var $159 = HEAP[$oival];
        var $160 = HEAP[$1];
        var $161 = $160+12;
        var $162 = HEAP[$161];
        var $163 = $159 == $162;
        var $164 = $163 ? 1 : 0;
        var $165 = $164;
        var $166 = HEAP[$1];
        var $167 = $166+12;
        HEAP[$167] = $165;;
        __label__ = 17; break;
      case 36: // $168
        var $169 = HEAP[$1];
        var $170 = $169+32;
        HEAP[$170] = 2;;
        __label__ = 17; break;
      case 17: // $171
        __label__ = 14; break;
      case 30: // $172
        var $173 = HEAP[$1];
        var $174 = $173+32;
        HEAP[$174] = 2;;
        __label__ = 14; break;
      case 14: // $175
        __label__ = 18; break;
      case 27: // $176
        var $177 = HEAP[$1];
        var $178 = $177+28;
        var $179 = HEAP[$178];
        if ($179 == 1) {
          __label__ = 37; break;
        }
        else if ($179 == 0) {
          __label__ = 38; break;
        }
        else {
        __label__ = 39; break;
        }
        
      case 37: // $180
        var $181 = HEAP[$1];
        _ee_compare($181);
        var $182 = HEAP[$1];
        var $183 = $182+32;
        var $184 = HEAP[$183];
        var $185 = $184 != 0;
        if ($185) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 19: // $186
        __label__ = 10; break;
      case 20: // $187
        var $188 = HEAP[$1];
        var $189 = $188+28;
        var $190 = HEAP[$189];
        if ($190 == 1) {
          __label__ = 40; break;
        }
        else if ($190 == 0) {
          __label__ = 41; break;
        }
        else {
        __label__ = 42; break;
        }
        
      case 40: // $191
        var $192 = HEAP[$odval];
        var $193 = HEAP[$1];
        var $194 = $193+20;
        var $195 = HEAP[$194];
        var $196 = $192 != $195;
        var $197 = $196 ? 1 : 0;
        var $198 = $197;
        var $199 = HEAP[$1];
        var $200 = $199+12;
        HEAP[$200] = $198;;
        var $201 = HEAP[$1];
        var $202 = $201+28;
        HEAP[$202] = 0;;
        __label__ = 21; break;
      case 41: // $203
        var $204 = HEAP[$odval];
        var $205 = HEAP[$1];
        var $206 = $205+12;
        var $207 = HEAP[$206];
        var $208 = $207;
        var $209 = $204 != $208;
        var $210 = $209 ? 1 : 0;
        var $211 = $210;
        var $212 = HEAP[$1];
        var $213 = $212+12;
        HEAP[$213] = $211;;
        __label__ = 21; break;
      case 42: // $214
        var $215 = HEAP[$1];
        var $216 = $215+32;
        HEAP[$216] = 2;;
        __label__ = 21; break;
      case 21: // $217
        __label__ = 22; break;
      case 38: // $218
        var $219 = HEAP[$1];
        _ee_compare($219);
        var $220 = HEAP[$1];
        var $221 = $220+32;
        var $222 = HEAP[$221];
        var $223 = $222 != 0;
        if ($223) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $224
        __label__ = 10; break;
      case 24: // $225
        var $226 = HEAP[$1];
        var $227 = $226+28;
        var $228 = HEAP[$227];
        if ($228 == 1) {
          __label__ = 43; break;
        }
        else if ($228 == 0) {
          __label__ = 44; break;
        }
        else {
        __label__ = 45; break;
        }
        
      case 43: // $229
        var $230 = HEAP[$oival];
        var $231 = $230;
        var $232 = HEAP[$1];
        var $233 = $232+20;
        var $234 = HEAP[$233];
        var $235 = $231 != $234;
        var $236 = $235 ? 1 : 0;
        var $237 = $236;
        var $238 = HEAP[$1];
        var $239 = $238+12;
        HEAP[$239] = $237;;
        var $240 = HEAP[$1];
        var $241 = $240+28;
        HEAP[$241] = 0;;
        __label__ = 25; break;
      case 44: // $242
        var $243 = HEAP[$oival];
        var $244 = HEAP[$1];
        var $245 = $244+12;
        var $246 = HEAP[$245];
        var $247 = $243 != $246;
        var $248 = $247 ? 1 : 0;
        var $249 = $248;
        var $250 = HEAP[$1];
        var $251 = $250+12;
        HEAP[$251] = $249;;
        __label__ = 25; break;
      case 45: // $252
        var $253 = HEAP[$1];
        var $254 = $253+32;
        HEAP[$254] = 2;;
        __label__ = 25; break;
      case 25: // $255
        __label__ = 22; break;
      case 39: // $256
        var $257 = HEAP[$1];
        var $258 = $257+32;
        HEAP[$258] = 2;;
        __label__ = 22; break;
      case 22: // $259
        __label__ = 18; break;
      case 18: // $260
        var $261 = HEAP[$1];
        _ee_skip_spaces($261);
        __label__ = 0; break;
      case 10: // $262
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_equals.__index__ = Runtime.getFunctionIndex(_ee_equals, "_ee_equals");
  
  
  function _ee_compare($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 24; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $odval = __stackBase__+4;
        var $oival = __stackBase__+12;
        var $op = __stackBase__+20;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_shift($2);
        var $3 = HEAP[$1];
        _ee_skip_spaces($3);
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$1];
        var $6 = $5+8;
        var $7 = HEAP[$6];
        var $8 = HEAP[$1];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = unSign($7, 32) < unSign($10, 32);
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $12
        var $13 = HEAP[$1];
        var $14 = $13+32;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __lastLabel__ = 1; __label__ = 2; break; } else { __lastLabel__ = 1; __label__ = 3; break; }
      case 3: // $17
        var $18 = HEAP[$1];
        var $19 = $18+8;
        var $20 = HEAP[$19];
        var $21 = HEAP[$1];
        var $22 = $21;
        var $23 = HEAP[$22];
        var $24 = $23+$20;
        var $25 = HEAP[$24];
        var $26 = $25;
        var $27 = $26 == 60;
        if ($27) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $28
        var $29 = HEAP[$1];
        var $30 = $29+8;
        var $31 = HEAP[$30];
        var $32 = ($31 + 1)&4294967295;
        var $33 = HEAP[$1];
        var $34 = $33;
        var $35 = HEAP[$34];
        var $36 = $35+$32;
        var $37 = HEAP[$36];
        var $38 = $37;
        var $39 = ___ctype_b_loc();
        var $40 = HEAP[$39];
        var $41 = $40+2*$38;
        var $42 = HEAP[$41];
        var $43 = $42;
        var $44 = $43 & 4;
        var $45 = $44 != 0;
        if ($45) { __lastLabel__ = 4; __label__ = 5; break; } else { __lastLabel__ = 4; __label__ = 6; break; }
      case 5: // $46
        var $47 = HEAP[$1];
        var $48 = $47+8;
        var $49 = HEAP[$48];
        var $50 = HEAP[$1];
        var $51 = $50;
        var $52 = HEAP[$51];
        var $53 = $52+$49;
        var $54 = HEAP[$53];
        var $55 = $54;
        var $56 = $55 == 62;
        if ($56) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $57
        var $58 = HEAP[$1];
        var $59 = $58+8;
        var $60 = HEAP[$59];
        var $61 = ($60 + 1)&4294967295;
        var $62 = HEAP[$1];
        var $63 = $62;
        var $64 = HEAP[$63];
        var $65 = $64+$61;
        var $66 = HEAP[$65];
        var $67 = $66;
        var $68 = ___ctype_b_loc();
        var $69 = HEAP[$68];
        var $70 = $69+2*$67;
        var $71 = HEAP[$70];
        var $72 = $71;
        var $73 = $72 & 4;
        var $74 = $73 != 0;
        if ($74) { __lastLabel__ = 7; __label__ = 8; break; } else { __lastLabel__ = 7; __label__ = 6; break; }
      case 8: // $75
        var $76 = HEAP[$1];
        var $77 = $76+8;
        var $78 = HEAP[$77];
        var $79 = HEAP[$1];
        var $80 = $79;
        var $81 = HEAP[$80];
        var $82 = $81+$78;
        var $83 = HEAP[$82];
        var $84 = $83;
        var $85 = $84 == 60;
        if ($85) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $86
        var $87 = HEAP[$1];
        var $88 = $87+8;
        var $89 = HEAP[$88];
        var $90 = ($89 + 1)&4294967295;
        var $91 = HEAP[$1];
        var $92 = $91;
        var $93 = HEAP[$92];
        var $94 = $93+$90;
        var $95 = HEAP[$94];
        var $96 = $95;
        var $97 = $96 == 61;
        if ($97) { __lastLabel__ = 9; __label__ = 6; break; } else { __lastLabel__ = 9; __label__ = 10; break; }
      case 10: // $98
        var $99 = HEAP[$1];
        var $100 = $99+8;
        var $101 = HEAP[$100];
        var $102 = HEAP[$1];
        var $103 = $102;
        var $104 = HEAP[$103];
        var $105 = $104+$101;
        var $106 = HEAP[$105];
        var $107 = $106;
        var $108 = $107 == 62;
        if ($108) { __lastLabel__ = 10; __label__ = 11; break; } else { __lastLabel__ = 10; __label__ = 12; break; }
      case 11: // $109
        var $110 = HEAP[$1];
        var $111 = $110+8;
        var $112 = HEAP[$111];
        var $113 = ($112 + 1)&4294967295;
        var $114 = HEAP[$1];
        var $115 = $114;
        var $116 = HEAP[$115];
        var $117 = $116+$113;
        var $118 = HEAP[$117];
        var $119 = $118;
        var $120 = $119 == 61;
        __lastLabel__ = 11; __label__ = 12; break;
      case 12: // $121
        var $122 = __lastLabel__ == 10 ? 0 : ($120);
        __lastLabel__ = 12; __label__ = 6; break;
      case 6: // $123
        var $124 = __lastLabel__ == 9 ? 1 : (__lastLabel__ == 7 ? 1 : (__lastLabel__ == 4 ? 1 : ($122)));
        __lastLabel__ = 6; __label__ = 2; break;
      case 2: // $125
        var $126 = __lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($124));
        if ($126) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $127
        var $128 = HEAP[$1];
        var $129 = $128+20;
        var $130 = HEAP[$129];
        HEAP[$odval] = $130;;
        var $131 = HEAP[$1];
        var $132 = $131+12;
        var $133 = HEAP[$132];
        HEAP[$oival] = $133;;
        HEAP[$op] = 4;;
        var $134 = HEAP[$1];
        var $135 = $134+8;
        var $136 = HEAP[$135];
        var $137 = HEAP[$1];
        var $138 = $137;
        var $139 = HEAP[$138];
        var $140 = $139+$136;
        var $141 = HEAP[$140];
        var $142 = $141;
        var $143 = $142 == 60;
        if ($143) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $144
        var $145 = HEAP[$1];
        var $146 = $145+8;
        var $147 = HEAP[$146];
        var $148 = ($147 + 1)&4294967295;
        var $149 = HEAP[$1];
        var $150 = $149;
        var $151 = HEAP[$150];
        var $152 = $151+$148;
        var $153 = HEAP[$152];
        var $154 = $153;
        var $155 = ___ctype_b_loc();
        var $156 = HEAP[$155];
        var $157 = $156+2*$154;
        var $158 = HEAP[$157];
        var $159 = $158;
        var $160 = $159 & 4;
        var $161 = $160 != 0;
        if ($161) { __label__ = 16; break; } else { __label__ = 17; break; }
      case 17: // $162
        HEAP[$op] = 1;;
        __label__ = 18; break;
      case 16: // $163
        var $164 = HEAP[$1];
        var $165 = $164+8;
        var $166 = HEAP[$165];
        var $167 = HEAP[$1];
        var $168 = $167;
        var $169 = HEAP[$168];
        var $170 = $169+$166;
        var $171 = HEAP[$170];
        var $172 = $171;
        var $173 = $172 == 62;
        if ($173) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 19: // $174
        var $175 = HEAP[$1];
        var $176 = $175+8;
        var $177 = HEAP[$176];
        var $178 = ($177 + 1)&4294967295;
        var $179 = HEAP[$1];
        var $180 = $179;
        var $181 = HEAP[$180];
        var $182 = $181+$178;
        var $183 = HEAP[$182];
        var $184 = $183;
        var $185 = ___ctype_b_loc();
        var $186 = HEAP[$185];
        var $187 = $186+2*$184;
        var $188 = HEAP[$187];
        var $189 = $188;
        var $190 = $189 & 4;
        var $191 = $190 != 0;
        if ($191) { __label__ = 20; break; } else { __label__ = 21; break; }
      case 21: // $192
        HEAP[$op] = 2;;
        __label__ = 22; break;
      case 20: // $193
        var $194 = HEAP[$1];
        var $195 = $194+8;
        var $196 = HEAP[$195];
        var $197 = HEAP[$1];
        var $198 = $197;
        var $199 = HEAP[$198];
        var $200 = $199+$196;
        var $201 = HEAP[$200];
        var $202 = $201;
        var $203 = $202 == 60;
        if ($203) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $204
        var $205 = HEAP[$1];
        var $206 = $205+8;
        var $207 = HEAP[$206];
        var $208 = ($207 + 1)&4294967295;
        var $209 = HEAP[$1];
        var $210 = $209;
        var $211 = HEAP[$210];
        var $212 = $211+$208;
        var $213 = HEAP[$212];
        var $214 = $213;
        var $215 = $214 == 61;
        if ($215) { __label__ = 25; break; } else { __label__ = 24; break; }
      case 25: // $216
        HEAP[$op] = 3;;
        __label__ = 24; break;
      case 24: // $217
        __label__ = 22; break;
      case 22: // $218
        __label__ = 18; break;
      case 18: // $219
        var $220 = HEAP[$op];
        var $221 = $220 > 2;
        var $222 = $221 ? 2 : 1;
        var $223 = HEAP[$1];
        var $224 = $223+8;
        var $225 = HEAP[$224];
        var $226 = ($225 + $222)&4294967295;
        HEAP[$224] = $226;;
        var $227 = HEAP[$op];
        if ($227 == 1) {
          __label__ = 55; break;
        }
        else if ($227 == 2) {
          __label__ = 56; break;
        }
        else if ($227 == 3) {
          __label__ = 57; break;
        }
        else if ($227 == 4) {
          __label__ = 58; break;
        }
        else {
        __label__ = 33; break;
        }
        
      case 55: // $228
        var $229 = HEAP[$1];
        var $230 = $229+28;
        var $231 = HEAP[$230];
        if ($231 == 1) {
          __label__ = 59; break;
        }
        else if ($231 == 0) {
          __label__ = 60; break;
        }
        else {
        __label__ = 61; break;
        }
        
      case 59: // $232
        var $233 = HEAP[$1];
        _ee_shift($233);
        var $234 = HEAP[$1];
        var $235 = $234+32;
        var $236 = HEAP[$235];
        var $237 = $236 != 0;
        if ($237) { __label__ = 26; break; } else { __label__ = 27; break; }
      case 26: // $238
        __label__ = 14; break;
      case 27: // $239
        var $240 = HEAP[$1];
        var $241 = $240+28;
        var $242 = HEAP[$241];
        if ($242 == 1) {
          __label__ = 62; break;
        }
        else if ($242 == 0) {
          __label__ = 63; break;
        }
        else {
        __label__ = 64; break;
        }
        
      case 62: // $243
        var $244 = HEAP[$odval];
        var $245 = HEAP[$1];
        var $246 = $245+20;
        var $247 = HEAP[$246];
        var $248 = $244 < $247;
        var $249 = $248 ? 1 : 0;
        var $250 = $249;
        var $251 = HEAP[$1];
        var $252 = $251+12;
        HEAP[$252] = $250;;
        var $253 = HEAP[$1];
        var $254 = $253+28;
        HEAP[$254] = 0;;
        __label__ = 28; break;
      case 63: // $255
        var $256 = HEAP[$odval];
        var $257 = HEAP[$1];
        var $258 = $257+12;
        var $259 = HEAP[$258];
        var $260 = $259;
        var $261 = $256 < $260;
        var $262 = $261 ? 1 : 0;
        var $263 = $262;
        var $264 = HEAP[$1];
        var $265 = $264+12;
        HEAP[$265] = $263;;
        __label__ = 28; break;
      case 64: // $266
        var $267 = HEAP[$1];
        var $268 = $267+32;
        HEAP[$268] = 2;;
        __label__ = 28; break;
      case 28: // $269
        __label__ = 29; break;
      case 60: // $270
        var $271 = HEAP[$1];
        _ee_shift($271);
        var $272 = HEAP[$1];
        var $273 = $272+32;
        var $274 = HEAP[$273];
        var $275 = $274 != 0;
        if ($275) { __label__ = 30; break; } else { __label__ = 31; break; }
      case 30: // $276
        __label__ = 14; break;
      case 31: // $277
        var $278 = HEAP[$1];
        var $279 = $278+28;
        var $280 = HEAP[$279];
        if ($280 == 1) {
          __label__ = 65; break;
        }
        else if ($280 == 0) {
          __label__ = 66; break;
        }
        else {
        __label__ = 67; break;
        }
        
      case 65: // $281
        var $282 = HEAP[$oival];
        var $283 = $282;
        var $284 = HEAP[$1];
        var $285 = $284+20;
        var $286 = HEAP[$285];
        var $287 = $283 < $286;
        var $288 = $287 ? 1 : 0;
        var $289 = $288;
        var $290 = HEAP[$1];
        var $291 = $290+12;
        HEAP[$291] = $289;;
        var $292 = HEAP[$1];
        var $293 = $292+28;
        HEAP[$293] = 0;;
        __label__ = 32; break;
      case 66: // $294
        var $295 = HEAP[$oival];
        var $296 = HEAP[$1];
        var $297 = $296+12;
        var $298 = HEAP[$297];
        var $299 = $295 < $298;
        var $300 = $299 ? 1 : 0;
        var $301 = $300;
        var $302 = HEAP[$1];
        var $303 = $302+12;
        HEAP[$303] = $301;;
        __label__ = 32; break;
      case 67: // $304
        var $305 = HEAP[$1];
        var $306 = $305+32;
        HEAP[$306] = 2;;
        __label__ = 32; break;
      case 32: // $307
        __label__ = 29; break;
      case 61: // $308
        var $309 = HEAP[$1];
        var $310 = $309+32;
        HEAP[$310] = 2;;
        __label__ = 29; break;
      case 29: // $311
        __label__ = 33; break;
      case 56: // $312
        var $313 = HEAP[$1];
        var $314 = $313+28;
        var $315 = HEAP[$314];
        if ($315 == 1) {
          __label__ = 68; break;
        }
        else if ($315 == 0) {
          __label__ = 69; break;
        }
        else {
        __label__ = 70; break;
        }
        
      case 68: // $316
        var $317 = HEAP[$1];
        _ee_shift($317);
        var $318 = HEAP[$1];
        var $319 = $318+32;
        var $320 = HEAP[$319];
        var $321 = $320 != 0;
        if ($321) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $322
        __label__ = 14; break;
      case 35: // $323
        var $324 = HEAP[$1];
        var $325 = $324+28;
        var $326 = HEAP[$325];
        if ($326 == 1) {
          __label__ = 71; break;
        }
        else if ($326 == 0) {
          __label__ = 72; break;
        }
        else {
        __label__ = 73; break;
        }
        
      case 71: // $327
        var $328 = HEAP[$odval];
        var $329 = HEAP[$1];
        var $330 = $329+20;
        var $331 = HEAP[$330];
        var $332 = $328 > $331;
        var $333 = $332 ? 1 : 0;
        var $334 = $333;
        var $335 = HEAP[$1];
        var $336 = $335+12;
        HEAP[$336] = $334;;
        var $337 = HEAP[$1];
        var $338 = $337+28;
        HEAP[$338] = 0;;
        __label__ = 36; break;
      case 72: // $339
        var $340 = HEAP[$odval];
        var $341 = HEAP[$1];
        var $342 = $341+12;
        var $343 = HEAP[$342];
        var $344 = $343;
        var $345 = $340 > $344;
        var $346 = $345 ? 1 : 0;
        var $347 = $346;
        var $348 = HEAP[$1];
        var $349 = $348+12;
        HEAP[$349] = $347;;
        __label__ = 36; break;
      case 73: // $350
        var $351 = HEAP[$1];
        var $352 = $351+32;
        HEAP[$352] = 2;;
        __label__ = 36; break;
      case 36: // $353
        __label__ = 37; break;
      case 69: // $354
        var $355 = HEAP[$1];
        _ee_shift($355);
        var $356 = HEAP[$1];
        var $357 = $356+32;
        var $358 = HEAP[$357];
        var $359 = $358 != 0;
        if ($359) { __label__ = 38; break; } else { __label__ = 39; break; }
      case 38: // $360
        __label__ = 14; break;
      case 39: // $361
        var $362 = HEAP[$1];
        var $363 = $362+28;
        var $364 = HEAP[$363];
        if ($364 == 1) {
          __label__ = 74; break;
        }
        else if ($364 == 0) {
          __label__ = 75; break;
        }
        else {
        __label__ = 76; break;
        }
        
      case 74: // $365
        var $366 = HEAP[$oival];
        var $367 = $366;
        var $368 = HEAP[$1];
        var $369 = $368+20;
        var $370 = HEAP[$369];
        var $371 = $367 > $370;
        var $372 = $371 ? 1 : 0;
        var $373 = $372;
        var $374 = HEAP[$1];
        var $375 = $374+12;
        HEAP[$375] = $373;;
        var $376 = HEAP[$1];
        var $377 = $376+28;
        HEAP[$377] = 0;;
        __label__ = 40; break;
      case 75: // $378
        var $379 = HEAP[$oival];
        var $380 = HEAP[$1];
        var $381 = $380+12;
        var $382 = HEAP[$381];
        var $383 = $379 > $382;
        var $384 = $383 ? 1 : 0;
        var $385 = $384;
        var $386 = HEAP[$1];
        var $387 = $386+12;
        HEAP[$387] = $385;;
        __label__ = 40; break;
      case 76: // $388
        var $389 = HEAP[$1];
        var $390 = $389+32;
        HEAP[$390] = 2;;
        __label__ = 40; break;
      case 40: // $391
        __label__ = 37; break;
      case 70: // $392
        var $393 = HEAP[$1];
        var $394 = $393+32;
        HEAP[$394] = 2;;
        __label__ = 37; break;
      case 37: // $395
        __label__ = 33; break;
      case 57: // $396
        var $397 = HEAP[$1];
        var $398 = $397+28;
        var $399 = HEAP[$398];
        if ($399 == 1) {
          __label__ = 77; break;
        }
        else if ($399 == 0) {
          __label__ = 78; break;
        }
        else {
        __label__ = 79; break;
        }
        
      case 77: // $400
        var $401 = HEAP[$1];
        _ee_shift($401);
        var $402 = HEAP[$1];
        var $403 = $402+32;
        var $404 = HEAP[$403];
        var $405 = $404 != 0;
        if ($405) { __label__ = 41; break; } else { __label__ = 42; break; }
      case 41: // $406
        __label__ = 14; break;
      case 42: // $407
        var $408 = HEAP[$1];
        var $409 = $408+28;
        var $410 = HEAP[$409];
        if ($410 == 1) {
          __label__ = 80; break;
        }
        else if ($410 == 0) {
          __label__ = 81; break;
        }
        else {
        __label__ = 82; break;
        }
        
      case 80: // $411
        var $412 = HEAP[$odval];
        var $413 = HEAP[$1];
        var $414 = $413+20;
        var $415 = HEAP[$414];
        var $416 = $412 <= $415;
        var $417 = $416 ? 1 : 0;
        var $418 = $417;
        var $419 = HEAP[$1];
        var $420 = $419+12;
        HEAP[$420] = $418;;
        var $421 = HEAP[$1];
        var $422 = $421+28;
        HEAP[$422] = 0;;
        __label__ = 43; break;
      case 81: // $423
        var $424 = HEAP[$odval];
        var $425 = HEAP[$1];
        var $426 = $425+12;
        var $427 = HEAP[$426];
        var $428 = $427;
        var $429 = $424 <= $428;
        var $430 = $429 ? 1 : 0;
        var $431 = $430;
        var $432 = HEAP[$1];
        var $433 = $432+12;
        HEAP[$433] = $431;;
        __label__ = 43; break;
      case 82: // $434
        var $435 = HEAP[$1];
        var $436 = $435+32;
        HEAP[$436] = 2;;
        __label__ = 43; break;
      case 43: // $437
        __label__ = 44; break;
      case 78: // $438
        var $439 = HEAP[$1];
        _ee_shift($439);
        var $440 = HEAP[$1];
        var $441 = $440+32;
        var $442 = HEAP[$441];
        var $443 = $442 != 0;
        if ($443) { __label__ = 45; break; } else { __label__ = 46; break; }
      case 45: // $444
        __label__ = 14; break;
      case 46: // $445
        var $446 = HEAP[$1];
        var $447 = $446+28;
        var $448 = HEAP[$447];
        if ($448 == 1) {
          __label__ = 83; break;
        }
        else if ($448 == 0) {
          __label__ = 84; break;
        }
        else {
        __label__ = 85; break;
        }
        
      case 83: // $449
        var $450 = HEAP[$oival];
        var $451 = $450;
        var $452 = HEAP[$1];
        var $453 = $452+20;
        var $454 = HEAP[$453];
        var $455 = $451 <= $454;
        var $456 = $455 ? 1 : 0;
        var $457 = $456;
        var $458 = HEAP[$1];
        var $459 = $458+12;
        HEAP[$459] = $457;;
        var $460 = HEAP[$1];
        var $461 = $460+28;
        HEAP[$461] = 0;;
        __label__ = 47; break;
      case 84: // $462
        var $463 = HEAP[$oival];
        var $464 = HEAP[$1];
        var $465 = $464+12;
        var $466 = HEAP[$465];
        var $467 = $463 <= $466;
        var $468 = $467 ? 1 : 0;
        var $469 = $468;
        var $470 = HEAP[$1];
        var $471 = $470+12;
        HEAP[$471] = $469;;
        __label__ = 47; break;
      case 85: // $472
        var $473 = HEAP[$1];
        var $474 = $473+32;
        HEAP[$474] = 2;;
        __label__ = 47; break;
      case 47: // $475
        __label__ = 44; break;
      case 79: // $476
        var $477 = HEAP[$1];
        var $478 = $477+32;
        HEAP[$478] = 2;;
        __label__ = 44; break;
      case 44: // $479
        __label__ = 33; break;
      case 58: // $480
        var $481 = HEAP[$1];
        var $482 = $481+28;
        var $483 = HEAP[$482];
        if ($483 == 1) {
          __label__ = 86; break;
        }
        else if ($483 == 0) {
          __label__ = 87; break;
        }
        else {
        __label__ = 88; break;
        }
        
      case 86: // $484
        var $485 = HEAP[$1];
        _ee_shift($485);
        var $486 = HEAP[$1];
        var $487 = $486+32;
        var $488 = HEAP[$487];
        var $489 = $488 != 0;
        if ($489) { __label__ = 48; break; } else { __label__ = 49; break; }
      case 48: // $490
        __label__ = 14; break;
      case 49: // $491
        var $492 = HEAP[$1];
        var $493 = $492+28;
        var $494 = HEAP[$493];
        if ($494 == 1) {
          __label__ = 89; break;
        }
        else if ($494 == 0) {
          __label__ = 90; break;
        }
        else {
        __label__ = 91; break;
        }
        
      case 89: // $495
        var $496 = HEAP[$odval];
        var $497 = HEAP[$1];
        var $498 = $497+20;
        var $499 = HEAP[$498];
        var $500 = $496 >= $499;
        var $501 = $500 ? 1 : 0;
        var $502 = $501;
        var $503 = HEAP[$1];
        var $504 = $503+12;
        HEAP[$504] = $502;;
        var $505 = HEAP[$1];
        var $506 = $505+28;
        HEAP[$506] = 0;;
        __label__ = 50; break;
      case 90: // $507
        var $508 = HEAP[$odval];
        var $509 = HEAP[$1];
        var $510 = $509+12;
        var $511 = HEAP[$510];
        var $512 = $511;
        var $513 = $508 >= $512;
        var $514 = $513 ? 1 : 0;
        var $515 = $514;
        var $516 = HEAP[$1];
        var $517 = $516+12;
        HEAP[$517] = $515;;
        __label__ = 50; break;
      case 91: // $518
        var $519 = HEAP[$1];
        var $520 = $519+32;
        HEAP[$520] = 2;;
        __label__ = 50; break;
      case 50: // $521
        __label__ = 51; break;
      case 87: // $522
        var $523 = HEAP[$1];
        _ee_shift($523);
        var $524 = HEAP[$1];
        var $525 = $524+32;
        var $526 = HEAP[$525];
        var $527 = $526 != 0;
        if ($527) { __label__ = 52; break; } else { __label__ = 53; break; }
      case 52: // $528
        __label__ = 14; break;
      case 53: // $529
        var $530 = HEAP[$1];
        var $531 = $530+28;
        var $532 = HEAP[$531];
        if ($532 == 1) {
          __label__ = 92; break;
        }
        else if ($532 == 0) {
          __label__ = 93; break;
        }
        else {
        __label__ = 94; break;
        }
        
      case 92: // $533
        var $534 = HEAP[$oival];
        var $535 = $534;
        var $536 = HEAP[$1];
        var $537 = $536+20;
        var $538 = HEAP[$537];
        var $539 = $535 >= $538;
        var $540 = $539 ? 1 : 0;
        var $541 = $540;
        var $542 = HEAP[$1];
        var $543 = $542+12;
        HEAP[$543] = $541;;
        var $544 = HEAP[$1];
        var $545 = $544+28;
        HEAP[$545] = 0;;
        __label__ = 54; break;
      case 93: // $546
        var $547 = HEAP[$oival];
        var $548 = HEAP[$1];
        var $549 = $548+12;
        var $550 = HEAP[$549];
        var $551 = $547 >= $550;
        var $552 = $551 ? 1 : 0;
        var $553 = $552;
        var $554 = HEAP[$1];
        var $555 = $554+12;
        HEAP[$555] = $553;;
        __label__ = 54; break;
      case 94: // $556
        var $557 = HEAP[$1];
        var $558 = $557+32;
        HEAP[$558] = 2;;
        __label__ = 54; break;
      case 54: // $559
        __label__ = 51; break;
      case 88: // $560
        var $561 = HEAP[$1];
        var $562 = $561+32;
        HEAP[$562] = 2;;
        __label__ = 51; break;
      case 51: // $563
        __label__ = 33; break;
      case 33: // $564
        var $565 = HEAP[$1];
        _ee_skip_spaces($565);
        __label__ = 0; break;
      case 14: // $566
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_compare.__index__ = Runtime.getFunctionIndex(_ee_compare, "_ee_compare");
  
  
  function _ee_shift($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $odval = __stackBase__+4;
        var $oival = __stackBase__+12;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_addsub($2);
        var $3 = HEAP[$1];
        _ee_skip_spaces($3);
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$1];
        var $6 = $5+8;
        var $7 = HEAP[$6];
        var $8 = HEAP[$1];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = unSign($7, 32) < unSign($10, 32);
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $12
        var $13 = HEAP[$1];
        var $14 = $13+32;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __lastLabel__ = 1; __label__ = 2; break; } else { __lastLabel__ = 1; __label__ = 3; break; }
      case 3: // $17
        var $18 = HEAP[$1];
        var $19 = $18+8;
        var $20 = HEAP[$19];
        var $21 = HEAP[$1];
        var $22 = $21;
        var $23 = HEAP[$22];
        var $24 = $23+$20;
        var $25 = HEAP[$24];
        var $26 = $25;
        var $27 = $26 == 60;
        if ($27) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 4: // $28
        var $29 = HEAP[$1];
        var $30 = $29+8;
        var $31 = HEAP[$30];
        var $32 = ($31 + 1)&4294967295;
        var $33 = HEAP[$1];
        var $34 = $33;
        var $35 = HEAP[$34];
        var $36 = $35+$32;
        var $37 = HEAP[$36];
        var $38 = $37;
        var $39 = $38 == 60;
        if ($39) { __lastLabel__ = 4; __label__ = 6; break; } else { __lastLabel__ = 4; __label__ = 5; break; }
      case 5: // $40
        var $41 = HEAP[$1];
        var $42 = $41+8;
        var $43 = HEAP[$42];
        var $44 = HEAP[$1];
        var $45 = $44;
        var $46 = HEAP[$45];
        var $47 = $46+$43;
        var $48 = HEAP[$47];
        var $49 = $48;
        var $50 = $49 == 62;
        if ($50) { __lastLabel__ = 5; __label__ = 7; break; } else { __lastLabel__ = 5; __label__ = 8; break; }
      case 7: // $51
        var $52 = HEAP[$1];
        var $53 = $52+8;
        var $54 = HEAP[$53];
        var $55 = ($54 + 1)&4294967295;
        var $56 = HEAP[$1];
        var $57 = $56;
        var $58 = HEAP[$57];
        var $59 = $58+$55;
        var $60 = HEAP[$59];
        var $61 = $60;
        var $62 = $61 == 62;
        __lastLabel__ = 7; __label__ = 8; break;
      case 8: // $63
        var $64 = __lastLabel__ == 5 ? 0 : ($62);
        __lastLabel__ = 8; __label__ = 6; break;
      case 6: // $65
        var $66 = __lastLabel__ == 4 ? 1 : ($64);
        __lastLabel__ = 6; __label__ = 2; break;
      case 2: // $67
        var $68 = __lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($66));
        if ($68) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $69
        var $70 = HEAP[$1];
        var $71 = $70+20;
        var $72 = HEAP[$71];
        HEAP[$odval] = $72;;
        var $73 = HEAP[$1];
        var $74 = $73+12;
        var $75 = HEAP[$74];
        HEAP[$oival] = $75;;
        var $76 = HEAP[$1];
        var $77 = $76+8;
        var $78 = HEAP[$77];
        var $79 = ($78 + 1)&4294967295;
        HEAP[$77] = $79;;
        var $80 = HEAP[$1];
        var $81 = $80+8;
        var $82 = HEAP[$81];
        var $83 = HEAP[$1];
        var $84 = $83;
        var $85 = HEAP[$84];
        var $86 = $85+$82;
        var $87 = HEAP[$86];
        var $88 = $87;
        if ($88 == 60) {
          __label__ = 26; break;
        }
        else if ($88 == 62) {
          __label__ = 27; break;
        }
        else {
        __label__ = 18; break;
        }
        
      case 26: // $89
        var $90 = HEAP[$1];
        var $91 = $90+28;
        var $92 = HEAP[$91];
        if ($92 == 1) {
          __label__ = 28; break;
        }
        else if ($92 == 0) {
          __label__ = 29; break;
        }
        else {
        __label__ = 30; break;
        }
        
      case 28: // $93
        var $94 = HEAP[$1];
        var $95 = $94+8;
        var $96 = HEAP[$95];
        var $97 = ($96 + 1)&4294967295;
        HEAP[$95] = $97;;
        var $98 = HEAP[$1];
        _ee_addsub($98);
        var $99 = HEAP[$1];
        var $100 = $99+32;
        var $101 = HEAP[$100];
        var $102 = $101 != 0;
        if ($102) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $103
        __label__ = 10; break;
      case 12: // $104
        var $105 = HEAP[$1];
        var $106 = $105+28;
        var $107 = HEAP[$106];
        if ($107 == 1) {
          __label__ = 31; break;
        }
        else if ($107 == 0) {
          __label__ = 32; break;
        }
        else {
        __label__ = 33; break;
        }
        
      case 31: // $108
        var $109 = HEAP[$odval];
        var $110 = Math.floor($109);
        var $111 = HEAP[$1];
        var $112 = $111+20;
        var $113 = HEAP[$112];
        var $114 = Math.floor($113);
        var $115 = $110 << $114;
        var $116 = HEAP[$1];
        var $117 = $116+12;
        HEAP[$117] = $115;;
        var $118 = HEAP[$1];
        var $119 = $118+28;
        HEAP[$119] = 0;;
        __label__ = 13; break;
      case 32: // $120
        var $121 = HEAP[$odval];
        var $122 = Math.floor($121);
        var $123 = HEAP[$1];
        var $124 = $123+12;
        var $125 = HEAP[$124];
        var $126 = $122 << $125;
        var $127 = HEAP[$1];
        var $128 = $127+12;
        HEAP[$128] = $126;;
        __label__ = 13; break;
      case 33: // $129
        var $130 = HEAP[$1];
        var $131 = $130+32;
        HEAP[$131] = 2;;
        __label__ = 13; break;
      case 13: // $132
        __label__ = 14; break;
      case 29: // $133
        var $134 = HEAP[$1];
        var $135 = $134+8;
        var $136 = HEAP[$135];
        var $137 = ($136 + 1)&4294967295;
        HEAP[$135] = $137;;
        var $138 = HEAP[$1];
        _ee_addsub($138);
        var $139 = HEAP[$1];
        var $140 = $139+32;
        var $141 = HEAP[$140];
        var $142 = $141 != 0;
        if ($142) { __label__ = 15; break; } else { __label__ = 16; break; }
      case 15: // $143
        __label__ = 10; break;
      case 16: // $144
        var $145 = HEAP[$1];
        var $146 = $145+28;
        var $147 = HEAP[$146];
        if ($147 == 1) {
          __label__ = 34; break;
        }
        else if ($147 == 0) {
          __label__ = 35; break;
        }
        else {
        __label__ = 36; break;
        }
        
      case 34: // $148
        var $149 = HEAP[$oival];
        var $150 = HEAP[$1];
        var $151 = $150+20;
        var $152 = HEAP[$151];
        var $153 = Math.floor($152);
        var $154 = $149 << $153;
        var $155 = HEAP[$1];
        var $156 = $155+12;
        HEAP[$156] = $154;;
        var $157 = HEAP[$1];
        var $158 = $157+28;
        HEAP[$158] = 0;;
        __label__ = 17; break;
      case 35: // $159
        var $160 = HEAP[$oival];
        var $161 = HEAP[$1];
        var $162 = $161+12;
        var $163 = HEAP[$162];
        var $164 = $160 << $163;
        var $165 = HEAP[$1];
        var $166 = $165+12;
        HEAP[$166] = $164;;
        __label__ = 17; break;
      case 36: // $167
        var $168 = HEAP[$1];
        var $169 = $168+32;
        HEAP[$169] = 2;;
        __label__ = 17; break;
      case 17: // $170
        __label__ = 14; break;
      case 30: // $171
        var $172 = HEAP[$1];
        var $173 = $172+32;
        HEAP[$173] = 2;;
        __label__ = 14; break;
      case 14: // $174
        __label__ = 18; break;
      case 27: // $175
        var $176 = HEAP[$1];
        var $177 = $176+28;
        var $178 = HEAP[$177];
        if ($178 == 1) {
          __label__ = 37; break;
        }
        else if ($178 == 0) {
          __label__ = 38; break;
        }
        else {
        __label__ = 39; break;
        }
        
      case 37: // $179
        var $180 = HEAP[$1];
        var $181 = $180+8;
        var $182 = HEAP[$181];
        var $183 = ($182 + 1)&4294967295;
        HEAP[$181] = $183;;
        var $184 = HEAP[$1];
        _ee_addsub($184);
        var $185 = HEAP[$1];
        var $186 = $185+32;
        var $187 = HEAP[$186];
        var $188 = $187 != 0;
        if ($188) { __label__ = 19; break; } else { __label__ = 20; break; }
      case 19: // $189
        __label__ = 10; break;
      case 20: // $190
        var $191 = HEAP[$1];
        var $192 = $191+28;
        var $193 = HEAP[$192];
        if ($193 == 1) {
          __label__ = 40; break;
        }
        else if ($193 == 0) {
          __label__ = 41; break;
        }
        else {
        __label__ = 42; break;
        }
        
      case 40: // $194
        var $195 = HEAP[$odval];
        var $196 = Math.floor($195);
        var $197 = HEAP[$1];
        var $198 = $197+20;
        var $199 = HEAP[$198];
        var $200 = Math.floor($199);
        var $201 = $196 >> $200;
        var $202 = HEAP[$1];
        var $203 = $202+12;
        HEAP[$203] = $201;;
        var $204 = HEAP[$1];
        var $205 = $204+28;
        HEAP[$205] = 0;;
        __label__ = 21; break;
      case 41: // $206
        var $207 = HEAP[$odval];
        var $208 = Math.floor($207);
        var $209 = HEAP[$1];
        var $210 = $209+12;
        var $211 = HEAP[$210];
        var $212 = $208 >> $211;
        var $213 = HEAP[$1];
        var $214 = $213+12;
        HEAP[$214] = $212;;
        __label__ = 21; break;
      case 42: // $215
        var $216 = HEAP[$1];
        var $217 = $216+32;
        HEAP[$217] = 2;;
        __label__ = 21; break;
      case 21: // $218
        __label__ = 22; break;
      case 38: // $219
        var $220 = HEAP[$1];
        var $221 = $220+8;
        var $222 = HEAP[$221];
        var $223 = ($222 + 1)&4294967295;
        HEAP[$221] = $223;;
        var $224 = HEAP[$1];
        _ee_addsub($224);
        var $225 = HEAP[$1];
        var $226 = $225+32;
        var $227 = HEAP[$226];
        var $228 = $227 != 0;
        if ($228) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $229
        __label__ = 10; break;
      case 24: // $230
        var $231 = HEAP[$1];
        var $232 = $231+28;
        var $233 = HEAP[$232];
        if ($233 == 1) {
          __label__ = 43; break;
        }
        else if ($233 == 0) {
          __label__ = 44; break;
        }
        else {
        __label__ = 45; break;
        }
        
      case 43: // $234
        var $235 = HEAP[$oival];
        var $236 = HEAP[$1];
        var $237 = $236+20;
        var $238 = HEAP[$237];
        var $239 = Math.floor($238);
        var $240 = $235 >> $239;
        var $241 = HEAP[$1];
        var $242 = $241+12;
        HEAP[$242] = $240;;
        var $243 = HEAP[$1];
        var $244 = $243+28;
        HEAP[$244] = 0;;
        __label__ = 25; break;
      case 44: // $245
        var $246 = HEAP[$oival];
        var $247 = HEAP[$1];
        var $248 = $247+12;
        var $249 = HEAP[$248];
        var $250 = $246 >> $249;
        var $251 = HEAP[$1];
        var $252 = $251+12;
        HEAP[$252] = $250;;
        __label__ = 25; break;
      case 45: // $253
        var $254 = HEAP[$1];
        var $255 = $254+32;
        HEAP[$255] = 2;;
        __label__ = 25; break;
      case 25: // $256
        __label__ = 22; break;
      case 39: // $257
        var $258 = HEAP[$1];
        var $259 = $258+32;
        HEAP[$259] = 2;;
        __label__ = 22; break;
      case 22: // $260
        __label__ = 18; break;
      case 18: // $261
        var $262 = HEAP[$1];
        _ee_skip_spaces($262);
        __label__ = 0; break;
      case 10: // $263
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_shift.__index__ = Runtime.getFunctionIndex(_ee_shift, "_ee_shift");
  
  
  function _ee_addsub($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $odval = __stackBase__+4;
        var $oival = __stackBase__+12;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_muldiv($2);
        var $3 = HEAP[$1];
        _ee_skip_spaces($3);
        __label__ = 0; break;
      case 0: // $4
        var $5 = HEAP[$1];
        var $6 = $5+8;
        var $7 = HEAP[$6];
        var $8 = HEAP[$1];
        var $9 = $8+4;
        var $10 = HEAP[$9];
        var $11 = unSign($7, 32) < unSign($10, 32);
        if ($11) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 1: // $12
        var $13 = HEAP[$1];
        var $14 = $13+32;
        var $15 = HEAP[$14];
        var $16 = $15 != 0;
        if ($16) { __lastLabel__ = 1; __label__ = 2; break; } else { __lastLabel__ = 1; __label__ = 3; break; }
      case 3: // $17
        var $18 = HEAP[$1];
        var $19 = $18+8;
        var $20 = HEAP[$19];
        var $21 = ($20 + 1)&4294967295;
        var $22 = HEAP[$1];
        var $23 = $22;
        var $24 = HEAP[$23];
        var $25 = $24+$21;
        var $26 = HEAP[$25];
        var $27 = $26;
        var $28 = ___ctype_b_loc();
        var $29 = HEAP[$28];
        var $30 = $29+2*$27;
        var $31 = HEAP[$30];
        var $32 = $31;
        var $33 = $32 & 4;
        var $34 = $33 != 0;
        if ($34) { __lastLabel__ = 3; __label__ = 2; break; } else { __lastLabel__ = 3; __label__ = 4; break; }
      case 4: // $35
        var $36 = HEAP[$1];
        var $37 = $36+8;
        var $38 = HEAP[$37];
        var $39 = HEAP[$1];
        var $40 = $39;
        var $41 = HEAP[$40];
        var $42 = $41+$38;
        var $43 = HEAP[$42];
        var $44 = $43;
        var $45 = $44 == 43;
        if ($45) { __lastLabel__ = 4; __label__ = 5; break; } else { __lastLabel__ = 4; __label__ = 6; break; }
      case 6: // $46
        var $47 = HEAP[$1];
        var $48 = $47+8;
        var $49 = HEAP[$48];
        var $50 = HEAP[$1];
        var $51 = $50;
        var $52 = HEAP[$51];
        var $53 = $52+$49;
        var $54 = HEAP[$53];
        var $55 = $54;
        var $56 = $55 == 45;
        __lastLabel__ = 6; __label__ = 5; break;
      case 5: // $57
        var $58 = __lastLabel__ == 4 ? 1 : ($56);
        __lastLabel__ = 5; __label__ = 2; break;
      case 2: // $59
        var $60 = __lastLabel__ == 3 ? 0 : (__lastLabel__ == 1 ? 0 : (__lastLabel__ == 0 ? 0 : ($58)));
        if ($60) { __label__ = 7; break; } else { __label__ = 8; break; }
      case 7: // $61
        var $62 = HEAP[$1];
        var $63 = $62+20;
        var $64 = HEAP[$63];
        HEAP[$odval] = $64;;
        var $65 = HEAP[$1];
        var $66 = $65+12;
        var $67 = HEAP[$66];
        HEAP[$oival] = $67;;
        var $68 = HEAP[$1];
        var $69 = $68+8;
        var $70 = HEAP[$69];
        var $71 = HEAP[$1];
        var $72 = $71;
        var $73 = HEAP[$72];
        var $74 = $73+$70;
        var $75 = HEAP[$74];
        var $76 = $75;
        if ($76 == 43) {
          __label__ = 24; break;
        }
        else if ($76 == 45) {
          __label__ = 25; break;
        }
        else {
        __label__ = 16; break;
        }
        
      case 24: // $77
        var $78 = HEAP[$1];
        var $79 = $78+28;
        var $80 = HEAP[$79];
        if ($80 == 1) {
          __label__ = 26; break;
        }
        else if ($80 == 0) {
          __label__ = 27; break;
        }
        else {
        __label__ = 28; break;
        }
        
      case 26: // $81
        var $82 = HEAP[$1];
        var $83 = $82+8;
        var $84 = HEAP[$83];
        var $85 = ($84 + 1)&4294967295;
        HEAP[$83] = $85;;
        var $86 = HEAP[$1];
        _ee_muldiv($86);
        var $87 = HEAP[$1];
        var $88 = $87+32;
        var $89 = HEAP[$88];
        var $90 = $89 != 0;
        if ($90) { __label__ = 9; break; } else { __label__ = 10; break; }
      case 9: // $91
        __label__ = 8; break;
      case 10: // $92
        var $93 = HEAP[$1];
        var $94 = $93+28;
        var $95 = HEAP[$94];
        if ($95 == 1) {
          __label__ = 29; break;
        }
        else if ($95 == 0) {
          __label__ = 30; break;
        }
        else {
        __label__ = 31; break;
        }
        
      case 29: // $96
        var $97 = HEAP[$1];
        var $98 = $97+20;
        var $99 = HEAP[$98];
        var $100 = HEAP[$odval];
        var $101 = $99 + $100;
        var $102 = HEAP[$1];
        var $103 = $102+20;
        HEAP[$103] = $101;;
        __label__ = 11; break;
      case 30: // $104
        var $105 = HEAP[$1];
        var $106 = $105+12;
        var $107 = HEAP[$106];
        var $108 = $107;
        var $109 = HEAP[$odval];
        var $110 = $108 + $109;
        var $111 = HEAP[$1];
        var $112 = $111+20;
        HEAP[$112] = $110;;
        var $113 = HEAP[$1];
        var $114 = $113+28;
        HEAP[$114] = 1;;
        __label__ = 11; break;
      case 31: // $115
        var $116 = HEAP[$1];
        var $117 = $116+32;
        HEAP[$117] = 2;;
        __label__ = 11; break;
      case 11: // $118
        __label__ = 12; break;
      case 27: // $119
        var $120 = HEAP[$1];
        var $121 = $120+8;
        var $122 = HEAP[$121];
        var $123 = ($122 + 1)&4294967295;
        HEAP[$121] = $123;;
        var $124 = HEAP[$1];
        _ee_muldiv($124);
        var $125 = HEAP[$1];
        var $126 = $125+32;
        var $127 = HEAP[$126];
        var $128 = $127 != 0;
        if ($128) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $129
        __label__ = 8; break;
      case 14: // $130
        var $131 = HEAP[$1];
        var $132 = $131+28;
        var $133 = HEAP[$132];
        if ($133 == 1) {
          __label__ = 32; break;
        }
        else if ($133 == 0) {
          __label__ = 33; break;
        }
        else {
        __label__ = 34; break;
        }
        
      case 32: // $134
        var $135 = HEAP[$1];
        var $136 = $135+20;
        var $137 = HEAP[$136];
        var $138 = HEAP[$oival];
        var $139 = $138;
        var $140 = $137 + $139;
        var $141 = HEAP[$1];
        var $142 = $141+20;
        HEAP[$142] = $140;;
        var $143 = HEAP[$1];
        var $144 = $143+28;
        HEAP[$144] = 1;;
        __label__ = 15; break;
      case 33: // $145
        var $146 = HEAP[$1];
        var $147 = $146+12;
        var $148 = HEAP[$147];
        var $149 = HEAP[$oival];
        var $150 = $148 + $149;
        var $151 = HEAP[$1];
        var $152 = $151+12;
        HEAP[$152] = $150;;
        __label__ = 15; break;
      case 34: // $153
        var $154 = HEAP[$1];
        var $155 = $154+32;
        HEAP[$155] = 2;;
        __label__ = 15; break;
      case 15: // $156
        __label__ = 12; break;
      case 28: // $157
        var $158 = HEAP[$1];
        var $159 = $158+32;
        HEAP[$159] = 2;;
        __label__ = 12; break;
      case 12: // $160
        __label__ = 16; break;
      case 25: // $161
        var $162 = HEAP[$1];
        var $163 = $162+28;
        var $164 = HEAP[$163];
        if ($164 == 1) {
          __label__ = 35; break;
        }
        else if ($164 == 0) {
          __label__ = 36; break;
        }
        else {
        __label__ = 37; break;
        }
        
      case 35: // $165
        var $166 = HEAP[$1];
        var $167 = $166+8;
        var $168 = HEAP[$167];
        var $169 = ($168 + 1)&4294967295;
        HEAP[$167] = $169;;
        var $170 = HEAP[$1];
        _ee_muldiv($170);
        var $171 = HEAP[$1];
        var $172 = $171+32;
        var $173 = HEAP[$172];
        var $174 = $173 != 0;
        if ($174) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $175
        __label__ = 8; break;
      case 18: // $176
        var $177 = HEAP[$1];
        var $178 = $177+28;
        var $179 = HEAP[$178];
        if ($179 == 1) {
          __label__ = 38; break;
        }
        else if ($179 == 0) {
          __label__ = 39; break;
        }
        else {
        __label__ = 40; break;
        }
        
      case 38: // $180
        var $181 = HEAP[$odval];
        var $182 = HEAP[$1];
        var $183 = $182+20;
        var $184 = HEAP[$183];
        var $185 = $181 - $184;
        var $186 = HEAP[$1];
        var $187 = $186+20;
        HEAP[$187] = $185;;
        __label__ = 19; break;
      case 39: // $188
        var $189 = HEAP[$odval];
        var $190 = HEAP[$1];
        var $191 = $190+12;
        var $192 = HEAP[$191];
        var $193 = $192;
        var $194 = $189 - $193;
        var $195 = HEAP[$1];
        var $196 = $195+20;
        HEAP[$196] = $194;;
        var $197 = HEAP[$1];
        var $198 = $197+28;
        HEAP[$198] = 1;;
        __label__ = 19; break;
      case 40: // $199
        var $200 = HEAP[$1];
        var $201 = $200+32;
        HEAP[$201] = 2;;
        __label__ = 19; break;
      case 19: // $202
        __label__ = 20; break;
      case 36: // $203
        var $204 = HEAP[$1];
        var $205 = $204+8;
        var $206 = HEAP[$205];
        var $207 = ($206 + 1)&4294967295;
        HEAP[$205] = $207;;
        var $208 = HEAP[$1];
        _ee_muldiv($208);
        var $209 = HEAP[$1];
        var $210 = $209+32;
        var $211 = HEAP[$210];
        var $212 = $211 != 0;
        if ($212) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 21: // $213
        __label__ = 8; break;
      case 22: // $214
        var $215 = HEAP[$1];
        var $216 = $215+28;
        var $217 = HEAP[$216];
        if ($217 == 1) {
          __label__ = 41; break;
        }
        else if ($217 == 0) {
          __label__ = 42; break;
        }
        else {
        __label__ = 43; break;
        }
        
      case 41: // $218
        var $219 = HEAP[$oival];
        var $220 = $219;
        var $221 = HEAP[$1];
        var $222 = $221+20;
        var $223 = HEAP[$222];
        var $224 = $220 - $223;
        var $225 = HEAP[$1];
        var $226 = $225+20;
        HEAP[$226] = $224;;
        var $227 = HEAP[$1];
        var $228 = $227+28;
        HEAP[$228] = 1;;
        __label__ = 23; break;
      case 42: // $229
        var $230 = HEAP[$oival];
        var $231 = HEAP[$1];
        var $232 = $231+12;
        var $233 = HEAP[$232];
        var $234 = $230 - $233;
        var $235 = HEAP[$1];
        var $236 = $235+12;
        HEAP[$236] = $234;;
        __label__ = 23; break;
      case 43: // $237
        var $238 = HEAP[$1];
        var $239 = $238+32;
        HEAP[$239] = 2;;
        __label__ = 23; break;
      case 23: // $240
        __label__ = 20; break;
      case 37: // $241
        var $242 = HEAP[$1];
        var $243 = $242+32;
        HEAP[$243] = 2;;
        __label__ = 20; break;
      case 20: // $244
        __label__ = 16; break;
      case 16: // $245
        var $246 = HEAP[$1];
        _ee_skip_spaces($246);
        __label__ = 0; break;
      case 8: // $247
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_addsub.__index__ = Runtime.getFunctionIndex(_ee_addsub, "_ee_addsub");
  
  
  function _ee_muldiv($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $odval = __stackBase__+4;
        var $oival = __stackBase__+12;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_unary($2);
        var $3 = HEAP[$1];
        var $4 = $3+32;
        var $5 = HEAP[$4];
        var $6 = $5 != 0;
        if ($6) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $7
        __label__ = 2; break;
      case 1: // $8
        var $9 = HEAP[$1];
        _ee_skip_spaces($9);
        __label__ = 3; break;
      case 3: // $10
        var $11 = HEAP[$1];
        var $12 = $11+8;
        var $13 = HEAP[$12];
        var $14 = HEAP[$1];
        var $15 = $14+4;
        var $16 = HEAP[$15];
        var $17 = unSign($13, 32) < unSign($16, 32);
        if ($17) { __lastLabel__ = 3; __label__ = 4; break; } else { __lastLabel__ = 3; __label__ = 5; break; }
      case 4: // $18
        var $19 = HEAP[$1];
        var $20 = $19+32;
        var $21 = HEAP[$20];
        var $22 = $21 != 0;
        if ($22) { __lastLabel__ = 4; __label__ = 5; break; } else { __lastLabel__ = 4; __label__ = 6; break; }
      case 6: // $23
        var $24 = HEAP[$1];
        var $25 = $24+8;
        var $26 = HEAP[$25];
        var $27 = ($26 + 1)&4294967295;
        var $28 = HEAP[$1];
        var $29 = $28;
        var $30 = HEAP[$29];
        var $31 = $30+$27;
        var $32 = HEAP[$31];
        var $33 = $32;
        var $34 = ___ctype_b_loc();
        var $35 = HEAP[$34];
        var $36 = $35+2*$33;
        var $37 = HEAP[$36];
        var $38 = $37;
        var $39 = $38 & 4;
        var $40 = $39 != 0;
        if ($40) { __lastLabel__ = 6; __label__ = 5; break; } else { __lastLabel__ = 6; __label__ = 7; break; }
      case 7: // $41
        var $42 = HEAP[$1];
        var $43 = $42+8;
        var $44 = HEAP[$43];
        var $45 = HEAP[$1];
        var $46 = $45;
        var $47 = HEAP[$46];
        var $48 = $47+$44;
        var $49 = HEAP[$48];
        var $50 = $49;
        var $51 = $50 == 42;
        if ($51) { __lastLabel__ = 7; __label__ = 8; break; } else { __lastLabel__ = 7; __label__ = 9; break; }
      case 9: // $52
        var $53 = HEAP[$1];
        var $54 = $53+8;
        var $55 = HEAP[$54];
        var $56 = HEAP[$1];
        var $57 = $56;
        var $58 = HEAP[$57];
        var $59 = $58+$55;
        var $60 = HEAP[$59];
        var $61 = $60;
        var $62 = $61 == 47;
        if ($62) { __lastLabel__ = 9; __label__ = 8; break; } else { __lastLabel__ = 9; __label__ = 10; break; }
      case 10: // $63
        var $64 = HEAP[$1];
        var $65 = $64+8;
        var $66 = HEAP[$65];
        var $67 = HEAP[$1];
        var $68 = $67;
        var $69 = HEAP[$68];
        var $70 = $69+$66;
        var $71 = HEAP[$70];
        var $72 = $71;
        var $73 = $72 == 92;
        if ($73) { __lastLabel__ = 10; __label__ = 8; break; } else { __lastLabel__ = 10; __label__ = 11; break; }
      case 11: // $74
        var $75 = HEAP[$1];
        var $76 = $75+8;
        var $77 = HEAP[$76];
        var $78 = HEAP[$1];
        var $79 = $78;
        var $80 = HEAP[$79];
        var $81 = $80+$77;
        var $82 = HEAP[$81];
        var $83 = $82;
        var $84 = $83 == 37;
        __lastLabel__ = 11; __label__ = 8; break;
      case 8: // $85
        var $86 = __lastLabel__ == 10 ? 1 : (__lastLabel__ == 9 ? 1 : (__lastLabel__ == 7 ? 1 : ($84)));
        __lastLabel__ = 8; __label__ = 5; break;
      case 5: // $87
        var $88 = __lastLabel__ == 6 ? 0 : (__lastLabel__ == 4 ? 0 : (__lastLabel__ == 3 ? 0 : ($86)));
        if ($88) { __label__ = 12; break; } else { __label__ = 2; break; }
      case 12: // $89
        var $90 = HEAP[$1];
        var $91 = $90+20;
        var $92 = HEAP[$91];
        HEAP[$odval] = $92;;
        var $93 = HEAP[$1];
        var $94 = $93+12;
        var $95 = HEAP[$94];
        HEAP[$oival] = $95;;
        var $96 = HEAP[$1];
        var $97 = $96+8;
        var $98 = HEAP[$97];
        var $99 = HEAP[$1];
        var $100 = $99;
        var $101 = HEAP[$100];
        var $102 = $101+$98;
        var $103 = HEAP[$102];
        var $104 = $103;
        if ($104 == 42) {
          __label__ = 78; break;
        }
        else if ($104 == 37) {
          __label__ = 79; break;
        }
        else if ($104 == 47) {
          __label__ = 80; break;
        }
        else if ($104 == 92) {
          __label__ = 81; break;
        }
        else {
        __label__ = 20; break;
        }
        
      case 78: // $105
        var $106 = HEAP[$1];
        var $107 = $106+28;
        var $108 = HEAP[$107];
        if ($108 == 1) {
          __label__ = 82; break;
        }
        else if ($108 == 0) {
          __label__ = 83; break;
        }
        else {
        __label__ = 84; break;
        }
        
      case 82: // $109
        var $110 = HEAP[$1];
        var $111 = $110+8;
        var $112 = HEAP[$111];
        var $113 = ($112 + 1)&4294967295;
        HEAP[$111] = $113;;
        var $114 = HEAP[$1];
        _ee_unary($114);
        var $115 = HEAP[$1];
        var $116 = $115+32;
        var $117 = HEAP[$116];
        var $118 = $117 != 0;
        if ($118) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $119
        __label__ = 2; break;
      case 14: // $120
        var $121 = HEAP[$1];
        var $122 = $121+28;
        var $123 = HEAP[$122];
        if ($123 == 1) {
          __label__ = 85; break;
        }
        else if ($123 == 0) {
          __label__ = 86; break;
        }
        else {
        __label__ = 87; break;
        }
        
      case 85: // $124
        var $125 = HEAP[$1];
        var $126 = $125+20;
        var $127 = HEAP[$126];
        var $128 = HEAP[$odval];
        var $129 = $127 * $128;
        var $130 = HEAP[$1];
        var $131 = $130+20;
        HEAP[$131] = $129;;
        __label__ = 15; break;
      case 86: // $132
        var $133 = HEAP[$1];
        var $134 = $133+12;
        var $135 = HEAP[$134];
        var $136 = $135;
        var $137 = HEAP[$odval];
        var $138 = $136 * $137;
        var $139 = HEAP[$1];
        var $140 = $139+20;
        HEAP[$140] = $138;;
        var $141 = HEAP[$1];
        var $142 = $141+28;
        HEAP[$142] = 1;;
        __label__ = 15; break;
      case 87: // $143
        var $144 = HEAP[$1];
        var $145 = $144+32;
        HEAP[$145] = 2;;
        __label__ = 15; break;
      case 15: // $146
        __label__ = 16; break;
      case 83: // $147
        var $148 = HEAP[$1];
        var $149 = $148+8;
        var $150 = HEAP[$149];
        var $151 = ($150 + 1)&4294967295;
        HEAP[$149] = $151;;
        var $152 = HEAP[$1];
        _ee_unary($152);
        var $153 = HEAP[$1];
        var $154 = $153+32;
        var $155 = HEAP[$154];
        var $156 = $155 != 0;
        if ($156) { __label__ = 17; break; } else { __label__ = 18; break; }
      case 17: // $157
        __label__ = 2; break;
      case 18: // $158
        var $159 = HEAP[$1];
        var $160 = $159+28;
        var $161 = HEAP[$160];
        if ($161 == 1) {
          __label__ = 88; break;
        }
        else if ($161 == 0) {
          __label__ = 89; break;
        }
        else {
        __label__ = 90; break;
        }
        
      case 88: // $162
        var $163 = HEAP[$1];
        var $164 = $163+20;
        var $165 = HEAP[$164];
        var $166 = HEAP[$oival];
        var $167 = $166;
        var $168 = $165 * $167;
        var $169 = HEAP[$1];
        var $170 = $169+20;
        HEAP[$170] = $168;;
        var $171 = HEAP[$1];
        var $172 = $171+28;
        HEAP[$172] = 1;;
        __label__ = 19; break;
      case 89: // $173
        var $174 = HEAP[$1];
        var $175 = $174+12;
        var $176 = HEAP[$175];
        var $177 = HEAP[$oival];
        var $178 = $176 * $177;
        var $179 = HEAP[$1];
        var $180 = $179+12;
        HEAP[$180] = $178;;
        __label__ = 19; break;
      case 90: // $181
        var $182 = HEAP[$1];
        var $183 = $182+32;
        HEAP[$183] = 2;;
        __label__ = 19; break;
      case 19: // $184
        __label__ = 16; break;
      case 84: // $185
        var $186 = HEAP[$1];
        var $187 = $186+32;
        HEAP[$187] = 2;;
        __label__ = 16; break;
      case 16: // $188
        __label__ = 20; break;
      case 79: // $189
        var $190 = HEAP[$1];
        var $191 = $190+28;
        var $192 = HEAP[$191];
        if ($192 == 1) {
          __label__ = 91; break;
        }
        else if ($192 == 0) {
          __label__ = 92; break;
        }
        else {
        __label__ = 30; break;
        }
        
      case 91: // $193
        var $194 = HEAP[$1];
        var $195 = $194+8;
        var $196 = HEAP[$195];
        var $197 = ($196 + 1)&4294967295;
        HEAP[$195] = $197;;
        var $198 = HEAP[$1];
        _ee_unary($198);
        var $199 = HEAP[$1];
        var $200 = $199+32;
        var $201 = HEAP[$200];
        var $202 = $201 != 0;
        if ($202) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 21: // $203
        __label__ = 2; break;
      case 22: // $204
        var $205 = HEAP[$1];
        var $206 = $205+28;
        var $207 = HEAP[$206];
        if ($207 == 1) {
          __label__ = 93; break;
        }
        else if ($207 == 0) {
          __label__ = 94; break;
        }
        else {
        __label__ = 95; break;
        }
        
      case 93: // $208
        var $209 = HEAP[$1];
        var $210 = $209+20;
        var $211 = HEAP[$210];
        var $212 = $211 == 0;
        if ($212) { __label__ = 23; break; } else { __label__ = 24; break; }
      case 23: // $213
        var $214 = HEAP[$1];
        var $215 = $214+32;
        HEAP[$215] = 3;;
        __label__ = 25; break;
      case 24: // $216
        var $217 = HEAP[$odval];
        var $218 = HEAP[$1];
        var $219 = $218+20;
        var $220 = HEAP[$219];
        var $221 = _fmod($217, $220);
        var $222 = HEAP[$1];
        var $223 = $222+20;
        HEAP[$223] = $221;;
        __label__ = 25; break;
      case 25: // $224
        __label__ = 26; break;
      case 94: // $225
        var $226 = HEAP[$1];
        var $227 = $226+12;
        var $228 = HEAP[$227];
        var $229 = $228 == 0;
        if ($229) { __label__ = 27; break; } else { __label__ = 28; break; }
      case 27: // $230
        var $231 = HEAP[$1];
        var $232 = $231+32;
        HEAP[$232] = 3;;
        __label__ = 29; break;
      case 28: // $233
        var $234 = HEAP[$odval];
        var $235 = HEAP[$1];
        var $236 = $235+12;
        var $237 = HEAP[$236];
        var $238 = $237;
        var $239 = _fmod($234, $238);
        var $240 = HEAP[$1];
        var $241 = $240+20;
        HEAP[$241] = $239;;
        __label__ = 29; break;
      case 29: // $242
        var $243 = HEAP[$1];
        var $244 = $243+28;
        HEAP[$244] = 1;;
        __label__ = 26; break;
      case 95: // $245
        var $246 = HEAP[$1];
        var $247 = $246+32;
        HEAP[$247] = 2;;
        __label__ = 26; break;
      case 26: // $248
        __label__ = 30; break;
      case 92: // $249
        var $250 = HEAP[$1];
        var $251 = $250+8;
        var $252 = HEAP[$251];
        var $253 = ($252 + 1)&4294967295;
        HEAP[$251] = $253;;
        var $254 = HEAP[$1];
        _ee_unary($254);
        var $255 = HEAP[$1];
        var $256 = $255+32;
        var $257 = HEAP[$256];
        var $258 = $257 != 0;
        if ($258) { __label__ = 31; break; } else { __label__ = 32; break; }
      case 31: // $259
        __label__ = 2; break;
      case 32: // $260
        var $261 = HEAP[$1];
        var $262 = $261+28;
        var $263 = HEAP[$262];
        if ($263 == 1) {
          __label__ = 96; break;
        }
        else if ($263 == 0) {
          __label__ = 97; break;
        }
        else {
        __label__ = 98; break;
        }
        
      case 96: // $264
        var $265 = HEAP[$1];
        var $266 = $265+20;
        var $267 = HEAP[$266];
        var $268 = $267 == 0;
        if ($268) { __label__ = 33; break; } else { __label__ = 34; break; }
      case 33: // $269
        var $270 = HEAP[$1];
        var $271 = $270+32;
        HEAP[$271] = 3;;
        __label__ = 35; break;
      case 34: // $272
        var $273 = HEAP[$oival];
        var $274 = $273;
        var $275 = HEAP[$1];
        var $276 = $275+20;
        var $277 = HEAP[$276];
        var $278 = _fmod($274, $277);
        var $279 = HEAP[$1];
        var $280 = $279+20;
        HEAP[$280] = $278;;
        __label__ = 35; break;
      case 35: // $281
        __label__ = 36; break;
      case 97: // $282
        var $283 = HEAP[$1];
        var $284 = $283+12;
        var $285 = HEAP[$284];
        var $286 = $285 == 0;
        if ($286) { __label__ = 37; break; } else { __label__ = 38; break; }
      case 37: // $287
        var $288 = HEAP[$1];
        var $289 = $288+32;
        HEAP[$289] = 3;;
        __label__ = 39; break;
      case 38: // $290
        var $291 = HEAP[$oival];
        var $292 = HEAP[$1];
        var $293 = $292+12;
        var $294 = HEAP[$293];
        var $295 = $291 % $294;
        var $296 = HEAP[$1];
        var $297 = $296+12;
        HEAP[$297] = $295;;
        __label__ = 39; break;
      case 39: // $298
        __label__ = 36; break;
      case 98: // $299
        var $300 = HEAP[$1];
        var $301 = $300+32;
        HEAP[$301] = 2;;
        __label__ = 36; break;
      case 36: // $302
        __label__ = 30; break;
      case 30: // $303
        __label__ = 20; break;
      case 80: // $304
        var $305 = HEAP[$1];
        var $306 = $305+28;
        var $307 = HEAP[$306];
        if ($307 == 1) {
          __label__ = 99; break;
        }
        else if ($307 == 0) {
          __label__ = 100; break;
        }
        else {
        __label__ = 49; break;
        }
        
      case 99: // $308
        var $309 = HEAP[$1];
        var $310 = $309+8;
        var $311 = HEAP[$310];
        var $312 = ($311 + 1)&4294967295;
        HEAP[$310] = $312;;
        var $313 = HEAP[$1];
        _ee_unary($313);
        var $314 = HEAP[$1];
        var $315 = $314+32;
        var $316 = HEAP[$315];
        var $317 = $316 != 0;
        if ($317) { __label__ = 40; break; } else { __label__ = 41; break; }
      case 40: // $318
        __label__ = 2; break;
      case 41: // $319
        var $320 = HEAP[$1];
        var $321 = $320+28;
        var $322 = HEAP[$321];
        if ($322 == 1) {
          __label__ = 101; break;
        }
        else if ($322 == 0) {
          __label__ = 102; break;
        }
        else {
        __label__ = 103; break;
        }
        
      case 101: // $323
        var $324 = HEAP[$1];
        var $325 = $324+20;
        var $326 = HEAP[$325];
        var $327 = $326 == 0;
        if ($327) { __label__ = 42; break; } else { __label__ = 43; break; }
      case 42: // $328
        var $329 = HEAP[$1];
        var $330 = $329+32;
        HEAP[$330] = 3;;
        __label__ = 44; break;
      case 43: // $331
        var $332 = HEAP[$odval];
        var $333 = HEAP[$1];
        var $334 = $333+20;
        var $335 = HEAP[$334];
        var $336 = $332 / $335;
        var $337 = HEAP[$1];
        var $338 = $337+20;
        HEAP[$338] = $336;;
        __label__ = 44; break;
      case 44: // $339
        __label__ = 45; break;
      case 102: // $340
        var $341 = HEAP[$1];
        var $342 = $341+12;
        var $343 = HEAP[$342];
        var $344 = $343 == 0;
        if ($344) { __label__ = 46; break; } else { __label__ = 47; break; }
      case 46: // $345
        var $346 = HEAP[$1];
        var $347 = $346+32;
        HEAP[$347] = 3;;
        __label__ = 48; break;
      case 47: // $348
        var $349 = HEAP[$odval];
        var $350 = HEAP[$1];
        var $351 = $350+12;
        var $352 = HEAP[$351];
        var $353 = $352;
        var $354 = $349 / $353;
        var $355 = HEAP[$1];
        var $356 = $355+20;
        HEAP[$356] = $354;;
        __label__ = 48; break;
      case 48: // $357
        var $358 = HEAP[$1];
        var $359 = $358+28;
        HEAP[$359] = 1;;
        __label__ = 45; break;
      case 103: // $360
        var $361 = HEAP[$1];
        var $362 = $361+32;
        HEAP[$362] = 2;;
        __label__ = 45; break;
      case 45: // $363
        __label__ = 49; break;
      case 100: // $364
        var $365 = HEAP[$1];
        var $366 = $365+8;
        var $367 = HEAP[$366];
        var $368 = ($367 + 1)&4294967295;
        HEAP[$366] = $368;;
        var $369 = HEAP[$1];
        _ee_unary($369);
        var $370 = HEAP[$1];
        var $371 = $370+32;
        var $372 = HEAP[$371];
        var $373 = $372 != 0;
        if ($373) { __label__ = 50; break; } else { __label__ = 51; break; }
      case 50: // $374
        __label__ = 2; break;
      case 51: // $375
        var $376 = HEAP[$1];
        var $377 = $376+28;
        var $378 = HEAP[$377];
        if ($378 == 1) {
          __label__ = 104; break;
        }
        else if ($378 == 0) {
          __label__ = 105; break;
        }
        else {
        __label__ = 106; break;
        }
        
      case 104: // $379
        var $380 = HEAP[$1];
        var $381 = $380+20;
        var $382 = HEAP[$381];
        var $383 = $382 == 0;
        if ($383) { __label__ = 52; break; } else { __label__ = 53; break; }
      case 52: // $384
        var $385 = HEAP[$1];
        var $386 = $385+32;
        HEAP[$386] = 3;;
        __label__ = 54; break;
      case 53: // $387
        var $388 = HEAP[$oival];
        var $389 = $388;
        var $390 = HEAP[$1];
        var $391 = $390+20;
        var $392 = HEAP[$391];
        var $393 = $389 / $392;
        var $394 = HEAP[$1];
        var $395 = $394+20;
        HEAP[$395] = $393;;
        __label__ = 54; break;
      case 54: // $396
        __label__ = 55; break;
      case 105: // $397
        var $398 = HEAP[$1];
        var $399 = $398+12;
        var $400 = HEAP[$399];
        var $401 = $400 == 0;
        if ($401) { __label__ = 56; break; } else { __label__ = 57; break; }
      case 56: // $402
        var $403 = HEAP[$1];
        var $404 = $403+32;
        HEAP[$404] = 3;;
        __label__ = 58; break;
      case 57: // $405
        var $406 = HEAP[$oival];
        var $407 = $406;
        var $408 = HEAP[$1];
        var $409 = $408+12;
        var $410 = HEAP[$409];
        var $411 = $410;
        var $412 = $407 / $411;
        var $413 = HEAP[$1];
        var $414 = $413+20;
        HEAP[$414] = $412;;
        __label__ = 58; break;
      case 58: // $415
        var $416 = HEAP[$1];
        var $417 = $416+28;
        HEAP[$417] = 1;;
        __label__ = 55; break;
      case 106: // $418
        var $419 = HEAP[$1];
        var $420 = $419+32;
        HEAP[$420] = 2;;
        __label__ = 55; break;
      case 55: // $421
        __label__ = 49; break;
      case 49: // $422
        __label__ = 20; break;
      case 81: // $423
        var $424 = HEAP[$1];
        var $425 = $424+28;
        var $426 = HEAP[$425];
        if ($426 == 1) {
          __label__ = 107; break;
        }
        else if ($426 == 0) {
          __label__ = 108; break;
        }
        else {
        __label__ = 109; break;
        }
        
      case 107: // $427
        var $428 = HEAP[$1];
        var $429 = $428+8;
        var $430 = HEAP[$429];
        var $431 = ($430 + 1)&4294967295;
        HEAP[$429] = $431;;
        var $432 = HEAP[$1];
        _ee_unary($432);
        var $433 = HEAP[$1];
        var $434 = $433+32;
        var $435 = HEAP[$434];
        var $436 = $435 != 0;
        if ($436) { __label__ = 59; break; } else { __label__ = 60; break; }
      case 59: // $437
        __label__ = 2; break;
      case 60: // $438
        var $439 = HEAP[$1];
        var $440 = $439+28;
        var $441 = HEAP[$440];
        if ($441 == 1) {
          __label__ = 110; break;
        }
        else if ($441 == 0) {
          __label__ = 111; break;
        }
        else {
        __label__ = 112; break;
        }
        
      case 110: // $442
        var $443 = HEAP[$1];
        var $444 = $443+20;
        var $445 = HEAP[$444];
        var $446 = $445 == 0;
        if ($446) { __label__ = 61; break; } else { __label__ = 62; break; }
      case 61: // $447
        var $448 = HEAP[$1];
        var $449 = $448+32;
        HEAP[$449] = 3;;
        __label__ = 63; break;
      case 62: // $450
        var $451 = HEAP[$odval];
        var $452 = HEAP[$1];
        var $453 = $452+20;
        var $454 = HEAP[$453];
        var $455 = $451 / $454;
        var $456 = Math.floor($455);
        var $457 = HEAP[$1];
        var $458 = $457+12;
        HEAP[$458] = $456;;
        __label__ = 63; break;
      case 63: // $459
        var $460 = HEAP[$1];
        var $461 = $460+28;
        HEAP[$461] = 0;;
        __label__ = 64; break;
      case 111: // $462
        var $463 = HEAP[$1];
        var $464 = $463+12;
        var $465 = HEAP[$464];
        var $466 = $465 == 0;
        if ($466) { __label__ = 65; break; } else { __label__ = 66; break; }
      case 65: // $467
        var $468 = HEAP[$1];
        var $469 = $468+32;
        HEAP[$469] = 3;;
        __label__ = 67; break;
      case 66: // $470
        var $471 = HEAP[$odval];
        var $472 = HEAP[$1];
        var $473 = $472+12;
        var $474 = HEAP[$473];
        var $475 = $474;
        var $476 = $471 / $475;
        var $477 = Math.floor($476);
        var $478 = HEAP[$1];
        var $479 = $478+12;
        HEAP[$479] = $477;;
        __label__ = 67; break;
      case 67: // $480
        __label__ = 64; break;
      case 112: // $481
        var $482 = HEAP[$1];
        var $483 = $482+32;
        HEAP[$483] = 2;;
        __label__ = 64; break;
      case 64: // $484
        __label__ = 68; break;
      case 108: // $485
        var $486 = HEAP[$1];
        var $487 = $486+8;
        var $488 = HEAP[$487];
        var $489 = ($488 + 1)&4294967295;
        HEAP[$487] = $489;;
        var $490 = HEAP[$1];
        _ee_unary($490);
        var $491 = HEAP[$1];
        var $492 = $491+32;
        var $493 = HEAP[$492];
        var $494 = $493 != 0;
        if ($494) { __label__ = 69; break; } else { __label__ = 70; break; }
      case 69: // $495
        __label__ = 2; break;
      case 70: // $496
        var $497 = HEAP[$1];
        var $498 = $497+28;
        var $499 = HEAP[$498];
        if ($499 == 1) {
          __label__ = 113; break;
        }
        else if ($499 == 0) {
          __label__ = 114; break;
        }
        else {
        __label__ = 115; break;
        }
        
      case 113: // $500
        var $501 = HEAP[$1];
        var $502 = $501+20;
        var $503 = HEAP[$502];
        var $504 = $503 == 0;
        if ($504) { __label__ = 71; break; } else { __label__ = 72; break; }
      case 71: // $505
        var $506 = HEAP[$1];
        var $507 = $506+32;
        HEAP[$507] = 3;;
        __label__ = 73; break;
      case 72: // $508
        var $509 = HEAP[$oival];
        var $510 = $509;
        var $511 = HEAP[$1];
        var $512 = $511+20;
        var $513 = HEAP[$512];
        var $514 = $510 / $513;
        var $515 = Math.floor($514);
        var $516 = HEAP[$1];
        var $517 = $516+12;
        HEAP[$517] = $515;;
        __label__ = 73; break;
      case 73: // $518
        var $519 = HEAP[$1];
        var $520 = $519+28;
        HEAP[$520] = 0;;
        __label__ = 74; break;
      case 114: // $521
        var $522 = HEAP[$1];
        var $523 = $522+12;
        var $524 = HEAP[$523];
        var $525 = $524 == 0;
        if ($525) { __label__ = 75; break; } else { __label__ = 76; break; }
      case 75: // $526
        var $527 = HEAP[$1];
        var $528 = $527+32;
        HEAP[$528] = 3;;
        __label__ = 77; break;
      case 76: // $529
        var $530 = HEAP[$oival];
        var $531 = HEAP[$1];
        var $532 = $531+12;
        var $533 = HEAP[$532];
        var $534 = Math.floor($530 / $533);
        var $535 = HEAP[$1];
        var $536 = $535+12;
        HEAP[$536] = $534;;
        __label__ = 77; break;
      case 77: // $537
        __label__ = 74; break;
      case 115: // $538
        var $539 = HEAP[$1];
        var $540 = $539+32;
        HEAP[$540] = 2;;
        __label__ = 74; break;
      case 74: // $541
        __label__ = 68; break;
      case 109: // $542
        var $543 = HEAP[$1];
        var $544 = $543+32;
        HEAP[$544] = 2;;
        __label__ = 68; break;
      case 68: // $545
        __label__ = 20; break;
      case 20: // $546
        var $547 = HEAP[$1];
        _ee_skip_spaces($547);
        __label__ = 3; break;
      case 2: // $548
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_muldiv.__index__ = Runtime.getFunctionIndex(_ee_muldiv, "_ee_muldiv");
  
  
  function _ee_unary($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 5; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $op = __stackBase__+4;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_skip_spaces($2);
        var $3 = HEAP[$1];
        var $4 = $3+8;
        var $5 = HEAP[$4];
        var $6 = HEAP[$1];
        var $7 = $6+4;
        var $8 = HEAP[$7];
        var $9 = unSign($5, 32) < unSign($8, 32);
        if ($9) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $10
        var $11 = HEAP[$1];
        var $12 = $11+32;
        var $13 = HEAP[$12];
        var $14 = $13 != 0;
        if ($14) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 2: // $15
        var $16 = HEAP[$1];
        var $17 = $16+8;
        var $18 = HEAP[$17];
        var $19 = ($18 + 1)&4294967295;
        var $20 = HEAP[$1];
        var $21 = $20;
        var $22 = HEAP[$21];
        var $23 = $22+$19;
        var $24 = HEAP[$23];
        var $25 = $24;
        var $26 = ___ctype_b_loc();
        var $27 = HEAP[$26];
        var $28 = $27+2*$25;
        var $29 = HEAP[$28];
        var $30 = $29;
        var $31 = $30 & 4;
        var $32 = $31 != 0;
        if ($32) { __label__ = 1; break; } else { __label__ = 3; break; }
      case 3: // $33
        var $34 = HEAP[$1];
        var $35 = $34+8;
        var $36 = HEAP[$35];
        var $37 = HEAP[$1];
        var $38 = $37;
        var $39 = HEAP[$38];
        var $40 = $39+$36;
        var $41 = HEAP[$40];
        var $42 = $41;
        var $43 = $42 == 45;
        if ($43) { __label__ = 4; break; } else { __label__ = 5; break; }
      case 5: // $44
        var $45 = HEAP[$1];
        var $46 = $45+8;
        var $47 = HEAP[$46];
        var $48 = HEAP[$1];
        var $49 = $48;
        var $50 = HEAP[$49];
        var $51 = $50+$47;
        var $52 = HEAP[$51];
        var $53 = $52;
        var $54 = $53 == 43;
        if ($54) { __label__ = 4; break; } else { __label__ = 6; break; }
      case 6: // $55
        var $56 = HEAP[$1];
        var $57 = $56+8;
        var $58 = HEAP[$57];
        var $59 = HEAP[$1];
        var $60 = $59;
        var $61 = HEAP[$60];
        var $62 = $61+$58;
        var $63 = HEAP[$62];
        var $64 = $63;
        var $65 = $64 == 126;
        if ($65) { __label__ = 4; break; } else { __label__ = 7; break; }
      case 7: // $66
        var $67 = HEAP[$1];
        var $68 = $67+8;
        var $69 = HEAP[$68];
        var $70 = HEAP[$1];
        var $71 = $70;
        var $72 = HEAP[$71];
        var $73 = $72+$69;
        var $74 = HEAP[$73];
        var $75 = $74;
        var $76 = $75 == 33;
        if ($76) { __label__ = 4; break; } else { __label__ = 1; break; }
      case 4: // $77
        var $78 = HEAP[$1];
        var $79 = $78+8;
        var $80 = HEAP[$79];
        var $81 = ($80 + 1)&4294967295;
        HEAP[$79] = $81;;
        var $82 = HEAP[$1];
        var $83 = $82;
        var $84 = HEAP[$83];
        var $85 = $84+$80;
        var $86 = HEAP[$85];
        HEAP[$op] = $86;;
        var $87 = HEAP[$1];
        _ee_unary($87);
        var $88 = HEAP[$1];
        var $89 = $88+32;
        var $90 = HEAP[$89];
        var $91 = $90 != 0;
        if ($91) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $92
        __label__ = 10; break;
      case 9: // $93
        var $94 = HEAP[$op];
        var $95 = $94;
        if ($95 == 45) {
          __label__ = 15; break;
        }
        else if ($95 == 43) {
          __label__ = 16; break;
        }
        else if ($95 == 126) {
          __label__ = 17; break;
        }
        else if ($95 == 33) {
          __label__ = 18; break;
        }
        else {
        __label__ = 12; break;
        }
        
      case 15: // $96
        var $97 = HEAP[$1];
        var $98 = $97+28;
        var $99 = HEAP[$98];
        if ($99 == 1) {
          __label__ = 19; break;
        }
        else if ($99 == 0) {
          __label__ = 20; break;
        }
        else {
        __label__ = 21; break;
        }
        
      case 19: // $100
        var $101 = HEAP[$1];
        var $102 = $101+20;
        var $103 = HEAP[$102];
        var $104 = 0 - $103;
        var $105 = HEAP[$1];
        var $106 = $105+20;
        HEAP[$106] = $104;;
        __label__ = 11; break;
      case 20: // $107
        var $108 = HEAP[$1];
        var $109 = $108+12;
        var $110 = HEAP[$109];
        var $111 = 0 - $110;
        var $112 = HEAP[$1];
        var $113 = $112+12;
        HEAP[$113] = $111;;
        __label__ = 11; break;
      case 21: // $114
        var $115 = HEAP[$1];
        var $116 = $115+32;
        HEAP[$116] = 2;;
        __label__ = 11; break;
      case 11: // $117
        __label__ = 12; break;
      case 16: // $118
        __label__ = 12; break;
      case 17: // $119
        var $120 = HEAP[$1];
        var $121 = $120+28;
        var $122 = HEAP[$121];
        if ($122 == 1) {
          __label__ = 22; break;
        }
        else if ($122 == 0) {
          __label__ = 23; break;
        }
        else {
        __label__ = 24; break;
        }
        
      case 22: // $123
        var $124 = HEAP[$1];
        var $125 = $124+20;
        var $126 = HEAP[$125];
        var $127 = Math.floor($126);
        var $128 = $127 ^ -1;
        var $129 = HEAP[$1];
        var $130 = $129+12;
        HEAP[$130] = $128;;
        var $131 = HEAP[$1];
        var $132 = $131+28;
        HEAP[$132] = 0;;
        __label__ = 13; break;
      case 23: // $133
        var $134 = HEAP[$1];
        var $135 = $134+12;
        var $136 = HEAP[$135];
        var $137 = $136 ^ -1;
        var $138 = HEAP[$1];
        var $139 = $138+12;
        HEAP[$139] = $137;;
        __label__ = 13; break;
      case 24: // $140
        var $141 = HEAP[$1];
        var $142 = $141+32;
        HEAP[$142] = 2;;
        __label__ = 13; break;
      case 13: // $143
        __label__ = 12; break;
      case 18: // $144
        var $145 = HEAP[$1];
        var $146 = $145+28;
        var $147 = HEAP[$146];
        if ($147 == 1) {
          __label__ = 25; break;
        }
        else if ($147 == 0) {
          __label__ = 26; break;
        }
        else {
        __label__ = 27; break;
        }
        
      case 25: // $148
        var $149 = HEAP[$1];
        var $150 = $149+20;
        var $151 = HEAP[$150];
        var $152 = $151 != 0;
        var $153 = $152 ^ 1;
        var $154 = $153;
        var $155 = $154;
        var $156 = HEAP[$1];
        var $157 = $156+20;
        HEAP[$157] = $155;;
        __label__ = 14; break;
      case 26: // $158
        var $159 = HEAP[$1];
        var $160 = $159+12;
        var $161 = HEAP[$160];
        var $162 = $161 != 0;
        var $163 = $162 ^ 1;
        var $164 = $163;
        var $165 = $164;
        var $166 = HEAP[$1];
        var $167 = $166+12;
        HEAP[$167] = $165;;
        __label__ = 14; break;
      case 27: // $168
        var $169 = HEAP[$1];
        var $170 = $169+32;
        HEAP[$170] = 2;;
        __label__ = 14; break;
      case 14: // $171
        __label__ = 12; break;
      case 12: // $172
        __label__ = 10; break;
      case 1: // $173
        var $174 = HEAP[$1];
        _ee_paren($174);
        __label__ = 10; break;
      case 10: // $175
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_unary.__index__ = Runtime.getFunctionIndex(_ee_unary, "_ee_unary");
  
  
  function _ee_paren($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        _ee_skip_spaces($2);
        var $3 = HEAP[$1];
        var $4 = $3+8;
        var $5 = HEAP[$4];
        var $6 = HEAP[$1];
        var $7 = $6;
        var $8 = HEAP[$7];
        var $9 = $8+$5;
        var $10 = HEAP[$9];
        var $11 = $10;
        var $12 = $11 == 40;
        if ($12) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $13
        var $14 = HEAP[$1];
        var $15 = $14+8;
        var $16 = HEAP[$15];
        var $17 = ($16 + 1)&4294967295;
        HEAP[$15] = $17;;
        var $18 = HEAP[$1];
        _ee_expr($18);
        var $19 = HEAP[$1];
        _ee_skip_spaces($19);
        var $20 = HEAP[$1];
        var $21 = $20+8;
        var $22 = HEAP[$21];
        var $23 = HEAP[$1];
        var $24 = $23;
        var $25 = HEAP[$24];
        var $26 = $25+$22;
        var $27 = HEAP[$26];
        var $28 = $27;
        var $29 = $28 == 41;
        if ($29) { __label__ = 2; break; } else { __label__ = 3; break; }
      case 2: // $30
        var $31 = HEAP[$1];
        var $32 = $31+8;
        var $33 = HEAP[$32];
        var $34 = ($33 + 1)&4294967295;
        HEAP[$32] = $34;;
        __label__ = 4; break;
      case 3: // $35
        var $36 = HEAP[$1];
        var $37 = $36+32;
        HEAP[$37] = 1;;
        __label__ = 4; break;
      case 4: // $38
        __label__ = 5; break;
      case 1: // $39
        var $40 = HEAP[$1];
        _ee_element($40);
        __label__ = 5; break;
      case 5: // $41
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_paren.__index__ = Runtime.getFunctionIndex(_ee_paren, "_ee_paren");
  
  
  function _ee_element($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        HEAP[$1] = $ee;;
        var $2 = HEAP[$1];
        var $3 = $2+8;
        var $4 = HEAP[$3];
        var $5 = HEAP[$1];
        var $6 = $5;
        var $7 = HEAP[$6];
        var $8 = $7+$4;
        var $9 = HEAP[$8];
        var $10 = $9;
        var $11 = ___ctype_b_loc();
        var $12 = HEAP[$11];
        var $13 = $12+2*$10;
        var $14 = HEAP[$13];
        var $15 = $14;
        var $16 = $15 & 2048;
        var $17 = $16 != 0;
        if ($17) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $18
        var $19 = HEAP[$1];
        _ee_numeric_element($19);
        __label__ = 2; break;
      case 1: // $20
        var $21 = HEAP[$1];
        var $22 = $21+28;
        HEAP[$22] = 0;;
        var $23 = HEAP[$1];
        var $24 = $23+12;
        HEAP[$24] = 1;;
        var $25 = HEAP[$1];
        var $26 = $25+32;
        HEAP[$26] = 4;;
        __label__ = 2; break;
      case 2: // $27
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_element.__index__ = Runtime.getFunctionIndex(_ee_element, "_ee_element");
  
  
  function _ee_numeric_element($ee) {
    var __stackBase__  = STACKTOP; STACKTOP += 20; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $fpart = __stackBase__+4;
        var $fpartlen = __stackBase__+12;
        HEAP[$1] = $ee;;
        HEAP[$fpart] = 0;;
        HEAP[$fpartlen] = 1;;
        var $2 = HEAP[$1];
        var $3 = $2+28;
        HEAP[$3] = 0;;
        var $4 = HEAP[$1];
        _ee_skip_spaces($4);
        var $5 = HEAP[$1];
        var $6 = $5+12;
        HEAP[$6] = 0;;
        var $7 = HEAP[$1];
        var $8 = $7+20;
        HEAP[$8] = 0;;
        __label__ = 0; break;
      case 0: // $9
        var $10 = HEAP[$1];
        var $11 = $10+8;
        var $12 = HEAP[$11];
        var $13 = HEAP[$1];
        var $14 = $13+4;
        var $15 = HEAP[$14];
        var $16 = unSign($12, 32) < unSign($15, 32);
        if ($16) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $17
        var $18 = HEAP[$1];
        var $19 = $18+8;
        var $20 = HEAP[$19];
        var $21 = HEAP[$1];
        var $22 = $21;
        var $23 = HEAP[$22];
        var $24 = $23+$20;
        var $25 = HEAP[$24];
        var $26 = $25;
        var $27 = $26 == 46;
        if ($27) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $28
        var $29 = HEAP[$1];
        var $30 = $29+28;
        var $31 = HEAP[$30];
        var $32 = $31 == 1;
        if ($32) { __label__ = 5; break; } else { __label__ = 6; break; }
      case 5: // $33
        __label__ = 2; break;
      case 6: // $34
        var $35 = HEAP[$1];
        var $36 = $35+28;
        HEAP[$36] = 1;;
        var $37 = HEAP[$1];
        var $38 = $37+8;
        var $39 = HEAP[$38];
        var $40 = ($39 + 1)&4294967295;
        HEAP[$38] = $40;;
        __label__ = 7; break;
      case 4: // $41
        var $42 = HEAP[$1];
        var $43 = $42+8;
        var $44 = HEAP[$43];
        var $45 = HEAP[$1];
        var $46 = $45;
        var $47 = HEAP[$46];
        var $48 = $47+$44;
        var $49 = HEAP[$48];
        var $50 = $49;
        var $51 = ___ctype_b_loc();
        var $52 = HEAP[$51];
        var $53 = $52+2*$50;
        var $54 = HEAP[$53];
        var $55 = $54;
        var $56 = $55 & 2048;
        var $57 = $56 != 0;
        if ($57) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 9: // $58
        __label__ = 2; break;
      case 8: // $59
        __label__ = 7; break;
      case 7: // $60
        var $61 = HEAP[$1];
        var $62 = $61+28;
        var $63 = HEAP[$62];
        var $64 = $63 == 0;
        if ($64) { __label__ = 10; break; } else { __label__ = 11; break; }
      case 10: // $65
        var $66 = HEAP[$1];
        var $67 = $66+12;
        var $68 = HEAP[$67];
        var $69 = $68 * 10;
        var $70 = HEAP[$1];
        var $71 = $70+8;
        var $72 = HEAP[$71];
        var $73 = HEAP[$1];
        var $74 = $73;
        var $75 = HEAP[$74];
        var $76 = $75+$72;
        var $77 = HEAP[$76];
        var $78 = $77;
        var $79 = ($78 - 48)&4294967295;
        var $80 = $79;
        var $81 = $69 + $80;
        var $82 = HEAP[$1];
        var $83 = $82+12;
        HEAP[$83] = $81;;
        __label__ = 12; break;
      case 11: // $84
        var $85 = HEAP[$fpart];
        var $86 = $85 * 10;
        var $87 = HEAP[$1];
        var $88 = $87+8;
        var $89 = HEAP[$88];
        var $90 = HEAP[$1];
        var $91 = $90;
        var $92 = HEAP[$91];
        var $93 = $92+$89;
        var $94 = HEAP[$93];
        var $95 = $94;
        var $96 = ($95 - 48)&4294967295;
        var $97 = $96;
        var $98 = $86 + $97;
        HEAP[$fpart] = $98;;
        var $99 = HEAP[$fpartlen];
        var $100 = $99 * 10;
        HEAP[$fpartlen] = $100;;
        __label__ = 12; break;
      case 12: // $101
        var $102 = HEAP[$1];
        var $103 = $102+8;
        var $104 = HEAP[$103];
        var $105 = ($104 + 1)&4294967295;
        HEAP[$103] = $105;;
        __label__ = 0; break;
      case 2: // $106
        var $107 = HEAP[$1];
        var $108 = $107+28;
        var $109 = HEAP[$108];
        var $110 = $109 == 1;
        if ($110) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $111
        var $112 = HEAP[$1];
        var $113 = $112+12;
        var $114 = HEAP[$113];
        var $115 = $114;
        var $116 = HEAP[$fpart];
        var $117 = $116;
        var $118 = HEAP[$fpartlen];
        var $119 = $118;
        var $120 = $117 / $119;
        var $121 = $115 + $120;
        var $122 = HEAP[$1];
        var $123 = $122+20;
        HEAP[$123] = $121;;
        __label__ = 14; break;
      case 14: // $124
        STACKTOP = __stackBase__;
        return;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _ee_numeric_element.__index__ = Runtime.getFunctionIndex(_ee_numeric_element, "_ee_numeric_element");
  
  
  function _next_word($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 17; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $val = __stackBase__+4;
        var $cnt = __stackBase__+8;
        var $sc = __stackBase__+12;
        var $tmp = __stackBase__+13;
        HEAP[$1] = $lil;;
        var $2 = HEAP[$1];
        _skip_spaces($2);
        var $3 = HEAP[$1];
        var $4 = $3+12;
        var $5 = HEAP[$4];
        var $6 = HEAP[$1];
        var $7 = $6;
        var $8 = HEAP[$7];
        var $9 = $8+$5;
        var $10 = HEAP[$9];
        var $11 = $10;
        var $12 = $11 == 36;
        if ($12) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $13
        var $14 = HEAP[$1];
        var $15 = _get_dollarpart($14);
        HEAP[$val] = $15;;
        __label__ = 2; break;
      case 1: // $16
        var $17 = HEAP[$1];
        var $18 = $17+12;
        var $19 = HEAP[$18];
        var $20 = HEAP[$1];
        var $21 = $20;
        var $22 = HEAP[$21];
        var $23 = $22+$19;
        var $24 = HEAP[$23];
        var $25 = $24;
        var $26 = $25 == 123;
        if ($26) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $27
        HEAP[$cnt] = 1;;
        var $28 = HEAP[$1];
        var $29 = $28+12;
        var $30 = HEAP[$29];
        var $31 = ($30 + 1)&4294967295;
        HEAP[$29] = $31;;
        var $32 = _alloc_value(0);
        HEAP[$val] = $32;;
        __label__ = 5; break;
      case 5: // $33
        var $34 = HEAP[$1];
        var $35 = $34+12;
        var $36 = HEAP[$35];
        var $37 = HEAP[$1];
        var $38 = $37+8;
        var $39 = HEAP[$38];
        var $40 = unSign($36, 32) < unSign($39, 32);
        if ($40) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $41
        var $42 = HEAP[$1];
        var $43 = $42+12;
        var $44 = HEAP[$43];
        var $45 = HEAP[$1];
        var $46 = $45;
        var $47 = HEAP[$46];
        var $48 = $47+$44;
        var $49 = HEAP[$48];
        var $50 = $49;
        var $51 = $50 == 123;
        if ($51) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $52
        var $53 = HEAP[$1];
        var $54 = $53+12;
        var $55 = HEAP[$54];
        var $56 = ($55 + 1)&4294967295;
        HEAP[$54] = $56;;
        var $57 = HEAP[$cnt];
        var $58 = ($57 + 1)&4294967295;
        HEAP[$cnt] = $58;;
        var $59 = HEAP[$val];
        var $60 = _lil_append_char($59, 123);
        __label__ = 10; break;
      case 9: // $61
        var $62 = HEAP[$1];
        var $63 = $62+12;
        var $64 = HEAP[$63];
        var $65 = HEAP[$1];
        var $66 = $65;
        var $67 = HEAP[$66];
        var $68 = $67+$64;
        var $69 = HEAP[$68];
        var $70 = $69;
        var $71 = $70 == 125;
        if ($71) { __label__ = 11; break; } else { __label__ = 12; break; }
      case 11: // $72
        var $73 = HEAP[$1];
        var $74 = $73+12;
        var $75 = HEAP[$74];
        var $76 = ($75 + 1)&4294967295;
        HEAP[$74] = $76;;
        var $77 = HEAP[$cnt];
        var $78 = ($77 + -1)&4294967295;
        HEAP[$cnt] = $78;;
        var $79 = $78 == 0;
        if ($79) { __label__ = 13; break; } else { __label__ = 14; break; }
      case 13: // $80
        __label__ = 7; break;
      case 14: // $81
        var $82 = HEAP[$val];
        var $83 = _lil_append_char($82, 125);
        __label__ = 15; break;
      case 15: // $84
        __label__ = 16; break;
      case 12: // $85
        var $86 = HEAP[$val];
        var $87 = HEAP[$1];
        var $88 = $87+12;
        var $89 = HEAP[$88];
        var $90 = ($89 + 1)&4294967295;
        HEAP[$88] = $90;;
        var $91 = HEAP[$1];
        var $92 = $91;
        var $93 = HEAP[$92];
        var $94 = $93+$89;
        var $95 = HEAP[$94];
        var $96 = _lil_append_char($86, $95);
        __label__ = 16; break;
      case 16: // $97
        __label__ = 10; break;
      case 10: // $98
        __label__ = 5; break;
      case 7: // $99
        __label__ = 17; break;
      case 4: // $100
        var $101 = HEAP[$1];
        var $102 = $101+12;
        var $103 = HEAP[$102];
        var $104 = HEAP[$1];
        var $105 = $104;
        var $106 = HEAP[$105];
        var $107 = $106+$103;
        var $108 = HEAP[$107];
        var $109 = $108;
        var $110 = $109 == 91;
        if ($110) { __label__ = 18; break; } else { __label__ = 19; break; }
      case 18: // $111
        var $112 = HEAP[$1];
        var $113 = _get_bracketpart($112);
        HEAP[$val] = $113;;
        __label__ = 20; break;
      case 19: // $114
        var $115 = HEAP[$1];
        var $116 = $115+12;
        var $117 = HEAP[$116];
        var $118 = HEAP[$1];
        var $119 = $118;
        var $120 = HEAP[$119];
        var $121 = $120+$117;
        var $122 = HEAP[$121];
        var $123 = $122;
        var $124 = $123 == 34;
        if ($124) { __label__ = 21; break; } else { __label__ = 22; break; }
      case 22: // $125
        var $126 = HEAP[$1];
        var $127 = $126+12;
        var $128 = HEAP[$127];
        var $129 = HEAP[$1];
        var $130 = $129;
        var $131 = HEAP[$130];
        var $132 = $131+$128;
        var $133 = HEAP[$132];
        var $134 = $133;
        var $135 = $134 == 39;
        if ($135) { __label__ = 21; break; } else { __label__ = 23; break; }
      case 21: // $136
        var $137 = HEAP[$1];
        var $138 = $137+12;
        var $139 = HEAP[$138];
        var $140 = ($139 + 1)&4294967295;
        HEAP[$138] = $140;;
        var $141 = HEAP[$1];
        var $142 = $141;
        var $143 = HEAP[$142];
        var $144 = $143+$139;
        var $145 = HEAP[$144];
        HEAP[$sc] = $145;;
        var $146 = _alloc_value(0);
        HEAP[$val] = $146;;
        __label__ = 24; break;
      case 24: // $147
        var $148 = HEAP[$1];
        var $149 = $148+12;
        var $150 = HEAP[$149];
        var $151 = HEAP[$1];
        var $152 = $151+8;
        var $153 = HEAP[$152];
        var $154 = unSign($150, 32) < unSign($153, 32);
        if ($154) { __label__ = 25; break; } else { __label__ = 26; break; }
      case 25: // $155
        var $156 = HEAP[$1];
        var $157 = $156+12;
        var $158 = HEAP[$157];
        var $159 = HEAP[$1];
        var $160 = $159;
        var $161 = HEAP[$160];
        var $162 = $161+$158;
        var $163 = HEAP[$162];
        var $164 = $163;
        var $165 = $164 == 91;
        if ($165) { __label__ = 27; break; } else { __label__ = 28; break; }
      case 28: // $166
        var $167 = HEAP[$1];
        var $168 = $167+12;
        var $169 = HEAP[$168];
        var $170 = HEAP[$1];
        var $171 = $170;
        var $172 = HEAP[$171];
        var $173 = $172+$169;
        var $174 = HEAP[$173];
        var $175 = $174;
        var $176 = $175 == 36;
        if ($176) { __label__ = 27; break; } else { __label__ = 29; break; }
      case 27: // $177
        var $178 = HEAP[$1];
        var $179 = $178+12;
        var $180 = HEAP[$179];
        var $181 = HEAP[$1];
        var $182 = $181;
        var $183 = HEAP[$182];
        var $184 = $183+$180;
        var $185 = HEAP[$184];
        var $186 = $185;
        var $187 = $186 == 36;
        if ($187) { __label__ = 30; break; } else { __label__ = 31; break; }
      case 30: // $188
        var $189 = HEAP[$1];
        var $190 = _get_dollarpart($189);
        __lastLabel__ = 30; __label__ = 32; break;
      case 31: // $191
        var $192 = HEAP[$1];
        var $193 = _get_bracketpart($192);
        __lastLabel__ = 31; __label__ = 32; break;
      case 32: // $194
        var $195 = __lastLabel__ == 30 ? $190 : ($193);
        HEAP[$tmp] = $195;;
        var $196 = HEAP[$val];
        var $197 = HEAP[$tmp];
        var $198 = _lil_append_val($196, $197);
        var $199 = HEAP[$tmp];
        _lil_free_value($199);
        var $200 = HEAP[$1];
        var $201 = $200+12;
        var $202 = HEAP[$201];
        var $203 = ($202 + -1)&4294967295;
        HEAP[$201] = $203;;
        __label__ = 33; break;
      case 29: // $204
        var $205 = HEAP[$1];
        var $206 = $205+12;
        var $207 = HEAP[$206];
        var $208 = HEAP[$1];
        var $209 = $208;
        var $210 = HEAP[$209];
        var $211 = $210+$207;
        var $212 = HEAP[$211];
        var $213 = $212;
        var $214 = $213 == 92;
        if ($214) { __label__ = 34; break; } else { __label__ = 35; break; }
      case 34: // $215
        var $216 = HEAP[$1];
        var $217 = $216+12;
        var $218 = HEAP[$217];
        var $219 = ($218 + 1)&4294967295;
        HEAP[$217] = $219;;
        var $220 = HEAP[$1];
        var $221 = $220+12;
        var $222 = HEAP[$221];
        var $223 = HEAP[$1];
        var $224 = $223;
        var $225 = HEAP[$224];
        var $226 = $225+$222;
        var $227 = HEAP[$226];
        var $228 = $227;
        if ($228 == 98) {
          __label__ = 51; break;
        }
        else if ($228 == 116) {
          __label__ = 52; break;
        }
        else if ($228 == 110) {
          __label__ = 53; break;
        }
        else if ($228 == 118) {
          __label__ = 54; break;
        }
        else if ($228 == 102) {
          __label__ = 55; break;
        }
        else if ($228 == 114) {
          __label__ = 56; break;
        }
        else if ($228 == 48) {
          __label__ = 57; break;
        }
        else if ($228 == 97) {
          __label__ = 58; break;
        }
        else if ($228 == 99) {
          __label__ = 59; break;
        }
        else if ($228 == 111) {
          __label__ = 60; break;
        }
        else {
        __label__ = 61; break;
        }
        
      case 51: // $229
        var $230 = HEAP[$val];
        var $231 = _lil_append_char($230, 8);
        __label__ = 36; break;
      case 52: // $232
        var $233 = HEAP[$val];
        var $234 = _lil_append_char($233, 9);
        __label__ = 36; break;
      case 53: // $235
        var $236 = HEAP[$val];
        var $237 = _lil_append_char($236, 10);
        __label__ = 36; break;
      case 54: // $238
        var $239 = HEAP[$val];
        var $240 = _lil_append_char($239, 11);
        __label__ = 36; break;
      case 55: // $241
        var $242 = HEAP[$val];
        var $243 = _lil_append_char($242, 12);
        __label__ = 36; break;
      case 56: // $244
        var $245 = HEAP[$val];
        var $246 = _lil_append_char($245, 13);
        __label__ = 36; break;
      case 57: // $247
        var $248 = HEAP[$val];
        var $249 = _lil_append_char($248, 0);
        __label__ = 36; break;
      case 58: // $250
        var $251 = HEAP[$val];
        var $252 = _lil_append_char($251, 7);
        __label__ = 36; break;
      case 59: // $253
        var $254 = HEAP[$val];
        var $255 = _lil_append_char($254, 125);
        __label__ = 36; break;
      case 60: // $256
        var $257 = HEAP[$val];
        var $258 = _lil_append_char($257, 123);
        __label__ = 36; break;
      case 61: // $259
        var $260 = HEAP[$val];
        var $261 = HEAP[$1];
        var $262 = $261+12;
        var $263 = HEAP[$262];
        var $264 = HEAP[$1];
        var $265 = $264;
        var $266 = HEAP[$265];
        var $267 = $266+$263;
        var $268 = HEAP[$267];
        var $269 = _lil_append_char($260, $268);
        __label__ = 36; break;
      case 36: // $270
        __label__ = 37; break;
      case 35: // $271
        var $272 = HEAP[$1];
        var $273 = $272+12;
        var $274 = HEAP[$273];
        var $275 = HEAP[$1];
        var $276 = $275;
        var $277 = HEAP[$276];
        var $278 = $277+$274;
        var $279 = HEAP[$278];
        var $280 = $279;
        var $281 = HEAP[$sc];
        var $282 = $281;
        var $283 = $280 == $282;
        if ($283) { __label__ = 38; break; } else { __label__ = 39; break; }
      case 38: // $284
        var $285 = HEAP[$1];
        var $286 = $285+12;
        var $287 = HEAP[$286];
        var $288 = ($287 + 1)&4294967295;
        HEAP[$286] = $288;;
        __label__ = 26; break;
      case 39: // $289
        var $290 = HEAP[$val];
        var $291 = HEAP[$1];
        var $292 = $291+12;
        var $293 = HEAP[$292];
        var $294 = HEAP[$1];
        var $295 = $294;
        var $296 = HEAP[$295];
        var $297 = $296+$293;
        var $298 = HEAP[$297];
        var $299 = _lil_append_char($290, $298);
        __label__ = 40; break;
      case 40: // $300
        __label__ = 37; break;
      case 37: // $301
        __label__ = 33; break;
      case 33: // $302
        var $303 = HEAP[$1];
        var $304 = $303+12;
        var $305 = HEAP[$304];
        var $306 = ($305 + 1)&4294967295;
        HEAP[$304] = $306;;
        __label__ = 24; break;
      case 26: // $307
        __label__ = 41; break;
      case 23: // $308
        var $309 = _alloc_value(0);
        HEAP[$val] = $309;;
        __label__ = 42; break;
      case 42: // $310
        var $311 = HEAP[$1];
        var $312 = $311+12;
        var $313 = HEAP[$312];
        var $314 = HEAP[$1];
        var $315 = $314+8;
        var $316 = HEAP[$315];
        var $317 = unSign($313, 32) < unSign($316, 32);
        if ($317) { __lastLabel__ = 42; __label__ = 43; break; } else { __lastLabel__ = 42; __label__ = 44; break; }
      case 43: // $318
        var $319 = HEAP[$1];
        var $320 = $319+12;
        var $321 = HEAP[$320];
        var $322 = HEAP[$1];
        var $323 = $322;
        var $324 = HEAP[$323];
        var $325 = $324+$321;
        var $326 = HEAP[$325];
        var $327 = $326;
        var $328 = ___ctype_b_loc();
        var $329 = HEAP[$328];
        var $330 = $329+2*$327;
        var $331 = HEAP[$330];
        var $332 = $331;
        var $333 = $332 & 8192;
        var $334 = $333 != 0;
        if ($334) { __lastLabel__ = 43; __label__ = 44; break; } else { __lastLabel__ = 43; __label__ = 45; break; }
      case 45: // $335
        var $336 = HEAP[$1];
        var $337 = $336+12;
        var $338 = HEAP[$337];
        var $339 = HEAP[$1];
        var $340 = $339;
        var $341 = HEAP[$340];
        var $342 = $341+$338;
        var $343 = HEAP[$342];
        var $344 = _islilspecial($343);
        var $345 = $344 != 0;
        var $346 = $345 ^ 1;
        __lastLabel__ = 45; __label__ = 44; break;
      case 44: // $347
        var $348 = __lastLabel__ == 43 ? 0 : (__lastLabel__ == 42 ? 0 : ($346));
        if ($348) { __label__ = 46; break; } else { __label__ = 47; break; }
      case 46: // $349
        var $350 = HEAP[$val];
        var $351 = HEAP[$1];
        var $352 = $351+12;
        var $353 = HEAP[$352];
        var $354 = ($353 + 1)&4294967295;
        HEAP[$352] = $354;;
        var $355 = HEAP[$1];
        var $356 = $355;
        var $357 = HEAP[$356];
        var $358 = $357+$353;
        var $359 = HEAP[$358];
        var $360 = _lil_append_char($350, $359);
        __label__ = 42; break;
      case 47: // $361
        __label__ = 41; break;
      case 41: // $362
        __label__ = 20; break;
      case 20: // $363
        __label__ = 17; break;
      case 17: // $364
        __label__ = 2; break;
      case 2: // $365
        var $366 = HEAP[$val];
        var $367 = $366 != 0;
        if ($367) { __label__ = 48; break; } else { __label__ = 49; break; }
      case 48: // $368
        var $369 = HEAP[$val];
        __lastLabel__ = 48; __label__ = 50; break;
      case 49: // $370
        var $371 = _alloc_value(0);
        __lastLabel__ = 49; __label__ = 50; break;
      case 50: // $372
        var $373 = __lastLabel__ == 48 ? $369 : ($371);
        STACKTOP = __stackBase__;
        return $373;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _next_word.__index__ = Runtime.getFunctionIndex(_next_word, "_next_word");
  
  
  function _get_dollarpart($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
  
    var $1 = __stackBase__;
    var $val = __stackBase__+4;
    var $name = __stackBase__+8;
    var $tmp = __stackBase__+12;
    HEAP[$1] = $lil;;
    var $2 = HEAP[$1];
    var $3 = $2+12;
    var $4 = HEAP[$3];
    var $5 = ($4 + 1)&4294967295;
    HEAP[$3] = $5;;
    var $6 = HEAP[$1];
    var $7 = _next_word($6);
    HEAP[$name] = $7;;
    var $8 = HEAP[$1];
    var $9 = $8+36;
    var $10 = HEAP[$9];
    var $11 = _alloc_value($10);
    HEAP[$tmp] = $11;;
    var $12 = HEAP[$tmp];
    var $13 = HEAP[$name];
    var $14 = _lil_append_val($12, $13);
    var $15 = HEAP[$name];
    _lil_free_value($15);
    var $16 = HEAP[$1];
    var $17 = HEAP[$tmp];
    var $18 = _lil_parse_value($16, $17, 0);
    HEAP[$val] = $18;;
    var $19 = HEAP[$tmp];
    _lil_free_value($19);
    var $20 = HEAP[$val];
    STACKTOP = __stackBase__;
    return $20;
  }
  _get_dollarpart.__index__ = Runtime.getFunctionIndex(_get_dollarpart, "_get_dollarpart");
  
  
  function _get_bracketpart($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $cnt = __stackBase__+4;
        var $val = __stackBase__+8;
        var $cmd = __stackBase__+12;
        HEAP[$1] = $lil;;
        HEAP[$cnt] = 1;;
        var $2 = _alloc_value(0);
        HEAP[$cmd] = $2;;
        var $3 = HEAP[$1];
        var $4 = $3+12;
        var $5 = HEAP[$4];
        var $6 = ($5 + 1)&4294967295;
        HEAP[$4] = $6;;
        __label__ = 0; break;
      case 0: // $7
        var $8 = HEAP[$1];
        var $9 = $8+12;
        var $10 = HEAP[$9];
        var $11 = HEAP[$1];
        var $12 = $11+8;
        var $13 = HEAP[$12];
        var $14 = unSign($10, 32) < unSign($13, 32);
        if ($14) { __label__ = 1; break; } else { __label__ = 2; break; }
      case 1: // $15
        var $16 = HEAP[$1];
        var $17 = $16+12;
        var $18 = HEAP[$17];
        var $19 = HEAP[$1];
        var $20 = $19;
        var $21 = HEAP[$20];
        var $22 = $21+$18;
        var $23 = HEAP[$22];
        var $24 = $23;
        var $25 = $24 == 91;
        if ($25) { __label__ = 3; break; } else { __label__ = 4; break; }
      case 3: // $26
        var $27 = HEAP[$1];
        var $28 = $27+12;
        var $29 = HEAP[$28];
        var $30 = ($29 + 1)&4294967295;
        HEAP[$28] = $30;;
        var $31 = HEAP[$cnt];
        var $32 = ($31 + 1)&4294967295;
        HEAP[$cnt] = $32;;
        var $33 = HEAP[$cmd];
        var $34 = _lil_append_char($33, 91);
        __label__ = 5; break;
      case 4: // $35
        var $36 = HEAP[$1];
        var $37 = $36+12;
        var $38 = HEAP[$37];
        var $39 = HEAP[$1];
        var $40 = $39;
        var $41 = HEAP[$40];
        var $42 = $41+$38;
        var $43 = HEAP[$42];
        var $44 = $43;
        var $45 = $44 == 93;
        if ($45) { __label__ = 6; break; } else { __label__ = 7; break; }
      case 6: // $46
        var $47 = HEAP[$1];
        var $48 = $47+12;
        var $49 = HEAP[$48];
        var $50 = ($49 + 1)&4294967295;
        HEAP[$48] = $50;;
        var $51 = HEAP[$cnt];
        var $52 = ($51 + -1)&4294967295;
        HEAP[$cnt] = $52;;
        var $53 = $52 == 0;
        if ($53) { __label__ = 8; break; } else { __label__ = 9; break; }
      case 8: // $54
        __label__ = 2; break;
      case 9: // $55
        var $56 = HEAP[$cmd];
        var $57 = _lil_append_char($56, 93);
        __label__ = 10; break;
      case 10: // $58
        __label__ = 11; break;
      case 7: // $59
        var $60 = HEAP[$cmd];
        var $61 = HEAP[$1];
        var $62 = $61+12;
        var $63 = HEAP[$62];
        var $64 = ($63 + 1)&4294967295;
        HEAP[$62] = $64;;
        var $65 = HEAP[$1];
        var $66 = $65;
        var $67 = HEAP[$66];
        var $68 = $67+$63;
        var $69 = HEAP[$68];
        var $70 = _lil_append_char($60, $69);
        __label__ = 11; break;
      case 11: // $71
        __label__ = 5; break;
      case 5: // $72
        __label__ = 0; break;
      case 2: // $73
        var $74 = HEAP[$1];
        var $75 = HEAP[$cmd];
        var $76 = _lil_parse_value($74, $75, 0);
        HEAP[$val] = $76;;
        var $77 = HEAP[$cmd];
        _lil_free_value($77);
        var $78 = HEAP[$val];
        STACKTOP = __stackBase__;
        return $78;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _get_bracketpart.__index__ = Runtime.getFunctionIndex(_get_bracketpart, "_get_bracketpart");
  
  
  function _islilspecial($ch) {
    var __stackBase__  = STACKTOP; STACKTOP += 1; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    var __lastLabel__ = null;
    __label__ = 0; 
    while(1) switch(__label__) {
      case 0: // $0
        var $1 = __stackBase__;
        HEAP[$1] = $ch;;
        var $2 = HEAP[$1];
        var $3 = $2;
        var $4 = $3 == 59;
        if ($4) { __lastLabel__ = 0; __label__ = 1; break; } else { __lastLabel__ = 0; __label__ = 2; break; }
      case 2: // $5
        var $6 = HEAP[$1];
        var $7 = $6;
        var $8 = $7 == 36;
        if ($8) { __lastLabel__ = 2; __label__ = 1; break; } else { __lastLabel__ = 2; __label__ = 3; break; }
      case 3: // $9
        var $10 = HEAP[$1];
        var $11 = $10;
        var $12 = $11 == 91;
        if ($12) { __lastLabel__ = 3; __label__ = 1; break; } else { __lastLabel__ = 3; __label__ = 4; break; }
      case 4: // $13
        var $14 = HEAP[$1];
        var $15 = $14;
        var $16 = $15 == 93;
        if ($16) { __lastLabel__ = 4; __label__ = 1; break; } else { __lastLabel__ = 4; __label__ = 5; break; }
      case 5: // $17
        var $18 = HEAP[$1];
        var $19 = $18;
        var $20 = $19 == 123;
        if ($20) { __lastLabel__ = 5; __label__ = 1; break; } else { __lastLabel__ = 5; __label__ = 6; break; }
      case 6: // $21
        var $22 = HEAP[$1];
        var $23 = $22;
        var $24 = $23 == 125;
        if ($24) { __lastLabel__ = 6; __label__ = 1; break; } else { __lastLabel__ = 6; __label__ = 7; break; }
      case 7: // $25
        var $26 = HEAP[$1];
        var $27 = $26;
        var $28 = $27 == 34;
        if ($28) { __lastLabel__ = 7; __label__ = 1; break; } else { __lastLabel__ = 7; __label__ = 8; break; }
      case 8: // $29
        var $30 = HEAP[$1];
        var $31 = $30;
        var $32 = $31 == 39;
        __lastLabel__ = 8; __label__ = 1; break;
      case 1: // $33
        var $34 = __lastLabel__ == 7 ? 1 : (__lastLabel__ == 6 ? 1 : (__lastLabel__ == 5 ? 1 : (__lastLabel__ == 4 ? 1 : (__lastLabel__ == 3 ? 1 : (__lastLabel__ == 2 ? 1 : (__lastLabel__ == 0 ? 1 : ($32)))))));
        var $35 = $34;
        STACKTOP = __stackBase__;
        return $35;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _islilspecial.__index__ = Runtime.getFunctionIndex(_islilspecial, "_islilspecial");
  
  
  function _liljs_error_check($lil) {
    var __stackBase__  = STACKTOP; STACKTOP += 16; assert(STACKTOP < STACK_MAX); for (var i = __stackBase__; i < STACKTOP; i++) {HEAP[i] = 0 };
    var __label__;
    __label__ = -1; 
    while(1) switch(__label__) {
      case -1: // $entry
        var $1 = __stackBase__;
        var $2 = __stackBase__+4;
        var $msg = __stackBase__+8;
        var $pos = __stackBase__+12;
        HEAP[$2] = $lil;;
        var $3 = HEAP[$2];
        var $4 = _lil_error($3, $msg, $pos);
        var $5 = $4 != 0;
        if ($5) { __label__ = 0; break; } else { __label__ = 1; break; }
      case 0: // $6
        var $7 = HEAP[$msg];
        var $8 = _printf(__str91, $7);
        HEAP[$1] = 0;;
        __label__ = 2; break;
      case 1: // $9
        HEAP[$1] = 1;;
        __label__ = 2; break;
      case 2: // $10
        var $11 = HEAP[$1];
        STACKTOP = __stackBase__;
        return $11;
      default: assert(0, "bad label: " + __label__);
    }
  }
  _liljs_error_check.__index__ = Runtime.getFunctionIndex(_liljs_error_check, "_liljs_error_check");
  
  // === Auto-generated postamble setup entry stuff ===
  
  function run(args) {
    __initializeRuntime__();
  
    var globalFuncs = [];
  
      __str = Pointer_make([115,101,116,32,0] /* set \00 */, 0, ALLOC_STATIC);
    __str1 = Pointer_make([97,114,103,115,0] /* args\00 */, 0, ALLOC_STATIC);
    __str2 = Pointer_make([99,97,116,99,104,101,114,32,108,105,109,105,116,32,114,101,97,99,104,101,100,32,119,104,105,108,101,32,116,114,121,105,110,103,32,116,111,32,99,97,108,108,32,117,110,107,110,111,119,110,32,102,117,110,99,116,105,111,110,32,37,115,0] /* catcher limit reached while trying to call unknown function %s\00 */, 0, ALLOC_STATIC);
    __str3 = Pointer_make([117,110,107,110,111,119,110,32,102,117,110,99,116,105,111,110,32,37,115,0] /* unknown function %s\00 */, 0, ALLOC_STATIC);
    __str4 = Pointer_make([0], 0, ALLOC_STATIC);
    __str5 = Pointer_make([100,105,118,105,115,105,111,110,32,98,121,32,122,101,114,111,32,105,110,32,101,120,112,114,101,115,115,105,111,110,0] /* division by zero in expression\00 */, 0, ALLOC_STATIC);
    __str6 = Pointer_make([109,105,120,105,110,103,32,105,110,118,97,108,105,100,32,116,121,112,101,115,32,105,110,32,101,120,112,114,101,115,115,105,111,110,0] /* mixing invalid types in expression\00 */, 0, ALLOC_STATIC);
    __str7 = Pointer_make([101,120,112,114,101,115,115,105,111,110,32,115,121,110,116,97,120,32,101,114,114,111,114,0] /* expression syntax error\00 */, 0, ALLOC_STATIC);
    __str8 = Pointer_make([33,33,117,110,33,37,115,33,37,48,57,117,33,110,117,33,33,0] /* !!un!%s!%09u!nu!!\00 */, 0, ALLOC_STATIC);
    __str9 = Pointer_make([37,102,0] /* %f\00 */, 0, ALLOC_STATIC);
    __str10 = Pointer_make([37,108,105,0] /* %lli\00 */, 0, ALLOC_STATIC);
    __str11 = Pointer_make([114,101,102,108,101,99,116,0] /* reflect\00 */, 0, ALLOC_STATIC);
    __str12 = Pointer_make([102,117,110,99,0] /* func\00 */, 0, ALLOC_STATIC);
    __str13 = Pointer_make([114,101,110,97,109,101,0] /* rename\00 */, 0, ALLOC_STATIC);
    __str14 = Pointer_make([117,110,117,115,101,100,110,97,109,101,0] /* unusedname\00 */, 0, ALLOC_STATIC);
    __str15 = Pointer_make([113,117,111,116,101,0] /* quote\00 */, 0, ALLOC_STATIC);
    __str16 = Pointer_make([115,101,116,0] /* set\00 */, 0, ALLOC_STATIC);
    __str17 = Pointer_make([119,114,105,116,101,0] /* write\00 */, 0, ALLOC_STATIC);
    __str18 = Pointer_make([112,114,105,110,116,0] /* print\00 */, 0, ALLOC_STATIC);
    __str19 = Pointer_make([101,118,97,108,0] /* eval\00 */, 0, ALLOC_STATIC);
    __str20 = Pointer_make([117,112,101,118,97,108,0] /* upeval\00 */, 0, ALLOC_STATIC);
    __str21 = Pointer_make([100,111,119,110,101,118,97,108,0] /* downeval\00 */, 0, ALLOC_STATIC);
    __str22 = Pointer_make([106,97,105,108,101,118,97,108,0] /* jaileval\00 */, 0, ALLOC_STATIC);
    __str23 = Pointer_make([99,111,117,110,116,0] /* count\00 */, 0, ALLOC_STATIC);
    __str24 = Pointer_make([105,110,100,101,120,0] /* index\00 */, 0, ALLOC_STATIC);
    __str25 = Pointer_make([105,110,100,101,120,111,102,0] /* indexof\00 */, 0, ALLOC_STATIC);
    __str26 = Pointer_make([102,105,108,116,101,114,0] /* filter\00 */, 0, ALLOC_STATIC);
    __str27 = Pointer_make([108,105,115,116,0] /* list\00 */, 0, ALLOC_STATIC);
    __str28 = Pointer_make([97,112,112,101,110,100,0] /* append\00 */, 0, ALLOC_STATIC);
    __str29 = Pointer_make([115,108,105,99,101,0] /* slice\00 */, 0, ALLOC_STATIC);
    __str30 = Pointer_make([115,117,98,115,116,0] /* subst\00 */, 0, ALLOC_STATIC);
    __str31 = Pointer_make([99,111,110,99,97,116,0] /* concat\00 */, 0, ALLOC_STATIC);
    __str32 = Pointer_make([102,111,114,101,97,99,104,0] /* foreach\00 */, 0, ALLOC_STATIC);
    __str33 = Pointer_make([114,101,116,117,114,110,0] /* return\00 */, 0, ALLOC_STATIC);
    __str34 = Pointer_make([101,120,112,114,0] /* expr\00 */, 0, ALLOC_STATIC);
    __str35 = Pointer_make([105,110,99,0] /* inc\00 */, 0, ALLOC_STATIC);
    __str36 = Pointer_make([100,101,99,0] /* dec\00 */, 0, ALLOC_STATIC);
    __str37 = Pointer_make([114,101,97,100,0] /* read\00 */, 0, ALLOC_STATIC);
    __str38 = Pointer_make([115,116,111,114,101,0] /* store\00 */, 0, ALLOC_STATIC);
    __str39 = Pointer_make([105,102,0] /* if\00 */, 0, ALLOC_STATIC);
    __str40 = Pointer_make([119,104,105,108,101,0] /* while\00 */, 0, ALLOC_STATIC);
    __str41 = Pointer_make([102,111,114,0] /* for\00 */, 0, ALLOC_STATIC);
    __str42 = Pointer_make([99,104,97,114,0] /* char\00 */, 0, ALLOC_STATIC);
    __str43 = Pointer_make([99,104,97,114,97,116,0] /* charat\00 */, 0, ALLOC_STATIC);
    __str44 = Pointer_make([99,111,100,101,97,116,0] /* codeat\00 */, 0, ALLOC_STATIC);
    __str45 = Pointer_make([115,117,98,115,116,114,0] /* substr\00 */, 0, ALLOC_STATIC);
    __str46 = Pointer_make([115,116,114,112,111,115,0] /* strpos\00 */, 0, ALLOC_STATIC);
    __str47 = Pointer_make([108,101,110,103,116,104,0] /* length\00 */, 0, ALLOC_STATIC);
    __str48 = Pointer_make([116,114,105,109,0] /* trim\00 */, 0, ALLOC_STATIC);
    __str49 = Pointer_make([108,116,114,105,109,0] /* ltrim\00 */, 0, ALLOC_STATIC);
    __str50 = Pointer_make([114,116,114,105,109,0] /* rtrim\00 */, 0, ALLOC_STATIC);
    __str51 = Pointer_make([115,116,114,99,109,112,0] /* strcmp\00 */, 0, ALLOC_STATIC);
    __str52 = Pointer_make([115,116,114,101,113,0] /* streq\00 */, 0, ALLOC_STATIC);
    __str53 = Pointer_make([114,101,112,115,116,114,0] /* repstr\00 */, 0, ALLOC_STATIC);
    __str54 = Pointer_make([115,112,108,105,116,0] /* split\00 */, 0, ALLOC_STATIC);
    __str55 = Pointer_make([116,114,121,0] /* try\00 */, 0, ALLOC_STATIC);
    __str56 = Pointer_make([101,114,114,111,114,0] /* error\00 */, 0, ALLOC_STATIC);
    __str57 = Pointer_make([101,120,105,116,0] /* exit\00 */, 0, ALLOC_STATIC);
    __str58 = Pointer_make([115,111,117,114,99,101,0] /* source\00 */, 0, ALLOC_STATIC);
    __str59 = Pointer_make([108,109,97,112,0] /* lmap\00 */, 0, ALLOC_STATIC);
    __str60 = Pointer_make([114,97,110,100,0] /* rand\00 */, 0, ALLOC_STATIC);
    __str61 = Pointer_make([99,97,116,99,104,101,114,0] /* catcher\00 */, 0, ALLOC_STATIC);
    __str62 = Pointer_make([114,98,0] /* rb\00 */, 0, ALLOC_STATIC);
    __str63 = Pointer_make([32,0] /*  \00 */, 0, ALLOC_STATIC);
    __str64 = Pointer_make([32,12,10,13,9,11,0] /*  \0C\0A\0D\09\0B\00 */, 0, ALLOC_STATIC);
    __str65 = Pointer_make([110,111,116,0] /* not\00 */, 0, ALLOC_STATIC);
    __str66 = Pointer_make([119,98,0] /* wb\00 */, 0, ALLOC_STATIC);
    __str67 = Pointer_make([105,0] /* i\00 */, 0, ALLOC_STATIC);
    __str68 = Pointer_make([103,108,111,98,97,108,0] /* global\00 */, 0, ALLOC_STATIC);
    __str69 = Pointer_make([120,0] /* x\00 */, 0, ALLOC_STATIC);
    __str70 = Pointer_make([48,0] /* 0\00 */, 0, ALLOC_STATIC);
    __str71 = Pointer_make([37,117,0] /* %u\00 */, 0, ALLOC_STATIC);
    __str72 = Pointer_make([99,108,101,97,110,0] /* clean\00 */, 0, ALLOC_STATIC);
    __str73 = Pointer_make([10,0] /* \0A\00 */, 0, ALLOC_STATIC);
    __str74 = Pointer_make([37,115,0] /* %s\00 */, 0, ALLOC_STATIC);
    __str75 = Pointer_make([117,110,107,110,111,119,110,32,102,117,110,99,116,105,111,110,32,39,37,115,39,0] /* unknown function '%s'\00 */, 0, ALLOC_STATIC);
    __str76 = Pointer_make([97,110,111,110,121,109,111,117,115,45,102,117,110,99,116,105,111,110,0] /* anonymous-function\00 */, 0, ALLOC_STATIC);
    __str77 = Pointer_make([118,101,114,115,105,111,110,0] /* version\00 */, 0, ALLOC_STATIC);
    __str78 = Pointer_make([48,46,49,0] /* 0.1\00 */, 0, ALLOC_STATIC);
    __str79 = Pointer_make([98,111,100,121,0] /* body\00 */, 0, ALLOC_STATIC);
    __str80 = Pointer_make([102,117,110,99,45,99,111,117,110,116,0] /* func-count\00 */, 0, ALLOC_STATIC);
    __str81 = Pointer_make([102,117,110,99,115,0] /* funcs\00 */, 0, ALLOC_STATIC);
    __str82 = Pointer_make([118,97,114,115,0] /* vars\00 */, 0, ALLOC_STATIC);
    __str83 = Pointer_make([103,108,111,98,97,108,115,0] /* globals\00 */, 0, ALLOC_STATIC);
    __str84 = Pointer_make([104,97,115,45,102,117,110,99,0] /* has-func\00 */, 0, ALLOC_STATIC);
    __str85 = Pointer_make([49,0] /* 1\00 */, 0, ALLOC_STATIC);
    __str86 = Pointer_make([104,97,115,45,118,97,114,0] /* has-var\00 */, 0, ALLOC_STATIC);
    __str87 = Pointer_make([104,97,115,45,103,108,111,98,97,108,0] /* has-global\00 */, 0, ALLOC_STATIC);
    __str88 = Pointer_make([100,111,108,108,97,114,45,112,114,101,102,105,120,0] /* dollar-prefix\00 */, 0, ALLOC_STATIC);
    __str89 = Pointer_make([116,104,105,115,0] /* this\00 */, 0, ALLOC_STATIC);
    __str90 = Pointer_make([110,97,109,101,0] /* name\00 */, 0, ALLOC_STATIC);
    __str91 = Pointer_make([76,73,76,32,101,114,114,111,114,58,32,37,115,10,0] /* LIL error: %s\0A\00 */, 0, ALLOC_STATIC);
    
    
    this._STDIO.init()
  
    var argc = args.length+1;
    function pad() {
      for (var i = 0; i < 4-1; i++) {
        argv.push(0);
      }
    }
    var argv = [Pointer_make(intArrayFromString("/bin/this.program"), null) ];
    pad();
    for (var i = 0; i < argc-1; i = i + 1) {
      argv.push(Pointer_make(intArrayFromString(args[i]), null));
      pad();
    }
    argv.push(0);
    argv = Pointer_make(argv, null);
  
    __globalConstructor__();
  
    if (Module['_main']) {
      _main(argc, argv, 0);
      __shutdownRuntime__();
    }
  }
  Module['run'] = run;
  
  // {{PRE_RUN_ADDITIONS}}
  
  run(args);
  
  // {{POST_RUN_ADDITIONS}}
  
  
  

  // {{MODULE_ADDITIONS}}

//  return Module;
//})({}, this.arguments); // Replace parameters as needed


