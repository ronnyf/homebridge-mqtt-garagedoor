import { API, Characteristic } from 'homebridge';
import { EventEmitter } from 'events';

export class GarageState extends EventEmitter {
  private current: number;
  private target: number;
  private readonly Characteristic: typeof Characteristic;
  private readonly emitter: EventEmitter;

  constructor(current: number, api: API) {
    super();
    this.Characteristic = api.hap.Characteristic;
    this.emitter = new EventEmitter();
    this.current = current;
    this.target = this.targetDoorStateForCurrent(current);
  }

  public updateCurrentState(current: number) { 
    this.current = current;
    this.emit('current', current);
  }

  public updateTargetState(target: number, emit: boolean = true) {
    this.target = target;
    if (emit === true) {
      this.emit('target', target);
    }
  }

  public getCurrentState(): number {
    return this.current;
  }

  public getTargetState(): number { 
    return this.target;
  }

  public targetDoorStateForCurrent(value: number): number {
    switch (value) {
      case this.Characteristic.CurrentDoorState.OPEN:
        return this.Characteristic.TargetDoorState.OPEN;
  
      case this.Characteristic.CurrentDoorState.CLOSED:
        return this.Characteristic.TargetDoorState.CLOSED;
  
      case this.Characteristic.CurrentDoorState.OPENING:
        return this.Characteristic.TargetDoorState.OPEN;
  
      case this.Characteristic.CurrentDoorState.CLOSING:
        return this.Characteristic.TargetDoorState.CLOSED;
  
      default:
        return -1;
    }
  }

  public description(): string {
    return 'current: ' + this.current + ', target: ' + this.target;
  }
}