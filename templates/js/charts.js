// charts.js —— 能力雷达图（Canvas 手绘，零外部依赖）

const Charts = {
  init() {
    this.drawRadar();
  },

  drawRadar() {
    const container = document.getElementById('radar-container');
    if (!container) return;
    container.innerHTML = '';

    const dimensions = this._getDimensions();
    if (dimensions.length < 3) {
      container.innerHTML = '<p style="text-align:center;color:var(--ink-light);font-size:0.9em;">刷更多题后将显示能力雷达图（至少完成3个知识点的题目）</p>';
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 340;
    canvas.height = 340;
    canvas.style.cursor = 'pointer';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const cx = 170, cy = 170, r = 120;

    const n = dimensions.length;
    const angleStep = (2 * Math.PI) / n;

    // 绘制网格
    for (let level = 1; level <= 4; level++) {
      ctx.beginPath();
      const rr = (r / 4) * level;
      for (let i = 0; i < n; i++) {
        const angle = angleStep * i - Math.PI / 2;
        const x = cx + rr * Math.cos(angle);
        const y = cy + rr * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#e8dcc8';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // 绘制轴线
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      ctx.strokeStyle = '#d6c8a8';
      ctx.stroke();
    }

    // 绘制数据区域
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2;
      const val = dimensions[i].value / 100;
      const x = cx + r * val * Math.cos(angle);
      const y = cy + r * val * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.15)';
    ctx.fill();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制节点（薄弱项用红色）
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2;
      const val = dimensions[i].value / 100;
      const x = cx + r * val * Math.cos(angle);
      const y = cy + r * val * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, dimensions[i].value < 60 ? 5 : 3, 0, 2 * Math.PI);
      ctx.fillStyle = dimensions[i].value < 60 ? '#ef4444' : '#2563eb';
      ctx.fill();
    }

    // 绘制标签
    ctx.fillStyle = '#2c2c2c';
    ctx.font = '11px "Microsoft YaHei"';
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2;
      const labelR = r + 28;
      const x = cx + labelR * Math.cos(angle);
      const y = cy + labelR * Math.sin(angle) + 4;
      const name = dimensions[i].name.length > 6 ? dimensions[i].name.substring(0, 5) + '..' : dimensions[i].name;
      ctx.fillStyle = dimensions[i].value < 60 ? '#ef4444' : '#2c2c2c';
      ctx.fillText(name + ' ' + dimensions[i].value + '%', x, y);
    }

    // 点击雷达图区域跳转到对应知识点刷题
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let minDist = Infinity, closest = null;
      for (let i = 0; i < n; i++) {
        const angle = angleStep * i - Math.PI / 2;
        const labelR = r + 28;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);
        const dist = Math.sqrt((mx - lx) ** 2 + (my - ly) ** 2);
        if (dist < minDist) { minDist = dist; closest = i; }
      }
      if (closest !== null && minDist < 60 && dimensions[closest].id) {
        Charts._jumpToKP(dimensions[closest].id, dimensions[closest].name);
      }
    });

    // 薄弱项提示
    const weakItems = dimensions.filter(d => d.value < 60);
    const hintEl = document.getElementById('radar-weak-hint');
    if (hintEl && weakItems.length > 0) {
      hintEl.innerHTML = '⚠️ 薄弱项：' + weakItems.map(d =>
        `<span style="color:#ef4444;cursor:pointer;text-decoration:underline;" onclick="Charts._jumpToKP('${d.id}','${d.name}')">${d.name}(${d.value}%)</span>`
      ).join('、') + ' — 点击直接练题';
    }
  },

  _jumpToKP(kpId, kpName) {
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
    const quizTab = document.querySelector('nav.tabs button[data-tab="quiz"]');
    if (quizTab) quizTab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-quiz').style.display = 'block';

    const selector = document.getElementById('kp-selector');
    if (selector) selector.value = kpId;
    QuizEngine.selectQuestions('by_kp', kpId);
    QuizEngine.renderCurrent();
    QuizEngine.renderQuestionNav();
  },

  _getDimensions() {
    const submitted = QuizEngine.submittedQuestions;
    const kpStats = {};

    for (const [qid, result] of Object.entries(submitted)) {
      let found = null;
      for (const item of QUESTION_BANK) {
        if (item.id === qid) { found = item; break; }
      }
      if (!found) continue;

      const kpId = QuizEngine._getKPId(found);
      if (!kpStats[kpId]) kpStats[kpId] = { correct: 0, total: 0, name: QuizEngine._getKPName(found) };
      kpStats[kpId].total++;
      if (result.isCorrect === true) kpStats[kpId].correct++;
    }

    const dims = [];
    for (const [kpId, stats] of Object.entries(kpStats)) {
      if (stats.total >= 1) {
        dims.push({
          id: kpId,
          name: stats.name || kpId,
          value: Math.round(stats.correct / stats.total * 100),
        });
      }
    }

    return dims.sort((a, b) => b.value - a.value).slice(0, 8);
  }
};
