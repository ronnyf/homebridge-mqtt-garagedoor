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

  getClient(): MqttClient {
    return this.client;
  }

  async addSubscription(topic: string | string[]): Promise<ISubscriptionGrant[]> { 
    const opts: IClientSubscribeOptions = { qos: 1 };
    return this.client.subscribeAsync(topic, opts);
  }

  async handleMessage(callback: OnMessageCallback) {
    this.client.on('message', callback);
  }

}