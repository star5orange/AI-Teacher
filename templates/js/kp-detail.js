// kp-detail.js —— 知识点详情面板（可视化图谱配套文字说明）

var KPDetail = {
  _panel: null,
  _overlay: null,
  _currentKpId: null,

  /** 初始化：创建面板 DOM */
  init() {
    // 遮罩层
    var overlay = document.createElement('div');
    overlay.id = 'kp-overlay';
    overlay.className = 'kp-overlay';
    overlay.onclick = function() { KPDetail.close(); };
    document.body.appendChild(overlay);
    this._overlay = overlay;

    // 面板
    var panel = document.createElement('div');
    panel.id = 'kp-panel';
    panel.className = 'kp-panel';
    panel.innerHTML =
      '<div class="kp-panel-header">' +
        '<span id="kp-panel-title">知识点详情</span>' +
        '<button class="kp-panel-close" onclick="KPDetail.close()">✕</button>' +
      '</div>' +
      '<div class="kp-panel-body" id="kp-panel-body"></div>' +
      '<div class="kp-panel-footer">' +
        '<button id="kp-btn-quiz" class="btn btn-primary" style="flex:1;">去刷题</button>' +
        '<button id="kp-btn-note" class="btn btn-outline" style="flex:1;">查看笔记</button>' +
      '</div>';
    document.body.appendChild(panel);
    this._panel = panel;

    // 绑定事件
    var self = this;
    document.getElementById('kp-btn-quiz').onclick = function() { self._goQuiz(); };
    document.getElementById('kp-btn-note').onclick = function() { self._goNote(); };

    // ESC 关闭
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') KPDetail.close();
    });
  },

  /** 展开面板，显示指定知识点 */
  show(kpId, kpName, chapterIdx) {
    if (!this._panel) this.init();

    this._currentKpId = kpId;
    var body = document.getElementById('kp-panel-body');
    document.getElementById('kp-panel-title').textContent = kpName || kpId;

    var kp = this._findInTree(kpId);
    body.innerHTML = this._buildPanel(kp, kpId, chapterIdx);

    // 显示
    this._overlay.style.display = 'block';
    this._panel.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // 滚动到顶部
    body.scrollTop = 0;

    // 更新笔记按钮
    var noteBtn = document.getElementById('kp-btn-note');
    if (noteBtn && chapterIdx !== undefined) {
      noteBtn.style.display = '';
      noteBtn.textContent = '查看笔记';
    } else {
      noteBtn.style.display = 'none';
    }
  },

  close() {
    if (this._overlay) this._overlay.style.display = 'none';
    if (this._panel) this._panel.style.display = 'none';
    document.body.style.overflow = '';
    this._currentKpId = null;
  },

  // ── 从 KP_DETAILS 取数据 ──
  _getData(kpId) {
    var details = KP_DETAILS || {};
    return details[kpId] || null;
  },

  // ── 在 KNOWLEDGE_TREE 中查找 KP ──
  _findInTree(kpId) {
    var chapters = KNOWLEDGE_TREE.chapters || [];
    for (var ci = 0; ci < chapters.length; ci++) {
      var sections = chapters[ci].sections || [];
      for (var si = 0; si < sections.length; si++) {
        if (sections[si].id === kpId) return sections[si];
      }
    }
    return null;
  },

  // ── 构建详情 HTML（有 LLM 数据或兜底数据统一走这里） ──
  _build(data) {
    var h = '';

    // ① 模块/知识点简介
    h += '<div class="kp-section kp-section-intro">';
    h += '<div class="kp-section-label">① 模块 / 知识点简介</div>';
    h += '<div class="kp-section-content">' + this._e(data.intro || '暂无简介') + '</div>';
    h += '</div>';

    // ② 前置依赖
    var prereqs = data.prerequisites || [];
    h += '<div class="kp-section kp-section-prereq">';
    h += '<div class="kp-section-label">② 前置依赖</div>';
    if (prereqs.length > 0) {
      h += '<div class="kp-tags">';
      for (var i = 0; i < prereqs.length; i++) {
        h += '<span class="kp-tag kp-tag-prereq" onclick="KPDetail._navigateTo(\'' + this._e(prereqs[i]) + '\')">' + this._e(prereqs[i]) + '</span>';
      }
      h += '</div>';
    } else {
      h += '<div class="kp-section-content" style="color:#999;">无</div>';
    }
    h += '</div>';

    // ③ 学习价值
    h += '<div class="kp-section kp-section-value">';
    h += '<div class="kp-section-label">③ 学习价值</div>';
    h += '<div class="kp-section-content">' + this._e(data.value || '暂无说明') + '</div>';
    h += '</div>';

    // ④ 后续铺垫
    var supports = data.supports || [];
    h += '<div class="kp-section kp-section-supports">';
    h += '<div class="kp-section-label">④ 后续铺垫</div>';
    if (supports.length > 0) {
      h += '<div class="kp-tags">';
      for (var j = 0; j < supports.length; j++) {
        h += '<span class="kp-tag kp-tag-supports" onclick="KPDetail._navigateTo(\'' + this._e(supports[j]) + '\')">' + this._e(supports[j]) + '</span>';
      }
      h += '</div>';
    } else {
      h += '<div class="kp-section-content" style="color:#999;">无</div>';
    }
    h += '</div>';

    // ⑤ 补充要点
    var supp = data.supplement || {};
    var pitfalls = supp.pitfalls || (data._pitfalls || []);
    var keyPoints = supp.key_points || [];
    var examTips = supp.exam_tips || '';
    var hasSupp = examTips || pitfalls.length > 0 || keyPoints.length > 0;
    h += '<div class="kp-section kp-section-supplement">';
    h += '<div class="kp-section-label">⑤ 补充要点</div>';
    if (hasSupp) {
      if (examTips) h += '<div class="kp-supp-item"><strong>考点：</strong>' + this._e(examTips) + '</div>';
      if (pitfalls.length > 0) {
        h += '<div class="kp-supp-item"><strong>易错：</strong><ul style="margin:4px 0 0 16px;">';
        for (var k = 0; k < pitfalls.length; k++) h += '<li>' + this._e(pitfalls[k]) + '</li>';
        h += '</ul></div>';
      }
      if (keyPoints.length > 0) {
        h += '<div class="kp-supp-item"><strong>要点：</strong><ul style="margin:4px 0 0 16px;">';
        for (var m = 0; m < keyPoints.length; m++) h += '<li><code style="font-size:0.9em;">' + this._e(keyPoints[m]) + '</code></li>';
        h += '</ul></div>';
      }
    } else {
      h += '<div class="kp-section-content" style="color:#999;">无</div>';
    }
    h += '</div>';

    return h;
  },

  // ── 统一入口：优先 LLM 数据，否则用现有数据拼 ──
  _buildPanel(kp, kpId, chapterIdx) {
    var data = this._getData(kpId);
    if (data) {
      // LLM 数据 + 兜底补充
      if (!data.intro && kp) data.intro = kp.description || '';
      if (!data.value && kp) {
        var imp = kp.importance || '常规';
        var impMap = { '必考': '高频考点，考试必出，必须熟练掌握', '高频': '常见考点，需重点理解并能应用', '常规': '基础知识点，理解即可' };
        data.value = '重要程度：' + imp + ' —— ' + (impMap[imp] || '');
      }
      return this._build(data);
    }
    // 无 LLM 数据，从现有数据拼
    if (!kp) return '<div style="color:var(--ink-light);text-align:center;padding:40px;">未找到该知识点</div>';
    var kpName = kp.title || kp.name || kpId;
    var imp = kp.importance || '常规';
    var impMap = { '必考': '高频考点，考试必出，必须熟练掌握', '高频': '常见考点，需重点理解并能应用', '常规': '基础知识点，理解即可' };
    var built = {
      intro: kp.description || '',
      prerequisites: this._findRelated(kpName, 'to'),
      value: '重要程度：' + imp + ' —— ' + (impMap[imp] || ''),
      supports: this._findRelated(kpName, 'from'),
      supplement: {},
      _pitfalls: this._findPitfalls(kp),
    };
    return this._build(built);
  },

  /** 从 kp_connections 查找关联知识点 */
  _findRelated(kpName, direction) {
    var conns = REVIEW_GUIDE.kp_connections || [];
    var results = [];
    for (var i = 0; i < conns.length; i++) {
      var c = conns[i];
      if (direction === 'to' && (c.to_kp === kpName || c.to_kp.indexOf(kpName) >= 0 || kpName.indexOf(c.to_kp) >= 0)) {
        if (results.indexOf(c.from_kp) < 0) results.push(c.from_kp);
      }
      if (direction === 'from' && (c.from_kp === kpName || c.from_kp.indexOf(kpName) >= 0 || kpName.indexOf(c.from_kp) >= 0)) {
        if (results.indexOf(c.to_kp) < 0) results.push(c.to_kp);
      }
    }
    return results;
  },

  /** 从 REVIEW_GUIDE 取章节易错点 */
  _findPitfalls(kp) {
    var chapters = REVIEW_GUIDE.chapters || [];
    for (var i = 0; i < chapters.length; i++) {
      var ch = chapters[i];
      if (!ch.common_mistakes || ch.common_mistakes.length === 0) continue;
      // 检查该 KP 是否在本章
      var secs = (KNOWLEDGE_TREE.chapters || [])[i];
      if (!secs) continue;
      var kpName = (kp.title || kp.name || '').toLowerCase();
      var found = false;
      for (var j = 0; j < (secs.sections || []).length; j++) {
        var sn = (secs.sections[j].title || secs.sections[j].name || '').toLowerCase();
        if (sn === kpName || sn.indexOf(kpName) >= 0 || kpName.indexOf(sn) >= 0) { found = true; break; }
      }
      if (found) return ch.common_mistakes;
    }
    return [];
  },

  // ── 跳转到指定 KP 详情 ──
  _navigateTo(name) {
    // 按名称在知识树中查找
    var chapters = KNOWLEDGE_TREE.chapters || [];
    for (var ci = 0; ci < chapters.length; ci++) {
      var sections = chapters[ci].sections || [];
      for (var si = 0; si < sections.length; si++) {
        var sec = sections[si];
        var kpName = sec.title || sec.name || '';
        if (kpName === name || kpName.indexOf(name) >= 0 || name.indexOf(kpName) >= 0) {
          this.show(sec.id, kpName, ci);
          return;
        }
      }
    }
    // 找不到的话用 name 做模糊搜索
    var found = KnowledgeTree._findKP(name, '');
    if (found) {
      this.show(found.kpId, found.kpTitle, found.chapterIdx);
    }
  },

  // ── 去刷题 ──
  _goQuiz() {
    if (!this._currentKpId) return;
    this.close();
    KnowledgeTree.onClick(this._currentKpId);
  },

  // ── 查看笔记 ──
  _goNote() {
    this.close();
    // 切换到笔记本 tab
    var tabs = document.querySelectorAll('nav.tabs button');
    for (var t = 0; t < tabs.length; t++) { tabs[t].classList.remove('active'); }
    var nbTab = document.querySelector('nav.tabs button[data-tab="notebook"]');
    if (nbTab) nbTab.classList.add('active');
    var contents = document.querySelectorAll('.tab-content');
    for (var c = 0; c < contents.length; c++) { contents[c].style.display = 'none'; }
    var nbEl = document.getElementById('tab-notebook');
    if (nbEl) nbEl.style.display = 'block';
    if (typeof NotesUI !== 'undefined') NotesUI.renderNotebook();
  },

  _e(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
