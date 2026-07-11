(function () {
  'use strict';

  const API_BASE = 'https://api.luminya.cn/api';

  // ---------- Token 工具 ----------
  function getToken() {
    return localStorage.getItem('token');
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  function clearToken() {
    localStorage.removeItem('token');
  }

  // ---------- 核心请求 ----------
  async function request(path, options = {}) {
    const headers = { ...options.headers };
    const token = getToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const config = { ...options, headers };

    try {
      const response = await fetch(API_BASE + path, config);

      // 401 统一处理：清除 token，非登录/注册页自动跳转登录
      if (response.status === 401) {
        clearToken();
        const pathname = window.location.pathname;
        const isAuthPage = pathname.endsWith('/login.html') || pathname.endsWith('/register.html');
        if (!isAuthPage) {
          const redirect = encodeURIComponent(window.location.href);
          window.location.href = '/login.html?redirect=' + redirect;
        }
        throw new Error('未登录或登录已过期');
      }

      // 其他非 2xx 状态
      if (!response.ok) {
        let errorMsg = '请求失败 (' + response.status + ')';
        try {
          const errData = await response.json();
          if (errData.error) errorMsg = errData.error;
        } catch (_) { /* 解析失败使用默认消息 */ }
        throw new Error(errorMsg);
      }

      // 204 或空内容体直接返回 null
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return null;
      }

      return await response.json();
    } catch (error) {
      // 网络错误或手动抛出的错误，直接继续抛出给调用方
      throw error;
    }
  }

  // ---------- 公开方法 ----------
  window.LumiNyaAPI = {
    /** GET 请求 */
    get: function (path) {
      return request(path, { method: 'GET' });
    },

    /** POST 请求（JSON body） */
    post: function (path, body) {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };
      if (body !== undefined && body !== null) {
        options.body = JSON.stringify(body);
      }
      return request(path, options);
    },

    /** DELETE 请求 */
    del: function (path) {
      return request(path, { method: 'DELETE' });
    },

    /** 文件上传（multipart/form-data） */
    upload: function (path, formData) {
      // 不设置 Content-Type，让浏览器自动处理 boundary
      return request(path, {
        method: 'POST',
        body: formData
      });
    },

    // Token 工具（供登录/注册页使用）
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken
  };
})();