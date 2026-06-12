// app.js —— 主入口：Tab 切换 + 初始化

(function() {
  const tabs = document.querySelectorAll('nav.tabs button');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      contents.forEach(c => c.style.display = 'none');
      const targetEl = document.getElementById('tab-' + target);
      if (targetEl) {
        targetEl.style.display = 'block';

        if (target === 'wrongbook') {
          WrongBook.render();
        } else if (target === 'notebook') {
          NotesUI.renderNotebook();
        } else if (target === 'cheatsheet') {
          KnowledgeTree.renderCheatSheets();
        } else if (target === 'strategies') {
          KnowledgeTree.renderStrategies();
        } else if (target === 'knowledge') {
          setTimeout(() => Charts.init(), 200);
        } else if (target === 'quiz') {
          QuizEngine.updateProgress();
        } else if (target === 'stats') {
          StatsPanel.render();
        }
      }
    });
  });

  function init() {
    KnowledgeTree.init();
    QuizEngine.init();
    WrongBook._updateBadge();
    NotesUI._updateBadges();
    Highlights.init();
    if (typeof KPDetail !== 'undefined') KPDetail.init();

    setTimeout(() => {
      Charts.init();
    }, 500);

    document.addEventListener('keydown', (e) => {
      const activeTab = document.querySelector('nav.tabs button.active');
      if (!activeTab) return;
      const tab = activeTab.dataset.tab;

      if (tab === 'quiz') {
        // 焦点在输入框内时不拦截键盘（让用户正常输入/换行）
        var focused = document.activeElement;
        var inInput = focused && (focused.tagName === 'TEXTAREA' || focused.tagName === 'INPUT' || focused.isContentEditable);
        if (!inInput) {
          if (e.key === 'ArrowRight') QuizEngine.nextQuestion();
          if (e.key === 'ArrowLeft') QuizEngine.prevQuestion();
          if (e.key === 'Enter') {
            e.preventDefault();
            QuizEngine.submitCurrent();
          }
        }
      }
    });

    console.log('📚 AI 家教 - 初始化完成');
    console.log('   课程：' + CONFIG.course);
    console.log('   题量：' + QUESTION_BANK.length);
    console.log('   用户：' + CONFIG.user_name);
    console.log('   到期：' + CONFIG.expire_at);
    console.log('   自定义程度：' + (CONFIG.source_panel.coverage_ratio || 'N/A') + '%');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
