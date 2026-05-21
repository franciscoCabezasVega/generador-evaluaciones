// Stub de server-only para entornos Jest/Node que no activan la condición
// react-server. El módulo real lanza un error fuera del bundler de Next.js.
// En tests solo necesitamos que el import no rompa la carga del módulo.
module.exports = {};
