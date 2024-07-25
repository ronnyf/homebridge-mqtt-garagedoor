import mqtt, { IClientOptions, IClientSubscribeOptions, ISubscriptionGrant, MqttClient, OnMessageCallback } from 'mqtt';

export class GarageMQTT {

  private; 

  private client: MqttClient;
  private constructor(client: MqttClient) {
    this.client = client;
  }

  public static async init(clientID: string, username: string, password: string, host: string): Promise<GarageMQTT> {
    
    const opts: IClientOptions = {
      clientId : clientID,
      rejectUnauthorized: false,
      clean: true,
      username: username,
      password: password,
    };

    const client = await mqtt.connectAsync(host, opts);
    return new GarageMQTT(client);
  }

  getConnected(): boolean { 
    return this.client.connected;
  }

  getClient(): MqttClient {
    return this.client;
  }

  async addSubscription(topic: string | string[]): Promise<ISubscriptionGrant[]> { 
    const opts: IClientSubscribeOptions = { qos: 1 }; 
    // qos: 1 means we want the message to arrive at least once but don't care if it arrives twice (or more
    return this.client.subscribeAsync(topic, opts);
  }

  async readMessage(topic: string): Buffer {
    this.client.on('message', (topic, payload) => {
      
    });
  }

  async handleMessage(callback: OnMessageCallback) {
    this.client.on('message', callback);
  }

}