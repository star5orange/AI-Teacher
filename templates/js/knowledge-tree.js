// knowledge-tree.js —— 知识树渲染 + 复习清单 + 课程导学 + 章节索引 + 知识点关系图

const KnowledgeTree = {
  init() {
    this.renderHighFreqSummary();
    this.renderReviewGuide();
    this.render();
    this._populateFloatingChapters();
  },

  // ── 悬浮菜单章节跳转 ──
  _populateFloatingChapters() {
    const container = document.getElementById('floating-chapters');
    if (!container) return;
    const chapters = REVIEW_GUIDE.chapters || [];
    if (chapters.length === 0) { container.style.display = 'none'; return; }
    let h = '<div style="font-size:0.75em;color:#999;padding:4px 16px 0;border-top:1px solid var(--card-border);margin-top:4px;">章节跳转</div>';
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const title = (ch.title || '').substring(0, 14);
      h += '<a onclick="KnowledgeTree._jumpToChapter(' + i + ');toggleFloatingMenu()" style="font-size:0.82em;">' + (i + 1) + '. ' + this._e(title) + '</a>';
    }
    container.innerHTML = h;
  },

  _jumpToChapter(index) {
    document.querySelectorAll('nav.tabs button').forEach(function(b) { b.classList.remove('active'); });
    var knowledgeTab = document.querySelector('nav.tabs button[data-tab="knowledge"]');
    if (knowledgeTab) knowledgeTab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(function(el) { el.style.display = 'none'; });
    var tabEl = document.getElementById('tab-knowledge');
    if (tabEl) tabEl.style.display = 'block';
    var target = document.getElementById('ch-' + index);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _renderCourseIntro() {
    const intro = REVIEW_GUIDE.course_intro;
    if (!intro) return '';
    let h = '<div class="course-intro-card"><h3>📚 课程导学</h3>';
    if (intro.why_learn) h += '<div class="intro-section"><span class="intro-label">为什么学这门课：</span>' + this._e(intro.why_learn) + '</div>';
    if (intro.what_you_gain && intro.what_you_gain.length) {
      h += '<div class="intro-section"><span class="intro-label">学完你将会：</span><ul>';
      for (const item of intro.what_you_gain) h += '<li>' + this._e(item) + '</li>';
      h += '</ul></div>';
    }
    if (intro.exam_style) h += '<div class="intro-section"><span class="intro-label">考试形式：</span>' + this._e(intro.exam_style) + '</div>';
    h += '</div>';
    return h;
  },

  _extractHeadings(md) {
    if (!md) return [];
    const headings = []; const lines = md.split('\n'); const re = /^(#{1,3})\s*(.+)$/;
    for (let i = 0; i < lines.length; i++) { const m = lines[i].match(re); if (m) headings.push({ level: m[1].length, text: m[2].trim(), lineIndex: i }); }
    return headings;
  },

  renderReviewGuide() {
    const c = document.getElementById('review-guide-container');
    if (!c || !REVIEW_GUIDE || !REVIEW_GUIDE.chapters) { if (c) c.innerHTML = ''; return; }
    const chapters = REVIEW_GUIDE.chapters || [];
    if (chapters.length === 0) { c.innerHTML = '<p style="color:var(--ink-light);text-align:center;">暂无详细复习内容</p>'; return; }

    let h = '';
    h += this._renderCourseIntro();
    h += '<div id="pipeline-container" style="margin-bottom:16px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radius);padding:12px 8px 8px;"></div>';


    h += '<div style="background:rgba(0,0,0,0.03);padding:10px 14px;border-radius:var(--radius);margin-bottom:16px;">';
    h += '<strong style="font-size:1em;">📑 章节索引</strong><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">';
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i]; const imp = ch.importance || '';
      let impColor = '#888'; if (imp === '必考') impColor = '#991b1b'; else if (imp === '高频') impColor = '#1e40af';
      h += '<a href="#ch-' + i + '" style="display:inline-block;padding:4px 10px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:4px;font-size:0.85em;text-decoration:none;color:var(--ink);transition:all 0.12s;" onmouseover="this.style.background=\'var(--paper-dark)\'" onmouseout="this.style.background=\'var(--card-bg)\'">';
      h += (i + 1) + '. ' + this._e(ch.title || '') + ' ';
      if (imp === '必考') h += '<span style="color:' + impColor + ';font-size:0.8em;font-weight:700;">必考</span>';
      else if (imp === '高频') h += '<span style="color:' + impColor + ';font-size:0.8em;font-weight:700;">高频</span>';
      h += '</a>';
    }
    h += '</div></div>';

    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci]; const imp = ch.importance || '';
      let impBadge = ''; if (imp === '必考') impBadge = '<span class="kp-badge badge-must">必考</span>'; else if (imp === '高频') impBadge = '<span class="kp-badge badge-high">高频</span>';
      h += '<div style="margin:10px 0;border:1px solid var(--card-border);border-radius:var(--radius);overflow:hidden;" id="ch-' + ci + '">';
      h += '<div style="background:var(--paper-dark);padding:8px 12px;font-weight:700;">' + this._e(ch.title || '') + ' ' + impBadge + '</div>';
      h += '<div style="padding:8px 14px;font-size:0.9em;line-height:1.7;">';
      if (ch.overview) h += '<div style="color:var(--ink-light);margin-bottom:8px;font-style:italic;">' + this._e(ch.overview) + '</div>';
      // 章内链路图（章节概述之后、正文之前）
      if (ch.pipeline && ch.pipeline.stages && ch.pipeline.stages.length > 0) {
        h += '<div id="pipeline-ch-' + ci + '" style="margin-bottom:12px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radius);padding:10px 8px 6px;"></div>';
      }
      // 在转义前提取 Mermaid 代码块，保护它们不受 HTML 转义影响
      var rawContent = ch.content || '';
      var mermaidBlocks = [];
      var protectedContent = rawContent.replace(/```mermaid\s*\n([\s\S]*?)```/g, function(m, code) {
        var idx = mermaidBlocks.length;
        mermaidBlocks.push(code.replace(/^\n+|\n+$/g, ''));
        return '%%MERMAIDPROTECT_' + idx + '%%';
      });
      const escapedContent = this._e(protectedContent); const headings = this._extractHeadings(escapedContent);
      if (headings.length >= 3) {
        h += '<details style="margin-bottom:12px;font-size:0.85em;"><summary style="cursor:pointer;font-weight:600;color:var(--accent);">📑 本节目录</summary><div style="background:rgba(0,0,0,0.02);padding:6px 10px;border-radius:4px;margin-top:4px;">';
        for (const hd of headings) { const indent = '&nbsp;&nbsp;'.repeat(hd.level - 1); h += '<div style="margin:2px 0;">' + indent + '• ' + this._e(hd.text) + '</div>'; }
        h += '</div></details>';
      }
      h += this._md(escapedContent);
      // 还原被保护的 Mermaid 图表（用 DOM 操作设 textContent，避免 HTML 解析器破坏代码）
      for (var mi = 0; mi < mermaidBlocks.length; mi++) {
        var uid = 'mermaid_anchor_' + ci + '_' + mi;
        h = h.replace('%%MERMAIDPROTECT_' + mi + '%%', '<span id="' + uid + '"></span>');
        // 延迟：等 innerHTML 设置完毕后再填充 Mermaid 代码
        setTimeout((function(uid, code) {
          return function() {
            var anchor = document.getElementById(uid);
            if (anchor) {
              var div = document.createElement('div');
              div.className = 'mermaid';
              div.textContent = code;
              anchor.parentNode.replaceChild(div, anchor);
            }
          };
        })(uid, mermaidBlocks[mi]), 10);
      }
      if (ch.examples && ch.examples.length) { for (const ex of ch.examples) h += '<div class="chapter-example"><span class="example-label">💡 示例：</span>' + this._e(ex) + '</div>'; }
      if (ch.common_mistakes && ch.common_mistakes.length) {
        h += '<div style="margin-top:8px;padding:6px 10px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:0 4px 4px 0;font-size:0.88em;"><strong>⚠️ 本章易错：</strong>';
        for (const m of ch.common_mistakes) h += '<div style="margin:2px 0;">• ' + this._e(m) + '</div>';
        h += '</div>';
      }
      if (ch.key_points && ch.key_points.length) {
        h += '<div style="margin-top:8px;">';
        for (var ki = 0; ki < ch.key_points.length; ki++) {
          var kpName = ch.key_points[ki];
          h += '<span style="display:inline-block;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:3px;margin:2px;font-size:0.82em;cursor:pointer;" onclick="KnowledgeTree._jumpToQuizByKP(\'' + this._e(kpName) + '\',\'' + this._e(ch.title || '') + '\')">' + this._e(kpName) + '</span>';
        }
        h += '</div>';
      }
      h += '<div class="notes-section" style="margin-top:12px;">';
      h += '<button class="btn btn-outline btn-sm" id="notes-toggle-ch_' + ci + '" onclick="NotesUI.toggle(\'ch_' + ci + '\')">📝 笔记</button>';
      h += '<span id="notes-status-ch_' + ci + '" style="font-size:0.78em;color:var(--correct);margin-left:6px;"></span>';
      h += '<div class="notes-editor" id="notes-editor-ch_' + ci + '" style="display:none;margin-top:8px;">';
      h += '<div class="notes-toolbar">';
      h += '<button type="button" onclick="document.execCommand(\'bold\');var el=document.getElementById(\'notes-content-ch_' + ci + '\');if(el)el.focus();" title="加粗"><b>B</b></button>';
      h += '<button type="button" onclick="document.execCommand(\'italic\');var el=document.getElementById(\'notes-content-ch_' + ci + '\');if(el)el.focus();" title="斜体"><i>I</i></button>';
      h += '<button type="button" onclick="document.execCommand(\'underline\');var el=document.getElementById(\'notes-content-ch_' + ci + '\');if(el)el.focus();" title="下划线"><u>U</u></button>';
      h += '<span style="font-size:0.75em;color:#999;margin-left:8px;">支持 Ctrl+V 粘贴截图，输入自动保存</span>';
      h += '</div><div class="notes-content" contenteditable="true" id="notes-content-ch_' + ci + '" data-qid="ch_' + ci + '" data-placeholder="在这里补充笔记…"></div>';
      h += '</div></div>';
      h += '</div></div>';
    }
    c.innerHTML = h;
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([c]).catch(function() {});
    var self = this;
    setTimeout(function() { self.renderPipeline(); self._renderChapterPipelines(); }, 150);
    setTimeout(function() { if (typeof renderMermaid === 'function') renderMermaid(); }, 500);
    setTimeout(function() { self._wrapKnowledgeCards(); }, 1200);
    if (typeof NotesUI !== 'undefined') NotesUI.loadAllChapterNotes();
  },

  _e(s) { return this._escape(s); },
  _d(s) { return String(s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'); },

    _md(t) {
    if (!t) return '';
    const codeBlocks = [];
    const tableBlocks = [];

    // 1. 保护代码块
    let processed = t.replace(/```(\w*)\s*\n([\s\S]*?)```/g, function(match, lang, code) {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || '', code: code.replace(/^\n+|\n+$/g, '') });
      return '%%CODEBLOCK_' + idx + '%%';
    });

    // 2. 保护表格（连续的 |...| 行 + 分隔行 |---|）
    processed = processed.replace(/((?:^\|.+\|\s*$\n?)+)/gm, function(match) {
      var lines = match.trim().split(/\n/);
      if (lines.length < 2) return match; // 至少要有表头+分隔行
      // 检查第二行是否是分隔行
      if (!/^\|[\s\-:|]+\|$/.test(lines[1])) return match;
      var idx = tableBlocks.length;
      // 解析表头
      var headers = lines[0].split('|').filter(function(c) { return c.trim() !== ''; }).map(function(c) { return c.trim(); });
      // 解析数据行（跳过表头和分隔行）
      var rows = [];
      for (var i = 2; i < lines.length; i++) {
        var cells = lines[i].split('|').filter(function(c) { return c.trim() !== ''; }).map(function(c) { return c.trim(); });
        if (cells.length > 0) rows.push(cells);
      }
      var h = '<div style="overflow-x:auto;margin:8px 0;"><table style="border-collapse:collapse;width:100%;font-size:0.88em;">';
      h += '<thead><tr>';
      for (var hi = 0; hi < headers.length; hi++) {
        h += '<th style="border:1px solid #d0d7de;padding:6px 10px;background:#f6f8fa;text-align:left;font-weight:600;">' + headers[hi] + '</th>';
      }
      h += '</tr></thead><tbody>';
      for (var ri = 0; ri < rows.length; ri++) {
        h += '<tr style="background:' + (ri % 2 === 0 ? '#fff' : '#f9fafb') + ';">';
        for (var ci = 0; ci < Math.min(headers.length, rows[ri].length); ci++) {
          h += '<td style="border:1px solid #d0d7de;padding:6px 10px;">' + rows[ri][ci] + '</td>';
        }
        h += '</tr>';
      }
      h += '</tbody></table></div>';
      tableBlocks.push(h);
      return '%%TABLE_' + idx + '%%';
    });

    processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    processed = processed.replace(/^###\s*(.+)$/gm, '<h4 style="margin:8px 0 4px;">$1</h4>');
    processed = processed.replace(/^##\s*(.+)$/gm, '<h3 style="margin:10px 0 4px;border-bottom:1px solid var(--divider);">$1</h3>');
    processed = processed.replace(/^#\s*(.+)$/gm, '<h3 style="margin:10px 0 4px;">$1</h3>');
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    processed = processed.replace(/^&gt;\s*(.+)$/gm, '<blockquote style="border-left:3px solid #c0392b;background:#fef9ef;padding:4px 10px;margin:6px 0;">$1</blockquote>');
    processed = processed.replace(/^-\s+(.+)$/gm, '<li>$1</li>').replace(/^•\s+(.+)$/gm, '<li>$1</li>');

    // 还原表格
    for (let ti = 0; ti < tableBlocks.length; ti++) {
      processed = processed.replace('%%TABLE_' + ti + '%%', tableBlocks[ti]);
    }
    // 还原代码块（Mermaid 留到最后，避免被换行替换破坏）
    for (let i = 0; i < codeBlocks.length; i++) {
      const cb = codeBlocks[i];
      if (cb.lang === 'mermaid') continue; // Mermaid 稍后处理
      const langLabel = cb.lang ? ' <span style="font-weight:400;color:#888;">' + cb.lang + '</span>' : '';
      const lines = cb.code.split('\n');
      const codeLines = lines.map(function(line) { return '<span class="code-line">' + KnowledgeTree._highlightCode(line, cb.lang) + '</span>'; }).join('\n');
      processed = processed.replace('%%CODEBLOCK_' + i + '%%', '<div class="code-block-wrapper"><div class="code-block-header">' + langLabel + '<span>代码</span></div><pre><code>' + codeLines + '</code></pre></div>');
    }
    // 换行转 <br>
    processed = processed.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    // 最后还原 Mermaid 块（此时换行已转为 <br>，Mermaid 代码内部的换行保留）
    for (let i = 0; i < codeBlocks.length; i++) {
      const cb2 = codeBlocks[i];
      if (cb2.lang !== 'mermaid') continue;
      processed = processed.replace('%%CODEBLOCK_' + i + '%%', '<div class="mermaid">' + KnowledgeTree._d(cb2.code) + '</div>');
    }
    return processed;
  },

  _highlightCode(line, lang) {
    var result = line;
    const KEYWORDS = {
      java: ['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','goto','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','try','void','volatile','while','String','Integer','Boolean','List','Map','Set','ArrayList','HashMap','Override','Deprecated','Exception','RuntimeException','null','true','false'],
      sql: ['SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','ALTER','DROP','INDEX','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AND','OR','NOT','NULL','AS','ORDER','BY','GROUP','HAVING','LIMIT','COUNT','SUM','AVG','MAX','MIN','DISTINCT','UNION','ALL','LIKE','IN','BETWEEN','IS','EXISTS','PRIMARY','KEY','FOREIGN','REFERENCES','VARCHAR','INT','INTEGER','BOOLEAN','DATE','TIMESTAMP','DEFAULT','CONSTRAINT','CASCADE'],
      js: ['var','let','const','function','return','if','else','for','while','do','switch','case','break','continue','new','this','class','extends','import','export','default','from','async','await','try','catch','finally','throw','typeof','instanceof','null','undefined','true','false','console','document','window','Promise','Array','Object','String','Number','Boolean','Map','Set','JSON','Math'],
      python: ['def','class','return','if','elif','else','for','while','import','from','as','try','except','finally','raise','with','yield','lambda','pass','break','continue','and','or','not','in','is','None','True','False','self','print','len','range','list','dict','set','tuple','str','int','float','bool'],
    };
    const langLower = (lang || '').toLowerCase(); const kw = KEYWORDS[langLower] || KEYWORDS.java;
    result = result.replace(/(&quot;)(.*?)(&quot;)|(&#39;)(.*?)(&#39;)|(')(.*?)(')|(")(.*?)(")/g, function(m) { return '<span style="color:#0a3069;">' + m + '</span>'; });
    result = result.replace(/(\/\/.*$|\/\*[\s\S]*?\*\/)/g, function(m) { return '<span style="color:#6a737d;font-style:italic;">' + m + '</span>'; });
    result = result.replace(/(@\w+)/g, '<span style="color:#d73a49;">$1</span>');
    for (const w of kw) { const re = new RegExp('\\b(' + w + ')\\b', 'g'); result = result.replace(re, '<span style="color:#cf222e;">$1</span>'); }
    result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#0550ae;">$1</span>');
    return result;
  },

  renderHighFreqSummary() {
    const container = document.getElementById('highfreq-list');
    if (!container) return;
    const chapters = KNOWLEDGE_TREE.chapters || [];
    const highFreqItems = [];
    for (const ch of chapters) {
      for (const sec of (ch.sections || [])) {
        const imp = sec.importance || '常规';
        if (imp === '必考' || imp === '高频') highFreqItems.push({ chapter: ch.title || '', name: sec.title || sec.name || '', importance: imp });
      }
    }
    const overview = REVIEW_GUIDE.exam_overview; let html = '';
    if (overview) {
      html += '<div style="background:rgba(0,0,0,0.03);padding:10px;border-left:3px solid rgba(0,0,0,0.1);margin-bottom:12px;">';
      if (overview.key_advice) html += '<div style="color:var(--accent);font-weight:600;">💡 ' + this._e(overview.key_advice) + '</div>';
      if (overview.question_types) html += '<div style="margin-top:4px;font-size:0.9em;">📝 常见题型：' + overview.question_types.map(t => this._e(t)).join('、') + '</div>';
      if (overview.high_freq_topics) html += '<div style="margin-top:4px;font-size:0.9em;">🎯 考试高频方向：' + overview.high_freq_topics.map(t => '<strong>' + this._e(t) + '</strong>').join('、') + '</div>';
      html += '</div>';
    }
    if (highFreqItems.length === 0) { if (!overview) container.innerHTML = '<span style="color:var(--ink-light);">暂无标注</span>'; return; }
    else {
      const grouped = {};
      for (const item of highFreqItems) { if (!grouped[item.chapter]) grouped[item.chapter] = []; grouped[item.chapter].push(item); }
      for (const [ch, items] of Object.entries(grouped)) {
        html += '<div style="margin:4px 0;"><strong>' + this._escape(ch) + '</strong>';
        const badges = items.map(item => '<span class="kp-badge ' + (item.importance === '必考' ? 'badge-must' : 'badge-high') + '" style="margin-left:4px;">' + item.importance + '</span>');
        html += '<br>' + items.map((item, i) => (i + 1) + '. ' + this._escape(item.name) + ' ' + badges[i]).join('&nbsp;&nbsp;') + '</div>';
      }
    }
    container.innerHTML = html;
    if (document.getElementById('highfreq-summary')) document.getElementById('highfreq-summary').style.display = 'block';
  },

  render() {
    const container = document.getElementById('knowledge-tree-container');
    if (!container) return;
    const chapters = KNOWLEDGE_TREE.chapters || [];
    if (chapters.length === 0) { container.innerHTML = '<p style="color:var(--ink-light);text-align:center;padding:40px;">知识树加载中...</p>'; return; }
    let html = '';
    for (const ch of chapters) {
      html += '<div class="kp-chapter">' + this._escape(ch.title || '') + '</div>';
      for (const sec of (ch.sections || [])) {
        const name = sec.title || sec.name || ''; const imp = sec.importance || '常规'; const kpId = sec.id || name;
        let badgeClass = 'badge-normal'; if (imp === '必考') badgeClass = 'badge-must'; else if (imp === '高频') badgeClass = 'badge-high'; else if (imp === '了解') badgeClass = 'badge-info';
        html += '<div class="kp-section" data-kp="' + this._escape(kpId) + '"><div class="kp-header" onclick="KnowledgeTree.onClick(\'' + this._escape(kpId) + '\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;">';
        html += '<span class="kp-name">' + this._escape(name) + '</span><span class="kp-badge ' + badgeClass + '">' + imp + '</span></div>';
        if (sec.description) html += '<div class="kp-description" style="font-size:0.85em;color:var(--ink-light);margin:2px 0 2px 8px;line-height:1.5;">' + this._escape(sec.description) + '</div>';
        // 渲染子知识点（嵌套结构）
        var subPoints = sec.sub_points || [];
        for (var spi = 0; spi < subPoints.length; spi++) {
          var sp = subPoints[spi];
          html += '<div class="kp-sub-point" style="margin:2px 0 2px 24px;font-size:0.83em;color:var(--ink-light);line-height:1.5;">';
          html += '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);margin-right:6px;vertical-align:middle;"></span>';
          html += '<span class="kp-sub-name" style="font-weight:600;color:var(--ink-default);">' + this._escape(sp.title || '') + '</span>';
          if (sp.description) html += '<span style="color:var(--ink-light);"> - ' + this._escape(sp.description) + '</span>';
          html += '</div>';
        }
        html += '</div>';
      }
    }
    container.innerHTML = html;
  },

  onClick(kpId) {
    // 打开知识点详情面板
    var kp = null; var chapterIdx;
    var chapters = KNOWLEDGE_TREE.chapters || [];
    for (var ci = 0; ci < chapters.length; ci++) {
      var sections = chapters[ci].sections || [];
      for (var si = 0; si < sections.length; si++) {
        if (sections[si].id === kpId) {
          kp = sections[si]; chapterIdx = ci; break;
        }
      }
      if (kp) break;
    }
    var kpName = kp ? (kp.title || kp.name || kpId) : kpId;
    if (typeof KPDetail !== 'undefined') {
      KPDetail.show(kpId, kpName, chapterIdx);
    } else {
      // 兜底：直接跳刷题
      this._legacyJumpToQuiz(kpId);
    }
  },

  _legacyJumpToQuiz(kpId) {
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelector('nav.tabs button[data-tab="quiz"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-quiz').style.display = 'block';
    const selector = document.getElementById('kp-selector');
    if (selector) { for (const opt of selector.options) { if (opt.value === kpId) { selector.value = kpId; break; } } }
    QuizEngine.selectQuestions('by_kp', kpId);
    QuizEngine.renderCurrent();
  },

  // ── 按知识点名称搜索并跳转刷题 ──
  _jumpToQuizByKP(kpName, chapterTitle) {
    var found = this._findKP(kpName, chapterTitle || '');
    if (found) {
      this._legacyJumpToQuiz(found.kpId);
    }
  },

  _escape(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  renderStrategies() {
    const c = document.getElementById('strategies-container');
    if (!c) return;
    if (!STRATEGIES || !STRATEGIES.length) { c.innerHTML = '<p style="text-align:center;color:var(--ink-light);padding:40px;">暂无解题思路数据</p>'; return; }
    let h = '';
    for (const s of STRATEGIES) {
      h += '<div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radius);padding:14px;margin:12px 0;">';
      h += '<h3 style="margin:0 0 8px;">' + this._escape(s.type||'') + ' · 解题思路</h3>';
      if (s.overall_approach) h += '<p style="color:var(--ink-light);">' + this._escape(s.overall_approach) + '</p>';
      if (s.steps && s.steps.length) { h += '<strong>步骤：</strong><ol style="margin:4px 0;padding-left:20px;">'; for (const st of s.steps) h += '<li>' + this._escape(st) + '</li>'; h += '</ol>'; }
      if (s.common_pitfalls && s.common_pitfalls.length) { h += '<div style="margin:8px 0;padding:8px 12px;background:rgba(0,0,0,0.03);border-left:3px solid rgba(0,0,0,0.1);">⚠️：'; for (const p of s.common_pitfalls) h += '<div>- ' + this._escape(p) + '</div>'; h += '</div>'; }
      if (s.key_tips) h += '<div style="margin-top:8px;color:var(--accent);">💡 ' + this._escape(s.key_tips) + '</div>';
      h += '</div>';
    }
    c.innerHTML = h;
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([c]).catch(function() {});
  },

  // ══════════════════════════════════════════════════════
  //  技术链路梳理（Pipeline）
  // ══════════════════════════════════════════════════════

  renderPipeline() {
    var container = document.getElementById('pipeline-container');
    if (!container) return;
    var pipeline = PIPELINE;
    if (!pipeline || !pipeline.stages || pipeline.stages.length === 0) { container.innerHTML = ''; return; }

    var stages = pipeline.stages, N = stages.length;
    var containerWidth = container.clientWidth - 16 || 760;
    var displayWidth = Math.min(containerWidth, 820);
    if (displayWidth < 400) displayWidth = containerWidth + 20;
    var stageW = 165, stageH = 120, arrowW = 24, gap = 8;
    var displayHeight = stageH + 60;

    // ── 文本换行辅助 ──
    var _wrapLines = function(ctx, text, maxWidth, maxLines) {
      if (!text) return [];
      var lines = [], chars = text.split('');
      var line = '';
      for (var i = 0; i < chars.length; i++) {
        var test = line + chars[i];
        if (ctx.measureText(test).width > maxWidth && line.length > 0) {
          lines.push(line);
          if (lines.length >= maxLines) break;
          line = chars[i];
        } else {
          line = test;
        }
      }
      if (line && lines.length < maxLines) lines.push(line);
      // 最后一行加省略号如果还有剩余字符
      if (lines.length > 0 && i < chars.length) {
        var last = lines[lines.length - 1];
        while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) last = last.substring(0, last.length - 1);
        lines[lines.length - 1] = last + '…';
      }
      return lines;
    };

    var html = '<div style="margin-bottom:6px;">';
    html += '<strong style="font-size:0.95em;">🔗 ' + this._escape(pipeline.title || '技术链路') + '</strong>';
    if (pipeline.description) html += '<div style="font-size:0.72em;color:#999;margin-top:2px;">' + this._escape(pipeline.description) + '</div>';
    html += '</div>';
    html += '<div style="overflow-x:auto;"><canvas id="pipeline-canvas" style="display:block;height:' + displayHeight + 'px;margin:0 auto;"></canvas></div>';
    container.innerHTML = html;

    var canvas = document.getElementById('pipeline-canvas');
    if (!canvas) return;
    var totalW = N * stageW + (N - 1) * (arrowW + gap);
    var canvasW = Math.max(totalW + 40, displayWidth);
    var dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr; canvas.style.width = canvasW + 'px';
    canvas.height = displayHeight * dpr;
    var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

    var startX = Math.max(20, (canvasW - totalW) / 2);
    var compRegions = []; // 记录每个组件文字的可点击区域

    for (var i = 0; i < N; i++) {
      var sx = startX + i * (stageW + arrowW + gap), sy = 12;
      var fill = ['#dbeafe','#d1fae5','#fef3c7','#fce7f3','#e0e7ff','#cffafe','#f0fdf4'][i % 7];

      // 圆角矩形
      var r = 8;
      ctx.fillStyle = fill; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + r, sy); ctx.lineTo(sx + stageW - r, sy);
      ctx.arcTo(sx + stageW, sy, sx + stageW, sy + r, r);
      ctx.lineTo(sx + stageW, sy + stageH - r);
      ctx.arcTo(sx + stageW, sy + stageH, sx + stageW - r, sy + stageH, r);
      ctx.lineTo(sx + r, sy + stageH);
      ctx.arcTo(sx, sy + stageH, sx, sy + stageH - r, r);
      ctx.lineTo(sx, sy + r); ctx.arcTo(sx, sy, sx + r, sy, r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      // 编号
      ctx.beginPath(); ctx.arc(sx + 14, sy + 14, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(i + 1 + '', sx + 14, sy + 15);

      var padX = 8, curY = sy + 36;
      var textW = stageW - padX * 2;

      // ① 阶段名（加粗，最多2行）
      ctx.fillStyle = '#1e293b'; ctx.font = 'bold 11.5px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      var nameLines = _wrapLines(ctx, stages[i].name || '', textW, 2);
      for (var nl = 0; nl < nameLines.length; nl++) {
        ctx.fillText(nameLines[nl], sx + stageW / 2, curY);
        curY += 16;
      }

      curY += 4; // 间距

      // ② 组件（蓝色可点击，带下划线提示）
      if (stages[i].component) {
        ctx.fillStyle = '#2563eb'; ctx.font = '9px sans-serif';
        var compLines = _wrapLines(ctx, stages[i].component, textW, 1);
        if (compLines.length > 0) {
          var compText = compLines[0];
          var compW = ctx.measureText(compText).width;
          var compX = sx + (stageW - compW) / 2;
          var compY = curY;
          ctx.fillText(compText, sx + stageW / 2, compY);
          // 下划线提示可点击（距基线4px，避让字母降部）
          ctx.beginPath();
          ctx.moveTo(compX, compY + 4);
          ctx.lineTo(compX + compW, compY + 4);
          ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 0.6;
          ctx.stroke();
          // 记录点击区域
          compRegions.push({
            x: compX - 2, y: compY - 11, w: compW + 4, h: 13,
            stageIdx: i
          });
          curY += 15;
        }
      }

      curY += 2;

      // ③ 学习目标（灰色小字，最多2行）
      if (stages[i].objective) {
        ctx.fillStyle = '#64748b'; ctx.font = '8.5px "Microsoft YaHei", sans-serif';
        var objLines = _wrapLines(ctx, stages[i].objective, textW, 2);
        for (var ol = 0; ol < objLines.length; ol++) {
          ctx.fillText(objLines[ol], sx + stageW / 2, curY);
          curY += 13;
        }
      }

      // 箭头
      if (i < N - 1) {
        var ax = sx + stageW + 2, ay = sy + stageH / 2;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + arrowW - 6, ay);
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax + arrowW - 6, ay - 4); ctx.lineTo(ax + arrowW, ay); ctx.lineTo(ax + arrowW - 6, ay + 4);
        ctx.fillStyle = '#94a3b8'; ctx.fill();
      }
    }

    // ── 点击组件文字 → 跳转知识树 ──
    var self = this;
    canvas.style.cursor = 'default';
    canvas.onclick = function(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      for (var ri = 0; ri < compRegions.length; ri++) {
        var rgn = compRegions[ri];
        if (mx >= rgn.x && mx <= rgn.x + rgn.w && my >= rgn.y && my <= rgn.y + rgn.h) {
          var stage = stages[rgn.stageIdx];
          // 优先用 relates_to 字段匹配，否则用 component 文本匹配
          var searchTerms = (stage.relates_to && stage.relates_to.length > 0)
            ? stage.relates_to
            : (stage.component || '').split(/\s*\/\s*/);
          var found = null;
          for (var si = 0; si < searchTerms.length && !found; si++) {
            found = KnowledgeTree._findKP(searchTerms[si], '');
          }
          if (found) {
            KPDetail.show(found.kpId, found.kpTitle, found.chapterIdx);
          }
          return;
        }
      }
    };
    canvas.onmousemove = function(e) {
      var rect2 = canvas.getBoundingClientRect();
      var mx2 = e.clientX - rect2.left;
      var my2 = e.clientY - rect2.top;
      var hit = false;
      for (var ri2 = 0; ri2 < compRegions.length; ri2++) {
        var rgn2 = compRegions[ri2];
        if (mx2 >= rgn2.x && mx2 <= rgn2.x + rgn2.w && my2 >= rgn2.y && my2 <= rgn2.y + rgn2.h) {
          canvas.style.cursor = 'pointer'; hit = true; break;
        }
      }
      if (!hit) canvas.style.cursor = 'default';
    };
  },

  // ── 章内链路图 ──
  _renderChapterPipelines() {
    var chapters = REVIEW_GUIDE.chapters || [];
    for (var ci = 0; ci < chapters.length; ci++) {
      var ch = chapters[ci];
      if (!ch.pipeline || !ch.pipeline.stages || ch.pipeline.stages.length === 0) continue;
      var container = document.getElementById('pipeline-ch-' + ci);
      if (!container) continue;

      var stages = ch.pipeline.stages, N = stages.length;
      var containerWidth = container.clientWidth - 16 || 600;
      var stageW = 140, stageH = 90, arrowW = 20, gap = 6;
      var displayHeight = stageH + 50;

      // 辅助：文本换行
      var _wrap = function(ctx, text, maxW, maxLines) {
        if (!text) return [];
        var lines = [], line = '', chars = text.split('');
        for (var i = 0; i < chars.length; i++) {
          var test = line + chars[i];
          if (ctx.measureText(test).width > maxW && line.length > 0) {
            lines.push(line);
            if (lines.length >= maxLines) break;
            line = chars[i];
          } else { line = test; }
        }
        if (line && lines.length < maxLines) lines.push(line);
        if (lines.length > 0 && i < chars.length) {
          var last = lines[lines.length - 1];
          while (last.length > 0 && ctx.measureText(last + '…').width > maxW) last = last.substring(0, last.length - 1);
          lines[lines.length - 1] = last + '…';
        }
        return lines;
      };

      var totalW = N * stageW + (N - 1) * (arrowW + gap);
      var canvasW = Math.max(totalW + 20, Math.min(containerWidth, 750));
      if (N <= 2) canvasW = totalW + 20;

      container.innerHTML = '<div style="font-size:0.85em;font-weight:600;margin-bottom:4px;">🔗 ' + this._escape(ch.pipeline.title || '章内链路') + '</div>'
        + '<div style="overflow-x:auto;"><canvas id="pipeline-ch-canvas-' + ci + '" style="display:block;height:' + displayHeight + 'px;margin:0 auto;"></canvas></div>';

      var canvas = document.getElementById('pipeline-ch-canvas-' + ci);
      if (!canvas) continue;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = canvasW * dpr; canvas.style.width = canvasW + 'px';
      canvas.height = displayHeight * dpr;
      var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

      var startX = (canvasW - totalW) / 2;
      for (var i = 0; i < N; i++) {
        var sx = startX + i * (stageW + arrowW + gap), sy = 8;
        var fill = ['#dbeafe','#d1fae5','#fef3c7','#fce7f3','#e0e7ff','#cffafe'][i % 6];
        var r = 6;
        ctx.fillStyle = fill; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + r, sy); ctx.lineTo(sx + stageW - r, sy);
        ctx.arcTo(sx + stageW, sy, sx + stageW, sy + r, r);
        ctx.lineTo(sx + stageW, sy + stageH - r);
        ctx.arcTo(sx + stageW, sy + stageH, sx + stageW - r, sy + stageH, r);
        ctx.lineTo(sx + r, sy + stageH);
        ctx.arcTo(sx, sy + stageH, sx, sy + stageH - r, r);
        ctx.lineTo(sx, sy + r); ctx.arcTo(sx, sy, sx + r, sy, r);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // 编号
        ctx.beginPath(); ctx.arc(sx + 11, sy + 11, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#2563eb'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(i + 1 + '', sx + 11, sy + 12);

        var padX = 6, curY = sy + 28, textW = stageW - padX * 2;

        // 阶段名（最多2行）
        ctx.fillStyle = '#1e293b'; ctx.font = 'bold 10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
        var nameLines = _wrap(ctx, stages[i].name || '', textW, 2);
        for (var nl = 0; nl < nameLines.length; nl++) { ctx.fillText(nameLines[nl], sx + stageW / 2, curY); curY += 14; }

        curY += 2;

        // 组件（蓝色，1行）
        if (stages[i].component) {
          ctx.fillStyle = '#2563eb'; ctx.font = '8px sans-serif';
          var compLines = _wrap(ctx, stages[i].component, textW, 1);
          if (compLines.length > 0) { ctx.fillText(compLines[0], sx + stageW / 2, curY); curY += 12; }
        }

        // 学习目标（灰色，最多2行）
        if (stages[i].objective) {
          ctx.fillStyle = '#64748b'; ctx.font = '7.5px "Microsoft YaHei", sans-serif';
          var objLines = _wrap(ctx, stages[i].objective, textW, 2);
          for (var ol = 0; ol < objLines.length; ol++) { ctx.fillText(objLines[ol], sx + stageW / 2, curY); curY += 11; }
        }

        // 箭头
        if (i < N - 1) {
          var ax = sx + stageW + 2, ay = sy + stageH / 2;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + arrowW - 4, ay);
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ax + arrowW - 4, ay - 3); ctx.lineTo(ax + arrowW, ay); ctx.lineTo(ax + arrowW - 4, ay + 3);
          ctx.fillStyle = '#94a3b8'; ctx.fill();
        }
      }
    }
  },

  // ── 知识点模糊搜索（多级匹配）──
  _findKP(name, chapterHint) {
    var chapters = KNOWLEDGE_TREE.chapters || [];
    var searchName = (name || '').replace(/\s+/g, '').toLowerCase();
    if (!searchName) return null;

    // 按章节过滤（有 hint 时优先搜对应章节）
    var candidates = [];
    for (var ci = 0; ci < chapters.length; ci++) {
      var ch = chapters[ci];
      var chTitle = (ch.title || '').replace(/\s+/g, '').toLowerCase();
      var sections = ch.sections || [];
      for (var si = 0; si < sections.length; si++) {
        var sec = sections[si];
        var kpTitle = (sec.title || sec.name || '').replace(/\s+/g, '').toLowerCase();
        if (!kpTitle) continue;
        candidates.push({ chapterIdx: ci, kpId: sec.id || ('kp_' + ci + '_' + si), kpTitle: sec.title || sec.name || '', importance: sec.importance || '常规', chTitle: chTitle });
      }
    }

    // 如果 chapterHint 提供，先在本章找
    if (chapterHint) {
      var hintLower = chapterHint.replace(/\s+/g, '').toLowerCase();
      var chapterCandidates = candidates.filter(function(c) { return c.chTitle.indexOf(hintLower) >= 0; });
      if (chapterCandidates.length > 0) candidates = chapterCandidates;
    }

    // Level 1: 精确匹配
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].kpTitle === searchName) return candidates[i];
    }

    // Level 2: 完整包含（如 "Servlet生命周期" 包含在 "Servlet生命周期与核心接口" 中）
    var best = null, bestScore = 0;
    for (var i2 = 0; i2 < candidates.length; i2++) {
      var t = candidates[i2].kpTitle;
      if (t.indexOf(searchName) >= 0) {
        var s = searchName.length; // 越长的包含匹配越好
        if (s > bestScore) { bestScore = s; best = candidates[i2]; }
      }
      if (searchName.indexOf(t) >= 0 && t.length > bestScore) {
        bestScore = t.length; best = candidates[i2];
      }
    }
    if (best) return best;

    // Level 3: 逐词匹配（拆分中文词组，统计命中词数）
    // 主要针对中文：每1-2个字符为一个"词"，统计在 kpTitle 中出现的比例
    var chars = searchName.split('');
    for (var i3 = 0; i3 < candidates.length; i3++) {
      var ct = candidates[i3].kpTitle;
      var hits = 0;
      for (var j = 0; j < chars.length; j++) {
        if (ct.indexOf(chars[j]) >= 0) hits++;
      }
      var score = hits / Math.max(chars.length, 1);
      // 去掉停用词（"的""与""和"等）再算一次
      var meaningful = searchName.replace(/[的与和及之]/g, '').split('');
      var mHits = 0;
      for (var mj = 0; mj < meaningful.length; mj++) {
        if (ct.indexOf(meaningful[mj]) >= 0) mHits++;
      }
      var mScore = mHits / Math.max(meaningful.length, 1);
      score = Math.max(score, mScore);
      if (score > bestScore && score >= 0.5) {
        bestScore = score; best = candidates[i3];
      }
    }

    return best;
  },

  // ── 渲染速查卡 Tab ──
  renderCheatSheets() {
    var container = document.getElementById('cheatsheet-container');
    if (!container) return;
    var sheets = CHEAT_SHEETS || [];
    if (sheets.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--ink-light);padding:40px;">暂无速查卡<br><small>重新运行 generate.py 生成</small></div>';
      return;
    }
    var h = '<div style="max-width:780px;margin:0 auto;">';
    h += '<h3 style="margin-bottom:4px;">⚡ 考前速查卡</h3>';
    h += '<p style="font-size:0.82em;color:var(--ink-light);margin-bottom:16px;">模板 + 必背考点 + 避坑——考前最后一小时背这些</p>';
    for (var i = 0; i < sheets.length; i++) {
      h += this._renderCheatSheetCard(sheets[i]);
    }
    h += '</div>';
    container.innerHTML = h;
  },

  // ── 速查卡：按章节名匹配 ──
  _findCheatSheet(chapterTitle) {
    var sheets = CHEAT_SHEETS || [];
    var searchTitle = (chapterTitle || '').replace(/\s+/g, '').toLowerCase();
    for (var i = 0; i < sheets.length; i++) {
      var st = (sheets[i].chapter || '').replace(/\s+/g, '').toLowerCase();
      if (st === searchTitle || st.indexOf(searchTitle) >= 0 || searchTitle.indexOf(st) >= 0) {
        return sheets[i];
      }
    }
    return null;
  },

  // ── 渲染单张速查卡 ──
  _renderCheatSheetCard(cs) {
    var h = '<div class="cheat-sheet-card" style="margin:10px 0;border:1px solid #fbbf24;border-radius:8px;overflow:hidden;">';
    h += '<div class="cheat-sheet-header" style="background:linear-gradient(135deg,#fef3c7,#fde68a);padding:6px 12px;font-weight:700;font-size:0.9em;">⚡ 速查卡 · 考前必背</div>';
    h += '<div style="padding:8px 12px;background:#fffdf5;">';

    // 代码模板
    var templates = cs.templates || [];
    if (templates.length > 0) {
      h += '<div style="font-weight:600;font-size:0.85em;margin-bottom:4px;">📋 必背模板</div>';
      for (var ti = 0; ti < templates.length; ti++) {
        var tpl = templates[ti];
        h += '<div style="margin-bottom:6px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">';
        h += '<div style="background:#f3f4f6;padding:3px 10px;font-size:0.78em;font-weight:600;">' + this._e(tpl.title || '模板') + '</div>';
        if (tpl.code) {
          // 提取代码块，先转义再渲染
          var codeRaw = String(tpl.code);
          var codeHtml = codeRaw.replace(/```(\w*)\s*\n?([\s\S]*?)```/g, function(m, lang, c) {
            var escaped = c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return '<pre style="margin:0;padding:6px 10px;background:#1e293b;color:#e2e8f0;font-size:0.78em;line-height:1.5;overflow-x:auto;"><code>' + escaped + '</code></pre>';
          });
          // 处理无围栏的纯代码
          if (codeHtml === codeRaw) {
            codeHtml = '<pre style="margin:0;padding:6px 10px;background:#1e293b;color:#e2e8f0;font-size:0.78em;line-height:1.5;overflow-x:auto;"><code>' + codeRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>';
          }
          h += codeHtml;
        }
        if (tpl.note) h += '<div style="padding:2px 10px;font-size:0.75em;color:#92400e;">💡 ' + this._e(tpl.note) + '</div>';
        h += '</div>';
      }
    }

    // 必背考点
    var mustKnow = cs.must_know || [];
    if (mustKnow.length > 0) {
      h += '<div style="font-weight:600;font-size:0.85em;margin:8px 0 4px;">🎯 必背考点</div>';
      for (var mi = 0; mi < mustKnow.length; mi++) {
        h += '<div style="display:flex;align-items:flex-start;gap:6px;margin:3px 0;font-size:0.84em;line-height:1.5;">';
        h += '<span style="color:#d97706;font-weight:700;flex-shrink:0;">' + (mi + 1) + '.</span>';
        h += '<span>' + this._e(mustKnow[mi]) + '</span></div>';
      }
    }

    // 常见坑
    var pitfalls = cs.quick_pitfalls || [];
    if (pitfalls.length > 0) {
      h += '<div style="margin-top:8px;padding:6px 10px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:0 4px 4px 0;font-size:0.82em;">';
      h += '<strong>⚠️ 避坑：</strong>';
      for (var pi = 0; pi < pitfalls.length; pi++) {
        h += '<span style="margin:0 4px;">• ' + this._e(pitfalls[pi]) + '</span>';
      }
      h += '</div>';
    }

    h += '</div></div>';
    return h;
  },
  // ── 知识卡片视觉包装（卡片化渲染）──
  _wrapKnowledgeCards() {
    var container = document.getElementById('review-guide-container');
    if (!container) return;

    // ### 被 _md() 渲染为 <h4>，## 被渲染为 <h3>
    // 排除已知的章节标题模式，其余 h4 均视为知识卡片
    var sectionKeywords = ['学习目标', '核心知识卡片', '公式速览', '简答考点', '易错点', '章内链路', '重要公式'];
    var allH4s = container.querySelectorAll('h4');
    var cardDefs = [];
    for (var i = 0; i < allH4s.length; i++) {
      var h4 = allH4s[i];
      var text = (h4.textContent || '').trim();
      // 跳过章节标题
      var isSection = false;
      for (var sk = 0; sk < sectionKeywords.length; sk++) {
        if (text.indexOf(sectionKeywords[sk]) === 0) { isSection = true; break; }
      }
      if (isSection) continue;
      // 提取编号和标题
      var match = text.match(/^知识卡片(\d+)[：:]\s*(.+)/);
      var num, title;
      if (match) {
        num = match[1];
        title = match[2];
      } else {
        // 无编号格式：去掉可能的前缀 emoji/图标
        num = String(i + 1);
        title = text.replace(/^[📖📊💡✅⚠️🔗📋🎯⭐●◆■▲▼]\s*/, '').replace(/^知识点[：:]\s*/, '');
      }
      cardDefs.push({ el: h4, num: num, title: title });
    }
    if (cardDefs.length === 0) return;

    for (var ci = 0; ci < cardDefs.length; ci++) {
      var def = cardDefs[ci];
      var headingEl = def.el;

      // 找到所属章节索引
      var chapterIdx = -1;
      var p = headingEl.parentNode;
      while (p) {
        if (p.id && p.id.indexOf('ch-') === 0) {
          chapterIdx = parseInt(p.id.replace('ch-', ''));
          break;
        }
        p = p.parentNode;
      }
      var favKey = 'ch' + (chapterIdx >= 0 ? chapterIdx : 'x') + '_card' + def.num;
      var isFaved = CardFav.isFaved(favKey);

      // 创建卡片容器
      var card = document.createElement('div');
      card.className = 'knowledge-card';
      card.setAttribute('data-fav-key', favKey);
      if (!isFaved && CardFav._filterOn) card.style.display = 'none';

      // 标题栏（含收藏按钮）
      var header = document.createElement('div');
      header.className = 'kc-header';
      header.innerHTML = '<span class="kc-num">' + def.num + '</span><span class="kc-title-text">' + this._e(def.title) + '</span>'
        + '<button class="kc-fav-btn' + (isFaved ? ' faved' : '') + '" title="' + (isFaved ? '取消收藏' : '收藏') + '" data-fav-key="' + favKey + '">' + (isFaved ? '⭐' : '☆') + '</button>';

      // 主体：收集 heading 之后、下一个 h2/h3/h4 之前的所有兄弟节点
      var body = document.createElement('div');
      body.className = 'kc-body';
      var next = headingEl.nextSibling;
      while (next) {
        var nextToCheck = next.nextSibling;
        if (next.nodeType === 1) {
          var tag = next.tagName;
          // h2/h3 是章节标题（如 "## 简答考点" → h3），遇到即停止
          if (tag === 'H2' || tag === 'H3') break;
          // 遇到下一个知识卡片（h4）也停止
          if (tag === 'H4') {
            var ntext = (next.textContent || '').trim();
            if (/^知识卡片\d+/.test(ntext)) break;
          }
          // 非卡片内容：笔记区域、章节示例等不应被吞进卡片
          if (next.classList && (
              next.classList.contains('notes-section') ||
              next.classList.contains('chapter-example') ||
              next.classList.contains('notes-editor')
          )) break;
          if (next.id && next.id.indexOf('notes-') === 0) break;
        }
        body.appendChild(next);
        next = nextToCheck;
      }

      // 组装
      headingEl.parentNode.insertBefore(card, headingEl);
      card.appendChild(header);
      card.appendChild(body);
      headingEl.parentNode.removeChild(headingEl);
    }

    // 美化"一句话结论"——找到对应的 strong，将其及后续内容包入绿色框
    var bodies = container.querySelectorAll('.kc-body');
    for (var bi = 0; bi < bodies.length; bi++) {
      var bodyEl = bodies[bi];
      var strongs2 = bodyEl.querySelectorAll('strong');
      for (var si = 0; si < strongs2.length; si++) {
        var s2 = strongs2[si];
        if (s2.closest('pre, table, .mermaid, .code-block-wrapper, .kc-conclusion')) continue;
        if ((s2.textContent || '').indexOf('一句话结论') === -1) continue;

        // 收集 strong 及其后的兄弟节点，直到下一个 strong 或 br*2
        var wrapper = document.createElement('div');
        wrapper.className = 'kc-conclusion';
        s2.parentNode.insertBefore(wrapper, s2);
        wrapper.appendChild(s2);
        var nxt = wrapper.nextSibling;
        while (nxt) {
          var nextNext = nxt.nextSibling;
          if (nxt.nodeType === 1) {
            var ntag = nxt.tagName;
            // 遇到下一个 strong、h4、div.mermaid 就停
            if (ntag === 'STRONG' || ntag === 'H4' || ntag === 'DIV') break;
          }
          // 文本节点：如果包含连续换行（两个br）就停
          if (nxt.nodeType === 3 && (nxt.textContent || '').indexOf('\n\n') !== -1) break;
          wrapper.appendChild(nxt);
          nxt = nextNext;
        }
        break; // 每张卡片只有一个一句话结论
      }
      // 给知识卡片内的子标签加图标
      var strongs = bodies[bi].querySelectorAll('strong');
      for (var si = 0; si < strongs.length; si++) {
        var s = strongs[si];
        if (s.closest('pre, table, .mermaid, .code-block-wrapper')) continue;

        var rawText = (s.textContent || '').trim();
        // 检查 strong 内部或紧邻前面的文本节点是否已有图标
        var prevSibling = s.previousSibling;
        var prevHasIcon = prevSibling && prevSibling.nodeType === 3 && /^[📖📊💡✅⚠️🔗📋🎯⭐]/.test(prevSibling.textContent.trim());
        var selfHasIcon = /^[📖📊💡✅⚠️🔗📋🎯⭐]/.test(rawText);

        // 清理 strong 前面文本节点里 LLM 自带的图标（避免双图标）
        if (prevHasIcon && prevSibling.nodeType === 3) {
          prevSibling.textContent = prevSibling.textContent.replace(/^[📖📊💡✅⚠️🔗📋🎯⭐]\s*/, '');
          if (!prevSibling.textContent.trim()) prevSibling.remove();
        }

        // 如果 strong 内部已有图标就跳过
        if (selfHasIcon) continue;

        // 加图标
        var label = rawText;
        if (label.indexOf('概念定义') !== -1) s.innerHTML = '<span class="kc-section-icon">📖</span> ' + s.innerHTML;
        else if (label.indexOf('图解') !== -1) s.innerHTML = '<span class="kc-section-icon">📊</span> ' + s.innerHTML;
        else if (label.indexOf('具体示例') !== -1 || label.indexOf('示例') !== -1) s.innerHTML = '<span class="kc-section-icon">💡</span> ' + s.innerHTML;
      }
    }

    // 收藏星标点击（事件委托）
    container.querySelectorAll('.kc-fav-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var key = btn.getAttribute('data-fav-key');
        var isNowFaved = CardFav.toggle(key);
        btn.className = 'kc-fav-btn' + (isNowFaved ? ' faved' : '');
        btn.innerHTML = isNowFaved ? '⭐' : '☆';
        btn.title = isNowFaved ? '取消收藏' : '收藏';
        CardFav._updateFilterBar();
      });
      btn.addEventListener('dblclick', function(e) {
        e.stopPropagation();
      });
    });

    // 插入收藏筛选条（放在第一个章节之前）
    var firstChapter = container.querySelector('[id^="ch-"]');
    var filterBar = document.createElement('div');
    filterBar.className = 'fav-filter-bar';
    filterBar.id = 'fav-filter-bar';
    filterBar.innerHTML = '<span style="font-weight:600;">筛选：</span>'
      + '<button class="fav-filter-btn active" data-filter="all">全部</button>'
      + '<button class="fav-filter-btn" data-filter="faved">⭐ 收藏</button>'
      + '<span class="fav-count"></span>';
    if (firstChapter && firstChapter.parentNode) {
      firstChapter.parentNode.insertBefore(filterBar, firstChapter);
    } else if (container.firstChild) {
      container.insertBefore(filterBar, container.firstChild);
    }
    // 绑定筛选点击
    filterBar.querySelectorAll('.fav-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        filterBar.querySelectorAll('.fav-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        CardFav._filterOn = (btn.getAttribute('data-filter') === 'faved');
        CardFav._applyFilter();
      });
    });
    CardFav._updateFilterBar();
  },

};

