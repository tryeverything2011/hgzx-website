/* ==========================================================================
   chatui.js — QQ 式消息交互公共组件（黄冈中学校园网）
   供 chat（闲聊吧）与 wall/say/rant/event/life/qa 等消息发送页复用：
   ① 表情面板：Unicode 表情，点击插入光标处，纯前端无依赖；
   ② 输入工具栏：表情 / 图片 / 附件入口（图片沿用 Common.compressImage
      压缩≤300KB；附件单文件≤1MB，超限前端提示拒绝）；
   ③ 附件采集：ChatUI.take(容器) → { images:[dataURL], files:[{name,size,url}] }，
      供发布时随消息写入（消息结构仅做向后兼容增量：images/files 数组）；
   ④ 纯逻辑辅助：关键词高亮、文件体积格式化、日期分组标签、气泡动作条。
   说明：Node 无 DOM 环境下仅暴露纯逻辑 API（供自动化测试），不执行初始化。
   加载顺序：storage → permission → civility → auth → seed → common → 本文件。
   ========================================================================== */
var ChatUI = (function () {

  /* ---------- 常量 ---------- */
  var IMG_MAX = 4;                    /* 单条消息最多图片张数 */
  var FILE_MAX = 2;                   /* 单条消息最多附件个数 */
  var FILE_SIZE_MAX = 1024 * 1024;    /* 单个附件 ≤1MB，超限前端拒绝 */
  var EMOJIS = (
    '😀 😁 😂 🤣 😊 🥰 😍 😘 😜 🤪 😎 🥳 🤔 😅 😴 😭 ' +
    '😡 🥺 😇 🤗 🙄 😏 😯 🤯 😱 🤡 👍 👏 🙏 💪 🤝 ✌️ ' +
    '🎉 🔥 ✨ 💯 ❤️ 💔 💕 🌹 🌈 ☀️ ⭐ 🌙 ⚡ 🍀 🎊 🎁 ' +
    '🍕 🍔 🍜 🍚 🧋 🏀 ⚽ 🎮 🎵 📚 ✏️ 💤 🐶 🐱 🐮 🚀 🫶'
  ).split(/\s+/);

  /* ---------- 纯逻辑工具（可在无 DOM 环境测试） ---------- */

  /* 关键词高亮：先转义再包裹，保证零注入；kw 为空返回纯转义文本 */
  function highlight(text, kw) {
    var esc = String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    var k = String(kw == null ? '' : kw).trim();
    if (!k) return esc;
    var ek = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return esc.replace(new RegExp(ek, 'gi'), function (m) {
      return '<mark class="hl">' + m + '</mark>';
    });
  }

  /* 文件体积格式化 */
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + 'B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB';
    return (n / 1024 / 1024).toFixed(2) + 'MB';
  }

  /* 附件体积校验（超限返回拒绝原因；与口径一致：单文件≤1MB） */
  function checkFile(file) {
    if (!file) return { ok: false, msg: '未选择文件。' };
    if (file.size > FILE_SIZE_MAX) {
      return { ok: false, msg: '附件「' + file.name + '」超过 1MB 上限，已拒绝。请压缩后再试。' };
    }
    return { ok: true, msg: '' };
  }

  /* 日期分组标签：今天 / 昨天 / 其余 YYYY-MM-DD（与 Common.fmtTime 口径一致） */
  function dateLabel(ts) {
    var d = new Date(ts || 0);
    var now = new Date();
    function pad(x) { return (x < 10 ? '0' : '') + x; }
    function key(x) { return x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate(); }
    if (key(d) === key(now)) return '今天';
    var y = new Date(now.getTime() - 86400000);
    if (key(d) === key(y)) return '昨天';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* 光标处插入文本（QQ 输入体验） */
  function insertAtCursor(ta, text) {
    if (!ta) return;
    var st = ta.scrollTop;
    if (typeof ta.selectionStart === 'number') {
      var a = ta.selectionStart, b = ta.selectionEnd;
      ta.value = ta.value.slice(0, a) + text + ta.value.slice(b);
      ta.selectionStart = ta.selectionEnd = a + text.length;
    } else {
      ta.value += text;
    }
    if (typeof ta.focus === 'function') ta.focus();   /* 真实 DOM 聚焦；无 DOM 环境（测试桩）跳过 */
    ta.scrollTop = st;
  }

  /* 气泡操作条（点赞/分享/上报/删除，闲聊吧专用；权限口径与原逻辑一致） */
  function actBar(cid, opts) {
    opts = opts || {};
    var h = '<div class="b-acts" id="bacts-' + cid + '">';
    if (opts.like) h += '<button type="button" data-act="like" data-cid="' + cid + '">👍 赞</button>';
    if (opts.share) h += '<button type="button" data-act="share" data-cid="' + cid + '">⤴ 分享</button>';
    if (opts.report) h += '<button type="button" data-act="report" data-cid="' + cid + '">🚩 上报</button>';
    if (opts.del) h += '<button type="button" class="b-danger" data-act="del" data-cid="' + cid + '">🗑 删除</button>';
    return h + '</div>';
  }

  var api = {
    EMOJIS: EMOJIS, IMG_MAX: IMG_MAX, FILE_MAX: FILE_MAX, FILE_SIZE_MAX: FILE_SIZE_MAX,
    highlight: highlight, fmtSize: fmtSize, checkFile: checkFile,
    dateLabel: dateLabel, insertAtCursor: insertAtCursor, actBar: actBar
  };

  /* Node/无 DOM 环境：到此为止，仅暴露纯逻辑 */
  if (typeof document === 'undefined') return api;

  /* ================= DOM 初始化（浏览器环境） ================= */

  var panel = null;          /* 全局唯一表情面板 */
  var curTarget = null;      /* 面板当前插入目标 textarea */
  var picked = new Map();    /* 文件 input 元素 → { images:[], files:[] } */

  /* ---- 表情面板 ---- */
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'emoji-panel';
    var grid = '<div class="emoji-grid">';
    for (var i = 0; i < EMOJIS.length; i++) {
      grid += '<button type="button" data-em="' + EMOJIS[i] + '">' + EMOJIS[i] + '</button>';
    }
    panel.innerHTML = '<div class="ep-cap">青春表情 · 点击插入输入框</div>' + grid + '</div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-em]') : null;
      if (!b) return;
      if (curTarget) insertAtCursor(curTarget, b.getAttribute('data-em'));
    });
    return panel;
  }

  function togglePanel(btn) {
    var p = ensurePanel();
    var ta = emojiTarget(btn);
    var wasOpen = p.classList.contains('open') && curTarget === ta;
    p.classList.remove('open');
    if (wasOpen) { curTarget = null; return; }
    curTarget = ta;
    var r = btn.getBoundingClientRect();
    p.style.visibility = 'hidden';
    p.classList.add('open');
    var w = p.offsetWidth, hgt = p.offsetHeight;
    var left = Math.min(Math.max(8, r.left + window.scrollX), window.scrollX + document.documentElement.clientWidth - w - 8);
    var top = r.top + window.scrollY - hgt - 8;
    if (top < window.scrollY + 4) top = r.bottom + window.scrollY + 8;
    p.style.left = left + 'px';
    p.style.top = top + 'px';
    p.style.visibility = '';
  }

  /* 表情按钮的插入目标：data-emoji-target 选择器 或 就近容器内的 textarea */
  function emojiTarget(btn) {
    var sel = btn.getAttribute('data-emoji-target');
    if (sel) {
      var el = document.querySelector(sel);
      if (el) return el;
    }
    var sels = ['.ct-bar', '.cmt-box', '.composer', '.wx-input'];
    for (var i = 0; i < sels.length; i++) {
      var box = btn.closest(sels[i]);
      if (!box) continue;
      var ta = box.querySelector('textarea');
      if (ta) return ta;           /* 工具栏与 textarea 常为兄弟节点，需向外层继续找 */
    }
    return null;
  }

  /* ---- 预览渲染 ---- */
  function renderPrev(input) {
    var st = picked.get(input);
    if (!st) return;
    var box = input.parentElement.querySelector('.ct-prev');
    if (!box) return;
    var h = '';
    for (var i = 0; i < st.images.length; i++) {
      h += '<span class="ct-th"><img src="' + st.images[i] + '" alt="图片预览">' +
           '<button type="button" class="ct-x" data-ct-rm="img" data-ct-i="' + i + '" title="移除">×</button></span>';
    }
    for (var j = 0; j < st.files.length; j++) {
      var f = st.files[j];
      h += '<span class="ct-fchip"><span class="ct-fi">📎</span>' +
           '<span><span class="ct-fn">' + escHtml(f.name) + '</span> <span class="ct-fs">' + fmtSize(f.size) + '</span></span>' +
           '<button type="button" class="ct-x" data-ct-rm="file" data-ct-i="' + j + '" title="移除">×</button></span>';
    }
    box.innerHTML = h;
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---- 发布采集：取走并清空容器内所有工具栏的已选附件 ---- */
  function take(container) {
    var out = { images: [], files: [] };
    if (!container || !container.querySelectorAll) return out;
    var ins = container.querySelectorAll('input[data-ct-role]');
    for (var i = 0; i < ins.length; i++) {
      var st = picked.get(ins[i]);
      if (!st) continue;
      out.images = out.images.concat(st.images);
      out.files = out.files.concat(st.files);
      st.images = []; st.files = [];
      renderPrev(ins[i]);
    }
    return out;
  }

  /* ---- .composer 自动注入工具栏（表情+图片+附件） ---- */
  function injectComposer(sec) {
    if (sec.getAttribute('data-ct-done')) return;
    sec.setAttribute('data-ct-done', '1');
    var ta = sec.querySelector('textarea');
    var hasFile = !!sec.querySelector('input[type="file"]');
    var wantImg = !hasFile && sec.getAttribute('data-ct-img') !== '0';
    var wantFile = sec.getAttribute('data-ct-file') !== '0';
    var foot = sec.querySelector('.composer-foot');
    var bar = document.createElement('div');
    bar.className = 'ct-bar';
    var h = '<button type="button" class="ct-btn" data-ct-emoji>😊 表情</button>';
    if (wantImg) h += '<button type="button" class="ct-btn" data-ct-pick="img">🖼 图片</button>';
    if (wantFile) h += '<button type="button" class="ct-btn" data-ct-pick="file">📎 附件</button>';
    h += '<div class="ct-prev"></div>';
    bar.innerHTML = h;
    if (wantImg) {
      var ii = document.createElement('input');
      ii.type = 'file'; ii.accept = 'image/*'; ii.multiple = true; ii.hidden = true;
      ii.setAttribute('data-ct-role', 'img');
      bar.appendChild(ii);
    }
    if (wantFile) {
      var fi = document.createElement('input');
      fi.type = 'file'; fi.multiple = true; fi.hidden = true;
      fi.setAttribute('data-ct-role', 'file');
      bar.appendChild(fi);
    }
    if (foot && foot.parentElement === sec) sec.insertBefore(bar, foot);
    else sec.appendChild(bar);
  }

  /* ---- 全局事件委托 ---- */
  function bindDelegates() {
    document.addEventListener('click', function (e) {
      var em = e.target.closest ? e.target.closest('[data-ct-emoji],[data-emoji-btn]') : null;
      if (em) { togglePanel(em); return; }
      var pick = e.target.closest ? e.target.closest('[data-ct-pick]') : null;
      if (pick) {
        var bar = pick.closest('.ct-bar');
        var inp = bar ? bar.querySelector('input[data-ct-role="' + pick.getAttribute('data-ct-pick') + '"]') : null;
        if (inp) inp.click();
        return;
      }
      var rm = e.target.closest ? e.target.closest('[data-ct-rm]') : null;
      if (rm) {
        var bar2 = rm.closest('.ct-bar');
        var ins = bar2 ? bar2.querySelector('input[data-ct-role]') : null;
        var st = ins ? picked.get(ins) : null;
        if (st) {
          if (rm.getAttribute('data-ct-rm') === 'img') st.images.splice(Number(rm.getAttribute('data-ct-i')), 1);
          else st.files.splice(Number(rm.getAttribute('data-ct-i')), 1);
          renderPrev(ins);
        }
        return;
      }
      /* 点击面板/工具栏以外区域关闭表情面板 */
      if (panel && panel.classList.contains('open') &&
          !e.target.closest('.emoji-panel') && !e.target.closest('[data-ct-emoji],[data-emoji-btn]')) {
        panel.classList.remove('open');
      }
    });

    document.addEventListener('change', function (e) {
      var inp = e.target;
      var role = inp.getAttribute && inp.getAttribute('data-ct-role');
      if (!role) return;
      var fs = inp.files || [];
      if (!fs.length) return;
      var bar = inp.closest('.ct-bar');
      if (bar && !picked.has(inp)) picked.set(inp, { images: [], files: [] });
      var st = picked.get(inp);
      if (role === 'img') {
        (function next(k) {
          if (k >= fs.length) { inp.value = ''; return; }
          if (st.images.length >= IMG_MAX) { alert('一条消息最多带 ' + IMG_MAX + ' 张图片。'); inp.value = ''; renderPrev(inp); return; }
          Common.compressImage(fs[k], 1280, function (durl) {
            if (durl) { st.images.push(durl); renderPrev(inp); }
            else alert('图片读取失败，请换一张试试。');
            next(k + 1);
          });
        })(0);
      } else {
        for (var i = 0; i < fs.length; i++) {
          var c = checkFile(fs[i]);
          if (!c.ok) { alert(c.msg); continue; }
          if (st.files.length >= FILE_MAX) { alert('一条消息最多带 ' + FILE_MAX + ' 个附件。'); break; }
          addFile(fs[i], inp, st);
        }
        inp.value = '';
        renderPrev(inp);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel) panel.classList.remove('open');
    });

    /* 图片点击放大（气泡图与帖子配图通用） */
    document.addEventListener('click', function (e) {
      var img = e.target.closest ? e.target.closest('.b-imgs img, .p-imgs img') : null;
      if (!img) return;
      openLightbox(img.getAttribute('src'));
    });
  }

  function addFile(file, inp, st) {
    var fr = new FileReader();
    fr.onload = function () {
      st.files.push({ name: file.name, size: file.size, url: fr.result });
      renderPrev(inp);
    };
    fr.onerror = function () { alert('附件「' + file.name + '」读取失败。'); };
    fr.readAsDataURL(file);
  }

  /* ---- 图片大图查看 ---- */
  var lb = null;
  function openLightbox(src) {
    if (!src) return;
    if (!lb) {
      lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.innerHTML = '<img alt="查看大图">';
      lb.addEventListener('click', function () { lb.classList.remove('open'); });
      document.body.appendChild(lb);
    }
    lb.querySelector('img').src = src;
    lb.classList.add('open');
  }

  /* ---- 初始化：注入所有 .composer（脚本位于页尾，DOM 已就绪） ---- */
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
    function boot() {
      bindDelegates();
      var secs = document.querySelectorAll('.composer:not([data-ct-done])');
      for (var i = 0; i < secs.length; i++) injectComposer(secs[i]);
    }
  }
  init();

  return {
    EMOJIS: EMOJIS, IMG_MAX: IMG_MAX, FILE_MAX: FILE_MAX, FILE_SIZE_MAX: FILE_SIZE_MAX,
    highlight: highlight, fmtSize: fmtSize, checkFile: checkFile,
    dateLabel: dateLabel, insertAtCursor: insertAtCursor, actBar: actBar,
    take: take, openLightbox: openLightbox, injectComposer: injectComposer
  };
})();
