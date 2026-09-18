const debugOn = Boolean(process.env.DEBUG);
const ts = () => new Date().toISOString().slice(11, 23);

export const log = {
  info: (...a) => console.log(ts(), ...a),
  warn: (...a) => console.warn(ts(), 'WARN', ...a),
  error: (...a) => console.error(ts(), 'ERROR', ...a),
  debug: (...a) => debugOn && console.log(ts(), 'debug', ...a),
};
