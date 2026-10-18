var USB_ROOTS = ['/tmp/usb'];
var currentPath = '';
var historyStack = [];

var grid = document.getElementById('grid');
var status = document.getElementById('status');
var backBtn = document.getElementById('back-btn');
var pathDisplay = document.getElementById('path-display');
var viewer = document.getElementById('viewer');
var viewerImg = document.getElementById('viewer-img');
var viewerVideo = document.getElementById('viewer-video');
var viewerClose = document.getElementById('viewer-close');

var IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
var VIDEO_EXT = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'flv', 'wmv', 'm4v', '3gp'];
var AUDIO_EXT = ['mp3', 'flac', 'aac', 'ogg', 'wav', 'wma', 'm4a'];

document.getElementById('title').textContent = 'USB Browser v9';

// Push an initial history state so Back doesn't exit the app
history.pushState({ depth: 0 }, '');
window.addEventListener('popstate', function () {
  if (viewer.style.display !== 'none') {
    closeViewer();
  } else if (historyStack.length) {
    var prev = historyStack.pop();
    currentPath = '';
    navigate(prev);
    historyStack.pop();
  }
  // Always keep a state so next Back doesn't exit
  history.pushState({ depth: historyStack.length }, '');
});

function getExt(name) {
  var parts = name.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

function getType(name) {
  var ext = getExt(name);
  if (IMAGE_EXT.indexOf(ext) !== -1) return 'image';
  if (VIDEO_EXT.indexOf(ext) !== -1) return 'video';
  if (AUDIO_EXT.indexOf(ext) !== -1) return 'audio';
  return 'file';
}

function getIcon(type) {
  if (type === 'folder') return '\u{1F4C1}';
  if (type === 'image') return '\u{1F5BC}';
  if (type === 'video') return '\u{1F3AC}';
  if (type === 'audio') return '\u{1F3B5}';
  return '\u{1F4C4}';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function xhr(method, url, callback) {
  var r = new XMLHttpRequest();
  r.onreadystatechange = function () {
    if (r.readyState === 4) callback(r.status, r.responseText);
  };
  r.open(method, url, true);
  r.send();
}

function listDir(path, callback) {
  xhr('GET', 'http://localhost:7778/api/list?path=' + encodeURIComponent(path), function (code, body) {
    if (code === 200) {
      try { callback(null, JSON.parse(body)); } catch (e) { callback(e); }
    } else {
      callback(new Error('HTTP ' + code));
    }
  });
}

function handleItem(itemPath, itemType) {
  status.textContent = 'Opening: ' + itemPath;
  if (itemType === 'folder') {
    navigate(itemPath);
  } else if (itemType === 'image') {
    showViewer('image', itemPath);
  } else if (itemType === 'video' || itemType === 'audio') {
    playNative(itemPath, itemType);
  }
}

function playNative(filePath, type) {
  status.textContent = 'Launching player...';
  var playUrl = 'http://localhost:7778/api/play?type=' + type + '&path=' + encodeURIComponent(filePath);
  console.log('[play] requesting:', playUrl);
  xhr('GET', playUrl, function (code, body) {
    console.log('[play] response code:', code, 'body:', body);
    if (code === 200) {
      try {
        var resp = JSON.parse(body);
        console.log('[play] result:', JSON.stringify(resp));
        status.textContent = resp.ok ? 'Player launched' : 'Launch failed: ' + resp.output;
      } catch (e) {
        status.textContent = '';
      }
    } else {
      status.textContent = 'Failed to launch player (HTTP ' + code + ')';
    }
  });
}

function findItemEl(el) {
  while (el && el !== grid) {
    if (el.getAttribute && el.getAttribute('data-path')) return el;
    el = el.parentNode;
  }
  return null;
}

grid.onclick = function (ev) {
  var el = findItemEl(ev.target);
  if (el) {
    handleItem(el.getAttribute('data-path'), el.getAttribute('data-type'));
  }
};

grid.onkeydown = function (ev) {
  if (ev.keyCode === 13 || ev.keyCode === 32) {
    var el = findItemEl(ev.target);
    if (el) {
      ev.preventDefault();
      handleItem(el.getAttribute('data-path'), el.getAttribute('data-type'));
    }
  }
};

function navigate(path) {
  if (currentPath) historyStack.push(currentPath);
  currentPath = path;
  history.pushState({ depth: historyStack.length }, '');
  backBtn.style.display = historyStack.length ? '' : 'none';
  pathDisplay.textContent = path || '/';
  grid.innerHTML = '';
  status.textContent = 'Loading...';

  listDir(path, function (err, entries) {
    if (err) {
      status.textContent = 'Cannot read directory. Is USB connected?';
      return;
    }
    status.textContent = '';
    if (!entries.length) {
      status.textContent = 'Empty folder';
      return;
    }

    entries.sort(function (a, b) {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var type = e.dir ? 'folder' : getType(e.name);
      var item = document.createElement('div');
      item.className = 'item';
      item.tabIndex = 0;
      item.setAttribute('data-path', e.path);
      item.setAttribute('data-type', type);

      var icon = document.createElement('div');
      icon.className = 'item-icon ' + type;
      icon.textContent = getIcon(type);

      var name = document.createElement('div');
      name.className = 'item-name';
      name.textContent = e.name;

      item.appendChild(icon);
      item.appendChild(name);

      if (!e.dir && e.size !== undefined) {
        var size = document.createElement('div');
        size.className = 'item-size';
        size.textContent = formatSize(e.size);
        item.appendChild(size);
      }

      grid.appendChild(item);
    }

    var first = grid.querySelector('.item');
    if (first) first.focus();
  });
}

function showViewer(type, filePath) {
  var url = 'http://localhost:7778/api/file?path=' + encodeURIComponent(filePath);
  viewer.style.display = 'flex';

  if (type === 'image') {
    viewerImg.style.display = 'block';
    viewerVideo.style.display = 'none';
    viewerVideo.pause();
    viewerVideo.src = '';
    viewerImg.src = url;
  } else {
    viewerImg.style.display = 'none';
    viewerVideo.style.display = 'block';
    viewerVideo.src = url;
    viewerVideo.play();
  }

  viewerClose.focus();
}

function closeViewer() {
  viewer.style.display = 'none';
  viewerImg.src = '';
  viewerVideo.pause();
  viewerVideo.src = '';
}

viewerClose.onclick = closeViewer;
viewerClose.onkeydown = function (ev) {
  if (ev.keyCode === 13 || ev.keyCode === 32) {
    ev.preventDefault();
    closeViewer();
  }
};

backBtn.onclick = function () {
  if (historyStack.length) {
    currentPath = '';
    var prev = historyStack.pop();
    navigate(prev);
    historyStack.pop();
  }
};

window.addEventListener('keydown', function (ev) {
  var code = ev.keyCode;

  // Back / Escape
  if (code === 27 || code === 461) {
    ev.preventDefault();
    ev.stopPropagation();
    if (viewer.style.display !== 'none') {
      closeViewer();
    } else if (historyStack.length) {
      backBtn.onclick();
    }
    return;
  }

  // OK / Enter
  if (code === 13) {
    ev.preventDefault();
    ev.stopPropagation();
    var el = findItemEl(document.activeElement);
    if (el) {
      handleItem(el.getAttribute('data-path'), el.getAttribute('data-type'));
    }
    return;
  }

  // D-pad navigation
  if (code >= 37 && code <= 40) {
    ev.preventDefault();
    ev.stopPropagation();
    var items = grid.querySelectorAll('.item');
    if (!items.length) return;
    var focused = document.activeElement;
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i] === focused) { idx = i; break; }
    }
    if (idx < 0) { items[0].focus(); return; }

    var cols = 1;
    if (items.length > 1) {
      var top0 = items[0].getBoundingClientRect().top;
      for (var c = 1; c < items.length; c++) {
        if (items[c].getBoundingClientRect().top !== top0) { cols = c; break; }
      }
      if (cols === 1 && items.length > 1) cols = items.length;
    }

    var next = idx;
    if (code === 37) next = idx - 1;
    else if (code === 39) next = idx + 1;
    else if (code === 38) next = idx - cols;
    else if (code === 40) next = idx + cols;

    if (next >= 0 && next < items.length) {
      items[next].focus();
      items[next].scrollIntoView({ block: 'nearest' });
    }
  }
}, true);

function findUSB() {
  status.textContent = 'Scanning for USB drives...';
  listDir('/tmp/usb', function (err, drives) {
    if (err || !drives || !drives.length) {
      status.textContent = 'No USB drive found. Connect a drive and reopen.';
      return;
    }
    var dirs = drives.filter(function (d) { return d.dir; });
    var pending = dirs.length;
    var found = false;
    if (!pending) {
      status.textContent = 'No USB drive found. Connect a drive and reopen.';
      return;
    }
    for (var i = 0; i < dirs.length; i++) {
      (function (drive) {
        listDir(drive.path, function (err2, parts) {
          pending--;
          if (found) return;
          if (!err2 && parts && parts.length) {
            for (var j = 0; j < parts.length; j++) {
              if (parts[j].dir) {
                listDir(parts[j].path, function (err3, contents) {
                  if (found) return;
                  if (!err3 && contents && contents.length > 0) {
                    found = true;
                    navigate(parts[j].path);
                  }
                });
              }
            }
          }
          if (pending <= 0 && !found) {
            setTimeout(function () {
              if (!found) status.textContent = 'No USB drive found. Connect a drive and reopen.';
            }, 500);
          }
        });
      })(dirs[i]);
    }
  });
}

findUSB();
