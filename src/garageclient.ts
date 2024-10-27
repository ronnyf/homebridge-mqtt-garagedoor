// eslint-disable-next-line max-len
import { Logger } from 'homebridge';
import mqtt, { 
  IClientOptions, IClientPublishOptions, 
  IClientSubscribeOptions, ISubscriptionGrant, 
  MqttClient, OnMessageCallback, 
} from 'mqtt';
import { QoS } from 'mqtt-packet';

export class GarageMQTT {

  private client: MqttClient | null;
  private readonly log: Logger;

  constructor(client: MqttClient | null, log: Logger) {
    this.client = client;
    this.log = log;
  }

  async connectAsync(clientID: string, username: string, password: string, host: string): Promise<void> {
    this.log.debug('connecting async... (user: ', username, '), password: (****)');
    const opts: IClientOptions = {
      clientId: clientID,
      rejectUnauthorized: true,
      clean: true,
      username: username,
      password: password,
    };
    const client = await mqtt.connectAsync(host, opts);
    this.log.debug('did connect, client: ', client);
    this.client = client;
  }

  reconnect(): boolean {
    if (this.client === null) {
      return false; 
    }
    if (this.client.connected === true) {
      return true;
    }
    this.client = this.client.reconnect();
    return this.client !== null;
  }
  
  getConnected(): boolean {
    if (this.client === null) {
      return false; 
    }
    return this.client.connected;
  }

  getClient(): MqttClient | null {
    return this.client;
  }

  async addSubscription(topic: string | string[], qos: QoS = 0): Promise<ISubscriptionGrant[] | null> { 
    const opts: IClientSubscribeOptions = { qos: qos }; // at most once (1 would be ok would be multiple times)
    // qos: 1 means we want the message to arrive at least once but don't care if it arrives twice (or more
    if (this.client === null) { 
      return null;
    }
    return this.client.subscribeAsync(topic, opts);
  }

  onMessage(callback: OnMessageCallback) {
    if (this.client === null) {
      return false; 
    }
    this.client.on('message', callback);
  }

  publish(topic: string, message: string, opts: IClientPublishOptions) {
    this.client?.publish(topic, message, opts);
  }

  publishValue<V>(topic: string, value: V, qos: QoS = 0, retain: boolean = false) {
    const stringValue = String(value);
    if (stringValue !== undefined) {
      const opts: IClientPublishOptions = {
        qos: qos,
        retain: retain,
      };
      this.publish(topic, stringValue, opts);
    }
  }

  async disconnect() { 
    return this.client?.endAsync();
  }

}