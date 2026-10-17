import { net } from 'electron';

export class NetworkService {
  static isOnline(): boolean { return net.isOnline(); }
}
