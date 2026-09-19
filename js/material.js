/* ==========================================================================
   material.js — 学习资料上传（黄冈中学校园网）
   老师/领导/学生会/管理员可上传（Perm.can 'material.upload'）：
   标题 + 年级 + 学科 + 说明 + 附件（≤200KB，超出提示改用说明文字）；
   所有人可见、可下载：有附件则下载附件，无附件则自动生成 .txt 资料文件；
   下载次数与看过人数均统计。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();
  PostUI.pageHead('material');

  var me = Auth.currentUser();
  var list = document.getElementById('list');
  var curGrade = 'all';

  var GRADES = ['丘班', '高一', '高二', '高三'];
  var SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '信息技术', '其他'];
  var MAX_FILE = 200 * 1024;   /* 演示环境附件上限 200KB，防 localStorage 超容 */

  var composer = document.getElementById('composer');
  if (Perm.can(me.role, 'material.upload')) {
    composer.hidden = false;
    document.getElementById('mGrade').innerHTML = GRADES.map(function (g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
    document.getElementById('mSubject').innerHTML = SUBJECTS.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');

    var fileData = null, fileName = '';
    document.getElementById('mFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      var pre = document.getElementById('mFilePre');
      fileData = null; fileName = '';
      if (!f) { pre.innerHTML = ''; return; }
      if (f.size > MAX_FILE) {
        alert('附件过大（限 200KB）：请压缩后重试，或改用「资料说明」文字形式（下载时自动生成文本文件）。');
        this.value = ''; pre.innerHTML = '';
        return;
      }
      var fr = new FileReader();
      fr.onload = function () {
        fileData = fr.result; fileName = f.name;
        pre.innerHTML = '<span class="fname">📎 ' + Common.esc(f.name) + '（' + Math.round(f.size / 1024) + 'KB）</span>';
      };
      fr.onerror = function () { alert('附件读取失败。'); pre.innerHTML = ''; };
      fr.readAsDataURL(f);
    });

    document.getElementById('btnPost').addEventListener('click', function () {
      var title = document.getElementById('mTitle').value.trim();
      var desc = document.getElementById('mInput').value.trim();
      if (!title) { alert('请填写资料标题。'); return; }
      var g = Civility.guard(title + '\n' + desc, { module: 'material', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
      if (!DB.insert('posts', {
        module: 'material', authorId: me.id, title: title, content: desc,
        grade: document.getElementById('mGrade').value,
        subject: document.getElementById('mSubject').value,
        fileURL: fileData || '', fileName: fileName,
        downloads: 0, likes: [], views: 0, shares: 0
      })) { alert('发布失败：浏览器存储空间可能已满（附件较大时可改用文字说明）。'); return; }
      document.getElementById('mTitle').value = '';
      document.getElementById('mInput').value = '';
      document.getElementById('mFile').value = '';
      fileData = null; fileName = '';
      render();
    });
  } else {
    document.getElementById('composerTip').textContent = '资料由老师/领导/学生会/管理员上传，所有人可查看与下载。';
  }

  /* ---- 年级筛选 ---- */
  var tabs = document.getElementById('gradeTabs');
  function drawTabs() {
    tabs.innerHTML = ['all'].concat(GRADES).map(function (g) {
      return '<button type="button" class="fbtn' + (g === curGrade ? ' on' : '') + '" data-grade="' + g + '">' + (g === 'all' ? '全部年级' : g) + '</button>';
    }).join('');
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-grade]') : null;
    if (!b) return;
    curGrade = b.getAttribute('data-grade');
    drawTabs();
    render();
  });

  function chips(p) {
    return '<span class="chip chip-cat">🎓 ' + p.grade + '</span>' +
           '<span class="chip">📖 ' + Common.esc(p.subject || '综合') + '</span>' +
           '<span class="chip chip-vis">⬇ 已下载 ' + (p.downloads || 0) + '</span>';
  }

  function render() {
    var rows = DB.find('posts', function (p) { return p.module === 'material'; });
    if (curGrade !== 'all') rows = rows.filter(function (p) { return p.grade === curGrade; });
    rows.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    PostUI.render(list, rows, {
      comments: false, chips: chips, downloadable: true,
      empty: '该年级暂无学习资料。',
      rerender: render
    });
  }

  drawTabs();
  render();
})();
