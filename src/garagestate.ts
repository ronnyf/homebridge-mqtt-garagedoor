import { API, Characteristic } from 'homebridge';
import { EventEmitter } from 'events';

export class GarageState extends EventEmitter {
  private current: number;
  private target: number;
  private readonly Characteristic: typeof Characteristic;
  private readonly emitter: EventEmitter;

  constructor(api: API) {
    super();
    this.Characteristic = api.hap.Characteristic;
    this.emitter = new EventEmitter();
    this.current = -1;
    this.target = -1;
  }

  public updateCurrentState(current: number, emit: boolean = true) {
    if (this.current === current) {
      return; 
    }
    this.current = current;
    if (emit === true) {
      this.emit('current', current);
    }
  }

  public updateTargetState(target: number, emit: boolean = true) {
    if (this.target === target) {
      return;
    }
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

  public getCurrentDescription(): string {
    switch (this.current) {
      case this.Characteristic.CurrentDoorState.OPEN:
        return 'Open';

      case this.Characteristic.CurrentDoorState.CLOSED:
        return 'Closed';

      case this.Characteristic.CurrentDoorState.OPENING:
        return 'Opening';

      case this.Characteristic.CurrentDoorState.CLOSING:
        return 'Closing';
      
      case this.Characteristic.CurrentDoorState.STOPPED:
        return 'Stopped';
    }

    return 'unknown';
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
    return 'current: ' + this.getCurrentDescription() + ', target: ' + this.target;
  }
}