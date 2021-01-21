import { throws } from 'assert';
import { unwatchFile } from 'fs';
import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicChange,
  CharacteristicEventTypes,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
} from 'homebridge';

import mqtt, { MqttClient, IClientOptions } from 'mqtt';

let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('GarageDoorSwitch', GarageDoorSwitch);
};

class GarageDoorSwitch implements AccessoryPlugin {
    private readonly log: Logging;
    private readonly name: string;

    private targetDoorState: CharacteristicValue | null;
    private currentDoorState: CharacteristicValue | null;

    private readonly doorStateMap = { 
      'open': hap.Characteristic.CurrentDoorState.OPEN, 
      'closed': hap.Characteristic.CurrentDoorState.CLOSED, 
      'opening': hap.Characteristic.CurrentDoorState.OPENING, 
      'closing': hap.Characteristic.CurrentDoorState.CLOSING,
      'error': hap.Characteristic.CurrentDoorState.STOPPED,
      'problem': hap.Characteristic.CurrentDoorState.STOPPED, 
    };

    private mqttClient: MqttClient;

    private setTopic: string;
    private readonly setValue: string = '1';
    private readonly stateTopic: string = 'd/garage/door/get/state';

    // private readonly switchService: Service;
    private readonly garageDoorService: Service;
    private readonly informationService: Service;

    constructor(log: Logging, config: AccessoryConfig, api: API) {
      this.log = log;
      this.name = config.name;

      this.currentDoorState = null;
      this.targetDoorState = null;

      this.setTopic = config['setTopic'] as string ?? 'garage/door/set';
      this.stateTopic = config['stateTopic'] as string ?? 'garage/door/get/state';

      const mqttHost = config['mqttHost'] ?? 'mqtt://localhost:1883';
      const mqttUsername = config['mqttUsername'];
      const mqttPassword = config['mqttPassword'];

      const opts: IClientOptions = { clientId: 'hk-plugin', rejectUnauthorized: false };
      if (mqttUsername && mqttPassword) {
        opts.username = mqttUsername as string;
        opts.password = mqttPassword as string;
      }

      this.mqttClient = mqtt.connect(mqttHost, opts);
      this.configureMQTT();

      this.garageDoorService = new hap.Service.GarageDoorOpener(this.name);
      this.configureService(this.garageDoorService);

      this.informationService = new hap.Service.AccessoryInformation()
        .setCharacteristic(hap.Characteristic.Manufacturer, 'RFxLabs')
        .setCharacteristic(hap.Characteristic.Model, 'GDO1HK');
      
      log.info('GarageDoor accessory finished initializing!');
    }

    configureService(service: Service) {
      service
        .getCharacteristic(hap.Characteristic.TargetDoorState)
        .on(
          CharacteristicEventTypes.CHANGE,
          this.changeTargetDoorState.bind(this),
        );
    }

    changeTargetDoorState(change: CharacteristicChange) {
      this.log.info('changing target door state from ', change.oldValue, ' to: ', change.newValue);
      if (change.newValue !== this.currentDoorState) {
        this.log.debug('publishing set:1');
        this.mqttClient.publish(this.setTopic, '1');
      }
    }

    configureMQTT() {            
      this.mqttClient.on('connect', () => {
        this.log.info('connected to broker');
        this.mqttClient.subscribe(this.stateTopic, (error) => {
          if (!error) {
            this.log.info('subscribed to ', this.stateTopic);
          }
        });
      });
      
      this.mqttClient.on('close', () => {
        this.log.info('disconnected from broker');
      });
      
      this.mqttClient.on('message', (topic: string, payload: Buffer) => {
        this.log.debug('got message on topic ', topic, ', payload: ', payload.toString());
      
        const value = payload.toString('ascii');
      
        if (topic === this.stateTopic) {
          const state = this.doorStateMap[value] as CharacteristicValue;
          if (state !== undefined) {
            this.log.debug('mqtt callback: setting door state to: ', state);
            this.currentDoorState = state;
            this.garageDoorService.updateCharacteristic(hap.Characteristic.CurrentDoorState, state);
            if (state === hap.Characteristic.CurrentDoorState.OPEN || 
                state === hap.Characteristic.CurrentDoorState.CLOSED) {
              this.didCompleteDoorOperation();
            }
          } else {
            this.log.error('state undefined?: ', state, '; states:', this.doorStateMap);
          }
        } else {
          this.log.warn('ignoring topic: ', topic);
        }
      });
    }

    /*
    Called when we receive an open/closed state from the garage door; 
    if our target state is different than the current door state, we
    should push the button to transition again simply;
     */
    didCompleteDoorOperation() {
      if (this.targetDoorState === null || this.currentDoorState === null) {
        return;
      }

      this.log.debug('door did complete transition');
      //compare target state with current and decide if we need to change it ...
      if (this.currentDoorState !== this.targetDoorState) {
        this.log.debug('publishing set:1');
        this.mqttClient.publish(this.setTopic, '1');
      }
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