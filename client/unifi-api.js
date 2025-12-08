// UniFi API Client Library
// Handles authentication and API calls to UniFi Dream Router / UniFi OS devices

import https from 'https';

export class UniFiAPI {
  constructor(config) {
    this.host = config.host;
    this.port = config.port || 443;
    this.username = config.username;
    this.password = config.password;
    this.site = config.site || 'default';
    this.ignoreSsl = config.ignoreSsl !== false;

    this.baseUrl = `https://${this.host}:${this.port}`;
    this.cookie = null;
    this.csrfToken = null;
  }

  /**
   * Make an HTTP request to the UniFi controller
   */
  async request(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      // Add cookie if authenticated
      if (this.cookie) {
        options.headers['Cookie'] = this.cookie;
      }

      // Add CSRF token if available
      if (this.csrfToken) {
        options.headers['X-CSRF-Token'] = this.csrfToken;
      }

      // Ignore SSL errors for self-signed certificates
      if (this.ignoreSsl) {
        options.rejectUnauthorized = false;
      }

      const req = https.request(url, options, (res) => {
        let body = '';

        // Save cookies from response
        if (res.headers['set-cookie']) {
          this.cookie = res.headers['set-cookie'].map(cookie => cookie.split(';')[0]).join('; ');
        }

        // Save CSRF token if present
        if (res.headers['x-csrf-token']) {
          this.csrfToken = res.headers['x-csrf-token'];
        }

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(body);
              resolve(json);
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Login to UniFi controller
   */
  async login() {
    try {
      const response = await this.request('POST', '/api/auth/login', {
        username: this.username,
        password: this.password,
        remember: false
      });

      // UniFi OS returns user data on successful login (no meta.rc field)
      // Check for either meta.rc === 'ok' OR user data with username
      if ((response.meta && response.meta.rc === 'ok') || response.username) {
        console.log('✓ Logged in to UniFi controller');
        return true;
      } else {
        throw new Error('Login failed: Invalid credentials or insufficient permissions');
      }
    } catch (error) {
      // Provide more helpful error messages
      let errorMsg = error.message;
      if (errorMsg.includes('401') || errorMsg.includes('403')) {
        errorMsg += ' - User may need Administrator role (not View-Only)';
      }
      throw new Error(`Login failed: ${errorMsg}`);
    }
  }

  /**
   * Logout from UniFi controller
   */
  async logout() {
    try {
      await this.request('POST', '/api/auth/logout');
      this.cookie = null;
      this.csrfToken = null;
      console.log('✓ Logged out from UniFi controller');
    } catch (error) {
      console.error('Logout error:', error.message);
    }
  }

  /**
   * Get all active clients (connected devices)
   */
  async getActiveClients() {
    try {
      // UniFi OS uses /proxy/network prefix
      const response = await this.request('GET', `/proxy/network/api/s/${this.site}/stat/sta`);

      if (response.meta && response.meta.rc === 'ok') {
        return response.data || [];
      } else {
        throw new Error('Failed to get active clients');
      }
    } catch (error) {
      throw new Error(`Get active clients failed: ${error.message}`);
    }
  }

  /**
   * Get all known clients (including inactive)
   */
  async getAllClients() {
    try {
      const response = await this.request('GET', `/proxy/network/api/s/${this.site}/rest/user`);

      if (response.meta && response.meta.rc === 'ok') {
        return response.data || [];
      } else {
        throw new Error('Failed to get all clients');
      }
    } catch (error) {
      throw new Error(`Get all clients failed: ${error.message}`);
    }
  }

  /**
   * Parse client data into simplified format
   */
  parseClient(client) {
    const now = Math.floor(Date.now() / 1000);

    return {
      mac: client.mac,
      ip: client.ip || null,
      hostname: client.hostname || client.name || null,
      name: client.name || client.hostname || null,
      manufacturer: client.oui || null,
      device_type: this.getDeviceType(client),
      is_wired: client.is_wired || false,
      rx_bytes: client.rx_bytes || 0,
      tx_bytes: client.tx_bytes || 0,
      rx_rate: client.rx_rate || 0,
      tx_rate: client.tx_rate || 0,
      signal: client.signal || null,
      channel: client.channel || null,
      essid: client.essid || null,
      first_seen: client.first_seen || now,
      last_seen: client.last_seen || now
    };
  }

  /**
   * Determine device type from client data
   */
  getDeviceType(client) {
    if (client.is_wired) {
      return 'wired';
    }

    // Try to determine from manufacturer or other hints
    const oui = (client.oui || '').toLowerCase();

    if (oui.includes('apple')) {
      return 'apple';
    } else if (oui.includes('samsung')) {
      return 'android';
    } else if (oui.includes('google')) {
      return 'android';
    } else if (oui.includes('amazon')) {
      return 'iot';
    } else if (oui.includes('ring') || oui.includes('nest') || oui.includes('ecobee')) {
      return 'iot';
    }

    return client.is_wired ? 'wired' : 'wireless';
  }

  /**
   * Test connection to UniFi controller
   */
  async testConnection() {
    try {
      await this.login();
      const clients = await this.getActiveClients();
      console.log(`✓ Connection successful - Found ${clients.length} active client(s)`);
      await this.logout();
      return true;
    } catch (error) {
      console.error(`✗ Connection test failed: ${error.message}`);
      return false;
    }
  }
}
