// auth.js —— Token 校验 + 设备绑定 + 到期管理

(function() {
  const DEVICE_ID_KEY = 'ai_quiz_device_id';
  const ACTIVATED_KEY = 'ai_quiz_activated';

  function generateDeviceId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 32; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id + '_' + Date.now().toString(36);
  }

  function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 3600 * 1000);
    document.cookie = name + '=' + value + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  let deviceId = getCookie(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = generateDeviceId();
    setCookie(DEVICE_ID_KEY, deviceId, 365);
    setCookie(ACTIVATED_KEY, Date.now(), 365);
  }

  const expireAt = new Date(CONFIG.expire_at).getTime();
  const now = Date.now();

  if (now > expireAt) {
    // 已到期 → 显示到期页面，但保留错题本和统计的只读访问
    document.getElementById('expired-page').style.display = 'block';
    document.querySelector('nav.tabs').style.display = '';
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('renewal-banner').style.display = 'none';

    // 只保留错题本和统计 Tab 可用（只读）
    const allowedTabs = ['wrongbook', 'stats'];
    document.querySelectorAll('nav.tabs button').forEach(btn => {
      const tab = btn.dataset.tab;
      if (!allowedTabs.includes(tab)) {
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
      } else {
        btn.style.borderBottomColor = 'var(--wrong)';
      }
    });

    // 默认显示错题本
    const wbTab = document.querySelector('nav.tabs button[data-tab="wrongbook"]');
    if (wbTab) wbTab.click();

    // 初始化只读模块
    if (typeof WrongBook !== 'undefined') {
      QuizEngine.submittedQuestions = QuizEngine._loadProgress();
      WrongBook._updateBadge();
      WrongBook.render();
    }

    return;
  }

  // 到期前提醒
  const hoursLeft = (expireAt - now) / 3600000;
  if (hoursLeft < 48) {
    const banner = document.getElementById('renewal-banner');
    banner.style.display = 'block';
    updateCountdown(expireAt);

    if (CONFIG.days === 1 && hoursLeft < 2) {
      banner.innerHTML = banner.innerHTML.replace('27 元', '27 元（总计30元）');
    }
  }

  function updateCountdown(expire) {
    const el = document.getElementById('countdown-text');
    function tick() {
      const left = expire - Date.now();
      if (left <= 0) {
        el.textContent = '已到期';
        location.reload();
        return;
      }
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      el.textContent = h + ' 小时 ' + m + ' 分钟';
    }
    tick();
    setInterval(tick, 60000);
  }
})();
