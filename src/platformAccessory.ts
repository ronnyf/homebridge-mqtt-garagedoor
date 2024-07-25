import { Service, PlatformAccessory, CharacteristicValue, PlatformConfig } from 'homebridge';
import { GarageDoorOpenerPlatform } from './platform.js';

export interface GarageAccessory {
    handleStateUpdate(payload: Buffer): void;
    handleLogUpdate(payload: Buffer): void;
}

export class GarageDoorOpenerAccessory implements GarageAccessory {
  private service: Service;

  private doorStates = {
    Current: 0,
    Target: 0,
  };

  constructor(
    private readonly platform: GarageDoorOpenerPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: PlatformConfig,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.GarageDoorOpener) 
        || this.accessory.addService(this.platform.Service.GarageDoorOpener);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.exampleDisplayName);

    // register handlers for the TargetDoorState Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState)
      .onSet(this.setTargetDoorState.bind(this))
      .onGet(this.getTargetDoorState.bind(this));

    // register handlers for the CurrentDoorState Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .onGet(this.getCurrentDoorState.bind(this));
  }

  async handleStateUpdate(payload: Buffer) {
    this.platform.log.info('state update: ', payload);
  }

  async handleLogUpdate(payload: Buffer) {
    this.platform.log.info('log update: ', payload);
  }

  async setTargetDoorState(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    this.doorStates.Target = value as number;

    this.platform.log.debug('Set Characteristic On ->', value);
  }

  async getTargetDoorState(): Promise<CharacteristicValue> {
    const state = this.doorStates.Target;

    this.platform.log.debug('Get TargetDoorState ->', state);
    return state;
  }

  async getCurrentDoorState(): Promise<CharacteristicValue> {
    const state = this.doorStates.Current;

    this.platform.log.debug('Get CurrentDoorState ->', state);
    return state;
  }
}