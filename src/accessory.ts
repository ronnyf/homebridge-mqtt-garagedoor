import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicChange,
  CharacteristicEventTypes,
  CharacteristicValue,
  Logging,
  Service,
} from 'homebridge';

import mqtt, { MqttClient, IClientOptions, IClientSubscribeOptions } from 'mqtt';
import { ACCESSORY_NAME } from './settings';

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  api.registerAccessory(ACCESSORY_NAME, GarageDoorSwitch);
};

class GarageDoorSwitch implements AccessoryPlugin {
  private readonly api: API;
  private readonly log: Logging;
  private readonly name: string;

  private readonly doorStateMap = {};
  private readonly targetDoorStates: string[];

  private mqttClient: MqttClient;

  private setTopic: string;
  private stateTopic: string;
  private readonly setValue: string = '1';

  // private readonly switchService: Service;
  private readonly garageDoorService: Service;
  private readonly informationService: Service;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name;
    this.api = api;

    /*
          static readonly OPEN = 0;
          static readonly CLOSED = 1;
          static readonly OPENING = 2;
          static readonly CLOSING = 3;
          static readonly STOPPED = 4;
      */

    this.doorStateMap = {
      'open': api.hap.Characteristic.CurrentDoorState.OPEN,
      'closed': api.hap.Characteristic.CurrentDoorState.CLOSED,
      'opening': api.hap.Characteristic.CurrentDoorState.OPENING,
      'closing': api.hap.Characteristic.CurrentDoorState.CLOSING,
      'error': api.hap.Characteristic.CurrentDoorState.STOPPED,
      'problem': api.hap.Characteristic.CurrentDoorState.STOPPED,
    };

    this.targetDoorStates = ['open', 'close'];

    this.setTopic = config['setTopic'] as string ?? 'garage/door/set';
    this.stateTopic = config['stateTopic'] as string ?? 'garage/door/state';

    const mqttHost = config['mqttHost'] ?? 'mqtt://localhost:1883';
    const mqttUsername = config['mqttUsername'];
    const mqttPassword = config['mqttPassword'];

    // TODO: add to config
    // const mqttOpenMessage = config['mqttOpenMessage'] ?? 'open';
    // const mqttCloseMessage = config['mqttCloseMessage'] ?? 'close';

    const mqttClientID = config['mqttClientID'] as string ?? 'HomeBridge' + api.serverVersion;
    log.info('using client id: ', mqttClientID);

    const opts: IClientOptions = { 
      clientId: mqttClientID, 
      rejectUnauthorized: false, 
      clean: true,
    };

    if (mqttUsername && mqttPassword) {
      opts.username = mqttUsername as string;
      opts.password = mqttPassword as string;
    }

    this.mqttClient = mqtt.connect(mqttHost, opts);
    this.configureMQTT();

    this.garageDoorService = new api.hap.Service.GarageDoorOpener(this.name);
    this.configureService(this.garageDoorService);

    this.informationService = new api.hap.Service.AccessoryInformation()
      .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'RFxLabs')
      .setCharacteristic(this.api.hap.Characteristic.Model, 'GDO1HK');
      
    log.info('GarageDoor accessory finished initializing!');
  }

  configureService(service: Service) {
    service
      .getCharacteristic(this.api.hap.Characteristic.TargetDoorState)
      .on(
        CharacteristicEventTypes.CHANGE,
        this.changeTargetDoorState.bind(this),
      );
  }

  changeTargetDoorState(change: CharacteristicChange) {
    if (change.newValue !== this.currentDoorState()) {
      const signal = this.targetDoorStates[change.newValue as number];
      this.log.debug('updating garage door (target) state: ', signal);
      this.mqttClient.publish(this.setTopic, signal);
    } else {
      this.log.debug('no change required as current door state == target door state');
    }
  }

  targetDoorState(): CharacteristicValue | null {
    return this.garageDoorService.getCharacteristic(this.api.hap.Characteristic.TargetDoorState).value;
  }

  currentDoorState(): CharacteristicValue | null {
    return this.garageDoorService.getCharacteristic(this.api.hap.Characteristic.CurrentDoorState).value;
  }

  updateCurrentDoorState(value: CharacteristicValue) {
    this.garageDoorService.updateCharacteristic(this.api.hap.Characteristic.CurrentDoorState, value);
  }

  configureMQTT() {     
    this.log.debug('configuring mqtt connect callback');
    this.mqttClient.on('connect', (/*packet: IConnectPacket*/) => {

      // this.log.info('connected to broker, packet: ', packet);
      //nothing interesting in the packet here:
      /*
          Packet {
            cmd: 'connack',
            retain: false,
            qos: 0,
            dup: false,
            length: 2,
            topic: null,
            payload: null,
            sessionPresent: false,
            returnCode: 0
          }
        */

      const opts: IClientSubscribeOptions = { qos: 1 };
      this.log.debug('subscribing to: ', this.stateTopic);
      this.mqttClient.subscribe(this.stateTopic, opts, (error) => {
        if (!error) {
          this.log.info('subscribed to ', this.stateTopic);
          this.log.info('current door state ', this.currentDoorState());
          this.log.info('target  door state ', this.targetDoorState());
        }
      }); //subsribe

    }); //onConnect
      
    this.log.debug('configuring mqtt close callback');
    this.mqttClient.on('close', () => {
      this.log.info('disconnected from broker');
    });

    this.log.debug('configuring mqtt message callback');       
    this.mqttClient.on('message', (topic: string, payload: Buffer) => {
      this.log.debug('got message on topic ', topic, ', payload: ', payload.toString());
      
      if (topic === this.stateTopic) {
        const value = payload.toString('ascii');
        const state = this.doorStateMap[value] as CharacteristicValue;

        this.log.debug('got state: ', state, ' for value "', value, '" from mqtt');
        this.updateCurrentDoorState(state);
      } else {
        this.log.warn('ignoring topic: ', topic);
      }
    });
  }

  /*
    * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
    * Typical this only ever happens at the pairing process.
    */
  identify(): void {
    this.log('Identify!');
  }
    
  /*
    * This method is called directly after creation of this instance.
    * It should return all services which should be added to the accessory.
    */
  getServices(): Service[] {
    return [
      this.informationService,
      this.garageDoorService,
    ];
  }
}