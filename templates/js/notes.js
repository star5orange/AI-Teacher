// notes.js —— 笔记系统（IndexedDB + 富文本编辑 + 图片粘贴 + 笔记本 Tab）

const NotesStore = {
  DB_NAME: 'ai_notes_' + (CONFIG.token || 'default'),
  DB_VERSION: 1,
  STORE_NAME: 'notes',
  _db: null,

  async _open() {
    if (this._db) return this._db;
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(NotesStore.DB_NAME, NotesStore.DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(NotesStore.STORE_NAME)) {
          var store = db.createObjectStore(NotesStore.STORE_NAME, { keyPath: 'questionId' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('kp', 'kp', { unique: false });
        }
      };
      req.onsuccess = function() {
        NotesStore._db = req.result;
        resolve(NotesStore._db);
      };
      req.onerror = function() { reject(req.error); };
    });
  },

  /** 保存或更新笔记 */
  async save(questionId, content, questionText, kp) {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(NotesStore.STORE_NAME, 'readwrite');
      var store = tx.objectStore(NotesStore.STORE_NAME);
      var now = Date.now();
      var getReq = store.get(questionId);
      getReq.onsuccess = function() {
        var existing = getReq.result;
        var record = existing || { questionId: questionId, createdAt: now };
        record.content = content;
        record.questionText = questionText || (existing ? existing.questionText : '');
        record.kp = kp || (existing ? existing.kp : '');
        record.updatedAt = now;
        store.put(record);
      };
      getReq.onerror = function() { reject(getReq.error); };
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  },

  /** 获取单条笔记 */
  async get(questionId) {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(NotesStore.STORE_NAME, 'readonly');
      var store = tx.objectStore(NotesStore.STORE_NAME);
      var req = store.get(questionId);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  },

  /** 获取全部笔记（按更新时间倒序） */
  async getAll() {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(NotesStore.STORE_NAME, 'readonly');
      var store = tx.objectStore(NotesStore.STORE_NAME);
      var req = store.getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) { return b.updatedAt - a.updatedAt; });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  },

  /** 删除单条笔记 */
  async remove(questionId) {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(NotesStore.STORE_NAME, 'readwrite');
      var store = tx.objectStore(NotesStore.STORE_NAME);
      store.delete(questionId);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  },

  /** 笔记总数 */
  async count() {
    var db = await this._open();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(NotesStore.STORE_NAME, 'readonly');
      var store = tx.objectStore(NotesStore.STORE_NAME);
      var req = store.count();
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  }
};


