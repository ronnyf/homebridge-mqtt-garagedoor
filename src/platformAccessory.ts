import { Service, PlatformAccessory, CharacteristicValue, Characteristic } from 'homebridge';
import { GarageDoorOpenerPlatform } from './platform.js';
import { GarageState } from './garagestate.js';

export class GarageDoorOpenerAccessory {
  private service: Service;

  constructor(
        private readonly platform: GarageDoorOpenerPlatform,
        private readonly accessory: PlatformAccessory,
        private readonly garageState: GarageState,
  ) {
    
    this.platform.log.debug('constructing GarageDoorOpenerAccessory...');
    
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
    // this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.exampleDisplayName);

    // register handlers for the TargetDoorState Characteristic
    const tds = this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState);
    tds
      .onSet(this.setTargetDoorState.bind(this))
      .onGet(this.getTargetDoorState.bind(this));

    // register handlers for the CurrentDoorState Characteristic
    const cds = this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState);
    cds
      .onSet(this.setCurrentDoorState.bind(this))
      .onGet(this.getCurrentDoorState.bind(this));


    garageState.on('current', (currentValue) => {
      if (this.currentDoorStateCharacteristic()?.value === currentValue) {
        return;
      }
      this.currentDoorStateCharacteristic()?.updateValue(currentValue);
    });

    garageState.on('target', (targetValue) => {
      if (this.targetDoorStateCharacteristic()?.value === targetValue) {
        return;
      }
      this.targetDoorStateCharacteristic()?.updateValue(targetValue);
    });

    this.platform.log.debug('initial door states: ', this.garageState.description());
    this.garageState = garageState;
  }

  currentDoorStateCharacteristic(): Characteristic | undefined {
    return this.service.getCharacteristic(this.platform.Characteristic.CurrentDoorState);
  }

  targetDoorStateCharacteristic(): Characteristic | undefined {
    return this.service.getCharacteristic(this.platform.Characteristic.TargetDoorState);
  }

  async handleLogUpdate(value: string) {
    this.platform.log.info('log update: ', value);
  }

  async setTargetDoorState(value: CharacteristicValue) {
    // publish an mqtt message if necessary
    this.garageState.updateTargetState(value as number);
    this.platform.log.debug('Set TargetDoorState ->', this.garageState.description());
  }

  async getTargetDoorState(): Promise<CharacteristicValue> {
    const state = this.garageState.getTargetState();
    this.platform.log.debug('Get TargetDoorState ->', state);
    return state;
  }

  async setCurrentDoorState(value: CharacteristicValue) {
    this.garageState.updateCurrentState(value as number);
    this.platform.log.debug('Set CurrentDoorState ->', this.garageState.description());
  }

  async getCurrentDoorState(): Promise<CharacteristicValue> {
    const state = this.garageState.getCurrentState();
    this.platform.log.debug('Get CurrentDoorState ->', state);
    return state;
  }
}