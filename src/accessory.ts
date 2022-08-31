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

  private readonly currentDoorStateMap = {};
  private readonly currentDoorStates: string[] = [];
  private readonly targetDoorStates: string[] = [];

  private mqttClient: MqttClient;

  private setTopic: string;
  private stateTopic: string;
  private didInitialize: boolean;

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


    this.currentDoorStates = [
      'open',
      'closed',
      'opening',
      'closing',
      'stopped',
    ];

    this.currentDoorStateMap = {
      'open': api.hap.Characteristic.CurrentDoorState.OPEN,
      'closed': api.hap.Characteristic.CurrentDoorState.CLOSED,
      'opening': api.hap.Characteristic.CurrentDoorState.OPENING,
      'closing': api.hap.Characteristic.CurrentDoorState.CLOSING,
      'stopped': api.hap.Characteristic.CurrentDoorState.STOPPED,
      'error': api.hap.Characteristic.CurrentDoorState.STOPPED,
    };

    this.setTopic = config['setTopic'] as string ?? 'garage/door/set';
    this.stateTopic = config['stateTopic'] as string ?? 'garage/door/state';

    const mqttHost = config['mqttHost'] ?? 'mqtt://localhost:1883';
    const mqttUsername = config['mqttUsername'];
    const mqttPassword = config['mqttPassword'];
    // TODO: add to config
    const mqttOpenMessage = config['mqttOpenMessage'] ?? 'open';
    const mqttCloseMessage = config['mqttCloseMessage'] ?? 'close';

    this.targetDoorStates = [mqttOpenMessage, mqttCloseMessage];

    const mqttClientID = config['mqttClientID'] as string ?? 'HomeBridge' + api.serverVersion;
    log.debug('using client id: ', mqttClientID);

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

    this.didInitialize = false;

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
    this.printDoorStates();

    const num = change.newValue as number;
    const targetIndex = Math.abs(num);
    this.sendTargetDoorState(targetIndex);
  }

  sendTargetDoorState(index: number) {
    const signal = this.targetDoorStates[index];
    this.log.debug('updating garage door (target) state: ', index, ', desc: ', signal, 'topic: ', this.setTopic);
    this.mqttClient.publish(this.setTopic, signal);
  }

  targetDoorState(): CharacteristicValue | null {
    return this.garageDoorService.getCharacteristic(this.api.hap.Characteristic.TargetDoorState).value;
  }

  targetDoorStateDescription(): string | null {
    const current = this.targetDoorState();
    if (current !== null) {
      const index = current as number;
      if (index < this.targetDoorStates.length) {
        const value = this.targetDoorStates[current as number];
        return value;
      }
    }
    return null;
  }

  currentDoorState(): CharacteristicValue | null {
    return this.garageDoorService.getCharacteristic(this.api.hap.Characteristic.CurrentDoorState).value;
  }

  currentDoorStateDescription(): string | null {
    const current = this.currentDoorState();
    if (current === null) {
      return 'NULL';
    }

    if (current === undefined) {
      return 'UNDEFINED';
    }

    const index = current as number;
    if (index < this.currentDoorStates.length) {
      const value = this.currentDoorStates[index];
      return value;
    }
    return null;
  }

  printDoorStates() {
    this.log.info('current door state ', this.currentDoorState(), ': ', this.currentDoorStateDescription());
    this.log.info('target  door state ', this.targetDoorState(), ': ', this.targetDoorStateDescription());
  }

  updateCurrentDoorState(value: CharacteristicValue) {
    if (this.didInitialize === false) {
      this.log.info('initializing door states to ', value);
      this.garageDoorService.setCharacteristic(this.api.hap.Characteristic.CurrentDoorState, value);
      this.garageDoorService.setCharacteristic(this.api.hap.Characteristic.TargetDoorState, value);
      this.didInitialize = true;
    } else {
      this.garageDoorService.updateCharacteristic(this.api.hap.Characteristic.CurrentDoorState, value);
      this.log('updating current door state: ', this.currentDoorState(), ': ', this.currentDoorStateDescription());
    }
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
          this.printDoorStates();
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
        const state = this.currentDoorStateMap[value] as CharacteristicValue;
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