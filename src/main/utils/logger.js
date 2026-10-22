// Logger del proceso principal: los mensajes debug solo se muestran con --dev
const isDev = process.argv.includes('--dev');

module.exports = {
  debug: (...args) => { if (isDev) console.log(...args); },
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