const NotesUI = {
  _saveTimers: {},

  /** 展开/收起笔记编辑器 */
  async toggle(questionId) {
    var editor = document.getElementById('notes-editor-' + questionId);
    var toggleBtn = document.getElementById('notes-toggle-' + questionId);
    if (!editor || !toggleBtn) return;

    var isVisible = editor.style.display !== 'none';
    if (isVisible) {
      // 收起前先保存
      this.save(questionId);
      editor.style.display = 'none';
      toggleBtn.innerHTML = '&#x1F4DD; 笔记';
    } else {
      editor.style.display = 'block';
      toggleBtn.innerHTML = '&#x1F4DD; 笔记 &#x25B2;';
      // 加载已有笔记
      var note = await NotesStore.get(questionId);
      var contentEl = document.getElementById('notes-content-' + questionId);
      if (note && contentEl) {
        contentEl.innerHTML = note.content;
      }
      // 聚焦
      if (contentEl) setTimeout(function() { contentEl.focus(); }, 100);
    }
  },

  /** 处理图片粘贴 */
  handlePaste(e, questionId) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.type && item.type.indexOf('image/') === 0) {
        e.preventDefault();
        var blob = item.getAsFile();
        // 压缩大图：超过 2MB 的图片缩小后再转 base64
        this._compressAndInsert(blob, questionId);
        return;
      }
    }
  },

  /** 压缩图片并插入编辑器 */
  _compressAndInsert(blob, questionId) {
    var self = this;
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var w = img.width;
        var h = img.height;
        var maxW = 800; // 笔记图片最大宽度
        if (w > maxW) {
          h = Math.round(h * maxW / w);
          w = maxW;
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.75);

        // 插入图片
        var imgEl = document.createElement('img');
        imgEl.src = dataUrl;
        imgEl.style.maxWidth = '100%';
        imgEl.style.borderRadius = '4px';
        imgEl.style.margin = '4px 0';

        var contentEl = document.getElementById('notes-content-' + questionId);
        if (contentEl) {
          contentEl.focus();
          var sel = window.getSelection();
          if (sel.rangeCount) {
            var range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(imgEl);
            // 在图片后插入一个换行，方便继续输入
            var br = document.createElement('br');
            range.setStartAfter(imgEl);
            range.collapse(true);
            range.insertNode(br);
            range.setStartAfter(br);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } else {
            contentEl.appendChild(imgEl);
            contentEl.appendChild(document.createElement('br'));
          }
        }
        // 自动保存
        self._autoSave(questionId);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(blob);
  },

  /** 防抖自动保存 */
  _autoSave(questionId) {
    if (this._saveTimers[questionId]) clearTimeout(this._saveTimers[questionId]);
    this._saveTimers[questionId] = setTimeout(this.save.bind(this, questionId), 2000);
  },

  /** 手动保存 */
  async save(noteId) {
    var contentEl = document.getElementById('notes-content-' + noteId);
    if (!contentEl) return;

    var content = contentEl.innerHTML.trim();

    // 查找题目/章节信息
    var questionText = '';
    var kp = '';

    if (noteId.indexOf('ch_') === 0) {
      // 章节笔记：从 REVIEW_GUIDE 获取章节信息
      var chapterIdx = parseInt(noteId.replace('ch_', ''));
      var chapters = REVIEW_GUIDE.chapters || [];
      if (!isNaN(chapterIdx) && chapterIdx < chapters.length) {
        var ch = chapters[chapterIdx];
        questionText = '📖 ' + (ch.title || '第' + (chapterIdx + 1) + '章');
        kp = ch.title || '';
      }
    } else {
      // 题目笔记：从 QUESTION_BANK 获取题目信息
      var q = this._findQuestion(noteId);
      questionText = q ? (q.question || '').substring(0, 100) : '';
      kp = q ? QuizEngine._getKPName(q) : '';
    }

    if (!content || content === '<br>' || content === '<br><br>') {
      // 空内容 → 删除笔记
      await NotesStore.remove(noteId);
    } else {
      await NotesStore.save(noteId, content, questionText, kp);
    }

    this._updateBadges();

    // 显示保存状态
    var statusEl = document.getElementById('notes-status-' + noteId);
    if (statusEl) {
      statusEl.textContent = '✓ 已保存';
      statusEl.style.color = '#22c55e';
      setTimeout(function() {
        if (statusEl) { statusEl.textContent = ''; }
      }, 2000);
    }
  },

  /** 根据 questionId 查找题目对象 */
  _findQuestion(questionId) {
    // 先尝试直接 ID 匹配
    for (var i = 0; i < QUESTION_BANK.length; i++) {
      if (QUESTION_BANK[i].id === questionId) return QUESTION_BANK[i];
    }
    // 尝试 q_N 格式
    var idx = parseInt(questionId.replace('q_', ''));
    if (!isNaN(idx) && QuizEngine.filteredQuestions && idx < QuizEngine.filteredQuestions.length) {
      return QuizEngine.filteredQuestions[idx];
    }
    return null;
  },

  /** 异步加载笔记内容到已渲染的编辑器 */
  async loadNoteForQuestion(questionId) {
    var contentEl = document.getElementById('notes-content-' + questionId);
    if (!contentEl) return;
    var note = await NotesStore.get(questionId);
    if (note && note.content) {
      contentEl.innerHTML = note.content;
    }
    // 更新笔记按钮状态
    if (note && note.content) {
      var toggleBtn = document.getElementById('notes-toggle-' + questionId);
      if (toggleBtn) {
        toggleBtn.innerHTML = '&#x1F4DD; 有笔记';
        toggleBtn.style.color = '#1e40af';
        toggleBtn.style.fontWeight = '700';
      }
    }
  },

  /** 加载所有章节笔记状态（页面初始化时调用，更新按钮文字） */
  async loadAllChapterNotes() {
    var chapters = REVIEW_GUIDE.chapters || [];
    for (var i = 0; i < chapters.length; i++) {
      var noteId = 'ch_' + i;
      try {
        var note = await NotesStore.get(noteId);
        var toggleBtn = document.getElementById('notes-toggle-' + noteId);
        if (note && note.content && toggleBtn) {
          toggleBtn.innerHTML = '📝 有笔记';
          toggleBtn.style.color = '#1e40af';
          toggleBtn.style.fontWeight = '700';
        }
      } catch(e) { /* ignore */ }
    }
  },

  /** 更新笔记计数徽标 */
  async _updateBadges() {
    try {
      var count = await NotesStore.count();
      var el = document.getElementById('note-count');
      if (el) {
        el.textContent = count > 0 ? '(' + count + ')' : '';
      }
    } catch(e) { /* ignore */ }
  },

  /** ── 笔记本 Tab 渲染 ── */
  async renderNotebook() {
    var container = document.getElementById('notebook-container');
    if (!container) return;

    var notes;
    try {
      notes = await NotesStore.getAll();
    } catch(e) {
      container.innerHTML = '<div class="notebook-empty">笔记功能加载失败，请检查浏览器是否支持 IndexedDB</div>';
      return;
    }

    if (notes.length === 0) {
      container.innerHTML = '<div class="notebook-empty">'
        + '<div style="font-size:3em;margin-bottom:12px;">📒</div>'
        + '<div>还没有笔记</div>'
        + '<div style="font-size:0.82em;color:var(--ink-light);margin-top:6px;">刷题提交答案后或复习清单章节底部，点击「📝 笔记」开始记录</div>'
        + '<div style="font-size:0.78em;color:#999;margin-top:4px;">支持 Ctrl+V 粘贴截图</div>'
        + '</div>';
      return;
    }

    // 按知识点分组
    var groups = {};
    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      var kp = note.kp || '其他';
      if (!groups[kp]) groups[kp] = [];
      groups[kp].push(note);
    }

    var html = '<p style="color:var(--ink-light);font-size:0.9em;margin-bottom:12px;">共 <strong>' + notes.length + '</strong> 条笔记，按知识点分组：</p>';
    var kps = Object.keys(groups);
    for (var gi = 0; gi < kps.length; gi++) {
      var kp = kps[gi];
      var items = groups[kp];
      html += '<h3 style="font-size:1em;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--divider);">' + this._e(kp) + '（' + items.length + '条）</h3>';
      for (var ni = 0; ni < items.length; ni++) {
        var note = items[ni];
        var dateStr = '';
        if (note.updatedAt) {
          var d = new Date(note.updatedAt);
          dateStr = d.getMonth() + 1 + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
        }
        var preview = note.questionText || '(未知题目)';
        // 截断过长的题目文本
        if (preview.length > 80) preview = preview.substring(0, 80) + '...';

        var isChapterNote = note.questionId.indexOf('ch_') === 0;

        html += '<div class="note-card">';
        html += '<div class="note-card-header">';
        if (isChapterNote) {
          var chIdx = note.questionId.replace('ch_', '');
          html += '<span class="note-question-text" onclick="NotesUI._jumpToChapter(' + chIdx + ')" title="点击跳转到该章节">' + this._e(preview) + '</span>';
        } else {
          html += '<span class="note-question-text" onclick="NotesUI._jumpToQuestion(\'' + note.questionId + '\')" title="点击跳转到该题目">' + this._e(preview) + '</span>';
        }
        html += '<span class="note-date">' + dateStr + '</span>';
        html += '</div>';
        html += '<div class="note-card-content">' + note.content + '</div>';
        html += '<div class="note-card-actions">';
        if (isChapterNote) {
          var chIdx2 = note.questionId.replace('ch_', '');
          html += '<button class="btn btn-outline btn-sm" onclick="NotesUI._jumpToChapter(' + chIdx2 + ')">跳转到章节</button>';
        } else {
          html += '<button class="btn btn-outline btn-sm" onclick="NotesUI._jumpToQuestion(\'' + note.questionId + '\')">跳转到题目</button>';
        }
        html += '<button class="btn btn-outline btn-sm" style="color:var(--wrong);border-color:var(--wrong);" onclick="NotesUI.deleteNote(\'' + note.questionId + '\')">删除</button>';
        html += '</div>';
        html += '</div>';
      }
    }
    container.innerHTML = html;
  },

  /** 跳转到对应题目 */
  _jumpToQuestion(questionId) {
    // 在 QUESTION_BANK 中查找
    var idx = -1;
    for (var i = 0; i < QUESTION_BANK.length; i++) {
      if (QUESTION_BANK[i].id === questionId) { idx = i; break; }
    }
    if (idx < 0) {
      // 尝试 q_N 格式
      var n = parseInt(questionId.replace('q_', ''));
      if (!isNaN(n) && n >= 0 && n < QUESTION_BANK.length) idx = n;
    }
    if (idx < 0) { alert('找不到对应题目'); return; }

    // 切换题库列表（只包含该题）
    QuizEngine.filteredQuestions = [QUESTION_BANK[idx]];
    QuizEngine.currentIndex = 0;
    QuizEngine.renderCurrent();
    QuizEngine.renderQuestionNav();

    // 切换到刷题 Tab
    var tabs = document.querySelectorAll('nav.tabs button');
    for (var t = 0; t < tabs.length; t++) { tabs[t].classList.remove('active'); }
    var quizTab = document.querySelector('nav.tabs button[data-tab="quiz"]');
    if (quizTab) quizTab.classList.add('active');
    var contents = document.querySelectorAll('.tab-content');
    for (var c = 0; c < contents.length; c++) { contents[c].style.display = 'none'; }
    var quizEl = document.getElementById('tab-quiz');
    if (quizEl) quizEl.style.display = 'block';

    // 滚动到题目
    var card = document.getElementById('card-' + questionId);
    if (card) {
      setTimeout(function() { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    }
  },

  /** 跳转到对应章节 */
  _jumpToChapter(chapterIdx) {
    // 切换到知识点 Tab
    var tabs = document.querySelectorAll('nav.tabs button');
    for (var t = 0; t < tabs.length; t++) { tabs[t].classList.remove('active'); }
    var knowledgeTab = document.querySelector('nav.tabs button[data-tab="knowledge"]');
    if (knowledgeTab) knowledgeTab.classList.add('active');
    var contents = document.querySelectorAll('.tab-content');
    for (var c = 0; c < contents.length; c++) { contents[c].style.display = 'none'; }
    var knowledgeEl = document.getElementById('tab-knowledge');
    if (knowledgeEl) knowledgeEl.style.display = 'block';

    // 滚动到指定章节
    var target = document.getElementById('ch-' + chapterIdx);
    if (target) {
      setTimeout(function() { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
    }
  },

  /** 删除笔记 */
  async deleteNote(questionId) {
    if (!confirm('确定删除这条笔记？')) return;
    await NotesStore.remove(questionId);
    await this._updateBadges();
    await this.renderNotebook();
  },

  /** HTML 转义 */
  _e(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};


// ── 全局事件：粘贴图片监听 ──
document.addEventListener('paste', function(e) {
  var notesContent = e.target.closest('.notes-content');
  if (!notesContent) return;
  var questionId = notesContent.getAttribute('data-qid');
  if (questionId) {
    NotesUI.handlePaste(e, questionId);
  }
});

// ── 全局事件：输入自动保存 ──
document.addEventListener('input', function(e) {
  var notesContent = e.target.closest('.notes-content');
  if (!notesContent) return;
  var questionId = notesContent.getAttribute('data-qid');
  if (questionId) {
    NotesUI._autoSave(questionId);
  }
});
