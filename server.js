var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var PORT = 7778;
var ALLOWED_ROOTS = ['/tmp/usb'];

var MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
  mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  mov: 'video/quicktime', webm: 'video/webm', ts: 'video/mp2t',
  flv: 'video/x-flv', wmv: 'video/x-ms-wmv', m4v: 'video/mp4', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', flac: 'audio/flac', aac: 'audio/aac',
  ogg: 'audio/ogg', wav: 'audio/wav', wma: 'audio/x-ms-wma', m4a: 'audio/mp4',
  txt: 'text/plain', pdf: 'application/pdf',
  html: 'text/html', css: 'text/css', js: 'application/javascript'
};

function isAllowed(p) {
  var resolved = path.resolve(p);
  for (var i = 0; i < ALLOWED_ROOTS.length; i++) {
    if (resolved.indexOf(ALLOWED_ROOTS[i]) === 0) return true;
  }
  return false;
}

function getMime(file) {
  var ext = file.split('.').pop().toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/api/list') {
    var dir = parsed.query.path || '/tmp/usb';
    if (!isAllowed(dir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readdir(dir, function (err, files) {
      if (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      var entries = [];
      var pending = files.length;
      if (!pending) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
        return;
      }
      for (var i = 0; i < files.length; i++) {
        (function (name) {
          var full = path.join(dir, name);
          fs.stat(full, function (err2, st) {
            if (!err2) {
              entries.push({
                name: name,
                path: full,
                dir: st.isDirectory(),
                size: st.isDirectory() ? undefined : st.size
              });
            }
            pending--;
            if (pending <= 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(entries));
            }
          });
        })(files[i]);
      }
    });

  } else if (pathname === '/api/file') {
    var filePath = parsed.query.path;
    if (!filePath || !isAllowed(filePath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.stat(filePath, function (err, st) {
      if (err || st.isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      var mime = getMime(filePath);
      var total = st.size;
      var range = req.headers.range;

      if (range) {
        var parts = range.replace(/bytes=/, '').split('-');
        var start = parseInt(parts[0], 10);
        var end = parts[1] ? parseInt(parts[1], 10) : total - 1;
        if (start >= total || end >= total) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + total });
          res.end();
          return;
        }
        res.writeHead(206, {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': mime
        });
        fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': total,
          'Content-Type': mime,
          'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(filePath).pipe(res);
      }
    });

  } else if (pathname === '/api/play') {
    var playPath = parsed.query.path;
    var playType = parsed.query.type || 'video';
    if (!playPath || !isAllowed(playPath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    var exec = require('child_process').exec;
    var mediaType = playType === 'video' ? 'VIDEO' : playType === 'audio' ? 'MUSIC' : 'IMAGE';
    var params = JSON.stringify({
      id: 'com.webos.app.photovideo',
      params: {
        payload: [{
          fullPath: playPath,
          fileName: path.basename(playPath),
          mediaType: mediaType,
          deviceType: 'usb'
        }],
        playIndex: 0
      }
    });
    var cmd = "luna-send -n 1 -a com.custom.filebrowser luna://com.webos.applicationManager/launch '" + params + "'";
    console.log('[play] path:', playPath);
    console.log('[play] type:', playType);
    console.log('[play] cmd:', cmd);
    exec(cmd, function (err, stdout, stderr) {
      console.log('[play] err:', err ? err.message : 'none');
      console.log('[play] stdout:', stdout);
      console.log('[play] stderr:', stderr);
      var result = { ok: !err, output: (stdout || '') + (stderr || '') };
      console.log('[play] result:', JSON.stringify(result));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });

  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT);

console.log('USB file server running on port ' + PORT);
