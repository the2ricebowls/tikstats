class ProxyManager {
  constructor() {
    this.proxies = [];
    this.currentIndex = 0;
    this.lastRequestTime = {};
    this.minDelay = 1000;

    console.log('Proxy Manager initialized');
  }

  parseProxyString(proxyStr) {
    const parts = proxyStr.split(':');

    if (parts.length < 2) {
      throw new Error('Invalid proxy format. Expected: IP:PORT:USER:PASS or IP:PORT');
    }

    return {
      host: parts[0],
      port: parts[1],
      username: parts[2] || '',
      password: parts[3] || ''
    };
  }

  formatProxyString(proxy) {
    if (proxy.username && proxy.password) {
      return `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`;
    }

    return `${proxy.host}:${proxy.port}`;
  }

  getAll() {
    return this.proxies.map((p, index) => ({
      id: index,
      proxy: this.formatProxyString(p),
      host: p.host,
      port: p.port,
      username: p.username || '',
      hasAuth: !!(p.username && p.password),
      enabled: p.enabled !== false,
      lastUsed: this.lastRequestTime[this.formatProxyString(p)] || null
    }));
  }

  add(proxyStr) {
    try {
      const parsed = this.parseProxyString(proxyStr);
      const proxy = {
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
        enabled: true
      };

      const proxyKey = this.formatProxyString(proxy);
      if (this.proxies.some(p => this.formatProxyString(p) === proxyKey)) {
        throw new Error('Proxy already exists');
      }

      this.proxies.push(proxy);
      this.lastRequestTime[proxyKey] = 0;

      console.log(`Added proxy: ${proxyKey}`);
      return proxy;
    } catch (error) {
      throw new Error(`Invalid proxy format: ${error.message}`);
    }
  }

  remove(id) {
    if (id < 0 || id >= this.proxies.length) {
      throw new Error('Invalid proxy ID');
    }

    const proxy = this.proxies[id];
    const proxyKey = this.formatProxyString(proxy);
    delete this.lastRequestTime[proxyKey];
    this.proxies.splice(id, 1);

    console.log(`Removed proxy: ${proxyKey}`);
  }

  toggle(id) {
    if (id < 0 || id >= this.proxies.length) {
      throw new Error('Invalid proxy ID');
    }

    this.proxies[id].enabled = !this.proxies[id].enabled;
    console.log(`Toggled proxy ${id}: ${this.proxies[id].enabled ? 'enabled' : 'disabled'}`);

    return this.proxies[id].enabled;
  }

  getActiveCount() {
    return this.proxies.filter(p => p.enabled).length;
  }

  getActive() {
    return this.proxies.filter(p => p.enabled);
  }

  getNext() {
    const enabledProxies = this.getActive();

    if (enabledProxies.length === 0) {
      return null;
    }

    const proxy = enabledProxies[this.currentIndex % enabledProxies.length];
    this.currentIndex++;

    return proxy;
  }

  async waitIfNeeded(proxyKey) {
    const now = Date.now();
    const lastTime = this.lastRequestTime[proxyKey] || 0;
    const elapsed = now - lastTime;

    if (elapsed < this.minDelay) {
      await sleep(this.minDelay - elapsed);
    }

    this.lastRequestTime[proxyKey] = Date.now();
  }

  formatForAxios(proxy) {
    if (!proxy) return null;

    return {
      host: proxy.host,
      port: parseInt(proxy.port),
      auth: proxy.username && proxy.password ? {
        username: proxy.username,
        password: proxy.password
      } : undefined
    };
  }

  clear() {
    this.proxies = [];
    this.lastRequestTime = {};
    this.currentIndex = 0;
    console.log('Cleared all proxies');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const proxyManager = new ProxyManager();

module.exports = proxyManager;
