export class LogFilter {
  static sanitize(data: any): any {
    if (typeof data === 'string') {
      return data.replace(/(password|token|secret|key)=[^& ]+/gi, '$1=***');
    }
    return data;
  }
}
