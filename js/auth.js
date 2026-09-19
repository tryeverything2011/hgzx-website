/* ==========================================================================
   auth.js — 会话与密码处理（黄冈中学校园网）
   —— 密码口径（见 GOAL.md）：密码仅存哈希、不落明文；本地与云端
      一律 SHA-256（纯 JS 同步实现 + 固定站点盐）。云端模式同样只同步哈希值，
      登录与唯一性查重均哈希比对。
   —— 兼容：早期演示版曾用 djb2（'djb2$' 前缀）。verify() 对旧哈希仍可校验，
      且用户成功登录一次后自动把该账户的口令哈希升级为 SHA-256。
   —— 登录凭证（v1.5）：昵称 + 密码；昵称注册时全站唯一（见 common.checkDup）。
      历史身份证号字段已停用：不再采集、不再参与登录，云端历史 idcard 列留空。
   —— 封禁：status === 'banned' 的账户登录被拦截；已登录设备在下次进入页面
      时由 Common.nav() 检出并强制退出。
   —— 会话：登录后写入 session 表（持久保存即会话保持），退出登录时删除；
      session 属设备本地状态，不参与云端同步。
   ========================================================================== */
var Auth = (function () {

  var SALT = 'hgzx::2026::site-salt::';   // 固定站点盐（防彩虹包基础口径；演示级非每用户盐）

  /* ---- SHA-256（纯 JS 同步实现；入参先转 UTF-8 字节串） ---- */
  function utf8(str) {
    str = String(str == null ? '' : str);
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out += String.fromCharCode(c);
      else if (c < 0x800) out += String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF);
        out += String.fromCharCode(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out += String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function sha256raw(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mp = Math.pow, maxWord = mp(2, 32), result = '', words = [];
    var asciiBitLength = ascii.length * 8;
    var hash = sha256raw.h = sha256raw.h || [];
    var k = sha256raw.k = sha256raw.k || [];
    var primeCounter = k.length;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mp(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mp(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return '';    // 仅接受字节串（调用方已先转 UTF-8）
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16);
      var oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((hash[4] & hash[5]) ^ (~hash[4] & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))
          ) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
          + ((hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }
  function sha256hex(str) { return sha256raw(utf8(str)); }

  /* 对外哈希：sha256$<hex>（前缀用于区分历史 djb2 哈希） */
  function hash(str) { return 'sha256$' + sha256hex(SALT + String(str == null ? '' : str)); }

  /* 旧版 djb2（仅用于校验历史数据，不再用于新数据） */
  function djb2(str) {
    str = String(str == null ? '' : str);
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = (h * 33 + str.charCodeAt(i)) >>> 0;
    }
    return 'djb2$' + h.toString(16);
  }
  function isLegacy(h) { return typeof h === 'string' && h.indexOf('djb2$') === 0; }
  function verify(stored, input) {
    if (isLegacy(stored)) return djb2(input) === stored;
    return stored === hash(input);
  }

  /* 当前登录用户（依据 session 表还原），未登录返回 null */
  function currentUser() {
    var s = DB.get('session', null);
    if (!s || !s.uid) return null;
    return DB.findOne('users', function (u) { return u.id === s.uid; });
  }

  /* 登录：昵称 + 密码（v1.5；管理员另需申请码）；封禁账户拦截；旧哈希懒升级 */
  function login(nickname, pass, code) {
    nickname = String(nickname == null ? '' : nickname).trim();
    if (!nickname) return { ok: false, msg: '请输入昵称。' };
    var u = DB.findOne('users', function (x) {
      return String(x.nickname || '').trim() === nickname;
    });
    if (!u) return { ok: false, msg: '账户不存在，请核对昵称或先注册。' };
    if (!verify(u.pass, pass)) return { ok: false, msg: '密码不正确，请重试。' };
    if (u.status === 'banned') {
      return { ok: false, msg: '该账户已被封禁，无法登录。' + (u.bannedReason ? '原因：' + u.bannedReason : '') };
    }
    if (u.role === 'admin' && !Perm.verifyCode('admin', code)) {
      return { ok: false, msg: '管理员登录需要正确的申请码。' };
    }
    /* 历史数据升级：djb2 → SHA-256（登录时输入即明文来源，重哈希安全） */
    if (isLegacy(u.pass)) {
      DB.update('users', u.id, { pass: hash(pass) });
      u = DB.findOne('users', function (x) { return x.id === u.id; }) || u;
    }
    DB.set('session', { uid: u.id, loginAt: Date.now() });  // 持久保存 = 会话保持
    return { ok: true, user: u };
  }

  function logout() { DB.del('session'); }

  function role() { var u = currentUser(); return u ? u.role : null; }
  function is(r) { return role() === r; }

  /* 页面守卫：未登录自动跳转登录页（pages/ 子目录需回根目录，与 common.js rootPrefix 口径一致） */
  function ensureLogin() {
    if (!currentUser()) {
      location.href = (/\/pages\//.test(location.pathname) ? '../' : '') + 'login.html';
      return false;
    }
    return true;
  }

  return { hash: hash, verify: verify, isLegacy: isLegacy,
           currentUser: currentUser, login: login, logout: logout,
           role: role, is: is, ensureLogin: ensureLogin };
})();
