// learner-profile.js —— 学习者画像 + 回顾清单
// 在学习手册页面内使用，localStorage 持久化

const LearnerProfile = {
  STORAGE_KEY: 'ai_learner_profile',
  REVIEW_KEY: 'ai_review_list',

  // ============ 读写 ============

  /** 获取完整画像 */
  get() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : this._defaultProfile();
    } catch (e) {
      return this._defaultProfile();
    }
  },

  _defaultProfile() {
    return {
      language: '',
      direction: '',
      known: [],
      confused: [],
      learned: [],
      created_at: null,
      updated_at: null,
    };
  },

  /** 保存完整画像 */
  save(profile) {
    profile.updated_at = new Date().toISOString();
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.warn('[LearnerProfile] save failed:', e);
    }
  },

  /** 检查是否需要初始设置 */
  needsSetup() {
    const p = this.get();
    return !p.created_at;
  },

  // ============ 标记操作 ============

  /** 标记一个概念为"已掌握" */
  markKnown(concept) {
    const p = this.get();
    // 从 confused 中移除
    p.confused = p.confused.filter(c => c !== concept);
    // 加入 known（去重）
    if (!p.known.includes(concept)) {
      p.known.push(concept);
    }
    this.save(p);
  },

  /** 标记一个概念为"还不清楚" */
  markConfused(concept) {
    const p = this.get();
    // 从 known 中移除
    p.known = p.known.filter(c => c !== concept);
    // 加入 confused（去重）
    if (!p.confused.includes(concept)) {
      p.confused.push(concept);
    }
    this.save(p);
  },

  /** 记录一个已完成的学习主题 */
  addLearnedTopic(topic, depth) {
    const p = this.get();
    // 去重：同 topic 只保留最新
    p.learned = p.learned.filter(l => l.topic !== topic);
    p.learned.push({
      topic: topic,
      date: new Date().toISOString().slice(0, 10),
      depth: depth || 'balanced',
    });
    this.save(p);
  },

  /** 标记初始设置已完成 */
  completeSetup(profile) {
    profile.created_at = new Date().toISOString();
    profile.updated_at = new Date().toISOString();
    this.save(profile);
  },

  // ============ 便捷查询 ============

  getKnown() { return this.get().known; },
  getConfused() { return this.get().confused; },
  getLearned() { return this.get().learned; },

  /** 检查某概念是否已掌握 */
  isKnown(concept) {
    return this.get().known.includes(concept);
  },

  /** 检查某概念是否标记为困惑 */
  isConfused(concept) {
    return this.get().confused.includes(concept);
  },

  // ============ 回顾清单（替代错题本） ============

  /** 获取回顾清单 */
  getReviewList() {
    try {
      const raw = localStorage.getItem(this.REVIEW_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  /** 添加一条回顾 */
  addToReview(concept, sectionId, sectionTitle, note) {
    const list = this.getReviewList();
    // 去重
    const existing = list.find(r => r.concept === concept);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.updated_at = new Date().toISOString();
      if (note) existing.note = note;
    } else {
      list.push({
        concept: concept,
        section_id: sectionId || '',
        section_title: sectionTitle || '',
        note: note || '',
        count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    try {
      localStorage.setItem(this.REVIEW_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[LearnerProfile] review save failed:', e);
    }
  },

  /** 移除一条回顾 */
  removeFromReview(concept) {
    const list = this.getReviewList().filter(r => r.concept !== concept);
    try {
      localStorage.setItem(this.REVIEW_KEY, JSON.stringify(list));
    } catch (e) {}
  },

  /** 清空回顾清单 */
  clearReview() {
    localStorage.removeItem(this.REVIEW_KEY);
  },

  // ============ 导入/导出 ============

  /** 导出画像为 JSON 字符串 */
  exportJSON() {
    return JSON.stringify(this.get(), null, 2);
  },

  /** 从 JSON 字符串导入画像 */
  importJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (data.known || data.confused || data.learned) {
        this.save(data);
        return true;
      }
    } catch (e) {
      console.warn('[LearnerProfile] import failed:', e);
    }
    return false;
  },

  /** 导出回顾清单 */
  exportReviewJSON() {
    return JSON.stringify(this.getReviewList(), null, 2);
  },
};

// ============ UI：初始设置向导 ============

const ProfileSetupWizard = {
  /** 渲染设置向导 */
  render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="setup-wizard" style="
        background: var(--card-bg); border: 1px solid var(--card-border);
        border-radius: 12px; padding: 20px 24px; margin: 16px 0;
      ">
        <h3 style="margin:0 0 4px 0;font-size:1.1em;">欢迎使用 AI Teacher</h3>
        <p style="margin:0 0 16px 0;color:var(--ink-light);font-size:0.85em;">
          花 1 分钟设置你的学习者画像，让生成内容更懂你。
        </p>

        <div style="margin-bottom:14px;">
          <label style="font-weight:600;font-size:0.9em;">你最熟悉的编程语言 / 技术</label>
          <input type="text" id="setup-language" placeholder="如：Python, JavaScript"
            style="width:100%;padding:8px 12px;border:1px solid var(--card-border);
                   border-radius:6px;font-size:0.9em;margin-top:4px;font-family:inherit;">
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-weight:600;font-size:0.9em;">你目前在做什么方向</label>
          <select id="setup-direction" style="
            width:100%;padding:8px 12px;border:1px solid var(--card-border);
            border-radius:6px;font-size:0.9em;margin-top:4px;font-family:inherit;">
            <option value="">请选择</option>
            <option value="Web 后端">Web 后端</option>
            <option value="前端">前端</option>
            <option value="移动端">移动端</option>
            <option value="AI / ML">AI / ML</option>
            <option value="DevOps">DevOps</option>
            <option value="数据科学">数据科学</option>
            <option value="游戏开发">游戏开发</option>
            <option value="其他">其他</option>
          </select>
        </div>

        <div style="margin-bottom:18px;">
          <label style="font-weight:600;font-size:0.9em;">有什么概念你一直没搞明白？（选填）</label>
          <input type="text" id="setup-confused" placeholder="如：异步编程, Docker, WebSocket"
            style="width:100%;padding:8px 12px;border:1px solid var(--card-border);
                   border-radius:6px;font-size:0.9em;margin-top:4px;font-family:inherit;">
        </div>

        <button onclick="ProfileSetupWizard.submit()" style="
          width:100%;padding:10px;background:#2c3e6b;color:#fff;border:none;
          border-radius:8px;font-size:0.95em;font-weight:600;cursor:pointer;">
          完成设置
        </button>
      </div>
    `;
  },

  submit() {
    const language = document.getElementById('setup-language').value.trim();
    const direction = document.getElementById('setup-direction').value;
    const confusedRaw = document.getElementById('setup-confused').value.trim();

    const profile = {
      language: language,
      direction: direction,
      known: language ? language.split(/[,，\s]+/).filter(Boolean) : [],
      confused: confusedRaw ? confusedRaw.split(/[,，\s]+/).filter(Boolean) : [],
      learned: [],
    };

    LearnerProfile.completeSetup(profile);

    // 移除向导
    const wizard = document.querySelector('.setup-wizard');
    if (wizard) wizard.remove();

    console.log('[Setup] 画像初始化完成:', profile);
  },
};

// ============ UI：标记按钮组件 ============

const MarkButtons = {
  /**
   * 在指定容器内渲染标记按钮
   * @param containerId 容器元素 ID
   * @param concept 概念名
   * @param sectionId 节 ID
   * @param sectionTitle 节标题
   */
  render(containerId, concept, sectionId, sectionTitle) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const known = LearnerProfile.isKnown(concept);
    const confused = LearnerProfile.isConfused(concept);

    container.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;margin-top:12px;
                  padding:10px 0;border-top:1px solid var(--divider);font-size:0.85em;">
        <span style="color:var(--ink-light);">标记状态：</span>
        <button class="mark-btn mark-understood ${known ? 'active' : ''}"
                onclick="MarkButtons.toggleKnown('${this._esc(concept)}')"
                style="${this._btnStyle(known, '#22c55e')}">
          ${known ? '✓' : '○'} 我理解了
        </button>
        <button class="mark-btn mark-confused ${confused ? 'active' : ''}"
                onclick="MarkButtons.toggleConfused('${this._esc(concept)}', '${this._esc(sectionId)}', '${this._esc(sectionTitle)}')"
                style="${this._btnStyle(confused, '#f59e0b')}">
          ${confused ? '✓' : '○'} 还不太清楚
        </button>
      </div>
    `;
  },

  _btnStyle(active, color) {
    return [
      'padding:4px 12px;border:1px solid ' + (active ? color : 'var(--card-border)') + ';',
      'border-radius:6px;cursor:pointer;font-size:0.85em;',
      'background:' + (active ? color.replace(')', '0.15)').replace('rgb', 'rgba') : 'transparent') + ';',
      'color:' + (active ? color : 'var(--ink-light)') + ';',
      'transition:all 0.15s;',
    ].join('');
  },

  toggleKnown(concept) {
    if (LearnerProfile.isKnown(concept)) {
      // 取消标记（回退到未标记状态）
      const p = LearnerProfile.get();
      p.known = p.known.filter(c => c !== concept);
      LearnerProfile.save(p);
    } else {
      LearnerProfile.markKnown(concept);
    }
    location.reload(); // 简单粗暴，也可以只重绘按钮
  },

  toggleConfused(concept, sectionId, sectionTitle) {
    if (LearnerProfile.isConfused(concept)) {
      LearnerProfile.removeFromReview(concept);
      const p = LearnerProfile.get();
      p.confused = p.confused.filter(c => c !== concept);
      LearnerProfile.save(p);
    } else {
      LearnerProfile.markConfused(concept);
      // 同时加入回顾清单
      LearnerProfile.addToReview(concept, sectionId, sectionTitle, '');
    }
    location.reload();
  },

  _esc(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;');
  },
};

// ============ UI：回顾清单面板 ============

const ReviewPanel = {
  render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const list = LearnerProfile.getReviewList();

    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:30px;color:var(--ink-light);font-size:0.9em;">
          回顾清单为空——你还没有标记过"不清楚"的概念。
        </div>`;
      return;
    }

    const rows = list.map(r => `
      <div style="display:flex;align-items:center;gap:12px;
                  padding:8px 12px;border-bottom:1px solid var(--divider);font-size:0.88em;">
        <span style="flex:1;">
          <strong>${this._esc(r.concept)}</strong>
          ${r.section_title ? '<span style="color:var(--ink-light);font-size:0.85em;">(' + this._esc(r.section_title) + ')</span>' : ''}
        </span>
        <span style="color:var(--ink-light);font-size:0.78em;">标记 ${r.count} 次</span>
        <button onclick="ReviewPanel.remove('${this._esc(r.concept)}')"
                style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.85em;">
          移除
        </button>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="background:var(--card-bg);border:1px solid var(--card-border);
                  border-radius:10px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px 16px;background:#f8fafc;font-weight:700;font-size:0.9em;">
          <span>📝 回顾清单（${list.length}）</span>
          <button onclick="ReviewPanel.clearAll()"
                  style="background:none;border:none;color:var(--ink-light);cursor:pointer;font-size:0.8em;">
            清空
          </button>
        </div>
        ${rows}
      </div>
    `;
  },

  remove(concept) {
    LearnerProfile.removeFromReview(concept);
    const p = LearnerProfile.get();
    p.confused = p.confused.filter(c => c !== concept);
    LearnerProfile.save(p);
    this.render('review-panel');
  },

  clearAll() {
    if (!confirm('确定清空回顾清单？')) return;
    LearnerProfile.clearReview();
    this.render('review-panel');
  },

  _esc(str) {
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
