// wrongbook.js —— 错题本

const WrongBook = {
  STORAGE_KEY: 'ai_quiz_wrongbook_' + (CONFIG.token || 'default'),

  getAllIds() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  _save(ids) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(ids));
  },

  add(qid) {
    const ids = this.getAllIds();
    if (!ids.includes(qid)) {
      ids.push(qid);
      this._save(ids);
    }
    this._updateBadge();
  },

  remove(qid) {
    const ids = this.getAllIds().filter(id => id !== qid);
    this._save(ids);
    this._updateBadge();
  },

  clear() {
    if (confirm('确定清空错题本？此操作不可恢复。')) {
      localStorage.removeItem(this.STORAGE_KEY);
      this._updateBadge();
      this.render();
    }
  },

  getByKnowledgePoint() {
    const ids = this.getAllIds();
    const groups = {};
    for (const id of ids) {
      const q = QUESTION_BANK.find(q => q.id === id);
      if (q) {
        const kp = QuizEngine._getKPName(q);
        if (!groups[kp]) groups[kp] = [];
        groups[kp].push(q);
      }
    }
    return groups;
  },

  render() {
    const container = document.getElementById('wrongbook-container');
    if (!container) return;

    const groups = this.getByKnowledgePoint();
    const kps = Object.keys(groups);
    const total = this.getAllIds().length;

    if (total === 0) {
      container.innerHTML = '<div class="wrongbook-empty">🎉 错题本为空，继续保持！</div>';
      this._updateBadge();
      return;
    }

    let html = `<p style="color:var(--ink-light);font-size:0.9em;">共 ${total} 道错题，按知识点分组：</p>`;
    for (const kp of kps) {
      const qs = groups[kp];
      html += `<h3 style="font-size:1em;margin-top:14px;">${kp}（${qs.length}题）</h3>`;
      html += '<ul class="wrongbook-list">';
      for (const q of qs) {
        const qText = (q.question || '').substring(0, 60);
        html += `<li style="display:flex;justify-content:space-between;align-items:center;">`;
        html += `<span style="cursor:pointer;flex:1;" onclick="WrongBook._jumpToQuiz('${q.id}')">${qText}...</span>`;
        html += `<button class="btn btn-outline btn-sm" style="flex-shrink:0;" onclick="event.stopPropagation();WrongBook.remove('${q.id}');WrongBook.render();">删除</button>`;
        html += `</li>`;
      }
      html += '</ul>';
    }
    container.innerHTML = html;
    this._updateBadge();
  },

  _jumpToQuiz(qid) {
    const idx = QUESTION_BANK.findIndex(q => q.id === qid);
    if (idx >= 0) {
      QuizEngine.filteredQuestions = [QUESTION_BANK[idx]];
      QuizEngine.currentIndex = 0;
      QuizEngine.renderCurrent();
      document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
      const quizTab = document.querySelector('nav.tabs button[data-tab="quiz"]');
      if (quizTab) quizTab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
      document.getElementById('tab-quiz').style.display = 'block';
    }
  },

  _updateBadge() {
    const el = document.getElementById('wrong-count');
    if (el) {
      const count = this.getAllIds().length;
      el.textContent = count > 0 ? '(' + count + ')' : '';
    }
  }
};
