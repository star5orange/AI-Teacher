// exam.js —— 模拟考试模式

const ExamMode = {
  isRunning: false,
  timerInterval: null,
  timeLeft: 0,
  examQuestions: [],
  score: 0,

  start() {
    if (this.isRunning) return;

    // 去重：按 ID + 题干内容（LLM 可能为不同知识点生成相同题目）
    var _norm = function(s) { return (s || '').replace(/\s+/g, ' ').trim(); };
    var seenText = new Set();
    var all = [];
    for (var qi = 0; qi < QUESTION_BANK.length; qi++) {
      var q = QUESTION_BANK[qi];
      var key = _norm(q.question || '');
      // 跳过同 ID 或同题干的重复题
      if (seenText.has(q.id) || (key && seenText.has('txt:' + key))) continue;
      if (q.id) seenText.add(q.id);
      if (key) seenText.add('txt:' + key);
      all.push(q);
    }

    // 按题型分组
    var typeGroups = {};
    for (var ti = 0; ti < all.length; ti++) {
      var q2 = all[ti];
      var t = q2.type || 'other';
      if (!typeGroups[t]) typeGroups[t] = [];
      typeGroups[t].push(q2);
    }
    for (const t of Object.keys(typeGroups)) {
      QuizEngine.shuffle(typeGroups[t]);
    }

    // 根据用户考试题型确定分布
    const examFmt = CONFIG.exam_format || {};
    const types = examFmt.types || examFmt;  // 兼容新旧格式

    // 标准中文题型 → 内部英文映射（动态支持任意题型）
    const typeMap = {
      '选择': 'choice', '选择题': 'choice',
      '填空': 'fill', '填空题': 'fill',
      '判断': 'tf', '判断题': 'tf',
      '计算': 'calc', '计算题': 'calc',
      '简答': 'short_answer', '简答题': 'short_answer',
      '代码填空': 'code_fill',
      '大题': 'essay',
      '证明': 'proof', '证明题': 'proof',
      '多选': 'multi', '多选题': 'multi',
    };

    // 计算总题量
    let maxQ;
    const totalCount = examFmt.total_count || 0;
    if (totalCount > 0) {
      maxQ = Math.min(totalCount, all.length);
    } else {
      const totalScore = Object.values(types).reduce((a, b) => {
        return a + (typeof b === 'object' ? b.score : b);
      }, 0) || 100;
      maxQ = Math.min(Math.round(totalScore / 2.5), all.length);
    }

    const selected = [];
    const kpSet = new Set();

    if (Object.keys(types).length > 0) {
      for (const [typeName, info] of Object.entries(types)) {
        // 尝试映射到标准英文名，没映射就用原名
        const enType = typeMap[typeName] || typeName;
        const pool = typeGroups[enType];
        if (!pool || pool.length === 0) continue;

        let count;
        if (typeof info === 'object' && info.count > 0) {
          // 新格式：用户指定了精确题数
          count = Math.min(info.count, pool.length);
        } else {
          const score = typeof info === 'object' ? info.score : info;
          const totalScore = Object.values(types).reduce((a, b) => {
            return a + (typeof b === 'object' ? b.score : b);
          }, 0);
          count = Math.max(1, Math.round(maxQ * score / totalScore));
        }

        let added = 0;
        for (const q of pool) {
          if (added >= count) break;
          if (!selected.find(s => s.id === q.id)) {
            selected.push(q);
            kpSet.add(QuizEngine._getKPId(q));
            added++;
          }
        }
      }
    } else {
      // 无用户题型 → 均匀覆盖所有题型
      const types = Object.keys(typeGroups);
      const perType = Math.max(2, Math.floor(maxQ / types.length));
      for (const t of types) {
        const pool = typeGroups[t] || [];
        let added = 0;
        for (const q of pool) {
          if (added >= perType) break;
          if (!selected.find(s => s.id === q.id)) {
            selected.push(q);
            added++;
          }
        }
      }
    }

    // 不足的从剩余题中补充
    if (selected.length < maxQ) {
      const remaining = all.filter(q => !selected.find(s => s.id === q.id));
      remaining.sort((a, b) => {
        const impOrder = { '必考': 0, '高频': 1, '常规': 2, '了解': 3 };
        return (impOrder[a.importance] || 2) - (impOrder[b.importance] || 2);
      });
      for (const q of remaining) {
        if (selected.length >= maxQ) break;
        selected.push(q);
      }
    }

    // 按用户题型定义的顺序排序
    if (Object.keys(types).length > 0) {
      const userOrder = {};
      Object.keys(types).forEach((cnType, i) => {
        userOrder[typeMap[cnType] || cnType] = i;
      });
      selected.sort((a, b) => (userOrder[a.type] != null ? userOrder[a.type] : 99) - (userOrder[b.type] != null ? userOrder[b.type] : 99));
    } else {
      const typeOrder = { choice: 0, tf: 1, multi: 2, fill: 3, code_fill: 4, short_answer: 5, calc: 6, essay: 7, prove: 8 };
      selected.sort((a, b) => (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9));
    }

    // 根据用户题型配置设置每题分值
    if (Object.keys(types).length > 0) {
      for (const [cnType, info] of Object.entries(types)) {
        const enType = typeMap[cnType] || cnType;
        const score = typeof info === 'object' ? info.score : info;
        const count = typeof info === 'object' ? (info.count || 1) : 1;
        const pts = Math.round(score / count);
        const matched = selected.filter(q => q.type === enType);
        matched.forEach(q => { q.points = pts; });
      }
    }

    this.examQuestions = selected;
    this.timeLeft = 120 * 60; // 2 小时
    this.isRunning = true;
    this.score = 0;

    // UI
    document.getElementById('start-exam-btn').style.display = 'none';
    document.getElementById('stop-exam-btn').style.display = 'inline-block';
    document.getElementById('exam-timer').style.display = 'inline';
    document.getElementById('exam-score-box').style.display = 'none';

    this._renderExam();
    this._startTimer();
  },

  stop() {
    if (!this.isRunning) return;
    if (!confirm('确认交卷？')) return;

    this.isRunning = false;
    clearInterval(this.timerInterval);
    this._gradeAll();

    document.getElementById('start-exam-btn').style.display = 'inline-block';
    document.getElementById('stop-exam-btn').style.display = 'none';
    document.getElementById('exam-timer').style.display = 'none';
    var bottomBtn = document.getElementById('exam-submit-bottom');
    if (bottomBtn) bottomBtn.style.display = 'none';
  },

  _renderExam() {
    const container = document.getElementById('exam-container');
    let html = '';

    for (let i = 0; i < this.examQuestions.length; i++) {
      const q = this.examQuestions[i];
      const qid = 'exam_' + i;

      html += `<div class="q-card" id="card-${qid}">`;
      html += `<div class="q-num">${i + 1}. (${q.points || 2}分) ${QuizEngine._getKPName(q)}</div>`;
      html += '<div class="q-text">' + QuizEngine._formatQuestionText(q.question || '') + '</div>';

      if (q.type === 'choice') {
        const opts = q.options || [];
        for (let j = 0; j < opts.length; j++) {
          html += `<label class="option" onclick="QuizEngine.selectChoice('${qid}', ${j})">`;
          html += '<input type="radio" name="' + qid + '" value="' + j + '">' + String.fromCharCode(65 + j) + '. ' + QuizEngine._formatQuestionText(QuizEngine._stripPrefix(opts[j])) + '</label>';
        }
      } else if (q.type === 'tf') {
        html += `<label class="option" onclick="QuizEngine.selectChoice('${qid}', 0)"><input type="radio" name="${qid}" value="0">正确</label>`;
        html += `<label class="option" onclick="QuizEngine.selectChoice('${qid}', 1)"><input type="radio" name="${qid}" value="1">错误</label>`;
      } else {
        html += '<textarea class="q-textarea" id="text-' + qid + '" placeholder="请输入答案（支持换行）" style="min-height:80px;"></textarea>';
      }

      html += '</div>';
    }

    html += '<div style="text-align:center;margin-top:20px;" id="exam-submit-bottom">';
    html += '<button class="btn btn-primary" onclick="ExamMode.stop()" style="font-size:16px;padding:12px 48px;">📝 交卷</button>';
    html += '</div>';

    container.innerHTML = html;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  _startTimer() {
    const el = document.getElementById('exam-timer');
    const update = () => {
      if (this.timeLeft <= 0) {
        this.stop();
        return;
      }
      const m = Math.floor(this.timeLeft / 60);
      const s = this.timeLeft % 60;
      el.textContent = '⏱ ' + m + ':' + String(s).padStart(2, '0');
      if (this.timeLeft < 300) el.classList.add('warning');
      this.timeLeft--;
    };
    update();
    this.timerInterval = setInterval(update, 1000);
  },

  _gradeAll() {
    let totalScore = 0;
    let correctCount = 0;

    for (let i = 0; i < this.examQuestions.length; i++) {
      const q = this.examQuestions[i];
      const qid = 'exam_' + i;
      const card = document.getElementById('card-' + qid);
      if (!card) continue;

      let userAnswer = null;
      if (q.type === 'choice' || q.type === 'tf') {
        const checked = card.querySelector('input[type="radio"]:checked');
        userAnswer = checked ? parseInt(checked.value) : null;
      } else {
        const ta = card.querySelector('textarea');
        userAnswer = ta ? ta.value.trim() : null;
      }

      const isCorrect = QuizEngine._checkAnswer(q, userAnswer);
      if (isCorrect === true) {
        totalScore += q.points || 2;
        correctCount++;
        card.classList.add('correct');
      } else if (isCorrect === false) {
        card.classList.add('wrong');
        WrongBook.add(q.id);
      } else {
        card.classList.add('partial');
      }

      // 禁用交互
      card.querySelectorAll('input, textarea').forEach(el => el.disabled = true);

      // 在每道题下方追加解析
      let resultHtml = '<div class="result" style="display:block;margin-top:8px;">';
      if (isCorrect === true) {
        resultHtml += '<span class="badge badge-ok">✅ 正确</span>';
      } else if (isCorrect === false) {
        resultHtml += '<span class="badge badge-no">❌ 错误</span>';
        if (q.type === 'choice' && q.options) {
          resultHtml += ' 正确答案：' + String.fromCharCode(65 + q.answer) + '. ' + QuizEngine._formatQuestionText(QuizEngine._stripPrefix(q.options[q.answer]));
        } else if (q.type === 'tf') {
          resultHtml += ' 正确答案：' + (q.answer === 0 ? '正确' : '错误');
        } else if (q.type === 'fill' || q.type === 'code_fill') {
          var answers = q.answer;
          if (Array.isArray(answers) && answers.length > 0) {
            if (Array.isArray(answers[0])) {
              resultHtml += ' 参考答案：';
              for (var ai = 0; ai < answers.length; ai++) {
                if (ai > 0) resultHtml += ' ｜ ';
                resultHtml += '空' + (ai + 1) + ': ' + answers[ai].map(function(a) { return QuizEngine._formatQuestionText(String(a)); }).join(' 或 ');
              }
            } else if (q.type === 'code_fill') {
              resultHtml += ' 参考答案：';
              for (var ci = 0; ci < answers.length; ci++) {
                if (ci > 0) resultHtml += ' ； ';
                resultHtml += '空' + (ci + 1) + '：' + QuizEngine._formatQuestionText(String(answers[ci]));
              }
            } else {
              resultHtml += ' 参考答案：' + answers.map(function(a) { return QuizEngine._formatQuestionText(String(a)); }).join(' 或 ');
            }
          } else {
            resultHtml += ' 参考答案：' + QuizEngine._formatQuestionText(String(answers || '见解析'));
          }
        } else {
          resultHtml += ' 参考答案：' + QuizEngine._formatQuestionText(String(q.answer || '见解析'));
        }
      } else {
        resultHtml += '<span class="badge badge-ref">📝 参考答案</span>';
        if (q.answer) {
          var refAns = q.answer;
          if (Array.isArray(refAns)) {
            if (refAns.length > 0 && Array.isArray(refAns[0])) {
              for (var rai = 0; rai < refAns.length; rai++) {
                resultHtml += (rai > 0 ? ' ｜ ' : ' ') + '空' + (rai + 1) + ': ' + refAns[rai].map(function(a) { return QuizEngine._formatQuestionText(String(a)); }).join(' 或 ');
              }
            } else if (q.type === 'code_fill') {
              for (var rci = 0; rci < refAns.length; rci++) {
                resultHtml += (rci > 0 ? ' ； ' : ' ') + '空' + (rci + 1) + '：' + QuizEngine._formatQuestionText(String(refAns[rci]));
              }
            } else {
              resultHtml += ' ' + refAns.map(function(a) { return QuizEngine._formatQuestionText(String(a)); }).join(' 或 ');
            }
          } else {
            resultHtml += ' ' + QuizEngine._formatQuestionText(String(refAns));
          }
        }
      }
      if (q.explanation) {
        resultHtml += '<div class="explanation">';
        if (typeof q.explanation === 'object' && q.explanation.steps) {
          resultHtml += q.explanation.steps.map(function(s) { return '<div>' + QuizEngine._formatQuestionText(s) + '</div>'; }).join('');
          if (q.explanation.key_point) {
            resultHtml += '<div style="margin-top:4px;"><strong>核心考点：</strong>' + QuizEngine._formatQuestionText(q.explanation.key_point) + '</div>';
          }
        } else {
          resultHtml += QuizEngine._formatQuestionText(q.explanation);
        }
        resultHtml += '</div>';
      }
      if (q.pitfall) {
        resultHtml += '<div class="pitfall">⚠️ 易错：' + QuizEngine._formatQuestionText(q.pitfall) + '</div>';
      }
      resultHtml += '</div>';

      // 错题本按钮 + 笔记区域
      resultHtml += '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
      if (isCorrect === false && q.id) {
        resultHtml += '<button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;" onclick="WrongBook.toggle(\'' + q.id + '\')" id="wb-btn-' + qid + '">📋 已加入错题本</button>';
      }
      resultHtml += '<button class="btn btn-outline btn-sm" id="notes-toggle-' + qid + '" onclick="NotesUI.toggle(\'' + qid + '\')">📝 笔记</button>';
      resultHtml += '<span id="notes-status-' + qid + '" style="font-size:0.78em;color:var(--correct);"></span>';
      resultHtml += '</div>';
      resultHtml += '<div class="notes-editor" id="notes-editor-' + qid + '" style="display:none;margin-top:8px;">';
      resultHtml += '<div class="notes-toolbar" style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;">';
      resultHtml += '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'bold\')" title="加粗"><b>B</b></button>';
      resultHtml += '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'italic\')" title="斜体"><i>I</i></button>';
      resultHtml += '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'underline\')" title="下划线"><u>U</u></button>';
      resultHtml += '<span style="width:1px;background:#ddd;align-self:stretch;margin:0 4px;"></span>';
      resultHtml += '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'fontSize\',false,\'1\')" title="小号字" style="font-size:10px;">A⁻</button>';
      resultHtml += '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'fontSize\',false,\'3\')" title="正常字">A</button>';
      resultHtml += '<button type="button" onmousedown="event.preventDefault();document.execCommand(\'fontSize\',false,\'5\')" title="大号字" style="font-size:14px;">A⁺</button>';
      resultHtml += '<span style="font-size:0.72em;color:#999;margin-left:4px;">Ctrl+V 贴图</span>';
      resultHtml += '</div>';
      resultHtml += '<div class="notes-content" contenteditable="true" id="notes-content-' + qid + '" data-qid="' + qid + '" data-placeholder="在这里记录解题思路…" style="min-height:60px;border:1px dashed #d0d7de;border-radius:4px;cursor:text;"></div>';
      resultHtml += '</div>';

      card.insertAdjacentHTML('beforeend', resultHtml);
    }

    this.score = totalScore;
    const maxScore = this.examQuestions.reduce((s, q) => s + (q.points || 2), 0);

    const scoreBox = document.getElementById('exam-score-box');
    scoreBox.style.display = 'block';
    document.getElementById('exam-score-num').textContent = totalScore + ' / ' + maxScore;
    scoreBox.innerHTML += `<div style="font-size:0.9em;color:var(--ink-light);">
      正确 ${correctCount} / ${this.examQuestions.length} 题 ·
      ${Math.round(totalScore / maxScore * 100)} 分
    </div>`;

    scoreBox.scrollIntoView({ behavior: 'smooth' });

    // MathJax 重新渲染
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise().catch(() => {});
    }

    // 加载每题笔记
    if (typeof NotesUI !== 'undefined') {
      var self = this;
      setTimeout(function() {
        for (var i = 0; i < self.examQuestions.length; i++) {
          NotesUI.loadNoteForQuestion('exam_' + i);
        }
      }, 200);
    }
  }
};
