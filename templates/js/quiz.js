// quiz.js —— 刷题引擎

const QuizEngine = {
  currentMode: 'all',
  currentKP: null,
  currentIndex: 0,
  filteredQuestions: [],
  submittedQuestions: {},

  // 初始化
  init() {
    this.filteredQuestions = [...QUESTION_BANK];
    this.shuffle(this.filteredQuestions);
    this.currentIndex = 0;
    this.submittedQuestions = this._loadProgress();

    // 填充知识点选择器（按知识树章节顺序，与复习清单一致）
    const selector = document.getElementById('kp-selector');
    if (selector) {
      // 按 KNOWLEDGE_TREE 原始顺序（章节 → 节），保持与复习清单同步
      var chapters = KNOWLEDGE_TREE.chapters || [];
      for (var ci = 0; ci < chapters.length; ci++) {
        var ch = chapters[ci];
        var sections = ch.sections || [];
        for (var si = 0; si < sections.length; si++) {
          var sec = sections[si];
          if (!sec.id) continue;
          var opt = document.createElement('option');
          opt.value = sec.id;
          opt.textContent = (ch.title ? ch.title + ' · ' : '') + (sec.title || sec.id);
          selector.appendChild(opt);
        }
      }
      selector.onchange = () => {
        const val = selector.value;
        if (val === 'all') {
          this.selectQuestions('all');
        } else {
          this.selectQuestions('by_kp', val);
        }
        this.renderCurrent();
        this.renderQuestionNav();
      };
    }

    document.getElementById('quiz-total').textContent = QUESTION_BANK.length;
    this.updateProgress();
    this.renderQuestionNav();
  },

  // 渲染题号导航面板
  renderQuestionNav() {
    const container = document.getElementById('question-nav');
    if (!container) return;

    let html = '';
    for (let i = 0; i < this.filteredQuestions.length; i++) {
      const q = this.filteredQuestions[i];
      const qid = q.id || ('q_' + i);
      const isSubmitted = !!this.submittedQuestions[qid];
      const isCurrent = i === this.currentIndex;

      let cls = 'qnav-item';
      if (isCurrent) cls += ' qnav-current';
      else if (isSubmitted) {
        const result = this.submittedQuestions[qid];
        if (result.isCorrect === true) cls += ' qnav-correct';
        else if (result.isCorrect === false) cls += ' qnav-wrong';
        else cls += ' qnav-done';
      }

      html += `<span class="${cls}" onclick="QuizEngine.gotoQuestion(${i})" title="第${i+1}题">${i+1}</span>`;
    }
    container.innerHTML = html;
  },

  // 跳转到指定题号
  gotoQuestion(index) {
    if (index >= 0 && index < this.filteredQuestions.length) {
      this.currentIndex = index;
      this.renderCurrent();
      this.renderQuestionNav();
    }
  },

  // 构建 knowledge_point_id → 显示名称 的映射
  _buildKPMap() {
    const map = new Map();
    for (const ch of (KNOWLEDGE_TREE.chapters || [])) {
      for (const sec of (ch.sections || [])) {
        if (sec.id) {
          map.set(sec.id, (ch.title ? ch.title + ' · ' : '') + (sec.title || sec.id));
        }
      }
    }
    return map;
  },

  // 获取题目的知识点显示名称
  _getKPName(q) {
    const kpMap = this._buildKPMap();
    const kpId = q.knowledge_point_id || '';
    if (kpId && kpMap.has(kpId)) return kpMap.get(kpId);
    if (q.knowledge_point) return q.knowledge_point;
    if (q.chapter) return q.chapter;
    return '其他';
  },

  // 获取题目的知识点ID（用于筛选和分组）
  _getKPId(q) {
    return q.knowledge_point_id || q.knowledge_point || q.chapter || 'other';
  },

  // 选题
  selectQuestions(mode, kp) {
    this.currentMode = mode;
    this.currentKP = kp || null;

    if (mode === 'all') {
      this.filteredQuestions = [...QUESTION_BANK];
    } else if (mode === 'by_kp') {
      this.filteredQuestions = QUESTION_BANK.filter(q => {
        return this._getKPId(q) === kp;
      });
    } else if (mode === 'wrong_only') {
      const ids = WrongBook.getAllIds();
      this.filteredQuestions = QUESTION_BANK.filter(q => ids.includes(q.id));
    }

    if (this.filteredQuestions.length === 0) {
      this.filteredQuestions = [...QUESTION_BANK];
    }

    this.shuffle(this.filteredQuestions);
    this.currentIndex = 0;
    this.renderQuestionNav();
  },

  // 渲染当前题目
  renderCurrent() {
    const container = document.getElementById('quiz-container');
    if (!container || this.filteredQuestions.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--ink-light);padding:40px;">暂无题目</p>';
      return;
    }

    const q = this.filteredQuestions[this.currentIndex];
    const qid = q.id || ('q_' + this.currentIndex);
    const submitted = this.submittedQuestions[qid];

    let html = `<div class="q-card" id="card-${qid}">`;
    html += `<div class="q-num">${this.currentIndex + 1} / ${this.filteredQuestions.length}`;
    if (q.points) html += ` (${q.points}分)`;
    html += ` <span style="font-size:0.8em;color:var(--ink-light);">${this._getKPName(q)}</span></div>`;
    html += `<div class="q-text">${this._formatQuestionText(q.question)}</div>`;

    // 选项
    if (q.type === 'choice') {
      const opts = q.options || [];
      for (let i = 0; i < opts.length; i++) {
        const cls = submitted && submitted.answer === i ? ' selected' : '';
        html += `<label class="option${cls}" onclick="QuizEngine.selectChoice('${qid}', ${i})">`;
        html += `<input type="radio" name="${qid}" value="${i}"${submitted && submitted.answer === i ? ' checked' : ''}>`;
        html += `${String.fromCharCode(65 + i)}. ${this._formatQuestionText(this._stripPrefix(opts[i]))}</label>`;
      }
    } else if (q.type === 'multi') {
      const opts = q.options || [];
      for (let i = 0; i < opts.length; i++) {
        html += `<label class="option" onclick="QuizEngine.toggleMulti('${qid}', ${i})">`;
        html += `<input type="checkbox" name="${qid}" value="${i}">`;
        html += `${String.fromCharCode(65 + i)}. ${this._formatQuestionText(this._stripPrefix(opts[i]))}</label>`;
      }
    } else if (q.type === 'tf') {
      html += `<label class="option${submitted && submitted.answer === 0 ? ' selected' : ''}" onclick="QuizEngine.selectChoice('${qid}', 0)">`;
      html += `<input type="radio" name="${qid}" value="0"${submitted && submitted.answer === 0 ? ' checked' : ''}>正确</label>`;
      html += `<label class="option${submitted && submitted.answer === 1 ? ' selected' : ''}" onclick="QuizEngine.selectChoice('${qid}', 1)">`;
      html += `<input type="radio" name="${qid}" value="1"${submitted && submitted.answer === 1 ? ' checked' : ''}>错误</label>`;
    } else if (q.type === 'fill') {
      html += `<textarea class="q-textarea" id="text-${qid}" placeholder="请输入答案" style="min-height:36px;">${submitted ? (submitted.answer || '') : ''}</textarea>`;
    } else {
      html += `<textarea class="q-textarea" id="text-${qid}" placeholder="请输入答案（支持换行，可先尝试作答再查看解析）" style="min-height:80px;">${submitted ? (submitted.answer || '') : ''}</textarea>`;
    }

    // 主观题显示"查看解析"按钮，客观题显示"提交"
    const isAutoGradable = (q.type === 'choice' || q.type === 'tf' || q.type === 'multi');
    if (!isAutoGradable && !submitted) {
      html += `<div style="margin-top:8px;"><button class="btn btn-primary" onclick="QuizEngine.showExplanation()">查看解析</button></div>`;
    }

    // 结果区域
    html += `<div class="result" id="result-${qid}"${submitted ? ' style="display:block;"' : ''}>`;
    if (submitted) {
      html += this._renderResult(submitted, q, qid);
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
    this.updateProgress();

    // MathJax 重新渲染
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise([container]).catch(() => {});
    }

    // 异步加载已有笔记（不阻塞渲染）
    if (submitted && typeof NotesUI !== 'undefined') {
      NotesUI.loadNoteForQuestion(qid);
    }

    // 动态更新底部提交按钮文本
    const submitBtn = document.getElementById('quiz-submit-btn');
    if (submitBtn) {
      submitBtn.textContent = isAutoGradable ? '提交' : '查看解析';
      submitBtn.onclick = isAutoGradable
        ? () => QuizEngine.submitCurrent()
        : () => QuizEngine.showExplanation();
    }
  },

  _renderResult(submitted, q, qid) {
    let html = '';
    if (submitted.isCorrect === true) {
      html += '<span class="badge badge-ok">✅ 正确</span>';
    } else if (submitted.isCorrect === false) {
      html += '<span class="badge badge-no">❌ 错误</span>';
      if (q.type === 'choice' || q.type === 'tf') {
        const ansIdx = q.type === 'tf' ? q.answer : q.answer;
        html += ' 正确答案：' + (q.type === 'choice' && q.options ? (String.fromCharCode(65 + ansIdx) + '. ' + QuizEngine._formatQuestionText(this._stripPrefix(q.options[ansIdx]))) : (ansIdx === 0 ? '正确' : '错误'));
      } else if (q.type === 'fill' || q.type === 'code_fill') {
        var answers = q.answer;
        if (Array.isArray(answers) && answers.length > 0) {
          if (Array.isArray(answers[0])) {
            // 嵌套数组：每空一组备选答案
            html += ' 正确答案：';
            for (var ai = 0; ai < answers.length; ai++) {
              if (ai > 0) html += ' ｜ ';
              html += '空' + (ai + 1) + ': ' + answers[ai].map(function(a) { return QuizEngine._formatQuestionText(String(a)); }).join(' 或 ');
            }
          } else if (q.type === 'code_fill') {
            // 代码填空扁平数组 = 多空，每空一个答案
            html += ' 正确答案：';
            for (var ci = 0; ci < answers.length; ci++) {
              if (ci > 0) html += ' ； ';
              html += '空' + (ci + 1) + '：' + QuizEngine._formatQuestionText(String(answers[ci]));
            }
          } else {
            // 普通填空扁平数组：同一空的多个可接受答案
            html += ' 正确答案：' + answers.map(function(a) { return QuizEngine._formatQuestionText(String(a)); }).join(' 或 ');
          }
        } else {
          html += ' 正确答案：' + QuizEngine._formatQuestionText(String(answers || ''));
        }
      }
    } else {
      html += '<span class="badge badge-ref">📝 参考答案</span>';
      if (q.answer) {
        var refAns = q.answer;
        if (Array.isArray(refAns)) {
          if (refAns.length > 0 && Array.isArray(refAns[0])) {
            for (var rai = 0; rai < refAns.length; rai++) {
              html += (rai > 0 ? ' ｜ ' : ' ') + '空' + (rai + 1) + ': ' + refAns[rai].map(function(a) { return QuizEngine._formatQuestionText(String(a)); }).join(' 或 ');
            }
          } else if (q.type === 'code_fill') {
            for (var rci = 0; rci < refAns.length; rci++) {
              html += (rci > 0 ? ' ； ' : ' ') + '空' + (rci + 1) + '：' + QuizEngine._formatQuestionText(String(refAns[rci]));
            }
          } else {
            html += ' ' + refAns.map(function(a) { return QuizEngine._formatQuestionText(String(a)); }).join(' 或 ');
          }
        } else {
          html += ' ' + QuizEngine._formatQuestionText(String(refAns));
        }
      }
      const wbQid = q.id || ('q_' + this.filteredQuestions.indexOf(q));
      const inWB = WrongBook.getAllIds().includes(wbQid);
      html += `<button class="btn btn-outline" style="margin-left:8px;padding:2px 10px;font-size:0.82em;" onclick="QuizEngine.toggleWrongBook()">${inWB ? '移出错题本' : '加入错题本'}</button>`;
    }
    if (q.explanation) {
      html += '<div class="explanation">';
      if (typeof q.explanation === 'object' && q.explanation.steps) {
        html += q.explanation.steps.map(function(s) { return '<div>' + QuizEngine._formatQuestionText(s) + '</div>'; }).join('');
        if (q.explanation.key_point) {
          html += '<div style="margin-top:4px;"><strong>核心考点：</strong>' + QuizEngine._formatQuestionText(q.explanation.key_point) + '</div>';
        }
      } else {
        html += QuizEngine._formatQuestionText(q.explanation);
      }
      html += '</div>';
    }
    if (q.pitfall) {
      html += '<div class="pitfall">⚠️ 易错：' + QuizEngine._formatQuestionText(q.pitfall) + '</div>';
    }
    if (q.source) {
      html += '<div class="source-tag">来源：' + (q.source_detail || q.source) + '</div>';
    }

    // ── 笔记区域 ──
    html += '<div class="notes-section" style="margin-top:10px;">';
    html += '<button class="btn btn-outline btn-sm" id="notes-toggle-' + qid + '" onclick="NotesUI.toggle(\'' + qid + '\')">📝 笔记</button>';
    html += '<span id="notes-status-' + qid + '" style="font-size:0.78em;color:var(--correct);margin-left:6px;"></span>';
    html += '<div class="notes-editor" id="notes-editor-' + qid + '" style="display:none;margin-top:8px;">';
    html += '<div class="notes-toolbar">';
    html += '<button type="button" onclick="document.execCommand(\'bold\');var el=document.getElementById(\'notes-content-' + qid + '\');if(el)el.focus();" title="加粗"><b>B</b></button>';
    html += '<button type="button" onclick="document.execCommand(\'italic\');var el=document.getElementById(\'notes-content-' + qid + '\');if(el)el.focus();" title="斜体"><i>I</i></button>';
    html += '<button type="button" onclick="document.execCommand(\'underline\');var el=document.getElementById(\'notes-content-' + qid + '\');if(el)el.focus();" title="下划线"><u>U</u></button>';
    html += '<span style="font-size:0.75em;color:#999;margin-left:8px;">支持 Ctrl+V 粘贴截图，输入自动保存</span>';
    html += '</div>';
    html += '<div class="notes-content" contenteditable="true" id="notes-content-' + qid + '" data-qid="' + qid + '" data-placeholder="在这里写笔记…写完后自动保存"></div>';
    html += '</div>';
    html += '</div>';

    const wbQid = q.id || ('q_' + this.filteredQuestions.indexOf(q));
    const inWB = WrongBook.getAllIds().includes(wbQid);
    html += '<div style="margin-top:6px;"><button class="btn btn-outline btn-sm" onclick="QuizEngine.toggleWrongBook()">' + (inWB ? '移出错题本' : '+ 加入错题本') + '</button></div>';
    return html;
  },

  // 选择单选/判断题答案
  selectChoice(qid, idx) {
    const card = document.getElementById('card-' + qid);
    if (!card) return;
    card.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
    const labels = card.querySelectorAll('.option');
    if (labels[idx]) labels[idx].classList.add('selected');
    const radio = card.querySelector(`input[value="${idx}"]`);
    if (radio) radio.checked = true;
  },

  // 切换多选题选项
  toggleMulti(qid, idx) {
    const card = document.getElementById('card-' + qid);
    if (!card) return;
    const box = card.querySelector(`input[value="${idx}"]`);
    const label = card.querySelectorAll('.option')[idx];
    if (!box || !label) return;
    box.checked = !box.checked;
    label.classList.toggle('selected', box.checked);
  },

  // 获取当前用户答案
  _getUserAnswer(qid, q) {
    const card = document.getElementById('card-' + qid);
    if (!card) return null;

    if (q.type === 'choice' || q.type === 'tf') {
      const checked = card.querySelector('input[type="radio"]:checked');
      return checked ? parseInt(checked.value) : null;
    } else if (q.type === 'multi') {
      const checked = card.querySelectorAll('input[type="checkbox"]:checked');
      return Array.from(checked).map(c => parseInt(c.value));
    } else {
      const inp = card.querySelector('.q-textarea, textarea, input[type="text"]');
      return inp ? inp.value.trim() : null;
    }
  },

  // 提交当前题目
  submitCurrent() {
    if (this.filteredQuestions.length === 0) return;
    const q = this.filteredQuestions[this.currentIndex];
    const qid = q.id || ('q_' + this.currentIndex);
    const userAnswer = this._getUserAnswer(qid, q);

    // 主观题（calc/prove/fill等无法自动判分的）直接显示解析
    const isAutoGradable = (q.type === 'choice' || q.type === 'tf' || q.type === 'multi');
    if (isAutoGradable && userAnswer === null) {
      alert('请先选择一个答案');
      return;
    }

    const isCorrect = this._checkAnswer(q, userAnswer);
    this.submittedQuestions[qid] = { answer: userAnswer, isCorrect, time: Date.now() };
    this._saveProgress();

    if (!isCorrect && isCorrect !== null) {
      WrongBook.add(q.id || qid);
    } else if (isCorrect === true) {
      WrongBook.remove(q.id || qid);
    }
    // 主观题：错题本状态不变（手动控制）

    this.renderCurrent();
    this.renderQuestionNav();
    this.updateProgress();
  },

  toggleWrongBook() {
    if (this.filteredQuestions.length === 0) return;
    const q = this.filteredQuestions[this.currentIndex];
    const qid = q.id || ('q_' + this.currentIndex);
    const ids = WrongBook.getAllIds();
    if (ids.includes(qid)) {
      WrongBook.remove(qid);
    } else {
      WrongBook.add(qid);
    }
    this.renderCurrent();
  },

  // 查看解析（主观题专用）
  showExplanation() {
    if (this.filteredQuestions.length === 0) return;
    const q = this.filteredQuestions[this.currentIndex];
    const qid = q.id || ('q_' + this.currentIndex);
    const userAnswer = this._getUserAnswer(qid, q);

    this.submittedQuestions[qid] = { answer: userAnswer, isCorrect: null, time: Date.now() };
    this._saveProgress();
    this.renderCurrent();
    this.renderQuestionNav();
    this.updateProgress();
  },

  // 检查答案
  _checkAnswer(q, userAnswer) {
    if (userAnswer === null || userAnswer === undefined || userAnswer === '') return null;

    switch (q.type) {
      case 'choice':
        return userAnswer === q.answer;
      case 'tf':
        return userAnswer === q.answer;
      case 'multi': {
        const correct = Array.isArray(q.answer) ? q.answer.sort().join(',') : String(q.answer);
        const user = Array.isArray(userAnswer) ? userAnswer.sort().join(',') : String(userAnswer);
        return correct === user;
      }
      case 'fill': {
        const corrects = Array.isArray(q.answer) ? (Array.isArray(q.answer[0]) ? q.answer[0] : q.answer) : [q.answer];
        const normUser = this._normText(String(userAnswer));
        for (const c of corrects) {
          if (this._normText(String(Array.isArray(c) ? c[0] : c)) === normUser) return true;
        }
        return false;
      }
      default:
        return null; // 主观题
    }
  },

  _normText(s) {
    return s.trim().toLowerCase().replace(/[\s　]+/g, '').replace(/[.,;:!?。，、；：！？"'（）()【】\[\]]/g, '');
  },

  _stripPrefix(s) {
    return ('' + s).replace(/^[A-Fa-f][.、．)\s]+/, '');
  },

  // 持久化：保存答题进度到 localStorage
  _saveProgress() {
    try {
      localStorage.setItem('ai_quiz_progress_' + (CONFIG.token || 'default'), JSON.stringify(this.submittedQuestions));
    } catch (e) { /* quota exceeded, ignore */ }
  },

  // 持久化：从 localStorage 加载答题进度
  _loadProgress() {
    try {
      const data = localStorage.getItem('ai_quiz_progress_' + (CONFIG.token || 'default'));
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  // 导航
  nextQuestion() {
    if (this.currentIndex < this.filteredQuestions.length - 1) {
      this.currentIndex++;
      this.renderCurrent();
      this.renderQuestionNav();
    }
  },

  prevQuestion() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderCurrent();
      this.renderQuestionNav();
    }
  },

  // 更新进度
  updateProgress() {
    document.getElementById('quiz-progress').textContent = Object.keys(this.submittedQuestions).length;
    document.getElementById('quiz-total').textContent = this.filteredQuestions.length;
  },

  // 只练错题
  startWrongOnly() {
    const ids = WrongBook.getAllIds();
    if (ids.length === 0) {
      alert('错题本为空！');
      return;
    }
    this.selectQuestions('wrong_only');
    this.renderCurrent();
    this.renderQuestionNav();
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
    const quizTab = document.querySelector('nav.tabs button[data-tab="quiz"]');
    if (quizTab) quizTab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-quiz').style.display = 'block';
  },

  // ── 题目文本格式化：智能识别代码块、正确换行 ──
  _formatQuestionText(text) {
    if (!text) return '';
    var raw = String(text);

    // Step 1: 先提取围栏代码块 ```lang ... ```（避免代码内容被后续 HTML 转义污染）
    var codeBlocks = [];
    var processed = raw.replace(/```(\w*)\s*\n([\s\S]*?)```/g, function(match, lang, code) {
      var idx = codeBlocks.length;
      codeBlocks.push({ lang: (lang || '').toLowerCase(), code: code.replace(/\n+$/, '') });
      return '%%QCB_' + idx + '%%';
    });

    // Step 2: 非代码部分 HTML 转义
    processed = processed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Step 3: 行内代码 `...`
    processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Step 4: 换行 → <br>
    processed = processed.replace(/\n/g, '<br>');

    // Step 5: 还覔代码块（每行单独转义 + 语法高亮）
    for (var i = 0; i < codeBlocks.length; i++) {
      var cb = codeBlocks[i];
      var langLabel = cb.lang ? ' <span style="font-weight:400;color:#888;">' + cb.lang + '</span>' : '';
      var lines = cb.code.split('\n');
      var codeLines = lines.map(function(line) {
        var escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<span class="code-line">' + KnowledgeTree._highlightCode(escaped, cb.lang) + '</span>';
      }).join('\n');

      var blockHtml = '<div class="code-block-wrapper" style="margin:6px 0;">' +
        '<div class="code-block-header">' + langLabel + '<span>代码</span></div>' +
        '<pre><code>' + codeLines + '</code></pre>' +
        '</div>';
      processed = processed.replace('%%QCB_' + i + '%%', blockHtml);
    }

    return processed;
  },

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
};