// ── 收藏存储 ──
var CardFav = {
  _filterOn: false,

  _storageKey: function() {
    return 'ai_fav_' + (typeof CONFIG !== 'undefined' ? CONFIG.token : 'default');
  },

  _read: function() {
    try {
      return JSON.parse(localStorage.getItem(this._storageKey()) || '{}');
    } catch(e) { return {}; }
  },

  _write: function(data) {
    try {
      localStorage.setItem(this._storageKey(), JSON.stringify(data));
    } catch(e) {}
  },

  isFaved: function(key) {
    return !!this._read()[key];
  },

  toggle: function(key) {
    var data = this._read();
    if (data[key]) {
      delete data[key];
      this._write(data);
      return false;
    } else {
      data[key] = true;
      this._write(data);
      return true;
    }
  },

  count: function() {
    return Object.keys(this._read()).length;
  },

  _applyFilter: function() {
    var cards = document.querySelectorAll('.knowledge-card');
    cards.forEach(function(card) {
      var key = card.getAttribute('data-fav-key');
      if (CardFav._filterOn) {
        card.style.display = CardFav.isFaved(key) ? '' : 'none';
      } else {
        card.style.display = '';
      }
    });
  },

  _updateFilterBar: function() {
    var bar = document.getElementById('fav-filter-bar');
    if (!bar) return;
    var cnt = this.count();
    var countEl = bar.querySelector('.fav-count');
    if (countEl) {
      countEl.textContent = cnt > 0 ? '已收藏 ' + cnt + ' 张' : '';
    }
  }
};
