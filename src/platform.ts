import { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { GarageDoorOpenerAccessory } from './platformAccessory.js';
import { GarageMQTT } from './garageclient.js';
import { GarageState } from './garagestate.js';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class GarageDoorOpenerPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  private garageAccessory: GarageDoorOpenerAccessory | null;
  private garageClient: GarageMQTT | null;
  private garageState: GarageState;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.garageAccessory = null;
    this.garageClient = null;

    // start with closed state
    this.garageState = new GarageState(api.hap.Characteristic.CurrentDoorState.CLOSED, api);

    this.log.debug('Finished initializing platform:', this.config.name);

    // Homebridge 1.8.0 introduced a `log.success` method that can be used to log success messages
    // For users that are on a version prior to 1.8.0, we need a 'polyfill' for this method
    if (!log.success) {
      log.success = log.info;
    }

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  async cleanup() {
    await this.garageClient?.disconnect();
  }

  getTargetTopic(): string {
    return (this.config['targetTopic'] as string) ?? 'garage/door/target';
  }

  getCurrentTopic(): string {
    return (this.config['currentTopic'] as string) ?? 'garage/door/current';
  }

  geLogTopic(): string {
    return (this.config['stateTopic'] as string) ?? 'garage/door/log';
  }

  getCurrentDoorStateClosed(): number {
    return this.Characteristic.CurrentDoorState.CLOSED;
  }

  getCurrentDoorStateOpen(): number {
    return this.Characteristic.CurrentDoorState.OPEN;
  }

  /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to set up event handlers for characteristics and update respective values.
     */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    const mqttUsername = this.config['mqttUsername'];
    const mqttPassword = this.config['mqttPassword'];
    const clientID = this.config['mqttClientID'] ?? 'GarageMQTT';
    const mqttHost = this.config['mqttHost'] ?? 'mqtt://localhost:1883';

    const client = await this.connectAndSubscribe(clientID, mqttUsername, mqttPassword, mqttHost);
    // at this point we should be connected and should have established a connection...
    this.garageClient = client;

    //for closed, target and current point to the same value (1)

    this.garageState.updateCurrentState(this.getCurrentDoorStateClosed());
    this.garageState.updateTargetState(this.getCurrentDoorStateClosed());

    // const targetTopic = this.config['targetTopic'];
    // if (targetTopic) {
    //   this.garageState.on('target', (value) => {
    //     this.log.info('publishing target update: ', value);
    //     client.publishValue(targetTopic, value);
    //   });
    // } else {
    //   this.log.error('targetTopic not defined');
    // }

    // let's assume closed as the initial state
    this.initializeAccessory();
  }

  async connectAndSubscribe(clientID: string, username: string, password: string, host: string): Promise<GarageMQTT> {
    this.log.debug('starting mqtt client');
    const client = await GarageMQTT.init(clientID, username, password, host);

    const subscription = await client.addSubscription([this.getTargetTopic(), this.getCurrentTopic()]);
    this.log.debug('mqtt subscriptions: ', subscription);

    client.onMessage(this.receiveMessage.bind(this));

    return client;
  }

  async receiveMessage(topic: string, payload: Buffer) {
    this.log.debug('received topic: ', topic, 'payload: ', payload);
    if (this.garageAccessory === null) {
      this.log.debug('garageAccessory is null, initializing...');
      this.initializeAccessory();
    }

    this.handleTopic(topic, payload);
  }

  handleTopic(topic: string, payload: Buffer) {
    const stringValue = payload.toString('ascii');
    
    switch (topic) {
      case this.getCurrentTopic():
        {
          const value = this.mapCurrentDoorState(stringValue);
          if (value > -1) {
            this.garageState.updateCurrentState(value);
            this.log.debug('did update current state: :', value);
          } else {
            this.log.error('unknown door state value ', value, ' for payload: ', stringValue);
          }
        }
        break;

      case this.getTargetTopic():
      {
        const value = this.mapTargetDoorState(stringValue);
        if (value > -1) {
          this.garageState.updateTargetState(value);
          this.log.debug('did update target state: :', value);
        } else {
          this.log.error('unknown door state value ', value, ' for payload: ', stringValue);
        }
        break;
      }

      default:
        this.log.debug('unhandled topic message: ', topic);
        break;
    }
  }

  initializeAccessory() {
    if (this.garageAccessory !== null) {
      this.log.error('Accessory already initialized');
      return;
    }

    this.log.debug('initializing Garage Door Opener Accessory...');

    const deviceID = 'GD01';
    const deviceDisplayName = 'Garage Door Opener';

    // generate a unique id for the accessory this should be generated from
    // something globally unique, but constant, for example, the device serial
    // number or MAC address
    const uuid = this.api.hap.uuid.generate(deviceID);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName);

      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
      // existingAccessory.context.device = device;
      // this.api.updatePlatformAccessories([existingAccessory]);

      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      this.garageAccessory = new GarageDoorOpenerAccessory(this, existingAccessory, this.garageState);

      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
      // remove platform accessories when no longer present
      // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
      // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.debug('Adding new accessory:', deviceDisplayName);

      // create a new accessory
      const accessory = new this.api.platformAccessory(deviceDisplayName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      // accessory.context.device = device;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      this.garageAccessory = new GarageDoorOpenerAccessory(this, accessory, this.garageState);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  mapCurrentDoorState(value: string): number {
    switch (value) {
      case '0':
        return this.Characteristic.CurrentDoorState.OPEN;

      case '1':
        return this.Characteristic.CurrentDoorState.CLOSED;

      case '2':
        return this.Characteristic.CurrentDoorState.OPENING;

      case '3':
        return this.Characteristic.CurrentDoorState.CLOSING;

      case '4':
        return this.Characteristic.CurrentDoorState.STOPPED;

      default:
        return -1;
    }
  }

  mapTargetDoorState(value: string): number {
    switch (value) {
      case '0':
        return this.Characteristic.TargetDoorState.OPEN;

      case '1':
        return this.Characteristic.TargetDoorState.CLOSED;

      default:
        return -1;
    }
  }
}
