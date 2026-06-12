// highlights.js —— 文本高亮与选中笔记（选中文字 → 标记颜色 + 写笔记 → IndexedDB 持久化）

const HighlightStore = {
  _db: null,

  async _open() {
    if (this._db) return this._db;
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open('ai_highlights_' + (CONFIG.token || 'default'), 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('highlights')) {
          var store = db.createObjectStore('highlights', { keyPath: 'id', autoIncrement: true });
          store.createIndex('chapterId', 'chapterId', { unique: false });
        }
      };
      req.onsuccess = function() { HighlightStore._db = req.result; resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  },

  async save(data) {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('highlights', 'readwrite');
      var store = tx.objectStore('highlights');
      var req = data.id ? store.put(data) : store.add(data);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  },

  async getAll() {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('highlights', 'readonly');
      var store = tx.objectStore('highlights');
      var req = store.getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  },

  async remove(id) {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('highlights', 'readwrite');
      var store = tx.objectStore('highlights');
      store.delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  },

  async count() {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('highlights', 'readonly');
      var store = tx.objectStore('highlights');
      var req = store.count();
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  }
};

var Highlights = {
  COLORS: { yellow: '#fef08a', green: '#bbf7d0', blue: '#bfdbfe', pink: '#fecaca', orange: '#fed7aa' },
  _toolbar: null,
  _lastRange: null,

  init() {
    this._createToolbar();
    this._loadAndApply();
    this._setupListeners();
  },

  // ── 创建浮窗工具栏 ──
  _createToolbar() {
    var el = document.createElement('div');
    el.id = 'hl-toolbar';
    el.className = 'hl-toolbar';
    el.innerHTML =
      '<button data-color="yellow" title="黄色高亮">🟡</button>' +
      '<button data-color="green" title="绿色高亮">🟢</button>' +
      '<button data-color="blue" title="蓝色高亮">🔵</button>' +
      '<button data-color="pink" title="粉色高亮">🔴</button>' +
      '<button data-color="orange" title="橙色高亮">🟠</button>' +
      '<span style="width:1px;background:#ddd;align-self:stretch;margin:0 2px;"></span>' +
      '<button data-action="note" title="对选中文字写笔记">📝</button>' +
      '<button data-action="remove" title="取消此处高亮" style="display:none;" id="hl-btn-remove">✕</button>';
    document.body.appendChild(el);

    var self = this;
    el.addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var color = btn.dataset.color;
      var action = btn.dataset.action;
      if (color) {
        self._addHighlight(color);
        self._hideToolbar();
      } else if (action === 'note') {
        self._addNoteToSelection();
      } else if (action === 'remove') {
        self._removeHighlightAtSelection();
        self._hideToolbar();
      }
    });

    // 点击页面其他地方关闭
    document.addEventListener('mousedown', function(e) {
      if (!e.target.closest('#hl-toolbar')) self._hideToolbar();
    });
  },

  // ── 监听文本选择 ──
  _setupListeners() {
    var self = this;
    document.addEventListener('mouseup', function(e) {
      setTimeout(function() { self._onSelection(e); }, 50);
    });
    // 移动端长按
    document.addEventListener('touchend', function(e) {
      setTimeout(function() { self._onSelection(e); }, 100);
    });
  },

  _onSelection(e) {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    // 限制在内容区域（排除输入框、笔记编辑器）
    var node = sel.anchorNode;
    if (!node) return;
    var el = node.nodeType === 3 ? node.parentElement : node;
    if (el.closest('input,textarea,.notes-content,[contenteditable],#hl-toolbar')) return;

    // 必须在可高亮区域内（知识点、复习清单、解析区、代码块）
    var inContent = el.closest('#tab-knowledge,#review-guide-container,.q-text,.explanation,.result,.code-block-wrapper,#strategies-container,#wrongbook-container,#exam-container');
    if (!inContent) return;

    this._lastRange = sel.getRangeAt(0).cloneRange();
    this._showToolbar(e);
  },

  // ── 工具栏定位 ──
  _showToolbar(e) {
    var toolbar = document.getElementById('hl-toolbar');
    if (!toolbar || !this._lastRange) return;

    var rect = this._lastRange.getBoundingClientRect();
    var top = rect.bottom + window.scrollY + 6;
    var left = rect.left + window.scrollX + rect.width / 2;

    // 检测已有高亮
    var existing = this._findHighlightMark(this._lastRange);
    var removeBtn = document.getElementById('hl-btn-remove');
    if (existing) {
      removeBtn.style.display = '';
      removeBtn.dataset.hlId = existing.dataset.hlId;
    } else {
      removeBtn.style.display = 'none';
      removeBtn.dataset.hlId = '';
    }

    // 保持工具栏在视口内
    var tw = toolbar.offsetWidth || 180;
    if (left - tw / 2 < 8) left = tw / 2 + 8;
    if (left + tw / 2 > window.innerWidth - 8) left = window.innerWidth - tw / 2 - 8;
    if (rect.bottom + 50 > window.innerHeight) top = rect.top + window.scrollY - 48;

    toolbar.style.top = top + 'px';
    toolbar.style.left = left + 'px';
    toolbar.style.transform = 'translate(-50%, 0)';
    toolbar.style.display = 'flex';
  },

  _hideToolbar() {
    var toolbar = document.getElementById('hl-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    this._lastRange = null;
  },

  // ── 查找选中位置是否已有高亮 ──
  _findHighlightMark(range) {
    var node = range.startContainer;
    var el = node.nodeType === 3 ? node.parentElement : node;
    return el.closest('mark.ai-hl');
  },

  // ── 添加高亮 ──
  async _addHighlight(color) {
    if (!this._lastRange) return;
    var range = this._lastRange;
    var text = range.toString().trim();
    if (!text) return;

    var serialized = this._serializeRange(range);
    if (!serialized) return;

    // 保存到 DB
    var id = await HighlightStore.save({
      chapterId: serialized.chapterId,
      startOffset: serialized.startOffset,
      endOffset: serialized.endOffset,
      text: text.substring(0, 80),
      color: color,
      note: '',
      createdAt: Date.now(),
    });

    // 应用到 DOM
    this._applyMark(range, id, color);
  },

  // ── 对选中文字写笔记（内联富文本编辑器）──
  async _addNoteToSelection() {
    if (!this._lastRange) return;
    var existing = this._findHighlightMark(this._lastRange);
    if (existing) {
      // 已有高亮 → 直接切换内联编辑器
      this._hideToolbar();
      this._toggleInlineEditor(existing, existing.dataset.hlId);
      return;
    }
    // 先创建黄色高亮，再打开编辑器
    var id = await this._saveHighlight('yellow');
    if (!id) { this._hideToolbar(); return; }
    this._hideToolbar();
    // 找到刚创建的 mark 元素
    setTimeout(() => {
      var mark = document.querySelector('mark[data-hl-id="' + id + '"]');
      if (mark) this._toggleInlineEditor(mark, id);
    }, 100);
  },

  async _saveHighlight(color) {
    if (!this._lastRange) return null;
    var serialized = this._serializeRange(this._lastRange);
    if (!serialized) return null;
    var text = this._lastRange.toString().trim();
    var id = await HighlightStore.save({
      chapterId: serialized.chapterId,
      startOffset: serialized.startOffset,
      endOffset: serialized.endOffset,
      text: text.substring(0, 80),
      color: color,
      note: '',
      createdAt: Date.now(),
    });
    this._applyMark(this._lastRange, id, color);
    return id;
  },

  // ── 创建/切换内联笔记编辑器 ──
  _toggleInlineEditor(mark, hlId) {
    // 如果已有编辑器，关闭它
    var existingEditor = mark._noteEditor;
    if (existingEditor && existingEditor.parentNode) {
      existingEditor.style.display = existingEditor.style.display === 'none' ? '' : 'none';
      if (existingEditor.style.display !== 'none') {
        var contentEl = existingEditor.querySelector('.hl-note-content');
        if (contentEl) setTimeout(function() { contentEl.focus(); }, 50);
      }
      return;
    }

    // 移除页面上其他打开的编辑器
    document.querySelectorAll('.hl-inline-editor').forEach(function(el) { el.remove(); });

    var self = this;
    var noteText = mark.dataset.note || '';

    var editor = document.createElement('div');
    editor.className = 'hl-inline-editor';
    editor.style.cssText = 'display:block;margin:4px 0 8px;padding:6px 8px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.06);max-width:720px;min-width:320px;';

    editor.innerHTML =
      '<div class="notes-toolbar" style="margin-bottom:4px;display:flex;align-items:center;gap:2px;flex-wrap:wrap;">' +
      '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'bold\')" title="加粗"><b>B</b></button>' +
      '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'italic\')" title="斜体"><i>I</i></button>' +
      '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'underline\')" title="下划线"><u>U</u></button>' +
      '<span style="width:1px;background:#ddd;align-self:stretch;margin:0 4px;"></span>' +
      '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'fontSize\',false,\'1\')" title="小号字" style="font-size:10px;">A⁻</button>' +
      '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'fontSize\',false,\'3\')" title="正常字">A</button>' +
      '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'fontSize\',false,\'5\')" title="大号字" style="font-size:14px;">A⁺</button>' +
      '<span style="font-size:0.72em;color:#999;margin-left:4px;white-space:nowrap;">Ctrl+V 贴图</span>' +
      '<button type="button" style="margin-left:auto;background:none;border:none;color:#999;cursor:pointer;font-size:14px;" title="关闭" onclick="var ed=this.closest(\'.hl-inline-editor\');ed.style.display=\'none\';">✕</button>' +
      '</div>' +
      '<div class="hl-note-content notes-content" contenteditable="true" data-placeholder="在这里记笔记…" style="min-height:28px;max-height:200px;overflow-y:auto;padding:4px 6px;border:1px solid #e8ecf0;border-radius:4px;font-size:0.88em;line-height:1.6;">' + noteText + '</div>';

    // 粘贴图片
    editor.querySelector('.hl-note-content').addEventListener('paste', function(e) {
      var items = (e.clipboardData || window.clipboardData).items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') >= 0) {
          e.preventDefault();
          var blob = items[i].getAsFile();
          self._compressAndInsert(blob, this);
          return;
        }
      }
    });

    // 自动保存（input 防抖 + blur/关闭 即存）
    var saveTimer = null;
    var contentEl = editor.querySelector('.hl-note-content');
    var doSave = function() {
      clearTimeout(saveTimer);
      self._saveNoteContent(hlId, contentEl.innerHTML);
      mark.dataset.note = contentEl.innerHTML;
      mark.classList.toggle('ai-hl-has-note', !!contentEl.textContent.trim());
    };
    contentEl.addEventListener('input', function() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 600);
    });
    contentEl.addEventListener('blur', function() {
      doSave(); // 失焦立即保存
    });

    // 插入到 mark 后面
    if (mark.nextSibling) {
      mark.parentNode.insertBefore(editor, mark.nextSibling);
    } else {
      mark.parentNode.appendChild(editor);
    }

    mark._noteEditor = editor;
    if (!noteText) setTimeout(function() { contentEl.focus(); }, 100);

    // ✕ 关闭按钮：先保存再隐藏
    editor.querySelector('button[title="关闭"]').onclick = function() {
      doSave();
      editor.style.display = 'none';
    };

    // 点击编辑器外部关闭（同时保存）
    var closeHandler = function(ev) {
      if (!editor.contains(ev.target) && ev.target !== mark && !mark.contains(ev.target)) {
        doSave();
        editor.style.display = 'none';
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(function() { document.addEventListener('mousedown', closeHandler); }, 100);
  },

  // ── 删除高亮 ──
  async _removeHighlightAtSelection() {
    var existing = this._findHighlightMark(this._lastRange);
    if (!existing) return;
    var hlId = existing.dataset.hlId;
    if (!hlId) return;

    // 从 DB 删除
    await HighlightStore.remove(Number(hlId));
    // 从 DOM 移除 mark 标签（保留文字）
    var parent = existing.parentNode;
    while (existing.firstChild) {
      parent.insertBefore(existing.firstChild, existing);
    }
    parent.removeChild(existing);
    parent.normalize();
  },

  // ── 序列化 Range → 可存储的数据 ──
  _serializeRange(range) {
    // 找到最近的章节容器
    var container = range.commonAncestorContainer;
    var chapterEl = (container.nodeType === 1 ? container : container.parentElement);
    chapterEl = chapterEl.closest('[id^="ch-"],#review-guide-container,.q-text,.explanation,.result');
    if (!chapterEl) return null;

    var chapterId = chapterEl.id || 'root';
    var walker = document.createTreeWalker(chapterEl, NodeFilter.SHOW_TEXT, null, false);
    var currentOffset = 0;
    var startOffset = -1, endOffset = -1;

    while (walker.nextNode()) {
      var node = walker.currentNode;
      var len = node.textContent.length;
      if (startOffset < 0 && node === range.startContainer) {
        startOffset = currentOffset + range.startOffset;
      }
      if (node === range.endContainer) {
        endOffset = currentOffset + range.endOffset;
        break;
      }
      currentOffset += len;
    }

    if (startOffset < 0 || endOffset < 0) return null;
    return { chapterId: chapterId, startOffset: startOffset, endOffset: endOffset };
  },

  // ── 反序列化 → DOM Range（含文本锚点模糊修正）──
  _deserializeRange(data) {
    var chapterEl = document.getElementById(data.chapterId);
    if (!chapterEl) chapterEl = document.querySelector('[id="' + data.chapterId + '"]');
    if (!chapterEl) return null;

    // 先尝试精确 offset
    var makeRange = function(startOff, endOff) {
      var walker = document.createTreeWalker(chapterEl, NodeFilter.SHOW_TEXT, null, false);
      var cur = 0, sn = null, so = 0, en = null, eo = 0;
      while (walker.nextNode()) {
        var node = walker.currentNode;
        var len = node.textContent.length;
        if (!sn && cur + len > startOff) { sn = node; so = startOff - cur; }
        if (cur + len >= endOff) { en = node; eo = endOff - cur; break; }
        cur += len;
      }
      if (!sn || !en) return null;
      try {
        var r = document.createRange();
        r.setStart(sn, Math.max(0, so));
        r.setEnd(en, Math.min(en.textContent.length, eo));
        return r;
      } catch(e) { return null; }
    };

    // 提取章节文本用于搜索
    var getChapterText = function() {
      var w2 = document.createTreeWalker(chapterEl, NodeFilter.SHOW_TEXT, null, false);
      var parts = [];
      while (w2.nextNode()) parts.push(w2.currentNode.textContent);
      return parts.join('');
    };

    var anchorText = (data.text || '').replace(/\s+/g, '').substring(0, 30);
    if (!anchorText || anchorText.length < 3) return makeRange(data.startOffset, data.endOffset);

    // 1. 精确 offset 尝试
    var range = makeRange(data.startOffset, data.endOffset);
    if (range) {
      var rangeText = range.toString().replace(/\s+/g, '');
      if (rangeText.indexOf(anchorText) >= 0 || anchorText.indexOf(rangeText) >= 0) {
        return range; // 文本匹配，精确命中
      }
    }

    // 2. 模糊搜索：在 ±200 字符窗口内搜索锚文本
    var fullText = getChapterText();
    var searchStart = Math.max(0, data.startOffset - 200);
    var searchEnd = Math.min(fullText.length, data.endOffset + 200);
    var searchRegion = fullText.substring(searchStart, searchEnd);
    var searchRegionClean = searchRegion.replace(/\s+/g, '');

    var bestIdx = searchRegionClean.indexOf(anchorText);
    if (bestIdx < 0) {
      // 退而求其次：找部分匹配
      var halfLen = Math.floor(anchorText.length / 2);
      for (var tryLen = anchorText.length - 1; tryLen >= Math.max(3, halfLen); tryLen--) {
        var sub = anchorText.substring(0, tryLen);
        bestIdx = searchRegionClean.indexOf(sub);
        if (bestIdx >= 0) break;
      }
    }

    if (bestIdx >= 0) {
      // 将 clean 索引映射回原始文本偏移
      var mappedStart = searchStart, mappedClean = 0;
      for (var ci = 0; ci < searchRegion.length && mappedClean < bestIdx; ci++) {
        if (searchRegion[ci].match(/\s/)) continue; // 跳过空白
        mappedStart++; mappedClean++;
      }
      if (mappedStart < searchStart) mappedStart = searchStart;
      var newStart = mappedStart;
      var newEnd = newStart + (data.endOffset - data.startOffset);
      if (newEnd > fullText.length) newEnd = fullText.length;
      return makeRange(newStart, newEnd);
    }

    // 3. 兜底：用原始 offset（可能不准但至少尝试）
    return makeRange(data.startOffset, data.endOffset);
  },

  // ── 给 DOM Range 包裹 mark 标签 ──
  _applyMark(range, hlId, color) {
    var self = this;
    try {
      var mark = document.createElement('mark');
      mark.className = 'ai-hl ai-hl-' + color;
      mark.dataset.hlId = hlId;
      mark.style.cursor = 'pointer';
      mark.title = '点击查看/编辑笔记';
      mark.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        self._toggleInlineEditor(mark, hlId);
      };
      range.surroundContents(mark);
    } catch(e) {
      // surroundContents 跨元素时失败，用 execCommand 兜底
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('hiliteColor', false, this.COLORS[color] || '#fef08a');
      // 给生成的 mark 加属性
      var marks = document.querySelectorAll('mark[style]');
      for (var i = marks.length - 1; i >= 0; i--) {
        var m = marks[i];
        if (!m.dataset.hlId && m.style.backgroundColor) {
          m.classList.add('ai-hl', 'ai-hl-' + color);
          m.dataset.hlId = hlId;
          m.style.cursor = 'pointer';
          m.title = '点击查看/编辑笔记';
          m.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            self._toggleInlineEditor(m, hlId);
          };
        }
      }
    }
  },

  // ── 加载所有高亮并应用到 DOM ──
  async _loadAndApply() {
    try {
      var highlights = await HighlightStore.getAll();
      if (highlights.length === 0) return;

      // 按 offset 降序排列，从后往前应用，避免 offset 偏移
      var byChapter = {};
      for (var i = 0; i < highlights.length; i++) {
        var h = highlights[i];
        if (!byChapter[h.chapterId]) byChapter[h.chapterId] = [];
        byChapter[h.chapterId].push(h);
      }
      for (var chId in byChapter) {
        byChapter[chId].sort(function(a, b) { return b.startOffset - a.startOffset; });
      }

      for (var chId2 in byChapter) {
        var list = byChapter[chId2];
        for (var j = 0; j < list.length; j++) {
          var item = list[j];
          var range = this._deserializeRange(item);
          if (range) {
            this._applyMark(range, item.id, item.color || 'yellow');
            // 有笔记的加 data-note、样式、点击指示
            if (item.note) {
              var marks = document.querySelectorAll('mark[data-hl-id="' + item.id + '"]');
              for (var k = 0; k < marks.length; k++) {
                marks[k].dataset.note = item.note;
                marks[k].classList.add('ai-hl-has-note');
                marks[k].style.cursor = 'pointer';
                marks[k].title = '📝 点击查看笔记';
              }
            }
          }
        }
      }

      // 高亮点击事件只绑一次
      if (!this._clickBound) {
        this._clickBound = true;
        this._attachHighlightClick();
      }
    } catch(e) {
      // IndexedDB 不可用，忽略
    }
  },

  // ── 点击高亮 → 切换内联笔记编辑器 ──
  _attachHighlightClick() {
    var self = this;
    document.addEventListener('click', function(e) {
      var mark = e.target.closest('mark.ai-hl');
      if (!mark) return;
      var hlId = mark.dataset.hlId;
      if (!hlId) return;
      e.preventDefault();
      e.stopPropagation();
      self._toggleInlineEditor(mark, hlId);
    });
  },

  // ── 保存笔记内容到 IndexedDB ──
  async _saveNoteContent(hlId, html) {
    var db = await HighlightStore._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('highlights', 'readwrite');
      var store = tx.objectStore('highlights');
      var getReq = store.get(Number(hlId));
      getReq.onsuccess = function() {
        var record = getReq.result;
        if (record) {
          record.note = html;
          store.put(record);
        }
      };
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  },

  // ── 图片压缩后插入 contenteditable ──
  _compressAndInsert(blob, targetEl) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var maxW = 600;
        var scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        var imgEl = document.createElement('img');
        imgEl.src = dataUrl;
        imgEl.width = canvas.width;
        imgEl.height = canvas.height;
        imgEl.style.cssText = 'display:inline-block;max-width:100%;border-radius:4px;margin:4px 0;cursor:nwse-resize;';
        // 使其在 contenteditable 中可拖拽缩放
        imgEl.setAttribute('draggable', 'false');
        targetEl.appendChild(imgEl);
        targetEl.focus();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(blob);
  },
};
