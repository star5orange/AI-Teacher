// stats.js —— 答题统计面板

const StatsPanel = {
  render() {
    const container = document.getElementById('stats-container');
    if (!container) return;

    const submitted = QuizEngine.submittedQuestions;
    const entries = Object.entries(submitted);
    const totalDone = entries.length;

    if (totalDone === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--ink-light);padding:40px;">还没有答题记录，快去刷题吧！</div>';
      return;
    }

    const correctCount = entries.filter(([, r]) => r.isCorrect === true).length;
    const wrongCount = entries.filter(([, r]) => r.isCorrect === false).length;
    const subjectiveCount = entries.filter(([, r]) => r.isCorrect === null).length;
    const autoGradable = entries.filter(([, r]) => r.isCorrect !== null);
    const accuracy = autoGradable.length > 0 ? Math.round(correctCount / autoGradable.length * 100) : 0;

    // 按题型统计
    const typeStats = {};
    for (const [qid, result] of entries) {
      const q = QUESTION_BANK.find(q => q.id === qid);
      if (!q) continue;
      const type = q.type || 'other';
      const typeLabel = {choice: '选择题', tf: '判断题', multi: '多选题', fill: '填空题', calc: '计算题', prove: '证明题', short_answer: '简答题', code_fill: '代码填空', essay: '大题'}[type] || type;
      if (!typeStats[typeLabel]) typeStats[typeLabel] = { correct: 0, wrong: 0, subjective: 0, total: 0 };
      typeStats[typeLabel].total++;
      if (result.isCorrect === true) typeStats[typeLabel].correct++;
      else if (result.isCorrect === false) typeStats[typeLabel].wrong++;
      else typeStats[typeLabel].subjective++;
    }

    // 按知识点统计
    const kpStats = {};
    for (const [qid, result] of entries) {
      const q = QUESTION_BANK.find(q => q.id === qid);
      if (!q) continue;
      const kpName = QuizEngine._getKPName(q);
      if (!kpStats[kpName]) kpStats[kpName] = { correct: 0, wrong: 0, subjective: 0, total: 0 };
      kpStats[kpName].total++;
      if (result.isCorrect === true) kpStats[kpName].correct++;
      else if (result.isCorrect === false) kpStats[kpName].wrong++;
      else kpStats[kpName].subjective++;
    }

    // 每日刷题数（最近7天）
    const dailyStats = {};
    const now = Date.now();
    for (let d = 6; d >= 0; d--) {
      const date = new Date(now - d * 86400000);
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      dailyStats[key] = { total: 0, correct: 0 };
    }
    for (const [qid, result] of entries) {
      const date = new Date(result.time);
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      if (dailyStats[key]) {
        dailyStats[key].total++;
        if (result.isCorrect === true) dailyStats[key].correct++;
      }
    }

    let html = '';

    // 总览卡片
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">';
    html += this._statCard('已做题数', totalDone + ' / ' + QUESTION_BANK.length, 'var(--accent)');
    html += this._statCard('客观题正确率', accuracy + '%', accuracy >= 70 ? 'var(--correct)' : 'var(--wrong)');
    html += this._statCard('错题数', wrongCount, wrongCount > 0 ? 'var(--wrong)' : 'var(--correct)');
    html += this._statCard('主观题已看解析', subjectiveCount, 'rgba(0,0,0,0.1)');
    html += '</div>';

    // 每日刷题柱状图
    html += '<div class="source-panel" style="margin-bottom:14px;">';
    html += '<h3 style="margin:0 0 8px;font-size:1em;">📅 近7日刷题量</h3>';
    const maxDaily = Math.max(...Object.values(dailyStats).map(d => d.total), 1);
    for (const [date, stats] of Object.entries(dailyStats)) {
      const pct = Math.round(stats.total / maxDaily * 100);
      const correctPct = stats.total > 0 ? Math.round(stats.correct / stats.total * 100) : 0;
      html += `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:0.85em;">`;
      html += `<span style="width:80px;color:var(--ink-light);">${date.slice(5)}</span>`;
      html += `<div style="flex:1;background:#f0ede0;border-radius:3px;height:18px;position:relative;">`;
      html += `<div style="width:${pct}%;background:var(--accent);border-radius:3px;height:100%;opacity:0.7;"></div>`;
      html += `</div>`;
      html += `<span style="width:60px;text-align:right;">${stats.total}题</span>`;
      html += `<span style="width:50px;text-align:right;color:var(--ink-light);">${stats.total > 0 ? correctPct + '%' : '-'}</span>`;
      html += '</div>';
    }
    html += '</div>';

    // 按题型统计
    html += '<div class="source-panel" style="margin-bottom:14px;">';
    html += '<h3 style="margin:0 0 8px;font-size:1em;">📊 各题型正确率</h3>';
    for (const [type, stats] of Object.entries(typeStats)) {
      const autoTotal = stats.correct + stats.wrong;
      const typeAcc = autoTotal > 0 ? Math.round(stats.correct / autoTotal * 100) : -1;
      html += '<div style="margin:6px 0;">';
      html += `<div style="display:flex;justify-content:space-between;font-size:0.9em;"><span>${type}</span>`;
      html += `<span>${stats.total}题 · ${typeAcc >= 0 ? typeAcc + '%正确' : '主观题'}</span></div>`;
      if (typeAcc >= 0) {
        html += `<div style="background:rgba(0,0,0,0.06);border-radius:3px;height:8px;margin-top:3px;">`;
        html += `<div style="width:${typeAcc}%;background:${typeAcc >= 70 ? 'var(--correct)' : 'var(--wrong)'};border-radius:3px;height:100%;"></div>`;
        html += '</div>';
      } else if (stats.subjective > 0) {
        html += `<div style="background:rgba(0,0,0,0.06);border-radius:3px;height:8px;margin-top:3px;">`;
        html += `<div style="width:100%;background:rgba(0,0,0,0.08);border-radius:3px;height:100%;"></div>`;
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // 按知识点统计
    html += '<div class="source-panel" style="margin-bottom:14px;">';
    html += '<h3 style="margin:0 0 8px;font-size:1em;">📚 各知识点掌握度</h3>';
    const sortedKP = Object.entries(kpStats).sort((a, b) => {
      const accA = a[1].correct + a[1].wrong > 0 ? a[1].correct / (a[1].correct + a[1].wrong) : -1;
      const accB = b[1].correct + b[1].wrong > 0 ? b[1].correct / (b[1].correct + b[1].wrong) : -1;
      return accA - accB;
    });
    for (const [kp, stats] of sortedKP) {
      const autoTotal = stats.correct + stats.wrong;
      const kpAcc = autoTotal > 0 ? Math.round(stats.correct / autoTotal * 100) : -1;
      html += '<div style="margin:6px 0;">';
      html += `<div style="display:flex;justify-content:space-between;font-size:0.9em;"><span>${kp}</span>`;
      html += `<span>${stats.total}题 · ${kpAcc >= 0 ? kpAcc + '%' : '仅主观题'}</span></div>`;
      if (kpAcc >= 0) {
        html += `<div style="background:#f0ede0;border-radius:3px;height:8px;margin-top:3px;">`;
        html += `<div style="width:${kpAcc}%;background:${kpAcc >= 70 ? 'var(--correct)' : kpAcc >= 40 ? 'rgba(0,0,0,0.1)' : 'var(--wrong)'};border-radius:3px;height:100%;"></div>`;
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // 学习建议
    const weakKPs = sortedKP.filter(([, s]) => {
      const autoTotal = s.correct + s.wrong;
      return autoTotal > 0 && s.correct / autoTotal < 0.6;
    });
    if (weakKPs.length > 0) {
      html += '<div class="source-panel" style="border-left:3px solid var(--wrong);">';
      html += '<h3 style="margin:0 0 8px;font-size:1em;">🎯 建议重点复习</h3>';
      for (const [kp] of weakKPs) {
        html += `<div style="margin:4px 0;font-size:0.9em;">• ${kp}</div>`;
      }
      html += '<div style="margin-top:8px;"><button class="btn btn-primary" onclick="StatsPanel._practiceWeak()">针对性练习薄弱项</button></div>';
      html += '</div>';
    }

    container.innerHTML = html;
  },

  _statCard(label, value, color) {
    return `<div style="flex:1;min-width:120px;background:var(--card-bg);border:1px solid var(--card-border);border-radius:var(--radius);padding:12px;text-align:center;">
      <div style="font-size:1.5em;font-weight:700;color:${color};">${value}</div>
      <div style="font-size:0.8em;color:var(--ink-light);margin-top:2px;">${label}</div>
    </div>`;
  },

  _practiceWeak() {
    const submitted = QuizEngine.submittedQuestions;
    const weakIds = [];
    for (const [qid, result] of Object.entries(submitted)) {
      if (result.isCorrect === false) {
        const q = QUESTION_BANK.find(q => q.id === qid);
        if (q) weakIds.push(q.id);
      }
    }
    const wrongIds = WrongBook.getAllIds();
    for (const id of wrongIds) {
      if (!weakIds.includes(id)) weakIds.push(id);
    }
    if (weakIds.length === 0) {
      alert('没有薄弱项，继续保持！');
      return;
    }
    QuizEngine.filteredQuestions = QUESTION_BANK.filter(q => weakIds.includes(q.id));
    QuizEngine.shuffle(QuizEngine.filteredQuestions);
    QuizEngine.currentIndex = 0;
    QuizEngine.renderCurrent();

    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
    const quizTab = document.querySelector('nav.tabs button[data-tab="quiz"]');
    if (quizTab) quizTab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-quiz').style.display = 'block';
  }
};
