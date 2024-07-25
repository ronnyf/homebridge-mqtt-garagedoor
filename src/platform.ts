import { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { GarageAccessory, GarageDoorOpenerAccessory } from './platformAccessory.js';
import { GarageMQTT } from './garageclient.js';

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
  private garageAccessory: GarageAccessory | null;
  private unhandledBuffers: Buffer[] = [];

  constructor(
        public readonly log: Logging,
        public readonly config: PlatformConfig,
        public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.garageAccessory = null;

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
      (async () => await this.discoverDevices(config))();
    });
  }

  getSetTopic(): string {
    return (this.config['setTopic'] as string) ?? 'garage/door/set';
  }

  getStateTopic(): string {
    return (this.config['stateTopic'] as string) ?? 'garage/door/state';
  }

  geLogTopic(): string {
    return (this.config['stateTopic'] as string) ?? 'garage/door/log';
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

  async configureDevice(config: PlatformConfig) {
    const mqttUsername = config['mqttUsername'];
    const mqttPassword = config['mqttPassword'];
    const clientID = config['mqttClientID'] ?? 'GarageMQTT';
    const mqttHost = config['mqttHost'] ?? 'mqtt://localhost:1883';

    this.log.debug('starting mqtt client');
    const client = await GarageMQTT.init(clientID, mqttUsername, mqttPassword, mqttHost);

    const subscription = await client.addSubscription([this.getSetTopic(), this.getStateTopic()]);
    this.log.debug('mqtt subscription: ', subscription);

    client.handleMessage(this.receiveMessage.bind(this));
  }

  async receiveMessage(topic: string, payload: Buffer) {
    this.log.info('received topic: ', topic);
    this.log.info('received payload: ', payload);

    if (this.garageAccessory === null) {
      this.log.debug('Accessory not configured (yet)');
      this.unhandledBuffers.push(payload);
      return;
    }

    switch (topic) {
      case this.getStateTopic():
        this.garageAccessory?.handleStateUpdate(payload);
        break;

      case this.getSetTopic():
        break;

      case this.geLogTopic():
        this.garageAccessory?.handleLogUpdate(payload);
        break;

      default:
        this.log.debug('unhandled topic message: ', topic);
        break;
    }
  }

  async discoverDevices(config: PlatformConfig) {
    this.log.debug('discovering devices:');
    await this.configureDevice(config);

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
      this.garageAccessory = new GarageDoorOpenerAccessory(this, existingAccessory, this.config);

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
      this.garageAccessory = new GarageDoorOpenerAccessory(this, accessory, this.config);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}
