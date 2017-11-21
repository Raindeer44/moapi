// @flow

const EventEmitter = require('events');
const websocket = require('faye-websocket');

class Moapi extends EventEmitter {
  // TODO FLOW remove any, use real types
  settings: {[string]: any};
  pendingRequests: any;
  webSocket: any;

  constructor(settings: {[string]: any}) {
    super();
    if (!settings) {
      throw 'moapi requires a settings parameter';
    }

    this.settings = this.configure(settings);
    this.handleEvents();

    this.pendingRequests = new Map();

    this.webSocket = null;

    if (this.settings.autoConnect) {
      this.connect();
    }
  }

  configure(settings: {[string]: any}): {[string]: any} {
    const protocol: string =
      (typeof document !== 'undefined' && document.location.protocol === 'https:')
      ? 'wss://'
      : 'ws://';
    const currentHost: string =
      (typeof document !== 'undefined' && document.location.host)
      || 'localhost';
    if (!settings.webSocketUrl) {
      settings.webSocketUrl = `${protocol}${currentHost}/mopidy/ws';`
    }

    if (settings.autoConnect !== false) settings.autoConnect = true;
    if (!settings.backoffDelayMin) settings.backoffDelayMin = 1000;
    if (!settings.backoffDelayMax) settings.backoffDelaymax = 64000;
    if (!settings.callingConvention) settings.callingConvention = 'by-position-only';

    return settings;
  }

  handleEvents() {
    this.on('ws::close', this.teardown);
    this.on('ws::open', this.apiSpec);
    this.on('ws::error', this.handleWSError);
    this.on('ws::incomingMessage', this.handleMessage);
    this.on('state::offline', this.reconnect());
  }

  connect(): void {
    if (this.webSocket) {
      if (this.webSocket.readyState === websocket.Client.OPEN) {
        return;
      } else {
        this.webSocket.close();
      }
    } else {
      this.webSocket = new websocket.Client(this.settings.webSocketUrl);

      this.webSocket.onclose = (close) => {
        this.emit('ws::close', close);
      };
      this.webSocket.onerror = (error) => {
          this.emit('ws::error', error);
      };
      this.webSocket.onopen = () => {
          this.emit('ws::open');
      };
      this.webSocket.onmessage = (message) => {
          this.emit('ws::incomingMessage', message);
      };
    }
  }

  get webSocketClient(): websocket.Client {
    return websocket.Client;
  }

  teardown(): void {
    for (let [req, future] of this.pendingRequests) {
      const err = new ConnectionError('WebSocket closed');
      future.reject(err);
      this.pendingRequests.delete(req);
    }
    this.emit('state::offline');
  }
}

class ConnectionError extends Error {
  constructor(message) {
    super();
    this.name = 'ConnectionError';
    this.message = message;
  }
}

class ServerError extends Error {
  constructor(message) {
    super();
    this.name = 'ServerError';
    this.message = message;
  }
}
